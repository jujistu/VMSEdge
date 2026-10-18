import { Inject, Injectable } from "@nestjs/common";
import { createTransport, SendMailOptions } from "nodemailer";
import { csvCell, Role } from "../common/domain";
import { displayDate, invitationCalendar } from "../common/dates";
import { VisitQueryDto } from "../common/dto";
import { CONFIG, Configuration } from "../config/config";
import { AnalyticsService } from "../modules/analytics.service";
import { Database } from "./database";

export async function sendEmail(eventId: string, mail: SendMailOptions) {
  const transport = createTransport({
    host: process.env.SMTP_HOST || "localhost",
    port: Number(process.env.SMTP_PORT || 1025),
    secure: process.env.SMTP_SECURE === "true",
    ...(process.env.SMTP_USERNAME
      ? {
          auth: {
            user: process.env.SMTP_USERNAME,
            pass: process.env.SMTP_PASSWORD,
          },
        }
      : {}),
    connectionTimeout: 10000,
    socketTimeout: 20000,
  });
  try {
    const result = await transport.sendMail({
      from: process.env.MAIL_FROM || "vms@localhost",
      ...mail,
      messageId: `<${eventId}@vms.local>`,
    });
    if (result.rejected?.length) throw new Error("EMAIL_RECIPIENT_REJECTED");
  } finally {
    transport.close();
  }
}

@Injectable()
export class EmailAutomation {
  constructor(
    private db: Database,
    @Inject(CONFIG) private c: Configuration,
  ) {}

  // Stable IDs make repeated scans/multiple workers safe without another collection.
  async enqueue(eventId: string, type: string, resourceId: any, payload: any) {
    try {
      await this.db.m("outboxEvents").updateOne(
        { eventId },
        {
          $setOnInsert: { type, resourceId, payload },
        },
        { upsert: true },
      );
    } catch (error: any) {
      if (error.code !== 11000) throw error;
    }
  }
  async tick(now = new Date(), shouldStop: () => boolean = () => false) {
    if (!this.c.emailAutomation) return;
    const reminders = this.db
      .m("visits")
      .find({
        source: "INVITATION",
        status: "EXPECTED",
        receptionArrivedAt: null,
        expectedArrivalAt: {
          $gt: now,
          $lte: new Date(+now + this.c.visitReminderMinutes * 60000),
        },
      })
      .lean()
      .cursor();
    for await (const v of reminders) {
      if (shouldStop()) break;
      await this.enqueue(
        `visit-reminder-${v._id}-${+v.expectedArrivalAt}`,
        "VISIT_REMINDER_EMAIL",
        v._id,
        { arrival: v.expectedArrivalAt.toISOString() },
      );
    }
    const waiting = this.db
      .m("visits")
      .find({
        status: "PENDING",
        receptionArrivedAt: {
          $lte: new Date(+now - this.c.approvalReminderMinutes * 60000),
        },
        expectedDepartureAt: { $gt: now },
      })
      .lean()
      .cursor();
    for await (const v of waiting) {
      if (shouldStop()) break;
      await this.approval(v, String(v.hostId), false);
      if (
        +now - +v.receptionArrivedAt >=
        this.c.approvalEscalationMinutes * 60000
      ) {
        const admins = this.db
          .m("users")
          .find({ role: "ADMIN", status: "ACTIVE" })
          .select("_id")
          .lean()
          .cursor();
        for await (const admin of admins) {
          if (shouldStop()) break;
          await this.approval(v, String(admin._id), true);
        }
      }
    }
    if (!this.c.reportEmails || shouldStop()) return;
    const local = new Date(+now + 3600000);
    if (local.getUTCHours() < this.c.reportHour) return;
    const reportDate = new Date(+local - 86400000).toISOString().slice(0, 10);
    const admins = this.db
      .m("users")
      .find({ role: "ADMIN", status: "ACTIVE" })
      .select("_id")
      .lean()
      .cursor();
    for await (const admin of admins) {
      if (shouldStop()) break;
      await this.enqueue(
        `daily-report-${admin._id}-${reportDate}`,
        "REPORT_EMAIL",
        admin._id,
        { reportDate },
      );
    }
  }
  private async approval(visit: any, recipient: string, escalation: boolean) {
    const key = `${escalation ? "approval-escalation" : "approval-reminder"}-${visit._id}-${recipient}`;
    const payload = {
      recipient,
      escalation,
      recipients: [recipient],
      resourceType: "visits",
      title: escalation
        ? "Visitor approval needs attention"
        : "Visitor waiting for your approval",
      message:
        "A visitor is still waiting at reception. Open the visit to review the request.",
    };
    await this.enqueue(
      `${key}-notification`,
      escalation ? "APPROVAL_ESCALATION" : "APPROVAL_REMINDER",
      visit._id,
      payload,
    );
    await this.enqueue(`${key}-email`, "APPROVAL_EMAIL", visit._id, payload);
  }
}

@Injectable()
export class OperationalEmailDelivery {
  constructor(
    private db: Database,
    private analytics: AnalyticsService,
    @Inject(CONFIG) private c: Configuration,
  ) {}

  async deliver(event: any): Promise<boolean> {
    if (!this.c.emailAutomation) return false;
    if (event.type === "REPORT_EMAIL") return this.report(event);
    const v: any = await this.db.m("visits").findById(event.resourceId).lean();
    if (!v) return false;
    if (event.type === "APPROVAL_EMAIL") {
      if (v.status !== "PENDING" || v.expectedDepartureAt <= new Date())
        return false;
      const user: any = await this.db
        .m("users")
        .findOne({
          _id: event.payload.recipient,
          status: "ACTIVE",
          ...(event.payload.escalation
            ? { role: "ADMIN" }
            : { _id: v.hostId, role: "STAFF" }),
        })
        .lean();
      if (!user?.email) return false;
      await sendEmail(event.eventId, {
        to: user.email,
        subject: event.payload.escalation
          ? "Gatewise: visitor approval needs attention"
          : "Gatewise: visitor waiting for approval",
        text: `${v.snapshot.visitorName} is waiting to see ${v.snapshot.hostName}.\nArrived: ${displayDate(v.receptionArrivedAt)} WAT\nPlease sign in to Gatewise to review the request.\n${this.c.origins[0]}`,
      });
      return true;
    }
    const reminder = event.type === "VISIT_REMINDER_EMAIL";
    if (reminder) {
      if (
        v.status !== "EXPECTED" ||
        v.receptionArrivedAt ||
        v.expectedArrivalAt <= new Date() ||
        v.expectedArrivalAt.toISOString() !== event.payload.arrival
      )
        return false;
    } else {
      if (!["EXPECTED", "CANCELLED"].includes(v.status)) return false;
      const latest: any = await this.db
        .m("outboxEvents")
        .findOne({ type: "INVITATION_EMAIL", resourceId: v._id })
        .sort({ createdAt: -1, _id: -1 })
        .lean();
      if (latest?.eventId !== event.eventId) return false;
    }
    if (v.status !== "CANCELLED" && v.expectedDepartureAt <= new Date())
      return false;
    const visitor: any = await this.db
      .m("visitors")
      .findOne({ _id: v.visitorId, status: "ACTIVE" })
      .lean();
    const host: any = await this.db
      .m("users")
      .findOne({ _id: v.hostId, role: "STAFF", status: "ACTIVE" })
      .lean();
    const department = await this.db
      .m("departments")
      .exists({ _id: v.departmentId, status: "ACTIVE" });
    if (!visitor?.email || !host || !department) return false;
    if (
      v.status !== "CANCELLED" &&
      (await this.db
        .m("blacklist")
        .exists({ visitorId: v.visitorId, status: "ACTIVE" }))
    )
      return false;
    const invitation: any = await this.db
      .m("visitorInvitations")
      .findById(v.invitationId)
      .lean();
    if (!invitation) return false;
    const settings: any = await this.db
      .m("systemSettings")
      .findOne({ key: "organization" })
      .lean();
    const organization = settings?.organizationName || "Gatewise";
    const cancelled = v.status === "CANCELLED";
    await sendEmail(event.eventId, {
      to: visitor.email,
      subject: `${organization}: ${cancelled ? "visit cancelled" : reminder ? "upcoming visit reminder" : "visitor invitation"}`,
      text: `Hello ${visitor.firstName},\n\n${cancelled ? "Your visit has been cancelled." : reminder ? "A reminder about your upcoming visit." : "You are invited to visit " + organization + "."}\n\nHost: ${v.snapshot.hostName}\nDepartment: ${v.snapshot.departmentName}\nArrival: ${displayDate(v.expectedArrivalAt)}\nDeparture: ${displayDate(v.expectedDepartureAt)}\nAll times: Africa/Lagos (WAT, UTC+01:00)\nInvitation code: ${invitation.invitationCode}\n\nPlease present this code at reception. Admission is subject to reception checks.`,
      attachments: [
        {
          filename: "visit.ics",
          content: invitationCalendar(v, invitation.invitationCode),
          contentType: "text/calendar; charset=utf-8; method=PUBLISH",
        },
      ],
    });
    return true;
  }
  private async report(event: any) {
    if (!this.c.reportEmails) return false;
    const user: any = await this.db
      .m("users")
      .findOne({ _id: event.resourceId, role: "ADMIN", status: "ACTIVE" })
      .lean();
    if (!user?.email) return false;
    const date = event.payload.reportDate;
    const actor = { id: String(user._id), role: Role.ADMIN };
    const q = Object.assign(new VisitQueryDto(), {
      dateFrom: date,
      dateTo: date,
      page: 1,
      limit: 100000,
    });
    // Aggregates only: no visitor identity or admission data in scheduled attachments.
    const names = [
      "daily-visitors",
      "by-department",
      "by-host",
      "by-company",
      "average-duration",
      "peak-hours",
    ];
    const attachments = [];
    for (const name of names) {
      const result: any = await this.analytics.report(actor, name, q);
      const rows = result.data || [result];
      const fields =
        name === "average-duration"
          ? ["averageDurationSeconds", "sampleSize"]
          : ["_id", "name", "count"];
      const content =
        [
          fields.map(csvCell).join(","),
          ...rows.map((row: any) =>
            fields
              .map((k) =>
                csvCell(row[k] instanceof Date ? displayDate(row[k]) : row[k]),
              )
              .join(","),
          ),
        ].join("\r\n") + "\r\n";
      attachments.push({
        filename: `${name}-${date}.csv`,
        content,
        contentType: "text/csv; charset=utf-8",
      });
    }
    await sendEmail(event.eventId, {
      to: user.email,
      subject: `Gatewise daily reports: ${date}`,
      text: `Visitor reports for ${date} (Africa/Lagos).\nGenerated: ${displayDate(new Date())} WAT\nThe attached CSV files summarize actual check-ins for the report date.`,
      attachments,
    });
    return true;
  }
}
