import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  CheckCheck,
  Clock3,
  DoorOpen,
  LogIn,
  LogOut,
  Plus,
  ScanLine,
  ShieldCheck,
  Users,
  UserRoundCheck,
  RefreshCw,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Workspace,
  Role,
  Visit,
  day,
  today,
  localDate,
  fullName,
  exportCsv,
} from "@/lib/models";
import { Avatar, ReceptionArt, VisitTable } from "./gatewise-shared";
import { useState } from "react";

type Props = {
  state: Workspace;
  role: Role;
  userId: string;
  onNavigate: (p: string) => void;
  onCreate: (kind: "walk-in" | "invitation") => void;
  onSelect: (v: Visit) => void;
  refresh: () => Promise<void>;
};
export default function Dashboard({
  state,
  role,
  userId,
  onNavigate,
  onCreate,
  onSelect,
  refresh,
}: Props) {
  const [tab, setTab] = useState("All visitors");
  const [updated, setUpdated] = useState(new Date());
  const visits = state.visits.filter(
    (v) => role !== "STAFF" || v.hostId === userId,
  );
  const todays = visits.filter((v) => localDate(v.arrival) === today());
  const inside = visits.filter((v) => v.status === "CHECKED_IN");
  const waiting = visits.filter((v) => v.status === "PENDING");
  const user = state.users.find((u) => u.id === userId);
  const metrics =
    role === "STAFF"
      ? [
          {
            label: "Expected today",
            value: todays.filter((v) => v.status === "EXPECTED").length,
            icon: CalendarDays,
            color: "blue",
            note: "Scheduled to visit you",
          },
          {
            label: "Pending requests",
            value: waiting.length,
            icon: Clock3,
            color: "amber",
            note: "Awaiting your decision",
          },
          {
            label: "Visitors waiting",
            value: visits.filter(
              (v) => v.arrivedAt && ["APPROVED", "PENDING"].includes(v.status),
            ).length,
            icon: Users,
            color: "violet",
            note: "At the reception desk",
          },
          {
            label: "Currently meeting",
            value: inside.length,
            icon: UserRoundCheck,
            color: "emerald",
            note: "Your checked-in visitors",
          },
        ]
      : [
          {
            label: "Checked in today",
            value: todays.filter((v) => v.checkIn).length,
            icon: LogIn,
            color: "blue",
            note: "Total arrivals today",
          },
          {
            label: "Currently inside",
            value: inside.length,
            icon: Users,
            color: "emerald",
            note: "Visitors on premises",
          },
          {
            label: "Expected visitors",
            value: todays.filter((v) => v.status === "EXPECTED").length,
            icon: CalendarDays,
            color: "violet",
            note: "Scheduled for today",
          },
          {
            label: "Pending approvals",
            value: waiting.length,
            icon: Clock3,
            color: "amber",
            note: "Awaiting host approval",
          },
          {
            label: "Checked out today",
            value: visits.filter(
              (v) => v.checkOut && localDate(v.checkOut) === today(),
            ).length,
            icon: LogOut,
            color: "slate",
            note: "Visits completed today",
          },
          {
            label: "Walk-ins today",
            value: todays.filter((v) => v.source === "Walk-in").length,
            icon: DoorOpen,
            color: "cyan",
            note: "Registered at reception",
          },
        ];
  const keys =
    role === "STAFF"
      ? [
          "expectedToday",
          "pendingRequests",
          "visitorsWaiting",
          "currentlyMeeting",
        ]
      : [
          "visitorsToday",
          "currentlyInside",
          "expectedVisitors",
          "pendingApprovals",
          "checkedOutToday",
          "walkInVisitors",
        ];
  metrics.forEach((metric, i) => {
    metric.value = state.dashboard?.metrics[keys[i]] ?? metric.value;
  });
  const chart =
    state.dashboard?.trends.map((t) => ({
      ...t,
      date: new Intl.DateTimeFormat("en", {
        weekday: "short",
        timeZone: "Africa/Lagos",
      }).format(new Date(t.date)),
    })) ||
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - 6 + i);
      const date = localDate(d.toISOString());
      return {
        date: new Intl.DateTimeFormat("en", { weekday: "short" }).format(d),
        arrivals: visits.filter(
          (v) => v.checkIn && localDate(v.checkIn) === date,
        ).length,
        departures: visits.filter(
          (v) => v.checkOut && localDate(v.checkOut) === date,
        ).length,
      };
    });
  const departments =
    state.dashboard?.visitorsByDepartment ||
    state.departments
      .map((d) => ({
        ...d,
        count: todays.filter(
          (v) =>
            state.users.find((u) => u.id === v.hostId)?.department === d.name,
        ).length,
      }))
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count);
  const filtered = todays
    .filter(
      (v) =>
        tab === "All visitors" ||
        (tab === "Checked in" && v.status === "CHECKED_IN") ||
        (tab === "Expected" && v.status === "EXPECTED") ||
        (tab === "Pending" && v.status === "PENDING"),
    )
    .slice(0, 5);
  const exportData = () =>
    exportCsv(
      [
        ["Visitor", "Host", "Status", "Arrival"],
        ...todays.map((v) => [
          fullName(state.people.find((p) => p.id === v.visitorId)),
          fullName(state.users.find((u) => u.id === v.hostId)),
          v.status,
          v.arrival,
        ]),
      ],
      "gatewise-today.csv",
    );
  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-400">
            Workspace <span>/</span>{" "}
            <span className="text-slate-600">Overview</span>
          </div>
          <h1 className="page-title">
            {role === "STAFF"
              ? "My dashboard"
              : role === "RECEPTIONIST"
                ? "Reception dashboard"
                : "Overview"}
          </h1>
          <p className="mt-1.5 text-[12px] text-slate-500">
            A clear view of your people, visits, and workplace.
          </p>
        </div>
        <div className="flex gap-2 pt-5">
          <button className="btn-light" onClick={exportData}>
            <ArrowDownToLine size={14} />
            Export report
          </button>
          <button
            className="btn"
            onClick={() =>
              onCreate(role === "STAFF" ? "invitation" : "walk-in")
            }
          >
            <Plus size={16} />
            {role === "STAFF" ? "Create invitation" : "Register visitor"}
          </button>
        </div>
      </div>
      <section className="relative flex min-h-[137px] items-center justify-between overflow-hidden rounded-xl border border-blue-100 bg-[#edf4ff] px-6 py-5">
        <div className="relative z-10">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.12em] text-blue-600">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            Your workplace, connected
          </div>
          <h2 className="text-[23px] font-extrabold tracking-[-.7px] text-[#193b70]">
            Good morning, {user?.firstName}{" "}
            <span className="ml-1 text-xl">☀️</span>
          </h2>
          <p className="mt-2 text-xs leading-5 text-[#607493]">
            Here’s what’s happening at {state.settings.organizationName} today.
            <br className="sm:hidden" /> Let’s make every welcome count.
          </p>
        </div>
        <div className="hidden h-[125px] w-[225px] shrink-0 sm:block">
          <ReceptionArt />
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-tight">
          Today at a glance{" "}
          <span className="ml-2 rounded-md bg-slate-100 px-2 py-1 text-[9px] font-medium text-slate-500">
            {new Intl.DateTimeFormat("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "Africa/Lagos",
            }).format(new Date())}
          </span>
        </h2>
        <button
          onClick={async () => {
            try {
              await refresh();
              setUpdated(new Date());
            } catch {
              /* Workspace shows the error and retry control. */
            }
          }}
          className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-blue-600"
        >
          <RefreshCw size={11} /> Updated{" "}
          {updated.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · WAT
        </button>
      </div>
      <div
        className={`grid grid-cols-2 gap-3 ${role === "STAFF" ? "xl:grid-cols-4" : "xl:grid-cols-6"}`}
      >
        {metrics.map((m) => {
          const c: Record<string, string> = {
            blue: "bg-blue-50 text-blue-600",
            emerald: "bg-emerald-50 text-emerald-600",
            violet: "bg-violet-50 text-violet-600",
            amber: "bg-amber-50 text-amber-600",
            slate: "bg-slate-100 text-slate-500",
            cyan: "bg-cyan-50 text-cyan-600",
          };
          return (
            <button
              key={m.label}
              onClick={() =>
                onNavigate(
                  m.label.includes("inside")
                    ? "occupancy"
                    : m.label.includes("approvals") ||
                        m.label.includes("requests")
                      ? "requests"
                      : "visits",
                )
              }
              className="panel p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div
                className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${c[m.color]}`}
              >
                <m.icon size={16} strokeWidth={1.8} />
              </div>
              <p className="mb-1.5 text-[10px] font-medium text-slate-500">
                {m.label}
              </p>
              <p className="font-sans text-[28px] font-semibold leading-8 tracking-[-1px]">
                {String(m.value).padStart(2, "0")}
              </p>
              <p className="mt-2 text-[9px] text-slate-400">{m.note}</p>
            </button>
          );
        })}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <section className="panel min-w-0">
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <h3 className="text-[13px] font-bold">Visitor activity</h3>
              <p className="mt-1 text-[10px] text-slate-400">
                Arrivals and departures over the last 7 days
              </p>
            </div>
            <span className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] text-slate-500">
              Last 7 days
            </span>
          </div>
          <div className="mb-2 mt-4 flex gap-4 px-5 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-sm bg-blue-500" />
              Arrivals
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-sm bg-blue-200" />
              Departures
            </span>
          </div>
          <div className="h-[200px] pr-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chart}
                barGap={4}
                margin={{ top: 10, right: 5, left: -22, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#eef1f5"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a0b3", fontSize: 10 }}
                  dy={6}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  tick={{ fill: "#94a0b3", fontSize: 10 }}
                />
                <Tooltip
                  cursor={{ fill: "#f6f8fc" }}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="arrivals"
                  name="Arrivals"
                  fill="#4482ef"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={16}
                />
                <Bar
                  dataKey="departures"
                  name="Departures"
                  fill="#c4d9fd"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={16}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel px-5 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[13px] font-bold">
                {role === "ADMIN" ? "Visitors by department" : "Quick actions"}
              </h3>
              <p className="mt-1 text-[10px] text-slate-400">
                {role === "ADMIN"
                  ? "Today’s visits across your teams"
                  : "Your most-used workflows, one click away"}
              </p>
            </div>
            {role === "ADMIN" && (
              <button
                onClick={() => onNavigate("reports")}
                className="text-[10px] font-medium text-blue-600"
              >
                View report <ArrowRight className="inline" size={12} />
              </button>
            )}
          </div>
          {role === "ADMIN" ? (
            <>
              <div className="mt-6 space-y-4">
                {departments.slice(0, 4).map((d, i) => (
                  <div key={d.name}>
                    <div className="mb-2 flex justify-between text-[11px]">
                      <span className="text-slate-600">{d.name}</span>
                      <span className="font-semibold">
                        {d.count}{" "}
                        <span className="font-normal text-slate-400">
                          visitors
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${["bg-blue-500", "bg-indigo-400", "bg-cyan-400", "bg-violet-400"][i]}`}
                        style={{
                          width: `${(d.count / Math.max(...departments.map((d) => d.count), 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 border-t border-slate-100 pt-3 text-[10px] text-slate-400">
                {
                  state.users.filter(
                    (u) => u.role === "STAFF" && u.status === "ACTIVE",
                  ).length
                }{" "}
                active hosts <span className="mx-2">·</span>
                {
                  state.departments.filter((d) => d.status === "ACTIVE").length
                }{" "}
                active departments
              </p>
            </>
          ) : (
            <div className="mt-5 space-y-2">
              {[
                {
                  label:
                    role === "STAFF"
                      ? "Create invitation"
                      : "Register a walk-in",
                  icon: Plus,
                  action: () =>
                    onCreate(role === "STAFF" ? "invitation" : "walk-in"),
                },
                {
                  label:
                    role === "STAFF"
                      ? "Review approval inbox"
                      : "Find an invitation",
                  icon: role === "STAFF" ? CheckCheck : ScanLine,
                  action: () =>
                    onNavigate(role === "STAFF" ? "requests" : "lookup"),
                },
                {
                  label:
                    role === "STAFF"
                      ? "View my visitor history"
                      : "View current occupancy",
                  icon: Users,
                  action: () =>
                    onNavigate(role === "STAFF" ? "history" : "occupancy"),
                },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={a.action}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-100 p-3 text-left text-xs font-medium text-slate-600 hover:bg-blue-50"
                >
                  <a.icon size={17} className="text-blue-500" />
                  {a.label}
                  <ArrowRight size={14} className="ml-auto" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between px-5 pb-4 pt-5">
          <div>
            <h3 className="text-[13px] font-bold">
              Today’s visitors{" "}
              <span className="ml-2 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">
                {todays.length}
              </span>
            </h3>
            <p className="mt-1 text-[10px] text-slate-400">
              A warm welcome starts with a well-organized front desk.
            </p>
          </div>
          <button
            onClick={() => onNavigate("visits")}
            className="flex items-center gap-1.5 text-[11px] font-medium text-blue-600"
          >
            View all visitors <ArrowRight size={13} />
          </button>
        </div>
        <div className="flex gap-5 border-b border-slate-100 px-5">
          {["All visitors", "Checked in", "Expected", "Pending"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 pb-3 text-[11px] ${tab === t ? "border-blue-600 font-semibold text-blue-600" : "border-transparent text-slate-400"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <VisitTable visits={filtered} state={state} onSelect={onSelect} />
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[10px] text-slate-400">
          <span>
            Showing {filtered.length} of {todays.length} visitors today
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={12} /> Secure. Organized. Welcoming.
          </span>
        </div>
      </section>
      <div className="flex flex-wrap justify-between gap-2 pb-2 text-[10px] text-slate-400">
        <span>Make a great first impression. Every visit, every time.</span>
        <span>All times in Africa/Lagos (WAT)</span>
      </div>
    </div>
  );
}
