import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { displayDate } from "../common/dates";
import { OperationalEmailDelivery, sendEmail } from "./email-automation";
import { oid } from "../common/domain";
import { CONFIG, Configuration } from "../config/config";
import { Database } from "./database";
import { CryptoService } from "./services";
export interface DeliveryAdapter {
  deliver(event: any): Promise<void>;
}
@Injectable()
export class InAppDelivery implements DeliveryAdapter {
  constructor(private db: Database) {}
  async deliver(event: any) {
    for (const recipient of event.payload.recipients || []) {
      if (["APPROVAL_REMINDER", "APPROVAL_ESCALATION"].includes(event.type)) {
        const visit: any = await this.db
          .m("visits")
          .findById(event.resourceId)
          .lean();
        if (
          !visit ||
          visit.status !== "PENDING" ||
          visit.expectedDepartureAt <= new Date()
        )
          return;
        const active = await this.db
          .m("users")
          .exists({
            _id: oid(recipient),
            status: "ACTIVE",
            ...(event.type === "APPROVAL_ESCALATION"
              ? { role: "ADMIN" }
              : { _id: visit.hostId, role: "STAFF" }),
          });
        if (!active) continue;
      }
      const title =
        event.payload.title || event.type.toLowerCase().replaceAll("_", " ");
      await this.db.m("notifications").updateOne(
        { userId: oid(recipient), eventId: event.eventId, type: event.type },
        {
          $setOnInsert: {
            title: title[0].toUpperCase() + title.slice(1),
            message:
              event.payload.message || "Open the linked record to see details.",
            resourceType: event.payload.resourceType || "visits",
            resourceId: event.resourceId,
            isRead: false,
          },
        },
        { upsert: true },
      );
    }
  }
}
@Injectable()
export class AuthenticationEmailDelivery implements DeliveryAdapter {
  constructor(
    private crypto: CryptoService,
    @Inject(CONFIG) private c: Configuration,
  ) {}
  async deliver(event: any) {
    const p = JSON.parse(
      this.crypto.decrypt(event.payload.encrypted, "outbox"),
    );
    if (new Date(p.expiresAt) <= new Date()) return;
    await sendEmail(event.eventId, {
      to: p.to,
      subject:
        p.purpose === "SET_PASSWORD"
          ? "Set up your VMS account"
          : "Reset your VMS password",
      text: `Use this single-use link before ${displayDate(p.expiresAt)} WAT (Africa/Lagos):\n${p.url}`,
    });
  }
}
@Injectable()
export class OutboxWorker {
  constructor(
    private db: Database,
    private inApp: InAppDelivery,
    private email: AuthenticationEmailDelivery,
    private operationalEmail: OperationalEmailDelivery,
  ) {}
  async tick(shouldStop: () => boolean = () => false) {
    for (let i = 0; i < 50 && !shouldStop(); i++) {
      const owner = randomUUID();
      const event: any = await this.db.m("outboxEvents").findOneAndUpdate(
        {
          $or: [
            { status: "PENDING", nextAttemptAt: { $lte: new Date() } },
            { status: "PROCESSING", leaseUntil: { $lt: new Date() } },
          ],
        },
        {
          $set: {
            status: "PROCESSING",
            leaseUntil: new Date(Date.now() + 60000),
            leaseOwner: owner,
          },
          $inc: { attempts: 1 },
        },
        { new: true, sort: { nextAttemptAt: 1 } },
      );
      if (!event) break;
      // Keep long-running report deliveries leased while their queries/SMTP run.
      const heartbeat = setInterval(() => {
        void this.db
          .m("outboxEvents")
          .updateOne(
            { _id: event._id, leaseOwner: owner },
            { $set: { leaseUntil: new Date(Date.now() + 60000) } },
          )
          .catch(() => {});
      }, 20000);
      try {
        const adapter =
          event.type === "AUTH_EMAIL"
            ? this.email
            : event.type.endsWith("_EMAIL")
              ? this.operationalEmail
              : this.inApp;
        const delivered = await adapter.deliver(event);
        await this.db.m("outboxEvents").updateOne(
          { _id: event._id, leaseOwner: owner },
          {
            $set: {
              status: delivered === false ? "SKIPPED" : "PROCESSED",
              processedAt: new Date(),
              payload: {},
            },
            $unset: { leaseUntil: 1, leaseOwner: 1 },
          },
        );
      } catch {
        await this.db.m("outboxEvents").updateOne(
          { _id: event._id, leaseOwner: owner },
          {
            $set: {
              status: event.attempts >= 10 ? "FAILED" : "PENDING",
              nextAttemptAt: new Date(
                Date.now() + Math.min(3600000, 1000 * 2 ** event.attempts),
              ),
              lastError: "DELIVERY_FAILED",
            },
            $unset: { leaseUntil: 1, leaseOwner: 1 },
          },
        );
        console.error(
          JSON.stringify({
            level: "error",
            eventId: event.eventId,
            type: event.type,
            attempts: event.attempts,
            error: "DELIVERY_FAILED",
          }),
        );
      } finally {
        clearInterval(heartbeat);
      }
    }
  }
}
