import { BookOpen } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { InstructorCourseGrid } from "@/features/courses/components/course-lane-card";
import { listPublishedCoursesGroupedByCategory } from "@/services/courses/course-service";

/** Server-rendered public catalog grouped by Super Admin categories. */
function PublicCourseCatalog() {
  let groups: ReturnType<typeof listPublishedCoursesGroupedByCategory> = [];
  try {
    groups = listPublishedCoursesGroupedByCategory(200, { deliveryFilter: "all" });
  } catch (error) {
    console.error("[public-course-catalog]", error);
    return (
      <EmptyState
        icon={<BookOpen className="h-6 w-6" />}
        title="Courses temporarily unavailable"
        description="We could not load the published catalog right now. Please try again in a moment."
      />
    );
  }
  const total = groups.reduce((sum, g) => sum + g.courses.length, 0);

  if (total === 0) {
    return (
      <EmptyState
        icon={<BookOpen className="h-6 w-6" />}
        title="No published courses yet"
        description="Published programmes will appear here once they are listed and assigned to a category."
      />
    );
  }

  return (
    <div className="catalog-deck">
      <header className="catalog-deck-header">
        <div>
          <p className="landing-kicker text-primary">Course catalog</p>
          <h2 className="catalog-deck-title">
            {total} course{total === 1 ? "" : "s"} by category
          </h2>
        </div>
        <div className="catalog-deck-stat" aria-label={`${groups.length} categories`}>
          <span className="catalog-deck-stat-value">{groups.length}</span>
          <span className="catalog-deck-stat-label">
            categor{groups.length === 1 ? "y" : "ies"}
          </span>
        </div>
      </header>

      <div className="landing-rule opacity-70" />

      <div className="catalog-deck-groups">
        {groups.map((group, groupIndex) => (
          <InstructorCourseGrid
            key={group.category?.id ?? "uncategorized"}
            group={{
              instructorId: group.category?.id ?? null,
              instructorName: group.category?.name ?? "Uncategorized",
              courses: group.courses,
            }}
            groupIndex={groupIndex}
            kicker={group.category ? "Category" : "Other"}
            countLabel="course"
            ctaLabel="View course"
            showInstructorOnCard
            descriptionLines={3}
          />
        ))}
      </div>
    </div>
  );
}

export { PublicCourseCatalog };
