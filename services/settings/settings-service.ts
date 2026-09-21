/**
 * Platform settings service — get/update with audit logging.
 */

import { logAudit, logActivity } from "@/services/auth/activity-log";
import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import {
  getStoredSettings,
  patchStoredSettings,
  readSettingsDb,
  writeSettingsDb,
} from "@/services/settings/store";
import { DEFAULT_PLATFORM_SETTINGS } from "@/services/settings/defaults";
import type {
  PlatformSettings,
  SettingsCategory,
  GeneralSettings,
  BrandingSettings,
  EmailSettings,
  NotificationSettings,
  AuthenticationSettings,
  UserManagementSettings,
  SecuritySettings,
  StorageSettings,
  LocalizationSettings,
  FeatureFlags,
  ZoomIntegrationSettings,
  CourseCatalogSettings,
} from "@/types/settings";

export type CategoryPatch = {
  general?: Partial<GeneralSettings>;
  branding?: Partial<BrandingSettings>;
  email?: Partial<EmailSettings>;
  notifications?: Partial<NotificationSettings>;
  authentication?: Partial<AuthenticationSettings>;
  users?: Partial<UserManagementSettings>;
  security?: Partial<SecuritySettings>;
  storage?: Partial<StorageSettings>;
  localization?: Partial<LocalizationSettings>;
  features?: Partial<FeatureFlags>;
  zoom?: Partial<ZoomIntegrationSettings>;
  courses?: Partial<CourseCatalogSettings>;
};

function envTrim(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function parseSenderAddress(raw: string | undefined): { email?: string; name?: string } {
  if (!raw) return {};
  const trimmed = raw.trim();
  const angled = trimmed.match(/^(.*)<([^>]+)>$/);
  if (angled) {
    return { name: angled[1]?.trim().replace(/^"|"$/g, "") || undefined, email: angled[2]?.trim() };
  }
  return { email: trimmed };
}

/** Env SMTP/Resend wins over stored settings so production can be configured without a writable UI. */
export function applyRuntimeEmailOverrides(settings: PlatformSettings): PlatformSettings {
  const host = envTrim("SMTP_HOST");
  const portRaw = envTrim("SMTP_PORT");
  const user = envTrim("SMTP_USER") || envTrim("SMTP_USERNAME");
  const pass = process.env.SMTP_PASSWORD?.length ? process.env.SMTP_PASSWORD : undefined;
  const fromRaw = envTrim("SMTP_FROM") || envTrim("EMAIL_FROM");
  const parsedFrom = parseSenderAddress(fromRaw);
  const from = parsedFrom.email;
  const fromName = envTrim("SMTP_FROM_NAME") || envTrim("EMAIL_FROM_NAME") || parsedFrom.name;
  const providerRaw = (envTrim("EMAIL_PROVIDER") || "").toLowerCase();
  const adminEmail = envTrim("ADMIN_NOTIFICATION_EMAIL");
  const hasSmtp = Boolean(host);
  const hasResend = Boolean(envTrim("RESEND_API_KEY"));

  if (!hasSmtp && !hasResend && !from && !fromName && !providerRaw && !adminEmail) {
    return settings;
  }

  const provider: PlatformSettings["email"]["provider"] =
    providerRaw === "resend" ||
    providerRaw === "smtp" ||
    providerRaw === "sendgrid" ||
    providerRaw === "mailgun" ||
    providerRaw === "ses"
      ? providerRaw
      : hasSmtp
        ? "smtp"
        : hasResend
          ? "resend"
          : settings.email.provider;

  return {
    ...settings,
    email: {
      ...settings.email,
      provider,
      smtpHost: host || settings.email.smtpHost,
      smtpPort: portRaw ? Number(portRaw) || settings.email.smtpPort : settings.email.smtpPort,
      smtpUsername: user || settings.email.smtpUsername,
      smtpPassword: pass || settings.email.smtpPassword,
      senderEmail: from || settings.email.senderEmail,
      senderName: fromName || settings.email.senderName,
      adminNotificationEmail: adminEmail || settings.email.adminNotificationEmail || "",
    },
  };
}

export type AdminNotificationEmailSource =
  "env" | "settings" | "support" | "super_admin" | "contact" | null;

function usableEmail(value: string | undefined | null): string | null {
  const email = value?.trim() ?? "";
  if (!email || !email.includes("@")) return null;
  return email;
}

/**
 * Inbox that receives registration / purchase / payment / invoice / refund copies.
 * Env wins, then Super Admin settings, then support, Super Admin, and contact.
 */
export function resolveAdminNotificationEmail(settings: PlatformSettings = getStoredSettings()): {
  email: string | null;
  source: AdminNotificationEmailSource;
} {
  const fromEnv = usableEmail(process.env.ADMIN_NOTIFICATION_EMAIL);
  if (fromEnv) return { email: fromEnv, source: "env" };

  const fromSettings = usableEmail(settings.email.adminNotificationEmail);
  if (fromSettings) return { email: fromSettings, source: "settings" };

  const fromSupport = usableEmail(settings.general.supportEmail);
  if (fromSupport) return { email: fromSupport, source: "support" };

  const fromSuperAdmin = usableEmail(process.env.SUPER_ADMIN_EMAIL || "superadmin@aviatorpass.com");
  if (fromSuperAdmin) return { email: fromSuperAdmin, source: "super_admin" };

  const fromContact = usableEmail(settings.general.contactEmail);
  if (fromContact) return { email: fromContact, source: "contact" };

  return { email: null, source: null };
}

function persistAdminNotificationDefault() {
  const stored = getStoredSettings();
  if (usableEmail(stored.email.adminNotificationEmail)) return;
  const resolved = resolveAdminNotificationEmail(stored);
  if (!resolved.email || resolved.source === "env") return;
  writeSettingsDb((db) => {
    if (usableEmail(db.settings.email.adminNotificationEmail)) return;
    db.settings.email.adminNotificationEmail = resolved.email as string;
    db.settings.updatedAt = new Date().toISOString();
  });
}

export function getAdminNotificationEmail(): string | null {
  const email = getPlatformSettings().email.adminNotificationEmail?.trim();
  return email || null;
}

export function getPlatformSettings(): PlatformSettings {
  persistAdminNotificationDefault();
  const settings = applyRuntimeEmailOverrides(getStoredSettings());
  const admin = resolveAdminNotificationEmail(settings);
  const configured = Boolean(
    process.env.ZOOM_ACCOUNT_ID?.trim() &&
    process.env.ZOOM_CLIENT_ID?.trim() &&
    process.env.ZOOM_CLIENT_SECRET?.trim(),
  );
  return {
    ...settings,
    email: {
      ...settings.email,
      adminNotificationEmail: admin.email ?? "",
    },
    zoom: {
      ...settings.zoom,
      credentialsConfigured: configured,
    },
  };
}

export function getSettingsCategory<K extends SettingsCategory>(category: K): PlatformSettings[K] {
  return getStoredSettings()[category];
}

export async function updatePlatformSettings(input: {
  patch: CategoryPatch;
  actorId: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<PlatformSettings> {
  const before = getStoredSettings();
  patchStoredSettings(input.patch as Partial<PlatformSettings>, input.actorId);
  const next = getPlatformSettings();

  await logAudit({
    actorId: input.actorId,
    action: "settings.update",
    resource: "platform_settings",
    beforeState: before as unknown as Record<string, unknown>,
    afterState: next as unknown as Record<string, unknown>,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  await logActivity({
    actorId: input.actorId,
    action: ACTIVITY_ACTIONS.SETTINGS_UPDATE,
    entityType: "settings",
    entityId: "platform",
    metadata: { categories: Object.keys(input.patch) },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return next;
}

export function listSettingsHistory(limit = 50) {
  return readSettingsDb().history.slice(0, limit);
}

export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  const features = getStoredSettings().features;
  if (features[flag] === undefined) {
    return Boolean(DEFAULT_PLATFORM_SETTINGS.features[flag]);
  }
  return Boolean(features[flag]);
}

export function isMaintenanceMode(): boolean {
  return getStoredSettings().general.maintenanceMode;
}

/** Resolve public branding for layouts/metadata without exposing secrets. */
export function getPublicBrandConfig() {
  const s = getStoredSettings();
  return {
    platformName: s.general.platformName,
    companyName: s.general.companyName,
    contactEmail: s.general.contactEmail,
    supportEmail: s.general.supportEmail,
    websiteUrl: s.general.websiteUrl,
    locations: s.general.primaryLocations,
    socialHandle: s.general.socialHandle,
    socialLinks: s.general.socialLinks,
    footerText: s.general.footerText,
    logoUrl: s.branding.logoUrl,
    darkLogoUrl: s.branding.darkLogoUrl,
    faviconUrl: s.branding.faviconUrl,
    openGraphImageUrl: s.branding.openGraphImageUrl,
    primaryColor: s.branding.primaryColor,
    accentColor: s.branding.accentColor,
    language: s.localization.language,
    englishOnly: s.localization.englishOnly,
    metaDescription:
      s.general.footerText ||
      "Aviator Pass — a complete aviation education platform with EASA Certified Instructors.",
    pending: {
      brandGuidelines: s.branding.brandGuidelinesPending,
      colorPalette: s.branding.colorPalettePending,
      typography: s.branding.typographyPending,
      styleGuide: s.branding.styleGuidePending,
    },
    features: s.features,
  };
}
