import { beforeAll, describe, expect, it } from "vitest";

import { ACCOUNT_STATUS } from "@/constants/account-status";
import { ROLES } from "@/constants/roles";
import { ensureDemoUsersSeeded } from "@/services/auth/demo-users";
import { findUserByEmail, readAuthDb, toUserProfile } from "@/services/auth/store";
import { PermissionError } from "@/services/auth/permissions";
import { createManagedUser, updateManagedUser } from "@/services/users/user-admin-service";

function actor(email: string) {
  return toUserProfile(findUserByEmail(email)!);
}

describe("admin console user create", () => {
  beforeAll(() => {
    ensureDemoUsersSeeded();
  });

  it("lets a super admin create instructor, student, and admin accounts", async () => {
    const superAdmin = actor("superadmin@aviatorpass.com");
    const stamp = Date.now();

    const instructor = await createManagedUser(superAdmin, {
      firstName: "Nadia",
      lastName: "Al-Sabah",
      email: `instructor.created.${stamp}@aviatorpass.test`,
      phone: "",
      countryCode: "KW",
      role: ROLES.INSTRUCTOR,
    });
    expect(instructor.profile.role).toBe(ROLES.INSTRUCTOR);
    expect(instructor.profile.status).toBe(ACCOUNT_STATUS.ACTIVE);
    expect(instructor.setupUrl).toContain("/setup-password");
    expect(findUserByEmail(instructor.profile.email)?.mustChangePassword).toBe(true);
    expect(
      readAuthDb().passwordSetupTokens.some((token) => token.userId === instructor.profile.id),
    ).toBe(true);

    const studentPhone = `+9655${String(stamp).slice(-7)}`;
    const student = await createManagedUser(superAdmin, {
      firstName: "Omar",
      lastName: "Hassan",
      email: `student.created.${stamp}@aviatorpass.test`,
      phone: studentPhone,
      countryCode: "KW",
      role: ROLES.STUDENT,
    });
    expect(student.profile.role).toBe(ROLES.STUDENT);
    expect(student.profile.phone).toBe(studentPhone);

    const admin = await createManagedUser(superAdmin, {
      firstName: "Lina",
      lastName: "Farid",
      email: `admin.created.${stamp}@aviatorpass.test`,
      phone: "",
      role: ROLES.ADMIN,
    });
    expect(admin.profile.role).toBe(ROLES.ADMIN);
  });

  it("blocks an admin from creating another admin", async () => {
    const admin = actor("admin@aviatorpass.com");
    await expect(
      createManagedUser(admin, {
        firstName: "Blocked",
        lastName: "Admin",
        email: `blocked.admin.${Date.now()}@aviatorpass.test`,
        phone: "",
        role: ROLES.ADMIN,
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("rejects duplicate emails and allows status updates", async () => {
    const superAdmin = actor("superadmin@aviatorpass.com");
    const email = `dup.user.${Date.now()}@aviatorpass.test`;
    const created = await createManagedUser(superAdmin, {
      firstName: "Sara",
      lastName: "Nasser",
      email,
      phone: "",
      role: ROLES.STUDENT,
    });

    await expect(
      createManagedUser(superAdmin, {
        firstName: "Sara",
        lastName: "Two",
        email,
        phone: "",
        role: ROLES.STUDENT,
      }),
    ).rejects.toMatchObject({ name: "UserAdminError", status: 409 });

    const updated = await updateManagedUser(superAdmin, created.profile.id, {
      status: ACCOUNT_STATUS.SUSPENDED,
    });
    expect(updated.status).toBe(ACCOUNT_STATUS.SUSPENDED);
  });

  it("does not let staff change a super admin or their own status", async () => {
    const superAdmin = actor("superadmin@aviatorpass.com");
    await expect(
      updateManagedUser(superAdmin, superAdmin.id, { status: ACCOUNT_STATUS.SUSPENDED }),
    ).rejects.toBeInstanceOf(PermissionError);

    const admin = actor("admin@aviatorpass.com");
    await expect(
      updateManagedUser(admin, admin.id, { status: ACCOUNT_STATUS.INACTIVE }),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});
