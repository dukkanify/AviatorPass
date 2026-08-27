/**
 * Executable evidence collector for the enterprise audit.
 * Usage: node scripts/audit-evidence.mjs [baseUrl]
 *
 * Writes JSON to /opt/cursor/artifacts/enterprise_audit_evidence.json when that
 * directory exists; always prints PASS/FAIL lines to stdout.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] || "http://localhost:3000";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stamp = Date.now().toString(36);
const results = [];
const ARTIFACT_DIR = fs.existsSync("/opt/cursor/artifacts")
  ? "/opt/cursor/artifacts"
  : path.join(ROOT, ".data");

function rec(phase, name, pass, detail) {
  results.push({ phase, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  [${phase}] ${name} — ${detail}`);
}

function jarNew() {
  const jar = new Map();
  const raw = [];
  return {
    store(res) {
      for (const c of res.headers.getSetCookie?.() || []) {
        raw.push(c);
        const [pair] = c.split(";");
        const i = pair.indexOf("=");
        if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
      }
    },
    cookie: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
    csrf: () => (jar.get("aep_csrf") ? decodeURIComponent(jar.get("aep_csrf")) : null),
    has: (k) => jar.has(k),
    keys: () => [...jar.keys()],
    lastSetCookie: (name) => [...raw].reverse().find((c) => c.startsWith(`${name}=`)) || "",
    raw,
  };
}

async function boot() {
  const jar = jarNew();
  jar.store(await fetch(`${BASE}/api/auth/me`));
  return jar;
}

async function send(jar, method, urlPath, body, { csrf = true } = {}) {
  const headers = {
    Cookie: jar.cookie(),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrf && jar.csrf()) headers["x-csrf-token"] = jar.csrf();
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  jar.store(res);
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* html */
  }
  return { status: res.status, json, res, location: res.headers.get("location") };
}

const post = (jar, urlPath, body, opts) => send(jar, "POST", urlPath, body, opts);
const patch = (jar, urlPath, body, opts) => send(jar, "PATCH", urlPath, body, opts);
const get = (jar, urlPath) => send(jar, "GET", urlPath, undefined, { csrf: false });

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkFiles(p, acc);
    else if (/\.(tsx?|jsx?)$/.test(name)) acc.push(p);
  }
  return acc;
}

const studentEmail = `audit.student.${stamp}@eagerpilots.com`;
const instructorEmail = `audit.instructor.${stamp}@eagerpilots.com`;
const resetEmail = `audit.reset.${stamp}@eagerpilots.com`;
const studentPhone = `+97150${String(1000000 + (Date.now() % 8999999)).slice(0, 7)}`;
const instructorPhone = `+97152${String(1000000 + ((Date.now() + 17) % 8999999)).slice(0, 7)}`;
const resetPhone = `+97154${String(1000000 + ((Date.now() + 31) % 8999999)).slice(0, 7)}`;

const registerBase = {
  firstName: "Audit",
  lastName: "Student",
  countryCode: "AE",
  nationality: "Emirati",
  password: "DemoPass123!",
  confirmPassword: "DemoPass123!",
  acceptTerms: true,
  acceptPrivacy: true,
};

// ---- Phase 2: student dashboard independence (static) ----
{
  const studentFiles = walkFiles(path.join(ROOT, "app/(student)"));
  const learningFiles = walkFiles(path.join(ROOT, "features/learning"));
  const forbidden = [
    "admin-dashboard-view",
    "ADMIN_NAV",
    "SUPER_ADMIN_NAV",
    "getAdminOverview",
    "features/dashboard/admin",
    "/api/admin",
  ];
  const hits = [];
  for (const file of [...studentFiles, ...learningFiles]) {
    const text = fs.readFileSync(file, "utf8");
    for (const needle of forbidden) {
      if (text.includes(needle)) hits.push(`${path.relative(ROOT, file)}:${needle}`);
    }
  }
  rec(
    "STUDENT",
    "no admin imports in student app or learning feature",
    hits.length === 0,
    hits.length ? hits.join("; ") : `scanned ${studentFiles.length + learningFiles.length} files`,
  );

  const layout = fs.readFileSync(path.join(ROOT, "app/(student)/layout.tsx"), "utf8");
  rec(
    "STUDENT",
    "student layout uses STUDENT_NAV + RoleShell",
    layout.includes("STUDENT_NAV") && layout.includes("RoleShell") && !layout.includes("ADMIN_NAV"),
    layout.includes("STUDENT_NAV")
      ? "STUDENT_NAV present, ADMIN_NAV absent"
      : "STUDENT_NAV missing",
  );

  const dashPage = fs.readFileSync(
    path.join(ROOT, "app/(student)/student/dashboard/page.tsx"),
    "utf8",
  );
  rec(
    "STUDENT",
    "student dashboard uses LearningDashboardView",
    dashPage.includes("LearningDashboardView") && !dashPage.includes("AdminDashboardView"),
    dashPage.includes("LearningDashboardView") ? "LearningDashboardView" : "missing learning view",
  );

  const navSrc = fs.readFileSync(path.join(ROOT, "constants/dashboard-nav.ts"), "utf8");
  const studentNavBlock = navSrc.slice(
    navSrc.indexOf("export const STUDENT_NAV"),
    navSrc.indexOf("export const DASHBOARD_NAV"),
  );
  const hrefs = [...studentNavBlock.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);
  const nonStudent = hrefs.filter((h) => !h.startsWith("/student/"));
  rec(
    "STUDENT",
    "STUDENT_NAV hrefs stay under /student/",
    nonStudent.length === 0 && hrefs.length > 0,
    nonStudent.length ? nonStudent.join(",") : `${hrefs.length} hrefs`,
  );

  const adminDash = fs.readFileSync(
    path.join(ROOT, "app/(admin)/admin/dashboard/page.tsx"),
    "utf8",
  );
  rec(
    "STUDENT",
    "admin dashboard is a separate feature view",
    adminDash.includes("AdminDashboardView"),
    "AdminDashboardView on /admin/dashboard",
  );

  const palette = fs.readFileSync(
    path.join(ROOT, "components/navigation/command-palette.tsx"),
    "utf8",
  );
  rec(
    "STUDENT",
    "command palette admin group is role-gated",
    palette.includes('user?.role === "super_admin"') && palette.includes('user?.role === "admin"'),
    "Admin command group wrapped in admin/super_admin check",
  );
}

// ---- public / marketing pages (Phase 6) ----
const publicPages = [
  ["/", "Homepage"],
  ["/#about", "About (homepage hash)"],
  ["/courses", "ATPL / Courses"],
  ["/register/instructor", "Instructor registration"],
  ["/login", "Login"],
  ["/register", "Register"],
  ["/forgot-password", "Forgot Password"],
  ["/reset-password", "Reset Password"],
  ["/blog", "Blogs"],
  ["/live", "Live"],
  ["/flightpath", "Flightpath"],
  ["/book", "Book"],
  ["/verify/certificate", "Certificates (public verify)"],
  ["/splash", "Splash"],
  ["/design-system", "Design system"],
];
for (const [p, label] of publicPages) {
  const url = p.includes("#") ? p.slice(0, p.indexOf("#")) : p;
  const res = await fetch(`${BASE}${url}`, { redirect: "manual" });
  rec("QA", `public ${label} ${p}`, res.status < 500, `HTTP ${res.status}`);
}

// ---- health + headers ----
{
  const res = await fetch(`${BASE}/api/health`);
  const json = await res.json();
  rec("SEC", "health no auth leak", !json.authStore, `keys=${Object.keys(json).join(",")}`);
  rec(
    "SEC",
    "X-Frame-Options",
    Boolean(res.headers.get("x-frame-options")),
    `val=${res.headers.get("x-frame-options")}`,
  );
  rec(
    "SEC",
    "X-Content-Type-Options",
    res.headers.get("x-content-type-options") === "nosniff",
    `val=${res.headers.get("x-content-type-options")}`,
  );
  rec(
    "SEC",
    "Referrer-Policy",
    Boolean(res.headers.get("referrer-policy")),
    `val=${res.headers.get("referrer-policy")}`,
  );
  rec(
    "PERF",
    "health payload env present",
    typeof json.env === "string",
    `env=${json.env} service=${json.service}`,
  );
}

// ---- CSRF ----
{
  const r = await fetch(`${BASE}/api/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "student.one@eagerpilots.com", purpose: "login" }),
  });
  const j = await r.json();
  rec(
    "SEC",
    "CSRF rejects tokenless mutation",
    r.status === 403 && j.success === false,
    `status=${r.status}`,
  );
}

// ---- student registration ----
let studentJar = null;
{
  const jar = await boot();
  rec(
    "AUTH",
    "CSRF cookie issued by /api/auth/me",
    jar.has("aep_csrf"),
    `cookies=${jar.keys().join(",")}`,
  );
  const req = await post(jar, "/api/auth/otp/request", {
    ...registerBase,
    email: studentEmail,
    phone: studentPhone,
    purpose: "register",
    role: "student",
  });
  rec(
    "AUTH",
    "student registration OTP issued",
    req.status === 200 && req.json?.success === true,
    `status=${req.status} err=${req.json?.error} demoOtp=${Boolean(req.json?.data?.demoOtp)} delivery=${req.json?.data?.emailDelivery} outbox=${req.json?.data?.emailOutboxId ?? "none"}`,
  );
  rec(
    "NOTIF",
    "registration OTP email queued (outbox or smtp)",
    req.json?.data?.emailDelivery === "outbox" ||
      req.json?.data?.emailDelivery === "smtp" ||
      Boolean(req.json?.data?.emailOutboxId),
    `delivery=${req.json?.data?.emailDelivery} outbox=${req.json?.data?.emailOutboxId ?? "none"}`,
  );
  const otp = req.json?.data?.demoOtp || "123456";
  const ver = await post(jar, "/api/auth/otp/verify", {
    email: studentEmail,
    token: otp,
    purpose: "register",
  });
  rec(
    "AUTH",
    "student OTP verify + session",
    ver.status === 200 && ver.json?.success === true && ver.json?.data?.user?.role === "student",
    `status=${ver.status} role=${ver.json?.data?.user?.role} redirect=${ver.json?.data?.redirectTo} verified=${ver.json?.data?.user?.emailVerified}`,
  );
  rec(
    "AUTH",
    "email verified on register",
    ver.json?.data?.user?.emailVerified === true,
    `emailVerified=${ver.json?.data?.user?.emailVerified}`,
  );
  rec(
    "AUTH",
    "redirect flow after register",
    typeof ver.json?.data?.redirectTo === "string" &&
      (ver.json.data.redirectTo.startsWith("/student") ||
        ver.json.data.redirectTo.includes("complete-profile")),
    `redirect=${ver.json?.data?.redirectTo}`,
  );
  rec("AUTH", "session cookie created", jar.has("aep_session"), `cookies=${jar.keys().join(",")}`);
  const sessionSet = jar.lastSetCookie("aep_session");
  rec(
    "SEC",
    "session cookie HttpOnly + SameSite=Lax",
    /httponly/i.test(sessionSet) && /samesite=lax/i.test(sessionSet),
    sessionSet ? sessionSet.split(";").slice(1).join(";").trim() : "missing Set-Cookie",
  );
  rec("AUTH", "signed-in hint cookie", jar.has("aep_signed_in"), `cookies=${jar.keys().join(",")}`);
  const me = await get(jar, "/api/auth/me");
  rec(
    "AUTH",
    "session persistence /api/auth/me",
    me.json?.data?.isAuthenticated === true && me.json?.data?.user?.email === studentEmail,
    `auth=${me.json?.data?.isAuthenticated} email=${me.json?.data?.user?.email}`,
  );
  const dash = await get(jar, "/student/dashboard");
  rec(
    "AUTH",
    "student dashboard after register",
    dash.status < 500 && [200, 307, 308, 302].includes(dash.status),
    `HTTP ${dash.status}`,
  );
  const learning = await get(jar, "/api/learning/dashboard");
  const keys = learning.json?.data ? Object.keys(learning.json.data) : [];
  rec(
    "STUDENT",
    "learning dashboard API (student data, not admin)",
    learning.status === 200 && keys.includes("activeCourses") && !keys.includes("pendingApprovals"),
    `status=${learning.status} keys=${keys.join(",")}`,
  );

  const nlist = await get(jar, "/api/notifications?grouped=true&pageSize=20");
  const nData = nlist.json?.data;
  const nItems = nData?.data ?? [];
  const nGroups = nData?.groups ?? [];
  rec(
    "NOTIF",
    "in-app notifications after registration",
    nlist.status === 200 && (nItems.length > 0 || nGroups.length > 0 || (nData?.total ?? 0) > 0),
    `status=${nlist.status} total=${nData?.total} items=${nItems.length} groups=${nGroups.length} unread=${nData?.unreadCount}`,
  );
  rec(
    "NOTIF",
    "notification records have titles + types",
    nItems.length === 0 ? nGroups.length > 0 : nItems.every((n) => n.title && n.type),
    `types=${[...new Set((nItems.length ? nItems : nGroups.map((g) => g.latest)).map((n) => n?.type))].join(",")}`,
  );
  const unread = await get(jar, "/api/notifications/unread-count");
  rec(
    "NOTIF",
    "badge unread count API",
    unread.status === 200 && typeof unread.json?.data?.unreadCount === "number",
    `unread=${unread.json?.data?.unreadCount}`,
  );
  const firstId = nItems[0]?.id || nGroups[0]?.latest?.id;
  if (firstId) {
    const marked = await patch(jar, "/api/notifications", { id: firstId, action: "read" });
    rec(
      "NOTIF",
      "mark one notification read",
      marked.status === 200 &&
        (marked.json?.data?.notification?.readAt ||
          marked.json?.data?.notification?.status === "read"),
      `status=${marked.status} unreadAfter=${marked.json?.data?.unreadCount}`,
    );
  } else {
    rec("NOTIF", "mark one notification read", false, "no notification id available");
  }

  const csrfReject = await send(jar, "POST", "/api/notifications/read-all", {}, { csrf: false });
  rec(
    "SEC",
    "mark-all-read CSRF rejected without token",
    csrfReject.status === 403,
    `status=${csrfReject.status} err=${csrfReject.json?.error}`,
  );
  const markAll = await post(jar, "/api/notifications/read-all", {});
  rec(
    "NOTIF",
    "mark all notifications read",
    markAll.status === 200 && markAll.json?.success === true,
    `status=${markAll.status} marked=${markAll.json?.data?.marked}`,
  );
  const unreadAfter = await get(jar, "/api/notifications/unread-count");
  rec(
    "NOTIF",
    "unread count drops after mark-all-read",
    unreadAfter.json?.data?.unreadCount === 0,
    `unread=${unreadAfter.json?.data?.unreadCount}`,
  );

  const adminBlock = await get(jar, "/api/admin/settings");
  rec(
    "SEC",
    "student cannot access admin settings",
    adminBlock.status >= 400 || adminBlock.json?.success === false,
    `status=${adminBlock.status} success=${adminBlock.json?.success}`,
  );
  const adminPage = await get(jar, "/admin/dashboard");
  rec(
    "SEC",
    "student cannot open admin dashboard",
    adminPage.status === 307 ||
      adminPage.status === 302 ||
      adminPage.status === 403 ||
      adminPage.status === 401,
    `HTTP ${adminPage.status} loc=${adminPage.location}`,
  );

  const lo = await post(jar, "/api/auth/logout", {});
  const me2 = await get(jar, "/api/auth/me");
  rec(
    "AUTH",
    "logout clears session",
    lo.status < 500 && me2.json?.data?.isAuthenticated === false,
    `logout=${lo.status} authAfter=${me2.json?.data?.isAuthenticated}`,
  );
  studentJar = jar;
}

// ---- instructor registration ----
{
  const jar = await boot();
  const req = await post(jar, "/api/auth/otp/request", {
    ...registerBase,
    firstName: "Audit",
    lastName: "Instructor",
    email: instructorEmail,
    phone: instructorPhone,
    purpose: "register",
    role: "instructor",
  });
  rec(
    "AUTH",
    "instructor registration OTP issued",
    req.status === 200 && req.json?.success === true,
    `status=${req.status} err=${req.json?.error} delivery=${req.json?.data?.emailDelivery} outbox=${req.json?.data?.emailOutboxId ?? "none"}`,
  );
  const otp = req.json?.data?.demoOtp || "123456";
  const ver = await post(jar, "/api/auth/otp/verify", {
    email: instructorEmail,
    token: otp,
    purpose: "register",
  });
  rec(
    "AUTH",
    "instructor OTP verify",
    ver.status === 200 && ver.json?.success === true && ver.json?.data?.user?.role === "instructor",
    `status=${ver.status} role=${ver.json?.data?.user?.role} redirect=${ver.json?.data?.redirectTo} err=${ver.json?.error}`,
  );
}

// ---- duplicate email with valid GCC phone ----
{
  const jar = await boot();
  const r = await post(jar, "/api/auth/otp/request", {
    ...registerBase,
    email: "student.one@eagerpilots.com",
    phone: `+97155${String(2000000 + (Date.now() % 7999999)).slice(0, 7)}`,
    purpose: "register",
    role: "student",
  });
  rec(
    "AUTH",
    "duplicate email rejected",
    r.status < 500 &&
      r.json?.success === false &&
      /email already exists/i.test(r.json?.error || ""),
    `status=${r.status} err=${r.json?.error}`,
  );
}

// ---- duplicate phone ----
{
  const jar = await boot();
  const r = await post(jar, "/api/auth/otp/request", {
    ...registerBase,
    email: `dup.phone.${stamp}@eagerpilots.com`,
    phone: studentPhone,
    purpose: "register",
    role: "student",
  });
  rec(
    "AUTH",
    "duplicate phone rejected",
    r.status < 500 &&
      r.json?.success === false &&
      /phone number already exists/i.test(r.json?.error || ""),
    `status=${r.status} err=${r.json?.error}`,
  );
}

// ---- invalid OTP ----
{
  const jar = await boot();
  await post(jar, "/api/auth/otp/request", {
    email: "student.one@eagerpilots.com",
    purpose: "login",
    rememberMe: true,
  });
  const r = await post(jar, "/api/auth/otp/verify", {
    email: "student.one@eagerpilots.com",
    token: "000000",
    purpose: "login",
  });
  rec(
    "AUTH",
    "invalid OTP rejected",
    r.status < 500 && r.json?.success === false,
    `status=${r.status} err=${r.json?.error}`,
  );
}

// ---- password reset (full) ----
{
  const jar = await boot();
  const reg = await post(jar, "/api/auth/otp/request", {
    ...registerBase,
    firstName: "Reset",
    lastName: "User",
    email: resetEmail,
    phone: resetPhone,
    purpose: "register",
    role: "student",
  });
  const otp = reg.json?.data?.demoOtp || "123456";
  await post(jar, "/api/auth/otp/verify", {
    email: resetEmail,
    token: otp,
    purpose: "register",
  });
  await post(jar, "/api/auth/logout", {});

  const fresh = await boot();
  const forgot = await post(fresh, "/api/auth/otp/request", {
    email: resetEmail,
    purpose: "reset_password",
  });
  rec(
    "AUTH",
    "forgot-password OTP",
    forgot.status === 200 && forgot.json?.success === true,
    `status=${forgot.status} delivery=${forgot.json?.data?.emailDelivery} outbox=${forgot.json?.data?.emailOutboxId ?? "none"}`,
  );
  const resetOtp = forgot.json?.data?.demoOtp || "123456";
  const verified = await post(fresh, "/api/auth/otp/verify", {
    email: resetEmail,
    token: resetOtp,
    purpose: "reset_password",
  });
  const redirectTo = verified.json?.data?.redirectTo || "";
  const tokenMatch = /token=([^&]+)/.exec(redirectTo);
  rec(
    "AUTH",
    "password-reset OTP verify issues reset token",
    verified.status === 200 && Boolean(tokenMatch?.[1]),
    `status=${verified.status} redirect=${redirectTo}`,
  );
  const newPassword = "DemoPass456!";
  const reset = await post(fresh, "/api/auth/reset-password", {
    email: resetEmail,
    resetToken: tokenMatch?.[1] || "missing",
    password: newPassword,
    confirmPassword: newPassword,
  });
  rec(
    "AUTH",
    "password reset completes",
    reset.status === 200 && reset.json?.success === true,
    `status=${reset.status} err=${reset.json?.error}`,
  );
  const loginJar = await boot();
  await post(loginJar, "/api/auth/otp/request", {
    email: resetEmail,
    purpose: "login",
    rememberMe: true,
  });
  const loginVer = await post(loginJar, "/api/auth/otp/verify", {
    email: resetEmail,
    token: "123456",
    purpose: "login",
  });
  rec(
    "AUTH",
    "login after password reset",
    loginVer.status === 200 && loginVer.json?.success === true,
    `status=${loginVer.status} role=${loginVer.json?.data?.user?.role}`,
  );
}

// ---- resend OTP cooldown + lift ----
{
  const jar = await boot();
  await post(jar, "/api/auth/otp/request", {
    email: "instructor.one@eagerpilots.com",
    purpose: "login",
  });
  const r = await post(jar, "/api/auth/otp/resend", {
    email: "instructor.one@eagerpilots.com",
    purpose: "login",
  });
  rec(
    "AUTH",
    "resend OTP cooldown",
    r.status < 500 &&
      r.json?.success === false &&
      String(r.json?.error || "")
        .toLowerCase()
        .includes("wait"),
    `status=${r.status} err=${r.json?.error}`,
  );
  console.log("Waiting 61s for OTP resend cooldown to elapse…");
  await new Promise((resolve) => setTimeout(resolve, 61_000));
  const lifted = await post(jar, "/api/auth/otp/resend", {
    email: "instructor.one@eagerpilots.com",
    purpose: "login",
  });
  rec(
    "AUTH",
    "resend OTP after 60s cooldown",
    lifted.status === 200 && lifted.json?.success === true,
    `status=${lifted.status} err=${lifted.json?.error} delivery=${lifted.json?.data?.emailDelivery}`,
  );
}

// ---- role logins + dashboards ----
async function login(email) {
  const jar = await boot();
  await post(jar, "/api/auth/otp/request", { email, purpose: "login", rememberMe: true });
  const v = await post(jar, "/api/auth/otp/verify", { email, token: "123456", purpose: "login" });
  return { jar, verify: v };
}

{
  const { jar, verify } = await login("student.one@eagerpilots.com");
  rec(
    "AUTH",
    "student login",
    verify.json?.success === true && verify.json?.data?.user?.role === "student",
    `role=${verify.json?.data?.user?.role} redirect=${verify.json?.data?.redirectTo}`,
  );
  const pages = [
    "/student/dashboard",
    "/student/notifications",
    "/student/profile",
    "/student/courses",
    "/student/calendar",
    "/student/certificates",
    "/student/search",
    "/student/billing",
  ];
  for (const p of pages) {
    const r = await get(jar, p);
    rec("QA", `student page ${p}`, r.status < 500, `HTTP ${r.status}`);
  }
}

{
  const { jar, verify } = await login("instructor.one@eagerpilots.com");
  rec(
    "AUTH",
    "instructor login",
    verify.json?.success === true && verify.json?.data?.user?.role === "instructor",
    `role=${verify.json?.data?.user?.role} redirect=${verify.json?.data?.redirectTo}`,
  );
  const dash = await get(jar, "/instructor/dashboard");
  rec(
    "QA",
    "instructor dashboard",
    dash.status < 500,
    `HTTP ${dash.status} loc=${dash.location ?? ""}`,
  );
}

{
  const { jar, verify } = await login("admin@eagerpilots.com");
  rec(
    "AUTH",
    "admin login",
    verify.json?.success === true &&
      ["admin", "super_admin"].includes(verify.json?.data?.user?.role),
    `role=${verify.json?.data?.user?.role}`,
  );
  const dash = await get(jar, "/admin/dashboard");
  rec("QA", "admin dashboard", dash.status < 500, `HTTP ${dash.status}`);
}

{
  const { jar, verify } = await login("superadmin@eagerpilots.com");
  rec(
    "AUTH",
    "superadmin login",
    verify.json?.success === true && verify.json?.data?.user?.role === "super_admin",
    `role=${verify.json?.data?.user?.role}`,
  );
  const dash = await get(jar, "/super-admin/dashboard");
  rec("QA", "super admin dashboard", dash.status < 500, `HTTP ${dash.status}`);
  const settings = await get(jar, "/super-admin/settings");
  rec("QA", "super admin settings", settings.status < 500, `HTTP ${settings.status}`);
  const out = await get(jar, "/api/admin/settings/email-outbox?limit=20");
  const messages = out.json?.data?.messages ?? [];
  rec(
    "NOTIF",
    "email outbox readable",
    out.status === 200 && out.json?.success === true,
    `status=${out.status} messages=${messages.length} smtp=${out.json?.data?.smtpConfigured}`,
  );
  const kinds = messages.map((m) => m.subject || m.meta?.kind || m.kind).slice(0, 8);
  rec(
    "NOTIF",
    "outbox contains OTP and/or transactional mail",
    messages.length > 0,
    `subjects=${kinds.join(" | ")}`,
  );
}

// ---- expired OTP (engine-level, not a 10-minute HTTP wait) ----
{
  const vitest = spawnSync(
    "npx",
    ["vitest", "run", "tests/integration/enterprise-otp.test.ts", "--reporter=dot"],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, VITE_CONFIG_NATIVE_IGNORE_WARNING: "true" },
      timeout: 120_000,
    },
  );
  const out = `${vitest.stdout || ""}\n${vitest.stderr || ""}`;
  rec(
    "AUTH",
    "expired OTP rejected (enterprise-otp.test.ts)",
    vitest.status === 0,
    vitest.status === 0 ? "vitest passed (includes expired + cooldown + lockout)" : out.slice(-400),
  );
}

{
  const vitest = spawnSync(
    "npx",
    [
      "vitest",
      "run",
      "tests/unit/rate-limit.test.ts",
      "tests/unit/notification-engine.test.ts",
      "--reporter=dot",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, VITE_CONFIG_NATIVE_IGNORE_WARNING: "true" },
      timeout: 120_000,
    },
  );
  rec(
    "SEC",
    "rate limiter unit test",
    vitest.status === 0,
    vitest.status === 0
      ? "rate-limit + notification-engine vitest passed"
      : (vitest.stderr || "").slice(-300),
  );
}

void studentJar;

const failed = results.filter((r) => !r.pass);
const summary = {
  base: BASE,
  at: new Date().toISOString(),
  passed: results.length - failed.length,
  total: results.length,
  failed: failed.map((f) => ({ phase: f.phase, name: f.name, detail: f.detail })),
  results,
};
const jsonPath = path.join(ARTIFACT_DIR, "enterprise_audit_evidence.json");
fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed}/${summary.total} evidence checks passed`);
console.log(`Wrote ${jsonPath}`);
if (failed.length) {
  console.log("Failures:");
  for (const f of failed) console.log(` - [${f.phase}] ${f.name}: ${f.detail}`);
}
process.exit(failed.length ? 1 : 0);
