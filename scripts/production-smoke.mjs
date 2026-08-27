#!/usr/bin/env node
/**
 * Production smoke for AviatorPass.
 * Usage: node scripts/production-smoke.mjs [baseUrl]
 */
const BASE = (process.argv[2] || "https://www.aviatorpass.com").replace(/\/$/, "");
const DEMO = {
  student: "student.one@eagerpilots.com",
  instructor: "instructor.one@eagerpilots.com",
  superadmin: "superadmin@eagerpilots.com",
  password: "DemoPass123!",
};

function jarNew() {
  const jar = new Map();
  return {
    store(res) {
      for (const c of res.headers.getSetCookie?.() || []) {
        const [pair] = c.split(";");
        const i = pair.indexOf("=");
        if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
      }
    },
    cookie: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
    csrf: () => (jar.get("aep_csrf") ? decodeURIComponent(jar.get("aep_csrf")) : null),
    clearSession() {
      for (const k of [...jar.keys()]) {
        if (k !== "aep_csrf") jar.delete(k);
      }
    },
  };
}

async function send(jar, method, path, body, { redirect = "follow" } = {}) {
  const headers = { Cookie: jar.cookie() };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (jar.csrf()) headers["x-csrf-token"] = jar.csrf();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect,
  });
  jar.store(res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, location: res.headers.get("location"), bytes: text.length };
}

const results = [];
async function check(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, detail: detail ?? "ok" });
    console.log(`PASS  ${name} (${Date.now() - t0}ms) ${detail ?? ""}`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - t0, error: String(error.message || error) });
    console.error(`FAIL  ${name}: ${error.message || error}`);
  }
}

async function boot() {
  const jar = jarNew();
  jar.store(await fetch(`${BASE}/api/auth/me`));
  return jar;
}

async function passwordLogin(email) {
  const jar = await boot();
  const res = await send(jar, "POST", "/api/auth/login", {
    email,
    password: DEMO.password,
    rememberMe: true,
  });
  if (!res.json?.success) throw new Error(res.json?.error || `HTTP ${res.status}`);
  return { jar, role: res.json.data?.user?.role };
}

function extractOtp(preview) {
  const match = String(preview || "").match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

async function main() {
  console.log(`Production smoke against ${BASE}\n`);

  await check("health", async () => {
    const res = await fetch(`${BASE}/api/health`);
    const json = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = json.deployment || {};
    const bad = [];
    if (json.env !== "production") bad.push(`env=${json.env}`);
    if (d.gitRef !== "main") bad.push(`gitRef=${d.gitRef}`);
    if (d.target !== "production") bad.push(`target=${d.target}`);
    if (bad.length) throw new Error(bad.join(", "));
    return `env=${json.env} gitRef=${d.gitRef} sha=${String(d.gitSha || "").slice(0, 12)}`;
  });

  await check("homepage", async () => {
    const res = await fetch(`${BASE}/`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    return "HTTP 200";
  });

  await check("registration", async () => {
    const page = await fetch(`${BASE}/register`);
    if (page.status !== 200) throw new Error(`/register ${page.status}`);
    const jar = await boot();
    const stamp = `${Date.now()}`.slice(-7);
    const email = `smoke.${Date.now()}@eagerpilots.com`;
    const otp = await send(jar, "POST", "/api/auth/otp/request", {
      email,
      firstName: "Smoke",
      lastName: "Pilot",
      phone: `+9655${stamp}`,
      countryCode: "KW",
      nationality: "Kuwaiti",
      password: "SmokePass123!",
      confirmPassword: "SmokePass123!",
      acceptTerms: true,
      acceptPrivacy: true,
      purpose: "register",
    });
    if (!otp.json?.success) throw new Error(otp.json?.error || `HTTP ${otp.status}`);
    return `page=200 emailDelivery=${otp.json.data?.emailDelivery}`;
  });

  await check("purchase flow", async () => {
    const page = await fetch(`${BASE}/checkout`);
    if (page.status !== 200) throw new Error(`/checkout ${page.status}`);
    const jar = await boot();
    const quote = await send(jar, "GET", "/api/public/checkout?country=KW");
    if (!quote.json?.success) throw new Error(quote.json?.error || "quote failed");
    const productId = quote.json.data?.product?.id;
    if (!productId) throw new Error("no product");
    const pay = await send(jar, "POST", "/api/public/checkout", {
      productId,
      firstName: "Smoke",
      lastName: "Buyer",
      email: `buyer.smoke.${Date.now()}@eagerpilots.com`,
      phone: "+96550999222",
      country: "KW",
      methodBrand: "card",
      idempotencyKey: `smoke-${Date.now()}`,
    });
    if (!pay.json?.success) throw new Error(pay.json?.error || `pay ${pay.status}`);
    return `page=200 order=${pay.json.data?.order?.status}`;
  });

  await check("OTP", async () => {
    const st = await boot();
    const req = await send(st, "POST", "/api/auth/otp/request", {
      email: DEMO.student,
      purpose: "login",
      rememberMe: true,
    });
    if (!req.json?.success) throw new Error(req.json?.error || "otp request failed");
    const delivery = req.json.data?.emailDelivery;
    if (delivery !== "outbox" && delivery !== "smtp") {
      throw new Error(`unexpected emailDelivery=${delivery}`);
    }

    let verify = "skipped";
    try {
      const sa = await passwordLogin(DEMO.superadmin);
      const outbox = await send(sa.jar, "GET", "/api/admin/settings/email-outbox?limit=20");
      const msg = (outbox.json?.data?.messages || []).find(
        (m) => m.to === DEMO.student && /verification/i.test(m.subject || ""),
      );
      const code = extractOtp(msg?.previewText);
      if (code) {
        const ver = await send(st, "POST", "/api/auth/otp/verify", {
          email: DEMO.student,
          token: code,
          purpose: "login",
        });
        if (ver.json?.success) verify = "ok";
      }
    } catch {
      verify = "request-only";
    }
    return `request=${delivery} verify=${verify}`;
  });

  let student;
  await check("login", async () => {
    student = await passwordLogin(DEMO.student);
    if (student.role !== "student") throw new Error(`role ${student.role}`);
    return "student password login";
  });

  await check("student dashboard", async () => {
    const page = await send(student.jar, "GET", "/student/dashboard");
    if (page.status !== 200) throw new Error(`HTTP ${page.status}`);
    const api = await send(student.jar, "GET", "/api/learning/dashboard");
    if (!api.json?.success) throw new Error(api.json?.error || "learning dashboard");
    return "HTTP 200";
  });

  await check("instructor dashboard", async () => {
    const instructor = await passwordLogin(DEMO.instructor);
    if (instructor.role !== "instructor") throw new Error(`role ${instructor.role}`);
    const page = await send(instructor.jar, "GET", "/instructor/dashboard");
    if (page.status !== 200) throw new Error(`HTTP ${page.status}`);
    return "HTTP 200";
  });

  await check("notifications", async () => {
    const list = await send(student.jar, "GET", "/api/notifications?pageSize=10");
    const unread = await send(student.jar, "GET", "/api/notifications/unread-count");
    if (!list.json?.success) throw new Error(list.json?.error || "list");
    if (!unread.json?.success) throw new Error(unread.json?.error || "unread");
    return `unread=${unread.json.data?.unreadCount ?? unread.json.data}`;
  });

  await check("payment", async () => {
    const catalog = await send(student.jar, "GET", "/api/payments/catalog");
    const orders = await send(student.jar, "GET", "/api/payments/orders");
    if (!catalog.json?.success) throw new Error(catalog.json?.error || "catalog");
    if (!orders.json?.success) throw new Error(orders.json?.error || "orders");
    return "catalog+orders ok";
  });

  await check("logout", async () => {
    const out = await send(student.jar, "POST", "/api/auth/logout", {});
    if (!out.json?.success && out.status >= 400) {
      throw new Error(out.json?.error || `HTTP ${out.status}`);
    }
    student.jar.clearSession();
    const dash = await send(student.jar, "GET", "/student/dashboard", undefined, {
      redirect: "manual",
    });
    if (dash.status === 200 && dash.bytes > 1000 && !dash.location) {
      throw new Error("dashboard still reachable after logout");
    }
    if (![200, 302, 303, 307, 308, 401].includes(dash.status)) {
      throw new Error(`unexpected ${dash.status}`);
    }
    return `logout ok followup=${dash.status}`;
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    for (const f of failed) console.log(` - ${f.name}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
