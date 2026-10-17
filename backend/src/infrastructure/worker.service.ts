import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createTransport } from "nodemailer";
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
      const title = event.type.toLowerCase().replaceAll("_", " ");
      await this.db.m("notifications").updateOne(
        { userId: oid(recipient), eventId: event.eventId, type: event.type },
        {
          $setOnInsert: {
            title: title[0].toUpperCase() + title.slice(1),
            message: "Open the linked record to see details.",
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
      await transport.sendMail({
        from: process.env.MAIL_FROM || "vms@localhost",
        to: p.to,
        subject:
          p.purpose === "SET_PASSWORD"
            ? "Set up your VMS account"
            : "Reset your VMS password",
        text: `Use this single-use link before ${p.expiresAt}:\n${p.url}`,
        messageId: `<${event.eventId}@vms.local>`,
      });
    } finally {
      transport.close();
    }
  }
}
@Injectable()
export class OutboxWorker {
  constructor(
    private db: Database,
    private inApp: InAppDelivery,
    private email: AuthenticationEmailDelivery,
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
      try {
        await (event.type === "AUTH_EMAIL" ? this.email : this.inApp).deliver(
          event,
        );
        await this.db.m("outboxEvents").updateOne(
          { _id: event._id, leaseOwner: owner },
          {
            $set: {
              status: "PROCESSED",
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
      }
    }
  }
}
