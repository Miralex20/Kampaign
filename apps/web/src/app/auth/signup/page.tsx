"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type AuthActionResult } from "../actions";

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    signUpAction,
    null
  );

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
            Create your account and start orchestrating multi-channel campaigns
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900 mb-1">Create workspace</h1>
          <p className="text-sm text-slate-500 mb-6">
            Sign up as an organization owner to configure your team workspace.
          </p>

          {state?.error && (
            <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700 leading-relaxed flex items-start gap-2">
              <span className="text-red-500 font-bold">✕</span>
              <span>{state.error}</span>
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Jane Doe"
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm transition"
              />
            </div>

            <div>
              <label htmlFor="orgName" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Organization / Company Name
              </label>
              <input
                id="orgName"
                name="orgName"
                type="text"
                placeholder="Acme Corp"
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm transition"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Work Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm transition"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
                minLength={8}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm transition"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Minimum 8 characters. We recommend combining letters, numbers, and symbols.
              </span>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm transition shadow-sm flex items-center justify-center gap-2 mt-2"
            >
              {isPending ? (
                <span>Creating workspace...</span>
              ) : (
                <>
                  <span>Create Workspace</span>
                  <span>→</span>
                </>
              )}
            </button>
          </form>

          {/* Helper Notice */}
          <div className="mt-6 pt-5 border-t border-slate-100 text-center text-xs text-slate-500">
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
