/**
 * Where a dashboard notification should open.
 * Stored action URLs from older events are rewritten onto pages that exist.
 */

export interface NotificationHrefInput {
  actionUrl?: string | null;
  type?: string | null;
  data?: Record<string, unknown> | null;
}

function isSafeAppPath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\");
}

function liveClassId(data?: Record<string, unknown> | null): string | null {
  const id = data?.liveClassId;
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  if (!/^[a-zA-Z0-9_-]{8,}$/.test(trimmed)) return null;
  return trimmed;
}

function classHref(segment: string, classId: string): string {
  if (segment === "admin") return `/admin/classes/${classId}`;
  if (segment === "super-admin") return `/super-admin/classes/${classId}`;
  if (segment === "cgi") return "/cgi/lectures";
  return `/join/${classId}`;
}

function homeHref(segment: string): string {
  if (segment === "admin") return "/admin/dashboard";
  if (segment === "super-admin") return "/super-admin/dashboard";
  if (segment === "cgi") return "/cgi/dashboard";
  if (segment === "instructor") return "/instructor/dashboard";
  return "/student/dashboard";
}

function paymentsHref(segment: string): string {
  if (segment === "admin") return "/admin/payments";
  if (segment === "super-admin") return "/super-admin/payments";
  return "/student/billing";
}

export function notificationTargetHref(
  record: NotificationHrefInput,
  roleSegment: string,
): string | null {
  const segment = roleSegment || "student";
  let href = record.actionUrl?.trim() ?? "";

  if (href.startsWith("http://") || href.startsWith("https://")) {
    try {
      const url = new URL(href);
      href = url.pathname.startsWith("/join/") ? `${url.pathname}${url.search}` : "";
    } catch {
      href = "";
    }
  }

  const classId = liveClassId(record.data);
  const type = record.type ?? "";

  if (href === "/student/payments" || href.startsWith("/student/payments?")) {
    href = `/student/billing${href.slice("/student/payments".length)}`;
  }

  if (href === "/super-admin" || href === "/super-admin/") {
    href = classId ? classHref(segment, classId) : homeHref(segment);
  }

  if (href === "/support" || href.startsWith("/support?") || href.startsWith("/support/")) {
    const query = href.includes("?") ? href.slice(href.indexOf("?")) : "";
    const path = href.startsWith("/support/") ? href.slice("/support".length).split("?")[0] : "";
    href = segment === "cgi" ? `/cgi/messages${query}` : `/${segment}/support${path}${query}`;
  }

  if (!href && classId && (type.startsWith("class.") || type.startsWith("zoom."))) {
    href = classHref(segment, classId);
  }

  if (!href && (type.startsWith("payment.") || type.startsWith("invoice."))) {
    href = paymentsHref(segment);
  }

  if (!href || !isSafeAppPath(href)) return null;
  return href;
}
