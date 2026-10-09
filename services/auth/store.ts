/**
 * Local durable auth data store.
 * Used when Supabase is not configured so OTP auth works end-to-end in development.
 * Production should use Supabase Auth + PostgreSQL tables from database/migrations.
 */

import path from "path";

import { canonicalDemoEmail, demoEmailsEquivalent } from "@/constants/demo-accounts";
import { dataDir, readJsonFile, writeJsonFile } from "@/lib/data/json-file-store";
import {
  getUserByEmail,
  getUserById,
  getUserByPhone,
  listAllSessions,
  listAllUsers,
  replaceAllSessions,
  replaceAllUsers,
} from "@/lib/data/auth-identity-store";
import {
  listAllActivityLogs,
  listAllAuditLogs,
  replaceAllActivityLogs,
  replaceAllAuditLogs,
} from "@/lib/data/auth-activity-store";
import { listAllNotifications, replaceAllNotifications } from "@/lib/data/auth-notification-store";
import {
  listAllNotificationPreferences,
  listAllSecuritySettings,
  replaceAllNotificationPreferences,
  replaceAllSecuritySettings,
} from "@/lib/data/auth-settings-store";
import type {
  ActivityLogRecord,
  AuditLogRecord,
  NotificationRecord,
  SessionRecord,
  UserProfile,
} from "@/types";
import type { AccountStatus } from "@/constants/account-status";
import type { Role } from "@/constants/roles";

export interface StoredUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  countryCode: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  city: string | null;
  bio: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  avatarUrl: string | null;
  timezone: string;
  language: string;
  role: Role;
  status: AccountStatus;
  emailVerified: boolean;
  profileComplete: boolean;
  mustChangePassword: boolean;
  passwordHash: string | null;
  passwordSalt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PasswordSetupToken {
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface OtpChallenge {
  id: string;
  email: string;
  userId: string | null;
  purpose:
    | "login"
    | "register"
    | "reset_password"
    | "verify_email"
    | "booking"
    | "change_email"
    | "two_factor"
    | "sensitive_action";
  codeHash: string;
  status: "pending" | "verified" | "expired" | "locked" | "consumed";
  attempts: number;
  maxAttempts: number;
  resendCount: number;
  rememberMe: boolean;
  lockedUntil: string | null;
  resendAvailableAt: string | null;
  pendingRegistrationId: string | null;
  meta: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  deviceFingerprint: string | null;
  deviceLabel: string | null;
  expiresAt: string;
  verifiedAt: string | null;
  createdAt: string;
}

/** Pre-verification registration payload — account is not active until OTP succeeds. */
export interface PendingRegistration {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  countryCode: string;
  nationality: string;
  passwordHash: string;
  passwordSalt: string;
  role: Role;
  acceptTermsAt: string;
  acceptPrivacyAt: string;
  marketingConsent: boolean;
  timezone: string;
  language: string;
  rememberMe: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  emailTransactional: boolean;
  emailMarketing: boolean;
  emailProductUpdates: boolean;
  inAppEnabled: boolean;
  /** Channel toggles */
  emailEnabled: boolean;
  pushEnabled: boolean;
  marketingEnabled: boolean;
  reminderEnabled: boolean;
  securityEnabled: boolean;
  courseEnabled: boolean;
  bookingEnabled: boolean;
  paymentEnabled: boolean;
  messageEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserSecuritySettings {
  userId: string;
  twoFactorEnabled: boolean;
  loginAlertsEnabled: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AuthDatabase {
  users: StoredUser[];
  sessions: SessionRecord[];
  otps: OtpChallenge[];
  passwordSetupTokens: PasswordSetupToken[];
  pendingRegistrations: PendingRegistration[];
  notificationPreferences: NotificationPreferences[];
  securitySettings: UserSecuritySettings[];
  notifications: NotificationRecord[];
  activityLogs: ActivityLogRecord[];
  auditLogs: AuditLogRecord[];
  seeded: boolean;
}

const DATA_FILE = path.join(dataDir(), "aep-auth.json");

/** Lifetime bound so activity/audit history cannot inflate the auth store. */
export const AUTH_LOG_CAP = 400;
/** Lifetime bound so used / expired setup tokens cannot inflate the catalog. */
export const AUTH_TOKEN_CAP = 80;

const emptyDb = (): AuthDatabase => ({
  users: [],
  sessions: [],
  otps: [],
  passwordSetupTokens: [],
  pendingRegistrations: [],
  notificationPreferences: [],
  securitySettings: [],
  notifications: [],
  activityLogs: [],
  auditLogs: [],
  seeded: false,
});

function catalogSnapshot(db: AuthDatabase): AuthDatabase {
  return {
    users: [],
    sessions: [],
    otps: db.otps,
    passwordSetupTokens: db.passwordSetupTokens,
    pendingRegistrations: db.pendingRegistrations,
    notificationPreferences: [],
    securitySettings: [],
    notifications: [],
    activityLogs: [],
    auditLogs: [],
    seeded: db.seeded,
  };
}

function persistCatalog(db: AuthDatabase): void {
  writeJsonFile(
    DATA_FILE,
    catalogSnapshot({
      ...db,
      passwordSetupTokens: trimPasswordSetupTokens(db.passwordSetupTokens ?? []),
    }),
  );
}

function trimPasswordSetupTokens(tokens: PasswordSetupToken[]): PasswordSetupToken[] {
  const now = Date.now();
  return tokens
    .filter((token) => !token.consumedAt && Date.parse(token.expiresAt) > now)
    .slice(0, AUTH_TOKEN_CAP);
}

function extractEmbeddedIdentity(db: AuthDatabase): void {
  const embeddedUsers = (db.users ?? []).map(normalizeStoredUser);
  const embeddedSessions = (db.sessions ?? []).map(normalizeSession);
  if (embeddedUsers.length === 0 && embeddedSessions.length === 0) return;
  if (embeddedUsers.length > 0) {
    const existing = listAllUsers();
    replaceAllUsers(existing.length > 0 ? [...existing, ...embeddedUsers] : embeddedUsers);
    db.users = [];
  }
  if (embeddedSessions.length > 0) {
    const existing = listAllSessions();
    replaceAllSessions(existing.length > 0 ? [...existing, ...embeddedSessions] : embeddedSessions);
    db.sessions = [];
  }
  persistCatalog(db);
}

function extractEmbeddedNotifications(db: AuthDatabase): void {
  const embedded = db.notifications ?? [];
  if (embedded.length === 0) return;
  const existing = listAllNotifications();
  replaceAllNotifications(existing.length > 0 ? [...existing, ...embedded] : embedded);
  db.notifications = [];
  persistCatalog(db);
}

function extractEmbeddedLeftover(db: AuthDatabase): void {
  const embeddedActivity = db.activityLogs ?? [];
  const embeddedAudit = db.auditLogs ?? [];
  const embeddedPrefs = db.notificationPreferences ?? [];
  const embeddedSecurity = db.securitySettings ?? [];
  if (
    embeddedActivity.length === 0 &&
    embeddedAudit.length === 0 &&
    embeddedPrefs.length === 0 &&
    embeddedSecurity.length === 0
  ) {
    return;
  }
  if (embeddedActivity.length > 0) {
    const existing = listAllActivityLogs();
    replaceAllActivityLogs(
      existing.length > 0 ? [...existing, ...embeddedActivity] : embeddedActivity,
    );
    db.activityLogs = [];
  }
  if (embeddedAudit.length > 0) {
    const existing = listAllAuditLogs();
    replaceAllAuditLogs(existing.length > 0 ? [...existing, ...embeddedAudit] : embeddedAudit);
    db.auditLogs = [];
  }
  if (embeddedPrefs.length > 0) {
    const existing = listAllNotificationPreferences();
    replaceAllNotificationPreferences(
      existing.length > 0 ? [...existing, ...embeddedPrefs] : embeddedPrefs,
    );
    db.notificationPreferences = [];
  }
  if (embeddedSecurity.length > 0) {
    const existing = listAllSecuritySettings();
    replaceAllSecuritySettings(
      existing.length > 0 ? [...existing, ...embeddedSecurity] : embeddedSecurity,
    );
    db.securitySettings = [];
  }
  persistCatalog(db);
}

function withNotificationView(db: AuthDatabase): AuthDatabase {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "notifications") return listAllNotifications();
      if (prop === "users") return listAllUsers();
      if (prop === "sessions") return listAllSessions();
      if (prop === "activityLogs") return listAllActivityLogs();
      if (prop === "auditLogs") return listAllAuditLogs();
      if (prop === "notificationPreferences") return listAllNotificationPreferences();
      if (prop === "securitySettings") return listAllSecuritySettings();
      return Reflect.get(target, prop, receiver);
    },
  });
}

function withLazyNotificationWrites(catalog: AuthDatabase): {
  working: AuthDatabase;
  flushNotifications: () => void;
} {
  let notificationsLoaded = false;
  let notifications: NotificationRecord[] = [];
  let usersLoaded = false;
  let users: StoredUser[] = [];
  let sessionsLoaded = false;
  let sessions: SessionRecord[] = [];
  let activityLoaded = false;
  let activityLogs: ActivityLogRecord[] = [];
  let auditLoaded = false;
  let auditLogs: AuditLogRecord[] = [];
  let prefsLoaded = false;
  let notificationPreferences: NotificationPreferences[] = [];
  let securityLoaded = false;
  let securitySettings: UserSecuritySettings[] = [];
  const working = {
    ...catalog,
    notifications: [],
    users: [],
    sessions: [],
    activityLogs: [],
    auditLogs: [],
    notificationPreferences: [],
    securitySettings: [],
  };
  Object.defineProperty(working, "notifications", {
    configurable: true,
    enumerable: true,
    get() {
      if (!notificationsLoaded) {
        notifications = listAllNotifications();
        notificationsLoaded = true;
      }
      return notifications;
    },
    set(value: NotificationRecord[]) {
      notifications = Array.isArray(value) ? value : [];
      notificationsLoaded = true;
    },
  });
  Object.defineProperty(working, "users", {
    configurable: true,
    enumerable: true,
    get() {
      if (!usersLoaded) {
        users = listAllUsers();
        usersLoaded = true;
      }
      return users;
    },
    set(value: StoredUser[]) {
      users = Array.isArray(value) ? value : [];
      usersLoaded = true;
    },
  });
  Object.defineProperty(working, "sessions", {
    configurable: true,
    enumerable: true,
    get() {
      if (!sessionsLoaded) {
        sessions = listAllSessions();
        sessionsLoaded = true;
      }
      return sessions;
    },
    set(value: SessionRecord[]) {
      sessions = Array.isArray(value) ? value : [];
      sessionsLoaded = true;
    },
  });
  Object.defineProperty(working, "activityLogs", {
    configurable: true,
    enumerable: true,
    get() {
      if (!activityLoaded) {
        activityLogs = listAllActivityLogs();
        activityLoaded = true;
      }
      return activityLogs;
    },
    set(value: ActivityLogRecord[]) {
      activityLogs = Array.isArray(value) ? value : [];
      activityLoaded = true;
    },
  });
  Object.defineProperty(working, "auditLogs", {
    configurable: true,
    enumerable: true,
    get() {
      if (!auditLoaded) {
        auditLogs = listAllAuditLogs();
        auditLoaded = true;
      }
      return auditLogs;
    },
    set(value: AuditLogRecord[]) {
      auditLogs = Array.isArray(value) ? value : [];
      auditLoaded = true;
    },
  });
  Object.defineProperty(working, "notificationPreferences", {
    configurable: true,
    enumerable: true,
    get() {
      if (!prefsLoaded) {
        notificationPreferences = listAllNotificationPreferences();
        prefsLoaded = true;
      }
      return notificationPreferences;
    },
    set(value: NotificationPreferences[]) {
      notificationPreferences = Array.isArray(value) ? value : [];
      prefsLoaded = true;
    },
  });
  Object.defineProperty(working, "securitySettings", {
    configurable: true,
    enumerable: true,
    get() {
      if (!securityLoaded) {
        securitySettings = listAllSecuritySettings();
        securityLoaded = true;
      }
      return securitySettings;
    },
    set(value: UserSecuritySettings[]) {
      securitySettings = Array.isArray(value) ? value : [];
      securityLoaded = true;
    },
  });
  return {
    working,
    flushNotifications() {
      if (notificationsLoaded) replaceAllNotifications(notifications);
      if (usersLoaded) replaceAllUsers(users);
      if (sessionsLoaded) replaceAllSessions(sessions);
      if (activityLoaded) replaceAllActivityLogs(activityLogs);
      if (auditLoaded) replaceAllAuditLogs(auditLogs);
      if (prefsLoaded) replaceAllNotificationPreferences(notificationPreferences);
      if (securityLoaded) replaceAllSecuritySettings(securitySettings);
    },
  };
}

function ensureStore(): AuthDatabase {
  const parsed = {
    ...emptyDb(),
    ...readJsonFile<Partial<AuthDatabase>>(DATA_FILE, emptyDb),
  } as AuthDatabase;
  parsed.users = (parsed.users ?? []).map(normalizeStoredUser);
  parsed.sessions = (parsed.sessions ?? []).map(normalizeSession);
  parsed.otps = (parsed.otps ?? []).map(normalizeOtp);
  const rawTokens = parsed.passwordSetupTokens ?? [];
  parsed.passwordSetupTokens = trimPasswordSetupTokens(rawTokens);
  parsed.pendingRegistrations = parsed.pendingRegistrations ?? [];
  parsed.notificationPreferences = parsed.notificationPreferences ?? [];
  parsed.securitySettings = parsed.securitySettings ?? [];
  parsed.notifications = parsed.notifications ?? [];
  parsed.activityLogs = parsed.activityLogs ?? [];
  parsed.auditLogs = parsed.auditLogs ?? [];
  const trimmedTokens = rawTokens.length !== parsed.passwordSetupTokens.length;
  parsed.seeded = Boolean(parsed.seeded);
  const embeddedCount = parsed.notifications.length;
  const embeddedUsers = parsed.users.length;
  const embeddedLeftover =
    parsed.activityLogs.length +
    parsed.auditLogs.length +
    parsed.notificationPreferences.length +
    parsed.securitySettings.length;
  extractEmbeddedIdentity(parsed);
  extractEmbeddedNotifications(parsed);
  extractEmbeddedLeftover(parsed);
  parsed.users = [];
  parsed.sessions = [];
  parsed.notifications = [];
  parsed.activityLogs = [];
  parsed.auditLogs = [];
  parsed.notificationPreferences = [];
  parsed.securitySettings = [];
  if (trimmedTokens && embeddedCount === 0 && embeddedUsers === 0 && embeddedLeftover === 0) {
    persistCatalog(parsed);
  }
  return parsed;
}

/** Backfill fields added after early auth JSON snapshots. */
function normalizeOtp(otp: OtpChallenge): OtpChallenge {
  return {
    ...otp,
    userId: otp.userId ?? null,
    status: otp.status ?? "pending",
    maxAttempts: otp.maxAttempts ?? 5,
    resendCount: otp.resendCount ?? 0,
    lockedUntil: otp.lockedUntil ?? null,
    resendAvailableAt: otp.resendAvailableAt ?? null,
    pendingRegistrationId: otp.pendingRegistrationId ?? null,
    meta: otp.meta ?? {},
    ipAddress: otp.ipAddress ?? null,
    userAgent: otp.userAgent ?? null,
    deviceFingerprint: otp.deviceFingerprint ?? null,
    deviceLabel: otp.deviceLabel ?? null,
    verifiedAt: otp.verifiedAt ?? null,
  };
}

/** Backfill fields added after early auth JSON snapshots. */
function normalizeSession(session: SessionRecord): SessionRecord {
  return {
    ...session,
    deviceFingerprint: session.deviceFingerprint ?? null,
    deviceLabel: session.deviceLabel ?? null,
  };
}

/** Backfill fields added after early auth JSON snapshots. */
function normalizeStoredUser(user: StoredUser): StoredUser {
  return {
    ...user,
    phone: user.phone ?? null,
    countryCode: user.countryCode ?? null,
    nationality: user.nationality ?? null,
    dateOfBirth: user.dateOfBirth ?? null,
    gender: user.gender ?? null,
    city: user.city ?? null,
    bio: user.bio ?? null,
    emergencyContactName: user.emergencyContactName ?? null,
    emergencyContactPhone: user.emergencyContactPhone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    timezone: user.timezone || "UTC",
    language: user.language || "en",
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

export function readAuthDb(): AuthDatabase {
  return withNotificationView(ensureStore());
}

export function writeAuthDb(mutator: (db: AuthDatabase) => void): AuthDatabase {
  const catalog = ensureStore();
  const { working, flushNotifications } = withLazyNotificationWrites(catalog);
  mutator(working);
  flushNotifications();
  persistCatalog(working);
  return withNotificationView({
    users: [],
    sessions: [],
    otps: working.otps,
    passwordSetupTokens: working.passwordSetupTokens,
    pendingRegistrations: working.pendingRegistrations,
    notificationPreferences: [],
    securitySettings: [],
    notifications: [],
    activityLogs: [],
    auditLogs: [],
    seeded: working.seeded,
  });
}

export function toUserProfile(user: StoredUser): UserProfile {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName,
    phone: user.phone ?? null,
    countryCode: user.countryCode ?? null,
    nationality: user.nationality ?? null,
    dateOfBirth: user.dateOfBirth ?? null,
    gender: user.gender ?? null,
    city: user.city ?? null,
    bio: user.bio ?? null,
    emergencyContactName: user.emergencyContactName ?? null,
    emergencyContactPhone: user.emergencyContactPhone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    timezone: user.timezone || "UTC",
    language: user.language || "en",
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    profileComplete: user.profileComplete,
    mustChangePassword: Boolean(user.mustChangePassword),
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/** Student accounts need contact + identity basics before the learning console. */
export function isStudentProfileComplete(
  user: Pick<
    StoredUser,
    "firstName" | "lastName" | "phone" | "countryCode" | "nationality" | "role"
  >,
): boolean {
  if (user.role !== "student") {
    return Boolean(user.firstName && user.lastName);
  }
  return Boolean(
    user.firstName &&
    user.lastName &&
    user.phone &&
    user.phone.trim().length >= 7 &&
    user.countryCode &&
    user.nationality &&
    user.nationality.trim().length >= 2,
  );
}

export function findUserByEmail(email: string): StoredUser | null {
  const normalized = email.trim().toLowerCase();
  const exact = getUserByEmail(normalized);
  if (exact) return exact;
  const canonical = canonicalDemoEmail(email);
  if (canonical !== normalized) {
    const byCanonical = getUserByEmail(canonical);
    if (byCanonical) return byCanonical;
  }
  if (normalized.includes("aviatorpass") || normalized.includes("demo")) {
    return listAllUsers().find((user) => demoEmailsEquivalent(user.email, email)) ?? null;
  }
  return null;
}

export function findUserByPhone(phone: string): StoredUser | null {
  return getUserByPhone(phone);
}

export function findUserById(id: string): StoredUser | null {
  return getUserById(id);
}

export function findPendingRegistrationByEmail(email: string): PendingRegistration | null {
  const db = readAuthDb();
  const now = Date.now();
  return (
    db.pendingRegistrations.find(
      (p) => p.email.toLowerCase() === email.toLowerCase() && new Date(p.expiresAt).getTime() > now,
    ) ?? null
  );
}

export function findPendingRegistrationById(id: string): PendingRegistration | null {
  const db = readAuthDb();
  return db.pendingRegistrations.find((p) => p.id === id) ?? null;
}

export function defaultNotificationPreferences(
  userId: string,
  marketingConsent: boolean,
): NotificationPreferences {
  const ts = new Date().toISOString();
  return {
    userId,
    emailTransactional: true,
    emailMarketing: Boolean(marketingConsent),
    emailProductUpdates: Boolean(marketingConsent),
    inAppEnabled: true,
    emailEnabled: true,
    pushEnabled: false,
    marketingEnabled: Boolean(marketingConsent),
    reminderEnabled: true,
    securityEnabled: true,
    courseEnabled: true,
    bookingEnabled: true,
    paymentEnabled: true,
    messageEnabled: true,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function defaultSecuritySettings(userId: string): UserSecuritySettings {
  const ts = new Date().toISOString();
  return {
    userId,
    twoFactorEnabled: false,
    loginAlertsEnabled: true,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: ts,
    updatedAt: ts,
  };
}
