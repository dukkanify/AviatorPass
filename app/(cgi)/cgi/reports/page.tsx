import { redirect } from "next/navigation";

/** Legacy path — Analytics now includes certificate reports. */
export default function CgiReportsPage() {
  redirect("/cgi/analytics");
}
