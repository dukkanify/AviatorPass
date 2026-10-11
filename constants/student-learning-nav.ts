import { STUDENT_NAV, type DashboardNavItem } from "@/constants/dashboard-nav";

export type StudentNavGroupId =
  "main" | "learning" | "progress" | "communication" | "account" | "more";

export type StudentNavGroup = {
  id: StudentNavGroupId;
  label: string;
  items: DashboardNavItem[];
};

const MAIN_HREFS = ["/student/dashboard"] as const;

const LEARNING_HREFS = ["/student/courses", "/student/schedule"] as const;

const PROGRESS_HREFS = ["/student/performance-reports", "/student/certificates"] as const;

const COMMUNICATION_HREFS = [
  "/student/messages",
  "/student/notifications",
  "/student/support",
] as const;

const ACCOUNT_HREFS = ["/student/billing", "/student/profile", "/student/settings"] as const;

const PRIORITY_HREFS = new Set<string>([
  ...MAIN_HREFS,
  ...LEARNING_HREFS,
  ...PROGRESS_HREFS,
  ...COMMUNICATION_HREFS,
  ...ACCOUNT_HREFS,
]);

const LABEL_OVERRIDES: Record<string, string> = {
  "/student/dashboard": "Dashboard",
  "/student/courses": "My Courses",
  "/student/schedule": "Schedule",
  "/student/performance-reports": "Performance reports",
  "/student/certificates": "Certificates",
  "/student/messages": "Messages",
  "/student/notifications": "Notifications",
  "/student/support": "Support",
  "/student/billing": "Billing",
  "/student/profile": "Profile",
  "/student/settings": "Settings",
};

function itemByHref(href: string): DashboardNavItem {
  const found = STUDENT_NAV.find((item) => item.href === href);
  if (!found) {
    throw new Error(`Student nav is missing required href: ${href}`);
  }
  return {
    ...found,
    label: LABEL_OVERRIDES[href] ?? found.label,
  };
}

export const STUDENT_LEARNING_NAV_GROUPS: StudentNavGroup[] = [
  {
    id: "main",
    label: "",
    items: MAIN_HREFS.map(itemByHref),
  },
  {
    id: "learning",
    label: "Learning",
    items: LEARNING_HREFS.map(itemByHref),
  },
  {
    id: "progress",
    label: "Progress",
    items: [...PROGRESS_HREFS.map(itemByHref)],
  },
  {
    id: "communication",
    label: "Communication",
    items: COMMUNICATION_HREFS.map(itemByHref),
  },
  {
    id: "account",
    label: "Account",
    items: ACCOUNT_HREFS.map(itemByHref),
  },
];

export const STUDENT_LEARNING_NAV_ITEMS: DashboardNavItem[] = STUDENT_LEARNING_NAV_GROUPS.flatMap(
  (group) => group.items,
);

const HIDDEN_FROM_PACKAGE_STUDENT = [
  "/student/bookings",
  "/student/checkout",
  "/student/mock-exams",
  "/student/ai",
  "/student/community",
  "/student/calendar",
  "/student/planner",
  "/student/resources",
] as const;

/** The package student menu is the approved ATPL journey, not every student route. */
export function studentNavCoversAllRoutes(): boolean {
  const grouped = STUDENT_LEARNING_NAV_ITEMS.map((item) => item.href);
  const approved = [...PRIORITY_HREFS];
  return (
    grouped.length === approved.length &&
    approved.every((href) => grouped.includes(href)) &&
    HIDDEN_FROM_PACKAGE_STUDENT.every((href) => !grouped.includes(href))
  );
}
