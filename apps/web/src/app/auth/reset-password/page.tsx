"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPasswordAction, type AuthActionResult } from "../actions";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    resetPasswordAction,
    null
  );

  if (!token || !email) {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed flex items-start gap-2.5">
          <span className="text-amber-600 font-bold text-sm">⚠</span>
          <div>
            <p className="font-semibold text-amber-950 m-0 mb-1">Invalid Reset Link</p>
            <p className="m-0 text-amber-800">
              The password reset link appears incomplete or corrupted. Please request a new link.
            </p>
          </div>
        </div>

        <Link
          href="/auth/forgot-password"
          className="inline-flex items-center justify-center w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition"
        >
          Request New Link
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="email" value={email} />

      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
        Resetting password for: <span className="font-semibold text-slate-900">{email}</span>
      </div>

      {state?.error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700 leading-relaxed flex items-start gap-2">
          <span className="text-red-500 font-bold">✕</span>
          <span>{state.error}</span>
        </div>
      )}

      <div>
        <label htmlFor="password" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
          New Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          minLength={8}
          autoFocus
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm transition"
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
          Confirm New Password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Re-enter your new password"
          required
          minLength={8}
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm transition"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm transition shadow-sm flex items-center justify-center gap-2 mt-2"
      >
        {isPending ? (
          <span>Updating password...</span>
        ) : (
          <>
            <span>Save New Password</span>
            <span>→</span>
          </>
        )}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
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
            Account Security & Recovery
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900 mb-1">Set new password</h1>
          <p className="text-sm text-slate-500 mb-6">
            Choose a strong password to protect your Kampaign workspace.
          </p>

          <Suspense fallback={<div className="py-6 text-center text-sm text-slate-400">Loading reset session...</div>}>
            <ResetPasswordForm />
          </Suspense>

          {/* Helper Notice */}
          <div className="mt-6 pt-5 border-t border-slate-100 text-center text-xs text-slate-500">
            Remembered your password?{" "}
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
