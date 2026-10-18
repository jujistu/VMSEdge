import { NestFactory } from "@nestjs/core";
import "reflect-metadata";
import { AppModule } from "./app.module";
import { Database } from "./infrastructure/database";
import { EmailAutomation } from "./infrastructure/email-automation";
import { OutboxWorker } from "./infrastructure/worker.service";
import { VisitsService } from "./modules/visits.service";
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.get(Database).initialize();
  // Drain the active delivery/transaction before closing database connections.
  let stopped = false;
  process.on("SIGTERM", () => {
    stopped = true;
  });
  process.on("SIGINT", () => {
    stopped = true;
  });
  let lastExpiry = 0;
  while (!stopped) {
    try {
      await app.get(OutboxWorker).tick(() => stopped);
      if (Date.now() - lastExpiry > 60000) {
        await app.get(VisitsService).expire();
        await app.get(EmailAutomation).tick(new Date(), () => stopped);
        lastExpiry = Date.now();
      }
    } catch {
      console.error(
        JSON.stringify({ level: "error", error: "WORKER_TICK_FAILED" }),
      );
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  await app.close();
}
main().catch(() => process.exit(1));
