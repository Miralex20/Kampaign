# AGENT_PLAN.md — Personalized Message Pages (We Send It / You Send It / Share Anywhere)

> Read this file completely before writing a single line of code.
> Work one milestone at a time, in strict order.
> Do not start milestone N+1 until every acceptance check for milestone N is reported as passed.

---

## 1. What we are building

A multi-tenant SaaS platform where a sender uploads a recipient list, writes a template, and
launches a campaign. Every recipient gets a **unique, token-protected landing page** that
shows their private message, records a verified read, and lets them act (reply, RSVP, confirm).

The platform supports **two send modes**. Senders choose one per campaign:

---

### Mode A — "We Send It"

The platform sends the email on the sender's behalf via **listmonk** (self-hosted SMTP).
Because we control the email, we can personalise both the **email body** (name, teaser,
preheader) and the **landing page**. The email body stays clean and neutral (no banned
phrases); the real content lives on the landing page. We also receive bounce, complaint, and
unsubscribe webhook events and feed them into the suppression list.

```
upload CSV
  → import recipients into DB
  → create campaign (email template + page template, personalised fields in both)
  → launch: generate token per recipient, call listmonk /api/tx per message
  → listmonk delivers email with personalised body + unique landing link
  → listmonk fires webhook events → handler updates status, suppresses as needed
  → recipient clicks link → /m/[token] landing page
  → server renders personalised page, scanner filter, beacon, verified-read recorded
  → recipient acts (reply / RSVP / OTP gate)
  → sender views full results dashboard (sent, delivered, bounced, read, actions)
```

### Mode B — "You Send It" (Personal Links)

The platform generates a **unique landing-page link per recipient**. The sender exports a CSV
of `(email, landing_link)` and sends the email through their own tool (Mailchimp, Gmail, etc.).
Because the platform has each recipient's data, the landing page is still **fully personalised**
even though we didn't touch the email. Good for senders with a preferred ESP who still need
private, personalised message pages.

> **Key use case**: sender has banned phrases in their message content (legal notices,
> HR communications, financial/crypto content). They send a plain neutral email themselves
> and put the real content on the personalised landing page.

### Mode C — "Share Anywhere" (Broadcast Link)

The platform generates a **single shared link** for the whole campaign. The sender shares
it anywhere — a WhatsApp group, an SMS blast, a printed QR code, a Telegram channel.
No CSV, no per-recipient data, no email involved. Anyone who has the link sees the same
page. Tracking is aggregate only (total view count); no individual identity.

> **Key use case**: the sender wants to post a message to a group chat or community without
> putting the content in the chat itself (e.g. sensitive announcement, private event details).
> One link, everyone gets the same page.

```
[Mode B — You Send It]
upload CSV
  → import recipients into DB
  → create campaign (page template only; no email_html/email_text authored here)
  → launch: generate token per recipient, produce links_export.csv download
  → sender downloads CSV, pastes links into their own mailer, sends email themselves
  → recipient clicks link → /m/[token] landing page
  → server renders personalised page, scanner filter, beacon, verified-read recorded
  → recipient acts (reply / RSVP / OTP gate)
  → sender views landing-engagement dashboard (reads, actions, replies)
    — no delivery/bounce data (platform never touched the email)

[Mode C — Share Anywhere]
  → create campaign (page template only; no recipient list needed)
  → launch: generate ONE shared token for the campaign
  → sender copies the link → shares to WhatsApp / SMS / QR / anywhere
  → anyone with the link clicks → /m/[campaignToken] landing page
  → server renders page (no personalisation — same content for all)
  → aggregate view counter incremented; no per-person identity recorded
  → sender views broadcast dashboard (total views, action clicks)
```

### Comparison

| Capability                    | A — We Send It  |  B — You Send It   | C — Share Anywhere  |
| ----------------------------- | :-------------: | :----------------: | :-----------------: |
| Platform sends the email      |       ✅        |         ❌         |         ❌          |
| Personalised email body       |       ✅        | ❌ (sender's tool) |    ❌ (no email)    |
| Personalised landing page     |       ✅        |         ✅         |  ❌ (same for all)  |
| Needs a recipient list / CSV  |       ✅        |         ✅         |         ❌          |
| Bounce / complaint tracking   |       ✅        |         ❌         |         ❌          |
| Suppression list auto-fed     |       ✅        |    ❌ (manual)     |         ❌          |
| Verified per-person reads     |       ✅        |         ✅         | ❌ (aggregate only) |
| OTP gate                      |       ✅        |         ✅         |         ✅          |
| Reply collection              |       ✅        |         ✅         |   ✅ (anonymous)    |
| Link shareable anywhere       | ❌ (email only) |  ❌ (per-person)   |         ✅          |
| Requires sending domain setup |       ✅        |         ❌         |         ❌          |
| Requires new-org review       |       ✅        |         ❌         |         ❌          |

---

### What listmonk owns (Mode A only)

- SMTP multi-queue send engine
- Bounce, complaint, and unsubscribe webhook ingestion (SES/Mailgun/Postmark)
- Subscriber data store (we sync into it)
- Rate limiting and throughput control
- Transactional template rendering for the email body

### What this app owns

- Multi-tenant org/user model and auth
- Recipient import, consent capture, deduplication (Modes A + B; not needed for C)
- Token generation, hashing, and verification
- Campaign authoring:
  - Mode A: email template + page template
  - Mode B: page template only
  - Mode C: page template only (no recipient list)
- HTML sanitisation of sender-supplied content
- **Mode A** — launch orchestration: per-recipient token creation → listmonk `/api/tx` → status tracking
- **Mode B** — launch: per-recipient token creation → `links_export.csv` download; no listmonk calls
- **Mode C** — launch: single campaign-level token → one shareable URL; no recipient data
- Landing page at `/m/[token]` — personalised for A/B, generic for C
- Verified-read logic (scanner filter, beacon, interaction gate) — A/B only; C uses aggregate counter
- OTP gate, reply collection, action blocks (all three modes)
- Results dashboard (full for A; landing-engagement for B; broadcast stats for C)
- Suppression list (auto-fed by listmonk webhooks in A; manual-only in B; not applicable in C)
- Per-org sending domain verification, daily caps, new-org review gate **(Mode A only)**

---

## 2. Operating rules

1. **Small, verifiable steps.** After each task: `pnpm lint && pnpm typecheck && pnpm test`. Never stack unverified work.
2. **Tests first for all core logic.** Tokens, render, csv, suppression, scanner filter, OTP — unit tests exist before anything imports them.
3. **Never log or persist raw tokens.** The raw token lives only in process memory (token generation function → listmonk API call body). It never touches the database, logs, Sentry breadcrumbs, or Redis.
4. **Escape every merged value.** No template value is inserted as raw HTML. HTML-sanitise sender-supplied page/email bodies on save.
5. **Idempotency everywhere.** Launch, listmonk dispatch, and webhook handlers must be safe to run twice without side effects.
6. **listmonk behind an interface.** No file outside `packages/core/listmonk/` may import or call listmonk directly. The rest of the app talks to a `ListmonkClient` interface.
7. **Stop and ask a human** at every item in section 9. Do not fake DNS, credentials, or legal answers.
8. **No scope creep.** Section 10 (out of scope) stays out until asked.
9. **Commit per task** with a clear conventional-commit message. The main branch must always be green.
10. **Ambiguous requirements:** write the assumption in `DECISIONS.md` and continue — unless it touches security, sending behaviour, or consent, in which case stop and ask.
11. **Runbook updated incrementally.** Each milestone that introduces an operational concern (cron, background job, webhook, external service) adds its section to `RUNBOOK.md` immediately, not in M8.

---

## 3. Stack

| Concern         | Choice                                                               | Notes                                                                                                |
| --------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Language        | TypeScript (strict)                                                  | `"strict": true` + `"noUncheckedIndexedAccess": true`                                                |
| App             | Next.js 14 (App Router)                                              | Dashboard, API routes, `/m/[token]` landing page                                                     |
| Database        | Postgres 16 + Drizzle ORM                                            | SQL migrations, no magic query builders outside `packages/db`                                        |
| Connection pool | PgBouncer (transaction mode)                                         | Configured in `docker-compose.yml`; max 20 app connections                                           |
| Queue           | BullMQ on Redis 7                                                    | **Only** used for launch orchestration (fan-out of listmonk `/api/tx` calls). NOT used for raw SMTP. |
| Worker          | Separate Node process                                                | Long-running; graceful shutdown via `SIGTERM` handler                                                |
| Email delivery  | **listmonk** (self-hosted)                                           | Called via `ListmonkClient` interface; never import listmonk SDK                                     |
| Auth            | Auth.js v5 (email magic-link)                                        | Sessions rotate on every request; max age 24 h                                                       |
| Validation      | Zod on every API boundary                                            | Coerce and strip unknown keys                                                                        |
| Tests           | Vitest (unit + integration)                                          | Integration tests use a dedicated test DB with transaction rollback isolation                        |
| E2E             | Playwright                                                           | Mail sink (Mailpit) for full flow in CI                                                              |
| Tooling         | pnpm workspaces, ESLint, Prettier, GitHub Actions CI                 |                                                                                                      |
| Observability   | Sentry (errors), Pino (structured logs), Prometheus metrics endpoint |                                                                                                      |

---

## 4. Repository layout

```
/apps
  web/                   Next.js: dashboard, API routes, /m/[token]
  worker/                BullMQ worker: listmonk dispatch jobs, scheduled jobs

/packages
  db/                    Drizzle schema, SQL migrations, typed query helpers
  core/
    tokens/              generate, hash, constant-time verify
    render/              {{key|fallback}} engine, HTML escaping
    csv/                 streaming parse, validate, dedupe (up to 50k rows)
    listmonk/            ListmonkClient interface + HTTP adapter
    tracking/            scanner-bot list, view-recording rules
    suppression/         isSuppressed(), suppress()
    sanitise/            HTML allowlist sanitiser (DOMPurify server-side)
    otp/                 generate, hash, verify, lockout logic

/docs
  DECISIONS.md
  RUNBOOK.md
```

**Rules:**

- `packages/core/*` must have zero framework imports. Pure TypeScript, Node built-ins only.
- `packages/db` exports typed query helpers; no raw SQL strings outside it.
- No circular dependencies between packages.

---

## 5. Environment variables

```dotenv
# Postgres
DATABASE_URL=postgres://user:pass@localhost:5432/campaign_db
DATABASE_TEST_URL=postgres://user:pass@localhost:5432/campaign_test_db

# Redis
REDIS_URL=redis://localhost:6379

# App
APP_BASE_URL=https://app.example.com
LINK_BASE_URL=https://m.example.com        # public landing domain (separate hostname)

# listmonk
LISTMONK_BASE_URL=http://localhost:9000
LISTMONK_API_USER=api_user
LISTMONK_API_TOKEN=                        # basic-auth token
LISTMONK_TX_TEMPLATE_ID=                   # ID of the transactional template in listmonk

# Auth
AUTH_SECRET=

# Observability
SENTRY_DSN=
LOG_LEVEL=info

# Sending
LISTMONK_DISPATCH_CONCURRENCY=10           # parallel /api/tx calls per worker
NEW_ORG_DAILY_CAP=500
```

Never commit real values. Provide `.env.example` only.
Secrets come from environment; never from the client bundle or DB.

---

## 6. Data model

Create as the **first migration**. Keep column names exactly as shown.

```sql
-- Organisations (tenants)
organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  sending_domain text,
  domain_verified_at timestamptz,
  plan          text not null default 'trial',
  daily_cap     int not null default 500,
  review_state  text not null default 'pending',  -- pending | approved | suspended
  created_at    timestamptz not null default now()
);

-- Users (one org per user in v1; role always 'owner')
users (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  email         text not null unique,
  role          text not null default 'owner',
  created_at    timestamptz not null default now()
);

-- Campaigns
campaigns (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,

  -- Three campaign modes (immutable after first launch):
  --   managed_send      → Mode A: platform sends email via listmonk, per-recipient tokens
  --   link_per_recipient → Mode B: per-recipient CSV export, sender's own mailer
  --   link_universal    → Mode C: single shared link, no recipient list
  campaign_mode text not null default 'managed_send',

  -- Email fields: required for managed_send; null/forbidden for link_* modes
  subject       text,
  preheader     text,
  email_html    text,          -- sanitised; rendered by listmonk (managed_send only)
  email_text    text,          -- plain-text alt (managed_send only)

  -- Page content: required for all modes
  page_html     text not null, -- sanitised; rendered by our landing page

  status        text not null default 'draft',
  -- draft|review|approved|scheduled|launching|live|paused|completed|cancelled

  -- Mode B fields: populated after launch
  link_export_url          text,
  link_export_generated_at timestamptz,

  -- Mode C fields: the single shared campaign-level token
  universal_token_hash     bytea unique,  -- SHA-256 of shared raw token; null for modes A/B
  universal_view_count     int not null default 0,  -- aggregate counter; no per-person rows

  scheduled_at  timestamptz,
  expires_at    timestamptz,
  require_otp   boolean not null default false,
  created_by    uuid not null references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Check constraints (also enforced at Zod layer):
-- alter table campaigns add constraint campaigns_managed_fields_required
--   check (campaign_mode != 'managed_send' or
--          (subject is not null and email_html is not null and email_text is not null));
-- alter table campaigns add constraint campaigns_universal_token_mode
--   check (campaign_mode != 'link_universal' or universal_token_hash is not null
--          or status = 'draft');  -- token populated at launch, null during draft is ok

-- Immutable audit log of page_html versions (append-only)
campaign_page_versions (
  id            bigserial primary key,
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  page_html     text not null,
  edited_by     uuid not null references users(id),
  created_at    timestamptz not null default now()
);

-- Recipients (per org; email is case-insensitive)
recipients (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  email         citext not null,
  first_name    text,
  fields        jsonb not null default '{}',
  consent_status text not null,              -- granted | withdrawn
  consent_at    timestamptz not null,
  consent_source text not null,
  listmonk_subscriber_id int,               -- ID in listmonk subscribers table; null until synced
  deleted_at    timestamptz,                -- soft-delete for GDPR erasure
  unique (org_id, email)
);

-- One message row per (campaign, recipient) — created at launch time
messages (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  recipient_id  uuid not null references recipients(id),
  token_hash    bytea not null unique,       -- SHA-256 of raw token; raw token never stored
  status        text not null default 'pending', -- pending|dispatched|sent|delivered|bounced|complained|failed|suppressed|expired
  listmonk_message_id text,                 -- returned by listmonk /api/tx; used for webhook matching
  sent_at       timestamptz,
  delivered_at  timestamptz,
  first_viewed_at timestamptz,
  view_count    int not null default 0,
  expires_at    timestamptz,                -- null means use campaign.expires_at; message-level takes precedence if set
  dispatch_attempts int not null default 0,
  unique (campaign_id, recipient_id)
);

-- Immutable event log (never update, only insert)
events (
  id            bigserial primary key,
  message_id    uuid not null references messages(id),
  type          text not null,              -- dispatched|sent|delivered|bounced|complained|view|action|reply|otp_attempt|otp_locked
  meta          jsonb,
  created_at    timestamptz not null default now()
);

-- Replies from the landing page
replies (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references messages(id),
  body          text not null,
  ip_hash       text,                       -- SHA-256 of IP; never raw IP
  created_at    timestamptz not null default now()
);

-- Global suppression list per org (fed by listmonk webhook + manual)
suppressions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  email         citext not null,
  reason        text not null,              -- hard_bounce|soft_bounce|complaint|unsubscribe|manual
  bounce_type   text,                       -- hard|soft|null
  created_at    timestamptz not null default now(),
  unique (org_id, email)
);

-- OTP codes for landing page gating
otp_codes (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references messages(id) unique,
  code_hash     bytea not null,             -- SHA-256 of 6-digit code
  attempts      int not null default 0,
  locked_until  timestamptz,
  expires_at    timestamptz not null
);
```

### Indexes (add in same migration)

```sql
create index on messages (token_hash);
create index on messages (campaign_id, status);
create index on events (message_id, type);
create index on recipients (org_id, email);           -- implicit from unique but make explicit
create index on suppressions (org_id, email);         -- implicit from unique but make explicit
create index on messages (campaign_id) where status = 'pending';
create index on campaigns (universal_token_hash) where universal_token_hash is not null;  -- Mode C lookups
```

### Design decisions baked in

- **Bounce types:** `bounced` with `bounce_type=hard` → permanent suppression. `bounce_type=soft` → log event, do NOT suppress (mailbox-full is temporary). This distinction is resolved from the listmonk webhook payload. _(Mode A only)_
- **Cross-org suppression:** suppression is per-org. A complaint registered against org A does not suppress org B. _(Mode A only; Mode B has manual suppression only; Mode C has no suppression)_
- **Recipient deletion (GDPR):** soft-delete via `deleted_at`. On erasure request, null out PII columns (`email → deleted+[uuid]@erased`, `first_name → null`, `fields → {}`), set `deleted_at`, remove from listmonk via their subscriber delete API. Message/event rows are retained for audit but all PII columns in `recipients` are erased. _(Modes A/B; Mode C has no PII)_
- **`expires_at` precedence (Modes A/B):** message-level `expires_at` takes precedence over `campaigns.expires_at`. If both null, link never expires.
- **`expires_at` for Mode C:** `campaigns.expires_at` only. If null, link never expires. After expiry, the landing page shows the `expired` page.
- **`campaign_mode` is immutable after first launch.** Changing it could invalidate existing tokens. Enforced in the API: PATCH returns 409 if `campaign_mode` changes post-launch.
- **Mode C has no `messages` table rows.** `universal_view_count` on the campaign is incremented atomically (`UPDATE campaigns SET universal_view_count = universal_view_count + 1`). No per-person identity is recorded. Scanner-bot filter still applies (scanner hits do not increment the counter).
- **`phone` column:** omitted from v1 schema. Phase 2 only.
- **`created_by` on campaigns:** always the org owner in v1. Retained for Phase 2 multi-user.
- **Campaign versioning:** every `page_html` edit appends a row to `campaign_page_versions`. Landing page always serves the latest. Version ID is recorded in view event `meta` for A/B; recorded in a separate `campaign_broadcast_views` table for C.

---

## 7. Token contract

```
Raw token   = base64url(randomBytes(24))   → 32 characters, 192 bits entropy
Token hash  = SHA-256(raw token)           → 32 bytes, stored as bytea
```

**Lifecycle:**

1. `newToken()` called inside the launch transaction.
2. `hashToken(raw)` computed immediately.
3. Hash written to `messages.token_hash`.
4. Raw token passed (in memory only) to the BullMQ job payload **as an encrypted value** — encrypted with `AES-256-GCM` using `TOKEN_ENCRYPTION_KEY` (32-byte env var). The ciphertext is stored in the job. The raw token is never in the job.
5. Worker decrypts ciphertext, builds landing URL, calls listmonk `/api/tx`, then discards the plaintext token from memory. Ciphertext deleted from job on success.
6. The raw token appears only inside the emitted email link and briefly in worker memory during step 5.

**Verification at landing page:**

1. Extract token from URL param.
2. Compute `SHA-256(token)`.
3. Query `messages where token_hash = $1`.
4. Assert stored hash length = 32 bytes before `timingSafeEqual`.
5. Never log the raw token at any step.

Add `TOKEN_ENCRYPTION_KEY` to environment variables (32 random bytes, base64-encoded).

---

## 8. listmonk integration (Managed Send mode only)

> listmonk is **not used at all** in Link-Only campaigns. All references below apply exclusively
> to campaigns with `send_mode = 'managed'`.

### How we use listmonk

- **One transactional template** in listmonk: minimal HTML wrapper that inserts the landing page link, name teaser, and preheader. Personalisation in the email body uses `{{first_name}}`, `{{preheader}}`; all deeper personalisation happens on the landing page.
- **`subscriber_mode: external`** on `/api/tx` calls. This means listmonk does not require recipients to exist in its subscriber store. We pass `subscriber_emails` and inject personalised data via the `data` map (`{{ .Tx.Data.link }}`, `{{ .Tx.Data.first_name }}`, `{{ .Tx.Data.preheader }}`).
- **Why `external` mode:** avoids a synchronisation problem. We are the source of truth for recipients. We do not need to upsert into listmonk's subscribers table on every launch.
- **Idempotency:** BullMQ job ID = `message.id`. If the job retries, we check `messages.status` before calling listmonk again. If already `dispatched` or beyond, skip.
- **Rate limiting:** `LISTMONK_DISPATCH_CONCURRENCY` controls parallel `/api/tx` calls per worker. listmonk itself enforces its own SMTP throughput. These are independent layers.

### ListmonkClient interface (lives in `packages/core/listmonk/`)

```ts
export interface ListmonkClient {
  sendTransactional(input: {
    subscriberEmail: string;
    templateId: number;
    data: Record<string, unknown>;
    subject?: string;
    contentType?: "html" | "plain";
    altBody?: string;
    headers?: Array<Record<string, string>>;
  }): Promise<{ ok: true }>;

  deleteSubscriber(subscriberEmail: string): Promise<void>;
  blocklistSubscriber(subscriberEmail: string): Promise<void>;
}
```

No other file outside `packages/core/listmonk/` may import this interface's implementation.

### What M4 worker does (replaces old BullMQ SMTP worker)

1. Dequeue job (payload: `{ messageId, encryptedToken }`).
2. Load message row. If status ≠ `pending` → skip (idempotency).
3. Check suppression (our table). If suppressed → update status, log event, ack.
4. Decrypt `encryptedToken` → raw token.
5. Build landing URL: `${LINK_BASE_URL}/m/${rawToken}`.
6. Call `listmonkClient.sendTransactional(...)` with the landing URL and recipient name in `data`.
7. On success: update `messages.status = 'dispatched'`, save nothing about the raw token.
8. On failure: increment `dispatch_attempts`. If `< 5`: throw (BullMQ retries with exponential backoff). If `>= 5`: set `status = 'failed'`, log event, move to BullMQ dead-letter queue.
9. Zeroize raw token variable before function returns (set to empty string; JS GC handles the rest).

---

## 9. Milestones

### M0 — Scaffold and tooling

**Tasks**

- [ ] Create pnpm monorepo matching section 4 layout exactly.
- [ ] TypeScript: `"strict": true`, `"noUncheckedIndexedAccess": true`, path aliases per package.
- [ ] ESLint (`@typescript-eslint/recommended`, `import/no-cycle`), Prettier, shared config packages.
- [ ] Vitest: unit config (no DB), integration config (test DB, transaction-per-test isolation).
- [ ] GitHub Actions: install → lint → typecheck → unit tests → integration tests on every push/PR.
- [ ] `docker-compose.yml`: Postgres 16, Redis 7, PgBouncer (port 5433), listmonk, Mailpit (SMTP sink + web UI).
- [ ] `.env.example` (all variables from section 5 + `TOKEN_ENCRYPTION_KEY`).
- [ ] `DECISIONS.md` stub with template row.
- [ ] `RUNBOOK.md` stub with section headers.
- [ ] Health endpoint at `GET /api/health`: checks DB connectivity and Redis connectivity; returns `{ status: "ok" | "degraded", checks: { db, redis } }`.

**Acceptance**

- `pnpm lint && pnpm typecheck && pnpm test` passes on a clean clone with only `.env.example` values.
- `docker compose up` produces: Postgres accepting connections, Redis accepting connections, listmonk UI accessible at `localhost:9000`, Mailpit UI at `localhost:8025`.
- `GET /api/health` returns `200 { status: "ok" }` with both checks passing.
- GitHub Actions workflow file exists and the CI badge is described in `RUNBOOK.md`.

---

### M1 — Data layer and core library

**Tasks**

- [ ] `packages/db`: Drizzle schema matching section 6, first SQL migration, rollback migration, typed query helpers (no raw SQL strings in the app layer).
- [ ] `packages/core/tokens`:
  - `newToken()` → 24 random bytes, base64url encoded.
  - `hashToken(raw: string)` → SHA-256, returns `Buffer` (32 bytes).
  - `safeVerify(raw: string, storedHash: Buffer)` → asserts `storedHash.length === 32`, then `timingSafeEqual`.
  - `encryptToken(raw: string, key: Buffer)` → AES-256-GCM ciphertext (base64url string). `decryptToken(cipher: string, key: Buffer)` → raw string.
- [ ] `packages/core/render`:
  - Replaces `{{key}}` and `{{key|fallback}}` from a plain object.
  - HTML-escapes all substituted values (`&`, `<`, `>`, `"`, `'`).
  - Missing key with no fallback → empty string. Unknown syntax (`{{#each}}`) → left unchanged.
  - No template logic (no loops, no conditionals) — this engine is for simple substitution only.
- [ ] `packages/core/csv`:
  - Streaming parse (PapaParse in streaming mode), trims whitespace, lowercases emails.
  - Validates email format (RFC 5321 local-part + domain, reject + alias addresses of `example.com`).
  - Dedupes by email within the file (last row wins for same email).
  - Returns `{ valid: RecipientRow[], rejected: { row: number; email: string; reason: string }[] }`.
  - Handles up to 50 000 rows without loading all into memory at once.
- [ ] `packages/core/suppression`: `isSuppressed(db, orgId, email)`, `suppress(db, orgId, email, reason, bounceType?)`. Both operate inside the caller's transaction if one is provided.

**Unit test requirements (must exist before any package is imported by the app)**

- Tokens: 100 000 `newToken()` calls produce a `Set` of size 100 000 (no collisions).
- Tokens: `hashToken` is deterministic; same input → same 32-byte output every time.
- Tokens: `safeVerify` returns true for correct raw token, false for any mutation (1 char off, wrong length, empty).
- Tokens: AES-GCM round-trip: `decryptToken(encryptToken(t, k), k) === t`. Different key returns error.
- Render: `<script>alert(1)</script>` in a value renders as `&lt;script&gt;alert(1)&lt;/script&gt;`.
- Render: `{{name|World}}` with `{}` → `World`. With `{ name: "" }` → `World` (empty string triggers fallback). With `{ name: "Alice" }` → `Alice`.
- Render: unknown syntax `{{#each items}}` is left exactly as-is.
- CSV: rejects `notanemail`, `@missing-local.com`, `missing-at-sign.com`.
- CSV: duplicate emails in file → second row replaces first in `valid[]`, no duplicate in output.
- CSV: 20 bad rows in 1 000-row file → `valid.length + rejected.length === 1000`.
- Suppression: `isSuppressed` is case-insensitive (`ALICE@EXAMPLE.COM` matches `alice@example.com`).

**Acceptance**

- All unit tests above pass.
- Migrations apply cleanly to an empty Postgres database.
- Rollback migration leaves the database in the state before the migration.

---

### M2 — Auth, organisations, recipient import

**Tasks**

- [ ] Auth.js v5 magic-link: email → one-time link → session. Session max age 24 h, rotates on every request.
- [ ] First login: create `organizations` row (name from email domain, `review_state = 'pending'`) and `users` row in a single transaction. Subsequent logins for the same email → fetch existing user.
- [ ] Row-level scoping middleware: every authenticated API handler receives `orgId` from the validated session only — never from a request body or URL param.
- [ ] Recipient import API (`POST /api/recipients/import`):
  - Accept multipart CSV upload.
  - Stream through `packages/core/csv`.
  - Require consent declaration in the request body (`consentSource: string`, `consentAt: ISO8601`). Reject with 422 if absent.
  - Upsert into `recipients` (on conflict `(org_id, email)` update `fields`, `first_name`, `consent_*`).
  - Return `{ imported: number, skipped: number, rejected: RejectedRow[] }`.
  - Provide a download link for the rejected-rows CSV (generated server-side, stored temporarily in `/tmp`).
- [ ] Import UI: upload CSV → column mapping (email required, first_name optional, custom fields optional) → consent declaration checkbox + source text → validation summary → download rejected-rows link.

**Acceptance**

- Integration test: user in org A cannot read org B's recipients (`GET /api/recipients` returns org A's rows only regardless of any `orgId` param passed in query).
- Integration test: import 1 000-row CSV with 20 bad-format emails → `imported = 980`, `rejected.length = 20` (assumes no pre-existing duplicates).
- Integration test: import without consent declaration → 422 response, zero rows inserted.
- Manual: login link arrives in Mailpit, clicking it creates a session, creating a second session on a different browser does not invalidate the first.

---

### M3 — Campaigns, templates, preview, test send

**Tasks**

- [ ] Campaign CRUD endpoints: create, update, get, list (paginated, filterable by status), soft-delete (set `status = 'cancelled'`). `campaign_mode` is set on create and **cannot be changed** after the first launch (returns 409).
- [ ] Zod schema enforces:
  - `managed_send`: `subject`, `email_html`, `email_text` required; `require_otp` optional.
  - `link_per_recipient`: `subject`/`email_html`/`email_text` forbidden; `require_otp` optional. Must have at least one recipient imported before launch.
  - `link_universal`: same as `link_per_recipient` re email fields. No recipient list needed. `require_otp` optional.
- [ ] Template editor — **three paths based on `campaign_mode`**:
  - **Mode A (We Send It)**: email body editor (HTML + placeholder insert helper), plain-text alt body (required), page body editor (HTML), subject, preheader, optional expiry, `require_otp` toggle.
  - **Mode B (You Send It)**: page body editor (HTML) only, optional expiry, `require_otp` toggle. UI callout: _"You'll download a CSV of personalised links and send the email yourself. We personalise the landing page."_
  - **Mode C (Share Anywhere)**: page body editor (HTML) only, optional expiry, `require_otp` toggle. UI callout: _"One link for everyone — share it on WhatsApp, SMS, or anywhere. Everyone sees the same page."_ No placeholder insert helper (no per-recipient data).
- [ ] Placeholder insert helper: lists available fields (`{{email}}`, `{{first_name}}`, custom fields). Shown for page editor in Modes A/B only (Mode C has no recipient data to substitute).
- [ ] Preview endpoint (`GET /api/campaigns/:id/preview?recipientId=...`):
  - **Mode A**: renders email HTML + page HTML for a chosen recipient.
  - **Mode B**: renders page HTML only; email preview labelled N/A.
  - **Mode C**: renders page HTML only, with all `{{field}}` fallbacks applied (no recipient chosen).
  - All modes render a synthetic "all-fields-missing" version to surface unfallbacked placeholders.
- [ ] HTML sanitiser (`packages/core/sanitise`): applied on save to `email_html` (Mode A) and `page_html` (all modes).
- [ ] Test send (Mode A only): `ListmonkClient.sendTransactional` in `external` mode to the logged-in user's email.
- [ ] On every `page_html` save: insert a row into `campaign_page_versions`.

**Acceptance**

- Creating a `managed_send` campaign without `email_html` → 422.
- Creating a `link_per_recipient` campaign with `email_html` → 422 (field forbidden).
- Creating a `link_universal` campaign with `email_html` → 422.
- Changing `campaign_mode` after first launch → 409.
- Preview for a recipient with `first_name = null` shows the fallback defined in the template, not blank or `undefined`.
- Mode C preview renders page with all fallbacks; no error thrown for missing recipientId param.
- Saving `<script>alert(1)</script>` in `page_html` → sanitised to `&lt;script&gt;` in DB; automated test asserts this.
- Test send (Mode A) arrives in Mailpit with correct recipient data and a valid token-shaped landing URL.
- All `page_html` saves produce a row in `campaign_page_versions` (integration test).

---

### M4 — Launch and dispatch pipeline

**Tasks**

- [ ] Launch endpoint (`POST /api/campaigns/:id/launch`) — **branches on `campaign_mode`**:

  **Mode A (managed_send) — inside a single serialisable transaction:**

  - Gate: org `review_state` must be `approved`. If `pending` → 403 "Campaign pending manual review".
  - Gate: `daily_cap` enforcement. Cap eligible batch; remainder stays `pending` for next-day cron.
  - For each eligible recipient (not suppressed, `consent_status = 'granted'`, not `deleted_at`):
    - `newToken()` → `hashToken(raw)` → `encryptToken(raw, key)`.
    - Insert `messages` row (`token_hash`, `status = 'pending'`).
  - Set `campaign.status = 'launching'`.
  - After commit: enqueue one BullMQ job per message. `jobId = message.id`.
  - Discard raw tokens from memory after enqueue.

  **Mode B (link_per_recipient) — inside a single serialisable transaction:**

  - No `review_state` or `daily_cap` gates.
  - For each eligible recipient (same filters as Mode A):
    - `newToken()` → `hashToken(raw)` → store `token_hash` in `messages` row.
    - Build `landing_link = ${LINK_BASE_URL}/m/${rawToken}`, collect in memory.
  - Set `campaign.status = 'live'`.
  - After commit: stream `links_export.csv` (`email, first_name, landing_link`) to a signed temp file (`/tmp`; URL valid 1 h). Store URL in `campaigns.link_export_url` + `link_export_generated_at`.
  - Response: `{ exportUrl, expiresAt }`. UI shows download button with countdown.
  - No BullMQ jobs enqueued.
  - Re-generate endpoint: `POST /api/campaigns/:id/export-links` — rebuild CSV preserving existing tokens for already-viewed messages, generating fresh tokens for `pending` ones. Idempotent: return existing URL if `link_export_generated_at < 1 h ago`.

  **Mode C (link_universal) — inside a single serialisable transaction:**

  - No recipient list check (none needed).
  - `newToken()` → `hashToken(raw)` → write to `campaigns.universal_token_hash`.
  - Build `landing_link = ${LINK_BASE_URL}/m/${rawToken}` — this is the shared URL.
  - Set `campaign.status = 'live'`.
  - Response: `{ sharedUrl }`. UI shows a copy button + QR code preview.
  - No `messages` rows created. No BullMQ jobs.
  - Discard raw token immediately after building URL.

- [ ] Daily-cap overflow job (Mode A only): BullMQ repeatable job at 00:05 UTC finds `campaign_mode='managed_send'` campaigns in `launching` status with `pending` messages and enqueues next batch.
- [ ] BullMQ worker (`apps/worker`) — Mode A only:
  - Concurrency = `LISTMONK_DISPATCH_CONCURRENCY` (default 10).
  - Graceful shutdown: drain in-flight jobs ≤ 30 s on `SIGTERM`, then exit.
  - Per job: steps as defined in section 8.
  - Dead-letter: after 5 failures → `messages.status = 'failed'`, log `events` row.
- [ ] `daily_cap` race condition fix (Mode A only): `SELECT COUNT(*) ... FOR UPDATE` inside launch transaction.
- [ ] Re-launch guard (Modes A/B): `unique (campaign_id, recipient_id)` on `messages`. `jobId = message.id` for Mode A.
- [ ] Re-launch guard (Mode C): `universal_token_hash` already set → skip token generation, return existing `sharedUrl`.
- [ ] `List-Unsubscribe` headers (Mode A only): injected per RFC 8058 into every `/api/tx` call.

**Acceptance**

- **Mode A** — launch to 10 recipients, `daily_cap = 5` → 5 jobs enqueued, 5 `pending`, status `launching`.
- **Mode A** — re-launch twice → zero new messages, zero duplicate jobs.
- **Mode A** — kill worker after 3/10 jobs, restart → 7 dispatch with no duplicates.
- **Mode A** — staging: 100 recipients → 100 arrive in Mailpit, each unique landing URL.
- **Mode B** — launch to 50 recipients → zero BullMQ jobs, `links_export.csv` has 50 rows with unique `landing_link`, status `live`.
- **Mode B** — re-generate export → already-viewed rows keep same token; `pending` rows get new tokens.
- **Mode C** — launch → zero `messages` rows created, `universal_token_hash` set on campaign, `sharedUrl` returned, status `live`.
- **Mode C** — re-launch → no new token generated; same `sharedUrl` returned.

---

### M5 — Landing page and verified reads

**Tasks**

- [ ] Route `/m/[token]` (Next.js App Router, server component, no client JS by default).
      The route handles both per-recipient tokens (Modes A/B) and the universal campaign token (Mode C).
      Resolution order:

  1. Hash the token → query `messages where token_hash = $1` (Modes A/B path).
  2. If not found → query `campaigns where universal_token_hash = $1` (Mode C path).
  3. If neither found → serve `invalid` page; increment per-IP miss counter (rate limit).

  **Modes A/B path (message found):**

  - Evaluate expiry: `message.expires_at ?? campaign.expires_at`. If expired → `expired` page.
  - Evaluate status: if `bounced`, `complained`, `suppressed`, `failed` → `invalid` page (never reveal reason).
  - Retrieve latest `campaign_page_versions` row. Render `page_html` via `packages/core/render` with recipient `fields` + `first_name`.
  - Record landing page version ID in pending view event `meta`.

  **Mode C path (campaign found via universal_token_hash):**

  - Evaluate expiry: `campaign.expires_at`. If expired → `expired` page.
  - Retrieve latest `campaign_page_versions` row. Render `page_html` via `packages/core/render` with empty fields object (all `{{field}}` placeholders resolve to their fallbacks).
  - No per-person view event written. Increment `campaigns.universal_view_count` atomically (only if not a scanner hit).
  - No `pending_view` Redis entry. The beacon endpoint (`/api/track/view`) is not called for Mode C.

- [ ] Response headers on `/m/[token]`:
  - `Referrer-Policy: no-referrer`
  - `X-Robots-Tag: noindex, nofollow`
  - `Cache-Control: no-store`
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-ancestors 'none'`
  - No third-party script tags in the rendered HTML.
- [ ] Four static result pages (no personalised data): `invalid`, `expired`, `otp-required`, `error`. All look identical from the outside; only the copy differs.
- [ ] IP rate limiting via Redis sliding window: max 30 requests per IP per 10 minutes. On breach: 429, log event (no sensitive data in log). Shared Redis instance, key = `rl:ip:{sha256(ip)}`.
- [ ] Invalid-token rate limit: per-IP counter of `token_hash_not_found` misses. If ≥ 10 misses in 10 minutes from same IP → 429 for all subsequent requests from that IP for 30 minutes.
- [ ] `packages/core/tracking` — scanner/bot detection:
  - Bot UA list stored in `packages/core/tracking/bots.ts`: a curated, versioned array of UA substrings (covers major email security scanners: Barracuda, Proofpoint, Google Safe Browsing, Microsoft SafeLinks, Symantec, Mimecast, etc.). Can be updated without a schema migration.
  - `isScannerUA(userAgent: string): boolean` — checks UA against the list (case-insensitive substring match).
  - `isScannerTiming(deliveredAt: Date | null, sentAt: Date | null, requestAt: Date): boolean` — returns true if the request arrives within 10 seconds of `delivered_at` (or `sent_at` if `delivered_at` null).
  - A hit is a confirmed scanner if `isScannerUA || isScannerTiming`. Scanner hits produce zero DB writes.
- [ ] Verified-view recording:
  - Server side: when a non-scanner page request arrives, write a `pending_view` ephemeral entry in Redis (`pending_view:{messageId}`, TTL 60 s).
  - Client side (small inline `<script>` tag, no external deps): after 2 seconds of visibility (using `IntersectionObserver` + `setTimeout`), or on first user interaction (`click`, `keydown`, `scroll`), POST to `/api/track/view` with `{ messageId }`.
  - `/api/track/view`: verify the `pending_view` entry exists, then write `events(type='view')`, update `messages.first_viewed_at` (if null), increment `messages.view_count`. Idempotent — Redis key deleted on first confirmation.
  - Fallback for no-JS: if the client never fires the beacon within 60 s, no view is recorded. This is a deliberate decision (document in `DECISIONS.md`).

**Acceptance**

- Automated test: request with known bot UA (e.g. `Barracuda`) → page returns 200 (not 500) but zero `events` rows written, `view_count` unchanged.
- Automated test: request within 8 seconds of `sent_at` with a normal UA → zero view events (timing-based scanner filter).
- Automated test: simulated real-browser visit (beacon fires after 2 s) → exactly one `events(type='view')` row, `first_viewed_at` set, `view_count = 1`. Second beacon → `view_count = 2`, `first_viewed_at` unchanged.
- Automated test: wrong token → 200 response with `invalid` page content, zero DB writes, zero log lines containing the token value.
- Automated test: response headers on `/m/[token]` match the spec exactly.

---

### M6 — Webhooks, suppression, unsubscribe, results

> Webhooks, bounce/complaint rate alerts, and unsubscribe headers apply to **Managed Send** campaigns only.
> Suppression (manual) and the unsubscribe landing page apply to **both modes**.

**Tasks**

- [ ] Webhook endpoint (`POST /api/webhooks/listmonk`) — **Managed Send only**:
  - Verify HMAC-SHA256 signature against raw body using `EMAIL_WEBHOOK_SECRET`. Reject with 401 on failure; log attempt (no body content in log).
  - Dedupe by listmonk event ID (store in `events.meta.providerEventId`; unique constraint on `(message_id, meta->>'providerEventId')`).
  - Map `listmonk_message_id` → `messages.listmonk_message_id` to find the message row.
  - Handle event types:
    - `sent` → `messages.status = 'sent'`, `sent_at = now()`.
    - `delivered` → `messages.status = 'delivered'`, `delivered_at = now()`.
    - `hard_bounce` → `status = 'bounced'`, call `suppress(orgId, email, 'hard_bounce', 'hard')`, write event.
    - `soft_bounce` → write event only (do NOT suppress; mailbox-full is temporary).
    - `complaint` → `status = 'complained'`, call `suppress(orgId, email, 'complaint')`, write event, check rate alert.
    - `unsubscribe` → call `suppress(orgId, email, 'unsubscribe')`, write event.
- [ ] Complaint/bounce rate alert (Managed Send only):
  - After every `hard_bounce` or `complaint` event: query last 500 messages for the org that reached `sent` status. If complaint rate > 0.3% OR hard-bounce rate > 5%: set `organizations.review_state = 'suspended'`, stop all enqueued jobs for that org (BullMQ: pause org's queue partition), send notification email to org owner via listmonk `/api/tx`.
- [ ] Manual suppression (both modes): `POST /api/suppressions` — org owner can manually suppress an address with `reason = 'manual'`. Link-Only senders use this to honour unsubscribe requests they receive in their own mailer.
- [ ] Unsubscribe route (both modes):
  - `GET /unsubscribe?token=...` → show confirmation page with one-click POST button.
  - `POST /unsubscribe` (RFC 8058 `List-Unsubscribe=One-Click`): add suppression, return 200.
  - Both routes are on the public `LINK_BASE_URL` domain.
  - Token resolves to a `messages` row regardless of `send_mode`; suppression is written for the org.
- [ ] Results dashboard — **three views based on `campaign_mode`**:
  - **Mode A (managed_send)**: sent count, delivered, bounced (hard/soft), complaints, verified reads, reply count, action counts, per-recipient status timeline. Export as CSV.
  - **Mode B (link_per_recipient)**: link export date, total links generated, verified reads, reply count, action counts, per-recipient landing-engagement timeline. Delivery/bounce columns shown as "N/A — email sent externally". Export as CSV.
  - **Mode C (link_universal)**: shared link URL + QR code, total view count (`universal_view_count`), reply count (anonymous), action click counts. No per-person rows. Export as aggregate JSON only.

**Acceptance**

- **Mode A** — integration test: replay the same webhook payload twice → second call returns 200, zero new rows.
- **Mode A** — integration test: forged webhook (bad signature) → 401, zero DB changes.
- **Mode A** — integration test: hard-bounce → address in `suppressions`, subsequent Mode A launch skips that recipient.
- **Mode A** — integration test: soft-bounce → address NOT in `suppressions`, subsequent launch still sends.
- **Mode A** — integration test: complaint rate → 500 sent, 2 complaints (0.4%) → org `review_state = 'suspended'`, queue paused.
- **Mode B** — integration test: manual suppression added → subsequent Mode B launch excludes address from export CSV.
- **Mode C** — integration test: `/m/[universalToken]` request → `universal_view_count` increments; zero `messages` rows created; zero `events` rows written.
- **Mode C** — integration test: bot UA request to `/m/[universalToken]` → `universal_view_count` unchanged.
- Manual: one-click unsubscribe via `List-Unsubscribe` (Mode A campaign) → address in `suppressions`. Report result.

---

### M7 — Landing page actions: reply, RSVP, OTP

**Tasks**

- [ ] Reply box: `POST /api/messages/:id/reply` (from landing page). Rate-limited: max 3 replies per `message_id`. Stores to `replies`. Emails the campaign owner a notification (via listmonk `/api/tx`) with a link to the thread view. Notification is de-bounced: at most one notification per message per 5 minutes.
- [ ] Action blocks: sender embeds `data-action="rsvp-yes"`, `data-action="rsvp-no"`, `data-action="confirm"`, or `data-action="link"` elements in `page_html`. Client-side handler (small inline script) intercepts clicks and POSTs to `/api/messages/:id/action` with `{ block, value }`. Server writes `events(type='action', meta={block, value})`. Idempotent — an existing action event for the same `(message_id, block)` is overwritten (upsert on `meta` key).
- [ ] OTP gate (`require_otp = true`):
  - On first landing page load: do not render page content. Render OTP-request form.
  - `POST /api/messages/:id/otp/request`: generate 6-digit code, hash with SHA-256, store in `otp_codes` (upsert — replaces existing code for this message). Send via listmonk `/api/tx` to recipient's email. Expires 10 minutes from now.
  - `POST /api/messages/:id/otp/verify`:
    - If `locked_until` is set and `now() < locked_until` → 423 with unlock time.
    - Hash submitted code, compare with `timingSafeEqual`.
    - Wrong code: increment `attempts`. If `attempts >= 5`: set `locked_until = now() + 30 min`, write `events(type='otp_locked')`, return 423.
    - Correct code: delete `otp_codes` row, set a signed short-lived cookie (`otp_verified:{messageId}`, 1 h), redirect to the page content.
  - OTP lockout is per-message (not per-recipient). A re-sent message gets a fresh `otp_codes` row, which is an acceptable threat model (document in `DECISIONS.md`).
- [ ] Live page edit: `PATCH /api/campaigns/:id/page` — updates `campaigns.page_html` (sanitised), inserts `campaign_page_versions` row. All existing links render the new content immediately on next request (no cache).

**Acceptance**

- Integration test: 4th reply attempt on same message → 429.
- Integration test: OTP — 5 wrong codes → 423 `locked_until` set. Correct code on attempt 1 → cookie set, content renders. Expired code (`expires_at` in the past) → 422.
- Integration test: editing `page_html` via `PATCH` → next fetch of `/m/[token]` serves updated content; `campaign_page_versions` has 2 rows.
- Integration test: action block click → `events` row with correct `meta`. Second click for same block → event updated (upsert), not duplicated.

---

### M8 — Hardening and launch readiness

**Tasks**

- [ ] Sender safeguards:
  - Require `organizations.domain_verified_at` to be non-null before launching (DNS check via lookup, not just DB field). Endpoint: `POST /api/org/verify-domain` — queries SPF, DKIM (`_domainkey`), DMARC DNS records and sets `domain_verified_at` on success.
  - New org first campaign → `status = 'review'`; admin notification via listmonk `/api/tx`; admin approves via `POST /api/admin/campaigns/:id/approve`.
  - Keyword and link screening on `email_html` and `page_html`: block known phishing keywords list (maintained in a config file, not hardcoded).
- [ ] Full observability:
  - Sentry: error capture with scrubbing rules (strip `token`, `email`, `rawBody` from breadcrumbs and context).
  - Pino structured logs: every log line includes `orgId`, `campaignId`, `messageId` where relevant. Never includes `token` (raw or hash), `email` body content, or PII beyond `orgId`.
  - Prometheus metrics endpoint (`/api/metrics`): `queue_depth`, `send_rate_per_minute`, `bounce_rate`, `complaint_rate`, `landing_page_p95_latency`.
  - Alert: queue depth > 10 000 for > 5 minutes → PagerDuty/email notification.
- [ ] Data controls:
  - Per-org retention setting (`organizations.retention_days`).
  - `DELETE /api/recipients/:id` → GDPR soft-delete (null PII, set `deleted_at`, call listmonk subscriber delete API).
  - `GET /api/recipients/:id/export` → JSON dump of all data held for that recipient.
- [ ] Load test `/m/[token]`: k6 script — 200 RPS for 5 minutes. p95 < 300 ms. Document result in `RUNBOOK.md`.
- [ ] Backup and restore drill: documented in `RUNBOOK.md` with exact commands. Must be run at least once before M8 sign-off.
- [ ] End-to-end Playwright test (CI, uses Mailpit as mail sink): import CSV → create campaign → launch → wait for Mailpit to receive email → extract link → open link → beacon fires → verify view event → reply → verify results dashboard shows correct counts.

**Acceptance**

- Full Playwright E2E test passes in CI.
- Load test meets p95 < 300 ms target. Report numbers.
- Security checklist (section 10) fully ticked.
- Seed-list test: send to Gmail, Outlook, Yahoo, one corporate address → lands in inbox, not spam. Manual; report result.
- `RUNBOOK.md` covers: deploy, rollback, restore from backup, pause an org's sending, handle a complaint spike, rotate `TOKEN_ENCRYPTION_KEY`.

---

## 10. Security checklist (verify at M8 sign-off)

- [ ] Raw tokens never appear in the database, logs, error reports, Sentry, or Redis unencrypted.
- [ ] All merged template values are HTML-escaped; all sender-supplied HTML is sanitised through the allowlist.
- [ ] Every API query is scoped by `orgId` from the session (not request body).
- [ ] Landing route has: rate limiting (IP + miss counter), `no-store`, `no-referrer`, `noindex`, strict CSP.
- [ ] Webhook signature verified against raw body before any processing.
- [ ] OTP codes hashed (SHA-256), attempt-limited (5), expiring (10 min), lockout (30 min after 5 fails).
- [ ] `TOKEN_ENCRYPTION_KEY` and all secrets from environment only; none in the repo or client bundle.
- [ ] `pnpm audit` → zero high-severity findings.
- [ ] Database backups run and a restore has been tested and documented.
- [ ] Sentry scrubbing rules strip `token`, `email`, `rawBody` from all events.
- [ ] `import/no-cycle` ESLint rule passes (no circular deps between packages).
- [ ] Hard-bounce addresses are never sent to again in any later campaign (integration test).

---

## 11. Human checkpoints (stop and ask — do not proceed past these)

1. Buying/pointing the sending domain; adding SPF, DKIM, DMARC DNS records.
2. Creating the listmonk instance, configuring SMTP, creating the transactional template (get `LISTMONK_TX_TEMPLATE_ID`), and moving out of sandbox mode.
3. Generating `TOKEN_ENCRYPTION_KEY` (32 random bytes), `EMAIL_WEBHOOK_SECRET`, and `AUTH_SECRET` for production.
4. Choosing production hosting, secrets manager, and PgBouncer configuration.
5. Approving privacy policy, terms, and consent wording (GDPR/NDPA review).
6. Deciding default expiry, retention period, and daily caps for new organisations.
7. Any change that alters who receives email or at what rate.
8. Before the first real send to any real customer list.

---

## 12. Out of scope for v1

WhatsApp/SMS delivery, payments, data-visualisation pages, automated follow-up rules, team roles beyond owner, custom domains per customer, A/B testing, listmonk campaign (broadcast) mode integration, `phone` column on recipients.

Do not build or stub any of these unless explicitly asked.

---

## 13. Definition of done

- All milestones M0–M8 have their acceptance checks reported as passed.
- CI is green on the main branch.
- `RUNBOOK.md` covers: deploy, rollback, restore backup, pause org sending, handle complaint spike, rotate `TOKEN_ENCRYPTION_KEY`.
- `DECISIONS.md` lists every assumption made during implementation.
- A human has completed all section 11 checkpoints and approved the first live send.

---

## 14. Milestone report format

After each milestone, post:

```
Milestone: Mx
Done:
  - <bullet per task>
Acceptance checks:
  - <check> → PASS | FAIL | MANUAL-PENDING (how verified)
Assumptions added to DECISIONS.md:
  - <list or none>
Blocked / need human:
  - <list or none>
Next: Mx+1
```

---

## 15. Kickoff

> Read AGENT_PLAN.md completely. Confirm the operating rules in section 2. Begin at M0.
> Do not proceed to M1 until M0 acceptance checks are reported as passed.
> Stop and ask at every section 11 checkpoint.
