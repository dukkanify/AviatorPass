/**
 * Role-based sidebar navigation for dashboards.
 * Keep sidebars lean: one entry per job; deep/duplicate routes stay reachable via redirect or in-page links.
 */

import type { Role } from "@/constants/roles";

export type DashboardIcon =
  | "dashboard"
  | "users"
  | "admins"
  | "instructors"
  | "students"
  | "courses"
  | "classes"
  | "lessons"
  | "communities"
  | "blog"
  | "payments"
  | "wallets"
  | "reports"
  | "settings"
  | "logs"
  | "notifications"
  | "profile"
  | "calendar"
  | "bookings"
  | "assignments"
  | "quizzes"
  | "certificates"
  | "wallet"
  | "activity"
  | "monitoring"
  | "favorites"
  | "notes"
  | "resources"
  | "planner"
  | "history"
  | "search"
  | "bookmark"
  | "messages"
  | "support"
  | "megaphone"
  | "analytics"
  | "ai"
  | "ops"
  | "api"
  | "assets"
  | "media"
  | "phase2";

export interface DashboardNavItem {
  label: string;
  href: string;
  icon: DashboardIcon;
}

export const SUPER_ADMIN_NAV: DashboardNavItem[] = [
  { label: "Dashboard", href: "/super-admin/dashboard", icon: "dashboard" },
  { label: "Users", href: "/super-admin/users", icon: "users" },
  { label: "Admins", href: "/super-admin/admins", icon: "admins" },
  { label: "Instructors", href: "/super-admin/instructors", icon: "instructors" },
  { label: "Students", href: "/super-admin/students", icon: "students" },
  { label: "Courses", href: "/super-admin/courses", icon: "courses" },
  { label: "ATPL subjects", href: "/super-admin/courses/atpl-subjects", icon: "courses" },
  { label: "Course publishing", href: "/super-admin/courses/publishing", icon: "courses" },
  { label: "Certificates", href: "/super-admin/certificates", icon: "certificates" },
  { label: "Classes", href: "/super-admin/classes", icon: "classes" },
  { label: "Schedule", href: "/admin/schedule", icon: "calendar" },
  { label: "Bookings", href: "/super-admin/bookings", icon: "bookings" },
  { label: "Mock exams", href: "/super-admin/mock-exams", icon: "quizzes" },
  { label: "Messages", href: "/super-admin/messages", icon: "messages" },
  { label: "Communities", href: "/super-admin/communities", icon: "communities" },
  { label: "Announcements", href: "/super-admin/announcements", icon: "megaphone" },
  { label: "Blog", href: "/super-admin/blog", icon: "blog" },
  { label: "Support", href: "/super-admin/support", icon: "support" },
  { label: "Moderation", href: "/super-admin/moderation", icon: "logs" },
  { label: "Payments", href: "/super-admin/payments", icon: "payments" },
  { label: "Instructor Wallets", href: "/super-admin/wallets", icon: "wallets" },
  { label: "Analytics", href: "/super-admin/analytics", icon: "analytics" },
  { label: "Email automation", href: "/super-admin/email", icon: "megaphone" },
  { label: "Platform Settings", href: "/super-admin/settings", icon: "settings" },
  { label: "Asset Manager", href: "/super-admin/assets", icon: "assets" },
  { label: "Ops Center", href: "/super-admin/ops-center", icon: "ops" },
  { label: "API Platform", href: "/super-admin/api-platform", icon: "api" },
  { label: "Activity Logs", href: "/super-admin/activity-logs", icon: "activity" },
  { label: "Notifications", href: "/super-admin/notifications", icon: "notifications" },
  { label: "Profile", href: "/super-admin/profile", icon: "profile" },
  { label: "Settings", href: "/super-admin/account", icon: "settings" },
];

export const ADMIN_NAV: DashboardNavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: "dashboard" },
  { label: "Students", href: "/admin/students", icon: "students" },
  { label: "Instructors", href: "/admin/instructors", icon: "instructors" },
  { label: "Courses", href: "/admin/courses", icon: "courses" },
  { label: "Certificates", href: "/admin/certificates", icon: "certificates" },
  { label: "Classes", href: "/admin/classes", icon: "classes" },
  { label: "Schedule", href: "/admin/schedule", icon: "calendar" },
  { label: "Bookings", href: "/admin/bookings", icon: "bookings" },
  { label: "Mock exams", href: "/admin/mock-exams", icon: "quizzes" },
  { label: "Email automation", href: "/admin/email", icon: "megaphone" },
  { label: "Messages", href: "/admin/messages", icon: "messages" },
  { label: "Communities", href: "/admin/communities", icon: "communities" },
  { label: "Announcements", href: "/admin/announcements", icon: "megaphone" },
  { label: "Blog", href: "/admin/blog", icon: "blog" },
  { label: "Support", href: "/admin/support", icon: "support" },
  { label: "Moderation", href: "/admin/moderation", icon: "logs" },
  { label: "Payments", href: "/admin/payments", icon: "payments" },
  { label: "Wallets", href: "/admin/wallets", icon: "wallets" },
  { label: "Analytics", href: "/admin/analytics", icon: "analytics" },
  { label: "Notifications", href: "/admin/notifications", icon: "notifications" },
  { label: "Profile", href: "/admin/profile", icon: "profile" },
  { label: "Settings", href: "/admin/settings", icon: "settings" },
];

export const INSTRUCTOR_NAV: DashboardNavItem[] = [
  { label: "Dashboard", href: "/instructor/dashboard", icon: "dashboard" },
  { label: "Live Classes", href: "/instructor/classes", icon: "classes" },
  { label: "Schedule", href: "/instructor/schedule", icon: "classes" },
  { label: "Students", href: "/instructor/students", icon: "students" },
  { label: "Mock exams", href: "/instructor/mock-exams", icon: "quizzes" },
  { label: "Certificates", href: "/instructor/certificates", icon: "certificates" },
  { label: "Analytics", href: "/instructor/analytics", icon: "analytics" },
  { label: "Messages", href: "/instructor/messages", icon: "messages" },
  { label: "Notifications", href: "/instructor/notifications", icon: "notifications" },
  { label: "Profile", href: "/instructor/profile", icon: "profile" },
  { label: "Settings", href: "/instructor/settings", icon: "settings" },
];

export const CGI_NAV: DashboardNavItem[] = [
  { label: "Dashboard", href: "/cgi/dashboard", icon: "dashboard" },
  { label: "Assignment Engine", href: "/cgi/assignment", icon: "instructors" },
  { label: "Schedule", href: "/cgi/schedule", icon: "classes" },
  { label: "Analytics", href: "/cgi/analytics", icon: "analytics" },
  { label: "Messages", href: "/cgi/messages", icon: "messages" },
  { label: "Notifications", href: "/cgi/notifications", icon: "notifications" },
  { label: "Profile", href: "/cgi/profile", icon: "profile" },
  { label: "Settings", href: "/cgi/settings", icon: "settings" },
];

/**
 * Full student route catalog (lookup + deep links).
 * The package student sidebar uses STUDENT_LEARNING_NAV_GROUPS, not this list.
 */
export const STUDENT_NAV: DashboardNavItem[] = [
  { label: "Dashboard", href: "/student/dashboard", icon: "dashboard" },
  { label: "My Courses", href: "/student/courses", icon: "courses" },
  { label: "Resources", href: "/student/resources", icon: "resources" },
  { label: "Planner", href: "/student/planner", icon: "planner" },
  { label: "Calendar", href: "/student/calendar", icon: "calendar" },
  { label: "Schedule", href: "/student/schedule", icon: "classes" },
  { label: "Book a session", href: "/student/bookings", icon: "bookings" },
  { label: "Mock exams", href: "/student/mock-exams", icon: "quizzes" },
  {
    label: "Performance reports",
    href: "/student/performance-reports",
    icon: "reports",
  },
  { label: "AI Assistant", href: "/student/ai", icon: "ai" },
  { label: "Certificates", href: "/student/certificates", icon: "certificates" },
  { label: "Messages", href: "/student/messages", icon: "messages" },
  { label: "Community", href: "/student/community", icon: "communities" },
  { label: "Support", href: "/student/support", icon: "support" },
  { label: "Course checkout", href: "/student/checkout", icon: "payments" },
  { label: "Billing & invoices", href: "/student/billing", icon: "wallet" },
  { label: "Notifications", href: "/student/notifications", icon: "notifications" },
  { label: "Profile", href: "/student/profile", icon: "profile" },
  { label: "Settings", href: "/student/settings", icon: "settings" },
];

export const DASHBOARD_NAV: Record<Role, DashboardNavItem[]> = {
  super_admin: SUPER_ADMIN_NAV,
  admin: ADMIN_NAV,
  chief_ground_instructor: CGI_NAV,
  instructor: INSTRUCTOR_NAV,
  student: STUDENT_NAV,
};

/** Sidebar entries intentionally removed (routes kept via redirect or deep link). */
export const NAV_SLIM_REMOVED_HREFS = {
  super_admin: [
    "/super-admin/ai",
    "/super-admin/reports",
    "/super-admin/performance-reports",
    "/super-admin/automation",
    "/super-admin/media-library",
    "/super-admin/phase2",
    "/super-admin/monitoring",
    "/super-admin/system-logs",
  ],
  admin: ["/admin/ai", "/admin/reports", "/admin/performance-reports"],
  instructor: ["/instructor/reports", "/instructor/performance-reports"],
  cgi: [
    "/cgi/reports",
    "/cgi/atpl",
    "/cgi/subjects",
    "/cgi/lectures",
    "/cgi/instructors",
    "/cgi/students",
  ],
  student: [
    "/student/notes",
    "/student/favorites",
    "/student/history",
    "/student/search",
    "/student/progress",
    "/student/analytics",
    "/student/transcript",
    "/student/announcements",
    "/student/comm-search",
  ],
} as const;
