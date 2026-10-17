import { Global, Inject, Injectable, Module } from "@nestjs/common";
import { InjectConnection, MongooseModule } from "@nestjs/mongoose";
import { ClientSession, Connection, Model, Schema } from "mongoose";
import { CONFIG, Configuration } from "../config/config";
const ref = { type: Schema.Types.ObjectId };
const base = { version: { type: Number, default: 0 } };
const person = {
  firstName: { type: String, required: true },
  lastName: { type: String, default: "" },
  email: String,
  phone: String,
};
function schema(fields: any, indexes: any[] = []) {
  const s = new Schema(
    { ...base, ...fields },
    { timestamps: true, strict: "throw", versionKey: false },
  );
  for (const [keys, options] of indexes) s.index(keys, options);
  return s;
}
export const schemas: Record<string, Schema> = {
  users: schema(
    {
      ...person,
      email: { type: String, required: true },
      employeeId: { type: String, required: true },
      passwordHash: { type: String, required: true },
      role: {
        type: String,
        enum: ["ADMIN", "RECEPTIONIST", "STAFF"],
        required: true,
      },
      departmentId: ref,
      status: { type: String, enum: ["ACTIVE", "DISABLED"], default: "ACTIVE" },
      lastLoginAt: Date,
      passwordChangedAt: Date,
      mustChangePassword: { type: Boolean, default: true },
      authorizationVersion: { type: Number, default: 0 },
      admissionRevision: { type: Number, default: 0 },
    },
    [
      [{ email: 1 }, { unique: true }],
      [{ employeeId: 1 }, { unique: true }],
      [{ role: 1, status: 1, firstName: 1, _id: 1 }, {}],
      [{ departmentId: 1, status: 1 }, {}],
    ],
  ),
  departments: schema(
    {
      name: String,
      normalizedName: String,
      description: String,
      status: { type: String, enum: ["ACTIVE", "ARCHIVED"], default: "ACTIVE" },
      admissionRevision: { type: Number, default: 0 },
    },
    [
      [{ normalizedName: 1 }, { unique: true }],
      [{ status: 1, name: 1 }, {}],
    ],
  ),
  visitors: schema(
    {
      ...person,
      visitorId: String,
      company: String,
      photoUrl: String,
      idType: String,
      idNumberEncrypted: String,
      vehicleRegistrationNumber: String,
      itemsCarried: [String],
      notes: String,
      normalizedEmail: String,
      normalizedPhone: String,
      searchTokens: [String],
      status: { type: String, enum: ["ACTIVE", "ARCHIVED"], default: "ACTIVE" },
      admissionRevision: { type: Number, default: 0 },
    },
    [
      [{ visitorId: 1 }, { unique: true }],
      [{ searchTokens: 1, _id: 1 }, {}],
      [{ normalizedEmail: 1 }, {}],
      [{ normalizedPhone: 1 }, {}],
      [{ status: 1, createdAt: -1, _id: -1 }, {}],
    ],
  ),
  visits: schema(
    {
      visitorId: ref,
      hostId: ref,
      departmentId: ref,
      invitationId: ref,
      visitorRequestId: ref,
      primaryVisitId: ref,
      purpose: String,
      visitorType: String,
      source: String,
      expectedArrivalAt: Date,
      expectedDepartureAt: Date,
      actualCheckInAt: Date,
      actualCheckOutAt: Date,
      receptionArrivedAt: Date,
      status: {
        type: String,
        enum: [
          "PRE_REGISTERED",
          "PENDING",
          "APPROVED",
          "REJECTED",
          "EXPECTED",
          "CHECKED_IN",
          "CHECKED_OUT",
          "CANCELLED",
          "EXPIRED",
        ],
      },
      registeredBy: ref,
      checkedInBy: ref,
      checkedOutBy: ref,
      notes: String,
      itemsCarried: [String],
      vehicleRegistrationNumber: String,
      terminalReason: String,
      snapshot: {
        visitorName: String,
        visitorPublicId: String,
        company: String,
        hostName: String,
        departmentName: String,
      },
    },
    [
      [{ visitorId: 1, createdAt: -1, _id: -1 }, {}],
      [{ hostId: 1, expectedArrivalAt: 1, _id: 1 }, {}],
      [{ hostId: 1, status: 1, expectedArrivalAt: 1 }, {}],
      [{ hostId: 1, actualCheckInAt: -1 }, {}],
      [{ departmentId: 1, actualCheckInAt: 1 }, {}],
      [{ status: 1, expectedArrivalAt: 1 }, {}],
      [{ status: 1, expectedDepartureAt: 1 }, {}],
      [{ actualCheckInAt: 1, _id: 1 }, {}],
      [{ actualCheckOutAt: 1, _id: 1 }, {}],
      [{ primaryVisitId: 1 }, {}],
      [
        { visitorId: 1 },
        {
          unique: true,
          partialFilterExpression: { status: "CHECKED_IN" },
          name: "one_active_visit",
        },
      ],
      [
        { invitationId: 1 },
        {
          unique: true,
          partialFilterExpression: { invitationId: { $type: "objectId" } },
        },
      ],
      [
        { visitorRequestId: 1 },
        {
          unique: true,
          partialFilterExpression: { visitorRequestId: { $type: "objectId" } },
        },
      ],
    ],
  ),
  visitorInvitations: schema(
    {
      visitId: ref,
      invitationCode: String,
      qrIdentifier: String,
      createdBy: ref,
      lastSharedAt: Date,
      shareCount: { type: Number, default: 0 },
    },
    [
      [{ visitId: 1 }, { unique: true }],
      [{ invitationCode: 1 }, { unique: true }],
      [{ qrIdentifier: 1 }, { unique: true }],
      [{ createdBy: 1, createdAt: -1 }, {}],
    ],
  ),
  visitorRequests: schema(
    {
      visitId: ref,
      requestedBy: ref,
      requestedAt: Date,
      decidedBy: ref,
      decidedAt: Date,
      decisionReason: String,
    },
    [
      [{ visitId: 1 }, { unique: true }],
      [{ requestedBy: 1, createdAt: -1 }, {}],
    ],
  ),
  notifications: schema(
    {
      userId: ref,
      eventId: String,
      type: String,
      title: String,
      message: String,
      resourceType: String,
      resourceId: ref,
      isRead: { type: Boolean, default: false },
      readAt: Date,
    },
    [
      [{ userId: 1, eventId: 1, type: 1 }, { unique: true }],
      [{ userId: 1, createdAt: -1, _id: -1 }, {}],
      [{ userId: 1, isRead: 1, createdAt: -1 }, {}],
    ],
  ),
  auditLogs: new Schema(
    {
      userId: ref,
      action: String,
      resource: String,
      resourceId: ref,
      metadata: Schema.Types.Mixed,
      ipAddress: String,
      userAgent: String,
      requestId: String,
      timestamp: { type: Date, default: Date.now },
    },
    { strict: "throw", versionKey: false },
  ),
  blacklist: schema(
    {
      visitorId: ref,
      reason: String,
      addedBy: ref,
      status: { type: String, enum: ["ACTIVE", "LIFTED"], default: "ACTIVE" },
      liftedBy: ref,
      liftedAt: Date,
      liftReason: String,
    },
    [
      [
        { visitorId: 1 },
        { unique: true, partialFilterExpression: { status: "ACTIVE" } },
      ],
      [{ status: 1, createdAt: -1 }, {}],
    ],
  ),
  systemSettings: schema(
    {
      key: String,
      organizationName: { type: String, default: "Northstar" },
      timezone: { type: String, default: "Africa/Lagos" },
      earlyArrivalMinutes: { type: Number, default: 30 },
      updatedBy: ref,
    },
    [[{ key: 1 }, { unique: true }]],
  ),
  sessions: schema(
    {
      userId: ref,
      familyId: String,
      lastUsedAt: Date,
      absoluteExpiresAt: Date,
      revokedAt: Date,
      revocationReason: String,
      ipAddress: String,
      userAgent: String,
    },
    [
      [{ familyId: 1 }, { unique: true }],
      [{ userId: 1, revokedAt: 1 }, {}],
      [{ absoluteExpiresAt: 1 }, { expireAfterSeconds: 86400 }],
    ],
  ),
  refreshTokens: schema(
    {
      sessionId: ref,
      tokenHash: String,
      generation: Number,
      status: String,
      issuedAt: Date,
      expiresAt: Date,
      consumedAt: Date,
      replacedById: ref,
      purgeAt: Date,
    },
    [
      [{ tokenHash: 1 }, { unique: true }],
      [{ sessionId: 1, generation: 1 }, { unique: true }],
      [{ purgeAt: 1 }, { expireAfterSeconds: 0 }],
    ],
  ),
  passwordResetTokens: schema(
    {
      userId: ref,
      tokenHash: String,
      purpose: String,
      expiresAt: Date,
      consumedAt: Date,
      purgeAt: Date,
    },
    [
      [{ tokenHash: 1 }, { unique: true }],
      [{ userId: 1, purpose: 1, createdAt: -1 }, {}],
      [{ purgeAt: 1 }, { expireAfterSeconds: 0 }],
    ],
  ),
  outboxEvents: schema(
    {
      eventId: String,
      type: String,
      resourceId: ref,
      payload: Schema.Types.Mixed,
      status: { type: String, default: "PENDING" },
      attempts: { type: Number, default: 0 },
      nextAttemptAt: { type: Date, default: Date.now },
      leaseUntil: Date,
      leaseOwner: String,
      processedAt: Date,
      lastError: String,
    },
    [
      [{ eventId: 1 }, { unique: true }],
      [{ status: 1, nextAttemptAt: 1, leaseUntil: 1 }, {}],
    ],
  ),
  idempotencyRecords: schema(
    {
      actorId: ref,
      operation: String,
      key: String,
      requestHash: String,
      result: Schema.Types.Mixed,
      expiresAt: Date,
    },
    [
      [{ actorId: 1, operation: 1, key: 1 }, { unique: true }],
      [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
    ],
  ),
  counters: new Schema(
    { _id: String, value: { type: Number, default: 0 } },
    { versionKey: false },
  ),
  rateLimits: new Schema(
    { _id: String, count: Number, expiresAt: Date },
    { versionKey: false },
  ),
  migrations: schema({ name: String, appliedAt: Date }, [
    [{ name: 1 }, { unique: true }],
  ]),
};
schemas.rateLimits.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
for (const keys of [
  { timestamp: -1, _id: -1 },
  { userId: 1, timestamp: -1 },
  { action: 1, timestamp: -1 },
  { resource: 1, resourceId: 1, timestamp: -1 },
])
  schemas.auditLogs.index(keys as any);
@Injectable()
export class Database {
  readonly models: Record<string, Model<any>> = {};
  constructor(
    @InjectConnection() readonly connection: Connection,
    @Inject(CONFIG) config: Configuration,
  ) {
    for (const [name, s] of Object.entries(schemas))
      this.models[name] = connection.model(name, s, name);
  }
  m(name: string) {
    return this.models[name];
  }
  async transaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      return (await session.withTransaction(() => fn(session), {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        maxCommitTimeMS: 10000,
        timeoutMS: 15000,
      })) as T;
    } finally {
      await session.endSession();
    }
  }
  async initialize() {
    const hello = await this.connection.db!.admin().command({ hello: 1 });
    if (!hello.setName) throw new Error("MongoDB replica set required");
  }
}
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (c: Configuration) => ({
        uri: c.mongo,
        autoIndex: false,
        autoCreate: false,
        serverSelectionTimeoutMS: 5000,
        sanitizeFilter: false,
      }),
    }),
  ],
  providers: [Database],
  exports: [Database],
})
export class DatabaseModule {}
