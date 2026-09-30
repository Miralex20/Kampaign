/**
 * POST /api/messages/:id/action
 *
 * Handles action block clicks from the landing page.
 * Action blocks: data-action="rsvp-yes", data-action="rsvp-no", data-action="confirm", data-action="link"
 * Payload: { block: string, value: string }
 *
 * Idempotent: an existing action event for the same (message_id, block) is updated.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, messages, events } from "@campaign/db";
import { eq, and, sql } from "drizzle-orm";

const ActionSchema = z.object({
  block: z.string().min(1).max(100),
  value: z.string().max(500),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { id: messageId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { block, value } = parsed.data;
  const db = getDb();

  // Verify message exists
  const [message] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // Idempotency: find existing action event for this message & block
  const existingEvents = await db
    .select({ id: events.id, meta: events.meta })
    .from(events)
    .where(and(eq(events.message_id, messageId), eq(events.type, "action")));

  const existing = existingEvents.find(
    (e) => (e.meta as Record<string, unknown> | null)?.["block"] === block,
  );

  if (existing) {
    await db
      .update(events)
      .set({
        meta: { block, value },
        created_at: new Date(),
      })
      .where(eq(events.id, existing.id));
  } else {
    await db.insert(events).values({
      message_id: messageId,
      type: "action",
      meta: { block, value },
    });
  }

  return NextResponse.json({ ok: true, block, value });
}
