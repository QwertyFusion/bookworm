// ✅ Remove "use client" to make this a Server Component
import BillingForm from "@/components/BillingForm"
import { getUserSubscriptionPlan } from "@/lib/stripe"

export const dynamic = "force-dynamic"; // ✅ Ensures runtime execution (no static rendering)

const Page = async () => {
    const subscriptionPlan = await getUserSubscriptionPlan(); // ✅ Runs only on the server

    return <BillingForm subscriptionPlan={subscriptionPlan} /> 
}

export default Page;
