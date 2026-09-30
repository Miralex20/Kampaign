import { signIn } from "@/auth";
import Link from "next/link";

export default function SignInPage() {
  async function handleSignIn(formData: FormData) {
    "use server";
    await signIn("nodemailer", formData);
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
            Enter your business email. We'll send you a passwordless single-use magic link.
          </p>

          <form action={handleSignIn} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Business Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@company.com"
                required
                autoFocus
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm transition"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition shadow-sm flex items-center justify-center gap-2"
            >
              <span>Send Magic Link</span>
              <span>→</span>
            </button>
          </form>

          {/* Dev Helper */}
          {process.env.NODE_ENV !== "production" && (
            <div className="mt-6 pt-6 border-t border-slate-100">
              <div className="text-xs text-slate-500 mb-2 font-medium">
                ⚡ Development Environment:
              </div>
              <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                Magic link emails sent locally are trapped in Mailpit at{" "}
                <a
                  href="http://localhost:8025"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 font-semibold underline"
                >
                  localhost:8025
                </a>
              </div>
            </div>
          )}
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
