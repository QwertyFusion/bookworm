import { db } from "@/db";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

const f = createUploadthing();

export const ourFileRouter = {
  pdfUploader: f({ pdf: { maxFileSize: "8MB" } })
    .middleware(async () => {
        const { getUser } = getKindeServerSession();
        const user = await getUser();

        if (!user || !user.id) throw new Error("Unauthorized");

        return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const createdFile = await db.file.create({
        data: {
          key: file.key,
          name: file.name,
          userId: metadata.userId,
          url: file.url, // use file.url or use `https://utfs.io/f/${file.key}`
          uploadStatus: "PROCESSING"
        }
      });

      try {
        // Fetch the PDF file content
        const response = await fetch(file.url);
        const blob = await response.blob();

        // Load the PDF using PDFLoader
        const loader = new PDFLoader(blob);
        const pageLevelDocs = await loader.load();
        const pdfTextContent = pageLevelDocs.map(doc => doc.pageContent).join("\n"); // Concatenate all pages' content

        // Store the extracted text content in the database as a message
        await db.message.create({
          data: {
            text: pdfTextContent, // Store the extracted content
            isUserMessage: false,
            fileId: createdFile.id,
            userId: metadata.userId,
          },
        });

        // Update the file status after successful processing
        await db.file.update({
          data: {
            uploadStatus: "SUCCESS"
          },
          where: {
            id: createdFile.id
          }
        });

      } catch (err) {
        console.error("Error processing PDF:", err);

        // If something fails, update the file status to "FAILED"
        await db.file.update({
          data: {
            uploadStatus: "FAILED"
          },
          where: {
            id: createdFile.id
          }
        });

        throw new Error("Error processing PDF");
      }
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
