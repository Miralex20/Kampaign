# DECISIONS.md

Architecture and design decisions made during implementation.
Format: date · milestone · decision · reason.

---

| Date | Milestone | Decision | Reason |
|------|-----------|----------|--------|
| 2026-09-24 | M0 | listmonk used as send engine (`external` subscriber mode) | Eliminates the need to maintain a custom SMTP worker. listmonk handles throughput, bounce ingestion, and feedback loops. Our app owns tokens, landing pages, tracking, and compliance. |
| 2026-09-24 | M0 | Raw tokens encrypted with AES-256-GCM before storing in BullMQ job payload | BullMQ persists job data in Redis. Without encryption, an attacker with Redis access could extract all unsent tokens and fabricate landing-page visits. |
| 2026-09-24 | M0 | Hard bounce → permanent suppression; soft bounce → event only, no suppression | Soft bounces (mailbox full, temporary failure) are transient. Permanently suppressing on soft bounce would incorrectly block reachable recipients. |
| 2026-09-24 | M0 | `expires_at` on `messages` takes precedence over `campaigns.expires_at`; message-level may not extend past campaign-level | Allows individual message overrides while campaign-level acts as a ceiling. |
| 2026-09-24 | M0 | No-JS clients never receive a verified view event | The beacon requires a small inline script. Deliberate: we prefer zero false positives (scanner hits look like humans without the beacon) over false negatives (no-JS humans missing a view count). |
| 2026-09-24 | M0 | OTP lockout is per-message, not per-recipient | A re-sent message generates a new `otp_codes` row and resets the counter. Acceptable for v1 because generating a new message requires the sender to relaunch, which is rate-limited at the campaign level. |
| 2026-09-24 | M0 | Suppression is per-org (not global) | Multi-tenant: one org's suppression list must not affect another org's sends. Provider-level blocklisting (listmonk) operates globally and prevents delivery regardless of our suppression table. |
| 2026-09-24 | M0 | Recipient deletion is soft-delete with PII nullification | Preserves audit trail (message/event rows) for complaint investigations while meeting GDPR erasure requirements. |
| 2026-09-24 | M0 | PgBouncer in transaction mode, max 20 server connections | Next.js and worker both create short-lived DB connections. Transaction mode maximises connection reuse. |
| 2026-09-24 | M0 | `phone` column omitted from v1 schema | Phase 2 only. Avoids misleading schema presence for a feature not yet built. |
