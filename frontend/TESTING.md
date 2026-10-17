# Integration verification — 17 October 2026

Verified locally using an isolated MongoDB replica set, real NestJS APIs, and Playwright Chromium. Test data lives in `vms_test` and `vms_ui_test`, separate from the normal application database.

- Backend build: passed.
- Backend unit tests: 95 passed.
- Backend API integration tests: 28 passed.
- Frontend TypeScript checks: passed.
- Frontend production build: passed.
- Frontend ESLint: passed, with seven non-blocking Fast Refresh warnings from mixed component/helper exports.
- Browser verification: ten scenarios passed across the full workflow run and targeted reruns after fixing test selectors.

Browser scenarios cover credential errors, session restoration and logout revocation; receptionist/staff navigation restrictions and direct-page protection; walk-in registration → staff approval → reception check-in and checkout; staff draft invitation creation, editing, activation, and sharing; admin departments, visitors, archive/restore, blacklist/lift, preferences, audit, reports and CSV download; user creation/editing/disabling and notification reads; failed writes preserving forms without false success; records beyond the first API page and access-token renewal; recovery privacy and invalid reset links; and password changes followed by login with the new password.

Backend integration tests additionally verify server-enforced role and ownership boundaries, concurrency/version conflicts, idempotency, admission rules, notification ownership, and authentication lifecycle behavior. Browser tests reset rate-limit buckets between independent scenarios using a test-only utility; production rate limiting is unchanged.

The build still reports a large JavaScript chunk and existing toolchain deprecation/browser-data notices. These do not prevent the build or tests from passing. Email delivery requires the backend worker and configured SMTP service. Browser fixtures never send external mail. Invitations use the backend's manual-sharing mode.

Run commands and service requirements are documented in [README.md](README.md).
