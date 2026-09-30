import Link from "next/link";

export default function VerifyPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center text-2xl mx-auto mb-4">
            ✉️
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Check your email</h1>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            We sent a secure, single-use magic sign-in link to your inbox. Click the link to complete
            authentication — it expires in 10 minutes.
          </p>

          {process.env.NODE_ENV !== "production" && (
            <div className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-left text-xs text-slate-600">
              <span className="font-semibold block mb-1">Local Testing Notice:</span>
              Open Mailpit at{" "}
              <a
                href="http://localhost:8025"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 font-semibold underline"
              >
                http://localhost:8025
              </a>{" "}
              to click the newly dispatched magic link.
            </div>
          )}

          <Link
            href="/auth/signin"
            className="inline-block text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition"
          >
            ← Try a different email
          </Link>
        </div>
      </div>
    </div>
  );
}
