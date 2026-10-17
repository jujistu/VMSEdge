import {
  ArgumentsHost,
  CallHandler,
  CanActivate,
  Catch,
  createParamDecorator,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { map, Observable } from "rxjs";
import { Configuration } from "../config/config";
import { Database } from "../infrastructure/database";
import { digest, Journal } from "../infrastructure/services";
import { Actor, fail, Role, safe } from "./domain";
export const Public = () => SetMetadata("public", true);
export const Roles = (...roles: Role[]) => SetMetadata("roles", roles);
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const r = ctx.switchToHttp().getRequest();
    return {
      ...r.user,
      ipAddress: r.ip,
      userAgent: r.headers["user-agent"],
      requestId: r.requestId,
    } as Actor;
  },
);
@Injectable()
export class JwtGuard extends AuthGuard("jwt") {
  constructor(private reflector: Reflector) {
    super();
  }
  canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride("public", [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    return super.canActivate(ctx);
  }
}
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride("public", [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    const roles = this.reflector.getAllAndOverride<Role[]>("roles", [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles) fail("FORBIDDEN", 403);
    return roles.includes(ctx.switchToHttp().getRequest().user.role);
  }
}
@Injectable()
export class RateGuard implements CanActivate {
  constructor(private db: Database) {}
  async canActivate(ctx: ExecutionContext) {
    const r = ctx.switchToHttp().getRequest();
    if (r.path.includes("/health/")) return true;
    const path = r.path;
    let seconds = 60,
      limit = 120;
    if (path.endsWith("/login")) {
      seconds = 900;
      limit = 30;
    }
    if (path.endsWith("/forgot-password")) {
      seconds = 3600;
      limit = 10;
    }
    if (path.includes("export.csv")) {
      seconds = 60;
      limit = 5;
    }
    await this.take(
      `ip:${r.ip}:${path.includes("/auth/") || path.includes("export.csv") ? path : "api"}`,
      seconds,
      limit,
    );
    if (path.endsWith("/login") || path.endsWith("/forgot-password")) {
      const email =
        typeof r.body?.email === "string"
          ? r.body.email.trim().toLowerCase()
          : "";
      await this.take(
        `account:${path}:${email}`,
        seconds,
        path.endsWith("/login") ? 5 : 3,
      );
    }
    return true;
  }
  async take(key: string, seconds: number, limit: number) {
    const bucket = Math.floor(Date.now() / (seconds * 1000));
    const id = digest(`${key}:${bucket}`);
    const r: any = await this.db.m("rateLimits").findOneAndUpdate(
      { _id: id },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date((bucket + 1) * seconds * 1000) },
      },
      { upsert: true, new: true },
    );
    if (r.count > limit) fail("RATE_LIMIT_EXCEEDED", 429);
  }
}
@Catch()
export class ErrorFilter implements ExceptionFilter {
  constructor(private journal: Journal) {}
  async catch(error: any, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest(),
      res = host.switchToHttp().getResponse();
    let status = error instanceof HttpException ? error.getStatus() : 500;
    let code = "INTERNAL_ERROR",
      message = "An unexpected error occurred",
      details: unknown;
    if (error instanceof HttpException) {
      const body: any = error.getResponse();
      code =
        body.code ||
        (
          {
            400: "VALIDATION_ERROR",
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            404: "RESOURCE_NOT_FOUND",
          } as any
        )[status] ||
        "REQUEST_FAILED";
      message = body.code
        ? body.message
        : typeof body === "string"
          ? body
          : Array.isArray(body.message)
            ? "Invalid request"
            : body.message;
      if (Array.isArray(body.message)) details = body.message;
    } else if (
      error.type === "entity.parse.failed" ||
      error.type === "entity.too.large"
    ) {
      status = error.type === "entity.too.large" ? 413 : 400;
      code = status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON";
      message = code;
    } else if (error.code === 11000) {
      status = 409;
      code = error.message?.includes("one_active_visit")
        ? "ALREADY_CHECKED_IN"
        : error.keyPattern?.email
          ? "DUPLICATE_EMAIL"
          : "DUPLICATE_RECORD";
      message = code;
    } else if (
      ["ValidationError", "CastError", "StrictModeError"].includes(error.name)
    ) {
      status = 400;
      code = "VALIDATION_ERROR";
      message = "Invalid input";
    } else if (/Mongo(Network|ServerSelection)/.test(error.name)) {
      status = 503;
      code = "DATABASE_UNAVAILABLE";
      message = "Service temporarily unavailable";
    }
    if (status >= 500)
      console.error(
        JSON.stringify({
          level: "error",
          requestId: req.requestId,
          errorType: error.name,
          status,
        }),
      );
    if ([400, 403, 404, 409, 422].includes(status) && req.user) {
      try {
        await this.journal.audit(
          { ...req.user, ipAddress: req.ip, requestId: req.requestId },
          "REQUEST_DENIED",
          "http",
          null,
          undefined,
          { code, method: req.method, route: req.route?.path },
        );
      } catch {
        console.error(
          JSON.stringify({
            level: "error",
            requestId: req.requestId,
            error: "DENIAL_AUDIT_FAILED",
          }),
        );
      }
    }
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.status(status).json({
      error: { code, message, ...(details ? { details } : {}) },
      meta: { requestId: req.requestId },
    });
  }
}
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(
      map((result) => {
        if (result?.meta && Array.isArray(result.data))
          return {
            ...result,
            meta: { ...result.meta, requestId: req.requestId },
          };
        return { data: safe(result), meta: { requestId: req.requestId } };
      }),
    );
  }
}
export function requestContext(req: any, res: any, next: () => void) {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  const start = Date.now();
  res.on("finish", () =>
    console.log(
      JSON.stringify({
        level: "info",
        requestId: req.requestId,
        method: req.method,
        route: req.route?.path || "unmatched",
        status: res.statusCode,
        durationMs: Date.now() - start,
        actorId: req.user?.id,
      }),
    ),
  );
  next();
}
export function originCheck(req: any, c: Configuration) {
  if (
    !c.origins.includes(req.headers.origin) ||
    req.headers["x-vms-client"] !== "web"
  ) {
    fail("UNTRUSTED_ORIGIN", 403);
  }
}
export function secretEqual(a: string, b: string) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
