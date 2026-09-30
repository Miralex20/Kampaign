import Link from "next/link";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorType = params.error || "Default";

  const errorMessages: Record<string, { title: string; desc: string }> = {
    Configuration: {
      title: "Server Configuration Issue",
      desc: "There was a problem with the mail relay or authentication server configuration. If testing locally, ensure Mailpit is running on port 1025 or use the 1-click developer login.",
    },
    AccessDenied: {
      title: "Access Denied",
      desc: "You do not have permission to access this workspace.",
    },
    Verification: {
      title: "Link Expired or Already Used",
      desc: "This sign-in magic link has either expired or was already clicked. Please request a new link.",
    },
    Default: {
      title: "Authentication Error",
      desc: "An unexpected error occurred during authentication. Please try again.",
    },
  };

  const message = errorMessages[errorType] || errorMessages.Default!;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 shadow-subtle text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-4 text-xl">
          ⚠️
        </div>

        <h1 className="text-xl font-bold text-slate-900 mb-2">{message.title}</h1>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">{message.desc}</p>

        <div className="flex flex-col gap-3">
          <Link
            href="/auth/signin"
            className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-subtle inline-block"
          >
            ← Back to Sign In
          </Link>

          {process.env.NODE_ENV !== "production" && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <span className="text-[11px] uppercase font-semibold text-slate-400 block mb-2">
                Local Development Shortcut
              </span>
              <Link
                href="/api/auth/dev-login"
                className="w-full py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium transition-colors inline-block"
              >
                1-Click Dev Login (Admin Persona) →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
