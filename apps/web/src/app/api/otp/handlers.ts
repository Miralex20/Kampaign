/**
 * OTP gate API
 *
 * POST /api/otp/request  — generate and send OTP code to recipient's email
 * POST /api/otp/verify   — verify submitted code; unlock landing page
 *
 * The landing page invokes /api/otp/request on load when campaign.require_otp=true.
 * The user submits the code via /api/otp/verify.
 *
 * Security:
 * - Code is hashed before storage (SHA-256)
 * - Max 5 attempts before 30-minute lockout
 * - Code expires after 10 minutes
 * - Plaintext code sent via listmonk, never logged
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, otp_codes, messages, campaigns, recipients } from "@campaign/db";
import { eq, and } from "drizzle-orm";
import {
  generateOtp,
  hashOtp,
  verifyOtp,
  otpExpiresAt,
  otpLockedUntil,
  OTP_MAX_ATTEMPTS,
} from "@campaign/core/otp";
import { createListmonkClient, listmonkConfigFromEnv } from "@campaign/core/listmonk";

const RequestSchema = z.object({ messageId: z.string().uuid() });
const VerifySchema = z.object({
  messageId: z.string().uuid(),
  code: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, "Must be a 6-digit code"),
});

// ---------------------------------------------------------------------------
// POST /api/otp/request
// ---------------------------------------------------------------------------
export async function requestOtp(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { messageId } = parsed.data;
  const db = getDb();

  // Validate message exists
  const [message] = await db
    .select({
      id: messages.id,
      recipient_id: messages.recipient_id,
      campaign_id: messages.campaign_id,
    })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!message) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check if campaign requires OTP
  const [campaign] = await db
    .select({ require_otp: campaigns.require_otp, subject: campaigns.subject })
    .from(campaigns)
    .where(eq(campaigns.id, message.campaign_id))
    .limit(1);

  if (!campaign?.require_otp) {
    return NextResponse.json({ error: "OTP not required for this campaign" }, { status: 400 });
  }

  const [recipient] = await db
    .select({ email: recipients.email, first_name: recipients.first_name })
    .from(recipients)
    .where(eq(recipients.id, message.recipient_id))
    .limit(1);

  if (!recipient) {
    return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
  }

  // Check existing OTP (don't regenerate if still valid)
  const [existing] = await db
    .select({
      id: otp_codes.id,
      expires_at: otp_codes.expires_at,
      locked_until: otp_codes.locked_until,
    })
    .from(otp_codes)
    .where(eq(otp_codes.message_id, messageId))
    .limit(1);

  if (existing?.locked_until && existing.locked_until > new Date()) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  // Generate new OTP
  const plainCode = generateOtp();
  const codeHash = hashOtp(plainCode);
  const expiresAt = otpExpiresAt();

  // Upsert OTP record
  await db
    .insert(otp_codes)
    .values({
      message_id: messageId,
      code_hash: codeHash,
      attempts: 0,
      locked_until: null,
      expires_at: expiresAt,
    })
    .onConflictDoUpdate({
      target: otp_codes.message_id,
      set: {
        code_hash: codeHash,
        attempts: 0,
        locked_until: null,
        expires_at: expiresAt,
      },
    });

  // Send OTP via listmonk transactional email
  try {
    const listmonkTemplateId = Number(process.env["LISTMONK_TX_TEMPLATE_ID"] ?? 0);
    const listmonk = createListmonkClient(listmonkConfigFromEnv());
    await listmonk.sendTransactional({
      subscriberEmail: recipient.email,
      templateId: listmonkTemplateId,
      data: {
        otp_code: plainCode,
        first_name: recipient.first_name ?? "",
      },
      subject: "Your verification code",
    });
  } catch (err) {
    console.error("[otp] Failed to send OTP email:", err);
    // Don't expose delivery failure to client — the code is still stored
  }

  // Discard plainCode from memory
  return NextResponse.json({ ok: true, expiresAt: expiresAt.toISOString() });
}

// ---------------------------------------------------------------------------
// POST /api/otp/verify
// ---------------------------------------------------------------------------
export async function verifyOtpCode(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid code", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { messageId, code } = parsed.data;
  const db = getDb();

  const [otpRecord] = await db
    .select()
    .from(otp_codes)
    .where(eq(otp_codes.message_id, messageId))
    .limit(1);

  if (!otpRecord) {
    return NextResponse.json({ error: "No OTP found — request a new code" }, { status: 404 });
  }

  // Check lockout
  if (otpRecord.locked_until && otpRecord.locked_until > new Date()) {
    return NextResponse.json({ error: "Account locked. Try again later." }, { status: 429 });
  }

  // Check expiry
  if (otpRecord.expires_at < new Date()) {
    return NextResponse.json({ error: "Code expired — request a new one" }, { status: 410 });
  }

  // Verify code
  const correct = verifyOtp(code, otpRecord.code_hash);

  if (!correct) {
    const attempts = (otpRecord.attempts ?? 0) + 1;
    const locked = attempts >= OTP_MAX_ATTEMPTS;

    await db
      .update(otp_codes)
      .set({
        attempts,
        ...(locked ? { locked_until: otpLockedUntil() } : {}),
      })
      .where(eq(otp_codes.message_id, messageId));

    return NextResponse.json(
      {
        error: locked ? "Too many attempts. Locked for 30 minutes." : "Incorrect code",
        attemptsRemaining: locked ? 0 : OTP_MAX_ATTEMPTS - attempts,
      },
      { status: 401 },
    );
  }

  // Success — delete OTP record so it can't be reused
  await db.delete(otp_codes).where(eq(otp_codes.message_id, messageId));

  return NextResponse.json({ ok: true, verified: true });
}
