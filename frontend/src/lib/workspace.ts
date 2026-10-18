import { allPages, request } from './api';
import { Workspace, Person, User, Visit, dateTime } from './models';
type RawUser = User & { departmentId?: string };
type RawVisit = Omit<Visit, 'source'> & {
  source: 'INVITATION' | 'WALK_IN';
  expectedArrivalAt: string;
  expectedDepartureAt: string;
  receptionArrivedAt?: string;
  actualCheckInAt?: string;
  actualCheckOutAt?: string;
  visitorType: string;
  vehicleRegistrationNumber?: string;
  itemsCarried?: string[];
  visitor?: Person;
  host?: RawUser;
  department?: Workspace['departments'][number];
  snapshot?: {
    visitorName?: string;
    hostName?: string;
    departmentName?: string;
    company?: string;
  };
  terminalReason?: string;
};
export async function loadWorkspace(
  previous?: { state: Workspace; user: User },
  changedPath?: string,
): Promise<{
  state: Workspace;
  user: User;
}> {
  // Fetch the current identity on every reload so role changes take effect.
  const { data: me } = await request<RawUser>('/auth/me');
  const admin = me.role === 'ADMIN';
  const cached =
    previous?.user.id === me.id &&
    previous?.user.role === me.role &&
    changedPath
      ? previous.state
      : undefined;
  const [
    people,
    departments,
    users,
    rawVisits,
    notifications,
    settings,
    audit,
    blacklist,
    dashboard,
  ] = await Promise.all([
    allPages<Person>('/visitors'),
    cached && !changedPath.startsWith('/departments')
      ? Promise.resolve(cached.departments)
      : allPages<Workspace['departments'][number]>('/departments'),
    cached && !changedPath.startsWith('/users')
      ? Promise.resolve(cached.users as RawUser[])
      : admin
        ? allPages<RawUser>('/users')
        : me.role === 'RECEPTIONIST'
          ? allPages<RawUser>('/users/hosts').then((rows) =>
              rows.map((u) => ({
                ...u,
                role: 'STAFF' as const,
                status: 'ACTIVE',
                email: '',
                employeeId: '',
              })),
            )
          : Promise.resolve([]),
    allPages<RawVisit>('/visits'),
    allPages<{ id: string; title: string; message: string; isRead: boolean }>(
      '/notifications',
    ),
    cached && !changedPath.startsWith('/settings')
      ? Promise.resolve(cached.settings)
      : request<Workspace['settings']>(
          admin ? '/settings' : '/settings/client',
        ).then((r) => r.data),
    admin
      ? allPages<{
          id: string;
          action: string;
          resource: string;
          resourceId: string;
          timestamp: string;
          userId: string;
          metadata: unknown;
        }>('/audit-logs')
      : Promise.resolve([]),
    cached && !changedPath.startsWith('/blacklist')
      ? Promise.resolve(
          cached.blacklist.map((b) => ({
            ...b,
            status: b.active ? 'ACTIVE' : 'LIFTED',
            createdAt: b.date,
          })),
        )
      : admin
        ? allPages<{
            id: string;
            version: number;
            visitorId: string;
            reason: string;
            status: string;
            createdAt: string;
          }>('/blacklist')
        : Promise.resolve([]),
    request<Workspace['dashboard']>(`/dashboard/${me.role.toLowerCase()}`).then(
      (r) => r.data,
    ),
  ]);
  const personMap = new Map(people.map((p) => [p.id, p]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  userMap.set(me.id, me);
  const departmentMap = new Map(departments.map((d) => [d.id, d]));
  for (const v of rawVisits) {
    if (v.visitor && !personMap.has(v.visitor.id))
      personMap.set(v.visitor.id, v.visitor);
    if (v.host && !userMap.has(v.host.id)) userMap.set(v.host.id, v.host);
    if (v.department && !departmentMap.has(v.department.id))
      departmentMap.set(v.department.id, v.department);
  }
  const mappedUsers = Array.from(userMap.values()).map((u) => ({
    ...u,
    department: departmentMap.get(u.departmentId)?.name || '',
  }));
  const visits: Visit[] = rawVisits.map((v) => ({
    ...v,
    source: String(v.source) === 'WALK_IN' ? 'Walk-in' : 'Invitation',
    type: v.visitorType,
    arrival: v.expectedArrivalAt,
    departure: v.expectedDepartureAt,
    arrivedAt: v.receptionArrivedAt,
    checkIn: v.actualCheckInAt,
    checkOut: v.actualCheckOutAt,
    vehicle: v.vehicleRegistrationNumber,
    items: v.itemsCarried?.join(', '),
    reason: v.terminalReason,
    code: v.id,
  }));
  // Codes belong to invitations, while commands use visit and linked-resource IDs.
  const [invitations, requests] = await Promise.all([
    allPages<{ invitationCode: string; visit: { id: string } }>('/invitations'),
    allPages<{ decisionReason?: string; visit: { id: string } }>(
      '/visitor-requests',
    ),
  ]);
  const codes = new Map(invitations.map((i) => [i.visit.id, i.invitationCode]));
  const decisions = new Map(
    requests.map((r) => [r.visit.id, r.decisionReason]),
  );
  for (const v of visits) {
    v.code = codes.get(v.id) || v.id;
    v.reason = v.reason || decisions.get(v.id);
  }
  return {
    user: mappedUsers.find((u) => u.id === me.id)!,
    state: {
      people: Array.from(personMap.values()).map((p) => ({
        ...p,
        lastName: p.lastName || '',
        email: p.email || '',
        phone: p.phone || '',
        company: p.company || '',
      })),
      users: mappedUsers,
      visits,
      departments: Array.from(departmentMap.values()),
      notifications: notifications.map((n) => ({ ...n, read: n.isRead })),
      settings,
      audit: audit.map((a) => ({
        ...a,
        date: a.timestamp,
        actor:
          mappedUsers.find((u) => u.id === a.userId)?.email ||
          a.userId ||
          'System',
        detail: `${a.resource} ${a.resourceId || ''} ${JSON.stringify(a.metadata || {}, (_key, value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? dateTime(value) : value))}`,
      })),
      blacklist: blacklist.map((b) => ({
        ...b,
        date: b.createdAt,
        active: b.status === 'ACTIVE',
      })),
      dashboard,
    },
  };
}
