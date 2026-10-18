import "dotenv/config";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
export function configuration(env: NodeJS.ProcessEnv = process.env) {
  const required = (k: string) => {
    const v = env[k];
    if (!v || /^(change-me|placeholder)$/i.test(v))
      throw new Error(`Missing/invalid ${k}`);
    return v;
  };
  const production = env.NODE_ENV === "production";
  const privateKey = readFileSync(required("JWT_PRIVATE_KEY_PATH"), "utf8");
  const publicKey = readFileSync(required("JWT_PUBLIC_KEY_PATH"), "utf8");
  if (
    createPublicKey(privateKey).export({ type: "spki", format: "pem" }) !==
    createPublicKey(publicKey).export({ type: "spki", format: "pem" })
  )
    throw new Error("JWT keys do not match");
  if (
    (createPrivateKey(privateKey).asymmetricKeyDetails?.modulusLength || 0) <
    2048
  )
    throw new Error("RSA keys must be at least 2048 bits");
  if (
    createPrivateKey(privateKey).asymmetricKeyType !== "rsa" ||
    createPublicKey(publicKey).asymmetricKeyType !== "rsa"
  )
    throw new Error("JWT keys must be RSA");
  const origins = (env.CORS_ORIGINS || required("FRONTEND_ORIGIN"))
    .split(",")
    .map((v) => new URL(v.trim()).origin);
  if (production && origins.some((x) => !x.startsWith("https://")))
    throw new Error("Production origins require HTTPS");
  const key = (k: string) => {
    const v = required(k);
    if (!/^[a-f0-9]{64}$/i.test(v)) throw new Error(`${k} must be 32-byte hex`);
    return v;
  };
  if ((env.ORGANIZATION_TIMEZONE || "Africa/Lagos") !== "Africa/Lagos")
    throw new Error("v1 timezone must be Africa/Lagos");
  if (production) {
    required("SMTP_HOST");
    required("MAIL_FROM");
    required("READINESS_TOKEN");
  }
  const integer = (k: string, d: number) => {
    const n = Number(env[k] ?? d);
    if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid ${k}`);
    return n;
  };
  const boolean = (k: string, fallback = true) => {
    if (env[k] === undefined) return fallback;
    if (!["true", "false"].includes(env[k]!)) throw new Error(`Invalid ${k}`);
    return env[k] === "true";
  };
  const reportHour = Number(env.REPORT_EMAIL_HOUR ?? 8);
  if (!Number.isInteger(reportHour) || reportHour < 0 || reportHour > 23)
    throw new Error("REPORT_EMAIL_HOUR must be 0–23");
  const approvalReminderMinutes = integer("APPROVAL_REMINDER_MINUTES", 5);
  const approvalEscalationMinutes = integer("APPROVAL_ESCALATION_MINUTES", 15);
  if (approvalEscalationMinutes <= approvalReminderMinutes)
    throw new Error("Approval escalation must follow the reminder");
  const trustProxy = Number(env.TRUST_PROXY || 0);
  if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 10)
    throw new Error("TRUST_PROXY must be an integer from 0 to 10");
  if (integer("PORT", 4000) > 65535) throw new Error("Invalid PORT");
  if (env.MONGODB_URI && !/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI))
    throw new Error("MONGODB_URI must use mongodb or mongodb+srv");
  const resetUrl =
    env.RESET_PASSWORD_BASE_URL || `${origins[0]}/reset-password`;
  if (production && !resetUrl.startsWith("https://"))
    throw new Error("Reset URL requires HTTPS");
  return {
    production,
    emailAutomation: boolean("EMAIL_AUTOMATION_ENABLED"),
    reportEmails: boolean("REPORT_EMAILS_ENABLED"),
    visitReminderMinutes: integer("VISIT_REMINDER_MINUTES", 60),
    approvalReminderMinutes,
    approvalEscalationMinutes,
    reportHour,
    mongo: required("MONGODB_URI"),
    port: integer("PORT", 4000),
    privateKey,
    publicKey,
    issuer: env.JWT_ISSUER || "vms",
    audience: env.JWT_AUDIENCE || "vms-web",
    keyId: env.JWT_KEY_ID || "v1",
    accessTtl: integer("ACCESS_TOKEN_TTL", 600),
    sessionTtl: integer("SESSION_TTL", 604800),
    refreshTtl: integer("REFRESH_TOKEN_TTL", 86400),
    origins,
    piiKey: key("PII_ENCRYPTION_KEY"),
    outboxKey: key("OUTBOX_ENCRYPTION_KEY"),
    resetUrl,
    readinessToken: env.READINESS_TOKEN,
    trustProxy,
  };
}
export type Configuration = ReturnType<typeof configuration>;
export const CONFIG = "CONFIG";
