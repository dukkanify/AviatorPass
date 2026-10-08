import { ACCOUNT_STATUS, type AccountStatus } from "@/constants/account-status";
import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { COUNTRIES } from "@/constants/countries";
import { PERMISSIONS } from "@/constants/permissions";
import { ROLE_LABELS, ROLES, type Role } from "@/constants/roles";
import { creatableRolesFor, type CreatableRole } from "@/features/users/lib/managed-roles";
import { generateId, generateSecurePassword, hashPassword } from "@/lib/security/crypto";
import { PermissionError } from "@/services/auth/permissions";
import { logActivity } from "@/services/auth/activity-log";
import { issuePasswordSetupToken } from "@/services/auth/password-setup-service";
import {
  defaultNotificationPreferences,
  defaultSecuritySettings,
  findUserByEmail,
  findUserById,
  findUserByPhone,
  isStudentProfileComplete,
  toUserProfile,
  writeAuthDb,
  type StoredUser,
} from "@/services/auth/store";
import { sendEmail } from "@/services/email/mailer";
import { staffAccountInviteEmailTemplate } from "@/services/settings/email-templates";
import type { UserProfile } from "@/types";
import { hasPermission } from "@/utils/rbac";
import { normalizePhone, sanitizeEmail, sanitizeString } from "@/utils/sanitize";
import type { AdminCreateUserInput, AdminUpdateUserInput } from "@/utils/validation";

export class UserAdminError extends Error {
  status: number;
  field?: string;

  constructor(message: string, status = 400, field?: string) {
    super(message);
    this.name = "UserAdminError";
    this.status = status;
    this.field = field;
  }
}

export { creatableRolesFor, type CreatableRole };

function nowIso(): string {
  return new Date().toISOString();
}

function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  return COUNTRIES.find((country) => country.code === code)?.name ?? null;
}

function defaultAvatarDataUri(initials: string): string {
  const safe =
    initials
      .replace(/[^A-Z]/gi, "")
      .slice(0, 2)
      .toUpperCase() || "AP";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="#143048"/><text x="64" y="74" text-anchor="middle" font-family="Arial,sans-serif" font-size="44" font-weight="700" fill="#F6C36C">${safe}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function canCreateRole(actor: UserProfile, role: Role): boolean {
  if (!creatableRolesFor(actor.role).includes(role as CreatableRole)) return false;
  if (role === ROLES.STUDENT) {
    return hasPermission(actor.role, PERMISSIONS.STUDENTS_MANAGE);
  }
  if (role === ROLES.INSTRUCTOR) {
    return hasPermission(actor.role, PERMISSIONS.INSTRUCTORS_MANAGE);
  }
  return hasPermission(actor.role, PERMISSIONS.USERS_MANAGE_ADMINS);
}

function canManageTarget(actor: UserProfile, target: StoredUser): boolean {
  if (target.role === ROLES.SUPER_ADMIN) return false;
  if (actor.role === ROLES.SUPER_ADMIN) return true;
  if (actor.role !== ROLES.ADMIN) return false;
  return target.role === ROLES.STUDENT || target.role === ROLES.INSTRUCTOR;
}

function assertCanCreate(actor: UserProfile, role: Role): void {
  if (!canCreateRole(actor, role)) {
    throw new PermissionError("You do not have permission to create this account type", 403);
  }
}

export async function createManagedUser(
  actor: UserProfile,
  input: AdminCreateUserInput,
): Promise<{ profile: UserProfile; setupUrl: string }> {
  assertCanCreate(actor, input.role);

  const email = sanitizeEmail(input.email);
  const firstName = sanitizeString(input.firstName);
  const lastName = sanitizeString(input.lastName);
  const phone = input.phone ? normalizePhone(input.phone) : "";
  const countryCode = input.countryCode?.trim() || "";
  const nationality = sanitizeString(input.nationality || "") || countryName(countryCode) || "";

  if (findUserByEmail(email)) {
    throw new UserAdminError("An account with this email already exists.", 409, "email");
  }
  if (phone && findUserByPhone(phone)) {
    throw new UserAdminError("An account with this phone number already exists.", 409, "phone");
  }

  const temporaryPassword = generateSecurePassword(16);
  const { hash, salt } = hashPassword(temporaryPassword);
  const ts = nowIso();
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`;
  const created: StoredUser = {
    id: generateId(),
    email,
    firstName,
    lastName,
    phone: phone || null,
    countryCode: countryCode || null,
    nationality: nationality || null,
    dateOfBirth: null,
    gender: null,
    city: null,
    bio: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    avatarUrl: defaultAvatarDataUri(initials),
    timezone: "UTC",
    language: "en",
    role: input.role,
    status: ACCOUNT_STATUS.ACTIVE,
    emailVerified: true,
    profileComplete: false,
    mustChangePassword: true,
    passwordHash: hash,
    passwordSalt: salt,
    lastLoginAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  created.profileComplete = isStudentProfileComplete(created);

  writeAuthDb((db) => {
    if (db.users.some((user) => user.email.toLowerCase() === email)) {
      throw new UserAdminError("An account with this email already exists.", 409, "email");
    }
    db.users.push(created);
    db.notificationPreferences.push(defaultNotificationPreferences(created.id, false));
    db.securitySettings.push(defaultSecuritySettings(created.id));
  });

  const setup = issuePasswordSetupToken(created.id);

  await logActivity({
    actorId: actor.id,
    action: ACTIVITY_ACTIONS.USER_CREATED,
    entityType: "user",
    entityId: created.id,
    metadata: { email, role: created.role, via: "admin_console" },
  });

  const invite = staffAccountInviteEmailTemplate({
    firstName,
    roleLabel: ROLE_LABELS[created.role],
    setupUrl: setup.url,
  });
  await sendEmail({
    to: created.email,
    subject: invite.subject,
    html: invite.html,
    text: invite.text,
    meta: { kind: "account", purpose: "staff_invite", system: true, userId: created.id },
  }).catch(() => undefined);

  const { emitNotification, notifyRole } =
    await import("@/services/notifications/notification-service");
  await emitNotification({
    userId: created.id,
    type: "account.created",
    title: "Account created",
    body: "An AviatorPass administrator created your account. Set your password to sign in.",
    actionUrl: "/login",
    email: false,
  });
  await notifyRole("admin", {
    title: "Account added",
    body: `${created.email} was added as ${ROLE_LABELS[created.role]}.`,
    type: "admin.user_created",
    data: { userId: created.id, email: created.email, role: created.role },
  });

  return { profile: toUserProfile(created), setupUrl: setup.url };
}

export async function updateManagedUser(
  actor: UserProfile,
  userId: string,
  input: AdminUpdateUserInput,
): Promise<UserProfile> {
  const target = findUserById(userId);
  if (!target) {
    throw new UserAdminError("User not found.", 404);
  }
  if (!canManageTarget(actor, target)) {
    throw new PermissionError("You do not have permission to update this account", 403);
  }
  if (target.id === actor.id && input.status && input.status !== target.status) {
    throw new UserAdminError("You cannot change your own account status.", 400, "status");
  }
  if (input.role && input.role !== target.role && actor.role !== ROLES.SUPER_ADMIN) {
    throw new PermissionError("Only a Super Admin can change account roles", 403);
  }
  if (input.role && !canCreateRole(actor, input.role)) {
    throw new PermissionError("You do not have permission to assign this role", 403);
  }

  const phone =
    input.phone === undefined ? undefined : input.phone ? normalizePhone(input.phone) : "";
  if (phone) {
    const occupant = findUserByPhone(phone);
    if (occupant && occupant.id !== target.id) {
      throw new UserAdminError("An account with this phone number already exists.", 409, "phone");
    }
  }

  const nextPassword = input.password?.trim() || "";
  const passwordHash = nextPassword ? hashPassword(nextPassword) : null;

  writeAuthDb((db) => {
    const user = db.users.find((row) => row.id === userId);
    if (!user) return;
    if (input.firstName) user.firstName = sanitizeString(input.firstName);
    if (input.lastName) user.lastName = sanitizeString(input.lastName);
    if (phone !== undefined) user.phone = phone || null;
    if (input.countryCode !== undefined) {
      user.countryCode = input.countryCode.trim() || null;
    }
    if (input.nationality !== undefined) {
      user.nationality = sanitizeString(input.nationality) || null;
    }
    if (input.status) user.status = input.status as AccountStatus;
    if (input.role) user.role = input.role;
    if (passwordHash) {
      user.passwordHash = passwordHash.hash;
      user.passwordSalt = passwordHash.salt;
      user.mustChangePassword = false;
      user.emailVerified = true;
      db.sessions.forEach((session) => {
        if (session.userId === user.id && !session.revokedAt) session.revokedAt = nowIso();
      });
    }
    user.profileComplete = isStudentProfileComplete(user);
    user.updatedAt = nowIso();
  });

  const fresh = findUserById(userId);
  if (!fresh) {
    throw new UserAdminError("User not found.", 404);
  }

  if (input.status && input.status !== target.status) {
    await logActivity({
      actorId: actor.id,
      action: ACTIVITY_ACTIONS.STATUS_CHANGE,
      entityType: "user",
      entityId: fresh.id,
      metadata: { from: target.status, to: fresh.status },
    });
  }
  if (input.role && input.role !== target.role) {
    await logActivity({
      actorId: actor.id,
      action: ACTIVITY_ACTIONS.ROLE_CHANGE,
      entityType: "user",
      entityId: fresh.id,
      metadata: { from: target.role, to: fresh.role },
    });
  }
  if (input.firstName || input.lastName || phone !== undefined) {
    await logActivity({
      actorId: actor.id,
      action: ACTIVITY_ACTIONS.PROFILE_UPDATE,
      entityType: "user",
      entityId: fresh.id,
      metadata: { via: "admin_console" },
    });
  }
  if (passwordHash) {
    await logActivity({
      actorId: actor.id,
      action: ACTIVITY_ACTIONS.PASSWORD_RESET,
      entityType: "user",
      entityId: fresh.id,
      metadata: { via: "admin_console" },
    });
  }

  return toUserProfile(fresh);
}
