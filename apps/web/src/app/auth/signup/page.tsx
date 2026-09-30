"use client";

import { useState, useActionState, useEffect } from "react";
import Link from "next/link";
import { signUpAction, type AuthActionResult } from "../actions";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [sendingDomain, setSendingDomain] = useState("");
  const [domainManuallyEdited, setDomainManuallyEdited] = useState(false);

  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    signUpAction,
    null
  );

  // Auto-suggest sending domain when email is typed (unless user manually customized it)
  useEffect(() => {
    if (!domainManuallyEdited && email.includes("@")) {
      const parts = email.split("@");
      if (parts[1] && parts[1].includes(".")) {
        setSendingDomain(parts[1].toLowerCase());
      }
    }
  }, [email, domainManuallyEdited]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-lg">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-3 text-decoration-none">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              KM
            </div>
            <span className="text-2xl font-bold tracking-tight text-slate-900">Kampaign</span>
          </Link>
          <p className="text-sm text-slate-500">
            Create your executive workspace and configure your verified sending identity
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <div className="border-b border-slate-100 pb-5 mb-6">
            <h1 className="text-xl font-bold text-slate-900 mb-1">Create workspace & owner account</h1>
            <p className="text-xs text-slate-500">
              Provide your organization details to provision your dedicated sending workspace.
            </p>
          </div>

          {state?.error && (
            <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700 leading-relaxed flex items-start gap-2">
              <span className="text-red-500 font-bold">✕</span>
              <span>{state.error}</span>
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Sarah Jenkins"
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm transition"
                />
              </div>

              <div>
                <label htmlFor="orgName" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Organization / Company <span className="text-red-500">*</span>
                </label>
                <input
                  id="orgName"
                  name="orgName"
                  type="text"
                  placeholder="Acme Global"
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm transition"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Work Email Address <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sarah@acme.com"
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm transition"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Used for your primary account login and workspace notifications.
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="sendingDomain" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Sending Domain <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                  DNS Verified
                </span>
              </div>
              <div className="relative">
                <input
                  id="sendingDomain"
                  name="sendingDomain"
                  type="text"
                  value={sendingDomain}
                  onChange={(e) => {
                    setDomainManuallyEdited(true);
                    setSendingDomain(e.target.value);
                  }}
                  placeholder="acme.com or mail.acme.com"
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm font-mono transition"
                />
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                The domain used for email deliverability and SPF/DMARC authentication.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="password" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm transition"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  required
                  minLength={8}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm transition"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {isPending ? (
                  <span>Provisioning workspace...</span>
                ) : (
                  <>
                    <span>Create Workspace & Start Free</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Security & Anti-Spam Notice */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-500">
            <span className="text-sm">🛡️</span>
            <p className="leading-relaxed m-0">
              Each new workspace starts with a 500 daily send trial tier and automatic SPF/DMARC verification guides.
            </p>
          </div>

          {/* Sign In Link */}
          <div className="mt-4 pt-3 text-center text-xs text-slate-500">
            Already have an account?{" "}
            <Link href="/auth/signin" className="font-semibold text-indigo-600 hover:text-indigo-700">
              Sign in
            </Link>
          </div>
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
