import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  Plus,
  Printer,
  RefreshCw,
  ScanLine,
  Search,
  Users,
} from "lucide-react";
import {
  Workspace,
  Role,
  Visit,
  Person,
  fullName,
  localDate,
  today,
  time,
  day,
  exportCsv,
  uid,
} from "@/lib/models";
import {
  Avatar,
  Empty,
  SearchBox,
  StatusBadge,
  VisitTable,
} from "./gatewise-shared";
import { Update } from "./gatewise-visit-dialogs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
export const pageNames: Record<string, string> = {
  overview: "Overview",
  visits: "Visits",
  visitors: "Visitor directory",
  invitations: "Invitations",
  requests: "Approval inbox",
  occupancy: "Occupancy",
  history: "Visit history",
  expected: "Expected arrivals",
  waiting: "Waiting visitors",
  lookup: "Find invitation",
  reports: "Reports & analytics",
  users: "User management",
  departments: "Departments",
  blacklist: "Blacklist",
  audit: "Audit logs",
  settings: "Settings",
  notifications: "Notifications",
  profile: "My profile",
};
export function Records({
  page,
  state,
  role,
  userId,
  onSelect,
  onCreate,
  refresh,
}: {
  page: string;
  state: Workspace;
  role: Role;
  userId: string;
  onSelect: (v: Visit) => void;
  onCreate: (k: "invitation" | "walk-in") => void;
  refresh: () => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [date, setDate] = useState("");
  const [current, setCurrent] = useState(1);
  const [lookup, setLookup] = useState("");
  const [lookupSubmitted, setLookupSubmitted] = useState(false);
  const [updated, setUpdated] = useState(new Date());
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) setTick(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    setCurrent(1);
  }, [q, status, source, date, page]);
  const scoped = state.visits.filter(
    (v) => role !== "STAFF" || v.hostId === userId,
  );
  const base = scoped.filter((v) =>
    page === "visits" && role === "RECEPTIONIST"
      ? localDate(v.arrival) === today()
      : page === "occupancy"
        ? v.status === "CHECKED_IN"
        : page === "invitations"
          ? v.source === "Invitation"
          : page === "requests"
            ? v.source === "Walk-in"
            : page === "expected"
              ? v.status === "EXPECTED"
              : page === "waiting"
                ? !!v.arrivedAt &&
                  ["PENDING", "APPROVED", "EXPECTED"].includes(v.status)
                : page === "history"
                  ? [
                      "CHECKED_OUT",
                      "REJECTED",
                      "CANCELLED",
                      "EXPIRED",
                    ].includes(v.status)
                  : page === "lookup"
                    ? lookupSubmitted &&
                      `${v.code} ${fullName(state.people.find((p) => p.id === v.visitorId))}`
                        .toLowerCase()
                        .includes(lookup.toLowerCase())
                    : true,
  );
  const filtered = base.filter((v) => {
    const p = state.people.find((p) => p.id === v.visitorId);
    const h = state.users.find((u) => u.id === v.hostId);
    return (
      `${fullName(p)} ${p?.company} ${v.code} ${fullName(h)}`
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (!status || v.status === status) &&
      (!source || v.source === source) &&
      (!date || localDate(v.arrival) === date)
    );
  });
  const rows = filtered.slice((current - 1) * 10, current * 10);
  const title =
    role === "STAFF"
      ? {
          visits: "My visits",
          invitations: "My invitations",
          visitors: "My visitors",
          history: "My history",
        }[page] || pageNames[page]
      : pageNames[page];
  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="mt-2 text-xs text-slate-500">
            {page === "occupancy"
              ? "Know who is on site. A clear, current view of your workplace."
              : page === "requests"
                ? "A thoughtful welcome starts with a quick decision."
                : page === "lookup"
                  ? "Find a guest by invitation code or visitor name."
                  : "Manage every visit, from the first hello to the final goodbye."}
          </p>
        </div>
        <div className="no-print flex gap-2">
          {page === "occupancy" ? (
            <button className="btn-light" onClick={() => window.print()}>
              <Printer size={14} />
              Print occupancy
            </button>
          ) : (
            <button
              className="btn-light"
              onClick={() =>
                exportCsv(
                  [
                    [
                      "Code",
                      "Visitor",
                      "Company",
                      "Host",
                      "Status",
                      "Arrival",
                      "Check-in",
                      "Check-out",
                    ],
                    ...filtered.map((v) => [
                      v.code,
                      fullName(state.people.find((p) => p.id === v.visitorId)),
                      state.people.find((p) => p.id === v.visitorId)?.company ||
                        "",
                      fullName(state.users.find((u) => u.id === v.hostId)),
                      v.status,
                      v.arrival,
                      v.checkIn || "",
                      v.checkOut || "",
                    ]),
                  ],
                  "gatewise-visits.csv",
                )
              }
            >
              <ArrowDownToLine size={14} />
              Export CSV
            </button>
          )}
          {((page === "invitations" && role !== "RECEPTIONIST") ||
            (["visits", "expected"].includes(page) && role !== "STAFF")) && (
            <button
              className="btn"
              onClick={() =>
                onCreate(page === "invitations" ? "invitation" : "walk-in")
              }
            >
              <Plus size={15} />
              {page === "invitations"
                ? "Create invitation"
                : "Register walk-in"}
            </button>
          )}
        </div>
      </div>
      {page === "lookup" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (lookup.trim()) setLookupSubmitted(true);
          }}
          className="panel flex flex-wrap items-center gap-3 p-5"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <ScanLine size={25} />
          </div>
          <div className="min-w-52 flex-1">
            <label className="form-label">Invitation code or name</label>
            <input
              value={lookup}
              onChange={(e) => {
                setLookup(e.target.value);
                setLookupSubmitted(false);
              }}
              className="field"
              required
              placeholder="e.g. GW-1043"
            />
          </div>
          <button className="btn mt-4" type="submit">
            <Search size={15} />
            Find invitation
          </button>
          <p className="w-full text-[11px] text-slate-400">
            Manual lookup · A matching invitation does not automatically grant
            entry. Review admission checks before checking in.
          </p>
        </form>
      )}
      {page === "occupancy" && (
        <div className="flex flex-wrap gap-4">
          <div className="panel flex min-w-52 items-center gap-4 p-5">
            <span className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
              <Users size={24} />
            </span>
            <div>
              <p className="text-2xl font-bold">{base.length}</p>
              <p className="text-xs text-slate-500">
                Visitors currently inside
              </p>
            </div>
          </div>
          <div className="panel flex flex-1 items-center justify-between gap-3 p-5">
            <div>
              <p className="text-xs font-semibold">
                A current view, not an evacuation system
              </p>
              <p className="mt-2 text-[11px] text-slate-500">
                Updated {time(updated.toISOString())} WAT · Stays update every
                30 seconds. Checkout is always manual.
              </p>
            </div>
            <button
              className="btn-light"
              onClick={async () => {
                try {
                  await refresh();
                  setUpdated(new Date());
                  setTick(Date.now());
                  toast.success("Occupancy refreshed");
                } catch {
                  toast.error("Unable to refresh occupancy");
                }
              }}
              aria-label="Refresh occupancy"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
      )}
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="w-full sm:w-64">
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder="Search visitor, company, host…"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {page !== "occupancy" && (
              <select
                aria-label="Filter status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="field w-auto text-xs"
              >
                <option value="">All statuses</option>
                {[
                  "PRE_REGISTERED",
                  "EXPECTED",
                  "PENDING",
                  "APPROVED",
                  "CHECKED_IN",
                  "CHECKED_OUT",
                  "REJECTED",
                  "CANCELLED",
                  "EXPIRED",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ").toLowerCase()}
                  </option>
                ))}
              </select>
            )}
            {!["requests", "invitations"].includes(page) && (
              <select
                aria-label="Filter source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="field w-auto text-xs"
              >
                <option value="">All visit types</option>
                <option>Invitation</option>
                <option>Walk-in</option>
              </select>
            )}
            <input
              aria-label="Filter arrival date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="field w-auto text-xs"
            />
            {(q || status || source || date) && (
              <button
                className="text-xs text-blue-600"
                onClick={() => {
                  setQ("");
                  setStatus("");
                  setSource("");
                  setDate("");
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
        {page === "occupancy" ? (
          rows.length ? (
            <div className="overflow-auto">
              <table className="w-full whitespace-nowrap">
                <thead>
                  <tr>
                    {[
                      "Visitor",
                      "Host / department",
                      "Checked in",
                      "Elapsed stay",
                      "Expected departure",
                      "",
                    ].map((h, i) => (
                      <th key={i} className="table-th">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => {
                    const p = state.people.find((p) => p.id === v.visitorId);
                    const host = state.users.find((u) => u.id === v.hostId);
                    const mins = Math.max(
                      0,
                      Math.floor(
                        (tick - new Date(v.checkIn!).getTime()) / 60000,
                      ),
                    );
                    const overdue = tick > new Date(v.departure).getTime();
                    return (
                      <tr
                        key={v.id}
                        className="cursor-pointer hover:bg-blue-50/30"
                        onClick={() => onSelect(v)}
                      >
                        <td className="table-td">
                          <div className="flex items-center gap-3">
                            <Avatar person={p} />
                            <div>
                              <p className="font-semibold">{fullName(p)}</p>
                              <p className="mt-1 text-[10px] text-slate-400">
                                {p?.company}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="table-td">
                          {fullName(host)}
                          <p className="mt-1 text-[10px] text-slate-400">
                            {host?.department}
                          </p>
                        </td>
                        <td className="table-td">{time(v.checkIn)}</td>
                        <td className="table-td">
                          {Math.floor(mins / 60)}h {mins % 60}m
                        </td>
                        <td className="table-td">
                          {time(v.departure)}
                          {overdue && (
                            <span className="ml-2 rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
                              Past expected departure
                            </span>
                          )}
                        </td>
                        <td className="table-td">
                          <button className="text-xs font-medium text-blue-600">
                            View visit →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No visitors currently inside"
              description="Checked-in visitors will appear here until they are manually checked out."
            />
          )
        ) : (
          <VisitTable visits={rows} state={state} onSelect={onSelect} />
        )}
        <div className="flex items-center justify-between border-t p-4 text-[11px] text-slate-400">
          <span>
            {filtered.length
              ? `${(current - 1) * 10 + 1}–${Math.min(current * 10, filtered.length)}`
              : "0"}{" "}
            of {filtered.length} records
          </span>
          <div className="flex items-center gap-3">
            <button
              className="btn-light p-1.5"
              disabled={current === 1}
              onClick={() => setCurrent((p) => p - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            <span>
              Page {current} of {Math.max(1, Math.ceil(filtered.length / 10))}
            </span>
            <button
              className="btn-light p-1.5"
              disabled={current * 10 >= filtered.length}
              onClick={() => setCurrent((p) => p + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
export function VisitorDirectory({
  state,
  role,
  userId,
  update,
  onSelect,
}: {
  state: Workspace;
  role: Role;
  userId: string;
  update: Update;
  onSelect: (v: Visit) => void;
}) {
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const selected = state.people.find((p) => p.id === selectedId);
  const setSelected = (person?: Person) => setSelectedId(person?.id);
  const [edit, setEdit] = useState<Person | null | undefined>();
  const [page, setPage] = useState(1);
  const people = state.people.filter(
    (p) =>
      (role !== "STAFF" ||
        state.visits.some(
          (v) => v.hostId === userId && v.visitorId === p.id,
        )) &&
      `${fullName(p)} ${p.email} ${p.company}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">
            {role === "STAFF" ? "My visitors" : "Visitor directory"}
          </h1>
          <p className="mt-2 text-xs text-slate-500">
            Familiar faces, thoughtful welcomes. All your visitor profiles in
            one place.
          </p>
        </div>
        {role !== "STAFF" && (
          <button className="btn" onClick={() => setEdit(null)}>
            <Plus size={15} />
            Add visitor
          </button>
        )}
      </div>
      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b p-4">
          <div className="w-72">
            <SearchBox
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
            />
          </div>
          <span className="text-xs text-slate-400">
            {people.length} visitors
          </span>
        </div>
        <div className="overflow-auto">
          <table className="w-full whitespace-nowrap">
            <thead>
              <tr>
                {["Visitor", "Company", "Email", "Phone", "Status", ""].map(
                  (h, i) => (
                    <th key={i} className="table-th">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {people.slice((page - 1) * 10, page * 10).map((p) => (
                <tr
                  className="cursor-pointer hover:bg-blue-50/30"
                  key={p.id}
                  onClick={() => setSelected(p)}
                >
                  <td className="table-td">
                    <div className="flex items-center gap-3">
                      <Avatar person={p} />
                      <div>
                        <p className="font-semibold">{fullName(p)}</p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          Visitor profile
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="table-td">{p.company || "—"}</td>
                  <td className="table-td text-slate-500">{p.email || "—"}</td>
                  <td className="table-td text-slate-500">{p.phone || "—"}</td>
                  <td className="table-td">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="table-td text-blue-600">View →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!people.length && <Empty />}
        <div className="flex items-center justify-between border-t p-4 text-xs text-slate-400">
          <span>{people.length} profiles</span>
          <div className="flex gap-3">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="disabled:opacity-30"
            >
              Previous
            </button>
            <span>{page}</span>
            <button
              disabled={page * 10 >= people.length}
              onClick={() => setPage((p) => p + 1)}
              className="disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      </section>
      {selected && (
        <Dialog open onOpenChange={() => setSelected(undefined)}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle>{fullName(selected)}</DialogTitle>
              <DialogDescription>
                {selected.company} · Visitor profile & history
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-4 text-xs">
              <Avatar person={selected} />
              <span>{selected.email || "No email"}</span>
              <span>{selected.phone || "No phone"}</span>
              <StatusBadge status={selected.status} />
            </div>
            {role !== "STAFF" && (
              <div className="flex gap-2">
                <button
                  className="btn-light"
                  onClick={() => {
                    setEdit(selected);
                    setSelected(undefined);
                  }}
                >
                  Edit profile
                </button>
                <button
                  className="btn-light"
                  onClick={async () => {
                    const next =
                      selected.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
                    if (
                      !(await update({
                        path: `/visitors/${selected.id}/status`,
                        method: "PATCH",
                        body: { version: selected.version, status: next },
                      }))
                    )
                      return;
                    setSelected({ ...selected, status: next });
                    toast.success(
                      next === "ARCHIVED"
                        ? "Profile archived. Visit history is preserved."
                        : "Profile restored",
                    );
                  }}
                >
                  {selected.status === "ACTIVE"
                    ? "Archive profile"
                    : "Restore profile"}
                </button>
              </div>
            )}
            <VisitTable
              visits={state.visits
                .filter(
                  (v) =>
                    v.visitorId === selected.id &&
                    (role !== "STAFF" || v.hostId === userId),
                )
                .slice(0, 20)}
              state={state}
              onSelect={(v) => {
                setSelected(undefined);
                onSelect(v);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      {edit !== undefined && (
        <Dialog open onOpenChange={() => setEdit(undefined)}>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>{edit ? "Edit visitor" : "New visitor"}</DialogTitle>
              <DialogDescription>
                Visitor profile · Archiving preserves visit history.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (
                  !String(f.get("email") || "").trim() &&
                  !String(f.get("phone") || "").trim()
                ) {
                  toast.error(
                    "Enter an email address or phone number for this visitor.",
                  );
                  return;
                }
                const person: Person = {
                  id: edit?.id || uid(),
                  firstName: String(f.get("firstName")),
                  lastName: String(f.get("lastName")),
                  email: String(f.get("email")),
                  phone: String(f.get("phone")),
                  company: String(f.get("company")),
                  status: edit?.status || "ACTIVE",
                  notes: String(f.get("notes")),
                };
                const { id, status, ...fields } = person;
                if (!fields.email) delete fields.email;
                if (!fields.phone) delete fields.phone;
                if (
                  !(await update({
                    path: edit ? `/visitors/${edit.id}` : "/visitors",
                    method: edit ? "PATCH" : "POST",
                    body: {
                      ...fields,
                      ...(edit ? { version: edit.version } : {}),
                    },
                  }))
                )
                  return;
                setEdit(undefined);
                toast.success("Visitor profile saved");
              }}
              className="grid grid-cols-2 gap-4"
            >
              {[
                ["firstName", "First name"],
                ["lastName", "Last name"],
                ["email", "Email"],
                ["phone", "Phone"],
                ["company", "Company"],
              ].map(([k, l]) => (
                <label key={k}>
                  <span className="form-label">
                    {l}
                    {k === "firstName" ? " *" : ""}
                  </span>
                  <input
                    className="field"
                    type={k === "email" ? "email" : "text"}
                    name={k}
                    defaultValue={edit?.[k]}
                    required={k === "firstName"}
                  />
                </label>
              ))}
              <label className="col-span-2">
                <span className="form-label">Profile notes</span>
                <textarea
                  name="notes"
                  className="field"
                  defaultValue={edit?.notes}
                />
              </label>
              <button className="btn col-span-2">Save profile</button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
