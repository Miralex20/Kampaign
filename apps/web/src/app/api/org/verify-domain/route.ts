/**
 * /api/org/verify-domain
 *
 * GET: Fetches current domain verification status and runs real-time DNS queries.
 * POST: Updates sending domain, executes live DNS checks (SPF, DMARC, DKIM), and marks verified.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveTxt, resolveMx } from "node:dns/promises";
import { getDb, organizations } from "@campaign/db";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";

const VerifyDomainSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(253)
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])+$/,
      "Invalid domain name",
    ),
});

interface DnsCheckResult {
  spf: {
    passed: boolean;
    expected: string;
    actual: string | null;
    host: string;
    type: string;
    details: string;
  };
  dmarc: {
    passed: boolean;
    expected: string;
    actual: string | null;
    host: string;
    type: string;
    details: string;
  };
  dkim: {
    passed: boolean;
    expected: string;
    actual: string | null;
    host: string;
    type: string;
    details: string;
  };
  mx: {
    passed: boolean;
    records: string[];
    host: string;
    details: string;
  };
}

async function performRealtimeDnsChecks(domain: string): Promise<DnsCheckResult> {
  let spfPassed = false;
  let spfActual: string | null = null;
  let dmarcPassed = false;
  let dmarcActual: string | null = null;
  let dkimPassed = false;
  let dkimActual: string | null = null;
  const mxRecordsList: string[] = [];

  // 1. Check SPF on apex domain
  try {
    const txtRecords = await resolveTxt(domain);
    for (const recordChunks of txtRecords) {
      const full = recordChunks.join("");
      if (full.startsWith("v=spf1")) {
        spfPassed = true;
        spfActual = full;
        break;
      }
    }
  } catch {
    spfPassed = false;
  }

  // 2. Check DMARC at _dmarc.<domain>
  try {
    const dmarcRecords = await resolveTxt(`_dmarc.${domain}`);
    for (const recordChunks of dmarcRecords) {
      const full = recordChunks.join("");
      if (full.startsWith("v=DMARC1")) {
        dmarcPassed = true;
        dmarcActual = full;
        break;
      }
    }
  } catch {
    dmarcPassed = false;
  }

  // 3. Check DKIM at k1._domainkey.<domain> (optional / recommended)
  try {
    const dkimRecords = await resolveTxt(`k1._domainkey.${domain}`);
    for (const recordChunks of dkimRecords) {
      const full = recordChunks.join("");
      if (full.includes("v=DKIM1") || full.includes("p=")) {
        dkimPassed = true;
        dkimActual = full;
        break;
      }
    }
  } catch {
    dkimPassed = false;
  }

  // 4. Check MX records
  try {
    const mxList = await resolveMx(domain);
    for (const entry of mxList) {
      mxRecordsList.push(`${entry.exchange} (priority ${entry.priority})`);
    }
  } catch {
    // MX lookup failure
  }

  // Dev / local testing bypass if explicitly enabled in environment
  if (
    process.env["NODE_ENV"] !== "production" &&
    process.env["TEST_ALLOW_DOMAIN_VERIFY"] === "true"
  ) {
    if (!spfPassed) {
      spfPassed = true;
      spfActual = `v=spf1 include:_spf.${domain} ~all (dev mock pass)`;
    }
    if (!dmarcPassed) {
      dmarcPassed = true;
      dmarcActual = `v=DMARC1; p=none; sp=none; (dev mock pass)`;
    }
    if (!dkimPassed) {
      dkimPassed = true;
      dkimActual = `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ... (dev mock pass)`;
    }
  }

  return {
    spf: {
      passed: spfPassed,
      expected: `v=spf1 include:_spf.${domain} ~all`,
      actual: spfActual,
      host: "@",
      type: "TXT",
      details: "Authorizes designated mail servers to dispatch email on behalf of your domain.",
    },
    dmarc: {
      passed: dmarcPassed,
      expected: "v=DMARC1; p=none; sp=none;",
      actual: dmarcActual,
      host: `_dmarc.${domain}`,
      type: "TXT",
      details: "Instructs receiving mailboxes on how to handle unauthenticated email attempts.",
    },
    dkim: {
      passed: dkimPassed,
      expected: "v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY",
      actual: dkimActual,
      host: `k1._domainkey.${domain}`,
      type: "TXT",
      details: "Cryptographic signature verifying that email content was not tampered with in transit.",
    },
    mx: {
      passed: mxRecordsList.length > 0,
      records: mxRecordsList,
      host: domain,
      details: "Identifies incoming mail servers responsible for accepting return-path bounces.",
    },
  };
}

export async function GET(): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch (res) {
    return res as NextResponse;
  }
  const { orgId } = session;

  const db = getDb();
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      sending_domain: organizations.sending_domain,
      domain_verified_at: organizations.domain_verified_at,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const domain = org.sending_domain ?? "campaign.local";
  const checks = await performRealtimeDnsChecks(domain);
  const isVerified = Boolean(org.domain_verified_at);

  return NextResponse.json({
    data: {
      domain: org.sending_domain,
      is_verified: isVerified,
      domain_verified_at: org.domain_verified_at,
      checks,
      checked_at: new Date().toISOString(),
      guidance: {
        what_is_verified: isVerified
          ? "Your domain has active SPF and DMARC records detected in public DNS. All emails sent will carry your authenticated domain signature."
          : "Your domain is pending DNS configuration. Add the required TXT records with your DNS provider (e.g. Cloudflare, Route 53, GoDaddy) and click Check DNS Records Now.",
        propagation_info: "DNS records typically propagate within 2 to 15 minutes, but can take up to 24 hours depending on your DNS TTL.",
      },
    },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch (res) {
    return res as NextResponse;
  }
  const { orgId } = session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = VerifyDomainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { domain } = parsed.data;
  const checks = await performRealtimeDnsChecks(domain);
  const verified = checks.spf.passed && checks.dmarc.passed;

  const db = getDb();

  if (verified) {
    const now = new Date();
    await db
      .update(organizations)
      .set({
        domain_verified_at: now,
        sending_domain: domain,
      })
      .where(eq(organizations.id, orgId));

    return NextResponse.json({
      data: {
        domain,
        verified: true,
        domain_verified_at: now,
        checks,
        message: "Domain verified successfully with active SPF & DMARC records!",
      },
    });
  }

  // Save the domain even if not yet verified so the user doesn't lose it
  await db
    .update(organizations)
    .set({
      sending_domain: domain,
      domain_verified_at: null,
    })
    .where(eq(organizations.id, orgId));

  return NextResponse.json(
    {
      error: "Domain DNS verification failed",
      domain,
      verified: false,
      checks,
      message: `Verification pending: ${checks.spf.passed ? "✓ SPF active" : "❌ SPF missing"} · ${
        checks.dmarc.passed ? "✓ DMARC active" : "❌ DMARC missing"
      }. Check your DNS records and try again.`,
    },
    { status: 400 },
  );
}
