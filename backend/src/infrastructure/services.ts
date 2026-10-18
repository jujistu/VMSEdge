import { Inject, Injectable } from '@nestjs/common';
import { ClientSession } from 'mongoose';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { Actor, fail, oid, safe } from '../common/domain';
import { CONFIG, Configuration } from '../config/config';
import { Database } from './database';
export const digest = (s: string) =>
  createHash('sha256').update(s).digest('hex');
export const randomToken = () => randomBytes(32).toString('hex');
@Injectable()
export class CryptoService {
  constructor(@Inject(CONFIG) private c: Configuration) {}
  encrypt(value: string, kind: 'pii' | 'outbox' = 'pii') {
    const iv = randomBytes(12),
      cipher = createCipheriv(
        'aes-256-gcm',
        Buffer.from(kind === 'pii' ? this.c.piiKey : this.c.outboxKey, 'hex'),
        iv,
      );
    const content = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return [
      iv.toString('hex'),
      cipher.getAuthTag().toString('hex'),
      content.toString('hex'),
    ].join('.');
  }
  decrypt(value: string, kind: 'pii' | 'outbox' = 'pii') {
    const [iv, tag, content] = value.split('.');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(kind === 'pii' ? this.c.piiKey : this.c.outboxKey, 'hex'),
      Buffer.from(iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(content, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }
}
@Injectable()
export class Journal {
  constructor(private db: Database) {}
  async audit(
    actor: Actor | null,
    action: string,
    resource: string,
    resourceId: any,
    session?: ClientSession,
    metadata: Record<string, unknown> = {},
  ) {
    await this.db.m('auditLogs').create(
      [
        {
          userId: actor?.id ? oid(actor.id) : undefined,
          action,
          resource,
          resourceId: resourceId || undefined,
          metadata,
          ipAddress: actor?.ipAddress,
          userAgent: actor?.userAgent?.slice(0, 500),
          requestId: actor?.requestId,
          timestamp: new Date(),
        },
      ],
      { session },
    );
  }
  async event(
    type: string,
    resourceId: any,
    payload: any,
    session: ClientSession,
  ) {
    await this.db
      .m('outboxEvents')
      .create([{ eventId: randomUUID(), type, resourceId, payload }], {
        session,
      });
  }
  async code(prefix: string, session: ClientSession) {
    const year = new Date(Date.now() + 3600000).getUTCFullYear();
    const r: any = await this.db
      .m('counters')
      .findOneAndUpdate(
        { _id: `${prefix}-${year}` },
        { $inc: { value: 1 } },
        { upsert: true, new: true, session },
      );
    return `${prefix}-${year}-${String(r.value).padStart(6, '0')}`;
  }
  async command<T>(
    actor: Actor,
    key: string | undefined,
    operation: string,
    body: unknown,
    fn: (s: ClientSession) => Promise<T>,
  ): Promise<T> {
    if (!key || !/^[-a-zA-Z0-9_]{8,100}$/.test(key))
      fail('IDEMPOTENCY_KEY_REQUIRED', 400);
    const filter = { actorId: oid(actor.id), operation, key };
    const hash = digest(JSON.stringify(body));
    const run = () =>
      this.db.transaction(async (session) => {
        const old: any = await this.db
          .m('idempotencyRecords')
          .findOne(filter)
          .session(session)
          .lean();
        if (old && old.expiresAt > new Date()) {
          if (old.requestHash !== hash) fail('IDEMPOTENCY_KEY_REUSED');
          return old.result as T;
        }
        if (old)
          await this.db.m('idempotencyRecords').deleteOne(filter, { session });
        const active = await this.db
          .m('users')
          .findOneAndUpdate(
            { _id: oid(actor.id), status: 'ACTIVE' },
            { $inc: { admissionRevision: 1 } },
            { session, new: true },
          );
        if (!active) fail('ACCOUNT_DISABLED', 403);
        if (active.role !== actor.role) fail('FORBIDDEN', 403);
        const result = safe(await fn(session));
        await this.db.m('idempotencyRecords').create(
          [
            {
              ...filter,
              requestHash: hash,
              result,
              expiresAt: new Date(Date.now() + 86400000),
            },
          ],
          { session },
        );
        return result;
      });
    try {
      return await run();
    } catch (e: any) {
      if (e.code === 11000) {
        const old: any = await this.db
          .m('idempotencyRecords')
          .findOne(filter)
          .lean();
        if (old && old.requestHash === hash) return old.result;
        if (old) fail('IDEMPOTENCY_KEY_REUSED');
      }
      throw e;
    }
  }
}
