# Campaign Messaging Platform

A high-deliverability confidential email teaser, dynamic personalized landing page, and two-way recipient communication engine.

---

## 1. System Overview & Core Capabilities

The Campaign Messaging platform addresses low email deliverability and cold inbox fatigue by decoupling the **teaser notification** from the **content payload**:

1. **Confidential Intro Email:** Dispatches a minimalist, clean notification email to the recipient's inbox containing personal greeting variables (`{{first_name}}`, `{{sex}}`) and a high-converting CTA button.
2. **Private Dynamic Landing Page (`/m/[token]`):** The recipient clicks the secure single-use or scoped link to open an interactive, beautifully styled web briefing page personalized with their attributes.
3. **Two-Way Reply Box:** Recipients can respond directly from the landing page. Senders receive responses in a unified real-time inbox with 1-click export to CSV.
4. **WhatsApp & Public Broadcast Mode:** When recipient details are unknown beforehand, creators generate a single public broadcast link for WhatsApp groups, communities, or public channels. Visitors can view the update and, if replies are enabled, submit replies with their Name and Email.
5. **Fulfillment Modes:**
   - **Platform Managed Dispatch:** Dispatched via transactional email queues (BullMQ + Redis + Listmonk).
   - **External CSV Export:** Senders download a personalized CSV with columns `email,first_name,sex,landing_link` to dispatch through external CRMs, sales automations, or direct messaging.

---

## 2. Authentication & New User Onboarding Lifecycle

### A. How Authentication Works in Development & Production

The platform uses **Auth.js v5 (NextAuth)** with a custom Drizzle database adapter (`apps/web/src/auth.ts`):

- **Strategy:** Rotating database sessions stored in PostgreSQL (`auth_sessions`). Sessions expire after 24 hours and rotate tokens on every authenticated request for replay resistance.
- **Provider:** Passwordless Magic Link via Nodemailer.
  - In local development, outbound emails land in **Mailpit** (SMTP: `localhost:1025`, Web UI: `http://localhost:8025`).

### B. First-Time User Registration & Auto-Provisioning

When a new user signs in for the first time:

1. They visit `/auth/signin` and enter their work email (e.g. `alex@company.com`).
2. Auth.js emits a verification email containing a cryptographic sign-in URL.
3. Clicking the link triggers the `createUser` lifecycle event in `auth.ts`.
4. In an atomic PostgreSQL transaction:
   - Derives the **Organization Name** from their domain (e.g. `company.com` -> `Company`).
   - Creates a new record in `organizations` with `review_state: "pending"`, `plan: "trial"`, and `daily_cap: 500`.
   - Creates a new record in `users` with `role: "owner"`, binding the user to the newly created organization.
   - Creates the `auth_users` and `auth_sessions` records.

### C. Rapid Development Login Bypass

For automated testing and instantaneous dev access without checking Mailpit:

- Route: `GET /api/auth/dev-login` (or `GET /api/auth/dev-login?email=custom@example.com`)
- Reads or provisions the seeded admin user (`admin@campaign.local`), issues an active session token (`dev_session_token_campaign_2026`), sets the `authjs.session-token` cookie, and immediately redirects into the **Campaign Studio** at `/`.

---

## 3. Database Schema & Data Models

- **`organizations`**: Multi-tenant containers. Tracks custom sending domains, SPF/DKIM verification timestamps, daily sending caps, and approval status.
- **`users`**: Tenant memberships with roles (`owner`, `admin`, `member`).
- **`campaigns`**: Campaign records with `campaign_mode` (`managed_send`, `link_per_recipient`, `link_universal`), `subject`, `intro_teaser`, `button_text`, `landing_content`, and `allow_replies`.
- **`recipients`**: Audience contacts with `email`, `first_name`, `sex`, and custom JSONB fields.
- **`messages`**: Per-recipient campaign delivery records. Stores SHA-256 hashes of private landing tokens (never raw tokens).
- **`replies`**: Dual-mode reply storage. Linked to a `message_id` for authenticated individual recipients, or to a `campaign_id` with `author_name` and `author_email` for public WhatsApp broadcast respondents.
- **`otp_codes`**: Optional PIN protection for landing pages. Includes attempt limits and lockouts, with automatic 15-minute background purging for expired codes.

---

## 4. UI/UX Design System & Aesthetics

- **Theme & Palette:**
  - Background canvas: Deep Obsidian (`#0a0f1d`, `#111827`)
  - Elevated surfaces: Slate panels (`#182234`, `#1f2937`) with 1px hairline borders (`#374151`)
  - Accent Primary: Indigo Gradient (`#4f46e5` to `#3b82f6`)
  - Success / Active states: Emerald (`#10b981`, `#059669`)
  - WhatsApp Broadcast badge: Forest (`#25d366`, `#064e3b`)
- **Key Interface Components:**
  - **Campaign Studio Stepper:** 5-step guided wizard (Audience & Mode -> Compose & Variables -> Live Preview -> Export & Send -> Replies & Inbox).
  - **Interactive Variable Pill Bar:** 1-click token injection for `{{first_name}}`, `{{sex}}`, and fallback syntax `{{sex|friend}}`.
  - **Subject Line Counter & Truncation Guard:** Real-time indicator alerting senders if subject exceeds 60 characters for mobile inboxes.
  - **Dual Viewport Preview:** Live toggle between Desktop and a 375px Smartphone simulator with speaker notch and inner scrolling.
  - **Two-Way Inbox & CSV Export:** Real-time reply monitoring with 1-click RFC-4180 compliant CSV export.

---

## 5. Security Invariants

1. **Zero Raw Token Persistence:** Private landing tokens are 128-bit cryptographically secure random values. Only their SHA-256 hash is stored in the database.
2. **Encrypted Queue Payloads:** Tokens in BullMQ / Redis queues are encrypted via AES-256-GCM using `TOKEN_ENCRYPTION_KEY`.
3. **Sliding Window Rate Limiting:** Public reply endpoints enforce sliding window rate limiting (5 replies / 10 minutes per IP) via Redis.
4. **Header Hardening:** Landing pages and unsubscribe routes enforce `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `X-Robots-Tag: noindex, nofollow`.
