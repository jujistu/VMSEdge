import { HttpException, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { json, Request, Response, NextFunction } from "express";
import helmet from "helmet";
import "reflect-metadata";
import { AppModule } from "./app.module";
import { requestContext } from "./common/http";
import { CONFIG, Configuration } from "./config/config";
export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const c = app.get<Configuration>(CONFIG);
  app.set("trust proxy", c.trustProxy);
  app.use(helmet());
  app.use(requestContext);
  const parseJson = json({ limit: "64kb" });
  app.use((req: Request, res: Response, next: NextFunction) =>
    parseJson(req, res, (error?: any) => {
      if (
        error?.type === "entity.parse.failed" ||
        error?.type === "entity.too.large"
      ) {
        const code =
          error.type === "entity.too.large"
            ? "REQUEST_TOO_LARGE"
            : "INVALID_JSON";
        return next(
          new HttpException(
            { code, message: code },
            code === "REQUEST_TOO_LARGE" ? 413 : 400,
          ),
        );
      }
      next(error);
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: c.origins,
    credentials: true,
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "Idempotency-Key",
      "X-VMS-Client",
    ],
    exposedHeaders: ["X-Request-Id"],
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );
  app.enableShutdownHooks();
  if (!c.production) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("VMS API")
        .setVersion("1.0.0")
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup("api/docs", app, doc);
  }
  return app;
}
