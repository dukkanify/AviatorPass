import { redirect } from "next/navigation";

/** Legacy path — Analytics now includes certificate reports. */
export default function AdminReportsPage() {
  redirect("/admin/analytics");
}
