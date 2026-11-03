import { redirect } from "next/navigation";

export default function SuperAdminIndexRedirect() {
  redirect("/super-admin/dashboard");
}
