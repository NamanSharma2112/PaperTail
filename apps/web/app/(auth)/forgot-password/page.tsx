import type { Metadata } from "next";
import { Suspense } from "react";
import { ForgotForm } from "@/components/AuthForms";


export const metadata: Metadata = { title: "Reset your password" };

export default async function Page() {

  return (
    <>
      <p className="eyebrow">Account</p>
      <h1 className="title mt-2 text-[26px]">Reset your password</h1>
      <p className="mt-1.5 mb-6 text-sm text-ink-2">Enter the email you signed up with.</p>

      <Suspense>
        <ForgotForm />
      </Suspense>
    </>
  );
}
