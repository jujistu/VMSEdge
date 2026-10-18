import { useState } from "react";
import {
  ArrowDownToLine,
  Bell,
  Building2,
  Check,
  ChevronRight,
  Plus,
  RotateCcw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Workspace,
  Role,
  User,
  exportCsv,
  fullName,
  uid,
  time,
  day,
  localDate,
} from "@/lib/models";
import { Avatar, Empty, SearchBox, StatusBadge } from "./gatewise-shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Update } from "./gatewise-visit-dialogs";
import { toast } from "sonner";
import Reports from "./gatewise-reports";
import PasswordForm from "./password-form";
import { pageNames } from "./gatewise-records";

type Props = {
  page: string;
  state: Workspace;
  role: Role;
  userId: string;
  update: Update;
};
export default function AdminPages({
  page,
  state,
  role,
  userId,
  update,
}: Props) {
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<{
    kind: string;
    id?: string;
    version?: number;
  }>();
  const [report, setReport] = useState("daily-visitors");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterActor, setFilterActor] = useState("");
  const [selectedAudit, setSelectedAudit] = useState<string>();
  const current = state.users.find((u) => u.id === userId)!;
  const log = state.audit.find((a) => a.id === selectedAudit);
  const heading = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="page-title">{pageNames[page]}</h1>
        <p className="mt-2 text-xs text-slate-500">
          {
            {
              users: "The right people, with the right access.",
              departments: "Keep your teams organized and connected.",
              blacklist:
                "Manage visitor restrictions with care and accountability.",
              audit: "A transparent, read-only record of workspace activity.",
              reports: "Turn visitor activity into useful workplace insights.",
              settings: "Make Gatewise feel at home in your organization.",
              notifications: "Keep up with the people and visits that matter.",
              profile: "Your details, your workspace.",
            }[page]
          }
        </p>
      </div>
      {["users", "departments", "blacklist"].includes(page) && (
        <button className="btn" onClick={() => setModal({ kind: page })}>
          <Plus size={15} />
          {page === "users"
            ? "Add user"
            : page === "departments"
              ? "Add department"
              : "Add restriction"}
        </button>
      )}
    </div>
  );
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const value = (k: string) => String(f.get(k) || "");
    let command: Parameters<Update>[0];
    if (modal?.kind === "users") {
      const user = state.users.find((u) => u.id === modal.id);
      const department = state.departments.find(
        (d) => d.name === value("department"),
      );
      command = {
        path: modal.id ? `/users/${modal.id}` : "/users",
        method: modal.id ? "PATCH" : "POST",
        body: {
          firstName: value("firstName"),
          lastName: value("lastName"),
          email: value("email"),
          employeeId: value("employeeId"),
          ...(value("phone") ? { phone: value("phone") } : {}),
          role: value("role"),
          ...(department ? { departmentId: department.id } : {}),
          ...(user ? { version: modal.version } : {}),
        },
      };
    } else if (modal?.kind === "departments") {
      const old = state.departments.find((d) => d.id === modal.id);
      command = {
        path: old ? `/departments/${old.id}` : "/departments",
        method: old ? "PATCH" : "POST",
        body: {
          name: value("name"),
          description: value("description"),
          ...(old ? { version: modal.version } : {}),
        },
      };
    } else if (modal?.kind === "blacklist")
      command = {
        path: "/blacklist",
        body: { visitorId: value("visitorId"), reason: value("reason") },
      };
    else if (modal?.kind === "lift")
      command = {
        path: `/blacklist/${modal.id}/lift`,
        method: "PATCH",
        body: {
          version: state.blacklist.find((b) => b.id === modal.id)?.version,
          reason: value("reason"),
        },
      };
    else if (modal?.kind === "user-status") {
      const user = state.users.find((u) => u.id === modal.id)!;
      command = {
        path: `/users/${user.id}/status`,
        method: "PATCH",
        body: {
          version: user.version,
          status: user.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
          reason: value("reason"),
        },
      };
    } else return;
    if (!(await update(command))) return;
    toast.success(
      modal?.kind === "users" && !modal.id
        ? "User created. Account setup email queued."
        : "Changes saved",
    );
    setModal(undefined);
  };
  const input = (
    name: string,
    label: string,
    required = true,
    defaultValue = "",
    type = "text",
  ) => (
    <label>
      <span className="form-label">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        className="field"
        name={name}
        required={required}
        defaultValue={defaultValue}
        type={type}
      />
    </label>
  );
  const editUser = state.users.find((u) => u.id === modal?.id);
  const editDepartment = state.departments.find((d) => d.id === modal?.id);
  return (
    <div className="page-enter space-y-6">
      {heading}
      {page === "reports" && <Reports />}
      {page === "users" && (
        <section className="panel overflow-hidden">
          <div className="border-b p-4">
            <div className="w-72">
              <SearchBox
                value={q}
                onChange={setQ}
                placeholder="Search users…"
              />
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr>
                  {[
                    "User",
                    "Role",
                    "Department",
                    "Employee ID",
                    "Status",
                    "Actions",
                  ].map((h) => (
                    <th key={h} className="table-th">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.users
                  .filter((u) =>
                    `${fullName(u)} ${u.email} ${u.department}`
                      .toLowerCase()
                      .includes(q.toLowerCase()),
                  )
                  .map((u) => (
                    <tr key={u.id}>
                      <td className="table-td">
                        <div className="flex items-center gap-3">
                          <Avatar person={u} />
                          <div>
                            <p className="font-semibold">{fullName(u)}</p>
                            <p className="mt-1 text-[10px] text-slate-400">
                              {u.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="table-td">
                        <span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] capitalize text-blue-600">
                          {u.role.toLowerCase()}
                        </span>
                      </td>
                      <td className="table-td">{u.department}</td>
                      <td className="table-td text-slate-400">
                        {u.employeeId}
                      </td>
                      <td className="table-td">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="table-td">
                        <div className="flex gap-3">
                          <button
                            onClick={() =>
                              setModal({
                                kind: "users",
                                id: u.id,
                                version: u.version,
                              })
                            }
                            className="text-blue-600"
                          >
                            Edit
                          </button>
                          <button
                            className="text-blue-600"
                            onClick={async () => {
                              if (
                                await update({
                                  path: `/users/${u.id}/resend-setup`,
                                  body: {},
                                })
                              )
                                toast.success("Account setup email queued");
                            }}
                          >
                            Resend setup
                          </button>
                          {u.id !== userId && (
                            <button
                              onClick={() =>
                                setModal({ kind: "user-status", id: u.id })
                              }
                              className="text-slate-500"
                            >
                              {u.status === "ACTIVE" ? "Disable" : "Activate"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {page === "departments" && (
        <>
          <div className="max-w-sm">
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder="Search departments…"
            />
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {state.departments
              .filter((d) => d.name.toLowerCase().includes(q.toLowerCase()))
              .map((d) => (
                <section key={d.id} className="panel p-5">
                  <div className="flex justify-between">
                    <span className="rounded-xl bg-blue-50 p-3 text-blue-600">
                      <Building2 size={21} />
                    </span>
                    <StatusBadge status={d.status} />
                  </div>
                  <h2 className="mt-5 text-base font-bold">{d.name}</h2>
                  <p className="mt-2 text-xs text-slate-500">{d.description}</p>
                  <div className="my-5 flex gap-5 text-xs">
                    <div>
                      <span className="block text-xl font-bold">
                        {
                          state.users.filter(
                            (u) =>
                              u.department === d.name &&
                              u.role === "STAFF" &&
                              u.status === "ACTIVE",
                          ).length
                        }
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Active staff
                      </span>
                    </div>
                    <div>
                      <span className="block text-xl font-bold">
                        {
                          state.visits.filter(
                            (v) =>
                              state.users.find((u) => u.id === v.hostId)
                                ?.department === d.name,
                          ).length
                        }
                      </span>
                      <span className="text-[10px] text-slate-400">
                        All-time visits
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-3 border-t pt-4">
                    <button
                      className="text-xs font-medium text-blue-600"
                      onClick={() =>
                        setModal({
                          kind: "departments",
                          id: d.id,
                          version: d.version,
                        })
                      }
                    >
                      Edit department
                    </button>
                    <button
                      className="ml-auto text-xs text-slate-400"
                      onClick={async () => {
                        if (
                          d.status === "ACTIVE" &&
                          state.users.some(
                            (u) =>
                              u.department === d.name && u.status === "ACTIVE",
                          )
                        ) {
                          toast.error(
                            "Reassign or disable active members before archiving this department.",
                          );
                          return;
                        }
                        if (
                          !(await update({
                            path: `/departments/${d.id}`,
                            method: "PATCH",
                            body: {
                              version: d.version,
                              status:
                                d.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE",
                            },
                          }))
                        )
                          return;
                        toast.success("Department updated");
                      }}
                    >
                      {d.status === "ACTIVE" ? "Archive" : "Restore"}
                    </button>
                  </div>
                </section>
              ))}
          </div>
        </>
      )}
      {page === "blacklist" && (
        <>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
            Restrictions block new admission. A visitor already checked in stays
            inside until reception explicitly checks them out.
          </div>
          <section className="panel overflow-hidden">
            {state.blacklist.length ? (
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      {["Visitor", "Reason", "Added", "Status", ""].map(
                        (h, i) => (
                          <th key={i} className="table-th">
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {state.blacklist.map((b) => (
                      <tr key={b.id}>
                        <td className="table-td font-semibold">
                          {fullName(
                            state.people.find((p) => p.id === b.visitorId),
                          )}
                        </td>
                        <td className="table-td max-w-xs">{b.reason}</td>
                        <td className="table-td">{day(b.date)}</td>
                        <td className="table-td">
                          <StatusBadge
                            status={b.active ? "ACTIVE" : "ARCHIVED"}
                          />
                        </td>
                        <td className="table-td">
                          {b.active && (
                            <button
                              className="text-blue-600"
                              onClick={() =>
                                setModal({ kind: "lift", id: b.id })
                              }
                            >
                              Lift restriction
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No visitor restrictions"
                description="When a visitor is restricted, their record and reason will appear here."
              />
            )}
          </section>
        </>
      )}
      {page === "audit" && (
        <>
          <div className="panel flex flex-wrap gap-3 p-4">
            <input
              className="field min-w-48 flex-1"
              placeholder="Search activity…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              aria-label="Filter actor"
              className="field w-auto"
              value={filterActor}
              onChange={(e) => setFilterActor(e.target.value)}
            >
              <option value="">All actors</option>
              {Array.from(new Set(state.audit.map((a) => a.actor))).map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            <select
              aria-label="Filter action"
              className="field w-auto"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
            >
              <option value="">All actions</option>
              {Array.from(new Set(state.audit.map((a) => a.action))).map(
                (a) => (
                  <option key={a}>{a}</option>
                ),
              )}
            </select>
          </div>
          <section className="panel overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {["Timestamp (WAT)", "Action", "Actor", "Detail", ""].map(
                      (h, i) => (
                        <th key={i} className="table-th">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {state.audit
                    .filter(
                      (a) =>
                        (!filterAction || a.action === filterAction) &&
                        (!filterActor || a.actor === filterActor) &&
                        `${a.action} ${a.detail} ${a.actor}`
                          .toLowerCase()
                          .includes(q.toLowerCase()),
                    )
                    .map((a) => (
                      <tr
                        key={a.id}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => setSelectedAudit(a.id)}
                      >
                        <td className="table-td whitespace-nowrap text-slate-400">
                          {day(a.date)} {time(a.date)}
                        </td>
                        <td className="table-td font-medium">{a.action}</td>
                        <td className="table-td">{a.actor}</td>
                        <td className="table-td max-w-xs truncate text-slate-500">
                          {a.detail}
                        </td>
                        <td className="table-td text-blue-600">
                          <ChevronRight size={14} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          <p className="text-[11px] text-slate-400">
            Activity is recorded by the server.
          </p>
        </>
      )}
      {page === "settings" && (
        <>
          <form
            key={state.settings.version}
            className="panel max-w-2xl space-y-5 p-6"
            onSubmit={async (e) => {
              e.preventDefault();
              if (role !== "ADMIN") return;
              const f = new FormData(e.currentTarget);
              if (
                !(await update({
                  path: "/settings",
                  method: "PATCH",
                  body: {
                    version: state.settings.version,
                    organizationName: String(f.get("organizationName")),
                    earlyArrivalMinutes: Number(f.get("earlyArrivalMinutes")),
                  },
                }))
              )
                return;
              toast.success("Settings saved");
            }}
          >
            <div>
              <h2 className="text-sm font-bold">Organization preferences</h2>
              <p className="mt-1 text-xs text-slate-400">
                A consistent experience for everyone in your workplace.
              </p>
            </div>
            <fieldset disabled={role !== "ADMIN"}>
              {input(
                "organizationName",
                "Organization name",
                true,
                state.settings.organizationName,
              )}
            </fieldset>
            <label>
              <span className="form-label">Early arrival window (minutes)</span>
              <input
                name="earlyArrivalMinutes"
                disabled={role !== "ADMIN"}
                type="number"
                min={0}
                max={120}
                required
                defaultValue={state.settings.earlyArrivalMinutes}
                className="field"
              />
              <p className="mt-2 text-[10px] text-slate-400">
                Check-in opens this many minutes before scheduled arrival.
              </p>
            </label>
            <div className="rounded-lg bg-slate-50 p-4 text-xs">
              <p className="font-semibold">Timezone</p>
              <p className="mt-2 text-slate-500">
                Africa/Lagos (WAT, UTC+01:00) · Read-only
              </p>
            </div>
            {role === "ADMIN" && (
              <button className="btn">Save preferences</button>
            )}
          </form>
        </>
      )}
      {page === "profile" && (
        <>
          <form
            key={userId}
            className="panel grid max-w-2xl grid-cols-2 gap-5 p-6"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                !(await update({
                  path: "/users/me",
                  method: "PATCH",
                  body: {
                    firstName: String(f.get("firstName")),
                    lastName: String(f.get("lastName")),
                    ...(f.get("phone")
                      ? { phone: String(f.get("phone")) }
                      : {}),
                  },
                }))
              )
                return;
              toast.success("Profile saved");
            }}
          >
            <div className="col-span-2 flex items-center gap-4 border-b pb-5">
              <Avatar person={current} />
              <div>
                <h2 className="text-sm font-bold">{fullName(current)}</h2>
                <p className="mt-1 text-xs capitalize text-slate-500">
                  {current.role.toLowerCase()} · {current.department}
                </p>
              </div>
            </div>
            {input("firstName", "First name", true, current.firstName)}
            {input("lastName", "Last name", false, current.lastName)}
            {input("phone", "Phone", false, current.phone || "")}
            <div>
              <p className="form-label">Email · read-only</p>
              <p className="py-2 text-sm text-slate-500">{current.email}</p>
            </div>
            <button className="btn col-span-2 justify-self-start">
              Save profile
            </button>
          </form>
          <PasswordForm />
        </>
      )}
      {page === "notifications" && (
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b p-5">
            <h2 className="text-sm font-bold">Your notifications</h2>
            <button
              className="text-xs font-medium text-blue-600"
              onClick={() =>
                void update({ path: "/notifications/read-all", body: {} })
              }
            >
              Mark all as read
            </button>
          </div>
          {state.notifications.map((n) => (
            <button
              key={n.id}
              className={`flex w-full items-start gap-4 border-b p-5 text-left transition-colors hover:bg-blue-50/50 ${n.read ? "" : "bg-blue-50/30"}`}
              onClick={() =>
                void update({
                  path: `/notifications/${n.id}/read`,
                  method: "PATCH",
                })
              }
            >
              <span className="rounded-lg bg-blue-50 p-2 text-blue-500">
                <Bell size={17} />
              </span>
              <div className="flex-1">
                <p className="text-xs font-semibold">{n.title}</p>
                <p className="mt-2 text-xs text-slate-500">{n.message}</p>
              </div>
              {!n.read && (
                <span className="mt-2 h-2 w-2 rounded-full bg-blue-500" />
              )}
            </button>
          ))}
        </section>
      )}
      {modal && (
        <Dialog open onOpenChange={() => setModal(undefined)}>
          <DialogContent className="max-h-[85vh] overflow-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle>
                {modal.kind === "lift"
                  ? "Lift visitor restriction"
                  : modal.kind === "user-status"
                    ? "Change user status"
                    : `${modal.id ? "Edit" : "Add"} ${modal.kind === "users" ? "user" : modal.kind === "departments" ? "department" : "restriction"}`}
              </DialogTitle>
              <DialogDescription>
                Changes are saved to the server.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={save} className="space-y-4">
              {modal.kind === "users" && (
                <>
                  {input("firstName", "First name", true, editUser?.firstName)}
                  {input("lastName", "Last name", true, editUser?.lastName)}
                  {input("email", "Email", true, editUser?.email, "email")}
                  {input(
                    "employeeId",
                    "Employee ID",
                    true,
                    editUser?.employeeId,
                  )}
                  {input("phone", "Phone", false, editUser?.phone)}
                  <label>
                    <span className="form-label">Role</span>
                    <select
                      name="role"
                      className="field"
                      defaultValue={editUser?.role || "STAFF"}
                      disabled={modal.id === userId}
                    >
                      {["STAFF", "RECEPTIONIST", "ADMIN"].map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                    {modal.id === userId && (
                      <input type="hidden" name="role" value={current.role} />
                    )}
                  </label>
                  <label>
                    <span className="form-label">Department</span>
                    <select
                      name="department"
                      className="field"
                      defaultValue={editUser?.department}
                    >
                      {state.departments
                        .filter((d) => d.status === "ACTIVE")
                        .map((d) => (
                          <option key={d.id}>{d.name}</option>
                        ))}
                    </select>
                  </label>
                  <p className="text-[10px] leading-5 text-slate-400">
                    New users receive an account setup email. Run the backend
                    worker to deliver queued emails.
                  </p>
                </>
              )}
              {modal.kind === "departments" && (
                <>
                  {input("name", "Department name", true, editDepartment?.name)}
                  {input(
                    "description",
                    "Description",
                    false,
                    editDepartment?.description,
                  )}
                </>
              )}
              {modal.kind === "blacklist" && (
                <label>
                  <span className="form-label">Visitor *</span>
                  <select name="visitorId" className="field" required>
                    <option value="">Choose a visitor</option>
                    {state.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {fullName(p)} · {p.company}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {["blacklist", "lift", "user-status"].includes(modal.kind) && (
                <label>
                  <span className="form-label">Reason *</span>
                  <textarea
                    name="reason"
                    className="field"
                    required
                    minLength={3}
                  />
                </label>
              )}
              <div className="flex justify-end gap-2 border-t pt-4">
                <button
                  type="button"
                  className="btn-light"
                  onClick={() => setModal(undefined)}
                >
                  Cancel
                </button>
                <button className={`btn `}>Save changes</button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {log && (
        <Dialog open onOpenChange={() => setSelectedAudit(undefined)}>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>Activity details</DialogTitle>
              <DialogDescription>
                Read-only server audit record
              </DialogDescription>
            </DialogHeader>
            <dl className="space-y-4 text-sm">
              {[
                ["Action", log.action],
                ["Actor", log.actor],
                ["Timestamp", `${day(log.date)} ${time(log.date)} WAT`],
                ["Detail", log.detail],
                ["Reference", log.id],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="mb-1 text-xs text-slate-400">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
