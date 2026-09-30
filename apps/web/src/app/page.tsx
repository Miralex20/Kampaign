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
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: "#10b981",
                }}
              />
              <h1
                style={{
                  margin: 0,
                  fontSize: "22px",
                  fontWeight: "700",
                  letterSpacing: "-0.3px",
                  color: "#0f172a",
                }}
              >
                Campaign Messaging Platform
              </h1>
            </div>
            <p style={{ margin: "4px 0 0 20px", color: "#64748b", fontSize: "14px" }}>
              Personalized direct messaging, tokenized web landing pages, and verified email
              delivery
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
              Health Check API
            </Link>
            <Link
              href="/api/metrics"
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
              Prometheus Metrics
            </Link>

            {session?.user ? (
              <span
                style={{
                  fontSize: "13px",
                  padding: "7px 12px",
                  borderRadius: "6px",
                  background: "#ecfdf5",
                  color: "#047857",
                  border: "1px solid #a7f3d0",
                  fontWeight: "500",
                }}
              >
                ✓ {session.user.email}
              </span>
            ) : process.env["NODE_ENV"] === "production" ? (
              <Link
                href="/auth/signin"
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  padding: "7px 14px",
                  borderRadius: "6px",
                  background: "#4f46e5",
                  color: "#ffffff",
                  textDecoration: "none",
                }}
              >
                Sign In →
              </Link>
            ) : (
              <a
                href="/api/auth/dev-login"
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  padding: "7px 14px",
                  borderRadius: "6px",
                  background: "#4f46e5",
                  color: "#ffffff",
                  textDecoration: "none",
                }}
              >
                1-Click Dev Session →
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
