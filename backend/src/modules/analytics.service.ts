import { Injectable } from "@nestjs/common";
import { once } from "node:events";
import { Actor, csvCell, dayBounds, fail, oid, Role } from "../common/domain";
import { VisitQueryDto } from "../common/dto";
import { Database } from "../infrastructure/database";
import { Journal } from "../infrastructure/services";
import { VisitsService } from "./visits.service";
@Injectable()
export class AnalyticsService {
  constructor(
    private db: Database,
    private visits: VisitsService,
    private journal: Journal,
  ) {}
  async dashboard(a: Actor, kind: string) {
    const now = new Date(),
      { start, end } = dayBounds(now);
    const ownScope = kind === "staff" ? { hostId: oid(a.id) } : {};
    const today = (field: string) => ({ [field]: { $gte: start, $lt: end } });
    const count = (filter: any) =>
      this.db.m("visits").countDocuments({ ...ownScope, ...filter });
    const [arrivals, inside, expected, pending, out, walkins, waiting] =
      await Promise.all([
        count(today("actualCheckInAt")),
        count({ status: "CHECKED_IN" }),
        count({
          ...today("expectedArrivalAt"),
          status: { $in: ["EXPECTED", "APPROVED"] },
          expectedDepartureAt: { $gt: now },
        }),
        count({ status: "PENDING", expectedDepartureAt: { $gt: now } }),
        count(today("actualCheckOutAt")),
        count({ ...today("createdAt"), source: "WALK_IN" }),
        count({
          status: { $in: ["PENDING", "APPROVED", "EXPECTED"] },
          receptionArrivedAt: { $ne: null },
          expectedDepartureAt: { $gt: now },
        }),
      ]);
    let metrics: any =
      kind === "staff"
        ? {
            expectedToday: expected,
            pendingRequests: pending,
            visitorsWaiting: waiting,
            currentlyMeeting: inside,
          }
        : {
            visitorsToday: arrivals,
            currentlyInside: inside,
            currentlyCheckedIn: inside,
            expectedVisitors: expected,
            pendingApprovals: pending,
            checkedOutToday: out,
            checkedOut: out,
            walkInVisitors: walkins,
          };
    if (kind === "admin") {
      const [totalStaff, totalVisitors, totalDepartments] = await Promise.all([
        this.db.m("users").countDocuments({ role: "STAFF", status: "ACTIVE" }),
        this.db.m("visitors").countDocuments({ status: "ACTIVE" }),
        this.db.m("departments").countDocuments({ status: "ACTIVE" }),
      ]);
      metrics = { ...metrics, totalStaff, totalVisitors, totalDepartments };
    }
    const trendStart = new Date(+start - 6 * 86400000);
    const trend = async (field: string) =>
      this.db
        .m("visits")
        .aggregate([
          { $match: { ...ownScope, [field]: { $gte: trendStart, $lt: end } } },
          {
            $group: {
              _id: {
                $dateToString: {
                  date: `$${field}`,
                  format: "%Y-%m-%d",
                  timezone: "Africa/Lagos",
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .option({ maxTimeMS: 10000 });
    const [arrivalTrend, departureTrend] = await Promise.all([
      trend("actualCheckInAt"),
      trend("actualCheckOutAt"),
    ]);
    const trends = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(+trendStart + i * 86400000 + 3600000)
        .toISOString()
        .slice(0, 10);
      return {
        date,
        arrivals: arrivalTrend.find((r) => r._id === date)?.count || 0,
        departures: departureTrend.find((r) => r._id === date)?.count || 0,
      };
    });
    const recent = await this.visits.list(
      a,
      Object.assign(new VisitQueryDto(), {
        limit: 10,
        sortBy: "actualCheckInAt",
      }),
      { ...ownScope, actualCheckInAt: { $ne: null } },
    );
    const departments =
      kind === "admin"
        ? await this.db.m("visits").aggregate([
            { $match: today("actualCheckInAt") },
            {
              $group: {
                _id: "$departmentId",
                name: { $first: "$snapshot.departmentName" },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
          ])
        : undefined;
    return {
      metrics,
      trends,
      visitorsByDepartment: departments,
      recentVisitors: recent.data,
      timezone: "Africa/Lagos",
      asOf: now,
    };
  }
  authorize(a: Actor, report: string) {
    if (report === "visitor-history") return;
    if (report === "currently-checked-in" && a.role !== Role.STAFF) return;
    if (a.role !== Role.ADMIN) fail("FORBIDDEN", 403);
  }
  range(q: VisitQueryDto) {
    const local = new Date(Date.now() + 3600000);
    const dateFrom =
      q.dateFrom ||
      `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const dateTo = q.dateTo || local.toISOString().slice(0, 10);
    const start = new Date(`${dateFrom}T00:00:00+01:00`),
      end = new Date(+new Date(`${dateTo}T00:00:00+01:00`) + 86400000);
    if (
      !Number.isFinite(+start) ||
      !Number.isFinite(+end) ||
      end <= start ||
      +end - +start > 366 * 86400000
    )
      fail("INVALID_DATE_RANGE", 400);
    return { dateFrom, dateTo };
  }
  async report(a: Actor, name: string, q: VisitQueryDto) {
    this.authorize(a, name);
    if (name === "currently-checked-in")
      return this.visits.list(a, q, { status: "CHECKED_IN" }, true);
    const dates = this.range(q);
    const query = Object.assign(new VisitQueryDto(), q, dates, {
      dateField: name === "visitor-history" ? q.dateField : "actualCheckInAt",
    });
    if (name === "visitor-history") return this.visits.list(a, query);
    const filter = await this.visits.filter(a, query);
    let group: any,
      post: any[] = [];
    if (
      ["daily-visitors", "weekly-visitors", "monthly-visitors"].includes(name)
    ) {
      const unit = name.startsWith("daily")
        ? "day"
        : name.startsWith("weekly")
          ? "week"
          : "month";
      group = {
        _id: {
          $dateTrunc: {
            date: "$actualCheckInAt",
            unit,
            timezone: "Africa/Lagos",
            ...(unit === "week" ? { startOfWeek: "monday" } : {}),
          },
        },
        count: { $sum: 1 },
      };
    } else if (
      name === "by-department" ||
      name === "by-host" ||
      name === "by-company"
    ) {
      const field =
        name === "by-department"
          ? "departmentId"
          : name === "by-host"
            ? "hostId"
            : "snapshot.company";
      group = {
        _id: `$${field}`,
        count: { $sum: 1 },
        name: {
          $first: `$snapshot.${name === "by-department" ? "departmentName" : name === "by-host" ? "hostName" : "company"}`,
        },
      };
    } else if (name === "peak-hours")
      group = {
        _id: { $hour: { date: "$actualCheckInAt", timezone: "Africa/Lagos" } },
        count: { $sum: 1 },
      };
    else if (name === "average-duration") {
      filter.$and.push({
        status: "CHECKED_OUT",
        actualCheckInAt: { $ne: null },
        actualCheckOutAt: { $ne: null },
      });
      group = {
        _id: null,
        averageDurationSeconds: {
          $avg: {
            $divide: [
              { $subtract: ["$actualCheckOutAt", "$actualCheckInAt"] },
              1000,
            ],
          },
        },
        sampleSize: { $sum: 1 },
      };
    } else fail("RESOURCE_NOT_FOUND", 404);
    const pipeline: any[] = [
      { $match: filter },
      { $group: group },
      { $sort: { _id: 1 } },
      ...post,
    ];
    if (name === "average-duration") {
      const result = await this.db
        .m("visits")
        .aggregate(pipeline)
        .option({ maxTimeMS: 15000 });
      return result[0] || { averageDurationSeconds: null, sampleSize: 0 };
    }
    pipeline.push({
      $facet: {
        data: [{ $skip: (q.page - 1) * q.limit }, { $limit: q.limit }],
        total: [{ $count: "value" }],
      },
    });
    const [result] = await this.db
      .m("visits")
      .aggregate(pipeline)
      .option({ maxTimeMS: 15000 });
    const total = result.total[0]?.value || 0;
    return {
      data: result.data,
      meta: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    };
  }
  async export(a: Actor, q: VisitQueryDto, res: any) {
    const name = q.report || "visitor-history";
    this.authorize(a, name);
    const readSession = await this.db.connection.startSession({
      snapshot: true,
    });
    try {
      let cursor: any;
      let fields: string[];
      if (["visitor-history", "currently-checked-in"].includes(name)) {
        const query = Object.assign(
          new VisitQueryDto(),
          q,
          name === "visitor-history" ? this.range(q) : {},
        );
        const filter = await this.visits.filter(
          a,
          query,
          name === "currently-checked-in" ? { status: "CHECKED_IN" } : {},
        );
        if (
          (await this.db
            .m("visits")
            .countDocuments(filter)
            .session(readSession)
            .maxTimeMS(10000)) > 100000
        )
          fail("EXPORT_TOO_LARGE", 400);
        cursor = this.db
          .m("visits")
          .find(filter)
          .session(readSession)
          .sort({ _id: 1 })
          .maxTimeMS(30000)
          .lean()
          .cursor();
        fields = [
          "visitorId",
          "name",
          "company",
          "host",
          "department",
          "status",
          "expectedArrivalAt",
          "actualCheckInAt",
          "actualCheckOutAt",
        ];
      } else {
        const result: any = await this.report(
          a,
          name,
          Object.assign(new VisitQueryDto(), q, { page: 1, limit: 100000 }),
        );
        const rows = result.data || [result];
        fields =
          name === "average-duration"
            ? ["averageDurationSeconds", "sampleSize"]
            : ["_id", "name", "count"];
        cursor = (async function* () {
          for (const row of rows) yield row;
        })();
      }
      await this.journal.audit(a, "EXPORT_REPORT", "reports", null, undefined, {
        report: name,
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${name}.csv"`,
      );
      res.write(fields.map(csvCell).join(",") + "\r\n");
      let closed = false;
      res.on("close", () => {
        closed = true;
        if (cursor.close) void cursor.close();
      });
      try {
        for await (const row of cursor) {
          if (closed) break;
          const data = row.snapshot
            ? {
                ...row,
                visitorId: row.snapshot.visitorPublicId,
                name: row.snapshot.visitorName,
                company: row.snapshot.company,
                host: row.snapshot.hostName,
                department: row.snapshot.departmentName,
              }
            : row;
          const line =
            fields
              .map((k) =>
                csvCell(
                  data[k] instanceof Date ? data[k].toISOString() : data[k],
                ),
              )
              .join(",") + "\r\n";
          if (!res.write(line))
            await Promise.race([once(res, "drain"), once(res, "close")]);
        }
        if (!closed) res.end();
      } finally {
        if (cursor.close) await cursor.close();
      }
    } finally {
      await readSession.endSession();
    }
  }
}
