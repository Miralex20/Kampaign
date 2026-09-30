"use client";

import { useState, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signInWithCredentialsAction, type AuthActionResult } from "../actions";

interface SignInFormProps {
  onGoogleSignIn: () => Promise<void>;
  onMagicLinkSignIn: (formData: FormData) => Promise<void>;
}

export function SignInForm({ onGoogleSignIn, onMagicLinkSignIn }: SignInFormProps) {
  const searchParams = useSearchParams();
  const resetSuccess = searchParams.get("reset") === "success";
  const registeredSuccess = searchParams.get("registered") === "true";
  const authError = searchParams.get("error");

  const [mode, setMode] = useState<"password" | "magic-link">("password");

  const [credState, credAction, isCredPending] = useActionState<AuthActionResult | null, FormData>(
    signInWithCredentialsAction,
    null
  );

  return (
    <div className="space-y-5">
      {/* Success Banners */}
      {resetSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-start gap-2">
          <span className="text-emerald-600 font-bold">✓</span>
          <span>Your password has been reset successfully. Please sign in below.</span>
        </div>
      )}

      {registeredSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-start gap-2">
          <span className="text-emerald-600 font-bold">✓</span>
          <span>Your workspace account is ready. Please sign in with your password.</span>
        </div>
      )}

      {authError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700 flex items-start gap-2">
          <span className="text-red-500 font-bold">✕</span>
          <span>Authentication failed. Please verify your credentials or try again.</span>
        </div>
      )}

      {credState?.error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700 flex items-start gap-2">
          <span className="text-red-500 font-bold">✕</span>
          <span>{credState.error}</span>
        </div>
      )}

      {/* Google 1-Click OAuth */}
      <form action={onGoogleSignIn}>
        <button
          type="submit"
          className="w-full py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-medium text-sm transition shadow-xs flex items-center justify-center gap-3 cursor-pointer"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>
      </form>

      {/* Divider */}
      <div className="relative flex items-center justify-center my-4">
        <div className="border-t border-slate-200 w-full" />
        <span className="bg-white px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider absolute">
          {mode === "password" ? "or continue with password" : "or continue with magic link"}
        </span>
      </div>

      {mode === "password" ? (
        /* Email + Password Form */
        <form action={credAction} className="space-y-4">
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
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Password
              </label>
              <Link
                href="/auth/forgot-password"
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm transition"
            />
          </div>

          <button
            type="submit"
            disabled={isCredPending}
            className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm transition shadow-sm flex items-center justify-center gap-2 mt-2"
          >
            {isCredPending ? (
              <span>Signing in...</span>
            ) : (
              <>
                <span>Sign In</span>
                <span>→</span>
              </>
            )}
          </button>
        </form>
      ) : (
        /* Magic Link Form */
        <form action={onMagicLinkSignIn} className="space-y-4">
          <div>
            <label htmlFor="magic-email" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Work Email Address
            </label>
            <input
              id="magic-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm transition"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition shadow-sm flex items-center justify-center gap-2 mt-2"
          >
            <span>Send Magic Link</span>
            <span>→</span>
          </button>
        </form>
      )}

      {/* Switch between Password and Magic Link */}
      <div className="pt-2 text-center">
        {mode === "password" ? (
          <button
            type="button"
            onClick={() => setMode("magic-link")}
            className="text-xs text-slate-500 hover:text-slate-800 transition underline underline-offset-2"
          >
            Prefer passwordless? Sign in with Magic Link
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMode("password")}
            className="text-xs text-slate-500 hover:text-slate-800 transition underline underline-offset-2"
          >
            Back to Password login
          </button>
        )}
      </div>

      {/* Sign Up Link */}
      <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
        Don't have an account?{" "}
        <Link href="/auth/signup" className="font-semibold text-indigo-600 hover:text-indigo-700">
          Create workspace
        </Link>
      </div>
    </div>
  );
}
