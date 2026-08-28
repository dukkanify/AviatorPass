/**
 * Demo user seeder for local LMS / dashboard population.
 * Permanent accounts are defined in constants/demo-accounts.ts.
 */

import {
  DEMO_ACCOUNT_PASSWORD,
  DEMO_ACCOUNTS,
  demoAvatarDataUri,
  remapLegacyDemoEmail,
  rewriteLegacyDemoEmailsInText,
  type DemoAccountDefinition,
} from "@/constants/demo-accounts";
import { ACCOUNT_STATUS } from "@/constants/account-status";
import { ROLES } from "@/constants/roles";
import { hashPassword, stableId } from "@/lib/security/crypto";
import { ensureSuperAdminSeeded } from "@/services/auth/seed";
import {
  isStudentProfileComplete,
  readAuthDb,
  writeAuthDb,
  type StoredUser,
} from "@/services/auth/store";
import {
  LEGACY_CLIENT_NAME_RE,
  LEGACY_JOURNEY_STUDENT_EMAIL,
  stripLegacyClientName,
} from "@/lib/branding/legacy-client-identity";

function migrateLegacyClientIdentities(): void {
  const snapshot = readAuthDb();
  const needsUserFix = snapshot.users.some((user) => {
    const mapped = user.email.toLowerCase() === LEGACY_JOURNEY_STUDENT_EMAIL;
    const blob = `${user.firstName} ${user.lastName} ${user.bio ?? ""}`;
    return mapped || LEGACY_CLIENT_NAME_RE.test(blob);
  });
  const needsNoteFix = snapshot.notifications.some((n) =>
    LEGACY_CLIENT_NAME_RE.test(`${n.title} ${n.body}`),
  );
  if (!needsUserFix && !needsNoteFix) return;

  writeAuthDb((d) => {
    for (const user of d.users) {
      if (user.email.toLowerCase() === LEGACY_JOURNEY_STUDENT_EMAIL) {
        user.email = "student.journey@aviatorpass.com";
      }
      const def = DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === user.email.toLowerCase());
      const blob = `${user.firstName} ${user.lastName} ${user.bio ?? ""}`;
      if (LEGACY_CLIENT_NAME_RE.test(blob) && def) {
        user.firstName = def.firstName;
        user.lastName = def.lastName;
        user.bio = def.bio;
      }
    }
    for (const note of d.notifications) {
      const text = `${note.title} ${note.body}`;
      if (!LEGACY_CLIENT_NAME_RE.test(text)) continue;
      note.body = stripLegacyClientName(note.body, "your AviatorPass instructor");
      note.title = stripLegacyClientName(note.title, "Instructor");
    }
  });
}

function migrateLegacyDemoEmails(): void {
  const snapshot = readAuthDb();
  const userNeedsRewrite = snapshot.users.some(
    (user) => remapLegacyDemoEmail(user.email).toLowerCase() !== user.email.toLowerCase(),
  );
  const otpNeedsRewrite = snapshot.otps.some(
    (otp) => remapLegacyDemoEmail(otp.email).toLowerCase() !== otp.email.toLowerCase(),
  );
  const tokenNeedsRewrite = snapshot.passwordSetupTokens.some(
    (token) => remapLegacyDemoEmail(token.email).toLowerCase() !== token.email.toLowerCase(),
  );
  const pendingNeedsRewrite = snapshot.pendingRegistrations.some(
    (pending) => remapLegacyDemoEmail(pending.email).toLowerCase() !== pending.email.toLowerCase(),
  );
  const noteNeedsRewrite = snapshot.notifications.some((note) => {
    const text = `${note.title} ${note.body}`;
    return rewriteLegacyDemoEmailsInText(text) !== text;
  });
  if (
    !userNeedsRewrite &&
    !otpNeedsRewrite &&
    !tokenNeedsRewrite &&
    !pendingNeedsRewrite &&
    !noteNeedsRewrite
  ) {
    return;
  }

  writeAuthDb((d) => {
    const removeIds = new Set<string>();
    for (const user of d.users) {
      if (removeIds.has(user.id)) continue;
      const next = remapLegacyDemoEmail(user.email);
      if (next.toLowerCase() === user.email.toLowerCase()) continue;
      const occupant = d.users.find(
        (other) =>
          other.id !== user.id &&
          !removeIds.has(other.id) &&
          other.email.toLowerCase() === next.toLowerCase(),
      );
      if (occupant) {
        const isDemoMailbox = DEMO_ACCOUNTS.some((account) => account.email === next.toLowerCase());
        if (!isDemoMailbox) continue;
        removeIds.add(occupant.id);
      }
      user.email = next;
      user.updatedAt = new Date().toISOString();
    }
    if (removeIds.size > 0) {
      d.users = d.users.filter((user) => !removeIds.has(user.id));
    }
    for (const otp of d.otps) {
      otp.email = remapLegacyDemoEmail(otp.email);
    }
    for (const token of d.passwordSetupTokens) {
      token.email = remapLegacyDemoEmail(token.email);
    }
    for (const pending of d.pendingRegistrations) {
      pending.email = remapLegacyDemoEmail(pending.email);
    }
    for (const note of d.notifications) {
      note.title = rewriteLegacyDemoEmailsInText(note.title);
      note.body = rewriteLegacyDemoEmailsInText(note.body);
    }
  });
}

export function ensureDemoUsersSeeded(): void {
  ensureSuperAdminSeeded();
  migrateLegacyClientIdentities();
  migrateLegacyDemoEmails();
  const emails = new Set(readAuthDb().users.map((u) => u.email.toLowerCase()));
  if (DEMO_ACCOUNTS.every((d) => emails.has(d.email.toLowerCase()))) {
    return;
  }
  upsertDemoCatalogUsers({ reactivatePermanent: false });
}

/**
 * Force-refresh permanent demo accounts (profiles, avatars, passwords, active status).
 * Does not override a Super Admin suspension of non-permanent accounts.
 */
export function resetPermanentDemoAccounts(options?: { password?: string }): void {
  ensureSuperAdminSeeded();
  upsertDemoCatalogUsers({
    reactivatePermanent: true,
    forceProfile: true,
    password: options?.password ?? DEMO_ACCOUNT_PASSWORD,
  });
}

function upsertDemoCatalogUsers(options: {
  reactivatePermanent: boolean;
  forceProfile?: boolean;
  password?: string;
}): void {
  const now = new Date().toISOString();
  const password = options.password ?? DEMO_ACCOUNT_PASSWORD;
  const { hash, salt } = hashPassword(password);

  writeAuthDb((d) => {
    for (const def of DEMO_ACCOUNTS) {
      const existing = d.users.find((u) => u.email === def.email);
      if (!existing) {
        d.users.push(buildStoredUser(def, now, hash, salt));
        continue;
      }

      const shouldRefresh =
        options.forceProfile ||
        !existing.avatarUrl ||
        !existing.phone ||
        existing.timezone === "UTC" ||
        !existing.passwordHash;

      if (shouldRefresh || options.reactivatePermanent) {
        applyDemoProfile(existing, def, now, {
          reactivate: options.reactivatePermanent && def.permanent,
          setPassword: Boolean(options.forceProfile || !existing.passwordHash),
          hash,
          salt,
        });
      }
    }

    // Keep Super Admin email from env aligned with permanent demo profile when present.
    const superAdmin = d.users.find((u) => u.role === ROLES.SUPER_ADMIN);
    if (superAdmin && options.forceProfile) {
      if (!superAdmin.avatarUrl) {
        superAdmin.avatarUrl = demoAvatarDataUri(
          `${superAdmin.firstName?.[0] ?? "S"}${superAdmin.lastName?.[0] ?? "A"}`,
        );
      }
      if (!superAdmin.passwordHash) {
        superAdmin.passwordHash = hash;
        superAdmin.passwordSalt = salt;
      }
      if (options.reactivatePermanent) {
        superAdmin.status = ACCOUNT_STATUS.ACTIVE;
        superAdmin.emailVerified = true;
        superAdmin.profileComplete = true;
      }
      superAdmin.updatedAt = now;
    }
  });
}

function buildStoredUser(
  def: DemoAccountDefinition,
  now: string,
  hash: string,
  salt: string,
): StoredUser {
  const initials = `${def.firstName[0] ?? "A"}${def.lastName[0] ?? "P"}`;
  const user: StoredUser = {
    id: stableId("user", def.email),
    email: def.email,
    firstName: def.firstName,
    lastName: def.lastName,
    phone: def.phone,
    countryCode: def.countryCode,
    nationality: def.nationality,
    dateOfBirth: def.dateOfBirth,
    gender: def.gender,
    city: def.city,
    bio: def.bio,
    emergencyContactName: def.emergencyContactName,
    emergencyContactPhone: def.emergencyContactPhone,
    avatarUrl: demoAvatarDataUri(initials),
    timezone: def.timezone,
    language: def.language,
    role: def.role,
    status: def.status,
    emailVerified: def.emailVerified,
    profileComplete: def.profileComplete,
    mustChangePassword: false,
    passwordHash: hash,
    passwordSalt: salt,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  };
  if (def.role === ROLES.STUDENT) {
    user.profileComplete = isStudentProfileComplete(user);
  }
  return user;
}

function applyDemoProfile(
  user: StoredUser,
  def: DemoAccountDefinition,
  now: string,
  opts: {
    reactivate: boolean;
    setPassword: boolean;
    hash: string;
    salt: string;
  },
): void {
  user.firstName = def.firstName;
  user.lastName = def.lastName;
  user.phone = def.phone;
  user.countryCode = def.countryCode;
  user.nationality = def.nationality;
  user.dateOfBirth = def.dateOfBirth;
  user.gender = def.gender;
  user.city = def.city;
  user.bio = def.bio;
  user.emergencyContactName = def.emergencyContactName;
  user.emergencyContactPhone = def.emergencyContactPhone;
  user.timezone = def.timezone;
  user.language = def.language;
  user.role = def.role;
  user.emailVerified = def.emailVerified;
  user.avatarUrl =
    user.avatarUrl ?? demoAvatarDataUri(`${def.firstName[0] ?? "A"}${def.lastName[0] ?? "P"}`);

  if (opts.reactivate) {
    user.status = ACCOUNT_STATUS.ACTIVE;
  } else if (user.status !== ACCOUNT_STATUS.SUSPENDED && user.status !== ACCOUNT_STATUS.INACTIVE) {
    user.status = def.status;
  }

  if (opts.setPassword) {
    user.passwordHash = opts.hash;
    user.passwordSalt = opts.salt;
  }

  user.profileComplete =
    def.role === ROLES.STUDENT ? isStudentProfileComplete(user) : def.profileComplete;
  user.updatedAt = now;
}
