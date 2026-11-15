import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupForm } from "@/components/AuthForms";


export const metadata: Metadata = { title: "Create your account" };

export default async function Page() {

  return (
    <>
      <p className="eyebrow">Account</p>
      <h1 className="title mt-2 text-[26px]">Create your account</h1>
      <p className="mt-1.5 mb-6 text-sm text-ink-2">Free. Your projects stay private unless you add members.</p>

      <Suspense>
        <SignupForm />
      </Suspense>
    </>
  );
}
