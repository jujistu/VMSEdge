import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { writeFileSync } from "node:fs";
import { createApp } from "../bootstrap";
(async () => {
  const app = await createApp();
  try {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("VMS API")
        .setVersion("1.0.0")
        .addBearerAuth()
        .build(),
    );
    writeFileSync("openapi.json", JSON.stringify(doc, null, 2));
  } finally {
    await app.close();
  }
})().catch(() => process.exit(1));
