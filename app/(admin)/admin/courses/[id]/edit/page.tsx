import { CourseStudioView } from "@/features/courses/components/course-studio/course-studio-view";

export default async function AdminEditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CourseStudioView courseId={id} basePath="/admin/courses" />;
}
