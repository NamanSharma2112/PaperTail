import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetForm } from "@/components/AuthForms";


export const metadata: Metadata = { title: "Choose a new password" };

export default async function Page() {

  return (
    <>
      <p className="eyebrow">Account</p>
      <h1 className="title mt-2 text-[26px]">Choose a new password</h1>
      <p className="mt-1.5 mb-6 text-sm text-ink-2">Signing in again will be required on your other devices.</p>

      <Suspense>
        <ResetForm />
      </Suspense>
    </>
  );
}
