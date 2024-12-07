import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { privateProcedure, publicProcedure, router } from './trpc';
import { TRPCError } from '@trpc/server';
import { db } from '@/db';
import { z } from 'zod'

export const appRouter = router({
  authCallback: publicProcedure.query(async () => {
    const {getUser} = getKindeServerSession()
    const user = await getUser()
    console.log("Coming here")
    if(!user.id || !user.email) throw new TRPCError({code: "UNAUTHORIZED"})

    //check if user is in database
    const dbUser = await db.user.findFirst({
      where: {
        id: user.id
      }
    })

    if(!dbUser){
      await db.user.create({
        data: {
          id: user.id, //matches the kinde id
          email: user.email //matches the kinde email
        }
      })
    }

    return {success: true}
  }),
  getUserFiles: privateProcedure.query(async ({ctx}) => {
    const {userId} = ctx

    return await db.file.findMany({
      where: {userId}
    })
  }),
  getFile: privateProcedure.input(z.object({key: z.string()})).mutation(async ({ctx, input}) => {
    const {userId} = ctx

    const file = await db.file.findFirst({
      where: {
        key: input.key,
        userId
      }
    })

    if(!file) throw new TRPCError({code: "NOT_FOUND"})

    return file
  }),
  getFileUploadStatus: privateProcedure.input(z.object({ fileId: z.string() })).query(async ({ input, ctx }) => {
    const file = await db.file.findFirst({
      where: {
        id: input.fileId,
        userId: ctx.userId,
      },
    });

    if (!file) return { status: 'PENDING' as const }

    return { status: file.uploadStatus }
  }),
  deleteFile: privateProcedure.input(z.object({ id: z.string() })).mutation(async ({ctx, input}) => {
    const {userId} = ctx

    const file = await db.file.findFirst({
      where: {
        id: input.id,
        userId,
      }
    })
    if(!file) throw new TRPCError({ code: 'NOT_FOUND' })

    await db.file.delete({
      where: {
        id: input.id,
        userId
      }
    })

    return file
  })
});

export type AppRouter = typeof appRouter;