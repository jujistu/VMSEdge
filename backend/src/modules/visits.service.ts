import { Inject, Injectable } from "@nestjs/common";
import { ClientSession, Types } from "mongoose";
import { randomBytes } from "node:crypto";
import {
  Actor,
  assertRole,
  assertTransition,
  assertWindow,
  fail,
  oid,
  openStatuses,
  own,
  Role,
  safe,
  schedule,
  scope,
} from "../common/domain";
import { CONFIG, Configuration } from "../config/config";
import { VisitQueryDto } from "../common/dto";
import { Database } from "../infrastructure/database";
import { Journal } from "../infrastructure/services";
import { escaped, RecordsService } from "./records.service";
@Injectable()
export class VisitsService {
  constructor(
    readonly db: Database,
    private journal: Journal,
    private records: RecordsService,
    @Inject(CONFIG) private config: Configuration,
  ) {}
  async queueInvitation(visit: any, session: ClientSession) {
    if (
      !this.config.emailAutomation ||
      !["EXPECTED", "CANCELLED"].includes(visit.status)
    )
      return false;
    const visitor: any = await this.db
      .m("visitors")
      .findById(visit.visitorId)
      .session(session)
      .lean();
    if (!visitor?.email) return false;
    await this.journal.event(
      "INVITATION_EMAIL",
      visit._id,
      { version: visit.version },
      session,
    );
    return true;
  }
  async emailStatus(visit: any, session?: ClientSession) {
    if (!this.config.emailAutomation)
      return { deliveryMode: "MANUAL", deliveryStatus: "DISABLED" };
    if (visit.status === "PRE_REGISTERED")
      return { deliveryMode: "EMAIL", deliveryStatus: "DRAFT" };
    const visitor: any = await this.db
      .m("visitors")
      .findById(visit.visitorId)
      .session(session || null)
      .lean();
    if (!visitor?.email)
      return { deliveryMode: "MANUAL", deliveryStatus: "NO_EMAIL" };
    const event: any = await this.db
      .m("outboxEvents")
      .findOne({
        type: "INVITATION_EMAIL",
        resourceId: visit._id,
      })
      .sort({ createdAt: -1, _id: -1 })
      .session(session || null)
      .lean();
    return {
      deliveryMode: "EMAIL",
      deliveryStatus: !event
        ? "NOT_QUEUED"
        : event.status === "PROCESSED"
          ? "SENT"
          : event.status === "FAILED"
            ? "FAILED"
            : event.status === "SKIPPED"
              ? "SKIPPED"
              : "QUEUED",
    };
  }
  async admission(
    visitorId: any,
    hostId: any,
    departmentId: any,
    s: ClientSession,
  ) {
    const visitor: any = await this.db
      .m("visitors")
      .findOneAndUpdate(
        { _id: visitorId, status: "ACTIVE" },
        { $inc: { admissionRevision: 1 } },
        { session: s, new: true },
      );
    if (!visitor) fail("VISITOR_UNAVAILABLE", 422);
    if (
      await this.db
        .m("blacklist")
        .exists({ visitorId, status: "ACTIVE" })
        .session(s)
    )
      fail("VISITOR_BLOCKED", 403);
    const host: any = await this.db
      .m("users")
      .findOneAndUpdate(
        { _id: hostId, role: "STAFF", status: "ACTIVE" },
        { $inc: { admissionRevision: 1 } },
        { session: s, new: true },
      );
    if (!host) fail("HOST_UNAVAILABLE", 422);
    const department = await this.records.departmentActive(
      String(departmentId),
      s,
    );
    return { visitor, host, department };
  }
  snapshot(v: any, h: any, d: any) {
    return {
      visitorName: `${v.firstName} ${v.lastName || ""}`.trim(),
      visitorPublicId: v.visitorId,
      company: v.company || "",
      hostName: `${h.firstName} ${h.lastName || ""}`.trim(),
      departmentName: d.name,
    };
  }
  async create(
    a: Actor,
    d: any,
    source: "INVITATION" | "WALK_IN",
    key: string,
  ) {
    assertRole(
      a,
      ...(source === "INVITATION"
        ? [Role.ADMIN, Role.STAFF]
        : [Role.ADMIN, Role.RECEPTIONIST]),
    );
    if (a.role === Role.STAFF && d.hostId) fail("HOST_ID_NOT_ALLOWED", 400);
    if (Boolean(d.visitorId) === Boolean(d.visitor))
      fail("SELECT_ONE_VISITOR", 400);
    return this.journal.command(a, key, `create:${source}`, d, async (s) => {
      const hostId = a.role === Role.STAFF ? a.id : d.hostId;
      if (!hostId) fail("HOST_REQUIRED", 400);
      const host: any = await this.records.get("users", hostId, {}, s);
      if (host.role !== "STAFF" || !host.departmentId)
        fail("HOST_UNAVAILABLE", 422);
      let v: any;
      if (d.visitorId) {
        v = await this.records.get("visitors", d.visitorId, {}, s);
        if (
          a.role === Role.STAFF &&
          !(await this.db
            .m("visits")
            .exists({ visitorId: v._id, hostId: oid(a.id) })
            .session(s))
        )
          fail("RESOURCE_NOT_FOUND", 404);
      } else v = await this.records.visitorCreate(a, d.visitor, s);
      const checked = await this.admission(
        v._id,
        host._id,
        host.departmentId,
        s,
      );
      let times = schedule(
        source === "WALK_IN" ? new Date() : d.expectedArrivalAt,
        d.expectedDepartureAt,
      );
      if (times.expectedDepartureAt <= new Date())
        fail("INVALID_DATE_RANGE", 400);
      if (d.primaryVisitId) {
        const primary: any = await this.records.get(
          "visits",
          d.primaryVisitId,
          {},
          s,
        );
        own(a, primary);
        if (
          primary.primaryVisitId ||
          String(primary.hostId) !== String(host._id) ||
          !openStatuses.includes(primary.status) ||
          String(primary.visitorId) === String(v._id)
        )
          fail("INVALID_GUEST_GROUP", 400);
        if (source === "WALK_IN")
          times = {
            expectedArrivalAt: primary.expectedArrivalAt,
            expectedDepartureAt: primary.expectedDepartureAt,
          };
        else if (
          +primary.expectedArrivalAt !== +times.expectedArrivalAt ||
          +primary.expectedDepartureAt !== +times.expectedDepartureAt
        )
          fail("INVALID_GUEST_GROUP", 400);
        await this.db
          .m("visits")
          .updateOne(
            { _id: primary._id, version: primary.version },
            { $inc: { version: 1 } },
            { session: s },
          );
      }
      const visitId = new Types.ObjectId(),
        linkId = new Types.ObjectId();
      const [visit] = await this.db.m("visits").create(
        [
          {
            _id: visitId,
            visitorId: v._id,
            hostId: host._id,
            departmentId: host.departmentId,
            ...times,
            purpose: d.purpose,
            visitorType: d.visitorType,
            source,
            status:
              source === "WALK_IN"
                ? "PENDING"
                : d.draft
                  ? "PRE_REGISTERED"
                  : "EXPECTED",
            registeredBy: oid(a.id),
            primaryVisitId: d.primaryVisitId
              ? oid(d.primaryVisitId)
              : undefined,
            notes: d.notes,
            itemsCarried: d.itemsCarried || v.itemsCarried,
            vehicleRegistrationNumber:
              d.vehicleRegistrationNumber || v.vehicleRegistrationNumber,
            receptionArrivedAt: source === "WALK_IN" ? new Date() : undefined,
            invitationId: source === "INVITATION" ? linkId : undefined,
            visitorRequestId: source === "WALK_IN" ? linkId : undefined,
            snapshot: this.snapshot(
              checked.visitor,
              checked.host,
              checked.department,
            ),
          },
        ],
        { session: s },
      );
      let link: any;
      if (source === "INVITATION") {
        [link] = await this.db.m("visitorInvitations").create(
          [
            {
              _id: linkId,
              visitId,
              invitationCode: await this.journal.code("VMS", s),
              qrIdentifier: randomBytes(16).toString("hex"),
              createdBy: oid(a.id),
            },
          ],
          { session: s },
        );
      } else {
        [link] = await this.db.m("visitorRequests").create(
          [
            {
              _id: linkId,
              visitId,
              requestedBy: oid(a.id),
              requestedAt: new Date(),
            },
          ],
          { session: s },
        );
        await this.journal.event(
          "VISITOR_REQUEST_CREATED",
          visitId,
          { recipients: [String(host._id)], resourceType: "visits" },
          s,
        );
      }
      if (source === "INVITATION") await this.queueInvitation(visit, s);
      await this.journal.audit(
        a,
        source === "INVITATION"
          ? "CREATE_INVITATION"
          : "CREATE_VISITOR_REQUEST",
        source === "INVITATION" ? "visitorInvitations" : "visitorRequests",
        linkId,
        s,
      );
      return { ...safe(link), visit: await this.view(a, visit, s) };
    });
  }
  async load(a: Actor, id: string, s?: ClientSession) {
    const v = await this.records.get("visits", id, scope(a), s);
    return v;
  }
  async view(a: Actor, v: any, s?: ClientSession) {
    const visitor = await this.db
      .m("visitors")
      .findById(v.visitorId)
      .session(s || null)
      .lean();
    const host = await this.db
      .m("users")
      .findById(v.hostId)
      .select("firstName lastName departmentId status role")
      .session(s || null)
      .lean();
    const department = await this.db
      .m("departments")
      .findById(v.departmentId)
      .select("name status")
      .session(s || null)
      .lean();
    const count = await this.db
      .m("visits")
      .countDocuments({ primaryVisitId: v._id })
      .session(s || null);
    const result = safe(v);
    result.visitor = visitor
      ? this.records.visitorProjection(a, visitor)
      : null;
    result.host = safe(host);
    result.department = safe(department);
    if (openStatuses.includes(v.status) && visitor && host && department)
      result.snapshot = this.snapshot(visitor, host, department);
    result.numberOfGuests = count;
    result.expectedDate = new Date(+new Date(v.expectedArrivalAt) + 3600000)
      .toISOString()
      .slice(0, 10);
    result.allowedActions = this.actions(a, v);
    const editable =
      openStatuses.includes(v.status) &&
      new Date(v.expectedDepartureAt) > new Date();
    result.canEditVisit = a.role !== Role.STAFF && editable;
    result.canEditInvitation =
      !!v.invitationId &&
      editable &&
      !v.receptionArrivedAt &&
      ["PRE_REGISTERED", "EXPECTED"].includes(v.status) &&
      (a.role === Role.ADMIN ||
        (a.role === Role.STAFF && String(v.hostId) === a.id));
    if (a.role !== Role.STAFF) {
      const reasons: string[] = [];
      if (!["EXPECTED", "APPROVED"].includes(v.status))
        reasons.push("INVALID_VISIT_TRANSITION");
      if ((visitor as any)?.status !== "ACTIVE")
        reasons.push("VISITOR_UNAVAILABLE");
      if ((host as any)?.status !== "ACTIVE" || (host as any)?.role !== "STAFF")
        reasons.push("HOST_UNAVAILABLE");
      if ((department as any)?.status !== "ACTIVE")
        reasons.push("DEPARTMENT_UNAVAILABLE");
      if (
        await this.db
          .m("blacklist")
          .exists({ visitorId: v.visitorId, status: "ACTIVE" })
          .session(s || null)
      )
        reasons.push("VISITOR_BLOCKED");
      const setting: any = await this.db
        .m("systemSettings")
        .findOne({ key: "organization" })
        .session(s || null)
        .lean();
      try {
        assertWindow(v, new Date(), setting?.earlyArrivalMinutes ?? 30);
      } catch {
        reasons.push("OUTSIDE_CHECK_IN_WINDOW");
      }
      result.eligibility = { eligible: reasons.length === 0, reasons };
      if (reasons.length)
        result.allowedActions = result.allowedActions.filter(
          (x: string) => x !== "check-in",
        );
    }
    if (a.role === Role.STAFF) {
      delete result.itemsCarried;
      delete result.vehicleRegistrationNumber;
    }
    return result;
  }
  actions(a: Actor, v: any) {
    const actions: string[] = [];
    const fresh = new Date(v.expectedDepartureAt) > new Date();
    const owner =
      a.role === Role.ADMIN ||
      (a.role === Role.STAFF && String(v.hostId) === a.id);
    if (v.status === "PENDING" && owner && fresh)
      actions.push("approve", "reject");
    if (a.role !== Role.STAFF) {
      if (["EXPECTED", "APPROVED"].includes(v.status) && fresh)
        actions.push("check-in");
      if (openStatuses.includes(v.status) && !v.receptionArrivedAt && fresh)
        actions.push("arrive");
      if (v.status === "CHECKED_IN") actions.push("check-out");
    }
    if (
      fresh &&
      ((v.source === "INVITATION" &&
        owner &&
        ["PRE_REGISTERED", "EXPECTED"].includes(v.status)) ||
        (v.source === "WALK_IN" &&
          a.role !== Role.STAFF &&
          ["PENDING", "APPROVED"].includes(v.status)))
    )
      actions.push("cancel");
    if (v.status === "PRE_REGISTERED" && owner && fresh)
      actions.push("activate");
    return actions;
  }
  async filter(a: Actor, q: VisitQueryDto, extra: any = {}) {
    const conditions: any[] = [scope(a), extra];
    if (q.groupParent)
      conditions.push({
        primaryVisitId: null,
        status: { $in: openStatuses },
        expectedDepartureAt: { $gt: new Date() },
      });
    if (q.eligible)
      conditions.push({
        status: { $in: ["EXPECTED", "APPROVED"] },
        expectedDepartureAt: { $gt: new Date() },
      });
    for (const field of ["visitorId", "hostId", "departmentId"] as const)
      if (q[field]) conditions.push({ [field]: oid(q[field]!) });
    for (const field of ["status", "source", "visitorType"] as const)
      if (q[field]) conditions.push({ [field]: q[field] });
    if (q.company) conditions.push({ "snapshot.company": q.company });
    if (q.dateFrom || q.dateTo) {
      const from = q.dateFrom
          ? new Date(`${q.dateFrom}T00:00:00+01:00`)
          : undefined,
        to = q.dateTo
          ? new Date(+new Date(`${q.dateTo}T00:00:00+01:00`) + 86400000)
          : undefined;
      if (
        (from && !Number.isFinite(+from)) ||
        (to && !Number.isFinite(+to)) ||
        (from && to && to <= from)
      )
        fail("INVALID_DATE_RANGE", 400);
      conditions.push({
        [q.dateField]: {
          ...(from ? { $gte: from } : {}),
          ...(to ? { $lt: to } : {}),
        },
      });
    }
    if (q.receptionWaiting)
      conditions.push({
        receptionArrivedAt: { $ne: null },
        status: { $in: ["PENDING", "APPROVED", "EXPECTED"] },
        expectedDepartureAt: { $gt: new Date() },
      });
    if (q.q) {
      const term = q.q.normalize("NFKC").toLowerCase();
      const candidates: any[] = [
        { $match: { searchTokens: { $regex: `^${escaped(term)}` } } },
      ];
      if (a.role === Role.STAFF)
        candidates.push(
          {
            $lookup: {
              from: "visits",
              localField: "_id",
              foreignField: "visitorId",
              pipeline: [{ $match: { hostId: oid(a.id) } }, { $limit: 1 }],
              as: "ownedVisits",
            },
          },
          { $match: { "ownedVisits.0": { $exists: true } } },
        );
      candidates.push({ $limit: 10001 }, { $project: { _id: 1 } });
      const people = await this.db
        .m("visitors")
        .aggregate(candidates)
        .option({ maxTimeMS: 10000 });
      if (people.length > 10000) fail("SEARCH_TOO_BROAD", 400);
      const invitations = await this.db
        .m("visitorInvitations")
        .find({
          $or: [{ invitationCode: q.q.toUpperCase() }, { qrIdentifier: q.q }],
        })
        .select("visitId")
        .lean();
      conditions.push({
        $or: [
          { visitorId: { $in: people.map((v) => v._id) } },
          { _id: { $in: invitations.map((i) => i.visitId) } },
        ],
      });
    }
    return { $and: conditions };
  }
  async list(a: Actor, q: VisitQueryDto, extra: any = {}, snapshot = false) {
    const filter = await this.filter(a, q, extra);
    const read = async (s?: ClientSession) => {
      const rows = await this.db
        .m("visits")
        .find(filter)
        .sort({
          [q.sortBy || "createdAt"]: q.sortOrder === "asc" ? 1 : -1,
          _id: -1,
        })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .session(s || null)
        .maxTimeMS(10000)
        .lean();
      const total = await this.db
        .m("visits")
        .countDocuments(filter)
        .session(s || null);
      const data = [];
      for (const v of rows) data.push(await this.view(a, v, s));
      return {
        data,
        meta: {
          page: q.page,
          limit: q.limit,
          total,
          totalPages: Math.ceil(total / q.limit),
          asOf: new Date().toISOString(),
        },
      };
    };
    return snapshot ? this.db.transaction(read) : read();
  }
  async detail(a: Actor, id: string) {
    return this.view(a, await this.load(a, id));
  }
  async linked(
    a: Actor,
    id: string,
    kind: "invitation" | "request",
    s?: ClientSession,
  ) {
    const collection =
      kind === "invitation" ? "visitorInvitations" : "visitorRequests";
    const link: any = await this.records.get(collection, id, {}, s);
    const visit = await this.load(a, String(link.visitId), s);
    return { link, visit };
  }
  async linkedDetail(a: Actor, id: string, kind: "invitation" | "request") {
    const { link, visit } = await this.linked(a, id, kind);
    return {
      ...safe(link),
      status: this.linkStatus(visit.status, kind),
      visit: await this.view(a, visit),
    };
  }
  linkStatus(status: string, kind: string) {
    return kind === "invitation"
      ? (
          {
            PRE_REGISTERED: "DRAFT",
            EXPECTED: "ACTIVE",
            CHECKED_IN: "USED",
            CHECKED_OUT: "USED",
          } as any
        )[status] || status
      : ["CHECKED_IN", "CHECKED_OUT"].includes(status)
        ? "APPROVED"
        : status;
  }
  async linkedList(a: Actor, q: VisitQueryDto, kind: "invitation" | "request") {
    const visits = await this.list(a, q, {
      source: kind === "invitation" ? "INVITATION" : "WALK_IN",
    });
    const data = [];
    for (const v of visits.data) {
      const link = await this.db
        .m(kind === "invitation" ? "visitorInvitations" : "visitorRequests")
        .findById(kind === "invitation" ? v.invitationId : v.visitorRequestId)
        .lean();
      data.push({
        ...safe(link),
        status: this.linkStatus(v.status, kind),
        visit: v,
      });
    }
    return { ...visits, data };
  }
  async action(
    a: Actor,
    id: string,
    action: string,
    d: any,
    key: string,
    kind?: "invitation" | "request",
  ) {
    return this.journal.command(
      a,
      key,
      `${kind || "visit"}:${id}:${action}`,
      d,
      async (s) => {
        const v: any = kind
          ? (await this.linked(a, id, kind, s)).visit
          : await this.load(a, id, s);
        own(a, v);
        if (v.version !== d.version) fail("VERSION_CONFLICT");
        const requiredRole = ["approve", "reject", "activate"].includes(action)
          ? [Role.ADMIN, Role.STAFF]
          : action === "cancel"
            ? v.source === "INVITATION"
              ? [Role.ADMIN, Role.STAFF]
              : [Role.ADMIN, Role.RECEPTIONIST]
            : [Role.ADMIN, Role.RECEPTIONIST];
        assertRole(a, ...requiredRole);
        if (!this.actions(a, v).includes(action))
          fail("INVALID_VISIT_TRANSITION", 409);
        const now = new Date();
        if (openStatuses.includes(v.status) && v.expectedDepartureAt <= now)
          fail("VISIT_EXPIRED");
        let to: string | undefined;
        const changes: any = {};
        if (action === "approve" || action === "reject") {
          assertRole(a, Role.ADMIN, Role.STAFF);
          to = action === "approve" ? "APPROVED" : "REJECTED";
          if (action === "reject" && !d.reason) fail("REASON_REQUIRED", 400);
          await this.db.m("visitorRequests").updateOne(
            { _id: v.visitorRequestId },
            {
              $set: {
                decidedBy: oid(a.id),
                decidedAt: now,
                decisionReason: d.reason,
              },
              $inc: { version: 1 },
            },
            { session: s },
          );
        } else if (action === "activate") to = "EXPECTED";
        else if (action === "cancel") {
          to = "CANCELLED";
          changes.terminalReason = d.reason;
        } else if (action === "arrive") {
          assertRole(a, Role.ADMIN, Role.RECEPTIONIST);
          changes.receptionArrivedAt = now;
        } else if (action === "check-in") {
          assertRole(a, Role.ADMIN, Role.RECEPTIONIST);
          const settings = await this.records.settings();
          assertWindow(v, now, settings.earlyArrivalMinutes);
          const checked = await this.admission(
            v.visitorId,
            v.hostId,
            v.departmentId,
            s,
          );
          changes.snapshot = this.snapshot(
            checked.visitor,
            checked.host,
            checked.department,
          );
          changes.actualCheckInAt = now;
          changes.checkedInBy = oid(a.id);
          to = "CHECKED_IN";
        } else if (action === "check-out") {
          assertRole(a, Role.ADMIN, Role.RECEPTIONIST);
          changes.actualCheckOutAt = now;
          changes.checkedOutBy = oid(a.id);
          to = "CHECKED_OUT";
        } else fail("INVALID_ACTION", 400);
        if (to) {
          assertTransition(v.status, to);
          changes.status = to;
          if (["REJECTED", "CANCELLED"].includes(to)) {
            const visitor = await this.db
              .m("visitors")
              .findById(v.visitorId)
              .session(s);
            const host = await this.db.m("users").findById(v.hostId).session(s);
            const department = await this.db
              .m("departments")
              .findById(v.departmentId)
              .session(s);
            if (visitor && host && department)
              changes.snapshot = this.snapshot(visitor, host, department);
          }
        }
        const changed: any = await this.db
          .m("visits")
          .findOneAndUpdate(
            { _id: v._id, status: v.status, version: d.version },
            { $set: changes, $inc: { version: 1 } },
            { session: s, new: true },
          );
        if (!changed) fail("VERSION_CONFLICT");
        const auditActions: any = {
          approve: "APPROVE_VISITOR",
          reject: "REJECT_VISITOR",
          activate: "ACTIVATE_INVITATION",
          cancel:
            v.source === "INVITATION" ? "CANCEL_INVITATION" : "CANCEL_VISIT",
          arrive: "VISITOR_ARRIVED",
          "check-in": "CHECK_IN",
          "check-out": "CHECK_OUT",
        };
        await this.journal.audit(a, auditActions[action], "visits", v._id, s, {
          from: v.status,
          to: to || v.status,
          adminOverride: a.role === "ADMIN" && String(v.hostId) !== a.id,
          reason: d.reason,
        });
        const eventTypes: any = {
          approve: "VISITOR_REQUEST_APPROVED",
          reject: "VISITOR_REQUEST_REJECTED",
          activate: "INVITATION_ACTIVATED",
          cancel: "VISIT_CANCELLED",
          arrive: "VISITOR_ARRIVED",
          "check-in": "VISITOR_CHECKED_IN",
          "check-out": "VISITOR_CHECKED_OUT",
        };
        const recipients =
          action === "approve" || action === "reject"
            ? [String(v.registeredBy)]
            : action === "cancel"
              ? [String(v.hostId), String(v.registeredBy)]
              : [String(v.hostId)];
        await this.journal.event(
          eventTypes[action],
          v._id,
          { recipients: [...new Set(recipients)], resourceType: "visits" },
          s,
        );
        if (
          v.source === "INVITATION" &&
          (action === "activate" ||
            (action === "cancel" && v.status !== "PRE_REGISTERED"))
        )
          await this.queueInvitation(changed, s);
        return this.view(a, changed, s);
      },
    );
  }
  async update(a: Actor, id: string, d: any, invitation = false) {
    return this.db.transaction(async (s) => {
      await this.records.touchActor(a, s);
      const v: any = invitation
        ? (await this.linked(a, id, "invitation", s)).visit
        : await this.load(a, id, s);
      if (invitation) {
        assertRole(a, Role.ADMIN, Role.STAFF);
        own(a, v);
        if (
          !["PRE_REGISTERED", "EXPECTED"].includes(v.status) ||
          v.receptionArrivedAt
        )
          fail("INVITATION_NOT_EDITABLE");
      } else assertRole(a, Role.ADMIN, Role.RECEPTIONIST);
      if (
        !openStatuses.includes(v.status) ||
        v.expectedDepartureAt <= new Date()
      )
        fail("VISIT_NOT_EDITABLE");
      if (v.version !== d.version) fail("VERSION_CONFLICT");
      const { version, ...changes } = d;
      if (invitation && (d.expectedArrivalAt || d.expectedDepartureAt)) {
        if (
          v.primaryVisitId ||
          (await this.db
            .m("visits")
            .exists({ primaryVisitId: v._id })
            .session(s))
        )
          fail("GROUP_SCHEDULE_IMMUTABLE");
        Object.assign(
          changes,
          schedule(
            d.expectedArrivalAt || v.expectedArrivalAt,
            d.expectedDepartureAt || v.expectedDepartureAt,
          ),
        );
        if (changes.expectedDepartureAt <= new Date())
          fail("INVALID_DATE_RANGE", 400);
      }
      const changed = await this.db
        .m("visits")
        .findOneAndUpdate(
          { _id: v._id, version },
          { $set: changes, $inc: { version: 1 } },
          { session: s, new: true },
        );
      if (!changed) fail("VERSION_CONFLICT");
      await this.journal.audit(
        a,
        invitation ? "UPDATE_INVITATION" : "UPDATE_VISIT",
        "visits",
        v._id,
        s,
        { fields: Object.keys(changes) },
      );
      if (invitation) await this.queueInvitation(changed, s);
      return this.view(a, changed, s);
    });
  }
  async share(a: Actor, id: string) {
    assertRole(a, Role.ADMIN, Role.STAFF);
    const { link, visit } = await this.linked(a, id, "invitation");
    if (
      !["PRE_REGISTERED", "EXPECTED"].includes(visit.status) ||
      visit.expectedDepartureAt <= new Date()
    )
      fail("INVITATION_NOT_SHAREABLE");
    return {
      invitationCode: link.invitationCode,
      qrIdentifier: link.qrIdentifier,
      qrPayload: `vms:invitation:${link.qrIdentifier}`,
      ...(await this.emailStatus(visit)),
    };
  }
  async resend(a: Actor, id: string, d: any, key: string) {
    return this.journal.command(
      a,
      key,
      `invitation:${id}:resend`,
      d,
      async (s) => {
        assertRole(a, Role.ADMIN, Role.STAFF);
        const { link, visit } = await this.linked(a, id, "invitation", s);
        if (visit.version !== d.version) fail("VERSION_CONFLICT");
        if (
          !["PRE_REGISTERED", "EXPECTED"].includes(visit.status) ||
          visit.expectedDepartureAt <= new Date()
        )
          fail("INVITATION_NOT_SHAREABLE");
        await this.db
          .m("visits")
          .updateOne(
            { _id: visit._id, version: d.version },
            { $inc: { version: 1 } },
            { session: s },
          );
        await this.db.m("visitorInvitations").updateOne(
          { _id: link._id },
          {
            $set: { lastSharedAt: new Date() },
            $inc: { shareCount: 1, version: 1 },
          },
          { session: s },
        );
        await this.journal.audit(
          a,
          "SHARE_INVITATION",
          "visitorInvitations",
          link._id,
          s,
        );
        const queued = await this.queueInvitation(
          {
            _id: visit._id,
            visitorId: visit.visitorId,
            status: visit.status,
            version: visit.version + 1,
          },
          s,
        );
        return {
          invitationCode: link.invitationCode,
          qrIdentifier: link.qrIdentifier,
          qrPayload: `vms:invitation:${link.qrIdentifier}`,
          ...(await this.emailStatus(visit, s)),
          ...(queued
            ? { deliveryMode: "EMAIL", deliveryStatus: "QUEUED" }
            : {}),
        };
      },
    );
  }
  async expire() {
    const candidates = await this.db
      .m("visits")
      .find({
        status: { $in: openStatuses },
        expectedDepartureAt: { $lte: new Date() },
      })
      .select("_id version status")
      .limit(500)
      .lean();
    for (const v of candidates)
      await this.db.transaction(async (s) => {
        const changed = await this.db
          .m("visits")
          .findOneAndUpdate(
            { _id: v._id, status: v.status, version: v.version },
            { $set: { status: "EXPIRED" }, $inc: { version: 1 } },
            { session: s, new: true },
          );
        if (changed)
          await this.journal.audit(null, "EXPIRE_VISIT", "visits", v._id, s);
      });
  }
}
