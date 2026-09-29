/**
 * POST /api/recipients/import
 *
 * Accepts a multipart/form-data upload with:
 *   - file: CSV file (up to 50k rows)
 *   - consentSource: string (who collected consent)
 *   - consentAt: ISO 8601 timestamp of consent collection
 *
 * Streams the CSV through packages/core/csv, upserts valid rows, and returns:
 *   { imported, skipped, rejected, rejectedCsvUrl? }
 *
 * Security:
 *   - orgId always from session, never from request body
 *   - Consent declaration required — 422 if absent
 *   - Max file size: 25 MB
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, recipients } from "@campaign/db";
import { parseRecipientCsv } from "@campaign/core/csv";
import { requireSession } from "@/lib/session";

export const maxDuration = 60;

const ConsentBodySchema = z.object({
  consentSource: z.string().min(1, "consentSource is required"),
  consentAt: z.string().datetime({ message: "consentAt must be an ISO 8601 datetime" }),
});

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Authenticate
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch (res) {
    return res as NextResponse;
  }
  const { orgId } = session;

  // 2. Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  // 3. Validate consent fields (required — cannot import without consent declaration)
  const consentParse = ConsentBodySchema.safeParse({
    consentSource: formData.get("consentSource"),
    consentAt: formData.get("consentAt"),
  });
  if (!consentParse.success) {
    return NextResponse.json(
      { error: "Consent declaration required", issues: consentParse.error.issues },
      { status: 422 },
    );
  }
  const { consentSource, consentAt } = consentParse.data;

  // 4. Get the CSV file
  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 25 MB)" }, { status: 413 });
  }

  // 5. Read into Buffer for parseRecipientCsv
  const buffer = Buffer.from(await file.arrayBuffer());

  // 6. Parse CSV
  let result: Awaited<ReturnType<typeof parseRecipientCsv>>;
  try {
    result = await parseRecipientCsv(buffer);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to parse CSV", detail: String(err) },
      { status: 422 },
    );
  }

  const { valid, rejected } = result;

  // 7. Upsert valid rows into recipients table
  const db = getDb();
  let imported = 0;
  const consentAtDate = new Date(consentAt);

  for (const row of valid) {
    await db
      .insert(recipients)
      .values({
        org_id: orgId,
        email: row.email,
        first_name: row.first_name ?? null,
        fields: row.fields ?? {},
        consent_status: "granted",
        consent_at: consentAtDate,
        consent_source: consentSource,
      })
      .onConflictDoUpdate({
        target: [recipients.org_id, recipients.email],
        set: {
          first_name: row.first_name ?? null,
          fields: row.fields ?? {},
          consent_status: "granted",
          consent_at: consentAtDate,
          consent_source: consentSource,
        },
      });
    imported++;
  }

  return NextResponse.json({
    imported,
    skipped: 0,
    rejected,
  });
}
