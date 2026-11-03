import { describe, expect, it, beforeEach } from "vitest";

import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail, toUserProfile } from "@/services/auth/store";
import {
  confirmBookingPayment,
  getBookingJoinInfo,
  getPublicBookingCatalog,
  listBookableInstructorsForSession,
  listMyBookings,
} from "@/services/bookings/booking-service";
import { writeBookingsDb } from "@/services/bookings/store";

describe("private session booking services", () => {
  beforeEach(() => {
    ensureDemoUsersSeeded();
    writeBookingsDb((db) => {
      db.settings.sessionTypes = db.settings.sessionTypes.map((t) =>
        t.id === "st_coaching"
          ? {
              ...t,
              instructorIds: [],
              paymentRequired: true,
              priceAmountMinor: 25000,
            }
          : t,
      );
    });
  });

  it("exposes dynamic services with per-service instructors in public catalog", () => {
    const catalog = getPublicBookingCatalog();
    expect(catalog.sessionTypes.length).toBeGreaterThanOrEqual(6);
    const coaching = catalog.sessionTypes.find((t) => t.id === "st_coaching");
    expect(coaching?.name).toBe("Private Coaching");
    expect(coaching?.instructors.length).toBeGreaterThan(0);
    expect(coaching?.paymentRequired).toBe(true);
  });

  it("filters instructors assigned to a session type", () => {
    const instructors = listBookableInstructorsForSession("st_coaching");
    expect(instructors.length).toBeGreaterThan(0);
  });

  it("confirms pending_payment bookings after payment", async () => {
    ensureDemoUsersSeeded();
    const student = ensureDemoUsersSeeded();
    void student;

    const bookingId = "bk_test_pay";
    writeBookingsDb((db) => {
      db.bookings.unshift({
        id: bookingId,
        studentId: "user_student_one",
        instructorId: "user_instructor_one",
        sessionTypeId: "st_coaching",
        sessionTypeName: "Private Coaching",
        title: "Private Coaching",
        notes: "",
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        endsAt: new Date(Date.now() + 86400000 + 3600000).toISOString(),
        status: "pending_payment",
        zoom: null,
        guestEmail: null,
        guestFirstName: null,
        guestLastName: null,
        guestVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: null,
        priceAmountMinor: 25000,
        currency: "KWD",
        paymentRequired: true,
        paymentOrderId: null,
        paidAt: null,
      });
    });

    const confirmed = await confirmBookingPayment({
      bookingId,
      userId: "user_student_one",
      paymentOrderId: "ord_test",
    });
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.paidAt).toBeTruthy();
  });

  it("never returns Zoom startUrl (host ZAK) to students on join or list", async () => {
    ensureDemoUsersSeeded();
    const student = toUserProfile(findUserByEmail("student@aviatorpass.com")!);
    const instructor = toUserProfile(findUserByEmail("instructor@aviatorpass.com")!);
    const bookingId = "bk_test_zak_redact";
    const hostStartUrl =
      "https://us02web.zoom.us/s/12345678901?zak=eyJhbGciOiJIUzI1NiJ9.fake-host-zak";

    writeBookingsDb((db) => {
      db.bookings.unshift({
        id: bookingId,
        studentId: student.id,
        instructorId: instructor.id,
        sessionTypeId: "st_coaching",
        sessionTypeName: "Private Coaching",
        title: "Private Coaching ZAK redact",
        notes: "",
        startsAt: new Date(Date.now() + 3600_000).toISOString(),
        endsAt: new Date(Date.now() + 7200_000).toISOString(),
        status: "confirmed",
        zoom: {
          meetingNumber: "12345678901",
          joinUrl: "https://us02web.zoom.us/j/12345678901?pwd=abc",
          startUrl: hostStartUrl,
          password: "123456",
          waitingRoom: false,
          providerMode: "zoom",
          provisionedAt: new Date().toISOString(),
        },
        guestEmail: null,
        guestFirstName: null,
        guestLastName: null,
        guestVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: null,
        priceAmountMinor: 25000,
        currency: "KWD",
        paymentRequired: true,
        paymentOrderId: null,
        paidAt: new Date().toISOString(),
      });
    });

    const studentJoin = await getBookingJoinInfo({ user: student, bookingId });
    expect(studentJoin.isHost).toBe(false);
    expect(studentJoin.join.startUrl).toBeNull();
    expect(studentJoin.booking.zoom?.startUrl).toBe("");
    expect(JSON.stringify(studentJoin)).not.toContain("zak=");

    const hostJoin = await getBookingJoinInfo({ user: instructor, bookingId });
    expect(hostJoin.isHost).toBe(true);
    expect(hostJoin.join.startUrl).toContain("zak=");
    expect(hostJoin.booking.zoom?.startUrl).toContain("zak=");

    const listed = listMyBookings(student).find((b) => b.id === bookingId);
    expect(listed?.zoom?.startUrl).toBe("");
    expect(JSON.stringify(listed)).not.toContain("zak=");
  });
});
