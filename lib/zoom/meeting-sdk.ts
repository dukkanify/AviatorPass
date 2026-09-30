import { createHmac } from "crypto";

export type InAppMeetingMode = "sdk" | "classroom";

export function isExternalZoomUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value, "https://www.aviatorpass.com");
    return /(^|\.)zoom\.us$/i.test(url.hostname);
  } catch {
    return /zoom\.us/i.test(value);
  }
}

export function extractZoomMeetingNumber(
  joinUrl?: string | null,
  meetingNumber?: string | null,
): string {
  const explicit = meetingNumber?.replace(/\D/g, "") ?? "";
  if (explicit) return explicit;
  if (!joinUrl) return "";
  try {
    const url = new URL(joinUrl, "https://www.aviatorpass.com");
    return url.pathname.match(/\/(?:j|s|wc)\/(\d+)/)?.[1] ?? "";
  } catch {
    return joinUrl.match(/\/(?:j|s|wc)\/(\d+)/)?.[1] ?? "";
  }
}

export function extractZoomPassword(joinUrl?: string | null, password?: string | null): string {
  if (password) return password;
  if (!joinUrl) return "";
  try {
    return new URL(joinUrl, "https://www.aviatorpass.com").searchParams.get("pwd") ?? "";
  } catch {
    return "";
  }
}

export function zakFromStartUrl(startUrl?: string | null): string | null {
  if (!startUrl) return null;
  try {
    return new URL(startUrl, "https://www.aviatorpass.com").searchParams.get("zak");
  } catch {
    return /[?&]zak=([^&]+)/.exec(startUrl)?.[1] ?? null;
  }
}

export function displayMeetingName(user: {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const full = user.fullName?.trim();
  if (full) return full;
  const parts = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (parts) return parts;
  const email = user.email?.trim() ?? "";
  return email.split("@")[0] || "AviatorPass student";
}

export function resolveInAppMeetingMode(input: {
  providerMode?: string | null;
  meetingNumber?: string | null;
  hasSdkCredentials: boolean;
}): InAppMeetingMode {
  if (!input.hasSdkCredentials) return "classroom";
  if ((input.providerMode ?? "").toLowerCase() === "mock") return "classroom";
  const meetingNumber = (input.meetingNumber ?? "").replace(/\D/g, "");
  if (meetingNumber.length < 9) return "classroom";
  return "sdk";
}

export function generateMeetingSdkSignature(input: {
  sdkKey: string;
  sdkSecret: string;
  meetingNumber: string;
  role: 0 | 1;
  nowSec?: number;
}): string {
  const iat = (input.nowSec ?? Math.floor(Date.now() / 1000)) - 30;
  const exp = iat + 60 * 60 * 2;
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    appKey: input.sdkKey,
    sdkKey: input.sdkKey,
    mn: input.meetingNumber,
    role: input.role,
    iat,
    exp,
    tokenExp: exp,
  };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", input.sdkSecret).update(data).digest("base64url");
  return `${data}.${signature}`;
}
