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
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f8fafc",
        color: "#0f172a",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        padding: "32px 24px",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {/* Navigation / Header */}
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #e2e8f0",
            paddingBottom: "24px",
            marginBottom: "32px",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#10b981",
                }}
              />
              <Link
                href="/"
                style={{
                  textDecoration: "none",
                  margin: 0,
                  fontSize: "22px",
                  fontWeight: "700",
                  letterSpacing: "-0.3px",
                  color: "#0f172a",
                }}
              >
                Kampaign
              </Link>
              <span
                style={{
                  fontSize: "11px",
                  background: "#f1f5f9",
                  color: "#475569",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  fontWeight: "600",
                }}
              >
                Platform v1.0
              </span>
            </div>
            <p style={{ margin: "4px 0 0 20px", color: "#64748b", fontSize: "14px" }}>
              Personalized direct messaging, tokenized web landing pages, and verified delivery
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <Link
              href="/api/health"
              target="_blank"
              style={{
                fontSize: "13px",
                fontWeight: "500",
                padding: "7px 12px",
                borderRadius: "6px",
                background: "#ffffff",
                color: "#334155",
                textDecoration: "none",
                border: "1px solid #cbd5e1",
              }}
            >
              Health Check
            </Link>

            {session?.user ? (
              <>
                <Link
                  href="/team"
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    padding: "7px 12px",
                    borderRadius: "6px",
                    background: "#ffffff",
                    color: "#334155",
                    textDecoration: "none",
                    border: "1px solid #cbd5e1",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>👥</span> Team
                </Link>

                {session.user.role === "admin" && (
                  <Link
                    href="/admin"
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      padding: "7px 12px",
                      borderRadius: "6px",
                      background: "#4f46e5",
                      color: "#ffffff",
                      textDecoration: "none",
                      border: "1px solid #4338ca",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span>⚙️</span> Admin Console
                  </Link>
                )}

                <span
                  style={{
                    fontSize: "13px",
                    padding: "7px 12px",
                    borderRadius: "6px",
                    background: "#ecfdf5",
                    color: "#047857",
                    border: "1px solid #a7f3d0",
                    fontWeight: "500",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>✓</span>
                  <span>{session.user.email}</span>
                  <span
                    style={{
                      fontSize: "10px",
                      background: "#047857",
                      color: "#ffffff",
                      padding: "1px 6px",
                      borderRadius: "4px",
                      textTransform: "uppercase",
                      fontWeight: "700",
                    }}
                  >
                    {session.user.role}
                  </span>
                </span>

                <a
                  href="/api/auth/dev-login?action=logout"
                  style={{
                    fontSize: "13px",
                    fontWeight: "500",
                    padding: "7px 12px",
                    borderRadius: "6px",
                    background: "#ffffff",
                    color: "#e11d48",
                    textDecoration: "none",
                    border: "1px solid #fecdd3",
                  }}
                >
                  Sign Out
                </a>
              </>
            ) : (
              <Link
                href="/auth/signin"
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  background: "#4f46e5",
                  color: "#ffffff",
                  textDecoration: "none",
                  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>Sign In with Magic Link</span>
                <span>→</span>
              </Link>
            )}
          </div>
        </header>

        {/* Authenticated Workspace View */}
        {session?.user ? (
          <CampaignStudio
            initialCampaigns={campaignList}
            recipientCount={recipientCount}
            orgName={org?.name ?? "Acme Global Corp"}
            userEmail={session.user.email}
            initialSendingDomain={org?.sending_domain ?? null}
            initialDomainVerified={Boolean(org?.domain_verified_at)}
          />
        ) : (
          /* Public Product Home Screen for Visitors / Guests */
          <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
            {/* Hero Section */}
            <div
              style={{
                background: "#ffffff",
                borderRadius: "16px",
                padding: "48px 36px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  padding: "4px 12px",
                  borderRadius: "999px",
                  background: "#e0e7ff",
                  color: "#4338ca",
                  fontSize: "12px",
                  fontWeight: "700",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  marginBottom: "16px",
                }}
              >
                Enterprise Confidentiality & Messaging
              </div>
              <h2
                style={{
                  fontSize: "36px",
                  fontWeight: "800",
                  color: "#0f172a",
                  lineHeight: "1.2",
                  marginBottom: "16px",
                  letterSpacing: "-0.5px",
                }}
              >
                Next-Generation Personalized Campaign Messaging
              </h2>
              <p
                style={{
                  fontSize: "17px",
                  color: "#64748b",
                  maxWidth: "760px",
                  margin: "0 auto 32px auto",
                  lineHeight: "1.6",
                }}
              >
                Deliver 1-to-1 encrypted tokenized landing pages, verified transactional emails, and
                bot-screened engagement analytics with mathematical tenant isolation.
              </p>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "14px",
                  flexWrap: "wrap",
                }}
              >
                <Link
                  href="/auth/signin"
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    padding: "12px 24px",
                    borderRadius: "8px",
                    background: "#4f46e5",
                    color: "#ffffff",
                    textDecoration: "none",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)",
                  }}
                >
                  Sign In to Workspace →
                </Link>
                <Link
                  href="/team"
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    padding: "12px 20px",
                    borderRadius: "8px",
                    background: "#ffffff",
                    color: "#334155",
                    textDecoration: "none",
                    border: "1px solid #cbd5e1",
                  }}
                >
                  Explore Team Management
                </Link>
              </div>
            </div>

            {/* 3 Supported Delivery Modes */}
            <div>
              <div style={{ marginBottom: "20px" }}>
                <h3
                  style={{
                    fontSize: "20px",
                    fontWeight: "700",
                    color: "#0f172a",
                    margin: "0 0 6px 0",
                  }}
                >
                  Three Engineered Dispatch Modes
                </h3>
                <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
                  Select the delivery architecture tailored to your infrastructure requirements:
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: "20px",
                }}
              >
                {/* Mode A */}
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    padding: "24px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "12px",
                    }}
                  >
                    <span style={{ fontSize: "20px" }}>📬</span>
                    <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#0f172a" }}>
                      Mode A: Managed Direct Send
                    </h4>
                  </div>
                  <p style={{ fontSize: "14px", color: "#64748b", lineHeight: "1.5", margin: "0 0 16px 0" }}>
                    Platform renders individual emails, injects 128-bit single-use landing URLs, and
                    dispatches via the self-hosted listmonk transactional engine with bounce and
                    complaint webhook monitoring.
                  </p>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "600",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background: "#f0fdf4",
                      color: "#166534",
                      border: "1px solid #bbf7d0",
                    }}
                  >
                    Zero Raw Tokens in DB
                  </span>
                </div>

                {/* Mode B */}
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    padding: "24px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "12px",
                    }}
                  >
                    <span style={{ fontSize: "20px" }}>📑</span>
                    <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#0f172a" }}>
                      Mode B: Per-Recipient CSV Link Export
                    </h4>
                  </div>
                  <p style={{ fontSize: "14px", color: "#64748b", lineHeight: "1.5", margin: "0 0 16px 0" }}>
                    Upload your recipient cohort, generate confidential unique landing links, and export
                    a CSV payload ready to plug directly into HubSpot, Mailchimp, or your CRM.
                  </p>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "600",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background: "#eff6ff",
                      color: "#1e40af",
                      border: "1px solid #bfdbfe",
                    }}
                  >
                    CRM Compatible
                  </span>
                </div>

                {/* Mode C */}
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "12px",
                    padding: "24px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "12px",
                    }}
                  >
                    <span style={{ fontSize: "20px" }}>🌐</span>
                    <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#0f172a" }}>
                      Mode C: Universal Campaign Token
                    </h4>
                  </div>
                  <p style={{ fontSize: "14px", color: "#64748b", lineHeight: "1.5", margin: "0 0 16px 0" }}>
                    A single shareable, tokenized URL protected by bot screening. Supports optional SMS
                    OTP verification and captures verified two-way client responses.
                  </p>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "600",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background: "#faf5ff",
                      color: "#6b21a8",
                      border: "1px solid #e9d5ff",
                    }}
                  >
                    Public Broadcast
                  </span>
                </div>
              </div>
            </div>

            {/* Architecture Highlights & Local Testing Guide */}
            <div
              style={{
                background: "#0f172a",
                color: "#ffffff",
                borderRadius: "16px",
                padding: "32px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "24px",
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-block",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    background: "#334155",
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#94a3b8",
                    marginBottom: "8px",
                  }}
                >
                  LOCAL TESTBED READY
                </div>
                <h3 style={{ margin: "0 0 8px 0", fontSize: "20px", fontWeight: "700" }}>
                  Testing User Flows & Personas
                </h3>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: "14px", maxWidth: "600px" }}>
                  Use the floating <strong>⚡ Dev Persona Switcher</strong> in the bottom right corner
                  to switch between Superadmin, Org Owner, Editor, and Viewer personas at any time, or
                  test real magic link dispatch with Mailpit.
                </p>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <a
                  href="/api/auth/dev-login?email=admin@campaign.local&role=admin&redirect=/"
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    padding: "10px 18px",
                    borderRadius: "8px",
                    background: "#4f46e5",
                    color: "#ffffff",
                    textDecoration: "none",
                  }}
                >
                  Enter as Superadmin →
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
