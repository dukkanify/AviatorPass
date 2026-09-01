import { redirect } from "next/navigation";

import { routes } from "@/constants/routes";

/** Public Private Session marketing is retired — Online Courses is the public catalogue. */
export default function PublicBookPage() {
  redirect(routes.onlineCourses);
}
