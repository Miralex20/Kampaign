/**
 * POST /api/org/verify-domain
 *
 * Verifies domain DNS records for email sending (SPF and DMARC).
 * Sets organizations.domain_verified_at on successful verification.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveTxt } from "node:dns/promises";
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

  // Check DNS records
  let spfPassed = false;
  let dmarcPassed = false;

  try {
    // 1. Check SPF on apex domain: TXT record with "v=spf1"
    const txtRecords = await resolveTxt(domain);
    for (const recordChunks of txtRecords) {
      const full = recordChunks.join("");
      if (full.startsWith("v=spf1")) {
        spfPassed = true;
        break;
      }
    }
  } catch {
    // DNS resolution failure / NXDOMAIN
    spfPassed = false;
  }

  try {
    // 2. Check DMARC: TXT record at _dmarc.<domain> with "v=DMARC1"
    const dmarcRecords = await resolveTxt(`_dmarc.${domain}`);
    for (const recordChunks of dmarcRecords) {
      const full = recordChunks.join("");
      if (full.startsWith("v=DMARC1")) {
        dmarcPassed = true;
        break;
      }
    }
  } catch {
    dmarcPassed = false;
  }

  // In test / localhost environment, allow bypass if TEST_ALLOW_DOMAIN_VERIFY is enabled
  if (process.env["NODE_ENV"] !== "production" && process.env["TEST_ALLOW_DOMAIN_VERIFY"] === "true") {
    spfPassed = true;
    dmarcPassed = true;
  }

  const verified = spfPassed && dmarcPassed;
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
        spf: spfPassed,
        dmarc: dmarcPassed,
        domain_verified_at: now,
      },
    });
  }

  return NextResponse.json(
    {
      error: "Domain DNS verification failed",
      domain,
      verified: false,
      checks: {
        spf: { passed: spfPassed, requirement: "TXT record starting with v=spf1 on " + domain },
        dmarc: { passed: dmarcPassed, requirement: "TXT record starting with v=DMARC1 on _dmarc." + domain },
      },
    },
    { status: 400 },
  );
}
