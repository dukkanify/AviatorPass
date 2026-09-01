import { redirect } from "next/navigation";

import { routes } from "@/constants/routes";

/** Programme index lives at /online-courses. Individual modules remain at /courses/[code]. */
export default function CoursesIndexRedirect() {
  redirect(routes.onlineCourses);
}
