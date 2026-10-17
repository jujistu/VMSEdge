import { useState } from "react";
import {
  CalendarDays,
  Check,
  Copy,
  LogIn,
  LogOut,
  MapPin,
  ShieldAlert,
  User,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Workspace,
  Role,
  Visit,
  Person,
  uid,
  fullName,
  time,
  day,
  labels,
  blockers,
} from "@/lib/models";
import { Avatar, StatusBadge, SearchBox } from "./gatewise-shared";
import { toast } from "sonner";
export type { Update } from "@/lib/api";
import { Update, request } from "@/lib/api";
export function CreateVisit({
  kind,
  state,
  role,
  userId,
  onClose,
  update,
  edit,
}: {
  kind: "walk-in" | "invitation";
  state: Workspace;
  role: Role;
  userId: string;
  onClose: () => void;
  update: Update;
  edit?: Visit;
}) {
  const [mode, setMode] = useState("new");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Person>();
  const [error, setError] = useState("");
  const [hostSearch, setHostSearch] = useState("");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    hostId: role === "STAFF" ? userId : edit?.hostId || "",
    purpose: edit?.purpose || "",
    type: edit?.type || "BUSINESS",
    arrival: edit
      ? new Date(new Date(edit.arrival).getTime() + 3600000)
          .toISOString()
          .slice(0, 16)
      : "",
    departure: edit
      ? new Date(new Date(edit.departure).getTime() + 3600000)
          .toISOString()
          .slice(0, 16)
      : "",
    notes: edit?.notes || "",
    vehicle: edit?.vehicle || "",
    items: edit?.items || "",
    draft: edit?.status === "PRE_REGISTERED",
    primaryVisitId: "",
  });
  const field = (key: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!edit && mode === "new" && !form.email.trim() && !form.phone.trim()) {
      setError("Enter an email address or phone number for this visitor.");
      return;
    }
    const lead = state.visits.find((v) => v.id === form.primaryVisitId);
    const arrival = lead
      ? lead.arrival
      : kind === "walk-in"
        ? new Date().toISOString()
        : new Date(form.arrival + "+01:00").toISOString();
    const departure = lead
      ? lead.departure
      : new Date(form.departure + "+01:00").toISOString();
    if (
      new Date(departure) <= new Date(arrival) ||
      new Date(departure).getTime() - new Date(arrival).getTime() > 86400000
    ) {
      setError("Departure must be after arrival, within 24 hours.");
      return;
    }
    if (mode === "existing" && !selected && !edit) {
      setError("Choose a returning visitor from the search results.");
      return;
    }
    if (!form.hostId) {
      setError("Select an active staff host.");
      return;
    }
    const primary = state.visits.find((v) => v.id === form.primaryVisitId);
    if (
      primary &&
      (primary.hostId !== form.hostId ||
        primary.arrival !== arrival ||
        primary.departure !== departure)
    ) {
      setError(
        "Linked guests must use the same host and exact schedule as the lead visit.",
      );
      return;
    }
    const body = {
      purpose: form.purpose,
      visitorType: form.type,
      expectedDepartureAt: departure,
      notes: form.notes,
    };
    const visitor = selected
      ? { visitorId: selected.id }
      : {
          visitor: {
            firstName: form.firstName,
            lastName: form.lastName,
            ...(form.email ? { email: form.email } : {}),
            ...(form.phone ? { phone: form.phone } : {}),
            company: form.company,
          },
        };
    const command = edit
      ? {
          path: `/invitations/${edit.invitationId}`,
          method: "PATCH" as const,
          body: { ...body, version: edit.version, expectedArrivalAt: arrival },
        }
      : {
          path: kind === "walk-in" ? "/visitor-requests" : "/invitations",
          body: {
            ...body,
            ...visitor,
            ...(role === "STAFF" ? {} : { hostId: form.hostId }),
            ...(form.primaryVisitId
              ? { primaryVisitId: form.primaryVisitId }
              : {}),
            ...(kind === "invitation"
              ? { expectedArrivalAt: arrival, draft: form.draft }
              : {
                  vehicleRegistrationNumber: form.vehicle,
                  itemsCarried: form.items
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                }),
          },
        };
    if (!(await update(command))) return;
    toast.success(
      edit
        ? "Invitation updated"
        : kind === "walk-in"
          ? "Walk-in registered. Waiting for host approval."
          : form.draft
            ? "Invitation saved as a draft"
            : "Invitation created",
    );
    onClose();
  };
  const textInput = (
    key: keyof typeof form,
    label: string,
    required = false,
    type = "text",
  ) => (
    <label>
      <span className="form-label">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type={type}
        className="field"
        required={required}
        value={String(form[key])}
        onChange={(e) => field(key, e.target.value)}
      />
    </label>
  );
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {edit
              ? "Edit invitation"
              : kind === "walk-in"
                ? "Register a walk-in"
                : "Create an invitation"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {edit
              ? "Update the invitation details."
              : kind === "walk-in"
                ? "Welcome your visitor. The host will approve their entry."
                : "Plan a smooth arrival for your guest."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="mt-2 space-y-5">
          {!edit && (
            <>
              <div className="flex rounded-lg bg-slate-100 p-1">
                {["new", "existing"].map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => {
                      setMode(m);
                      setSelected(undefined);
                    }}
                    className={`flex-1 rounded-md py-2 text-xs font-semibold ${mode === m ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}
                  >
                    {m === "new" ? "New visitor" : "Returning visitor"}
                  </button>
                ))}
              </div>
              {mode === "new" ? (
                <div className="grid grid-cols-2 gap-4">
                  {textInput("firstName", "First name", true)}
                  {textInput("lastName", "Last name")}
                  {textInput("email", "Email address", false, "email")}
                  {textInput("phone", "Phone number")}
                  <p className="col-span-2 text-xs text-slate-500">
                    Provide an email address or phone number.
                  </p>
                  {textInput("company", "Company")}
                </div>
              ) : (
                <div>
                  <SearchBox
                    value={search}
                    onChange={setSearch}
                    placeholder="Find by name, email, or company…"
                  />
                  <p className="mt-2 text-[10px] text-slate-400">
                    Select the correct person. Shared contact details do not
                    establish identity.
                  </p>
                  <div className="mt-2 max-h-40 divide-y overflow-auto rounded-lg border">
                    {state.people
                      .filter(
                        (p) =>
                          p.status === "ACTIVE" &&
                          `${fullName(p)} ${p.email} ${p.company}`
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                      )
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelected(p)}
                          className={`flex w-full items-center gap-3 p-3 text-left ${selected?.id === p.id ? "bg-blue-50" : "hover:bg-slate-50"}`}
                        >
                          <Avatar person={p} />
                          <span className="flex-1">
                            <span className="block text-xs font-semibold">
                              {fullName(p)}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {p.company} · {p.email} · {p.phone}
                            </span>
                          </span>
                          {selected?.id === p.id && (
                            <Check size={16} className="text-blue-600" />
                          )}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}
          <div className="grid grid-cols-1 gap-4 border-t pt-5 sm:grid-cols-2">
            {role !== "STAFF" && !edit && (
              <label className="sm:col-span-2">
                <span className="form-label">Staff host *</span>
                <input
                  className="field mb-2"
                  aria-label="Search hosts"
                  placeholder="Search active staff hosts…"
                  value={hostSearch}
                  onChange={(e) => setHostSearch(e.target.value)}
                />
                <select
                  aria-label="Staff host"
                  required
                  value={form.hostId}
                  onChange={(e) => field("hostId", e.target.value)}
                  className="field"
                >
                  <option value="">Choose a host</option>
                  {state.users
                    .filter(
                      (u) =>
                        u.role === "STAFF" &&
                        u.status === "ACTIVE" &&
                        state.departments.some(
                          (d) =>
                            d.name === u.department && d.status === "ACTIVE",
                        ) &&
                        `${fullName(u)} ${u.department}`
                          .toLowerCase()
                          .includes(hostSearch.toLowerCase()),
                    )
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {fullName(u)} — {u.department}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {textInput("purpose", "Purpose of visit", true)}
            <label>
              <span className="form-label">Visitor type *</span>
              <select
                className="field"
                value={form.type}
                onChange={(e) => field("type", e.target.value)}
              >
                {[
                  "BUSINESS",
                  "CONTRACTOR",
                  "DELIVERY",
                  "INTERVIEW",
                  "PERSONAL",
                  "OTHER",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            {kind === "invitation" &&
              textInput(
                "arrival",
                "Arrival (Africa/Lagos)",
                true,
                "datetime-local",
              )}
            {textInput(
              "departure",
              "Departure (Africa/Lagos)",
              true,
              "datetime-local",
            )}
            {kind === "walk-in" && (
              <>
                {textInput("vehicle", "Vehicle registration")}
                {textInput("items", "Items carried")}
              </>
            )}
            <label className="sm:col-span-2">
              <span className="form-label">Notes</span>
              <textarea
                className="field min-h-20"
                value={form.notes}
                onChange={(e) => field("notes", e.target.value)}
              />
            </label>
            {!edit && (
              <label className="sm:col-span-2">
                <span className="form-label">
                  Link to a group lead (optional)
                </span>
                <select
                  className="field"
                  value={form.primaryVisitId}
                  onChange={(e) => {
                    const lead = state.visits.find(
                      (v) => v.id === e.target.value,
                    );
                    setForm((f) => ({
                      ...f,
                      primaryVisitId: e.target.value,
                      ...(lead
                        ? {
                            hostId: lead.hostId,
                            arrival: new Date(
                              new Date(lead.arrival).getTime() + 3600000,
                            )
                              .toISOString()
                              .slice(0, 16),
                            departure: new Date(
                              new Date(lead.departure).getTime() + 3600000,
                            )
                              .toISOString()
                              .slice(0, 16),
                          }
                        : {}),
                    }));
                  }}
                >
                  <option value="">Individual visit</option>
                  {state.visits
                    .filter(
                      (v) =>
                        v.source ===
                          (kind === "walk-in" ? "Walk-in" : "Invitation") &&
                        !v.primaryVisitId &&
                        [
                          "EXPECTED",
                          "PENDING",
                          "APPROVED",
                          "PRE_REGISTERED",
                        ].includes(v.status) &&
                        (role !== "STAFF" || v.hostId === userId),
                    )
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.code} ·{" "}
                        {fullName(
                          state.people.find((p) => p.id === v.visitorId),
                        )}
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-[10px] text-slate-400">
                  Each guest is a separate record with individual admission and
                  checkout.
                </p>
              </label>
            )}
            {kind === "invitation" && !edit && (
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.draft}
                  onChange={(e) => field("draft", e.target.checked)}
                  className="accent-blue-600"
                />
                Save as draft
              </label>
            )}
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 p-3 text-xs text-rose-600"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t pt-4">
            <button type="button" className="btn-light" onClick={onClose}>
              Cancel
            </button>
            <button className="btn" type="submit">
              {edit
                ? "Save changes"
                : kind === "walk-in"
                  ? "Register & request approval"
                  : form.draft
                    ? "Save draft"
                    : "Create invitation"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function VisitDetails({
  visit: v,
  state,
  role,
  userId,
  onClose,
  update,
  onEdit,
}: {
  visit: Visit;
  state: Workspace;
  role: Role;
  userId: string;
  onClose: () => void;
  update: Update;
  onEdit: (v: Visit) => void;
}) {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [share, setShare] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVersion, setEditVersion] = useState(v.version);
  const [notes, setNotes] = useState(v.notes || "");
  const [vehicle, setVehicle] = useState(v.vehicle || "");
  const [items, setItems] = useState(v.items || "");
  const p = state.people.find((p) => p.id === v.visitorId);
  const host = state.users.find((u) => u.id === v.hostId);
  const desk = role !== "STAFF";
  const own = v.hostId === userId;
  const mayInvite = role === "ADMIN" || (role === "STAFF" && own);
  const open = ["EXPECTED", "PENDING", "APPROVED", "PRE_REGISTERED"].includes(
    v.status,
  );
  const reasons = blockers(v, state);
  const act = async (action: string) => {
    if (["Reject", "Cancel visit"].includes(action) && !reason.trim()) {
      toast.error("A reason is required");
      return;
    }
    if (action === "Check in" && blockers(v, state).length) {
      toast.error("Admission is currently blocked");
      return;
    }
    const commandNames: Record<string, string> = {
      "Record arrival": "arrive",
      "Check in": "check-in",
      "Check out": "check-out",
      Approve: "approve",
      Reject: "reject",
      "Cancel visit": "cancel",
      "Activate draft": "activate",
    };
    const name = commandNames[action];
    const path = ["approve", "reject"].includes(name)
      ? `/visitor-requests/${v.visitorRequestId}/${name}`
      : name === "activate"
        ? `/invitations/${v.invitationId}/activate`
        : `/visits/${v.id}/${name}`;
    if (
      !(await update({
        path,
        body: {
          version: v.version,
          ...(["reject", "cancel"].includes(name) ? { reason } : {}),
        },
      }))
    )
      return;
    toast.success(`${action} saved`);
    setConfirm("");
    setReason("");
  };
  const actionLabels: Record<string, string> = {
    arrive: "Record arrival",
    "check-in": "Check in",
    "check-out": "Check out",
    approve: "Approve",
    reject: "Reject",
    activate: "Activate draft",
    cancel: "Cancel visit",
  };
  const actions = (v.allowedActions || [])
    .map((a) => actionLabels[a])
    .filter(Boolean);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto rounded-2xl p-0">
        <div className="p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              Visit details
            </DialogTitle>
            <DialogDescription className="text-xs">
              {v.code} · Visitor record
            </DialogDescription>
          </DialogHeader>
          <div className="my-5 flex items-center gap-3 rounded-xl bg-slate-50 p-4">
            <Avatar person={p} />
            <div className="flex-1">
              <h2 className="text-base font-bold">{fullName(p)}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {p?.company || "Independent visitor"}
              </p>
            </div>
            <StatusBadge status={v.status} />
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-5 text-xs">
            {[
              ["Host", fullName(host)],
              ["Department", host?.department || "Unavailable"],
              ["Purpose", v.purpose],
              ["Type / source", `${v.type.toLowerCase()} · ${v.source}`],
              ["Scheduled arrival", `${day(v.arrival)}, ${time(v.arrival)}`],
              [
                "Expected departure",
                `${day(v.departure)}, ${time(v.departure)}`,
              ],
              ["Reception arrival", time(v.arrivedAt)],
              [
                "Check-in / check-out",
                `${time(v.checkIn)} / ${time(v.checkOut)}`,
              ],
              ["Email", p?.email || "—"],
              ["Phone", p?.phone || "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="mb-1.5 text-[10px] text-slate-400">{label}</p>
                <p className="font-medium leading-5">{value}</p>
              </div>
            ))}
          </div>
          {v.primaryVisitId && (
            <p className="mt-4 text-xs text-blue-600">
              Group guest · Lead:{" "}
              {state.visits.find((x) => x.id === v.primaryVisitId)?.code ||
                "Unavailable"}
            </p>
          )}
          {state.visits.some((x) => x.primaryVisitId === v.id) && (
            <div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
              Group lead ·{" "}
              {state.visits.filter((x) => x.primaryVisitId === v.id).length}{" "}
              linked additional guest(s). Each guest must be admitted
              separately.
            </div>
          )}
          {desk && (
            <div className="mt-5 grid grid-cols-2 gap-4 border-t pt-4 text-xs">
              <div>
                <p className="mb-1 text-[10px] text-slate-400">Vehicle</p>
                {v.vehicle || "Not provided"}
              </div>
              <div>
                <p className="mb-1 text-[10px] text-slate-400">Items carried</p>
                {v.items || "Not provided"}
              </div>
            </div>
          )}
          {v.notes && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5">
              <span className="mb-1 block text-[10px] text-slate-400">
                Visit notes
              </span>
              {v.notes}
            </div>
          )}
          {v.reason && (
            <p className="mt-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
              Decision reason: {v.reason}
            </p>
          )}
          {desk &&
            ["EXPECTED", "APPROVED"].includes(v.status) &&
            reasons.length > 0 && (
              <div className="mt-5 rounded-lg border border-amber-100 bg-amber-50 p-3">
                <p className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                  <ShieldAlert size={15} />
                  Admission not available
                </p>
                <ul className="mt-2 list-inside list-disc text-[11px] leading-5 text-amber-700">
                  {reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          {editing && (
            <div className="mt-4 space-y-3 rounded-lg border p-4">
              <label>
                <span className="form-label">Visit notes</span>
                <textarea
                  className="field"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              {desk && (
                <>
                  <label>
                    <span className="form-label">Vehicle</span>
                    <input
                      className="field"
                      value={vehicle}
                      onChange={(e) => setVehicle(e.target.value)}
                    />
                  </label>
                  <label>
                    <span className="form-label">Items carried</span>
                    <input
                      className="field"
                      value={items}
                      onChange={(e) => setItems(e.target.value)}
                    />
                  </label>
                </>
              )}
              <button
                className="btn"
                onClick={async () => {
                  if (
                    await update({
                      path: `/visits/${v.id}`,
                      method: "PATCH",
                      body: {
                        version: editVersion,
                        notes,
                        ...(desk
                          ? {
                              vehicleRegistrationNumber: vehicle,
                              itemsCarried: items
                                .split(",")
                                .map((x) => x.trim())
                                .filter(Boolean),
                            }
                          : {}),
                      },
                    })
                  ) {
                    setEditing(false);
                    toast.success("Visit details saved");
                  }
                }}
              >
                Save details
              </button>
            </div>
          )}
          {share && (
            <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-600">
                Manual invitation sharing
              </p>
              <p className="my-3 font-mono text-2xl font-bold tracking-wider text-blue-900">
                {v.code}
              </p>
              <p className="mb-3 text-xs leading-5 text-slate-500">
                Share this invitation code with your guest. It identifies the
                invitation, but never grants admission.
              </p>
              <div className="flex justify-center gap-2">
                <button
                  className="btn-light"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${v.code}\n${fullName(p)}\n${day(v.arrival)}, ${time(v.arrival)} WAT\nHost: ${fullName(host)}`,
                      );
                      toast.success("Invitation details copied");
                    } catch {
                      toast.error(
                        "Clipboard unavailable. Select and copy the code above.",
                      );
                    }
                  }}
                >
                  <Copy size={13} />
                  Copy details
                </button>
                <button className="btn-light" onClick={() => window.print()}>
                  Print
                </button>
              </div>
            </div>
          )}
          {confirm && (
            <div className="mt-5 rounded-xl border border-rose-100 bg-rose-50 p-4">
              <label className="form-label">
                Reason for {confirm.toLowerCase()} *
              </label>
              <textarea
                className="field"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Provide a reason…"
              />
              <div className="mt-3 flex gap-2">
                <button
                  className="btn bg-rose-600 hover:bg-rose-700"
                  onClick={() => act(confirm)}
                >
                  Confirm {confirm.toLowerCase()}
                </button>
                <button className="btn-light" onClick={() => setConfirm("")}>
                  Keep visit
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="no-print flex flex-wrap gap-2 border-t bg-slate-50/70 p-5">
          {actions.map((a) => (
            <button
              key={a}
              disabled={a === "Check in" && reasons.length > 0}
              onClick={() =>
                ["Reject", "Cancel visit"].includes(a) ? setConfirm(a) : act(a)
              }
              className={
                ["Reject", "Cancel visit", "Record arrival"].includes(a)
                  ? "btn-light"
                  : "btn"
              }
            >
              {a}
            </button>
          ))}
          {v.canEditInvitation &&
            !v.primaryVisitId &&
            !state.visits.some((guest) => guest.primaryVisitId === v.id) && (
              <button className="btn-light" onClick={() => onEdit(v)}>
                Edit invitation
              </button>
            )}
          {v.canEditVisit && (
            <button
              className="btn-light"
              onClick={() => {
                setEditVersion(v.version);
                setNotes(v.notes || "");
                setVehicle(v.vehicle || "");
                setItems(v.items || "");
                setEditing(!editing);
              }}
            >
              Edit visit details
            </button>
          )}
          {mayInvite &&
            v.source === "Invitation" &&
            v.status !== "PRE_REGISTERED" && (
              <button
                className="btn-light"
                onClick={async () => {
                  try {
                    await request(`/invitations/${v.invitationId}/share`);
                    setShare(!share);
                  } catch (e) {
                    toast.error(
                      e instanceof Error
                        ? e.message
                        : "Unable to share invitation",
                    );
                  }
                }}
              >
                Share invitation
              </button>
            )}
          {mayInvite &&
            v.invitationId &&
            ["EXPECTED", "PRE_REGISTERED"].includes(v.status) && (
              <button
                className="btn-light"
                onClick={async () => {
                  if (
                    await update({
                      path: `/invitations/${v.invitationId}/resend`,
                      body: { version: v.version },
                    })
                  )
                    toast.success(
                      "Invitation ready to share manually. No email was sent.",
                    );
                }}
              >
                Refresh sharing details
              </button>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
