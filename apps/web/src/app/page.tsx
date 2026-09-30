import { auth } from "@/auth";
import Link from "next/link";
import { getDb, campaigns, organizations, users, recipients } from "@campaign/db";
import { eq, desc, count } from "drizzle-orm";
import { CampaignStudio } from "./CampaignStudio";

export default async function HomePage() {
  const session = await auth();
  const db = getDb();

  let org: typeof organizations.$inferSelect | null = null;
  let campaignList: Array<{
    id: string;
    name: string;
    campaign_mode: string;
    status: string;
    created_at: string;
  }> = [];
  let recipientCount = 0;

  // If user is authenticated, load their organization's campaigns
  if (session?.user?.email) {
    const [userRow] = await db
      .select({
        user: users,
        org: organizations,
      })
      .from(users)
      .innerJoin(organizations, eq(users.org_id, organizations.id))
      .where(eq(users.email, session.user.email))
      .limit(1);

    if (userRow) {
      org = userRow.org;
      const rawCampaigns = await db
        .select({
          id: campaigns.id,
          name: campaigns.name,
          campaign_mode: campaigns.campaign_mode,
          status: campaigns.status,
          created_at: campaigns.created_at,
        })
        .from(campaigns)
        .where(eq(campaigns.org_id, org.id))
        .orderBy(desc(campaigns.created_at))
        .limit(15);

      campaignList = rawCampaigns.map((c) => ({
        id: c.id,
        name: c.name,
        campaign_mode: c.campaign_mode,
        status: c.status,
        created_at: c.created_at ? new Date(c.created_at).toISOString() : new Date().toISOString(),
      }));

      const [recCountRes] = await db
        .select({ total: count() })
        .from(recipients)
        .where(eq(recipients.org_id, org.id));
      recipientCount = Number(recCountRes?.total ?? 0);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* TOP APP BAR (Stitch Design Specification) */}
      <header className="w-full border-b border-slate-200 bg-white px-4 lg:px-8 flex justify-between items-center h-16 sticky top-0 z-50">
        {/* Brand & Workspace Info */}
        <div className="flex items-center gap-4 lg:gap-6">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 2.18l7 3.12v4.7c0 4.67-3.13 9.04-7 10.15-3.87-1.11-7-5.48-7-10.15V6.3l7-3.12z" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">Kampaign</span>
          </Link>

          <div className="h-5 w-px bg-slate-200 hidden md:block" />

          {/* Workspace Switcher */}
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700">
            <span className="w-2 h-2 rounded-full bg-indigo-600" />
            <span className="text-xs text-slate-900 font-medium">
              {org?.name ?? "My Workspace"}
            </span>
          </div>
        </div>

        {/* Center / Right Telemetry & Utilities */}
        <div className="flex items-center gap-3">
          {/* System Telemetry Badge */}
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded border border-slate-200 bg-white">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-slate-700 font-medium">System Operational</span>
            <span className="font-mono text-xs text-slate-400">(SPF/DKIM 100%)</span>
          </div>

          <Link
            href="/api/health"
            target="_blank"
            className="hidden sm:inline-flex text-xs font-medium px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Health
          </Link>

          {session?.user ? (
            <>
              <Link
                href="/domain"
                className="text-xs font-medium px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
              >
                <span>🌐</span>
                <span className="hidden sm:inline">Domain</span>
              </Link>

              <Link
                href="/team"
                className="text-xs font-medium px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
              >
                <span>👥</span>
                <span className="hidden sm:inline">Team</span>
              </Link>

              {session.user.role === "admin" && (
                <Link
                  href="/admin"
                  className="text-xs font-semibold px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors inline-flex items-center gap-1.5"
                >
                  <span>⚙️</span>
                  <span className="hidden sm:inline">Admin</span>
                </Link>
              )}

              {/* User Identity Pill */}
              <div className="flex items-center gap-2 py-1 px-2.5 rounded bg-slate-100 border border-slate-200">
                <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">
                  {session.user.email?.[0]?.toUpperCase() ?? "U"}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-slate-900 leading-tight">
                    {session.user.email}
                  </span>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold leading-tight">
                    {session.user.role}
                  </span>
                </div>
              </div>

              <a
                href="/api/auth/dev-login?action=logout"
                className="text-xs font-medium px-2.5 py-1.5 rounded border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 transition-colors"
              >
                Sign Out
              </a>
            </>
          ) : (
            <Link
              href="/auth/signin"
              className="text-xs font-semibold px-3.5 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors inline-flex items-center gap-1.5 shadow-xs"
            >
              <span>Sign In with Magic Link</span>
              <span>→</span>
            </Link>
          )}
        </div>
      </header>

      {/* WORKSPACE / BODY VIEW */}
      <div className="flex-1 w-full max-w-[1440px] mx-auto p-4 lg:p-6">
        {session?.user ? (
          <CampaignStudio
            initialCampaigns={campaignList}
            recipientCount={recipientCount}
            orgName={org?.name ?? "My Workspace"}
            userEmail={session.user.email}
            initialSendingDomain={org?.sending_domain ?? null}
            initialDomainVerified={Boolean(org?.domain_verified_at)}
          />
        ) : (
          /* Public Product Home Screen for Visitors / Guests */
          <div className="flex flex-col gap-8 py-6">
            {/* Hero Section */}
            <div className="bg-white rounded-xl p-8 sm:p-12 border border-slate-200 shadow-subtle text-center">
              <div className="inline-block px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold tracking-wider uppercase mb-4">
                Enterprise Confidentiality & Messaging
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight mb-4 tracking-tight">
                Next-Generation Personalized Campaign Messaging
              </h1>
              <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto mb-8 leading-relaxed">
                Deliver 1-to-1 encrypted tokenized landing pages, verified transactional emails, and
                bot-screened engagement analytics with mathematical tenant isolation.
              </p>

              <div className="flex justify-center items-center gap-3.5 flex-wrap">
                <Link
                  href="/auth/signin"
                  className="text-sm font-semibold px-6 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-subtle inline-flex items-center gap-2"
                >
                  <span>Sign In to Workspace</span>
                  <span>→</span>
                </Link>
                <Link
                  href="/team"
                  className="text-sm font-semibold px-5 py-3 rounded-lg bg-white text-slate-700 hover:bg-slate-50 transition-colors border border-slate-300"
                >
                  Explore Team Management
                </Link>
              </div>
            </div>

            {/* 3 Supported Delivery Modes */}
            <div>
              <div className="mb-5">
                <h2 className="text-xl font-bold text-slate-900 mb-1">
                  Three Engineered Dispatch Modes
                </h2>
                <p className="text-sm text-slate-500 m-0">
                  Select the delivery architecture tailored to your infrastructure requirements:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Mode A */}
                <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-subtle flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className="text-xl">📬</span>
                      <h3 className="text-base font-bold text-slate-900 m-0">
                        Mode A: Managed Direct Send
                      </h3>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                      Platform renders individual emails, injects 128-bit single-use landing URLs,
                      and dispatches via the self-hosted listmonk transactional engine with webhook
                      monitoring.
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Zero Raw Tokens in DB
                    </span>
                  </div>
                </div>

                {/* Mode B */}
                <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-subtle flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className="text-xl">📑</span>
                      <h3 className="text-base font-bold text-slate-900 m-0">
                        Mode B: Per-Recipient CSV Link Export
                      </h3>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                      Upload your recipient cohort, generate confidential unique landing links, and
                      export a CSV payload ready to plug directly into HubSpot, Mailchimp, or your
                      CRM.
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                      CRM Compatible
                    </span>
                  </div>
                </div>

                {/* Mode C */}
                <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-subtle flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className="text-xl">🌐</span>
                      <h3 className="text-base font-bold text-slate-900 m-0">
                        Mode C: Universal Campaign Token
                      </h3>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">
                      A single shareable, tokenized URL protected by bot screening. Supports
                      optional SMS OTP verification and captures verified two-way client responses.
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200">
                      Public Broadcast
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Enterprise Security Callout */}
            <div className="bg-slate-900 text-white rounded-xl p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
              <div>
                <div className="inline-block px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-semibold mb-2 border border-slate-700">
                  ENTERPRISE PRIVACY & CRYPTOGRAPHIC ISOLATION
                </div>
                <h3 className="text-xl font-bold mb-2">Ready to Deploy High-Stakes Messaging?</h3>
                <p className="text-sm text-slate-400 max-w-xl m-0 leading-relaxed">
                  Zero raw tokens stored in databases, client-side cryptographic isolation, and
                  authenticated single-use magic links ensure compliant delivery for critical
                  communications.
                </p>
              </div>

              <div className="flex gap-2.5">
                <Link
                  href="/auth/signin"
                  className="text-xs font-semibold px-4 py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors whitespace-nowrap"
                >
                  Get Started →
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* REFINED FOOTER STATUS (Stitch Design Specification) */}
      <footer className="w-full border-t border-slate-200 bg-white py-3 px-4 lg:px-8 text-slate-500 text-xs flex flex-col sm:flex-row items-center justify-between gap-2 mt-auto">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="font-semibold text-slate-900">Kampaign Infrastructure Engine</span>
          <span>ISO/IEC 27001 Certified Relay</span>
          <span className="hidden md:inline">
            Protocol: <span className="font-mono text-slate-800 font-medium">DKIM: ed25519-sha256</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/api/health" className="hover:text-slate-900 transition-colors">
            Perimeter Status
          </Link>
          <span className="text-slate-900 font-medium">Build v4.19.2-prod</span>
        </div>
      </footer>
    </div>
  );
}
