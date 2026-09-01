import { PERMISSIONS } from "@/constants/permissions";
import type { Permission } from "@/constants/permissions";
import type { Role } from "@/constants/roles";
import { routes } from "@/constants/routes";

export type MarketingNavChild = {
  label: string;
  href: string;
  hint?: string;
};

export type MarketingNavItem = {
  label: string;
  href: string;
  children?: readonly MarketingNavChild[];
};

export const NAV_ITEMS: readonly MarketingNavItem[] = [
  {
    label: "Online Courses",
    href: routes.onlineCourses,
    children: [
      { label: "ATPL Course", href: routes.atpl, hint: "Live · 13 theory subjects" },
      {
        label: "Basics of Aviation",
        href: `${routes.onlineCoursesBasics}?mode=recorded`,
        hint: "Recorded",
      },
      {
        label: "Basics of Aviation",
        href: `${routes.onlineCoursesBasics}?mode=live`,
        hint: "Live One-to-One",
      },
      { label: "ELP Mock Exams Live", href: routes.onlineCoursesElp },
      {
        label: "Private Pilot License",
        href: `${routes.onlineCoursesPpl}?mode=recorded`,
        hint: "Recorded",
      },
      {
        label: "Private Pilot License",
        href: `${routes.onlineCoursesPpl}?mode=live`,
        hint: "Live One-to-One",
      },
    ],
  },
  { label: "About", href: "/#about" },
  { label: "Instructors", href: "/#instructors" },
  { label: "Contact", href: "/#contact" },
];

export const DASHBOARD_NAV_BY_ROLE: Record<
  Role,
  { label: string; href: string; permission?: Permission }[]
> = {
  student: [
    { label: "Dashboard", href: "/student/dashboard", permission: PERMISSIONS.DASHBOARD_STUDENT },
    { label: "Profile", href: "/student/profile", permission: PERMISSIONS.PROFILE_OWN },
  ],
  instructor: [
    {
      label: "Dashboard",
      href: "/instructor/dashboard",
      permission: PERMISSIONS.DASHBOARD_INSTRUCTOR,
    },
    { label: "Profile", href: "/instructor/profile", permission: PERMISSIONS.PROFILE_OWN },
  ],
  chief_ground_instructor: [
    { label: "Dashboard", href: "/cgi/dashboard", permission: PERMISSIONS.DASHBOARD_CGI },
    { label: "ATPL Journey", href: "/cgi/atpl", permission: PERMISSIONS.ATPL_FIRST_SUBJECT },
    { label: "Profile", href: "/cgi/profile", permission: PERMISSIONS.PROFILE_OWN },
  ],
  admin: [
    { label: "Dashboard", href: "/admin/dashboard", permission: PERMISSIONS.DASHBOARD_ADMIN },
    { label: "Users", href: "/admin/users", permission: PERMISSIONS.STUDENTS_MANAGE },
  ],
  super_admin: [
    {
      label: "Dashboard",
      href: "/super-admin/dashboard",
      permission: PERMISSIONS.DASHBOARD_SUPER_ADMIN,
    },
    {
      label: "Activity Logs",
      href: "/super-admin/activity-logs",
      permission: PERMISSIONS.AUDIT_READ,
    },
    { label: "Settings", href: "/super-admin/settings", permission: PERMISSIONS.SYSTEM_SETTINGS },
    { label: "Assets", href: "/super-admin/assets", permission: PERMISSIONS.SYSTEM_SETTINGS },
    { label: "Media", href: "/super-admin/media-library", permission: PERMISSIONS.SYSTEM_SETTINGS },
  ],
};

export const APP_METADATA = {
  title: {
    default: "Aviator Pass | Complete Aviation Education Platform",
    template: "%s | Aviator Pass",
  },
  description:
    "Aviator Pass — a complete aviation education platform with EASA Certified Instructors. Online courses covering Basics of Aviation, Private Pilot License, ATPL theory, and ELP mock exams across Dubai, Copenhagen, Kuwait, and Qatar.",
} as const;
