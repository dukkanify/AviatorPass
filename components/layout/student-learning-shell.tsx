"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Award,
  Bell,
  BookOpen,
  Bookmark,
  CalendarClock,
  CalendarDays,
  CreditCard,
  FileText,
  FolderOpen,
  Globe,
  HelpCircle,
  History,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Headset,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sparkles,
  Star,
  StickyNote,
  Target,
  UsersRound,
  UserRound,
  Wallet,
  BarChart3,
  LineChart,
  Layers,
  X,
} from "lucide-react";

import Link from "@/components/ui/app-link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { CommandPalette } from "@/components/navigation/command-palette";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STUDENT_LEARNING_NAV_GROUPS } from "@/constants/student-learning-nav";
import { ROLE_DASHBOARD, ROLES } from "@/constants/roles";
import { routes } from "@/constants/routes";
import type { DashboardIcon } from "@/constants/dashboard-nav";
import { siteStatic } from "@/config/site-static";
import { useAuth } from "@/providers/auth-provider";

import "@/styles/student-learning.css";

import { FloatingAiAssistant } from "@/features/ai";

const iconMap: Record<DashboardIcon, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  users: UserRound,
  admins: UserRound,
  instructors: UserRound,
  students: UserRound,
  courses: BookOpen,
  classes: Layers,
  lessons: FileText,
  communities: UsersRound,
  blog: MessageSquare,
  payments: CreditCard,
  wallets: Wallet,
  reports: BarChart3,
  analytics: LineChart,
  ai: Sparkles,
  settings: UserRound,
  logs: Activity,
  notifications: Bell,
  profile: UserRound,
  calendar: CalendarDays,
  bookings: CalendarClock,
  assignments: FileText,
  quizzes: HelpCircle,
  certificates: Award,
  wallet: Wallet,
  activity: Activity,
  monitoring: Activity,
  favorites: Star,
  notes: StickyNote,
  resources: FolderOpen,
  planner: Target,
  history: History,
  search: Search,
  bookmark: Bookmark,
  messages: MessageSquare,
  support: Headset,
  megaphone: Megaphone,
  ops: Activity,
  api: Activity,
  assets: FolderOpen,
  media: FolderOpen,
  phase2: Sparkles,
};

function initialsFor(name?: string | null, email?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return (email?.[0] ?? "S").toUpperCase();
}

function StudentLearningShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, signOut } = useAuth();
  const [navOpen, setNavOpen] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    if (isLoading || !user) return;
    if (user.role === ROLES.STUDENT) return;
    router.replace(user.profileComplete ? ROLE_DASHBOARD[user.role] : routes.completeProfile);
  }, [isLoading, user, router]);

  React.useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    const stored = window.localStorage.getItem("sl-sidebar-collapsed");
    if (stored === "1") setCollapsed(true);
  }, []);

  React.useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  const displayName = user?.fullName || user?.firstName || user?.email || "Student";
  const initials = initialsFor(user?.fullName ?? user?.firstName, user?.email);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("sl-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <div
      className="sl-shell"
      data-nav-open={navOpen ? "true" : "false"}
      data-collapsed={collapsed ? "true" : "false"}
    >
      <a href="#student-main" className="sl-skip">
        Skip to main content
      </a>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />

      {navOpen ? (
        <button
          type="button"
          className="sl-overlay"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <aside className="sl-sidebar" id="student-sidebar" aria-label="Student learning navigation">
        <Link href="/student/dashboard" className="sl-brand">
          <BrandLogo variant="dark" href={null} priority className="max-w-[168px]" />
        </Link>

        <nav className="sl-nav" aria-label="Learning workspace">
          {STUDENT_LEARNING_NAV_GROUPS.map((group) =>
            group.items.length === 0 ? null : (
              <div key={group.id} className="sl-nav-group">
                <p className="sl-nav-label">{group.label}</p>
                {group.items.map((item) => {
                  const Icon = iconMap[item.icon] ?? LayoutDashboard;
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="sl-nav-link"
                      data-active={active ? "true" : "false"}
                      aria-current={active ? "page" : undefined}
                      title={item.label}
                    >
                      <span className="sl-nav-icon" aria-hidden>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ),
          )}
        </nav>

        <button
          type="button"
          className="sl-collapse-btn"
          onClick={toggleCollapsed}
          aria-pressed={collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>

        <div className="sl-promo" aria-hidden>
          <h2>Next Stop Your Goals</h2>
          <p>Discipline today, Pilot tomorrow.</p>
        </div>
      </aside>

      <div className="sl-main">
        <header className="sl-topbar">
          <button
            type="button"
            className="sl-menu-btn"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            aria-controls="student-sidebar"
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <button
            type="button"
            className="sl-search-btn"
            onClick={() => setCommandOpen(true)}
            aria-label="Search courses, lessons, or resources"
          >
            <Search className="h-4 w-4" aria-hidden />
            <span>Search for courses, lessons, or resources...</span>
            <kbd>⌘K</kbd>
          </button>

          <div className="sl-top-actions">
            <span className="sl-lang" title={`Platform language: ${siteStatic.language}`}>
              <Globe className="h-3.5 w-3.5" aria-hidden />
              EN
            </span>
            <ThemeToggle />
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="sl-profile-btn" aria-label="Open profile menu">
                  <span className="sl-avatar">
                    {user?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- student photo
                      <img src={user.avatarUrl} alt="" />
                    ) : (
                      initials
                    )}
                    <span className="sl-online" aria-hidden />
                  </span>
                  <span className="sl-profile-copy">
                    <strong>{displayName}</strong>
                    <span>Student</span>
                    <span className="sl-member">AviatorPass</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <div className="flex items-center gap-3">
                    <span className="sl-avatar-lg">
                      {user?.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- student photo
                        <img src={user.avatarUrl} alt="" />
                      ) : (
                        initials
                      )}
                      <span className="sl-online" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-semibold">{displayName}</span>
                      <span className="block text-xs text-muted-foreground">Student · Online</span>
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/student/profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/student/certificates">Certificates</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/student/notifications">Notifications</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={async () => {
                    await signOut();
                    router.replace(routes.login);
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="student-main" className="sl-content">
          {children}
        </main>

        <footer className="sl-footer">
          <p>Dream · Learn · Train · Fly</p>
          <p>Excellence in Aviation Education</p>
        </footer>
      </div>

      <FloatingAiAssistant />
    </div>
  );
}

export { StudentLearningShell };
