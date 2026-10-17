# Gatewise VMS — frontend build brief

Prepared from the backend source on 15 October 2026. This is a frontend handoff, not a production deployment certification. Endpoint paths below have the prefix `/api/v1`.

## Prompt to give Vercel / v0

Build a polished, responsive Visitor Management System called Gatewise using the existing Next.js/React/TypeScript frontend and NestJS REST backend. Inspect the attached source and API contract before implementing. The repository already has an API-connected frontend: preserve and reuse its authentication, API client, error handling, and workflow behavior while improving the interface.

Use this brief as the functional specification. Build three distinct workspaces for ADMIN, RECEPTIONIST, and STAFF. Read the actual signed-in user from the API; roles are assigned by administrators. Role selection must never grant access. The backend is authoritative for permissions, ownership, action availability, admission eligibility, and all operational data.

Design a professional operations interface with a collapsible sidebar, clear page titles, restrained indigo accents, readable status badges, searchable tables, useful filters, responsive mobile cards, detail drawers or pages, and accessible forms. Prioritize speed for receptionists, approvals and scheduling for staff, and oversight for administrators. Use real API responses. Show honest empty, loading, error, permission-denied, expired-session, and conflict states. Never replace failed API requests with fake records or claim an action succeeded before the server confirms it.

Implement the features, role rules, workflows, and integration requirements below. Deliver working pages and a short setup guide listing environment configuration and any remaining backend gaps. Keep unsupported future features out of the active navigation.

## 1. Roles and navigation

| Capability | Admin | Receptionist | Staff / host |
| --- | --- | --- | --- |
| Dashboard | Organization totals and analytics | Reception operations | Own visitors and requests |
| Visitor directory and history | Organization-wide | Organization-wide | Visitors associated with own visits |
| Create/edit/archive visitor profiles | Yes | Yes | Create new person as part of own invitation; no standalone profile management |
| Register walk-in request | Yes | Yes | No |
| Create, edit, activate, share invitations | For staff hosts | No; can view invitations | Own invitations |
| Approve/reject walk-in requests | Yes | No | Own requests |
| Record arrival, check-in, checkout | Yes | Yes | No |
| Cancel visits | When workflow allows | Eligible walk-ins | Own eligible invitations |
| Occupancy / currently inside | Organization-wide | Organization-wide | Own currently meeting metric and own visit list |
| Historical visit export | Organization-wide | Organization-wide | Own history |
| Aggregate analytics reports | Yes | No | No |
| Users, roles, department management | Yes | No | No |
| Blacklist | Add, view, lift | Admission check only | No blacklist management |
| Audit history | Read-only | No | No |
| Organization settings | Edit | Safe client settings only | Safe client settings only |
| Notifications, profile, password | Own | Own | Own |

Suggested sidebars:

- **Admin:** Overview, Visits, Visitors, Invitations, Requests, Occupancy, Reports, Users, Departments, Blacklist, Audit logs, Settings.
- **Receptionist:** Reception dashboard, Register walk-in, Find invitation, Today's visits, Expected arrivals, Waiting visitors, Occupancy, Visitors, History.
- **Staff:** My dashboard, My invitations, Create invitation, Approval inbox, My visitors, My history.
- **Shared:** Notification bell, Profile, Change password, Logout.

These are presentation choices. Page access and individual controls must respect the matrix and API responses.

## 2. Dashboard features backed by real responses

`GET /dashboard/admin`, `/dashboard/receptionist`, `/dashboard/staff` return a dashboard object inside `data`.

- Admin/reception metrics: visitors checked in today, currently inside, expected visitors, pending approvals, checked out today, walk-ins registered today.
- Admin additionally: active staff, active visitor records, active departments, and today's visitor breakdown by department.
- Staff metrics: expected today, pending requests, visitors waiting, currently meeting.
- All dashboards: seven days of arrival/departure counts, recent visitors, timezone, and `asOf` timestamp.

Use the exact metric meaning. Do not invent percentage changes, revenue, satisfaction scores, or previous-period comparisons. Show when the data was last refreshed. Dashboard trends use `{date, arrivals, departures}`; department breakdown rows use `{_id, name, count}`.

## 3. Reception workflow

### Register a walk-in

1. Search returning visitors through `/visitors/matches?q=...`; show enough identity detail to select the correct person. Shared email or phone does not prove identity and must not merge people automatically.
2. Choose an existing visitor using their database `visitorId` reference, or enter a new visitor object. Submit exactly one of these alternatives.
3. Select an active STAFF host from `/users/hosts`; `/departments/:id/staff` supports department-specific selection. The backend derives the visit department from the host.
4. Capture purpose, visitor type, expected departure, optional notes, vehicle registration and items carried.
5. `POST /visitor-requests` creates a PENDING visit and records reception arrival immediately. Arrival time is assigned by the backend.
6. Present a waiting-for-host-approval state. Refresh the queue while visible.
7. Host/admin approves or rejects. Reception checks in only when the updated visit permits it.

### Find an expected visitor

- Enter invitation code, supported search prefix, or QR payload in `GET /visits/lookup?q=...`.
- A frontend QR scanner can feed the same lookup endpoint; provide manual entry and camera-permission fallback. Scanning identifies a record and never grants admission by itself.
- Show visitor, host, department, schedule, current status, and server admission blockers.
- Record arrival separately from check-in. Arrival records reception presence and does not mean the visitor is inside.
- Check in through `POST /visits/:id/check-in`; check out through `POST /visits/:id/check-out`.

### Occupancy

Use `GET /visits/occupancy` for a current-inside table with visitor, company, host, department, actual check-in time, and elapsed stay calculated in the browser. Flag visits past expected departure as an interface aid; there is no dedicated overdue status. Never automatically check someone out. Show freshness and offer manual refresh. A printable occupancy list can use the browser print dialog; do not label it as a full evacuation/muster system.

## 4. Staff invitation and approval workflow

- Staff invitations automatically belong to the signed-in host. Omit `hostId` for STAFF; the API rejects it. Admin must select a valid staff host.
- Choose a returning visitor or create a new visitor within the invitation form.
- Capture purpose, visitor type, arrival and departure instants, optional notes, and optional `draft`.
- `POST /invitations` creates EXPECTED by default, or PRE_REGISTERED when `draft: true`.
- Activate a draft through `POST /invitations/:id/activate`.
- Edit through `PATCH /invitations/:id` only when `visit.canEditInvitation` allows it. Editing ends once reception arrival is recorded, or when state/time rules prevent it.
- `GET /invitations/:id/share` returns invitation code, QR identifier, QR payload, `deliveryMode: MANUAL`, and `deliveryStatus: NOT_SENT`. Generate a QR image in the browser and support copy/download/print/manual sharing.
- `POST /invitations/:id/resend` records sharing activity and still returns NOT_SENT. Label this honestly as sharing again; do not show “email sent.”
- Staff approval inbox shows only their walk-in requests. Approve through `/visitor-requests/:id/approve`; reject through `/visitor-requests/:id/reject` with a required reason.
- Show linked request decision reason/time when present. Staff may read only backend-projected visitor data; do not build security-detail fields for them.

## 5. Visitor directory and visit details

Visitor profile fields supported by create/update DTOs: first name, optional last name, email, phone, company, ID type, ID number input, vehicle registration, items carried, and notes. ID types: PASSPORT, NATIONAL_ID, DRIVERS_LICENSE, OTHER. Full ID numbers are encrypted and omitted from responses; never promise to reveal or prefill stored values.

Visitor types for visits: BUSINESS, CONTRACTOR, DELIVERY, INTERVIEW, PERSONAL, OTHER.

Build visitor list, detail/history, and Admin/Reception edit/archive flows using `/visitors`, `/visitors/:id`, `/visitors/:id/status`, and `/visitors/:id/visits`. Archive preserves history. Staff responses omit visitor notes, ID type, vehicle and carried-item fields; visit-level vehicle/items are also omitted for Staff.

Visit details should display current related visitor/host/department where available, schedule and actual times, source, status, historical snapshot, permitted notes, and server-driven actions. Preserve snapshot names for historical records when profiles change. Handle missing related records without crashing.

Visit editing via `PATCH /visits/:id` supports notes, vehicle registration, and items carried. It is not a general schedule or host reassignment endpoint.

### Groups

Group UI is achievable by creating individual visits linked to a primary visit through `primaryVisitId`. Show a lead visit and `numberOfGuests` (linked additional guests), while retaining each person's record, status, and actions. Create each guest separately; show partial completion and allow safe retry if a later guest fails. Host and schedules must satisfy backend group rules. Group schedules cannot be edited: cancel/recreate affected individual visits. There is no bulk approval, bulk admission, bulk checkout, or cascading cancellation endpoint.

## 6. Visit lifecycle and button behavior

Invitation flow: PRE_REGISTERED → EXPECTED → CHECKED_IN → CHECKED_OUT. Non-draft invitations start at EXPECTED.

Walk-in flow: PENDING → APPROVED → CHECKED_IN → CHECKED_OUT; PENDING may instead become REJECTED.

Open visits can become CANCELLED or EXPIRED under backend rules. Checked-in visits remain inside until explicitly checked out. `arrive` changes `receptionArrivedAt`, not lifecycle status.

Use `allowedActions`, `canEditVisit`, `canEditInvitation`, and desk-only `eligibility: {eligible, reasons}` from the visit response. Do not infer permission from role/status alone. Eligibility reasons include visitor blocked, inactive visitor, unavailable host/department, invalid state and outside check-in window. Translate codes into clear messages.

The default check-in window opens 30 minutes before arrival and closes at expected departure. Read the actual configured early-arrival value. A scheduled visit must have departure after arrival and duration no longer than 24 hours. Scheduled instants require explicit timezone offsets.

Linked invitation status differs from visit status: PRE_REGISTERED maps to DRAFT, EXPECTED to ACTIVE, CHECKED_IN/CHECKED_OUT to USED. Linked request status remains APPROVED after admission/checkout. Use `linked.visit.status` for operational badges and actions; do not confuse it with `linked.status`.

## 7. Administration

- **Users:** list/create/edit, assign one of the three roles, employee ID and department; activate/disable with a reason through `/users/:id/status`; resend account setup through `/users/:id/resend-setup`. Setup delivery is queued; it is not proof that an email reached an inbox. Account creation does not accept an administrator-selected password.
- **Departments:** create/edit/archive through `/departments`; view active staff and admin visitor statistics. Backend checks govern whether changes are permitted.
- **Blacklist:** list/add/view/lift with reasons using `/blacklist` and `/blacklist/:id/lift`. Reception can use `/blacklist/check?visitorId=...` and admission blockers. Blacklisting someone already inside does not automatically check them out.
- **Audit:** read-only `/audit-logs` and `/audit-logs/:id`; filters include actor user ID, action, resource and resource ID. Show timestamp, action, actor/reference, metadata and request ID. No audit editing/deletion controls or unsupported date filter.
- **Settings:** `/settings` allows organization name and early arrival minutes (0–120), with version checking. `/settings/client` exposes safe client settings to all signed-in roles. Timezone is returned but is not editable through the current settings DTO. Reporting uses Africa/Lagos.

## 8. Reports and exports

Admin reports from `GET /reports/:report`: daily-visitors, weekly-visitors, monthly-visitors, by-department, by-host, by-company, average-duration, peak-hours. Add charts and matching tabular views. Grouped rows use `_id`, optional `name`, and `count`; average-duration returns `{averageDurationSeconds, sampleSize}` with nullable duration when no samples exist. Do not treat null as an observed zero-minute stay.

`visitor-history` is available to all roles, scoped to own hosted visits for Staff. `currently-checked-in` is available to Admin/Reception. Export via `/reports/export.csv?report=...` using the same permission rules. Parse CSV as a file response, not a JSON envelope. Historical report ranges are limited to 366 days; exports are limited to 100,000 rows.

Visit/history filters supported by VisitQueryDto: search `q`, status, source, visitorType, visitorId, hostId, departmentId, company, dateFrom/dateTo, dateField, receptionWaiting, eligible, groupParent, pagination and supported sorting. Only show filters relevant to the endpoint and role. Generic visitor/user/department lists take PageDto and do not expose all of these server filters. Search uses indexed prefixes/exact invitation identifiers, not arbitrary contains search.

## 9. Shared account and notification features

- Login, forgot password, reset password/account setup, change password, profile edit, logout, and session restoration.
- Public routes: `/login`, `/forgot-password`, `/reset-password`. There is no public user sign-up or public guest registration API.
- Profile update via `PATCH /users/me` supports first name, last name, phone. Email/role/department are not self-editable fields.
- Notifications: list via `/notifications`, unread count via `/notifications/unread-count`, mark one read via `PATCH /notifications/:id/read`, mark all via `POST /notifications/read-all`. Use resource references for navigation with appropriate role checks.
- Poll visible operational/notification screens conservatively, pause when hidden, and refresh after mutations. There is no WebSocket/SSE contract in the inspected backend.

## 10. API integration requirements

1. Reuse `frontend/lib/api/client.ts`, `resources.ts`, `types.ts`, and generated OpenAPI types. Cross-check `backend/openapi.json` against DTOs, controllers and services: some response schemas are generic or incomplete, and runtime projections include extra fields such as eligibility.
2. JSON success is `{data, meta: {requestId, ...}}`. Paginated lists have `data: []` and `meta.page`, `limit`, `total`, `totalPages`. Errors are `{error: {code, message, details?}, meta: {requestId}}`. Dashboard and scalar reports use their own object inside `data`.
3. Distinguish visitor database `id`, public person `visitorId`, visit `id`, invitation `id`, request `id`, and linked `visit.id`. A visit's `visitorId` references the visitor database ID. Use the ID expected by the route, never the displayed public visitor code.
4. Versioned writes must use the latest server `version`. Invitation/request edits and workflow commands use nested **`visit.version`**, not the linked document version.
5. Invitation/request creation and workflow POST commands require an 8–100 character URL-safe `Idempotency-Key`. Keep the same key/body when retrying an uncertain transport result. Changed input/new deliberate operations need a new key. Idempotency retention is 24 hours.
6. On VERSION_CONFLICT, fetch current data, explain the conflict and let the user review/resubmit. Prevent double clicks and invalidate affected lists, details, dashboards and counts after successful mutations.
7. Use server pagination (default 20, maximum 100). Preserve filters and pagination in the URL where practical. Do not fetch all records to simulate a complete directory.
8. Keep access tokens in memory. Refresh cookies are HttpOnly. Send `credentials: include`, bearer access tokens and `X-VMS-Client: web`; coordinate refresh rotation across requests/tabs. Clear user data caches on logout/session end. Do not persist access tokens in localStorage.
9. Preserve the same-origin `/api/v1` proxy to the separately hosted backend using server-only `BACKEND_URL`. Configure allowed frontend origins and setup/reset link origins on the backend. Keep database credentials and signing keys out of frontend code.
10. Display times clearly in Africa/Lagos for operational/report consistency, while submitting UTC or explicit-offset instants. Show loading/error/empty states and request IDs for support.
11. API, MongoDB replica set, SMTP and a running worker are backend infrastructure prerequisites. The worker handles notifications and expiry. A frontend build/deployment alone does not provision them.

## 11. Features requiring backend expansion

Do not present these as working features with the current API:

- Additional roles such as Security, Department Manager, Super Admin or Visitor; custom permission builders.
- Multiple organizations/sites/gates, tenant switching, or location-scoped permissions.
- Visitor self-service invitation pages, public preregistration, unattended kiosk admission.
- Photo upload/camera image storage, ID scanning/OCR, facial recognition or biometric admission. A model `photoUrl` field alone is not an upload API.
- Automatic visitor invitation email/SMS/WhatsApp delivery or delivery receipts. Authentication emails are a separate supported workflow.
- Physical access-control integration, badge printers, badge issuance records, signatures, NDAs, attachments.
- Server-pushed live updates, offline synchronization, bulk transactional group actions.
- Recurring visits, appointments longer than 24 hours, host reassignment or group schedule editing.
- Incident/muster acknowledgement workflows, scheduled reports, configurable retention, audit export endpoints, editable timezone.

Frontend-only additions such as QR rendering, scanner-to-lookup, browser printing, elapsed-time indicators, calendar presentation of permitted visit data, and copy/share controls are possible. Present them as interface features and respect pagination and API permission boundaries.

## 12. Acceptance criteria

- Each role sees its intended navigation and cannot access unauthorized pages or controls. Staff never see another host's records or protected reception details.
- A returning walk-in can be registered, approved by the right host, checked in by reception and checked out, with dashboard/history updates.
- A staff invitation can be saved as a draft, activated, manually shared, found by code/QR, and admitted within the allowed window.
- Rejection/cancellation reasons, blocked admission, expired windows, stale versions, duplicate submissions, and network retry cases have clear behavior.
- Occupancy matches server checked-in records; groups retain individual state; reports show actual backend data.
- Authentication restoration, session expiration, reset/setup links and logout work with the existing backend contract.
- No fake operational data, unsupported success messages, placeholder buttons or secrets in the frontend bundle.

## Source files to attach or make available

- This brief and `backend/openapi.json`.
- `backend/src/common/{domain,dto,responses,http}.ts`.
- `backend/src/infrastructure/database.ts` for model context.
- `backend/src/modules/` controllers and services, especially `visits.service.ts`, `records.service.ts`, `analytics.service.ts`, `auth.ts`.
- Existing `frontend/` source, particularly `lib/api/`, `lib/generated/openapi.ts`, `docs/integration.md`, routing and authentication components.
- Sanitized environment examples and READMEs. Exclude actual environment files, private keys and production records.
