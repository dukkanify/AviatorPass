import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SuperAdminDashboardView } from "@/features/dashboard/super-admin-dashboard-view";
import { routes } from "@/constants/routes";
import { ROLES } from "@/constants/roles";
import { getCurrentSession } from "@/services/auth/auth-service";

export const metadata: Metadata = { title: "Super Admin Dashboard" };

export default async function SuperAdminDashboardPage() {
  const { user } = await getCurrentSession();
  if (!user) redirect(routes.login);
  if (user.role !== ROLES.SUPER_ADMIN) redirect(routes.accessDenied);

  return <SuperAdminDashboardView />;
}
