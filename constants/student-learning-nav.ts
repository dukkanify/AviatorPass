import { STUDENT_NAV, type DashboardNavItem } from "@/constants/dashboard-nav";

export type StudentNavGroupId = "learning" | "progress" | "communication" | "account" | "more";

export type StudentNavGroup = {
  id: StudentNavGroupId;
  label: string;
  items: DashboardNavItem[];
};

const LEARNING_HREFS = [
  "/student/dashboard",
  "/student/courses",
  "/student/calendar",
  "/student/planner",
  "/student/mock-exams",
  "/student/resources",
] as const;

const PROGRESS_HREFS = ["/student/progress", "/student/certificates"] as const;

const COMMUNICATION_HREFS = ["/student/messages", "/student/support"] as const;

const ACCOUNT_HREFS = ["/student/profile"] as const;

const PRIORITY_HREFS = new Set<string>([
  ...LEARNING_HREFS,
  ...PROGRESS_HREFS,
  ...COMMUNICATION_HREFS,
  ...ACCOUNT_HREFS,
]);

const LABEL_OVERRIDES: Record<string, string> = {
  "/student/dashboard": "Dashboard",
  "/student/courses": "My Courses",
  "/student/calendar": "Live Sessions",
  "/student/planner": "Study Planner",
  "/student/mock-exams": "Mock Exams",
  "/student/resources": "Resources",
  "/student/progress": "Progress",
  "/student/certificates": "Certificates",
  "/student/messages": "Messages",
  "/student/support": "Support",
  "/student/profile": "Profile",
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

function remainingItems(): DashboardNavItem[] {
  return STUDENT_NAV.filter((item) => !PRIORITY_HREFS.has(item.href)).map((item) => ({
    ...item,
    label: LABEL_OVERRIDES[item.href] ?? item.label,
  }));
}

export const STUDENT_LEARNING_NAV_GROUPS: StudentNavGroup[] = [
  {
    id: "learning",
    label: "Learning",
    items: LEARNING_HREFS.map(itemByHref),
  },
  {
    id: "progress",
    label: "Progress",
    items: PROGRESS_HREFS.map(itemByHref),
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
  {
    id: "more",
    label: "More",
    items: remainingItems(),
  },
];

export const STUDENT_LEARNING_NAV_ITEMS: DashboardNavItem[] = STUDENT_LEARNING_NAV_GROUPS.flatMap(
  (group) => group.items,
);

export function studentNavCoversAllRoutes(): boolean {
  const grouped = new Set(STUDENT_LEARNING_NAV_ITEMS.map((item) => item.href));
  return STUDENT_NAV.every((item) => grouped.has(item.href));
}
