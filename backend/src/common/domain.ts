import { HttpException } from "@nestjs/common";
import { Types } from "mongoose";
export enum Role {
  ADMIN = "ADMIN",
  RECEPTIONIST = "RECEPTIONIST",
  STAFF = "STAFF",
}
export enum VisitStatus {
  PRE_REGISTERED = "PRE_REGISTERED",
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  EXPECTED = "EXPECTED",
  CHECKED_IN = "CHECKED_IN",
  CHECKED_OUT = "CHECKED_OUT",
  CANCELLED = "CANCELLED",
  EXPIRED = "EXPIRED",
}
export enum VisitorType {
  BUSINESS = "BUSINESS",
  CONTRACTOR = "CONTRACTOR",
  DELIVERY = "DELIVERY",
  INTERVIEW = "INTERVIEW",
  PERSONAL = "PERSONAL",
  OTHER = "OTHER",
}
export type Actor = {
  id: string;
  role: Role;
  departmentId?: string;
  sid?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};
export const openStatuses = [
  "PRE_REGISTERED",
  "PENDING",
  "APPROVED",
  "EXPECTED",
];
export const nonterminal = [...openStatuses, "CHECKED_IN"];
export function fail(code: string, status = 409, message = code): never {
  throw new HttpException({ code, message }, status);
}
export function oid(id: string) {
  if (!Types.ObjectId.isValid(id) || !/^[a-f\d]{24}$/i.test(id))
    fail("INVALID_IDENTIFIER", 400);
  return new Types.ObjectId(id);
}
export function scope(actor: Actor) {
  return actor.role === Role.STAFF ? { hostId: oid(actor.id) } : {};
}
export function assertRole(actor: Actor, ...roles: Role[]) {
  if (!roles.includes(actor.role)) fail("FORBIDDEN", 403);
}
export function own(actor: Actor, visit: any) {
  if (actor.role === Role.STAFF && String(visit.hostId) !== actor.id)
    fail("RESOURCE_NOT_FOUND", 404);
}
export const transitions: Record<string, string[]> = {
  PRE_REGISTERED: ["EXPECTED", "CANCELLED", "EXPIRED"],
  PENDING: ["APPROVED", "REJECTED", "CANCELLED", "EXPIRED"],
  APPROVED: ["CHECKED_IN", "CANCELLED", "EXPIRED"],
  EXPECTED: ["CHECKED_IN", "CANCELLED", "EXPIRED"],
  CHECKED_IN: ["CHECKED_OUT"],
};
export function assertTransition(from: string, to: string) {
  if (!transitions[from]?.includes(to)) fail("INVALID_VISIT_TRANSITION");
}
export function assertWindow(visit: any, now: Date, early = 30) {
  if (
    now.getTime() <
      new Date(visit.expectedArrivalAt).getTime() - early * 60000 ||
    now >= new Date(visit.expectedDepartureAt)
  )
    fail("OUTSIDE_CHECK_IN_WINDOW", 422);
}
export function schedule(arrival: string | Date, departure: string | Date) {
  const a = new Date(arrival),
    d = new Date(departure);
  if (
    !Number.isFinite(+a) ||
    !Number.isFinite(+d) ||
    d <= a ||
    +d - +a > 86400000
  )
    fail("INVALID_DATE_RANGE", 400);
  return { expectedArrivalAt: a, expectedDepartureAt: d };
}
export function dayBounds(now = new Date()) {
  const local = new Date(+now + 3600000);
  const start = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
      3600000,
  );
  return { start, end: new Date(+start + 86400000) };
}
export function safe(value: any): any {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Types.ObjectId) return String(value);
  if (Array.isArray(value)) return value.map(safe);
  if (typeof value !== "object") return value;
  const raw = value.toObject ? value.toObject() : value;
  const out: any = {};
  for (const [k, v] of Object.entries(raw)) {
    if (
      [
        "__v",
        "passwordHash",
        "tokenHash",
        "admissionRevision",
        "authorizationVersion",
        "idNumberEncrypted",
        "searchTokens",
        "normalizedName",
        "normalizedEmail",
        "normalizedPhone",
      ].includes(k)
    )
      continue;
    out[k === "_id" ? "id" : k] = safe(v);
  }
  return out;
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[\s]*[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
