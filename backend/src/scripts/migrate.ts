import { NestFactory } from "@nestjs/core";
import "reflect-metadata";
import { AppModule } from "../app.module";
import { Database } from "../infrastructure/database";
export async function migrate(db: Database) {
  await db.initialize();
  for (const model of Object.values(db.models)) {
    await model.createCollection();
    await model.createIndexes();
  }
  await db.m("systemSettings").updateOne(
    { key: "organization" },
    {
      $setOnInsert: {
        organizationName: "Northstar",
        timezone: "Africa/Lagos",
        earlyArrivalMinutes: 30,
        version: 0,
      },
    },
    { upsert: true },
  );
  await db
    .m("counters")
    .updateOne(
      { _id: "authorization-control" },
      { $setOnInsert: { value: 0 } },
      { upsert: true },
    );
  await db
    .m("migrations")
    .updateOne(
      { name: "001-initial" },
      { $setOnInsert: { appliedAt: new Date() } },
      { upsert: true },
    );
}
if (require.main === module)
  (async () => {
    const app = await NestFactory.createApplicationContext(AppModule);
    try {
      await migrate(app.get(Database));
      console.log("Migration complete");
    } finally {
      await app.close();
    }
  })().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
