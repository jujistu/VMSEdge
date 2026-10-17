import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  DoorOpen,
  FileClock,
  Fingerprint,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  ShieldBan,
  ShieldCheck,
  Users,
  UserRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import { Workspace, Role, Visit, fullName, User } from "@/lib/models";
import { Avatar, Brand } from "@/components/gatewise-shared";
import Dashboard from "@/components/gatewise-dashboard";
import {
  Records,
  VisitorDirectory,
  pageNames,
} from "@/components/gatewise-records";
import {
  CreateVisit,
  VisitDetails,
  Update,
} from "@/components/gatewise-visit-dialogs";
import AdminPages from "@/components/gatewise-admin";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useWorkspace } from "@/hooks/use-workspace";
import SignIn from "./SignIn";

type NavItem = {
  id: string;
  label: string;
  icon: typeof Users;
  count?: string;
};
const adminNav: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "visits", label: "Visits", icon: DoorOpen },
  { id: "visitors", label: "Visitors", icon: Users },
  { id: "invitations", label: "Invitations", icon: Mail },
  {
    id: "requests",
    label: "Requests",
    icon: ClipboardCheck,
    count: "requests",
  },
  { id: "occupancy", label: "Occupancy", icon: Activity },
  { id: "reports", label: "Reports", icon: BarChart3 },
];
const management: NavItem[] = [
  { id: "users", label: "Users", icon: UserRound },
  { id: "departments", label: "Departments", icon: Building2 },
  { id: "blacklist", label: "Blacklist", icon: ShieldBan },
  { id: "audit", label: "Audit logs", icon: FileClock },
];
const receptionNav: NavItem[] = [
  { id: "overview", label: "Reception dashboard", icon: LayoutDashboard },
  { id: "create-walk-in", label: "Register walk-in", icon: UserRoundPlus },
  { id: "lookup", label: "Find invitation", icon: Search },
  { id: "visits", label: "Today's visits", icon: CalendarDays },
  { id: "expected", label: "Expected arrivals", icon: Clock3 },
  {
    id: "waiting",
    label: "Waiting visitors",
    icon: ClipboardCheck,
    count: "waiting",
  },
  { id: "occupancy", label: "Occupancy", icon: Activity },
  { id: "visitors", label: "Visitors", icon: Users },
  { id: "history", label: "History", icon: FileClock },
];
const staffNav: NavItem[] = [
  { id: "overview", label: "My dashboard", icon: LayoutDashboard },
  { id: "invitations", label: "My invitations", icon: Mail },
  { id: "create-invitation", label: "Create invitation", icon: Plus },
  {
    id: "requests",
    label: "Approval inbox",
    icon: ClipboardCheck,
    count: "requests",
  },
  { id: "visitors", label: "My visitors", icon: Users },
  { id: "history", label: "My history", icon: FileClock },
];

export default function Index() {
  const workspace = useWorkspace();
  if (workspace.loading)
    return (
      <div className="p-10" role="status">
        Loading your workspace…
      </div>
    );
  if (!workspace.authenticated)
    return (
      <>
        <SignIn onLogin={workspace.signedIn} />
        {workspace.error && (
          <p role="alert" className="fixed bottom-5 left-5 text-rose-700">
            {workspace.error}
          </p>
        )}
      </>
    );
  if (!workspace.snapshot)
    return (
      <div className="p-10">
        <p role="alert">{workspace.error || "Unable to load workspace"}</p>
        <button className="btn mt-4" onClick={() => void workspace.signedIn()}>
          Retry
        </button>
        <button
          className="btn-light ml-3"
          onClick={() => void workspace.signOut()}
        >
          Sign out
        </button>
      </div>
    );
  return (
    <>
      <WorkspaceView
        state={workspace.snapshot.state}
        user={workspace.snapshot.user}
        update={workspace.update}
        signOut={workspace.signOut}
        refresh={workspace.refresh}
      />
      {workspace.busy && (
        <div
          role="status"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20"
        >
          <span className="rounded-xl bg-white p-5 shadow">Saving…</span>
        </div>
      )}
      {workspace.error && (
        <div
          role="alert"
          className="fixed bottom-5 right-5 z-[100] rounded-xl bg-rose-50 p-4 text-sm text-rose-700"
        >
          {workspace.error}
          <button
            className="ml-3 underline"
            onClick={() => void workspace.refresh().catch(() => {})}
          >
            Retry
          </button>
        </div>
      )}
    </>
  );
}
function WorkspaceView({
  state,
  user,
  update,
  signOut,
  refresh,
}: {
  state: Workspace;
  user: User;
  update: Update;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const role = user.role;
  const userId = user.id;
  const [params, setParams] = useSearchParams();
  const page = params.get("page") || "overview";
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [create, setCreate] = useState<"walk-in" | "invitation">();
  const [edit, setEdit] = useState<Visit>();
  const [selected, setSelected] = useState<string>();
  const [help, setHelp] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const nav =
    role === "ADMIN"
      ? adminNav
      : role === "RECEPTIONIST"
        ? receptionNav
        : staffNav;
  const navigate = (p: string) => {
    setParams(p === "overview" ? {} : { page: p });
    setMobile(false);
    setSearchOpen(false);
    setGlobalSearch("");
  };
  const allowed = [
    ...nav.map((n) => n.id),
    ...(role === "ADMIN" ? management.map((n) => n.id) : []),
    "profile",
    "notifications",
    "settings",
    ...(role === "STAFF" ? ["visits"] : []),
  ];
  useEffect(() => {
    if (!allowed.includes(page)) setParams({});
  });
  const selectedVisit = state.visits.find(
    (v) => v.id === selected && (role !== "STAFF" || v.hostId === userId),
  );
  const unread = state.notifications.filter((n) => !n.read).length;
  const count = (type?: string) =>
    state.visits.filter(
      (v) =>
        (role !== "STAFF" || v.hostId === userId) &&
        (type === "requests"
          ? v.status === "PENDING"
          : v.arrivedAt &&
            ["PENDING", "APPROVED", "EXPECTED"].includes(v.status)),
    ).length;
  const renderNav = (items: NavItem[]) =>
    items.map((item) => (
      <button
        key={item.id}
        title={collapsed ? item.label : undefined}
        onClick={() =>
          item.id.startsWith("create-")
            ? setCreate(item.id === "create-walk-in" ? "walk-in" : "invitation")
            : navigate(item.id)
        }
        className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-[10px] text-left text-[12px] ${page === item.id ? "bg-[#2d63b4] font-semibold text-white shadow-sm" : "text-[#b4c4dd] hover:bg-white/5 hover:text-white"} ${collapsed ? "justify-center" : ""}`}
      >
        <item.icon size={17} strokeWidth={1.7} />
        {!collapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {item.count && count(item.count) > 0 && (
              <span
                className={`flex h-[18px] min-w-[19px] items-center justify-center rounded-md px-1 text-[9px] ${page === item.id ? "bg-white/20 text-white" : "bg-[#2d4164] text-[#d3e1f7]"}`}
              >
                {count(item.count)}
              </span>
            )}
          </>
        )}
        {page === item.id && (
          <span className="absolute -left-3 top-2.5 h-5 w-[3px] rounded-r bg-blue-300" />
        )}
      </button>
    ));
  const quickResults = globalSearch.trim()
    ? state.visits
        .filter(
          (v) =>
            (role !== "STAFF" || v.hostId === userId) &&
            `${v.code} ${fullName(state.people.find((p) => p.id === v.visitorId))} ${state.people.find((p) => p.id === v.visitorId)?.company}`
              .toLowerCase()
              .includes(globalSearch.toLowerCase()),
        )
        .slice(0, 6)
    : [];

  return (
    <div className="min-h-screen">
      {mobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-[var(--navy)] text-white transition-all duration-200 ${collapsed ? "w-[76px]" : "w-[226px]"} ${mobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div
          className={`flex h-[83px] shrink-0 items-center ${collapsed ? "justify-center" : "px-6"}`}
        >
          <Brand small={collapsed} />
          {mobile && (
            <button
              onClick={() => setMobile(false)}
              className="ml-auto lg:hidden"
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          )}
        </div>
        {!collapsed && (
          <div className="mx-4 mb-5 flex items-center gap-2.5 rounded-lg border border-[#385078] bg-[#1b355b] px-3 py-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 text-blue-200">
              <Building2 size={15} />
            </span>
            <div className="flex-1">
              <p className="text-[11px] font-semibold text-slate-100">
                {state.settings.organizationName}
              </p>
              <p className="mt-0.5 text-[9px] text-[#9ab0d1]">
                Visitor management
              </p>
            </div>
            <ChevronDown size={12} className="text-[#97afd0]" />
          </div>
        )}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {!collapsed && (
            <p className="mb-3 px-3 text-[9px] font-semibold uppercase tracking-[.15em] text-[#728caf]">
              Workspace
            </p>
          )}
          {renderNav(nav)}
          {role === "ADMIN" && (
            <>
              <div className="my-5 border-t border-[#2b4163]" />
              {!collapsed && (
                <p className="mb-3 px-3 text-[9px] font-semibold uppercase tracking-[.15em] text-[#728caf]">
                  Management
                </p>
              )}
              {renderNav(management)}
            </>
          )}
        </nav>
        <div className="space-y-1 px-3 pb-4">
          {renderNav([{ id: "settings", label: "Settings", icon: Settings }])}
          <button
            onClick={() => setHelp(true)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] text-[#b4c4dd] hover:bg-white/5 ${collapsed ? "justify-center" : ""}`}
          >
            <CircleHelp size={17} strokeWidth={1.7} />
            {!collapsed && "Help & getting started"}
          </button>
        </div>

        <button
          onClick={() => navigate("profile")}
          className={`flex items-center gap-2.5 border-t border-[#2a4164] p-4 text-left ${collapsed ? "justify-center" : ""}`}
        >
          <Avatar person={user} size="small" />
          {!collapsed && (
            <>
              <div className="flex-1">
                <p className="text-[11px] font-semibold">{fullName(user)}</p>
                <p className="mt-1 text-[9px] capitalize text-[#93aaca]">
                  {role === "ADMIN" ? "Administrator" : role.toLowerCase()}
                </p>
              </div>
              <ChevronDown size={12} className="text-[#9ab0d1]" />
            </>
          )}
        </button>
      </aside>
      <div
        className={`transition-all duration-200 ${collapsed ? "lg:ml-[76px]" : "lg:ml-[226px]"}`}
      >
        <header className="no-print sticky top-0 z-30 flex h-[70px] items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-5 backdrop-blur-md lg:px-7">
          <div className="flex items-center gap-4">
            <button
              aria-label="Toggle navigation"
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-50"
              onClick={() =>
                window.innerWidth < 1024
                  ? setMobile(!mobile)
                  : setCollapsed(!collapsed)
              }
            >
              <Menu size={19} className="lg:hidden" />
              <PanelLeftClose
                size={18}
                className={`hidden lg:block ${collapsed ? "rotate-180" : ""}`}
              />
            </button>
            <div className="hidden items-center gap-2 border-l pl-4 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-medium text-slate-500">
                A welcoming workplace starts here.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="relative hidden md:block">
              <div className="flex items-center gap-2">
                <Search size={15} className="text-slate-400" />
                <input
                  className="w-36 border-none bg-transparent text-[11px] outline-none focus:ring-0 xl:w-44"
                  placeholder="Search anything…"
                  aria-label="Search all visits"
                  value={globalSearch}
                  onFocus={() => setSearchOpen(true)}
                  onChange={(e) => {
                    setGlobalSearch(e.target.value);
                    setSearchOpen(true);
                  }}
                />
              </div>
              {searchOpen && globalSearch && (
                <div className="absolute right-0 top-9 w-80 overflow-hidden rounded-xl border bg-white shadow-xl">
                  <div className="flex justify-between border-b p-3 text-[10px] text-slate-400">
                    <span>Matching visits</span>
                    <button
                      onClick={() => setSearchOpen(false)}
                      aria-label="Close search"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {quickResults.length ? (
                    quickResults.map((v) => (
                      <button
                        key={v.id}
                        className="flex w-full gap-3 p-3 text-left hover:bg-blue-50"
                        onClick={() => {
                          setSelected(v.id);
                          setSearchOpen(false);
                          setGlobalSearch("");
                        }}
                      >
                        <Avatar
                          person={state.people.find(
                            (p) => p.id === v.visitorId,
                          )}
                          size="small"
                        />
                        <span>
                          <span className="block text-xs font-semibold">
                            {fullName(
                              state.people.find((p) => p.id === v.visitorId),
                            )}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {v.code} · {v.purpose}
                          </span>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="p-5 text-xs text-slate-400">
                      No matching visits.
                    </p>
                  )}
                </div>
              )}
            </div>
            <span className="text-xs capitalize text-blue-600">
              {role.toLowerCase()}
            </span>
            <button
              onClick={() => navigate("notifications")}
              className="relative text-slate-500 hover:text-blue-600"
              aria-label={`${unread} unread notifications`}
            >
              <Bell size={18} strokeWidth={1.7} />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full border border-white bg-orange-400" />
              )}
            </button>
            <div className="h-6 border-l" />
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Account menu">
                <Avatar person={user} size="small" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-xl">
                <DropdownMenuLabel className="text-xs">
                  {fullName(user)}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className="text-xs"
                  onSelect={() => navigate("profile")}
                >
                  <UserRound size={14} className="mr-2" />
                  My profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs"
                  onSelect={() => setHelp(true)}
                >
                  <CircleHelp size={14} className="mr-2" />
                  Help
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-xs text-rose-600"
                  onSelect={() => void signOut()}
                >
                  <LogOut size={14} className="mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] p-5 lg:p-7 xl:px-8">
          {allowed.includes(page) &&
            (page === "overview" ? (
              <Dashboard
                state={state}
                role={role}
                userId={userId}
                refresh={refresh}
                onNavigate={navigate}
                onCreate={setCreate}
                onSelect={(v) => setSelected(v.id)}
              />
            ) : page === "visitors" ? (
              <VisitorDirectory
                key={`${role}-${page}`}
                state={state}
                role={role}
                userId={userId}
                update={update}
                onSelect={(v) => setSelected(v.id)}
              />
            ) : [
                "visits",
                "invitations",
                "requests",
                "occupancy",
                "history",
                "expected",
                "waiting",
                "lookup",
              ].includes(page) ? (
              <Records
                key={`${role}-${page}`}
                page={page}
                state={state}
                role={role}
                userId={userId}
                refresh={refresh}
                onCreate={setCreate}
                onSelect={(v) => setSelected(v.id)}
              />
            ) : (
              <AdminPages
                key={`${role}-${page}`}
                page={page}
                state={state}
                role={role}
                userId={userId}
                update={update}
              />
            ))}
        </main>
      </div>
      {(create || edit) && (
        <CreateVisit
          kind={create || "invitation"}
          state={state}
          role={role}
          userId={userId}
          update={update}
          edit={edit}
          onClose={() => {
            setCreate(undefined);
            setEdit(undefined);
          }}
        />
      )}
      {selectedVisit && (
        <VisitDetails
          key={selectedVisit.id}
          visit={selectedVisit}
          state={state}
          role={role}
          userId={userId}
          update={update}
          onClose={() => setSelected(undefined)}
          onEdit={(v) => {
            setSelected(undefined);
            setEdit(v);
          }}
        />
      )}
      {help && (
        <Dialog open onOpenChange={() => setHelp(false)}>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>Welcome to Gatewise</DialogTitle>
              <DialogDescription>
                A more thoughtful way to welcome people.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-xs leading-6 text-slate-500">
              <p>
                Receptionists register walk-ins, record arrivals, and check
                visitors in and out. Staff manage their invitations and approve
                their own visitors. Administrators manage users, departments,
                restrictions, settings, and reports.
              </p>
              <p>
                Account access is assigned by an administrator. Visitor
                admission is checked by the server.
              </p>
            </div>
            <button className="btn" onClick={() => setHelp(false)}>
              Let’s get started <ArrowRight size={15} />
            </button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
