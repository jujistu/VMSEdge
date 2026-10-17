import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { PassportModule, PassportStrategy } from "@nestjs/passport";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { argon2id, hash, verify } from "argon2";
import { sign, verify as verifyJwt } from "jsonwebtoken";
import { ClientSession } from "mongoose";
import { randomUUID } from "node:crypto";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Actor, fail, oid, Role, safe } from "../common/domain";
import {
  ChangePasswordDto,
  ForgotDto,
  LoginDto,
  ResetDto,
} from "../common/dto";
import { CurrentUser, originCheck, Public, Roles } from "../common/http";
import { CONFIG, Configuration } from "../config/config";
import { Database } from "../infrastructure/database";
import {
  CryptoService,
  digest,
  Journal,
  randomToken,
} from "../infrastructure/services";
export const passwordHash = (password: string) =>
  hash(password, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
@Injectable()
export class AuthService {
  private readonly dummyHash = passwordHash(randomToken());
  constructor(
    private db: Database,
    private journal: Journal,
    private crypto: CryptoService,
    @Inject(CONFIG) readonly c: Configuration,
  ) {}
  async issue(user: any, session: any, generation: number, s: ClientSession) {
    const token = randomToken(),
      now = new Date();
    const [record] = await this.db.m("refreshTokens").create(
      [
        {
          sessionId: session._id,
          tokenHash: digest(token),
          generation,
          status: "ACTIVE",
          issuedAt: now,
          expiresAt: new Date(
            Math.min(
              +session.absoluteExpiresAt,
              +now + this.c.refreshTtl * 1000,
            ),
          ),
          purgeAt: new Date(+session.absoluteExpiresAt + 86400000),
        },
      ],
      { session: s },
    );
    const accessToken = sign({ sid: String(session._id) }, this.c.privateKey, {
      algorithm: "RS256",
      keyid: this.c.keyId,
      issuer: this.c.issuer,
      audience: this.c.audience,
      subject: String(user._id),
      jwtid: randomUUID(),
      expiresIn: this.c.accessTtl,
    });
    return {
      accessToken,
      expiresIn: this.c.accessTtl,
      user: safe(user),
      refresh: token,
      refreshId: record._id,
    };
  }
  async login(dto: LoginDto, ctx: any) {
    const user: any = await this.db
      .m("users")
      .findOne({ email: dto.email })
      .lean();
    const good = user
      ? await verify(user.passwordHash, dto.password)
      : await verify(await this.dummyHash, dto.password);
    if (!user || !good || user.status !== "ACTIVE" || user.mustChangePassword) {
      await this.journal.audit(null, "LOGIN_FAILED", "users", null, undefined, {
        requestId: ctx.requestId,
      });
      fail("INVALID_CREDENTIALS", 401);
    }
    return this.db.transaction(async (s) => {
      const current: any = await this.db.m("users").findOneAndUpdate(
        {
          _id: user._id,
          status: "ACTIVE",
          passwordHash: user.passwordHash,
          mustChangePassword: false,
        },
        { $set: { lastLoginAt: new Date() }, $inc: { admissionRevision: 1 } },
        { new: true, session: s },
      );
      if (!current) fail("INVALID_CREDENTIALS", 401);
      const [session] = await this.db.m("sessions").create(
        [
          {
            userId: user._id,
            familyId: randomUUID(),
            absoluteExpiresAt: new Date(Date.now() + this.c.sessionTtl * 1000),
            lastUsedAt: new Date(),
            ipAddress: ctx.ip,
            userAgent: String(ctx.headers["user-agent"] || "").slice(0, 500),
          },
        ],
        { session: s },
      );
      await this.journal.audit(
        {
          id: String(user._id),
          role: user.role,
          ipAddress: ctx.ip,
          requestId: ctx.requestId,
        },
        "LOGIN",
        "users",
        user._id,
        s,
      );
      return this.issue(current, session, 0, s);
    });
  }
  async refresh(raw: string) {
    if (!raw) fail("SESSION_REVOKED", 401);
    const result = await this.db.transaction(async (s) => {
      const token: any = await this.db
        .m("refreshTokens")
        .findOne({ tokenHash: digest(raw) })
        .session(s);
      if (!token) return null;
      const session: any = await this.db
        .m("sessions")
        .findById(token.sessionId)
        .session(s);
      if (
        !session ||
        session.revokedAt ||
        session.absoluteExpiresAt <= new Date()
      )
        return null;
      if (token.status !== "ACTIVE") {
        await this.db.m("sessions").updateOne(
          { _id: session._id },
          {
            $set: { revokedAt: new Date(), revocationReason: "TOKEN_REUSE" },
          },
          { session: s },
        );
        return null;
      }
      if (token.expiresAt <= new Date()) return null;
      const user: any = await this.db
        .m("users")
        .findOneAndUpdate(
          { _id: session.userId, status: "ACTIVE", mustChangePassword: false },
          { $inc: { admissionRevision: 1 } },
          { session: s, new: true },
        );
      if (!user) return null;
      const consumed = await this.db
        .m("refreshTokens")
        .updateOne(
          { _id: token._id, status: "ACTIVE" },
          { $set: { status: "CONSUMED", consumedAt: new Date() } },
          { session: s },
        );
      if (!consumed.modifiedCount) return null;
      await this.db
        .m("sessions")
        .updateOne(
          { _id: session._id },
          { $set: { lastUsedAt: new Date() } },
          { session: s },
        );
      const issued = await this.issue(user, session, token.generation + 1, s);
      await this.db
        .m("refreshTokens")
        .updateOne(
          { _id: token._id },
          { $set: { replacedById: issued.refreshId } },
          { session: s },
        );
      return issued;
    });
    if (!result) fail("SESSION_REVOKED", 401);
    return result;
  }
  async logout(raw?: string, bearer?: string) {
    let claims: any;
    if (bearer?.startsWith("Bearer ")) {
      try {
        claims = verifyJwt(bearer.slice(7), this.c.publicKey, {
          algorithms: ["RS256"],
          issuer: this.c.issuer,
          audience: this.c.audience,
        });
      } catch {
        /* An expired JWT may still have a revocable refresh cookie. */
      }
    }
    if (!raw && !claims?.sid) return { loggedOut: true };
    await this.db.transaction(async (s) => {
      const token: any = raw
        ? await this.db
            .m("refreshTokens")
            .findOne({ tokenHash: digest(raw) })
            .session(s)
        : null;
      const targets: any[] = [];
      if (token) targets.push({ _id: token.sessionId });
      if (claims?.sid && claims?.sub)
        targets.push({ _id: oid(claims.sid), userId: oid(claims.sub) });
      for (const target of targets) {
        const session: any = await this.db
          .m("sessions")
          .findOneAndUpdate(
            { ...target, revokedAt: null },
            { $set: { revokedAt: new Date(), revocationReason: "LOGOUT" } },
            { session: s },
          );
        if (session)
          await this.journal.audit(
            { id: String(session.userId), role: Role.STAFF },
            "LOGOUT",
            "sessions",
            session._id,
            s,
          );
      }
    });
    return { loggedOut: true };
  }
  async setup(user: any, purpose: string, s: ClientSession) {
    const raw = randomToken(),
      expiry = new Date(
        Date.now() + (purpose === "SET_PASSWORD" ? 86400000 : 1800000),
      );
    await this.db
      .m("passwordResetTokens")
      .updateMany(
        { userId: user._id, consumedAt: null },
        { $set: { consumedAt: new Date() } },
        { session: s },
      );
    await this.db.m("passwordResetTokens").create(
      [
        {
          userId: user._id,
          tokenHash: digest(raw),
          purpose,
          expiresAt: expiry,
          purgeAt: new Date(+expiry + 86400000),
        },
      ],
      { session: s },
    );
    await this.journal.event(
      "AUTH_EMAIL",
      user._id,
      {
        encrypted: this.crypto.encrypt(
          JSON.stringify({
            to: user.email,
            url: `${this.c.resetUrl}#token=${raw}`,
            purpose,
            expiresAt: expiry,
          }),
          "outbox",
        ),
      },
      s,
    );
  }
  async forgot(email: string) {
    await this.db.transaction(async (s) => {
      const user: any = await this.db
        .m("users")
        .findOneAndUpdate(
          { email, status: "ACTIVE" },
          { $inc: { admissionRevision: 1 } },
          { session: s, new: true },
        );
      if (user)
        await this.setup(
          user,
          user.mustChangePassword ? "SET_PASSWORD" : "RESET_PASSWORD",
          s,
        );
    });
    return { accepted: true };
  }
  async reset(dto: ResetDto) {
    const encoded = await passwordHash(dto.newPassword);
    await this.db.transaction(async (s) => {
      const token: any = await this.db
        .m("passwordResetTokens")
        .findOneAndUpdate(
          {
            tokenHash: digest(dto.token),
            consumedAt: null,
            expiresAt: { $gt: new Date() },
          },
          { $set: { consumedAt: new Date() } },
          { session: s, new: true },
        );
      if (!token) fail("INVALID_RESET_TOKEN", 400);
      const user: any = await this.db.m("users").findOneAndUpdate(
        { _id: token.userId, status: "ACTIVE" },
        {
          $set: {
            passwordHash: encoded,
            mustChangePassword: false,
            passwordChangedAt: new Date(),
          },
          $inc: { authorizationVersion: 1, admissionRevision: 1 },
        },
        { session: s, new: true },
      );
      if (!user) fail("INVALID_RESET_TOKEN", 400);
      await this.db.m("sessions").updateMany(
        { userId: user._id, revokedAt: null },
        {
          $set: { revokedAt: new Date(), revocationReason: "PASSWORD_RESET" },
        },
        { session: s },
      );
      await this.db
        .m("passwordResetTokens")
        .updateMany(
          { userId: user._id, consumedAt: null },
          { $set: { consumedAt: new Date() } },
          { session: s },
        );
      await this.journal.audit(
        { id: String(user._id), role: user.role },
        "PASSWORD_RESET",
        "users",
        user._id,
        s,
      );
    });
    return { changed: true };
  }
  async change(actor: Actor, dto: ChangePasswordDto) {
    const user: any = await this.db.m("users").findById(actor.id);
    if (!user || !(await verify(user.passwordHash, dto.currentPassword)))
      fail("INVALID_CREDENTIALS", 401);
    const encoded = await passwordHash(dto.newPassword);
    await this.db.transaction(async (s) => {
      const changed = await this.db.m("users").updateOne(
        { _id: user._id, passwordHash: user.passwordHash, status: "ACTIVE" },
        {
          $set: { passwordHash: encoded, passwordChangedAt: new Date() },
          $inc: { authorizationVersion: 1, admissionRevision: 1 },
        },
        { session: s },
      );
      if (!changed.modifiedCount) fail("VERSION_CONFLICT");
      await this.db.m("sessions").updateMany(
        { userId: user._id, revokedAt: null },
        {
          $set: {
            revokedAt: new Date(),
            revocationReason: "PASSWORD_CHANGED",
          },
        },
        { session: s },
      );
      await this.db
        .m("passwordResetTokens")
        .updateMany(
          { userId: user._id, consumedAt: null },
          { $set: { consumedAt: new Date() } },
          { session: s },
        );
      await this.journal.audit(actor, "PASSWORD_CHANGED", "users", user._id, s);
    });
    return { changed: true };
  }
  async me(actor: Actor) {
    return safe(await this.db.m("users").findById(actor.id).lean());
  }
}
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private db: Database,
    @Inject(CONFIG) c: Configuration,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: c.publicKey,
      algorithms: ["RS256"],
      issuer: c.issuer,
      audience: c.audience,
    });
  }
  async validate(payload: any) {
    const user: any = await this.db
      .m("users")
      .findOne({
        _id: oid(payload.sub),
        status: "ACTIVE",
        mustChangePassword: false,
      })
      .lean();
    const session = await this.db.m("sessions").exists({
      _id: oid(payload.sid),
      userId: oid(payload.sub),
      revokedAt: null,
      absoluteExpiresAt: { $gt: new Date() },
    });
    if (!user || !session) fail("SESSION_REVOKED", 401);
    return {
      id: String(user._id),
      role: user.role,
      departmentId: user.departmentId ? String(user.departmentId) : undefined,
      sid: payload.sid,
    };
  }
}
@ApiTags("auth")
@ApiBearerAuth()
@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}
  private cookie(res: any, result: any) {
    res.cookie("vms_refresh", result.refresh, {
      httpOnly: true,
      secure: this.auth.c.production,
      sameSite: "lax",
      path: "/api/v1/auth",
      maxAge: this.auth.c.refreshTtl * 1000,
    });
    const { refresh, refreshId, ...body } = result;
    res.setHeader("Cache-Control", "no-store");
    return body;
  }
  @Public() @Post("login") async login(
    @Body() dto: LoginDto,
    @Req() r: any,
    @Res({ passthrough: true }) res: any,
  ) {
    originCheck(r, this.auth.c);
    return this.cookie(res, await this.auth.login(dto, r));
  }
  @Public() @Post("refresh") async refresh(
    @Req() r: any,
    @Res({ passthrough: true }) res: any,
  ) {
    originCheck(r, this.auth.c);
    return this.cookie(res, await this.auth.refresh(r.cookies?.vms_refresh));
  }
  @Public() @Post("logout") async logout(
    @Req() r: any,
    @Res({ passthrough: true }) res: any,
  ) {
    originCheck(r, this.auth.c);
    const result = await this.auth.logout(
      r.cookies?.vms_refresh,
      r.headers.authorization,
    );
    res.clearCookie("vms_refresh", {
      path: "/api/v1/auth",
      httpOnly: true,
      secure: this.auth.c.production,
      sameSite: "lax",
    });
    return result;
  }
  @Public() @Post("forgot-password") forgot(@Body() dto: ForgotDto) {
    return this.auth.forgot(dto.email);
  }
  @Public() @Post("reset-password") reset(@Body() dto: ResetDto) {
    return this.auth.reset(dto);
  }
  @Roles(...Object.values(Role)) @Post("change-password") change(
    @CurrentUser() a: Actor,
    @Body() d: ChangePasswordDto,
  ) {
    return this.auth.change(a, d);
  }
  @Roles(...Object.values(Role)) @Get("me") me(@CurrentUser() a: Actor) {
    return this.auth.me(a);
  }
}
@Module({
  imports: [PassportModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
