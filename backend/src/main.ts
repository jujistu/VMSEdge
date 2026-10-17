import { createApp } from "./bootstrap";
import { CONFIG, Configuration } from "./config/config";
import { Database } from "./infrastructure/database";
async function main() {
  const app = await createApp();
  await app.get(Database).initialize();
  await app.listen(app.get<Configuration>(CONFIG).port, "0.0.0.0");
}
main().catch(() => {
  console.error(
    "API startup failed: check configuration and database availability",
  );
  process.exit(1);
});
