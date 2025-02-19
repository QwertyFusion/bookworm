import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { redirect } from 'next/navigation'
import { db } from '@/db'
import Dashboard from "@/components/Dashboard";
import { getUserSubscriptionPlan } from "@/lib/stripe";

const Page = async () => {
    console.log("1")
    const { getUser } = getKindeServerSession(); // Await the session
    const user = await getUser(); // Await the user

    console.log("2")
    // Check if the user exists and has an ID
    if (!user || !user.id) {
        // Use NextResponse.redirect for redirection
        console.log("3")
        redirect('/auth-callback?origin=dashboard'); 
        return;
    }

    const dbUser = await db.user.findFirst({
        where: {
            id: user.id
        }
    })
    
    // if(!dbUser) {
    //     redirect('/auth-callback?origin=dashboard');
    //     return; 
    // }

    const subscriptionPlan = await getUserSubscriptionPlan()

    return <Dashboard subscriptionPlan={subscriptionPlan} />
}
    
export default Page