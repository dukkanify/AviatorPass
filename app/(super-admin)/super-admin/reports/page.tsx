import { redirect } from "next/navigation";

/** Legacy path — Analytics now includes certificate reports. */
export default function SuperAdminReportsPage() {
  redirect("/super-admin/analytics");
}
