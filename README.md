# Gatewise Visitor Management System

- `frontend/`: React/Vite interface connected to authenticated REST APIs, with receptionist, staff, and admin workspaces.
- `backend/`: NestJS API and worker with MongoDB replica-set persistence, session authentication, and server-enforced RBAC.

See [frontend setup](frontend/README.md) for the configurable API URL and UI testing, and [backend setup](backend/README.md) for database setup, administrator bootstrap, worker delivery, and API testing.

The UI uses backend records. No demo role switcher or browser-persisted sample data is used.
