import { redirect } from "next/navigation";

import { routes } from "@/constants/routes";

/** Programme index now lives at /atpl. Individual modules remain at /courses/[code]. */
export default function CoursesIndexRedirect() {
  redirect(routes.atpl);
}
