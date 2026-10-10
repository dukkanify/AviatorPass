import { describe, expect, it } from "vitest";

import { notificationTargetHref } from "@/lib/notifications/notification-href";

describe("notificationTargetHref", () => {
  it("opens a live class when the stored notice has no link", () => {
    expect(
      notificationTargetHref(
        {
          type: "class.created",
          actionUrl: null,
          data: { liveClassId: "4e1780d83164ec09edfb90e3e0948ea6" },
        },
        "student",
      ),
    ).toBe("/join/4e1780d83164ec09edfb90e3e0948ea6");
  });

  it("sends payment notices to billing", () => {
    expect(
      notificationTargetHref(
        { type: "payment.succeeded", actionUrl: "/student/payments" },
        "student",
      ),
    ).toBe("/student/billing");
  });

  it("opens the class for the person viewing a staff assignment notice", () => {
    const record = {
      type: "admin.instructor_assigned",
      actionUrl: "/super-admin",
      data: { liveClassId: "4e1780d83164ec09edfb90e3e0948ea6" },
    };
    expect(notificationTargetHref(record, "super-admin")).toBe(
      "/super-admin/classes/4e1780d83164ec09edfb90e3e0948ea6",
    );
    expect(notificationTargetHref(record, "admin")).toBe(
      "/admin/classes/4e1780d83164ec09edfb90e3e0948ea6",
    );
  });

  it("opens the support desk for the signed-in role", () => {
    const record = { type: "ticket.updated", actionUrl: "/support?ticket=abc" };
    expect(notificationTargetHref(record, "student")).toBe("/student/support?ticket=abc");
    expect(notificationTargetHref(record, "instructor")).toBe("/instructor/support?ticket=abc");
  });

  it("keeps an in-app classroom link", () => {
    expect(
      notificationTargetHref(
        {
          type: "class.instructor_waiting",
          actionUrl: "/join/a72e4086bb3a147b6cc3d6a7ec6c0d71",
        },
        "student",
      ),
    ).toBe("/join/a72e4086bb3a147b6cc3d6a7ec6c0d71");
  });
});
