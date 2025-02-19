"use client"

export const dynamic = "force-dynamic";

import { useRouter, useSearchParams } from 'next/navigation';
import { trpc } from '../_trpc/client';
import { Loader2 } from 'lucide-react';

const Page = () => {
    console.log("auth callback")
  const router = useRouter();
  const searchParams = useSearchParams();
  const origin = searchParams.get('origin');

  // Use the query hook correctly
  const { data, error } = trpc.authCallback.useQuery(undefined, {
    retry: true,
    retryDelay: 500, //checking every 0.5s
  });

  // Handle success and error states
  if (data && data.success) {
    // User is synced to db
    router.push(origin ? `/${origin}` : '/dashboard');
  }

  if (error) {
    if (error.data?.code === 'UNAUTHORIZED') {
      router.push('/sign-in');
    }
  }

  return (
    <div className='w-full mt-24 flex justify-center'>
      <div className='flex flex-col items-center gap-2'>
        <Loader2 className='h-8 w-8 animate-spin text-zinc-800' />
        <h3 className='font-semibold text-xl'>
          Setting up your account...
        </h3>
        <p>You will be redirected automatically.</p>
      </div>
    </div>
  );
}

export default Page;