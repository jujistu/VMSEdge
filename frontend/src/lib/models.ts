export type Role = "ADMIN" | "RECEPTIONIST" | "STAFF";
export type Status =
  | "PRE_REGISTERED"
  | "EXPECTED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "CANCELLED"
  | "EXPIRED";
export type Person = {
  id: string;
  version?: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  status: string;
  notes?: string;
};
export type User = {
  id: string;
  version?: number;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  department: string;
  status: string;
  employeeId: string;
  phone?: string;
};
export type Visit = {
  id: string;
  version?: number;
  visitorId: string;
  hostId: string;
  purpose: string;
  type: string;
  source: "Invitation" | "Walk-in";
  status: Status;
  arrival: string;
  departure: string;
  arrivedAt?: string;
  checkIn?: string;
  checkOut?: string;
  notes?: string;
  reason?: string;
  code: string;
  invitationId?: string;
  visitorRequestId?: string;
  allowedActions?: string[];
  canEditVisit?: boolean;
  canEditInvitation?: boolean;
  eligibility?: { eligible: boolean; reasons: string[] };
  vehicle?: string;
  items?: string;
  primaryVisitId?: string;
};
export type Workspace = {
  people: Person[];
  users: User[];
  visits: Visit[];
  departments: {
    id: string;
    version?: number;
    name: string;
    description: string;
    status: string;
  }[];
  blacklist: {
    id: string;
    version?: number;
    visitorId: string;
    reason: string;
    active: boolean;
    date: string;
  }[];
  audit: {
    id: string;
    version?: number;
    action: string;
    detail: string;
    date: string;
    actor: string;
  }[];
  notifications: {
    id: string;
    version?: number;
    title: string;
    message: string;
    read: boolean;
  }[];
  dashboard?: {
    metrics: Record<string, number>;
    trends: { date: string; arrivals: number; departures: number }[];
    visitorsByDepartment?: { name: string; count: number }[];
  };
  settings: {
    version?: number;
    organizationName: string;
    earlyArrivalMinutes: number;
  };
};
export const labels: Record<string, string> = {
  PRE_REGISTERED: "Draft",
  EXPECTED: "Expected",
  PENDING: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CHECKED_IN: "Checked in",
  CHECKED_OUT: "Checked out",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};
export const fullName = (p?: { firstName: string; lastName: string }) =>
  p ? `${p.firstName} ${p.lastName}` : "Record unavailable";
export const initials = (p?: { firstName: string; lastName: string }) =>
  p ? `${p.firstName[0] || ""}${p.lastName[0] || ""}` : "?";
export const time = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Africa/Lagos",
      })
        .format(new Date(value))
        .replace(/^0(?=\d:)/, "")
    : "—";
export const day = (value: string) => localDate(value);
export const dateTime = (value?: string) =>
  value ? `${localDate(value)} ${time(value)}` : "—";
export const localDate = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
export const today = () => localDate(new Date().toISOString());
export const uid = () => crypto.randomUUID();
export function blockers(v: Visit, s: Workspace) {
  if (v.eligibility)
    return v.eligibility.reasons.map((r) => r.toLowerCase().replace(/_/g, " "));
  const reasons: string[] = [];
  if (s.blacklist.some((b) => b.visitorId === v.visitorId && b.active))
    reasons.push("Visitor is on the active blacklist.");
  if (s.people.find((p) => p.id === v.visitorId)?.status !== "ACTIVE")
    reasons.push("Visitor profile is archived.");
  const h = s.users.find((u) => u.id === v.hostId);
  if (
    !h ||
    h.status !== "ACTIVE" ||
    s.departments.find((d) => d.name === h.department)?.status !== "ACTIVE"
  )
    reasons.push("Host or department is unavailable.");
  if (!["EXPECTED", "APPROVED"].includes(v.status))
    reasons.push("This visit is not ready for admission.");
  const now = Date.now();
  if (
    now <
      new Date(v.arrival).getTime() - s.settings.earlyArrivalMinutes * 60000 ||
    now > new Date(v.departure).getTime()
  )
    reasons.push("Outside the permitted check-in window.");
  return reasons;
}
export function exportCsv(rows: string[][], filename: string) {
  const blob = new Blob(
    [
      "\uFEFF" +
        rows
          .map((r) =>
            r
              .map(
                (v) =>
                  '"' +
                  String(v)
                    .replace(/"/g, '""')
                    .replace(/^[=+@-]/, "'$&") +
                  '"',
              )
              .join(","),
          )
          .join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8;" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
