import { NestFactory } from "@nestjs/core";
import "reflect-metadata";
import { AppModule } from "../app.module";
import { Database } from "../infrastructure/database";
import { Journal } from "../infrastructure/services";
import { passwordHash } from "../modules/auth";
async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL,
    password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12 || password.length > 128)
    throw new Error(
      "Provide BOOTSTRAP_ADMIN_EMAIL and a 12–128 character BOOTSTRAP_ADMIN_PASSWORD",
    );
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const db = app.get(Database),
      encoded = await passwordHash(password);
    await db.transaction(async (s) => {
      await db
        .m("counters")
        .findOneAndUpdate(
          { _id: "authorization-control" },
          { $inc: { value: 1 } },
          { upsert: true, session: s },
        );
      if (await db.m("users").exists({ role: "ADMIN" }).session(s))
        throw new Error("An Admin already exists; use the authenticated API");
      const [u] = await db.m("users").create(
        [
          {
            firstName:
              process.env.BOOTSTRAP_ADMIN_FIRST_NAME || "Administrator",
            lastName: "",
            email: email.trim().toLowerCase(),
            employeeId: "ADMIN-001",
            passwordHash: encoded,
            role: "ADMIN",
            status: "ACTIVE",
            mustChangePassword: false,
          },
        ],
        { session: s },
      );
      await app
        .get(Journal)
        .audit(null, "CREATE_USER", "users", u._id, s, { bootstrap: true });
    });
    console.log("Admin created; credentials were not logged.");
  } finally {
    await app.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
