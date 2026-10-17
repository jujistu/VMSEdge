// Isolated browser-test fixture. No production credentials or databases are used.
const { generateKeyPairSync, randomBytes } = require("node:crypto");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
if (process.env.NODE_ENV === "production")
  throw new Error("Browser fixtures cannot run in production");
const directory = mkdtempSync(join(tmpdir(), "vms-browser-"));
const keys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
writeFileSync(join(directory, "private.pem"), keys.privateKey);
writeFileSync(join(directory, "public.pem"), keys.publicKey);
Object.assign(process.env, {
  NODE_ENV: "test",
  PORT: "4010",
  MONGODB_URI: "mongodb://127.0.0.1:27028/vms_ui_test?replicaSet=vms-test",
  JWT_PRIVATE_KEY_PATH: join(directory, "private.pem"),
  JWT_PUBLIC_KEY_PATH: join(directory, "public.pem"),
  FRONTEND_ORIGIN: "http://localhost:3010",
  CORS_ORIGINS: "http://localhost:3010",
  PII_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  OUTBOX_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
});
const { createApp } = require("../dist/bootstrap");
const { Database } = require("../dist/infrastructure/database");
const { migrate } = require("../dist/scripts/migrate");
const { passwordHash } = require("../dist/modules/auth");
(async () => {
  const app = await createApp();
  const db = app.get(Database);
  await db.connection.dropDatabase();
  await migrate(db);
  const department = await db
    .m("departments")
    .create({ name: "Engineering", normalizedName: "engineering" });
  const encoded = await passwordHash("Browser test password 2026");
  for (const role of ["ADMIN", "RECEPTIONIST", "STAFF"])
    await db.m("users").create({
      firstName: role === "STAFF" ? "Staff" : role,
      lastName: "Host",
      email: `${role.toLowerCase()}@browser.test`,
      employeeId: `BROWSER-${role}`,
      role,
      departmentId: department._id,
      passwordHash: encoded,
      mustChangePassword: false,
    });
  // More than one API page verifies that the UI follows pagination.
  await db.m("visitors").insertMany(
    Array.from({ length: 105 }, (_, i) => ({
      visitorId: `PAGE-${i}`,
      firstName: `Paginated${String(i).padStart(3, "0")}`,
      lastName: "Guest",
      company: "Pagination Test",
      status: "ACTIVE",
    })),
  );
  await app.listen(4010, "127.0.0.1");
  // Process only in-app events in browser fixtures; never send external mail.
  const { InAppDelivery } = require("../dist/infrastructure/worker.service");
  const delivery = app.get(InAppDelivery);
  let processing = false;
  const timer = setInterval(async () => {
    if (processing) return;
    processing = true;
    try {
      const events = await db
        .m("outboxEvents")
        .find({ status: "PENDING", type: { $ne: "AUTH_EMAIL" } })
        .limit(50);
      for (const event of events) {
        await delivery.deliver(event);
        await db
          .m("outboxEvents")
          .updateOne({ _id: event._id }, { $set: { status: "PROCESSED" } });
      }
    } finally {
      processing = false;
    }
  }, 500);
  timer.unref();
  const cleanup = () => {
    rmSync(directory, { recursive: true, force: true });
  };
  process.on("exit", cleanup);
})().catch((e) => {
  console.error(e);
  rmSync(directory, { recursive: true, force: true });
  process.exit(1);
});
