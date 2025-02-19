import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { privateProcedure, publicProcedure, router } from './trpc';
import { TRPCError } from '@trpc/server';
import { db } from '@/db';
import { z } from 'zod';
import { INFINITE_QUERY_LIMIT } from '@/config/infinite-query';
import { absoluteUrl } from '@/lib/utils';
import { getUserSubscriptionPlan, stripe } from '@/lib/stripe';
import { PLANS } from '@/config/stripe';

export const appRouter = router({
  /**
   * Auth Callback Procedure
   * - Ensures user is authenticated via Kinde
   * - Syncs user to the database if not present
   */
  authCallback: publicProcedure.query(async () => {
    try {
      console.log("🔄 TRPC: authCallback triggered");

      // Get user from Kinde auth session
      const { getUser } = getKindeServerSession();
      const user = await getUser();

      // Ensure user is authenticated
      if (!user?.id || !user?.email) {
        console.error("❌ TRPC Error: Unauthorized user");
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User is not authenticated." });
      }

      console.log(`✅ TRPC: User authenticated - ID: ${user.id}, Email: ${user.email}`);

      // Check if user already exists in database
      const dbUser = await db.user.findUnique({
        where: { id: user.id },
      });

      if (!dbUser) {
        console.log("🆕 TRPC: Creating new user in DB...");
        await db.user.create({
          data: { id: user.id, email: user.email },
        });
      } else {
        console.log("✅ TRPC: User already exists in DB");
      }

      return { success: true };
    } catch (error) {
      console.error("🔥 TRPC authCallback Error:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Auth callback failed." });
    }
  }),

  /**
   * Fetches all user files
   */
  getUserFiles: privateProcedure.query(async ({ ctx }) => {
    const { userId } = ctx;
    return await db.file.findMany({ where: { userId } });
  }),

  /**
   * Fetches a single file by key
   */
  getFile: privateProcedure.input(z.object({ key: z.string() })).mutation(async ({ ctx, input }) => {
    const { userId } = ctx;

    const file = await db.file.findFirst({
      where: { key: input.key, userId },
    });

    if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "File not found." });

    return file;
  }),

  /**
   * Fetches messages related to a file
   */
  getFileMessages: privateProcedure
    .input(z.object({ limit: z.number().min(1).max(100).nullish(), cursor: z.string().nullish(), fileId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { userId } = ctx;
      const { fileId, cursor } = input;
      const limit = input.limit ?? INFINITE_QUERY_LIMIT;

      // Ensure file belongs to user
      const file = await db.file.findFirst({ where: { id: fileId, userId } });
      if (!file) throw new TRPCError({ code: 'NOT_FOUND', message: "File not found." });

      // Fetch messages
      const messages = await db.message.findMany({
        take: limit + 1,
        where: { fileId },
        orderBy: { createdAt: 'desc' },
        cursor: cursor ? { id: cursor } : undefined,
        select: { id: true, isUserMessage: true, createdAt: true, text: true },
      });

      let nextCursor = undefined;
      if (messages.length > limit) {
        const nextItem = messages.pop();
        nextCursor = nextItem?.id;
      }

      return { messages, nextCursor };
    }),

  /**
   * Checks file upload status
   */
  getFileUploadStatus: privateProcedure.input(z.object({ fileId: z.string() })).query(async ({ input, ctx }) => {
    const file = await db.file.findFirst({
      where: { id: input.fileId, userId: ctx.userId },
    });

    return { status: file ? file.uploadStatus : 'PENDING' };
  }),

  /**
   * Deletes a file
   */
  deleteFile: privateProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const { userId } = ctx;

    const file = await db.file.findFirst({
      where: { id: input.id, userId },
    });

    if (!file) throw new TRPCError({ code: 'NOT_FOUND', message: "File not found." });

    await db.file.delete({ where: { id: input.id } });

    return file;
  }),

  /**
   * Creates a Stripe billing session
   */
  createStripeSession: privateProcedure.mutation(async ({ ctx }) => {
    const { userId } = ctx;

    const billingUrl = absoluteUrl('/dashboard/billing');

    if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: "User not authenticated." });

    const dbUser = await db.user.findFirst({ where: { id: userId } });

    if (!dbUser) throw new TRPCError({ code: 'UNAUTHORIZED', message: "User not found." });

    const subscriptionPlan = await getUserSubscriptionPlan();

    if (subscriptionPlan.isSubscribed && dbUser.stripeCustomerId) {
      const stripeSession = await stripe.billingPortal.sessions.create({
        customer: dbUser.stripeCustomerId,
        return_url: billingUrl,
      });

      return { url: stripeSession.url };
    }

    const stripeSession = await stripe.checkout.sessions.create({
      success_url: billingUrl,
      cancel_url: billingUrl,
      payment_method_types: ['card', 'paypal'],
      mode: 'subscription',
      billing_address_collection: 'auto',
      line_items: [
        {
          price: PLANS.find(plan => plan.name === 'Pro')?.price.priceIds.test,
          quantity: 1,
        },
      ],
      metadata: { userId },
    });

    return { url: stripeSession.url };
  }),
});

export type AppRouter = typeof appRouter;
