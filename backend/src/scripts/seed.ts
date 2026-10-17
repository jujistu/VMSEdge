import { NestFactory } from "@nestjs/core";
import "reflect-metadata";
import { AppModule } from "../app.module";
import { Role } from "../common/domain";
import { Database } from "../infrastructure/database";
import { passwordHash } from "../modules/auth";
import { VisitsService } from "../modules/visits.service";
import { migrate } from "./migrate";
async function main() {
  if (
    !["development", "test"].includes(process.env.NODE_ENV || "") ||
    !process.env.MONGODB_URI?.match(/\/vms_(dev|test)(\?|$)/)
  )
    throw new Error(
      "Seed requires development/test and a vms_dev/vms_test database",
    );
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12 || password.length > 128)
    throw new Error("Supply a 12–128 character SEED_PASSWORD");
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const db = app.get(Database);
    await migrate(db);
    if (await db.m("users").estimatedDocumentCount())
      throw new Error("Seed requires an empty users collection");
    const encoded = await passwordHash(password);
    const departments = await db.m("departments").create([
      { name: "Operations", normalizedName: "operations" },
      { name: "Engineering", normalizedName: "engineering" },
    ]);
    const users = await db.m("users").create(
      [
        {
          firstName: "Admin",
          lastName: "User",
          email: "admin@example.test",
          employeeId: "ADM-001",
          role: "ADMIN",
        },
        {
          firstName: "Reception",
          lastName: "User",
          email: "reception@example.test",
          employeeId: "REC-001",
          role: "RECEPTIONIST",
        },
        {
          firstName: "Staff",
          lastName: "Host",
          email: "staff@example.test",
          employeeId: "STF-001",
          role: "STAFF",
          departmentId: departments[0]._id,
        },
        {
          firstName: "Second",
          lastName: "Host",
          email: "staff2@example.test",
          employeeId: "STF-002",
          role: "STAFF",
          departmentId: departments[1]._id,
        },
      ].map((x) => ({
        ...x,
        passwordHash: encoded,
        mustChangePassword: false,
        status: "ACTIVE",
      })),
    );
    const admin = { id: String(users[0]._id), role: Role.ADMIN };
    const service = app.get(VisitsService);
    for (let i = 0; i < 5; i++) {
      const created: any = await service.create(
        admin,
        {
          visitor: {
            firstName: ["Jordan", "Aisha", "Thomas", "Mei", "Rafael"][i],
            lastName: "Visitor",
            email: `visitor${i}@example.test`,
            company: "Example Ltd",
          },
          hostId: String(users[2]._id),
          purpose: "Development fixture",
          visitorType: "BUSINESS",
          expectedDepartureAt: new Date(Date.now() + 3600000).toISOString(),
        },
        "WALK_IN",
        `seed-request-${i}`,
      );
      if (i > 0) {
        const approved: any = await service.action(
          admin,
          created.id,
          i === 4 ? "reject" : "approve",
          {
            version: created.visit.version,
            ...(i === 4 ? { reason: "Development rejection" } : {}),
          },
          `seed-decision-${i}`,
          "request",
        );
        if (i === 2 || i === 3) {
          const inside: any = await service.action(
            admin,
            approved.id,
            "check-in",
            { version: approved.version },
            `seed-checkin-${i}`,
          );
          if (i === 3)
            await service.action(
              admin,
              inside.id,
              "check-out",
              { version: inside.version },
              `seed-checkout-${i}`,
            );
        }
      }
      if (i === 0)
        await service.create(
          admin,
          {
            visitorId: created.visit.visitor.id,
            hostId: String(users[2]._id),
            purpose: "Returning visitor appointment",
            visitorType: "BUSINESS",
            expectedArrivalAt: new Date(Date.now() + 7200000).toISOString(),
            expectedDepartureAt: new Date(Date.now() + 10800000).toISOString(),
          },
          "INVITATION",
          "seed-invitation-0",
        );
    }
    console.log(
      "Development seed complete: admin@example.test, reception@example.test, staff@example.test, staff2@example.test. Password is your supplied SEED_PASSWORD.",
    );
  } finally {
    await app.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
