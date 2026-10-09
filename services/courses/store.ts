/**
 * Course LMS durable store (.data/aep-courses.json).
 * Enrollments live in the indexed LMS enrollment store so student reads
 * never hydrate thousands of rows with the catalog.
 */

import path from "path";

import { dataDir, readJsonFile, writeJsonFile } from "@/lib/data/json-file-store";
import {
  countDistinctStudents,
  countEnrollments,
  countEnrollmentsByCourse,
  listAllEnrollments,
  listEnrollmentsForCourse,
  listEnrollmentsForStudent,
  rebindEnrollmentsStudent,
  replaceAllEnrollments,
} from "@/lib/data/lms-enrollment-store";
import { clearCourseDetailCache } from "@/services/courses/detail-cache";
import type {
  Course,
  CourseCategory,
  CourseInstructorAssignment,
  CourseModule,
  Enrollment,
  Lesson,
  LessonProgress,
  LessonResource,
} from "@/types/courses";

export interface CoursesDatabase {
  categories: CourseCategory[];
  courses: Course[];
  modules: CourseModule[];
  lessons: Lesson[];
  resources: LessonResource[];
  instructors: CourseInstructorAssignment[];
  enrollments: Enrollment[];
  progress: LessonProgress[];
  seeded: boolean;
}

const DATA_FILE = path.join(dataDir(), "aep-courses.json");

function emptyDb(): CoursesDatabase {
  return {
    categories: [],
    courses: [],
    modules: [],
    lessons: [],
    resources: [],
    instructors: [],
    enrollments: [],
    progress: [],
    seeded: false,
  };
}

function normalizeCategory(category: CourseCategory): CourseCategory {
  return {
    ...category,
    imageUrl: category.imageUrl ?? null,
    seoTitle: category.seoTitle ?? "",
    metaDescription: category.metaDescription ?? "",
    order: Number.isFinite(category.order) ? category.order : 0,
    visible: category.visible !== false,
  };
}

function normalizeCourse(course: Course): Course {
  const deliveryType =
    course.deliveryType === "live" || course.deliveryType === "recorded"
      ? course.deliveryType
      : "recorded";
  const enrollmentOpen =
    typeof course.enrollmentOpen === "boolean"
      ? course.enrollmentOpen
      : course.enrollmentMode === "open";
  const priceAmount =
    typeof course.priceAmount === "number" && Number.isFinite(course.priceAmount)
      ? Math.round(course.priceAmount)
      : typeof course.metadata?.priceAmount === "number"
        ? Math.round(course.metadata.priceAmount)
        : null;
  const currencyRaw =
    (typeof course.currency === "string" && course.currency.trim()) ||
    (typeof course.metadata?.currency === "string" ? course.metadata.currency : "");
  const displayOrder =
    typeof course.displayOrder === "number" && Number.isFinite(course.displayOrder)
      ? course.displayOrder
      : 0;
  return {
    ...course,
    deliveryType,
    enrollmentOpen,
    hidden: Boolean(course.hidden),
    featured: Boolean(course.featured),
    displayOrder,
    priceAmount,
    currency: currencyRaw ? currencyRaw.trim().toUpperCase() : null,
  };
}

function normalize(raw: Partial<CoursesDatabase> | null | undefined): CoursesDatabase {
  return {
    categories: (raw?.categories ?? []).map((c) => normalizeCategory(c as CourseCategory)),
    courses: (raw?.courses ?? []).map((c) => normalizeCourse(c as Course)),
    modules: raw?.modules ?? [],
    lessons: raw?.lessons ?? [],
    resources: raw?.resources ?? [],
    instructors: raw?.instructors ?? [],
    enrollments: raw?.enrollments ?? [],
    progress: raw?.progress ?? [],
    seeded: Boolean(raw?.seeded),
  };
}

function persistCatalog(db: CoursesDatabase): void {
  writeJsonFile(DATA_FILE, catalogSnapshot(db));
}

function catalogSnapshot(db: CoursesDatabase): CoursesDatabase {
  return {
    categories: db.categories,
    courses: db.courses,
    modules: db.modules,
    lessons: db.lessons,
    resources: db.resources,
    instructors: db.instructors,
    enrollments: [],
    progress: db.progress,
    seeded: db.seeded,
  };
}

function extractEmbeddedEnrollments(db: CoursesDatabase): void {
  const embedded = db.enrollments ?? [];
  if (embedded.length === 0) return;
  const existing = listAllEnrollments();
  const merged = existing.length > 0 ? [...existing, ...embedded] : embedded;
  replaceAllEnrollments(merged);
  db.enrollments = [];
  persistCatalog(db);
}

function withEnrollmentView(db: CoursesDatabase): CoursesDatabase {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "enrollments") return listAllEnrollments();
      return Reflect.get(target, prop, receiver);
    },
  });
}

function withLazyEnrollmentWrites(catalog: CoursesDatabase): {
  working: CoursesDatabase;
  flushEnrollments: () => void;
} {
  let enrollmentsLoaded = false;
  let enrollments: Enrollment[] = [];
  const working = { ...catalog, enrollments: [] };
  Object.defineProperty(working, "enrollments", {
    configurable: true,
    enumerable: true,
    get() {
      if (!enrollmentsLoaded) {
        enrollments = listAllEnrollments();
        enrollmentsLoaded = true;
      }
      return enrollments;
    },
    set(value: Enrollment[]) {
      enrollments = Array.isArray(value) ? value : [];
      enrollmentsLoaded = true;
    },
  });
  return {
    working,
    flushEnrollments() {
      if (enrollmentsLoaded) replaceAllEnrollments(enrollments);
    },
  };
}

export function ensureCoursesStore(): CoursesDatabase {
  const db = normalize(readJsonFile<Partial<CoursesDatabase>>(DATA_FILE, emptyDb));
  extractEmbeddedEnrollments(db);
  db.enrollments = [];
  return db;
}

export function readCoursesDb(): CoursesDatabase {
  return withEnrollmentView(ensureCoursesStore());
}

export function writeCoursesDb(mutator: (db: CoursesDatabase) => void): CoursesDatabase {
  const catalog = ensureCoursesStore();
  const { working, flushEnrollments } = withLazyEnrollmentWrites(catalog);
  mutator(working);
  flushEnrollments();
  const persisted = catalogSnapshot(working);
  persistCatalog(persisted);
  clearCourseDetailCache();
  return withEnrollmentView(persisted);
}

export function replaceCoursesDb(db: CoursesDatabase): void {
  replaceAllEnrollments(db.enrollments ?? []);
  persistCatalog(db);
  clearCourseDetailCache();
}

export {
  countDistinctStudents,
  countEnrollments,
  countEnrollmentsByCourse,
  listAllEnrollments,
  listEnrollmentsForCourse,
  listEnrollmentsForStudent,
  rebindEnrollmentsStudent,
};
