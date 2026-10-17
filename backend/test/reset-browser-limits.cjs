// Reset only test rate buckets between independent browser scenarios.
if (process.env.NODE_ENV === "production") throw new Error("Test-only utility");
const mongoose = require("mongoose");
(async () => {
  const connection = await mongoose
    .createConnection(
      "mongodb://127.0.0.1:27028/vms_ui_test?replicaSet=vms-test",
    )
    .asPromise();
  try {
    await connection.db.collection("rateLimits").deleteMany({});
  } finally {
    await connection.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
