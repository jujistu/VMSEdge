import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../../src/bootstrap";
import { Database } from "../../src/infrastructure/database";
import { migrate } from "../../src/scripts/migrate";
import { passwordHash } from "../../src/modules/auth";
import { OutboxWorker } from "../../src/infrastructure/worker.service";
import { VisitsService } from "../../src/modules/visits.service";
let app: any, db: Database, folder: string;
const users: any = {},
  tokens: any = {};
const password = "A sufficiently long test password";
const origin = "http://localhost:3000";
const auth = (r: any, role = "ADMIN") =>
  r.set("Authorization", `Bearer ${tokens[role]}`);
const post = (url: string, body: any, role = "ADMIN", key = randomUUID()) =>
  auth(request(app.getHttpServer()).post(`/api/v1${url}`), role)
    .set("Idempotency-Key", key)
    .send(body);
const get = (url: string, role = "ADMIN") =>
  auth(request(app.getHttpServer()).get(`/api/v1${url}`), role);
const patch = (url: string, body: any, role = "ADMIN") =>
  auth(request(app.getHttpServer()).patch(`/api/v1${url}`), role).send(body);
async function walkin() {
  const r = await post(
    "/visitor-requests",
    {
      visitor: {
        firstName: "Visitor",
        lastName: "Example",
        email: `${randomUUID()}@example.test`,
        company: "Test Co",
      },
      hostId: users.STAFF.id,
      purpose: "Test meeting",
      visitorType: "BUSINESS",
      expectedDepartureAt: new Date(Date.now() + 3600000).toISOString(),
    },
    "RECEPTIONIST",
  );
  expect(r.status).toBe(201);
  return r.body.data;
}
async function approve(w: any) {
  const r = await post(
    `/visitor-requests/${w.id}/approve`,
    { version: w.visit.version },
    "STAFF",
  );
  expect(r.status).toBe(201);
  return r.body.data;
}
beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), "vms-test-"));
  const keys = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  writeFileSync(join(folder, "private.pem"), keys.privateKey);
  writeFileSync(join(folder, "public.pem"), keys.publicKey);
  Object.assign(process.env, {
    NODE_ENV: "test",
    MONGODB_URI:
      process.env.TEST_MONGODB_URI ||
      "mongodb://127.0.0.1:27028/vms_test?replicaSet=vms-test",
    JWT_PRIVATE_KEY_PATH: join(folder, "private.pem"),
    JWT_PUBLIC_KEY_PATH: join(folder, "public.pem"),
    FRONTEND_ORIGIN: origin,
    PII_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    OUTBOX_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  });
  if (!process.env.MONGODB_URI!.match(/\/vms_test(?:\?|$)/))
    throw new Error("Tests require vms_test database");
  const connection = await mongoose
    .createConnection("mongodb://127.0.0.1:27028/?directConnection=true")
    .asPromise();
  try {
    await connection.db!.admin().command({
      replSetInitiate: {
        _id: "vms-test",
        members: [{ _id: 0, host: "127.0.0.1:27028" }],
      },
    });
  } catch (e: any) {
    if (e.code !== 23) throw e;
  }
  await connection.close();
  app = await createApp();
  await app.init();
  db = app.get(Database);
  await db.connection.dropDatabase();
  await migrate(db);
  const [department] = await db
    .m("departments")
    .create([{ name: "Engineering", normalizedName: "engineering" }]);
  const encoded = await passwordHash(password);
  for (const role of ["ADMIN", "RECEPTIONIST", "STAFF", "STAFF2"]) {
    const user = await db.m("users").create({
      firstName: role,
      lastName: "Test",
      email: `${role.toLowerCase()}@example.test`,
      employeeId: role,
      role: role === "STAFF2" ? "STAFF" : role,
      departmentId: department._id,
      passwordHash: encoded,
      mustChangePassword: false,
    });
    users[role] = { id: String(user._id) };
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .set("X-VMS-Client", "web")
      .send({ email: user.email, password });
    expect(res.status).toBe(201);
    tokens[role] = res.body.data.accessToken;
  }
});
beforeEach(async () => {
  if (db) await db.m("rateLimits").deleteMany({});
});
afterAll(async () => {
  if (app) await app.close();
  if (folder) rmSync(folder, { recursive: true, force: true });
});
it("denies unauthenticated access and never serializes password hashes", async () => {
  expect(
    (await request(app.getHttpServer()).get("/api/v1/visits")).status,
  ).toBe(401);
  const r = await get("/auth/me");
  expect(r.body.data.passwordHash).toBeUndefined();
});
it("requires authenticated host ownership for approvals, history and dashboards", async () => {
  const w = await walkin();
  expect(
    (
      await post(
        `/visitor-requests/${w.id}/approve`,
        { version: 0 },
        "RECEPTIONIST",
      )
    ).status,
  ).toBe(403);
  expect(
    (await post(`/visitor-requests/${w.id}/approve`, { version: 0 }, "STAFF2"))
      .status,
  ).toBe(404);
  expect((await get(`/visits/${w.visit.id}`, "STAFF2")).status).toBe(404);
  expect((await get("/visits", "STAFF2")).body.meta.total).toBe(0);
  expect(
    (await get("/dashboard/staff", "STAFF2")).body.data.metrics.pendingRequests,
  ).toBe(0);
});
it("supports walk-in approval, check-in, checkout and exact audit counts", async () => {
  const w = await walkin(),
    v = await approve(w);
  const inside = await post(
    `/visits/${v.id}/check-in`,
    { version: v.version },
    "RECEPTIONIST",
  );
  expect(inside.status).toBe(201);
  expect(inside.body.data.actualCheckInAt).toBeTruthy();
  const out = await post(
    `/visits/${v.id}/check-out`,
    { version: inside.body.data.version },
    "RECEPTIONIST",
  );
  expect(out.status).toBe(201);
  expect(out.body.data.status).toBe("CHECKED_OUT");
  expect(
    await db
      .m("auditLogs")
      .countDocuments({ resourceId: v.id, action: "CHECK_IN" }),
  ).toBe(1);
});
it("resolves approve/reject races with one committed decision", async () => {
  const w = await walkin();
  const results = await Promise.all([
    post(`/visitor-requests/${w.id}/approve`, { version: 0 }, "STAFF"),
    post(
      `/visitor-requests/${w.id}/reject`,
      { version: 0, reason: "Unavailable" },
      "STAFF",
    ),
  ]);
  expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  expect(results.filter((r) => r.status === 409)).toHaveLength(1);
});
it("enforces one check-in and idempotent retries", async () => {
  const v = await approve(await walkin());
  const key = randomUUID();
  const results = await Promise.all([
    post(
      `/visits/${v.id}/check-in`,
      { version: v.version },
      "RECEPTIONIST",
      key,
    ),
    post(
      `/visits/${v.id}/check-in`,
      { version: v.version },
      "RECEPTIONIST",
      key,
    ),
  ]);
  expect(results.map((r) => r.status)).toEqual([201, 201]);
  expect(results[0].body.data.actualCheckInAt).toEqual(
    results[1].body.data.actualCheckInAt,
  );
  expect(
    await db
      .m("auditLogs")
      .countDocuments({ resourceId: v.id, action: "CHECK_IN" }),
  ).toBe(1);
});
it("reuses visitor identity and prevents a second active visit", async () => {
  const w = await walkin(),
    v = await approve(w);
  expect(
    (await post(`/visits/${v.id}/check-in`, { version: v.version })).status,
  ).toBe(201);
  const second = await post(
    "/visitor-requests",
    {
      visitorId: w.visit.visitor.id,
      hostId: users.STAFF.id,
      purpose: "Second meeting",
      visitorType: "BUSINESS",
      expectedDepartureAt: new Date(Date.now() + 3600000).toISOString(),
    },
    "RECEPTIONIST",
  );
  expect(second.status).toBe(201);
  const v2 = await approve(second.body.data);
  const r = await post(`/visits/${v2.id}/check-in`, { version: v2.version });
  expect(r.status).toBe(409);
  expect(r.body.error.code).toBe("ALREADY_CHECKED_IN");
});
it("blocks rejected and blacklisted visitors", async () => {
  const w = await walkin();
  expect(
    (
      await post(
        `/visitor-requests/${w.id}/reject`,
        { version: 0, reason: "Not expected" },
        "STAFF",
      )
    ).status,
  ).toBe(201);
  expect(
    (await post(`/visits/${w.visit.id}/check-in`, { version: 1 })).status,
  ).toBe(409);
  const v = await approve(await walkin());
  expect(
    (
      await post("/blacklist", {
        visitorId: v.visitor.id,
        reason: "Security restriction",
      })
    ).status,
  ).toBe(201);
  const blocked = await post(`/visits/${v.id}/check-in`, {
    version: v.version,
  });
  expect(blocked.body.error.code).toBe("VISITOR_BLOCKED");
  expect(
    await db
      .m("auditLogs")
      .countDocuments({ resourceId: v.id, action: "CHECK_IN" }),
  ).toBe(0);
});
it("creates staff invitations with server-derived host, manual share and strict fields", async () => {
  const body = {
    visitor: { firstName: "Invited", email: "invited@example.test" },
    purpose: "Scheduled",
    visitorType: "BUSINESS",
    expectedArrivalAt: new Date(Date.now() + 60000).toISOString(),
    expectedDepartureAt: new Date(Date.now() + 3600000).toISOString(),
  };
  const r = await post("/invitations", body, "STAFF");
  expect(r.status).toBe(201);
  expect(r.body.data.visit.hostId).toBe(users.STAFF.id);
  expect(r.body.data.invitationCode).toMatch(/^VMS-\d{4}-\d{6}$/);
  const share = await get(`/invitations/${r.body.data.id}/share`, "STAFF");
  expect(share.body.data.deliveryStatus).toBe("NOT_SENT");
  expect(
    (await post("/invitations", { ...body, hostId: users.STAFF2.id }, "STAFF"))
      .status,
  ).toBe(400);
  expect(
    (await post("/invitations", { ...body, status: "CHECKED_IN" }, "STAFF"))
      .status,
  ).toBe(400);
});
it("delivers notifications exactly once and limits read ownership", async () => {
  await app.get(OutboxWorker).tick();
  const r = await get("/notifications", "STAFF");
  expect(r.body.meta.total).toBeGreaterThan(0);
  const id = r.body.data[0].id;
  expect((await patch(`/notifications/${id}/read`, {}, "STAFF2")).status).toBe(
    404,
  );
  expect((await patch(`/notifications/${id}/read`, {}, "STAFF")).status).toBe(
    200,
  );
  const before = await db.m("notifications").countDocuments();
  await app.get(OutboxWorker).tick();
  expect(await db.m("notifications").countDocuments()).toBe(before);
});
it("expires unarrived visits but preserves overnight occupancy", async () => {
  const w = await walkin();
  await db
    .m("visits")
    .updateOne(
      { _id: w.visit.id },
      { $set: { expectedDepartureAt: new Date(Date.now() - 1000) } },
    );
  await app.get(VisitsService).expire();
  expect((await get(`/visits/${w.visit.id}`)).body.data.status).toBe("EXPIRED");
  expect(
    (await get("/visits/occupancy")).body.data.every(
      (v: any) => v.status === "CHECKED_IN",
    ),
  ).toBe(true);
  expect((await get("/visits/occupancy", "STAFF")).status).toBe(403);
});
it("scopes CSV, reports and search and rejects operator input", async () => {
  expect((await get("/reports/by-host", "STAFF")).status).toBe(403);
  const csv = await get("/reports/export.csv?report=visitor-history", "STAFF2");
  expect(csv.status).toBe(200);
  expect(csv.text.trim().split("\n")).toHaveLength(1);
  expect(
    (await get("/visitors/search?q=Visitor", "STAFF2")).body.meta.total,
  ).toBe(0);
  expect((await get("/visits?hostId[$ne]=null")).status).toBe(400);
  expect(
    (await get("/reports/average-duration")).body.data.sampleSize,
  ).toBeGreaterThan(0);
});
it("prevents disabling the last Admin", async () => {
  const u = await get(`/users/${users.ADMIN.id}`);
  const r = await patch(`/users/${users.ADMIN.id}/status`, {
    status: "DISABLED",
    reason: "Test",
    version: u.body.data.version,
  });
  expect(r.body.error.code).toBe("LAST_ADMIN");
});
it("rotates refresh tokens, detects replay, and revokes access immediately", async () => {
  const login = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .set("Origin", origin)
    .set("X-VMS-Client", "web")
    .send({ email: "staff2@example.test", password });
  const cookie = login.headers["set-cookie"][0].split(";")[0];
  const refresh = () =>
    request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Origin", origin)
      .set("X-VMS-Client", "web")
      .set("Cookie", cookie)
      .send({});
  const first = await refresh();
  expect(first.status).toBe(201);
  expect((await refresh()).status).toBe(401);
  expect(
    (
      await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${first.body.data.accessToken}`)
    ).status,
  ).toBe(401);
  expect(
    (
      await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("Cookie", cookie)
    ).status,
  ).toBe(403);
});
it("rolls back mutations when an audit write fails", async () => {
  const v = await approve(await walkin());
  const spy = jest
    .spyOn(db.m("auditLogs"), "create")
    .mockRejectedValueOnce(new Error("Simulated audit failure") as never);
  const result = await post(`/visits/${v.id}/check-in`, { version: v.version });
  spy.mockRestore();
  expect(result.status).toBe(500);
  expect((await get(`/visits/${v.id}`)).body.data.status).toBe("APPROVED");
});
it("resolves check-in versus cancel and duplicate checkout races", async () => {
  const v = await approve(await walkin());
  const race = await Promise.all([
    post(`/visits/${v.id}/check-in`, { version: v.version }),
    post(`/visits/${v.id}/cancel`, { version: v.version, reason: "Cancelled" }),
  ]);
  expect(race.filter((r) => r.status === 201)).toHaveLength(1);
  const v2 = await approve(await walkin());
  const inside = await post(`/visits/${v2.id}/check-in`, {
    version: v2.version,
  });
  const outs = await Promise.all([
    post(`/visits/${v2.id}/check-out`, { version: inside.body.data.version }),
    post(`/visits/${v2.id}/check-out`, { version: inside.body.data.version }),
  ]);
  expect(outs.filter((r) => r.status === 201)).toHaveLength(1);
});
it("serializes blacklist admission without losing occupants", async () => {
  const v = await approve(await walkin());
  const [black, check] = await Promise.all([
    post("/blacklist", {
      visitorId: v.visitor.id,
      reason: "Concurrent restriction",
    }),
    post(`/visits/${v.id}/check-in`, { version: v.version }),
  ]);
  expect(black.status).toBe(201);
  expect([201, 403]).toContain(check.status);
  const stored = await get(`/visits/${v.id}`);
  if (check.status === 201) {
    expect(stored.body.data.status).toBe("CHECKED_IN");
    expect(
      await db.m("outboxEvents").countDocuments({
        type: "VISITOR_BLACKLISTED_WHILE_INSIDE",
        resourceId: v.visitor.id,
      }),
    ).toBe(1);
  } else expect(stored.body.data.status).toBe("APPROVED");
});
it("supports departments, users, visitor edits, blacklist lifting and settings versions", async () => {
  await db.m("rateLimits").deleteMany({});
  const dep = await post("/departments", { name: "Support" });
  expect(dep.status).toBe(201);
  const u = await post("/users", {
    firstName: "New",
    lastName: "Host",
    email: "newhost@example.test",
    employeeId: "NEW-HOST",
    role: "STAFF",
    departmentId: dep.body.data.id,
  });
  expect(u.status).toBe(201);
  expect(u.body.data.passwordHash).toBeUndefined();
  expect((await post(`/users/${u.body.data.id}/resend-setup`, {})).status).toBe(
    201,
  );
  expect(
    (
      await patch(`/departments/${dep.body.data.id}`, {
        version: 0,
        status: "ARCHIVED",
      })
    ).body.error.code,
  ).toBe("DEPARTMENT_IN_USE");
  const person = await post("/visitors", {
    firstName: "Person",
    phone: "+2348031234567",
    idType: "PASSPORT",
    idNumber: "SECRET-123",
  });
  expect(person.status).toBe(201);
  expect(JSON.stringify(person.body)).not.toContain("SECRET-123");
  expect(
    (
      await patch(`/visitors/${person.body.data.id}`, {
        version: 0,
        company: "Updated",
      })
    ).status,
  ).toBe(200);
  const block = await post("/blacklist", {
    visitorId: person.body.data.id,
    reason: "Temporary",
  });
  expect(
    (
      await patch(`/blacklist/${block.body.data.id}/lift`, {
        version: 0,
        reason: "Resolved",
      })
    ).status,
  ).toBe(200);
  const settings = await get("/settings");
  expect(
    (
      await patch("/settings", {
        version: settings.body.data.version,
        organizationName: "Test Northstar",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await patch("/settings", {
        version: settings.body.data.version,
        organizationName: "Stale",
      })
    ).status,
  ).toBe(409);
});
it("supports password setup and one-time reset consumption", async () => {
  const event: any = await db
    .m("outboxEvents")
    .findOne({ type: "AUTH_EMAIL" })
    .sort({ createdAt: -1 })
    .lean();
  const { CryptoService } = await import("../../src/infrastructure/services");
  const payload = JSON.parse(
    app.get(CryptoService).decrypt(event.payload.encrypted, "outbox"),
  );
  const token = new URL(payload.url).hash.slice(7);
  const reset = () =>
    request(app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({ token, newPassword: "A new long test password" });
  expect((await reset()).status).toBe(201);
  expect((await reset()).status).toBe(400);
  const login = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .set("Origin", origin)
    .set("X-VMS-Client", "web")
    .send({
      email: "newhost@example.test",
      password: "A new long test password",
    });
  expect(login.status).toBe(201);
});
it("documents every module and enforces representative endpoint roles", async () => {
  const { SwaggerModule, DocumentBuilder } = await import("@nestjs/swagger");
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("VMS API")
      .setVersion("1.0.0")
      .addBearerAuth()
      .build(),
  );
  writeFileSync(
    join(__dirname, "../..", "openapi.json"),
    JSON.stringify(document, null, 2),
  );
  expect(Object.keys(document.paths).length).toBeGreaterThan(50);
  for (const route of [
    "/users",
    "/audit-logs",
    "/settings",
    "/blacklist",
    "/dashboard/admin",
  ])
    expect((await get(route, "STAFF")).status).toBe(403);
  for (const route of [
    "/departments",
    "/visitors",
    "/visits",
    "/invitations",
    "/visitor-requests",
    "/notifications",
    "/notifications/unread-count",
    "/settings/client",
    "/dashboard/staff",
  ])
    expect((await get(route, "STAFF")).status).toBe(200);
});
it("paginates expected visitors and keeps every guest independently accountable", async () => {
  const primary = await walkin();
  const guest = await post(
    "/visitor-requests",
    {
      visitor: { firstName: "Guest", email: "guest@example.test" },
      hostId: users.STAFF.id,
      purpose: "Guest meeting",
      visitorType: "BUSINESS",
      expectedDepartureAt: primary.visit.expectedDepartureAt,
      primaryVisitId: primary.visit.id,
    },
    "RECEPTIONIST",
  );
  expect(guest.status).toBe(201);
  expect(guest.body.data.visit.expectedArrivalAt).toBe(
    primary.visit.expectedArrivalAt,
  );
  const p = await get(`/visits/${primary.visit.id}`);
  expect(p.body.data.numberOfGuests).toBe(1);
  await post(
    `/visitor-requests/${primary.id}/approve`,
    { version: p.body.data.version },
    "STAFF",
  );
  expect(
    (await get(`/visits/${guest.body.data.visit.id}`)).body.data.status,
  ).toBe("PENDING");
  const page = await get("/visits?eligible=true&limit=1");
  expect(page.status).toBe(200);
  expect(page.body.data).toHaveLength(1);
  expect(["APPROVED", "EXPECTED"]).toContain(page.body.data[0].status);
});
it("returns admission reasons outside the time window and never trusts supplied timestamps", async () => {
  const r = await post("/invitations", {
    visitor: { firstName: "Future", email: "future@example.test" },
    hostId: users.STAFF.id,
    purpose: "Future meeting",
    visitorType: "BUSINESS",
    expectedArrivalAt: new Date(Date.now() + 7200000).toISOString(),
    expectedDepartureAt: new Date(Date.now() + 10800000).toISOString(),
  });
  expect(r.status).toBe(201);
  expect(r.body.data.visit.eligibility.reasons).toContain(
    "OUTSIDE_CHECK_IN_WINDOW",
  );
  const check = await post(`/visits/${r.body.data.visit.id}/check-in`, {
    version: 0,
  });
  expect(check.status).toBe(422);
  expect(
    (
      await post(`/visits/${r.body.data.visit.id}/check-in`, {
        version: 0,
        actualCheckInAt: new Date().toISOString(),
      })
    ).status,
  ).toBe(400);
});
it("revokes disabled account sessions and forbids public registration", async () => {
  expect(
    (
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ role: "ADMIN" })
    ).status,
  ).not.toBe(201);
  const created = await post("/users", {
    firstName: "Disabled",
    lastName: "Test",
    email: "disable@example.test",
    employeeId: "DISABLE",
    role: "RECEPTIONIST",
  });
  await db.m("users").updateOne(
    { _id: created.body.data.id },
    {
      $set: {
        mustChangePassword: false,
        passwordHash: await passwordHash(password),
      },
    },
  );
  const login = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .set("Origin", origin)
    .set("X-VMS-Client", "web")
    .send({ email: "disable@example.test", password });
  expect(login.status).toBe(201);
  const disable = await patch(`/users/${created.body.data.id}/status`, {
    version: 0,
    status: "DISABLED",
    reason: "Test disable",
  });
  expect(disable.status).toBe(200);
  expect(
    (
      await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${login.body.data.accessToken}`)
    ).status,
  ).toBe(401);
});
it("runs each reporting aggregation and confirms indexed host history", async () => {
  for (const report of [
    "daily-visitors",
    "weekly-visitors",
    "monthly-visitors",
    "by-department",
    "by-host",
    "by-company",
    "peak-hours",
    "currently-checked-in",
    "visitor-history",
  ])
    expect((await get(`/reports/${report}`)).status).toBe(200);
  const result: any = await db
    .m("visits")
    .find({ hostId: users.STAFF.id })
    .sort({ expectedArrivalAt: 1 })
    .explain("executionStats");
  expect(JSON.stringify(result.queryPlanner.winningPlan)).toContain("IXSCAN");
  expect(
    (await get("/reports/daily-visitors?dateFrom=2020-01-01&dateTo=2026-12-31"))
      .status,
  ).toBe(400);
});
it("enforces reset-token expiry and cookie origin protection", async () => {
  const unknown = await request(app.getHttpServer())
    .post("/api/v1/auth/forgot-password")
    .send({ email: "missing@example.test" });
  const known = await request(app.getHttpServer())
    .post("/api/v1/auth/forgot-password")
    .send({ email: "staff@example.test" });
  expect(known.body.data).toEqual(unknown.body.data);
  const event: any = await db
    .m("outboxEvents")
    .findOne({ type: "AUTH_EMAIL", resourceId: users.STAFF.id })
    .sort({ createdAt: -1 })
    .lean();
  const { CryptoService } = await import("../../src/infrastructure/services");
  const payload = JSON.parse(
    app.get(CryptoService).decrypt(event.payload.encrypted, "outbox"),
  );
  const token = new URL(payload.url).hash.slice(7);
  await db
    .m("passwordResetTokens")
    .updateMany(
      { userId: users.STAFF.id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
  expect(
    (
      await request(app.getHttpServer())
        .post("/api/v1/auth/reset-password")
        .send({ token, newPassword: "Never applied password" })
    ).status,
  ).toBe(400);
});
it("applies account and export rate limits with separate budgets", async () => {
  for (let i = 0; i < 5; i++)
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/v1/auth/login")
          .set("Origin", origin)
          .set("X-VMS-Client", "web")
          .send({ email: "rate@example.test", password: "bad" })
      ).status,
    ).toBe(401);
  expect(
    (
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .set("Origin", origin)
        .set("X-VMS-Client", "web")
        .send({ email: "rate@example.test", password: "bad" })
    ).status,
  ).toBe(429);
  expect((await get("/reports/export.csv?report=visitor-history")).status).toBe(
    200,
  );
});
it("returns stable errors for malformed JSON and invalid calendar dates", async () => {
  const malformed = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .set("Content-Type", "application/json")
    .send("{");
  expect(malformed.status).toBe(400);
  expect(malformed.body.error.code).toBe("INVALID_JSON");
  expect((await get("/visits?dateFrom=2026-02-31")).status).toBe(400);
});
it("exports public visitor identifiers and a consistent current occupancy list", async () => {
  const csv = await get("/reports/export.csv?report=currently-checked-in");
  expect(csv.status).toBe(200);
  expect(csv.text).toContain("VST-");
  const list = await get("/visits/occupancy?limit=100");
  expect(csv.text.trim().split("\n").length - 1).toBe(list.body.meta.total);
});
it("revokes an authenticated session on logout even without a refresh cookie", async () => {
  const login = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .set("Origin", origin)
    .set("X-VMS-Client", "web")
    .send({ email: "staff@example.test", password });
  expect(login.status).toBe(201);
  const token = login.body.data.accessToken;
  const logout = await request(app.getHttpServer())
    .post("/api/v1/auth/logout")
    .set("Origin", origin)
    .set("X-VMS-Client", "web")
    .set("Authorization", `Bearer ${token}`)
    .send({});
  expect(logout.status).toBe(201);
  expect(
    (
      await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`)
    ).status,
  ).toBe(401);
});
