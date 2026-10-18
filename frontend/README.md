# Gatewise frontend

React, TypeScript, Vite, and shadcn/ui. All workspace records come from the NestJS API. There are no sample records, local data persistence, or role switchers.

## Run locally

1. Set up the API and MongoDB replica set following `../backend/README.md`. Create your first administrator with `npm run bootstrap-admin` using `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` environment variables. The administrator creates staff and receptionist accounts.
2. Run `pnpm install --frozen-lockfile` in this directory.
3. Copy `.env.example` to `.env.local`. Change `VITE_API_URL` when needed; the default is `http://localhost:4000/api/v1`.
4. Run `pnpm dev` and open `http://localhost:3000`.

Set backend `FRONTEND_ORIGIN` and `CORS_ORIGINS` to `http://localhost:3000`. Set `RESET_PASSWORD_BASE_URL=http://localhost:3000/reset-password`. Run the backend worker and SMTP service to deliver account setup/recovery emails and notifications. Local Mailpit is at `http://localhost:8025`.

Vite embeds `VITE_API_URL` at build time. Restart the development server after editing environment settings, or rebuild for deployment. This URL is public and must not contain secrets. For deployment use the same HTTPS site for frontend and API, with `VITE_API_URL=/api/v1`, or configure HTTPS origins and cookie hosting appropriately.

## Permissions and sessions

- **Receptionist:** visitor directory, walk-in registration, invitation lookup, arrival, check-in, checkout, occupancy, and history.
- **Staff:** their own invitations, visitors, visit history, and walk-in approval/rejection. Cannot access administration or check visitors in/out.
- **Admin:** workspace operations plus users, departments, blacklist, audit, reports, and organization settings.

Every role can edit their profile, change their password, read their own notifications, and view organization preferences. Password setup/recovery links open `/reset-password#token=…`.

Access tokens are held in memory. Session restoration uses the backend's rotating HttpOnly cookie. Logout revokes the session. Role and ownership checks run on the server, and visit action buttons follow the API's allowed actions and admission eligibility. Writes use server versions, with conflict refresh and error feedback. Workspace data refreshes every 30 seconds while visible. List loading follows every backend page so local filters and exports do not silently omit records after the first page.

Active invitations are emailed automatically by the backend worker with calendar attachments. The existing sharing panel supports manual copy/print and displays email queue status; “Resend invitation email” queues another email. Visitors without an email retain manual sharing. Dates and timestamps display as `YYYY-MM-DD H:mm` in Africa/Lagos. See [email automation](../backend/EMAIL_AUTOMATION.md) for SMTP, reminder and daily report configuration.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm build
# Start isolated MongoDB on :27028 with --replSet vms-test before integration tests.
npm run test:e2e --prefix ../backend
pnpm exec playwright install chromium
pnpm test:browser
```

Browser tests start isolated API/frontend servers on ports 4010/3010 and use only `vms_ui_test`. The backend fixture resets that test database and creates test accounts; these accounts and records never appear in the normal app. Never point test fixtures at a production database.

See [TESTING.md](TESTING.md) for the verified scenarios, results, and remaining non-blocking notices.
