"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

interface InviteData {
  id: string;
  email: string;
  role: string;
  permissions: Record<string, boolean>;
  orgName: string;
  inviterEmail: string;
  valid: boolean;
}

function InviteAcceptForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("No invitation token provided in URL");
      setLoading(false);
      return;
    }

    async function verify() {
      try {
        const res = await fetch(`/api/auth/invite/verify?token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (res.ok && json.data) {
          setInvite(json.data);
        } else {
          setError(json.error || "Invalid or expired invitation");
        }
      } catch {
        setError("Network error verifying invitation");
      } finally {
        setLoading(false);
      }
    }

    verify();
  }, [token]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    try {
      setAccepting(true);
      const res = await fetch("/api/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name }),
      });

      const json = await res.json();
      if (res.ok) {
        // Successfully accepted & session cookie established!
        router.push("/");
      } else {
        setError(json.error || "Failed to accept invitation");
        setAccepting(false);
      }
    } catch {
      setError("Network error accepting invitation");
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="card text-center p-8">
        <div className="text-slate-500 text-sm">Verifying invitation link...</div>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="card text-center p-8 space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-xl font-bold">
          ✕
        </div>
        <h2 className="text-lg font-bold text-slate-900">Invitation Expired or Invalid</h2>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          {error || "This invitation link could not be found."}
        </p>
        <div className="pt-2">
          <Link
            href="/auth/signin"
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition inline-block"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-8 space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
            Workspace Invitation
          </span>
        </div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Join {invite.orgName}</h1>
        <p className="text-xs text-slate-500 mt-1">
          {invite.inviterEmail} has invited you to collaborate as a{" "}
          <strong className="text-slate-700 capitalize">{invite.role}</strong>.
        </p>
      </div>

      {/* Permissions overview */}
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
        <div className="font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
          Assigned Permissions
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
            Role: <strong>{invite.role}</strong>
          </span>
          {invite.permissions?.can_launch_campaigns && (
            <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium">
              Launch Live Sends ✓
            </span>
          )}
          {invite.permissions?.can_export_data && (
            <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-800 font-medium">
              Export CSV ✓
            </span>
          )}
          {invite.permissions?.can_manage_audience && (
            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
              Audience Manager ✓
            </span>
          )}
        </div>
      </div>

      <form onSubmit={handleAccept} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Your Email
          </label>
          <input
            type="text"
            disabled
            value={invite.email}
            className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed font-mono text-xs"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Your Full Name (Optional)
          </label>
          <input
            type="text"
            placeholder="Alex Morgan"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-600 transition"
          />
        </div>

        <button
          type="submit"
          disabled={accepting}
          className="w-full py-2.5 px-4 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50 shadow-sm"
        >
          {accepting ? "Provisioning Account..." : "Accept Invitation & Open Workspace →"}
        </button>
      </form>
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Suspense
          fallback={
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
              Loading invitation...
            </div>
          }
        >
          <InviteAcceptForm />
        </Suspense>
      </div>
    </div>
  );
}
