# Northstar VMS backend

NestJS/TypeScript REST API, MongoDB/Mongoose replica-set transactions, Passport JWT,
Argon2id, durable notifications, immutable application audit APIs and separate worker.
The React/Vite frontend remains independently deployable in `../frontend`.

## Local setup

Requires Node 24, npm, and Docker Compose (or an existing MongoDB replica set).
Run these commands from `backend`:

```sh
npm ci
npm run setup:dev
# Starts only local database and SMTP inbox; no production deployment.
docker compose up -d mongo mongo-init mailpit
npm run migrate
```

`setup:dev` creates random local encryption keys and a 3072-bit RSA key pair. It
refuses to overwrite an existing `.env` or keys. For an existing replica set,
change `MONGODB_URI` in `.env`; a standalone MongoDB server is not supported.
The Compose replica advertises `mongo:27017`. Host-run API connections use
`directConnection=true`; API/worker containers connect using `mongo` directly.

Create demo accounts only in `vms_dev`/`vms_test` using a password you choose:

```sh
read -s SEED_PASSWORD
export SEED_PASSWORD
npm run seed
unset SEED_PASSWORD
```

Seed emails: `admin@example.test`, `reception@example.test`, `staff@example.test`,
`staff2@example.test`. Their password is the value you supplied. No credentials
are production defaults. Seed refuses a populated users collection.

Start in separate terminals:

```sh
npm start                 # API :4000 (run npm run build after source changes)
npm run worker            # Outbox delivery and visit expiry
```

In `frontend`, run `pnpm install --frozen-lockfile` then `pnpm dev`. Set
`VITE_API_URL` in `frontend/.env.local` (default `http://localhost:4000/api/v1`).
No browser token is persisted. See `../frontend/README.md` for UI setup and testing.
Swagger: `http://localhost:4000/api/docs`. Mailpit inbox: `http://localhost:8025`.
Use browser origin `http://localhost:3000` consistently for cookie authentication.

## Production bootstrap and deployment

1. Supply validated environment configuration using `.env.example` as a reference.
2. Use a managed/authenticated replica set and TLS; do not expose MongoDB publicly.
3. Run `node dist/scripts/migrate.js` with a **migration** database credential.
4. Run `node dist/scripts/bootstrap-admin.js` once with `BOOTSTRAP_ADMIN_EMAIL`
   and a secret `BOOTSTRAP_ADMIN_PASSWORD` (12–128 characters), supplied by your
   secret manager, not command-line arguments or committed files.
5. Provision the restricted application MongoDB role using `deploy/mongo-role.js`.
   Migrations/bootstrap use a separate credential. Application access to
   `auditLogs` is insert/find only. Do not additionally grant broad `readWrite`.
6. Build `docker build -t vms-backend .`; run separate API and worker containers
   from that image. Mount keys read-only, set `NODE_ENV=production`, configure SMTP,
   HTTPS frontend/reset origins and a random `READINESS_TOKEN`.
7. Route `/api/v1` to the API at the frontend origin. Configure exact proxy hops.
   Readiness requires `X-Readiness-Token` in production; liveness is public.

The bundled Compose file is **local development only**: MongoDB has no auth and
binds its published port to loopback. The optional `app` profile runs API/worker
with local `.env` configuration. It does not automatically migrate or seed.
Production Swagger is disabled. No code deploys or seeds production automatically.

## API conventions

- JSON success: `{ data, meta: { requestId } }`; lists include page, limit, total,
  totalPages. JSON errors: `{ error: { code, message, details? }, meta }`.
- `/api/v1`, page 1 / limit 20; maximum limit 100 and page 10,000.
- Dates are UTC instants. Reporting/day boundaries use `Africa/Lagos`.
- Explicit offsets required for scheduled instants. Arrival window opens 30
  minutes early by default, closes at expected departure. No automatic checkout.
- IDs ending in `Id` are ObjectId references, except the public `Visitor.visitorId`.
- `Idempotency-Key` (8–100 URL-safe characters) required on invitation/request
  creation and workflow POST commands. Keep the key when retrying an uncertain
  network response. A changed request needs a new key. Records live 24 hours.
- Mutations use `version`. For invitation/request workflow commands, send the
  nested **visit.version**, not the invitation/request document version.
- Identity and role come from the verified session. Staff ownership applies to
  records, search, counts, dashboards and exports. Receptionists cannot approve.
- All user/departments/visitors deletion is disable/archive, preserving history.
- Visitor email/phone are not unique; explicitly select a returning visitor.
- Every guest gets an individual visit; `primaryVisitId` groups people but does
  not propagate check-in/checkout/approval. Group schedules cannot be edited;
  cancel/recreate if a grouped appointment must move.
- Active invitations queue email delivery with calendar attachments; drafts and
  visitors without email retain manual sharing. Queue acceptance is not an inbox
  delivery receipt. See [email automation](EMAIL_AUTOMATION.md). QR payloads identify records and never authorize admission.
- Search supports indexed prefixes plus exact invitation/QR identifiers, not
  arbitrary substring matching. Broad admission searches require narrowing.
- CSV exports use the same permissions and neutralize spreadsheet formulas.
  Limit: 100,000 rows; historical reports: at most 366 days per request.

## Authentication

10-minute RS256 access JWT; verified account/session loaded for every request.
Refresh tokens are opaque, hashed, rotated, HttpOnly and SameSite=Lax. Production
cookies are Secure. Session absolute lifetime is seven days; refresh idle lifetime
is 24 hours. Reuse revokes the session family, including outstanding access tokens.
Browser login/refresh/logout require an allowed Origin and `X-VMS-Client: web`.
The frontend serializes refreshes using Web Locks, and retains access tokens only
in memory. A refresh response lost after rotation requires signing in again.

Admin-created accounts get setup emails (24-hour tokens). Password resets expire
in 30 minutes; tokens are hashed in storage, single-use, and revoke sessions.
Password email outbox payloads are encrypted and erased after processing.
PII identity values use a separate AES-256-GCM key and are omitted from API output.
Encryption key rotation currently requires a controlled decrypt/re-encrypt
migration; never replace a key without migrating existing ciphertext.

## Worker, consistency and audit

Business commands transactionally update visits, linked records, audit logs,
idempotency records and outbox events. Conditional versions and a partial unique
index prevent invalid transitions and simultaneous occupancy for one person.
Blacklist/admission and host/department changes share write-conflict documents.

Run at least one worker. Leases permit multiple workers and crash recovery.
The worker also schedules visitor reminders, host approval reminders, admin
escalations and daily aggregate report emails. See [configuration and delivery
semantics](EMAIL_AUTOMATION.md). In-app delivery is deduplicated; SMTP delivery is at least once and can repeat
following a crash after send. Stable Message-ID assists downstream deduplication.
Ten unsuccessful attempts mark an event FAILED; monitor readiness counts/logs
and use an operator database action to requeue after fixing the underlying cause.
Expiry is checked in commands and by the minute worker; checked-in visits persist.

Audit APIs are read-only. Successful mutation audit failures abort transactions.
Logs do not include request bodies, cookies, tokens or full identification values.
No operational-history deletion/retention job is enabled. Define a retention
policy before introducing deletion, and retain backups according to that policy.

## Verification

```sh
npm run build
npm test
# Start an isolated replica set named vms-test on 127.0.0.1:27028 first.
# The suite initializes it and DROPS only the vms_test database.
npm run test:e2e
npm run openapi
npm run generate:client
```

Browser verification (after the API build and test replica are available):

```sh
cd ../frontend
npx playwright install chromium
npm run test:browser
```

On macOS, an installed Chrome can be used with `PLAYWRIGHT_CHROME_PATH` instead
of downloading Chromium. Browser fixtures use only `vms_ui_test`, port 4010 for
the API and port 3010 for Next.js. They recreate that isolated fixture database.
The backend uses npm; the current Gatewise frontend uses its pnpm lockfile.
See frontend/README.md for browser verification and installation.

The integration suite uses real replica-set transactions, role/ownership checks,
workflow races, rollback, blacklist admission, replay protection, password setup,
notifications, CSV and reporting. It generates `openapi.json`. Tests never target
production and reject any test database name other than `vms_test`.

Before production rollout, verify backups by restoring a snapshot into an isolated
replica set; run health and workflow smoke checks there. Monitor API error rate,
latency, outbox oldest pending age/failed count and MongoDB resources. The repository
provides configuration and tests; it does not claim a production deployment or a
completed production backup/restore exercise.

## Frontend scope

Connected: authentication, dashboards, visitor tables/history/search, returning
visitor registration, host selection, invitations, decisions, arrival/check-in/
checkout/cancellation, notification read state, occupancy, exports, profile and
password change. Admin management, reports, settings, blacklist, audit, and supporting pages
are now connected in the Gatewise frontend. Photo capture/uploads are deferred.

## Latest local verification — 29 September 2026

- Backend TypeScript build: passed.
- Jest unit tests: 95 passed.
- API/replica-set integration tests: 28 passed.
- Chrome browser tests: 2 passed (registration/approval/admission/checkout/logout,
  plus reset-link handling).
- Frontend production build and TypeScript checks: passed.
- Docker Compose configuration: validated.

Database tests ran against local MongoDB 6.0.20. The supplied MongoDB 8.0 Docker
image, production SMTP delivery, and production backup/restore have not been
executed in this workspace; the Docker daemon was stopped. Production deployment
is not claimed by these historical checks. See frontend/README.md for current checks.
