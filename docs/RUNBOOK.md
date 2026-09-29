# RUNBOOK.md

Operational procedures for the Campaign Messaging platform.
**Updated incrementally** — each milestone adds its relevant section.

---

## Table of contents

1. [Local development setup](#1-local-development-setup)
2. [CI / CD](#2-ci--cd)
3. [Deploy](#3-deploy) *(M8)*
4. [Rollback](#4-rollback) *(M8)*
5. [Database backup and restore](#5-database-backup-and-restore) *(M8)*
6. [Pause an org's sending](#6-pause-an-orgs-sending) *(M4)*
7. [Handle a complaint spike](#7-handle-a-complaint-spike) *(M6)*
8. [Rotate TOKEN_ENCRYPTION_KEY](#8-rotate-token_encryption_key) *(M8)*

---

## 1. Local development setup

### Prerequisites
- Node.js ≥ 20, pnpm ≥ 9
- Docker + Docker Compose

### Steps
```bash
# 1. Clone and install
pnpm install

# 2. Copy env file and fill in values
cp .env.example .env

# 3. Start all services
docker compose up -d

# 4. Run database migrations
pnpm --filter @campaign/db db:migrate

# 5. Start the web app
pnpm --filter @campaign/web dev

# 6. Start the worker (separate terminal)
pnpm --filter @campaign/worker start
```

### Service URLs
| Service | URL |
|---------|-----|
| Web app | http://localhost:3000 |
| Health check | http://localhost:3000/api/health |
| listmonk | http://localhost:9000 |
| Mailpit (email UI) | http://localhost:8025 |
| Postgres | localhost:5432 |
| PgBouncer | localhost:5433 |
| Redis | localhost:6379 |

---

## 2. CI / CD

GitHub Actions runs on every push and pull request:
1. `pnpm install`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test` (unit)
5. Integration tests (requires test DB — see workflow file)

CI badge: see `.github/workflows/ci.yml`.

---

## 3. Deploy

### Production Deployment Steps
1. **Database Migration**:
   ```bash
   pnpm --filter @campaign/db db:migrate
   ```
2. **Build and start Next.js application**:
   ```bash
   pnpm --filter @campaign/web build
   pnpm --filter @campaign/web start
   ```
3. **Start BullMQ Worker process**:
   ```bash
   pnpm --filter @campaign/worker start
   ```
4. **Health Check verification**:
   ```bash
   curl -f http://localhost:3000/api/health
   curl -f http://localhost:3000/api/metrics
   ```

---

## 4. Rollback

### Application and Migration Rollback
1. Revert application deployment to previous git commit / container image.
2. If schema rollback is needed:
   ```bash
   pnpm --filter @campaign/db db:rollback
   ```
3. Restart worker instances to flush any stale in-memory jobs.

---

## 5. Database backup and restore

### Backup
```bash
pg_dump -h localhost -p 5432 -U postgres -d campaign_messaging -F c -b -v -f backup_$(date +%Y%m%d_%H%M%S).dump
```

### Restore
```bash
pg_restore -h localhost -p 5432 -U postgres -d campaign_messaging -v --clean backup_TIMESTAMP.dump
```

---

## 6. Pause an org's sending

To immediately halt Mode A sending for a specific organization:
```sql
UPDATE organizations
SET review_state = 'suspended'
WHERE id = '<ORG_UUID>';
```
The BullMQ dispatch worker checks `organizations.review_state` and will skip jobs for suspended organizations.

To resume:
```sql
UPDATE organizations
SET review_state = 'approved'
WHERE id = '<ORG_UUID>';
```

---

## 7. Handle a complaint spike

When complaint rate exceeds 0.3% or hard-bounce rate exceeds 5%:
1. The webhook handler automatically transitions the org's `review_state` to `suspended`.
2. Inspect the complaint / bounce audit log:
   ```sql
   SELECT e.type, e.meta, e.created_at, r.email
   FROM events e
   JOIN messages m ON e.message_id = m.id
   JOIN recipients r ON m.recipient_id = r.id
   JOIN campaigns c ON m.campaign_id = c.id
   WHERE c.org_id = '<ORG_UUID>' AND e.type IN ('complained', 'bounced')
   ORDER BY e.created_at DESC
   LIMIT 50;
   ```
3. Confirm complaints are suppressed in `suppressions` table.
4. Contact org owner to review recipient list source and consent declarations.
5. Re-approve org via admin endpoint or SQL once resolved.

---

## 8. Rotate TOKEN_ENCRYPTION_KEY

`TOKEN_ENCRYPTION_KEY` is a 32-byte (256-bit) base64-encoded key used to encrypt raw tokens while in BullMQ queues:
1. Drain all pending jobs in BullMQ (or allow in-flight dispatch to complete).
2. Generate a new 32-byte key:
   ```bash
   openssl rand -base64 32
   ```
3. Update `TOKEN_ENCRYPTION_KEY` in environment variables.
4. Restart web application and worker processes.
5. Note: Active landing page visits authenticate via `token_hash` stored in Postgres, so rotating `TOKEN_ENCRYPTION_KEY` does not invalidate existing published landing page links!
