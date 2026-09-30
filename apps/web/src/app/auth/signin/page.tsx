import { Suspense } from "react";
import { auth, signIn } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "./SignInForm";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  async function handleGoogleSignIn() {
    "use server";
    await signIn("google", {
      redirectTo: "/",
    });
  }

  async function handleMagicLinkSignIn(formData: FormData) {
    "use server";
    const email = formData.get("email") as string;
    await signIn("nodemailer", {
      email,
      redirectTo: "/",
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-3 text-decoration-none">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              KM
            </div>
            <span className="text-2xl font-bold tracking-tight text-slate-900">Kampaign</span>
          </Link>
          <p className="text-sm text-slate-500">
            Sign in to access your organization workspace and campaigns
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900 mb-1">Welcome back</h1>
          <p className="text-sm text-slate-500 mb-6">
            Choose your preferred sign-in method to continue.
          </p>

          <Suspense fallback={<div className="py-6 text-center text-sm text-slate-400">Loading sign in options...</div>}>
            <SignInForm
              onGoogleSignIn={handleGoogleSignIn}
              onMagicLinkSignIn={handleMagicLinkSignIn}
            />
          </Suspense>
        </div>

        {/* Back Link */}
        <div className="text-center mt-6">
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-800 transition">
            ← Back to Kampaign Home
          </Link>
        </div>
      </div>
    </div>
  );
}
