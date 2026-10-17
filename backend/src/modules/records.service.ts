import { Injectable } from "@nestjs/common";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { ClientSession } from "mongoose";
import {
  Actor,
  assertRole,
  fail,
  nonterminal,
  oid,
  Role,
  safe,
  scope,
} from "../common/domain";
import { PageDto } from "../common/dto";
import { Database } from "../infrastructure/database";
import {
  CryptoService,
  Journal,
  randomToken,
} from "../infrastructure/services";
import { AuthService, passwordHash } from "./auth";
export const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function normalizePhone(phone?: string) {
  if (!phone) return undefined;
  const parsed = parsePhoneNumberFromString(phone, "NG");
  if (!parsed?.isValid()) fail("INVALID_PHONE", 400);
  return parsed.number;
}
export function searchTokens(v: any) {
  return [
    ...new Set(
      [
        v.firstName,
        v.lastName,
        `${v.firstName || ""} ${v.lastName || ""}`.trim(),
        v.company,
        v.visitorId,
        v.email,
        v.phone,
        ...String(v.company || "").split(/\s+/),
      ]
        .filter(Boolean)
        .map((x) => String(x).normalize("NFKC").toLowerCase()),
    ),
  ];
}
@Injectable()
export class RecordsService {
  constructor(
    readonly db: Database,
    private journal: Journal,
    private crypto: CryptoService,
    private auth: AuthService,
  ) {}
  async page(name: string, filter: any, q: PageDto, projection?: any) {
    const searchFields: Record<string, string[]> = {
      users: ["firstName", "lastName", "email", "employeeId"],
      departments: ["name", "description"],
    };
    if (q.q && searchFields[name]) {
      const prefix = new RegExp("^" + escaped(q.q.trim()), "i");
      filter = {
        $and: [
          filter,
          { $or: searchFields[name].map((field) => ({ [field]: prefix })) },
        ],
      };
    }
    const sort: any = {
      [q.sortBy || "createdAt"]: q.sortOrder === "asc" ? 1 : -1,
      _id: q.sortOrder === "asc" ? 1 : -1,
    };
    const [rows, total] = await Promise.all([
      this.db
        .m(name)
        .find(filter, projection)
        .sort(sort)
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .maxTimeMS(10000)
        .lean(),
      this.db.m(name).countDocuments(filter).maxTimeMS(10000),
    ]);
    if (name === "blacklist" && rows.length) {
      const people = await this.db
        .m("visitors")
        .find({ _id: { $in: rows.map((r: any) => r.visitorId) } })
        .select("firstName lastName visitorId")
        .lean();
      for (const row of rows as any[]) {
        const person: any = people.find(
          (p: any) => String(p._id) === String(row.visitorId),
        );
        if (person)
          row.visitorName = [person.firstName, person.lastName]
            .filter(Boolean)
            .join(" ");
      }
    }
    return {
      data: safe(rows),
      meta: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    };
  }
  async get(name: string, id: string, filter: any = {}, s?: ClientSession) {
    const r: any = await this.db
      .m(name)
      .findOne({ _id: oid(id), ...filter })
      .session(s || null);
    if (!r) fail("RESOURCE_NOT_FOUND", 404);
    return r;
  }
  async touchActor(a: Actor, s: ClientSession) {
    const actor = await this.db
      .m("users")
      .findOneAndUpdate(
        { _id: oid(a.id), status: "ACTIVE", role: a.role },
        { $inc: { admissionRevision: 1 } },
        { session: s },
      );
    if (!actor) fail("FORBIDDEN", 403);
  }
  async departmentActive(id: string, s: ClientSession) {
    const d: any = await this.db
      .m("departments")
      .findOneAndUpdate(
        { _id: oid(id), status: "ACTIVE" },
        { $inc: { admissionRevision: 1 } },
        { session: s, new: true },
      );
    if (!d) fail("DEPARTMENT_UNAVAILABLE", 422);
    return d;
  }
  async userCreate(a: Actor, d: any) {
    assertRole(a, Role.ADMIN);
    const encoded = await passwordHash(randomToken());
    return this.db.transaction(async (s) => {
      await this.touchActor(a, s);
      if (d.role === Role.STAFF && !d.departmentId)
        fail("DEPARTMENT_REQUIRED", 400);
      if (d.departmentId) await this.departmentActive(d.departmentId, s);
      const [user] = await this.db.m("users").create(
        [
          {
            ...d,
            phone: normalizePhone(d.phone),
            passwordHash: encoded,
            mustChangePassword: true,
          },
        ],
        { session: s },
      );
      await this.auth.setup(user, "SET_PASSWORD", s);
      await this.journal.audit(a, "CREATE_USER", "users", user._id, s, {
        role: user.role,
      });
      return safe(user);
    });
  }
  async userUpdate(a: Actor, id: string, d: any, statusChange = false) {
    assertRole(a, Role.ADMIN);
    return this.db.transaction(async (s) => {
      await this.touchActor(a, s);
      await this.db
        .m("counters")
        .findOneAndUpdate(
          { _id: "authorization-control" },
          { $inc: { value: 1 } },
          { upsert: true, session: s },
        );
      const u: any = await this.get("users", id, {}, s);
      if (u.version !== d.version) fail("VERSION_CONFLICT");
      const nextRole = d.role || u.role,
        nextStatus = d.status || u.status;
      if (
        u.role === "ADMIN" &&
        u.status === "ACTIVE" &&
        (nextRole !== "ADMIN" || nextStatus !== "ACTIVE") &&
        (await this.db
          .m("users")
          .countDocuments({ role: "ADMIN", status: "ACTIVE" })
          .session(s)) <= 1
      )
        fail("LAST_ADMIN");
      if (
        (nextStatus === "DISABLED" ||
          (u.role === "STAFF" && nextRole !== "STAFF")) &&
        (await this.db
          .m("visits")
          .exists({ hostId: u._id, status: { $in: nonterminal } })
          .session(s))
      )
        fail("HOST_HAS_OPEN_VISITS");
      const dep = d.departmentId || u.departmentId;
      if (nextRole === "STAFF" && !dep) fail("DEPARTMENT_REQUIRED", 400);
      if (dep && (d.departmentId || nextStatus === "ACTIVE"))
        await this.departmentActive(String(dep), s);
      const { version, reason, ...changes } = d;
      if (changes.phone) changes.phone = normalizePhone(changes.phone);
      const changed: any = await this.db.m("users").findOneAndUpdate(
        { _id: u._id, version },
        {
          $set: changes,
          $inc: { version: 1, admissionRevision: 1, authorizationVersion: 1 },
        },
        { session: s, new: true },
      );
      if (!changed) fail("VERSION_CONFLICT");
      if (d.status === "DISABLED" || d.role || d.email) {
        await this.db.m("sessions").updateMany(
          { userId: u._id, revokedAt: null },
          {
            $set: {
              revokedAt: new Date(),
              revocationReason: "ACCOUNT_CHANGED",
            },
          },
          { session: s },
        );
      }
      if (d.email && d.email !== u.email) {
        await this.db
          .m("passwordResetTokens")
          .updateMany(
            { userId: u._id, consumedAt: null },
            { $set: { consumedAt: new Date() } },
            { session: s },
          );
        if (u.mustChangePassword)
          await this.auth.setup(changed, "SET_PASSWORD", s);
      }
      await this.journal.audit(
        a,
        statusChange && d.status === "DISABLED"
          ? "DISABLE_USER"
          : "UPDATE_USER",
        "users",
        u._id,
        s,
        { fields: Object.keys(changes), reason },
      );
      return safe(changed);
    });
  }
  async selfUpdate(a: Actor, d: any) {
    return this.db.transaction(async (s) => {
      await this.touchActor(a, s);
      if (d.phone) d.phone = normalizePhone(d.phone);
      const u = await this.db
        .m("users")
        .findByIdAndUpdate(
          a.id,
          { $set: d, $inc: { version: 1 } },
          { session: s, new: true },
        );
      await this.journal.audit(a, "UPDATE_USER", "users", oid(a.id), s, {
        fields: Object.keys(d),
      });
      return safe(u);
    });
  }
  async resendSetup(a: Actor, id: string) {
    assertRole(a, Role.ADMIN);
    return this.db.transaction(async (s) => {
      await this.touchActor(a, s);
      const u: any = await this.db
        .m("users")
        .findOneAndUpdate(
          { _id: oid(id), mustChangePassword: true, status: "ACTIVE" },
          { $inc: { admissionRevision: 1 } },
          { session: s, new: true },
        );
      if (!u) fail("SETUP_NOT_AVAILABLE");
      await this.auth.setup(u, "SET_PASSWORD", s);
      await this.journal.audit(a, "RESEND_SETUP", "users", u._id, s);
      return { queued: true };
    });
  }
  async departmentCreate(a: Actor, d: any) {
    return this.db.transaction(async (s) => {
      await this.touchActor(a, s);
      const [r] = await this.db
        .m("departments")
        .create([{ ...d, normalizedName: d.name.toLowerCase() }], {
          session: s,
        });
      await this.journal.audit(a, "CREATE_DEPARTMENT", "departments", r._id, s);
      return safe(r);
    });
  }
  async departmentUpdate(a: Actor, id: string, d: any) {
    return this.db.transaction(async (s) => {
      await this.touchActor(a, s);
      const r = await this.get("departments", id, {}, s);
      if (r.version !== d.version) fail("VERSION_CONFLICT");
      if (d.status === "ARCHIVED") {
        if (
          (await this.db
            .m("users")
            .exists({ departmentId: r._id, status: "ACTIVE" })
            .session(s)) ||
          (await this.db
            .m("visits")
            .exists({ departmentId: r._id, status: { $in: nonterminal } })
            .session(s))
        )
          fail("DEPARTMENT_IN_USE");
      }
      const { version, ...changes } = d;
      if (changes.name) changes.normalizedName = changes.name.toLowerCase();
      const updated = await this.db
        .m("departments")
        .findOneAndUpdate(
          { _id: r._id, version },
          { $set: changes, $inc: { version: 1, admissionRevision: 1 } },
          { session: s, new: true },
        );
      if (!updated) fail("VERSION_CONFLICT");
      await this.journal.audit(
        a,
        d.status === "ARCHIVED" ? "ARCHIVE_DEPARTMENT" : "UPDATE_DEPARTMENT",
        "departments",
        r._id,
        s,
      );
      return safe(updated);
    });
  }
  visitorFields(d: any) {
    const { idNumber, ...rest } = d;
    const fields: any = { ...rest };
    if (d.phone) fields.phone = normalizePhone(d.phone);
    if (!d.email && !d.phone) fail("VISITOR_CONTACT_REQUIRED", 400);
    if (idNumber && !d.idType) fail("ID_TYPE_REQUIRED", 400);
    if (idNumber) fields.idNumberEncrypted = this.crypto.encrypt(idNumber);
    fields.normalizedEmail = d.email?.toLowerCase();
    fields.normalizedPhone = fields.phone;
    fields.searchTokens = searchTokens(fields);
    return fields;
  }
  async visitorCreate(a: Actor, d: any, s: ClientSession) {
    const visitorId = await this.journal.code("VST", s);
    const [v] = await this.db
      .m("visitors")
      .create([{ ...this.visitorFields({ ...d, visitorId }) }], { session: s });
    await this.journal.audit(a, "REGISTER_VISITOR", "visitors", v._id, s);
    return v;
  }
  async createPerson(a: Actor, d: any) {
    return this.db.transaction(async (s) => {
      await this.touchActor(a, s);
      return safe(await this.visitorCreate(a, d, s));
    });
  }
  async visitorUpdate(a: Actor, id: string, d: any, statusOnly = false) {
    return this.db.transaction(async (s) => {
      await this.touchActor(a, s);
      const v: any = await this.get("visitors", id, {}, s);
      if (v.version !== d.version) fail("VERSION_CONFLICT");
      if (
        d.status === "ARCHIVED" &&
        (await this.db
          .m("visits")
          .exists({ visitorId: v._id, status: { $in: nonterminal } })
          .session(s))
      )
        fail("VISITOR_HAS_OPEN_VISITS");
      const { version, ...updates } = d;
      const fields = statusOnly
        ? updates
        : this.visitorFields({ ...v.toObject(), ...updates });
      delete fields._id;
      delete fields.createdAt;
      delete fields.updatedAt;
      delete fields.version;
      delete fields.admissionRevision;
      const changed = await this.db
        .m("visitors")
        .findOneAndUpdate(
          { _id: v._id, version },
          { $set: fields, $inc: { version: 1, admissionRevision: 1 } },
          { session: s, new: true },
        );
      if (!changed) fail("VERSION_CONFLICT");
      await this.journal.audit(a, "UPDATE_VISITOR", "visitors", v._id, s, {
        fields: Object.keys(updates),
      });
      return safe(changed);
    });
  }
  async visitorGet(a: Actor, id: string) {
    const v: any = await this.get("visitors", id);
    if (
      a.role === Role.STAFF &&
      !(await this.db.m("visits").exists({ visitorId: v._id, ...scope(a) }))
    )
      fail("RESOURCE_NOT_FOUND", 404);
    return this.visitorProjection(a, v);
  }
  visitorProjection(a: Actor, v: any) {
    const result = safe(v);
    if (a.role === Role.STAFF) {
      delete result.notes;
      delete result.idType;
      delete result.vehicleRegistrationNumber;
      delete result.itemsCarried;
    }
    return result;
  }
  async visitorPage(a: Actor, q: PageDto) {
    const match: any = {};
    if (q.q)
      match.searchTokens = {
        $regex: `^${escaped(q.q.normalize("NFKC").toLowerCase())}`,
      };
    const pipeline: any[] = [{ $match: match }];
    if (q.q) {
      pipeline.push(
        {
          $unionWith: {
            coll: "visitorInvitations",
            pipeline: [
              { $match: { invitationCode: q.q.toUpperCase() } },
              {
                $lookup: {
                  from: "visits",
                  localField: "visitId",
                  foreignField: "_id",
                  pipeline: [{ $match: scope(a) }],
                  as: "matchingVisit",
                },
              },
              { $unwind: "$matchingVisit" },
              {
                $lookup: {
                  from: "visitors",
                  localField: "matchingVisit.visitorId",
                  foreignField: "_id",
                  as: "person",
                },
              },
              { $unwind: "$person" },
              { $replaceRoot: { newRoot: "$person" } },
            ],
          },
        },
        { $group: { _id: "$_id", document: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$document" } },
      );
    }
    if (a.role === Role.STAFF)
      pipeline.push(
        {
          $lookup: {
            from: "visits",
            let: { visitor: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$visitorId", "$$visitor"] },
                      { $eq: ["$hostId", oid(a.id)] },
                    ],
                  },
                },
              },
              { $limit: 1 },
            ],
            as: "ownVisits",
          },
        },
        { $match: { "ownVisits.0": { $exists: true } } },
      );
    pipeline.push(
      {
        $project: {
          searchVisits: 0,
          searchInvitations: 0,
          ownVisits: 0,
          idNumberEncrypted: 0,
        },
      },
      {
        $facet: {
          data: [
            { $sort: { createdAt: -1, _id: -1 } },
            { $skip: (q.page - 1) * q.limit },
            { $limit: q.limit },
          ],
          total: [{ $count: "value" }],
        },
      },
    );
    const [r] = await this.db
      .m("visitors")
      .aggregate(pipeline)
      .option({ maxTimeMS: 10000 });
    const total = r.total[0]?.value || 0;
    return {
      data: r.data.map((v: any) => this.visitorProjection(a, v)),
      meta: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    };
  }
  async blacklistAdd(a: Actor, d: any) {
    return this.db.transaction(async (s) => {
      await this.touchActor(a, s);
      const v = await this.db
        .m("visitors")
        .findOneAndUpdate(
          { _id: oid(d.visitorId) },
          { $inc: { admissionRevision: 1 } },
          { session: s },
        );
      if (!v) fail("RESOURCE_NOT_FOUND", 404);
      const [b] = await this.db
        .m("blacklist")
        .create([{ ...d, addedBy: oid(a.id) }], { session: s });
      await this.journal.audit(a, "BLACKLIST_VISITOR", "blacklist", b._id, s);
      if (
        await this.db
          .m("visits")
          .exists({ visitorId: v._id, status: "CHECKED_IN" })
          .session(s)
      ) {
        const recipients = await this.db
          .m("users")
          .find({ role: { $in: ["ADMIN", "RECEPTIONIST"] }, status: "ACTIVE" })
          .select("_id")
          .session(s)
          .lean();
        await this.journal.event(
          "VISITOR_BLACKLISTED_WHILE_INSIDE",
          v._id,
          {
            recipients: recipients.map((x) => String(x._id)),
            resourceType: "visitors",
          },
          s,
        );
      }
      return safe(b);
    });
  }
  async blacklistLift(a: Actor, id: string, d: any) {
    return this.db.transaction(async (s) => {
      await this.touchActor(a, s);
      const b: any = await this.get("blacklist", id, {}, s);
      await this.db
        .m("visitors")
        .updateOne(
          { _id: b.visitorId },
          { $inc: { admissionRevision: 1 } },
          { session: s },
        );
      const updated = await this.db.m("blacklist").findOneAndUpdate(
        { _id: b._id, status: "ACTIVE", version: d.version },
        {
          $set: {
            status: "LIFTED",
            liftedBy: oid(a.id),
            liftedAt: new Date(),
            liftReason: d.reason,
          },
          $inc: { version: 1 },
        },
        { session: s, new: true },
      );
      if (!updated) fail("VERSION_CONFLICT");
      await this.journal.audit(a, "LIFT_BLACKLIST", "blacklist", b._id, s);
      return safe(updated);
    });
  }
  async settings() {
    return (
      safe(
        await this.db
          .m("systemSettings")
          .findOne({ key: "organization" })
          .lean(),
      ) || {
        organizationName: "Northstar",
        timezone: "Africa/Lagos",
        earlyArrivalMinutes: 30,
        version: 0,
      }
    );
  }
  async settingsUpdate(a: Actor, d: any) {
    return this.db.transaction(async (s) => {
      await this.touchActor(a, s);
      const { version, ...changes } = d;
      const r = await this.db
        .m("systemSettings")
        .findOneAndUpdate(
          { key: "organization", version },
          { $set: { ...changes, updatedBy: oid(a.id) }, $inc: { version: 1 } },
          { session: s, new: true },
        );
      if (!r) fail("VERSION_CONFLICT");
      await this.journal.audit(
        a,
        "UPDATE_SETTINGS",
        "systemSettings",
        r._id,
        s,
        { fields: Object.keys(changes) },
      );
      return safe(r);
    });
  }
  async blacklistCheck(id: string) {
    const r = await this.db
      .m("blacklist")
      .findOne({ visitorId: oid(id), status: "ACTIVE" })
      .select("reason visitorId")
      .lean();
    return { blocked: !!r, entry: safe(r) };
  }
  async notificationUnread(a: Actor) {
    return {
      count: await this.db
        .m("notifications")
        .countDocuments({ userId: oid(a.id), isRead: false }),
    };
  }
  async notificationRead(a: Actor, id: string) {
    const r = await this.db.m("notifications").findOneAndUpdate(
      { _id: oid(id), userId: oid(a.id) },
      [
        {
          $set: {
            isRead: true,
            readAt: { $ifNull: ["$readAt", new Date()] },
          },
        },
      ],
      { new: true },
    );
    if (!r) fail("RESOURCE_NOT_FOUND", 404);
    return safe(r);
  }
  async notificationsReadAll(a: Actor) {
    const result = await this.db
      .m("notifications")
      .updateMany(
        { userId: oid(a.id), isRead: false },
        { $set: { isRead: true, readAt: new Date() } },
      );
    return { updated: result.modifiedCount };
  }
  async readiness() {
    await this.db.initialize();
    const pending = await this.db
      .m("outboxEvents")
      .countDocuments({ status: { $in: ["PENDING", "PROCESSING"] } });
    const failed = await this.db
      .m("outboxEvents")
      .countDocuments({ status: "FAILED" });
    const oldest: any = await this.db
      .m("outboxEvents")
      .findOne({ status: { $in: ["PENDING", "PROCESSING"] } })
      .sort({ createdAt: 1 })
      .select("createdAt")
      .lean();
    return {
      status: "ok",
      outbox: { pending, failed, oldestPendingAt: oldest?.createdAt },
    };
  }
}
