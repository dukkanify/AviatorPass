import { redirect } from "next/navigation";

export default function StudentPaymentsRedirect() {
  redirect("/student/billing");
}
