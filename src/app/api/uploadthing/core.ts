import { db } from "@/db";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { getUserSubscriptionPlan } from "@/lib/stripe";
import { PLANS } from "@/config/stripe";

const f = createUploadthing();

const middleware = async () => {
    const { getUser  } = getKindeServerSession();
    const user = await getUser ();

    if (!user || !user.id) throw new Error("Unauthorized");

    const subscriptionPlan = await getUserSubscriptionPlan();

    return { subscriptionPlan, userId: user.id };
};

const onUploadComplete = async ({
  metadata,
  file,
}: {
  metadata: Awaited<ReturnType<typeof middleware>>
  file: {
    key: string
    name: string
    url: string
  }
}) => {
    const createdFile = await db.file.create({
        data: {
            key: file.key,
            name: file.name,
            userId: metadata.userId,
            url: file.url,
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
        const pagesAmt = pageLevelDocs.length;

        const { subscriptionPlan } = metadata;
        const { isSubscribed } = subscriptionPlan;

        const isProExceeded = pagesAmt > PLANS.find((plan) => plan.name === 'Pro')!.pagesPerPdf;
        const isFreeExceeded = pagesAmt > PLANS.find((plan) => plan.name === 'Free')!.pagesPerPdf;

        if ((isSubscribed && isProExceeded) || (!isSubscribed && isFreeExceeded)) {
            await db.file.update({
                data: {
                    uploadStatus: 'FAILED',
                },
                where: {
                    id: createdFile.id,
                },
            });
            return; // Exit if the upload fails due to subscription limits
        }

        const pdfTextContent = pageLevelDocs.map(doc => doc.pageContent).join("\n");

        // Store the extracted text content in the database as a message
        await db.message.create({
            data: {
                text: pdfTextContent,
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
};

export const ourFileRouter = {
    freePlanUploader: f({ pdf: { maxFileSize: "8MB" } })
        .middleware(middleware)
        .onUploadComplete(onUploadComplete),
    proPlanUploader: f({ pdf: { maxFileSize: "32MB" } })
        .middleware(middleware)
        .onUploadComplete(onUploadComplete),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;