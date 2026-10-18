# Email automation

Run `npm run migrate` with migration credentials after deploying this change to
create the queue lookup and pending-approval indexes. Build/restart the API and
worker; the API alone does not deliver email or schedule reminders. Configure
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, optional SMTP credentials and `MAIL_FROM`
on the worker. `FRONTEND_ORIGIN` supplies the staff sign-in URL in approval mail.
No SMS or WhatsApp integration is included.

## Behavior and defaults

- Creating an active invitation or activating a draft queues an invitation email
  when the visitor has an email address. Drafts are never emailed. Phone-only
  visitors can still be registered and their invitation codes shared manually.
- Editing an active invitation queues updated details. Cancelling an active
  invitation queues a cancellation email. Each includes a `.ics` attachment with
  a stable event UID and increasing sequence so calendars can recognize updates.
  Import/update behavior depends on the recipient's calendar application.
- A visitor gets one reminder per arrival schedule during the 60 minutes before
  arrival. Reminders are skipped after arrival, admission, cancellation, expiry,
  or a schedule change. A changed schedule can generate a new reminder.
- Pending walk-ins get a host email and in-app reminder after 5 minutes at
  reception. After 15 minutes, all active administrators receive an email and
  in-app escalation alert. This does not change approval permissions. Each
  recipient gets one reminder/escalation per request; these are not repeated
  every five minutes. Decided/expired requests are checked again before delivery.
- Every day at or after 8:00 WAT, each active administrator gets six aggregate CSV
  reports for the previous Africa/Lagos day: daily visitors, by department,
  by host, by company, average duration, and peak hours. There is no visitor
  identity/history attachment. Counts use actual check-ins; average duration
  follows the existing report rules. Recipient role/status is rechecked before
  sending. Empty reports are still sent. Restarting after the delivery hour
  schedules that day's reports; missed days are not backfilled.

Configure the defaults in the worker environment (restart to apply):

| Variable | Default |
| --- | --- |
| `EMAIL_AUTOMATION_ENABLED` | `true` |
| `VISIT_REMINDER_MINUTES` | `60` |
| `APPROVAL_REMINDER_MINUTES` | `5` |
| `APPROVAL_ESCALATION_MINUTES` | `15` |
| `REPORT_EMAILS_ENABLED` | `true` |
| `REPORT_EMAIL_HOUR` | `8` |

Boolean flags accept `true`/`false`. Minute values are positive integers;
 escalation must follow the host reminder. Report hour is 0–23. Keep
`EMAIL_AUTOMATION_ENABLED` consistent on API and worker. Disabled automation
suppresses operational emails and scheduled approval notifications; authentication
emails and ordinary workflow notifications remain available.

## Queue and frontend contract

Invitation creation/activation/update/resend queues emails in the same database
transaction as the command. A resend uses the existing idempotency/version rules.
`GET /invitations/:id/share` and `POST /invitations/:id/resend` return the invitation
code/QR identifiers plus `deliveryMode: EMAIL | MANUAL` and a delivery status:

- `QUEUED`: pending/processing, including transient failures being retried.
- `SENT`: SMTP accepted the message; this is not an inbox delivery receipt.
- `FAILED`: ten delivery attempts failed.
- `SKIPPED`: the latest queued message was no longer applicable.
- `DRAFT`, `NO_EMAIL`, `DISABLED`, `NOT_QUEUED`: no send was queued for that reason.

Manual copy/print remains available. The existing sharing panel shows delivery
status; its resend action requests an email. Opening the panel does not send mail.
Existing invitations are not bulk emailed when automation is enabled; they can
be resent individually and are eligible for upcoming-visit reminders.

Stable event IDs and a unique queue index deduplicate scheduler scans across
workers. The worker renews delivery leases and retries with exponential backoff.
SMTP remains at least once: a crash after SMTP accepts but before database
confirmation can cause a duplicate. Stable Message-ID helps downstream handling.
Processed payloads are erased. Failed events retain the existing operator requeue
workflow; intentional invitation resends create a new event.

Dates displayed in the app, emails (including account setup/reset expiry) and CSV
exports use `YYYY-MM-DD H:mm`, e.g. `2026-10-18 9:30`, in Africa/Lagos. An instant
of `2026-10-18T08:30:00.000Z` therefore displays as `2026-10-18 9:30` WAT.
API/storage timestamps retain ISO instants and calendar attachments retain RFC
5545 timestamps so parsing, time zones and calendar interoperability keep working.

## Verification — 18 October 2026

- Backend build and 103 unit tests passed.
- 34 MongoDB replica-set integration tests passed, with SMTP mocked. Coverage
  includes transactional invitation queueing, drafts/activation, phone-only
  guests, resend idempotency, concurrent scheduler scans, successful host/admin
  reminder rendering, stale reminder suppression, report recipient authorization
  and retry recovery.
- Frontend type checks, lint (existing warnings), production build and all 10
  browser workflow tests passed, including invitation status/resend and date display.
- Delivery through a production SMTP provider/inbox was not exercised.
