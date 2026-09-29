/**
 * GET /api/metrics
 *
 * Prometheus / system metrics endpoint:
 * - queue_depth (BullMQ queue depth)
 * - messages_sent_total
 * - messages_delivered_total
 * - bounce_rate (hard + soft bounces / total sent)
 * - complaint_rate (complaints / total sent)
 * - verified_views_total
 */
import { NextResponse } from "next/server";
import { getDb, messages, campaigns } from "@campaign/db";
import { eq, sql, count } from "drizzle-orm";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

let metricsQueue: Queue | null = null;
function getQueue(): Queue {
  if (!metricsQueue) {
    const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    const redis = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
    metricsQueue = new Queue("campaign-dispatch", { connection: redis });
  }
  return metricsQueue;
}

export async function GET(): Promise<Response> {
  const db = getDb();

  // 1. Queue depth
  let queueWaiting = 0;
  let queueActive = 0;
  let queueFailed = 0;
  try {
    const queue = getQueue();
    const counts = await queue.getJobCounts("waiting", "active", "failed");
    queueWaiting = counts.waiting ?? 0;
    queueActive = counts.active ?? 0;
    queueFailed = counts.failed ?? 0;
  } catch {
    // If Redis is unreachable, report 0
  }

  // 2. DB Message Stats
  const statusCounts = await db
    .select({
      status: messages.status,
      total: count(),
    })
    .from(messages)
    .groupBy(messages.status);

  const stats: Record<string, number> = {};
  for (const row of statusCounts) {
    stats[row.status] = Number(row.total);
  }

  const sent = stats["sent"] ?? 0;
  const delivered = stats["delivered"] ?? 0;
  const bounced = stats["bounced"] ?? 0;
  const complained = stats["complained"] ?? 0;

  const totalDispatched = sent + delivered + bounced + complained;
  const bounceRate = totalDispatched > 0 ? (bounced / totalDispatched).toFixed(4) : "0.0000";
  const complaintRate = totalDispatched > 0 ? (complained / totalDispatched).toFixed(4) : "0.0000";

  // 3. Views
  const [viewsResult] = await db
    .select({ total: sql<number>`coalesce(sum(${messages.view_count}), 0)` })
    .from(messages);
  const totalViews = Number(viewsResult?.total ?? 0);

  // Format as Prometheus text format
  const output = [
    "# HELP campaign_queue_waiting_jobs Number of waiting jobs in dispatch queue",
    "# TYPE campaign_queue_waiting_jobs gauge",
    `campaign_queue_waiting_jobs ${queueWaiting}`,
    "",
    "# HELP campaign_queue_active_jobs Number of active jobs in dispatch queue",
    "# TYPE campaign_queue_active_jobs gauge",
    `campaign_queue_active_jobs ${queueActive}`,
    "",
    "# HELP campaign_queue_failed_jobs Number of failed jobs in dispatch queue",
    "# TYPE campaign_queue_failed_jobs gauge",
    `campaign_queue_failed_jobs ${queueFailed}`,
    "",
    "# HELP campaign_messages_sent_total Total messages sent",
    "# TYPE campaign_messages_sent_total counter",
    `campaign_messages_sent_total ${sent + delivered}`,
    "",
    "# HELP campaign_messages_delivered_total Total messages delivered",
    "# TYPE campaign_messages_delivered_total counter",
    `campaign_messages_delivered_total ${delivered}`,
    "",
    "# HELP campaign_bounce_rate Ratio of bounced messages to total sent",
    "# TYPE campaign_bounce_rate gauge",
    `campaign_bounce_rate ${bounceRate}`,
    "",
    "# HELP campaign_complaint_rate Ratio of complaints to total sent",
    "# TYPE campaign_complaint_rate gauge",
    `campaign_complaint_rate ${complaintRate}`,
    "",
    "# HELP campaign_views_total Total verified landing page views",
    "# TYPE campaign_views_total counter",
    `campaign_views_total ${totalViews}`,
    "",
  ].join("\n");

  return new Response(output, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    },
  });
}
