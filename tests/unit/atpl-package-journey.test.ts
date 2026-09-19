import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  ATPL_COMPLETE_PACKAGE_SUBJECTS,
  ATPL_PACKAGE_CONFIRMED_NOTICE,
  ATPL_PACKAGE_JOINING_TERMS,
  ATPL_PACKAGE_LECTURE_TITLE,
  ATPL_PACKAGE_LMS_COURSE_CODES,
  ATPL_PACKAGE_MIN_NOTICE_HOURS,
  ATPL_PACKAGE_NEXT_SUBJECT_NOTICE,
  ATPL_PACKAGE_OPENING_SUBJECT_CODE,
  ATPL_PACKAGE_OPENING_SUBJECT_TITLE,
  ATPL_PACKAGE_TKI_NOTICE,
  atplPackageLectureLessonId,
  atplPackageScheduleIssue,
  formatAtplLectureTitle,
  formatLocalDateInput,
  validAtplPackageSchedule,
} from "@/constants/atpl-complete-package";
import { ACTION_LABELS } from "@/constants/programme-terms";
import { ROLES } from "@/constants/roles";
import { HERO } from "@/features/marketing/content/atpl-pass-home";
import { listAtplPackageReviewSubjects } from "@/services/marketing/atpl-package-review";
import {
  listPublicAtplSubjects,
  updateAtplLandingSubject,
} from "@/services/marketing/atpl-subjects-service";
import { resetAtplMarketingDbForTests } from "@/services/marketing/atpl-subjects-store";
import { ensureCoursesSeeded } from "@/services/courses/seed";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { readAuthDb } from "@/services/auth/store";
import { ensurePaymentsSeeded } from "@/services/payments/seed";
import { getWelcomeByOrderId, payGuestCheckout } from "@/services/payments/purchase-first-service";
import {
  confirmAtplPackageSchedule,
  ensureConfirmedFirstLectureOnTimetable,
  getAtplPackageProduct,
  getCgiDashboardSnapshot,
  getStudentAtplPackageSchedule,
  listAssignedFirstLectures,
  listAtplCourses,
  listAtplStudents,
  openNextAtplPackageSubject,
} from "@/services/cgi/journey-service";
import { writeCgiDb } from "@/services/cgi/store";
import { getLiveClass } from "@/services/classes/class-service";
import { writeClassesDb } from "@/services/classes/store";
import {
  getScheduleOverview,
  listScheduleSessions,
} from "@/services/schedule/dynamic-schedule-service";
import { guestCheckoutSchema } from "@/utils/validation";

const CLIENT_TITLES = [
  "Instrumentation",
  "General Navigation",
  "Radio Navigation",
  "Meteorology",
  "Human Performance and Limitations",
  "Aircraft General Knowledge",
  "Air Law",
  "Flight Planning and Monitoring",
  "Performance",
  "Operational Procedures",
  "Principles of Flight",
  "Mass and Balance",
  "Communications",
];

describe("ATPL Complete Package journey", () => {
  beforeEach(() => {
    resetAtplMarketingDbForTests();
  });

  it("reviews the client's 13 subjects in the agreed order", () => {
    expect(ATPL_COMPLETE_PACKAGE_SUBJECTS).toHaveLength(13);
    expect(ATPL_COMPLETE_PACKAGE_SUBJECTS.map((s) => s.title)).toEqual(CLIENT_TITLES);
    const review = listAtplPackageReviewSubjects();
    expect(review).toHaveLength(13);
    expect(review.map((s) => s.title)).toEqual(CLIENT_TITLES);
    expect(review.every((s) => s.shortDescription.trim().length > 0)).toBe(true);
    expect(review.map((s) => s.title)).not.toContain("Dynamic Management");
    expect(listPublicAtplSubjects()).toHaveLength(16);
  });

  it("keeps hidden CMS extras off the package review without dropping a required subject", async () => {
    const airLaw = listPublicAtplSubjects().find((s) => s.code === "010");
    expect(airLaw).toBeTruthy();
    await updateAtplLandingSubject({
      id: airLaw!.id,
      patch: { visible: false },
    });
    expect(listPublicAtplSubjects().some((s) => s.code === "010")).toBe(false);
    expect(
      listAtplPackageReviewSubjects().some((s) => s.code === "010" && s.title === "Air Law"),
    ).toBe(true);
  });

  it("requires a first lecture at least 72 hours ahead", () => {
    const tooSoon = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(atplPackageScheduleIssue(formatLocalDateInput(tooSoon), "10:00")).toMatch(/72 hours/);
    const ok = validAtplPackageSchedule();
    expect(atplPackageScheduleIssue(ok.studyStartDate, ok.firstLectureTime)).toBeNull();
    expect(ATPL_PACKAGE_MIN_NOTICE_HOURS).toBe(72);
    expect(ATPL_PACKAGE_TKI_NOTICE).toMatch(/TKI 1/);
    expect(ATPL_PACKAGE_JOINING_TERMS.length).toBeGreaterThanOrEqual(4);
  });

  it("rejects guest checkout payloads without a valid package schedule", () => {
    const base = {
      firstName: "Lina",
      lastName: "Pilot",
      email: "lina.schedule@aviatorpass.test",
      phone: "+96550001111",
      country: "KW",
    };
    expect(guestCheckoutSchema.safeParse(base).success).toBe(false);
    expect(
      guestCheckoutSchema.safeParse({
        ...base,
        studyStartDate: formatLocalDateInput(new Date()),
        firstLectureTime: "09:00",
      }).success,
    ).toBe(false);
    expect(guestCheckoutSchema.safeParse({ ...base, ...validAtplPackageSchedule() }).success).toBe(
      true,
    );
  });

  it("stores the requested start on the paid order and welcome snapshot", async () => {
    ensureDemoUsersSeeded();
    ensureCoursesSeeded();
    ensurePaymentsSeeded();
    const schedule = validAtplPackageSchedule();
    const result = await payGuestCheckout({
      firstName: "Huda",
      lastName: "Farid",
      email: `package.schedule.${Date.now()}@aviatorpass.test`,
      phone: "+96550007777",
      country: "KW",
      billingName: "Huda Farid",
      billingAddress: "Kuwait City",
      ...schedule,
      methodBrand: "card",
      paymentToken: "tok_4242",
      idempotencyKey: `package-schedule-${Date.now()}`,
    });
    expect(result.order.status).toBe("paid");
    expect(result.order.metadata.studyStartDate).toBe(schedule.studyStartDate);
    expect(result.order.metadata.firstLectureTime).toBe(schedule.firstLectureTime);
    expect(result.order.metadata.scheduleProvisional).toBe(true);
    expect(result.order.metadata.requestedStudyStartDate).toBe(schedule.studyStartDate);
    expect(result.order.metadata.requestedFirstLectureTime).toBe(schedule.firstLectureTime);
    expect(String(result.order.metadata.scheduleNotice)).toMatch(/TKI 1/);
    const welcome = getWelcomeByOrderId(result.order.id);
    expect(welcome?.studyStartDate).toBe(schedule.studyStartDate);
    expect(welcome?.firstLectureTime).toBe(schedule.firstLectureTime);
    const cgiStudent = listAtplStudents().find((s) => s.email === result.order.studentEmail);
    expect(cgiStudent?.requestedStudyStartDate).toBe(schedule.studyStartDate);
    expect(cgiStudent?.requestedFirstLectureTime).toBe(schedule.firstLectureTime);
    expect(cgiStudent?.scheduleProvisional).toBe(true);
    expect(cgiStudent?.requestedFirstLectureLabel).toBeTruthy();
  });

  it("keeps checkout on the guest form so the schedule is collected before Stripe", () => {
    const checkoutPage = readFileSync(
      path.join(process.cwd(), "app/(marketing)/checkout/page.tsx"),
      "utf8",
    );
    expect(checkoutPage).toContain("GuestCheckoutView");
    expect(checkoutPage).not.toContain("startHostedCheckout");
    expect(checkoutPage).not.toContain("StripeCheckoutRedirect");

    const checkoutView = readFileSync(
      path.join(process.cwd(), "features/payments/components/guest-checkout-view.tsx"),
      "utf8",
    );
    expect(checkoutView).toContain("studyStartDate");
    expect(checkoutView).toContain("firstLectureTime");
    expect(checkoutView).toContain("ATPL_PACKAGE_TKI_NOTICE");

    const program = readFileSync(
      path.join(process.cwd(), "features/marketing/components/atpl-program-page.tsx"),
      "utf8",
    );
    expect(program).toContain("joining-terms");
    expect(program).toContain("ATPL_PACKAGE_JOINING_TERMS");
    expect(program).toContain("ACTION_LABELS.chooseThisPackage");
    expect(ACTION_LABELS.chooseThisPackage).toBe("Choose this package");
    expect(ACTION_LABELS.chooseAtplPackage).toBe("Choose ATPL Complete Package");
    expect(HERO.secondaryCta).toBe("Choose ATPL Complete Package");

    const homePage = readFileSync(path.join(process.cwd(), "app/(marketing)/page.tsx"), "utf8");
    expect(homePage).toContain("listAtplPackageReviewSubjects");
    expect(listAtplPackageReviewSubjects()).toHaveLength(13);
  });

  it("seeds all 13 package subjects in the LMS and opens with Instrumentation", () => {
    ensureDemoUsersSeeded();
    ensureCoursesSeeded();
    ensurePaymentsSeeded();
    writeCgiDb((db) => {
      db.settings.defaultFirstSubjectCourseId = null;
    });
    const courses = listAtplCourses();
    expect(courses.map((course) => course.code)).toEqual([...ATPL_PACKAGE_LMS_COURSE_CODES]);
    expect(courses[0]?.code).toBe(`ATPL-${ATPL_PACKAGE_OPENING_SUBJECT_CODE}`);
    expect(courses[0]?.subjectCode).toBe(ATPL_PACKAGE_OPENING_SUBJECT_CODE);
    const product = getAtplPackageProduct();
    expect(product?.metadata.courseIds).toHaveLength(13);
    expect(new Set(product?.metadata.courseIds as string[]).size).toBe(13);
  });

  it("lets TKI 1 confirm the requested first lecture or a different time", async () => {
    ensureDemoUsersSeeded();
    ensureCoursesSeeded();
    ensurePaymentsSeeded();
    writeCgiDb((db) => {
      db.settings.defaultFirstSubjectCourseId = null;
    });
    const cgi = readAuthDb().users.find((u) => u.role === ROLES.CHIEF_GROUND_INSTRUCTOR)!;
    const requested = validAtplPackageSchedule();
    const paid = await payGuestCheckout({
      firstName: "Rami",
      lastName: "Nasser",
      email: `tki.confirm.${Date.now()}@aviatorpass.test`,
      phone: "+96550008888",
      country: "KW",
      billingName: "Rami Nasser",
      billingAddress: "Kuwait City",
      ...requested,
      methodBrand: "card",
      paymentToken: "tok_4242",
      idempotencyKey: `tki-confirm-${Date.now()}`,
    });
    const student = listAtplStudents().find((s) => s.email === paid.order.studentEmail);
    expect(student?.studentId).toBeTruthy();
    expect(
      getCgiDashboardSnapshot().pendingFirstLectures.some(
        (s) => s.email === paid.order.studentEmail,
      ),
    ).toBe(true);

    const confirmed = await confirmAtplPackageSchedule({
      studentId: student!.studentId,
      actorId: cgi.id,
    });
    expect(confirmed.scheduleProvisional).toBe(false);
    expect(confirmed.confirmedStudyStartDate).toBe(requested.studyStartDate);
    expect(confirmed.confirmedFirstLectureTime).toBe(requested.firstLectureTime);
    expect(confirmed.scheduleNotice).toBe(ATPL_PACKAGE_CONFIRMED_NOTICE);
    expect(confirmed.firstLectureLiveClassId).toBeTruthy();
    expect(confirmed.firstLectureOnTimetable).toBe(true);
    expect(confirmed.confirmedFirstLectureAt).toBeTruthy();
    expect(confirmed.firstLectureSubjectCode).toBe(ATPL_PACKAGE_OPENING_SUBJECT_CODE);
    expect(confirmed.firstLectureSubjectTitle).toBe(ATPL_PACKAGE_OPENING_SUBJECT_TITLE);
    const booked = listScheduleSessions({
      userId: student!.studentId,
      role: ROLES.STUDENT,
      from: new Date().toISOString(),
    });
    expect(booked.some((session) => session.id === confirmed.firstLectureLiveClassId)).toBe(true);
    expect(
      booked.find((session) => session.id === confirmed.firstLectureLiveClassId)?.title,
    ).toContain(ATPL_PACKAGE_OPENING_SUBJECT_TITLE);

    const missingId = confirmed.firstLectureLiveClassId!;
    writeClassesDb((db) => {
      db.classes = db.classes.filter((row) => row.id !== missingId);
      db.participants = db.participants.filter((row) => row.liveClassId !== missingId);
    });
    expect(
      listScheduleSessions({
        userId: student!.studentId,
        role: ROLES.STUDENT,
        from: new Date().toISOString(),
      }).some((session) => session.id === missingId),
    ).toBe(false);
    const restored = await ensureConfirmedFirstLectureOnTimetable(
      student!.studentId,
      paid.order.studentEmail!,
    );
    expect(restored.firstLectureOnTimetable).toBe(true);
    expect(restored.firstLectureLiveClassId).toBeTruthy();
    expect(
      listScheduleSessions({
        userId: student!.studentId,
        role: ROLES.STUDENT,
        from: new Date().toISOString(),
      }).some((session) => session.id === restored.firstLectureLiveClassId),
    ).toBe(true);

    const restoredId = restored.firstLectureLiveClassId!;
    writeClassesDb((db) => {
      db.participants = db.participants.filter(
        (row) => !(row.liveClassId === restoredId && row.userId === student!.studentId),
      );
    });
    const reenrolled = await ensureConfirmedFirstLectureOnTimetable(
      student!.studentId,
      paid.order.studentEmail!,
    );
    expect(reenrolled.firstLectureOnTimetable).toBe(true);
    expect(
      listScheduleSessions({
        userId: student!.studentId,
        role: ROLES.STUDENT,
        from: new Date().toISOString(),
      }).some((session) => session.id === reenrolled.firstLectureLiveClassId),
    ).toBe(true);
    expect(
      getCgiDashboardSnapshot().pendingFirstLectures.some(
        (s) => s.email === paid.order.studentEmail,
      ),
    ).toBe(false);
    expect(
      getStudentAtplPackageSchedule(student!.studentId, paid.order.studentEmail!).orderId,
    ).toBe(paid.order.id);

    const later = validAtplPackageSchedule();
    const paidAgain = await payGuestCheckout({
      firstName: "Sara",
      lastName: "Hadi",
      email: `tki.replace.${Date.now()}@aviatorpass.test`,
      phone: "+96550009999",
      country: "KW",
      billingName: "Sara Hadi",
      billingAddress: "Kuwait City",
      ...later,
      methodBrand: "card",
      paymentToken: "tok_4242",
      idempotencyKey: `tki-replace-${Date.now()}`,
    });
    const studentTwo = listAtplStudents().find((s) => s.email === paidAgain.order.studentEmail)!;
    const newDate = formatLocalDateInput(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000));
    const replaced = await confirmAtplPackageSchedule({
      studentId: studentTwo.studentId,
      actorId: cgi.id,
      studyStartDate: newDate,
      firstLectureTime: "19:30",
    });
    expect(replaced.requestedStudyStartDate).toBe(later.studyStartDate);
    expect(replaced.requestedFirstLectureTime).toBe(later.firstLectureTime);
    expect(replaced.confirmedStudyStartDate).toBe(newDate);
    expect(replaced.confirmedFirstLectureTime).toBe("19:30");
    expect(replaced.scheduleProvisional).toBe(false);
    expect(replaced.firstLectureLiveClassId).toBeTruthy();
    const replacedSessions = listScheduleSessions({
      userId: studentTwo.studentId,
      role: ROLES.STUDENT,
      from: new Date().toISOString(),
    });
    expect(
      replacedSessions.some((session) => session.id === replaced.firstLectureLiveClassId),
    ).toBe(true);
    const live = getLiveClass(reenrolled.firstLectureLiveClassId!);
    expect(live?.instructorId).toBeTruthy();
    expect(
      listAssignedFirstLectures({ instructorId: live!.instructorId }).some(
        (row) =>
          row.studentId === student!.studentId &&
          row.onTimetable &&
          row.subjectTitle === ATPL_PACKAGE_OPENING_SUBJECT_TITLE,
      ),
    ).toBe(true);
    const instructorOverview = getScheduleOverview({
      userId: live!.instructorId,
      role: ROLES.INSTRUCTOR,
    });
    expect(
      instructorOverview.firstLectures.some((row) => row.studentId === student!.studentId),
    ).toBe(true);
    expect(
      instructorOverview.upcoming.some(
        (session) => session.id === reenrolled.firstLectureLiveClassId,
      ),
    ).toBe(true);
  });

  it("keeps TKI 1 confirmation on the CGI console and student surfaces", () => {
    const cgiRoute = readFileSync(path.join(process.cwd(), "app/api/cgi/route.ts"), "utf8");
    const cgiView = readFileSync(
      path.join(process.cwd(), "features/cgi/components/cgi-console-view.tsx"),
      "utf8",
    );
    const dash = readFileSync(
      path.join(
        process.cwd(),
        "features/learning/components/student-dashboard/student-dashboard-view.tsx",
      ),
      "utf8",
    );
    const scheduleHub = readFileSync(
      path.join(process.cwd(), "features/schedule/components/schedule-hub-view.tsx"),
      "utf8",
    );
    expect(cgiRoute).toContain("confirm_first_lecture");
    expect(cgiView).toContain("confirm_first_lecture");
    expect(cgiView).toContain("ACTION_LABELS.confirmRequestedFirstLecture");
    expect(cgiView).toContain("books the first lecture");
    expect(ACTION_LABELS.confirmRequestedFirstLecture).toBe("Confirm requested time");
    expect(ACTION_LABELS.confirmDifferentFirstLecture).toBe("Confirm a different time");
    expect(dash).toContain("/api/learning/atpl-schedule");
    expect(dash).toContain("First lecture");
    expect(dash).toContain("confirmedFirstLectureAt");
    expect(scheduleHub).toContain("/api/learning/atpl-schedule");
    expect(scheduleHub).toContain("ATPL_PACKAGE_FIRST_LECTURE_TITLE");
    expect(scheduleHub).toContain("First lectures assigned by TKI 1");
    const instructorDash = readFileSync(
      path.join(process.cwd(), "features/dashboard/instructor-dashboard-view.tsx"),
      "utf8",
    );
    expect(instructorDash).toContain("First lectures assigned by TKI 1");
    expect(instructorDash).toContain("/instructor/schedule");
    expect(cgiView).toContain("Confirmed first lectures");
    expect(cgiView).toContain("Instrumentation");
    expect(dash).toContain("firstLectureSubjectTitle");
    expect(getCgiDashboardSnapshot()).toHaveProperty("confirmedFirstLectures");
  });

  it("lets TKI 1 open General Navigation and book that lecture after Instrumentation", async () => {
    ensureDemoUsersSeeded();
    ensureCoursesSeeded();
    ensurePaymentsSeeded();
    writeCgiDb((db) => {
      db.settings.defaultFirstSubjectCourseId = null;
    });
    const cgi = readAuthDb().users.find((u) => u.role === ROLES.CHIEF_GROUND_INSTRUCTOR)!;
    const requested = validAtplPackageSchedule();
    const paid = await payGuestCheckout({
      firstName: "Nour",
      lastName: "Salem",
      email: `tki.next.${Date.now()}@aviatorpass.test`,
      phone: "+96550006666",
      country: "KW",
      billingName: "Nour Salem",
      billingAddress: "Kuwait City",
      ...requested,
      methodBrand: "card",
      paymentToken: "tok_4242",
      idempotencyKey: `tki-next-${Date.now()}`,
    });
    const student = listAtplStudents().find((s) => s.email === paid.order.studentEmail);
    expect(student?.studentId).toBeTruthy();

    await expect(
      openNextAtplPackageSubject({
        studentId: student!.studentId,
        actorId: cgi.id,
        studyStartDate: requested.studyStartDate,
        lectureTime: "16:00",
      }),
    ).rejects.toThrow(/Confirm the first lecture/);

    const confirmed = await confirmAtplPackageSchedule({
      studentId: student!.studentId,
      actorId: cgi.id,
    });
    expect(confirmed.firstLectureSubjectTitle).toBe(ATPL_PACKAGE_OPENING_SUBJECT_TITLE);
    expect(confirmed.nextSubjectCode).toBe("061");
    expect(confirmed.nextSubjectTitle).toBe("General Navigation");
    expect(confirmed.nextSubjectStatus).toBe("locked");
    expect(confirmed.nextLectureLiveClassId).toBeNull();
    expect(
      getCgiDashboardSnapshot().readyForNextSubject.some(
        (s) => s.email === paid.order.studentEmail && s.nextSubjectTitle === "General Navigation",
      ),
    ).toBe(true);

    const nextWhen = validAtplPackageSchedule();
    const nextDate = formatLocalDateInput(new Date(Date.now() + 12 * 24 * 60 * 60 * 1000));
    const opened = await openNextAtplPackageSubject({
      studentId: student!.studentId,
      actorId: cgi.id,
      studyStartDate: nextDate,
      lectureTime: nextWhen.firstLectureTime,
    });
    expect(opened.nextSubjectCode).toBe("061");
    expect(opened.nextSubjectTitle).toBe("General Navigation");
    expect(opened.nextSubjectStatus).toBe("available");
    expect(opened.nextLectureLiveClassId).toBeTruthy();
    expect(opened.nextLectureLabel).toBeTruthy();
    expect(formatAtplLectureTitle("General Navigation")).toBe(
      `${ATPL_PACKAGE_LECTURE_TITLE} · General Navigation`,
    );
    expect(atplPackageLectureLessonId("061")).toBe("atpl-lecture-061");
    expect(ATPL_PACKAGE_NEXT_SUBJECT_NOTICE).toMatch(/next subject/);

    const booked = listScheduleSessions({
      userId: student!.studentId,
      role: ROLES.STUDENT,
      from: new Date().toISOString(),
    });
    expect(booked.some((session) => session.id === opened.nextLectureLiveClassId)).toBe(true);
    expect(booked.find((session) => session.id === opened.nextLectureLiveClassId)?.title).toContain(
      "General Navigation",
    );
    expect(getLiveClass(opened.nextLectureLiveClassId!)?.instructorId).toBeTruthy();
    expect(
      getCgiDashboardSnapshot().readyForNextSubject.some(
        (s) => s.email === paid.order.studentEmail,
      ),
    ).toBe(false);

    await expect(
      openNextAtplPackageSubject({
        studentId: student!.studentId,
        actorId: cgi.id,
        studyStartDate: nextDate,
        lectureTime: "17:00",
      }),
    ).rejects.toThrow(/already open/);
  });

  it("keeps next-subject opening on the CGI console and student surfaces", () => {
    const cgiRoute = readFileSync(path.join(process.cwd(), "app/api/cgi/route.ts"), "utf8");
    const cgiView = readFileSync(
      path.join(process.cwd(), "features/cgi/components/cgi-console-view.tsx"),
      "utf8",
    );
    const dash = readFileSync(
      path.join(
        process.cwd(),
        "features/learning/components/student-dashboard/student-dashboard-view.tsx",
      ),
      "utf8",
    );
    const scheduleHub = readFileSync(
      path.join(process.cwd(), "features/schedule/components/schedule-hub-view.tsx"),
      "utf8",
    );
    expect(cgiRoute).toContain("open_next_subject");
    expect(cgiView).toContain("open_next_subject");
    expect(cgiView).toContain("ACTION_LABELS.openNextSubject");
    expect(cgiView).toContain("Next subject after first lecture");
    expect(ACTION_LABELS.openNextSubject).toBe("Open next subject");
    expect(dash).toContain("nextSubjectTitle");
    expect(dash).toContain("Waiting for TKI 1 to open the next subject.");
    expect(scheduleHub).toContain("nextSubjectTitle");
    expect(getCgiDashboardSnapshot()).toHaveProperty("readyForNextSubject");
  });
});
