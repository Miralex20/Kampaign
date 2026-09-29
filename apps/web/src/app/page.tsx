import { auth } from "@/auth";
import Link from "next/link";
import { getDb, campaigns, organizations, users, recipients } from "@campaign/db";
import { eq, desc, count } from "drizzle-orm";
import { CampaignStudio } from "./CampaignStudio";

export default async function HomePage() {
  const session = await auth();
  const db = getDb();

  let org: (typeof organizations.$inferSelect) | null = null;
  let campaignList: Array<{
    id: string;
    name: string;
    campaign_mode: string;
    status: string;
    created_at: string;
  }> = [];
  let recipientCount = 0;

  // Load org and campaigns based on session or default admin
  let activeEmail = session?.user?.email ?? "admin@campaign.local";

  const [userRow] = await db
    .select({
      user: users,
      org: organizations,
    })
    .from(users)
    .innerJoin(organizations, eq(users.org_id, organizations.id))
    .where(eq(users.email, activeEmail))
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

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#090d16",
        color: "#f3f4f6",
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
            borderBottom: "1px solid #1f2937",
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
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  background: "#10b981",
                  boxShadow: "0 0 12px #10b981",
                }}
              />
              <h1
                style={{
                  margin: 0,
                  fontSize: "24px",
                  fontWeight: "800",
                  letterSpacing: "-0.5px",
                  background: "linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Campaign Messaging Platform
              </h1>
            </div>
            <p style={{ margin: "4px 0 0 22px", color: "#9ca3af", fontSize: "14px" }}>
              1-on-1 Personalized Email Engine · Private Interactive Landing Pages · Zero-Bot Security
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Link
              href="/api/health"
              target="_blank"
              style={{
                fontSize: "13px",
                padding: "6px 12px",
                borderRadius: "6px",
                background: "#1f2937",
                color: "#e5e7eb",
                textDecoration: "none",
                border: "1px solid #374151",
              }}
            >
              Health Check API
            </Link>
            <Link
              href="/api/metrics"
              target="_blank"
              style={{
                fontSize: "13px",
                padding: "6px 12px",
                borderRadius: "6px",
                background: "#1f2937",
                color: "#e5e7eb",
                textDecoration: "none",
                border: "1px solid #374151",
              }}
            >
              Prometheus Metrics
            </Link>

            {session?.user ? (
              <span
                style={{
                  fontSize: "13px",
                  padding: "6px 14px",
                  borderRadius: "6px",
                  background: "#064e3b",
                  color: "#6ee7b7",
                  border: "1px solid #047857",
                  fontWeight: "500",
                }}
              >
                ✓ Logged in as {session.user.email}
              </span>
            ) : (
              <a
                href="/api/auth/dev-login"
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  padding: "8px 16px",
                  borderRadius: "6px",
                  background: "#2563eb",
                  color: "#ffffff",
                  textDecoration: "none",
                  boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
                }}
              >
                1-Click Admin Session →
              </a>
            )}
          </div>
        </header>

        {/* Studio and Interactive Form */}
        <CampaignStudio
          initialCampaigns={campaignList}
          recipientCount={recipientCount}
          orgName={org?.name ?? "Acme Global Corp"}
          userEmail={session?.user?.email ?? null}
          initialSendingDomain={org?.sending_domain ?? null}
          initialDomainVerified={Boolean(org?.domain_verified_at)}
        />
      </div>
    </div>
  );
}
