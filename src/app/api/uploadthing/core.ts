import { db } from "@/db";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { OpenAIEmbeddings } from "@langchain/openai";
import {PineconeStore} from "@langchain/pinecone"
import { pinecone } from "@/lib/pinecone";

const f = createUploadthing();

const auth = (req: Request) => ({ id: "fakeId" });

export const ourFileRouter = {
  pdfUploader: f({ pdf: { maxFileSize: "8MB" } })
    .middleware(async ({ req }) => {

        const { getUser } = getKindeServerSession()
        const user = await getUser()

        if(!user || !user.id) throw new Error("Unauthorized")
            
        return {userId: user.id};
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
      })

      try {
        const response = await fetch(file.url)
        const blob = await response.blob()

        const loader = new PDFLoader(blob)
        const pageLevelDocs = await loader.load()
        const pagesAmt = pageLevelDocs.length

        const pineconeIndex = pinecone.Index("bookworm")  
        const embeddings = new OpenAIEmbeddings({
          openAIApiKey: process.env.OPENAI_API_KEY
        })

        await PineconeStore.fromDocuments(
          pageLevelDocs, embeddings, {
            pineconeIndex,
            namespace: createdFile.id
          })

        await db.file.update({
          data: {
            uploadStatus: "SUCCESS"
          }, 
          where :{
            id: createdFile.id
          }
        })
      } catch (err) {
        await db.file.update({
          data: {
            uploadStatus: "FAILED"
          }, 
          where :{
            id: createdFile.id
          }
        })
      }
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
