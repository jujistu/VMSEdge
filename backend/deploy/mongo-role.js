// Run as a database administrator AFTER migrations. Never grant dbOwner/readWrite
// to the application account; those roles would also permit modifying audit logs.
const databaseName = process.env.VMS_DATABASE;
if (
  !databaseName ||
  !process.env.VMS_DATABASE_USER ||
  !process.env.VMS_DATABASE_PASSWORD
)
  throw new Error(
    'Provide VMS_DATABASE, VMS_DATABASE_USER and VMS_DATABASE_PASSWORD',
  );
const target = db.getSiblingDB(databaseName);
const collections = [
  'users',
  'departments',
  'visitors',
  'visits',
  'visitorInvitations',
  'visitorRequests',
  'notifications',
  'blacklist',
  'systemSettings',
  'sessions',
  'refreshTokens',
  'passwordResetTokens',
  'outboxEvents',
  'idempotencyRecords',
  'counters',
  'rateLimits',
];
target.createRole({
  role: 'vmsApplication',
  privileges: [
    ...collections.map((collection) => ({
      resource: { db: databaseName, collection },
      actions: ['find', 'insert', 'update', 'remove'],
    })),
    {
      resource: { db: databaseName, collection: 'auditLogs' },
      actions: ['find', 'insert'],
    },
  ],
  roles: [],
});
target.createUser({
  user: process.env.VMS_DATABASE_USER,
  pwd: process.env.VMS_DATABASE_PASSWORD,
  roles: [{ role: 'vmsApplication', db: databaseName }],
});
