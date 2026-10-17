import { DoorOpen, Search, Users, ArrowUpRight, Building2 } from "lucide-react";
import {
  Workspace,
  Person,
  Visit,
  fullName,
  initials,
  labels,
  time,
} from "@/lib/models";
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-blue-500 text-white">
        <DoorOpen size={24} strokeWidth={2.3} />
      </div>
      {!small && (
        <span className="brand text-[25px] font-extrabold tracking-[-1px]">
          gatewise<span className="text-blue-400">.</span>
        </span>
      )}
    </div>
  );
}
export function Avatar({
  person,
  size = "normal",
}: {
  person?: { firstName: string; lastName: string };
  size?: "normal" | "small";
}) {
  const colors = [
    "bg-blue-50 text-blue-600",
    "bg-violet-50 text-violet-600",
    "bg-amber-50 text-amber-700",
    "bg-emerald-50 text-emerald-700",
    "bg-rose-50 text-rose-600",
  ];
  const c = (person?.firstName.charCodeAt(0) || 0) % colors.length;
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${colors[c]} ${size === "small" ? "h-8 w-8 text-[10px]" : "h-9 w-9 text-[11px]"}`}
    >
      {initials(person)}
    </span>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const color: Record<string, string> = {
    CHECKED_IN: "bg-emerald-50 text-emerald-700",
    CHECKED_OUT: "bg-slate-100 text-slate-600",
    EXPECTED: "bg-blue-50 text-blue-600",
    PENDING: "bg-amber-50 text-amber-700",
    APPROVED: "bg-teal-50 text-teal-700",
    PRE_REGISTERED: "bg-violet-50 text-violet-600",
    REJECTED: "bg-rose-50 text-rose-600",
    CANCELLED: "bg-rose-50 text-rose-600",
    EXPIRED: "bg-slate-100 text-slate-600",
    ACTIVE: "bg-emerald-50 text-emerald-700",
    ARCHIVED: "bg-slate-100 text-slate-600",
    DISABLED: "bg-rose-50 text-rose-600",
  };
  return (
    <span
      className={`inline-flex whitespace-nowrap items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium ${color[status] || "bg-slate-100 text-slate-600"}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {labels[status] || status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
export function Empty({
  title = "Nothing here just yet",
  description = "Try a different search or add your first record.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 rotate-[-5deg] items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-500">
        <Users size={30} strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="mt-1.5 max-w-xs text-xs leading-5 text-slate-500">
        {description}
      </p>
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Search visitors…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search
        size={15}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field pl-9 text-xs"
        placeholder={placeholder}
      />
    </div>
  );
}
export function VisitTable({
  visits,
  state,
  onSelect,
  compact = false,
}: {
  visits: Visit[];
  state: Workspace;
  onSelect: (v: Visit) => void;
  compact?: boolean;
}) {
  return visits.length ? (
    <>
      <div className="hidden overflow-auto md:block">
        <table className="w-full border-collapse whitespace-nowrap">
          <thead>
            <tr>
              {[
                "Visitor",
                "Host / department",
                "Visit type",
                "Check-in time",
                "Status",
                "",
              ].map((h, i) => (
                <th key={i} className="table-th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => {
              const p = state.people.find((p) => p.id === v.visitorId);
              const h = state.users.find((u) => u.id === v.hostId);
              return (
                <tr
                  key={v.id}
                  className="group cursor-pointer hover:bg-blue-50/30"
                  onClick={() => onSelect(v)}
                >
                  <td className="table-td">
                    <div className="flex items-center gap-2.5">
                      <Avatar person={p} />
                      <div>
                        <p className="font-semibold text-slate-700">
                          {fullName(p)}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {p?.company || "Independent"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="table-td">
                    <p className="font-medium text-slate-600">{fullName(h)}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {h?.department || "—"}
                    </p>
                  </td>
                  <td className="table-td">
                    <span className="rounded-md border border-slate-200 px-2 py-1 text-[10px] text-slate-500">
                      {v.source}
                    </span>
                  </td>
                  <td className="table-td text-slate-500">
                    {v.checkIn ? (
                      time(v.checkIn)
                    ) : (
                      <span className="text-slate-400">
                        {time(v.arrival)}{" "}
                        <span className="text-[9px]">expected</span>
                      </span>
                    )}
                  </td>
                  <td className="table-td">
                    <StatusBadge status={v.status} />
                  </td>
                  <td className="table-td">
                    <button
                      aria-label={`View ${fullName(p)}`}
                      className="rounded-md p-1.5 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600"
                    >
                      <ArrowUpRight size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="divide-y md:hidden">
        {visits.map((v) => {
          const p = state.people.find((p) => p.id === v.visitorId);
          return (
            <button
              key={v.id}
              onClick={() => onSelect(v)}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              <Avatar person={p} />
              <div className="flex-1">
                <p className="text-sm font-semibold">{fullName(p)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {p?.company} · {time(v.arrival)}
                </p>
              </div>
              <StatusBadge status={v.status} />
            </button>
          );
        })}
      </div>
    </>
  ) : (
    <Empty
      title="No visits to show"
      description="Visits that match your filters will appear here."
    />
  );
}
export function ReceptionArt() {
  return (
    <svg
      viewBox="0 0 240 150"
      className="h-full w-full"
      fill="none"
      aria-label="Illustration of an office entrance"
    >
      <ellipse cx="129" cy="137" rx="99" ry="9" fill="#DAE7FF" />
      <path d="M52 133V28a7 7 0 0 1 7-7h99a7 7 0 0 1 7 7v105" fill="#DCE8FD" />
      <path d="M63 132V32h87v100" fill="#ADC7F7" />
      <path d="m78 132 1-94 61 9v85" fill="#3275E8" />
      <path d="m84 132 1-87 48 8v79" fill="#4586F2" />
      <path
        d="M119 87v12"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect
        x="155"
        y="63"
        width="50"
        height="61"
        rx="7"
        fill="white"
        stroke="#D0DFFF"
      />
      <rect x="172" y="57" width="15" height="10" rx="3" fill="#85A9EB" />
      <circle cx="180" cy="83" r="8" fill="#D8E7FF" />
      <path d="M167 104c0-13 26-13 26 0" fill="#D8E7FF" />
      <path
        d="M170 113h20"
        stroke="#85A9EB"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M37 126V96m0 14C13 105 20 83 37 101m0 15c22-5 21-25 1-16"
        stroke="#6FA496"
        strokeWidth="3"
        fill="#92BEAF"
      />
      <path d="m24 121 4 16h18l4-16" fill="#F1F5FC" stroke="#CDD9EB" />
      <circle cx="192" cy="40" r="12" fill="#E6F2ED" />
      <path
        d="m187 40 4 4 7-8"
        stroke="#5A9E80"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
