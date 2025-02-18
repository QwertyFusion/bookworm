import { db } from "@/db";
import { SendMessageValidator } from "@/lib/validators/SendMessageValidator";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini AI *outside* the handler for efficiency
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();

    const { getUser } = getKindeServerSession();
    const user = await getUser();

    const { id: userId } = user;
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const { fileId, message } = SendMessageValidator.parse(body);

    const file = await db.file.findFirst({
      where: {
        id: fileId,
        userId,
      },
    });

    if (!file) return new Response("Not found", { status: 404 });

    // Save the user's message to the database
    await db.message.create({
      data: {
        text: message,
        isUserMessage: true,
        userId,
        fileId,
      },
    });

    // Retrieve the PDF content stored from the previous processing (if available)
    const previousPdfMessage = await db.message.findFirst({
      where: {
        fileId,
        isUserMessage: false, // Get the non-user message which stores PDF content
      },
    });

    if (!previousPdfMessage) {
      return new Response("No PDF content found", { status: 404 });
    }

    // Fetch previous messages to maintain conversation context
    const prevMessages = await db.message.findMany({
      where: { fileId },
      orderBy: { createdAt: "asc" },
      take: 6, // Limit to 6 previous messages
    });

    const formattedPrevMessages = prevMessages.map((msg) => ({
      role: msg.isUserMessage ? ("user" as const) : ("assistant" as const),
      content: msg.text,
    }));

    const chatInput = `Use the following context (or previous conversation if needed) to answer the user's question in markdown format. 
If you don't know the answer, just say that you don't know, don't try to make up an answer. Remember that the context that has been given to you is from a PDF that got parsed.

----------------

PREVIOUS PDF CONTENT:
${previousPdfMessage.text}

----------------

PREVIOUS CONVERSATION:
${formattedPrevMessages
        .map((message) => (message.role === "user" ? `User: ${message.content}\n` : `Assistant: ${message.content}\n`))
        .join("")}

----------------

USER INPUT: ${message}`;

    console.log("Starting Gemini API call...");

    const response = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: chatInput }] }],
    });

    console.log("Gemini API call successful!");

    let completionText = "";
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response.stream) {
          completionText += chunk.text();
          controller.enqueue(chunk.text());
        }
        controller.close();
      },
    });

    for await (const chunk of response.stream) {
      completionText += chunk.text();
    }

    console.log(completionText);

    // Save the response from Gemini to the database as an assistant message
    await db.message.create({
      data: {
        text: completionText,
        isUserMessage: false,
        fileId,
        userId,
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });

  } catch (error: any) { // Type the error as 'any' or 'Error' if you know more
    console.error("Gemini API Error:", error);

    if (error instanceof Error) { // Type guard to check if it's an Error object
      console.error("Gemini API Error Message:", error.message);
      console.error("Gemini API Error Stack:", error.stack);
    }

    if (typeof error === 'object' && error !== null && 'response' in error) { // Check if 'response' exists
      const errorWithResponse = error as { response: any }; // Type assertion
      console.error("Gemini API Response:", errorWithResponse.response);

      if (typeof errorWithResponse.response === 'object' && errorWithResponse.response !== null && 'data' in errorWithResponse.response) {
        console.error("Gemini API Response Data:", errorWithResponse.response.data);
      }
      if (typeof errorWithResponse.response === 'object' && errorWithResponse.response !== null && 'status' in errorWithResponse.response) {
        console.error("Gemini API Response Status:", errorWithResponse.response.status);
      }
      if (typeof errorWithResponse.response === 'object' && errorWithResponse.response !== null && 'headers' in errorWithResponse.response) {
        console.error("Gemini API Response Headers:", errorWithResponse.response.headers);
      }
    }

    return new Response("Error communicating with Gemini API", { status: 500 });
  }
};
