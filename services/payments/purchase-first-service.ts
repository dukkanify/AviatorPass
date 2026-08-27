/**
 * Purchase-first enrollment — charge before creating an account.
 * Failed payments never create a user or reserve a seat.
 */

import { ACCOUNT_STATUS } from "@/constants/account-status";
import { ACTIVITY_ACTIONS } from "@/constants/activity-actions";
import { COUNTRIES } from "@/constants/countries";
import { ORDER_EXPIRY_MINUTES, PAYMENT_METHOD_LABELS } from "@/constants/payments";
import { ROLES } from "@/constants/roles";
import { routes } from "@/constants/routes";
import {
  generateId,
  generateSecurePassword,
  generateToken,
  hashPassword,
} from "@/lib/security/crypto";
import { rateLimit } from "@/lib/security/rate-limit";
import { logActivity } from "@/services/auth/activity-log";
import {
  defaultNotificationPreferences,
  defaultSecuritySettings,
  findUserByEmail,
  findUserById,
  isStudentProfileComplete,
  toUserProfile,
  writeAuthDb,
  type StoredUser,
} from "@/services/auth/store";
import { listStudentEnrollments } from "@/services/courses/enrollment-service";
import { dispatchEmailEvent, dispatchRoleAlert } from "@/services/email/automation-service";
import { PaymentError } from "@/services/payments/access";
import { getProduct, listProducts } from "@/services/payments/catalog-service";
import { completePaidOrder, getOrder, getPayment } from "@/services/payments/checkout-service";
import { getPaymentGateway } from "@/services/payments/gateway";
import {
  createInstallmentPlanForOrder,
  listScheduleForPlan,
  markInstallmentPaid,
} from "@/services/payments/installment-service";
import { calcTax, formatMinor } from "@/services/payments/money";
import { getRegionalPaymentRule } from "@/services/payments/regional-rules-service";
import { readPaymentsDb, writePaymentsDb } from "@/services/payments/store";
import { getPublicBrandConfig } from "@/services/settings/settings-service";
import type {
  CatalogProduct,
  Order,
  OrderItem,
  PaymentMethodBrand,
  PaymentRecord,
} from "@/types/payments";
import { normalizePhone, sanitizeEmail, sanitizeString } from "@/utils/sanitize";
import type { GuestCheckoutInput } from "@/utils/validation";

export const GUEST_STUDENT_ID = "guest";

export type GuestCheckoutMethod = {
  id: PaymentMethodBrand;
  label: string;
  available: boolean;
  comingSoon?: boolean;
  processor: string;
};

export type GuestCheckoutQuote = {
  product: CatalogProduct;
  currency: string;
  subtotalAmount: number;
  taxAmount: number;
  taxRatePercent: number;
  totalAmount: number;
  totalLabel: string;
  methods: GuestCheckoutMethod[];
  processor: string;
  supportEmail: string;
  loginUrl: string;
  courseAccessUrl: string;
};

export type GuestPayResult = {
  order: Order;
  payment: PaymentRecord | null;
  checkoutUrl: string | null;
  accountCreated: boolean;
  attachedToExisting: boolean;
  emailSent: boolean;
  courseAssigned: boolean;
  temporaryPassword: string | null;
  loginUrl: string;
  courseAccessUrl: string;
};

function nowIso() {
  return new Date().toISOString();
}

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code.toUpperCase())?.name ?? code.toUpperCase();
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

function nextOrderNumber(): string {
  const y = new Date().getFullYear();
  const n = readPaymentsDb().orders.length + 1;
  return `ORD-${y}-${String(n).padStart(5, "0")}`;
}

export function getAtplPackageProduct(): CatalogProduct | null {
  return listProducts({ activeOnly: true }).find((p) => p.metadata?.sku === "ATPL-PACKAGE") ?? null;
}

export function listGuestCheckoutMethods(countryCode: string): GuestCheckoutMethod[] {
  const settings = readPaymentsDb().settings;
  const rule = getRegionalPaymentRule(countryCode);
  const processor = settings.provider;
  const cc = countryCode.toUpperCase();
  const madaMarkets = new Set(["KW", "SA", "BH", "QA", "AE", "OM"]);

  const row = (
    id: PaymentMethodBrand,
    available: boolean,
    comingSoon?: boolean,
  ): GuestCheckoutMethod => ({
    id,
    label: PAYMENT_METHOD_LABELS[id],
    available,
    comingSoon,
    processor,
  });

  return [
    row("card", true),
    row("apple_pay", settings.allowApplePay !== false),
    row("google_pay", settings.allowGooglePay !== false),
    row("mada", madaMarkets.has(cc), !madaMarkets.has(cc)),
    row("tabby", false, true),
    row("tamara", false, true),
    row("myfatoorah", processor === "myfatoorah", processor !== "myfatoorah"),
    row("manual", processor === "manual", processor !== "manual"),
  ].map((method) => {
    if (method.id === "tabby" && rule.bnplProviders.includes("tabby")) {
      return { ...method, comingSoon: true, available: false };
    }
    if (method.id === "tamara" && rule.bnplProviders.includes("tamara")) {
      return { ...method, comingSoon: true, available: false };
    }
    return method;
  });
}

export function quoteGuestCheckout(productId?: string | null, country = "KW"): GuestCheckoutQuote {
  const product = (productId ? getProduct(productId) : null) ?? getAtplPackageProduct();
  if (!product || !product.active) {
    throw new PaymentError("ATPL PASS is not available for purchase right now", 404);
  }
  const settings = readPaymentsDb().settings;
  const subtotal = product.isFree ? 0 : product.priceAmount;
  const taxAmount = calcTax(subtotal, settings.taxRatePercent);
  const totalAmount = subtotal + taxAmount;
  const brand = getPublicBrandConfig();
  const origin = appOrigin();
  return {
    product,
    currency: product.currency || settings.currency,
    subtotalAmount: subtotal,
    taxAmount,
    taxRatePercent: settings.taxRatePercent,
    totalAmount,
    totalLabel: formatMinor(totalAmount, product.currency || settings.currency),
    methods: listGuestCheckoutMethods(country),
    processor: settings.provider,
    supportEmail: brand.supportEmail,
    loginUrl: `${origin}${routes.login}`,
    courseAccessUrl: `${origin}/student/courses`,
  };
}

export function listPurchaseFirstOrders(limit = 50): Order[] {
  return readPaymentsDb()
    .orders.filter((o) => Boolean(o.metadata?.purchaseFirst))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function publicOrderSnapshot(order: Order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    totalAmount: order.totalAmount,
    currency: order.currency,
    totalLabel: formatMinor(order.totalAmount, order.currency),
    productName: order.items[0]?.productName ?? "ATPL PASS",
    billingEmail: order.billingEmail,
    invoiceId: order.invoiceId,
    failureReason: order.failureReason,
    paidAt: order.paidAt,
    accountCreated: Boolean(order.metadata.accountCreated),
    attachedToExisting: Boolean(order.metadata.attachedToExisting),
    emailSent: Boolean(order.metadata.emailSent),
    courseAssigned: Boolean(order.metadata.courseAssigned),
    checkoutUrl: typeof order.metadata.checkoutUrl === "string" ? order.metadata.checkoutUrl : null,
  };
}

function alreadyOwnsProduct(studentId: string, productId: string): boolean {
  const paid = readPaymentsDb().orders.find(
    (o) =>
      o.studentId === studentId &&
      o.status === "paid" &&
      o.items.some((i) => i.productId === productId),
  );
  if (paid) return true;
  const product = getProduct(productId);
  const courseIds = Array.isArray(product?.metadata?.courseIds)
    ? product!.metadata.courseIds.map(String)
    : product?.courseId
      ? [product.courseId]
      : [];
  if (!courseIds.length) return false;
  const enrolled = new Set(
    listStudentEnrollments(studentId)
      .filter((e) => e.status === "approved")
      .map((e) => e.courseId),
  );
  return courseIds.every((id) => enrolled.has(id));
}

export async function payGuestCheckout(input: GuestCheckoutInput): Promise<GuestPayResult> {
  const email = sanitizeEmail(input.email);
  const rl = rateLimit(`guest-checkout:${email}`, 8, 15 * 60_000);
  if (!rl.allowed) {
    throw new PaymentError("Too many checkout attempts. Please wait a few minutes and retry.", 429);
  }

  const quote = quoteGuestCheckout(input.productId, input.country);
  const product = quote.product;
  const methodBrand: PaymentMethodBrand = input.methodBrand ?? "card";
  const methods = listGuestCheckoutMethods(input.country);
  const selected = methods.find((m) => m.id === methodBrand);
  if (!selected?.available) {
    throw new PaymentError("That payment method is not available yet. Choose Credit Card.");
  }

  const existingUser = findUserByEmail(email);
  if (existingUser && alreadyOwnsProduct(existingUser.id, product.id)) {
    throw new PaymentError("This email already has ATPL PASS. Sign in to continue learning.", 409);
  }

  const idempotencyKey =
    input.idempotencyKey?.trim() || `guest-${email}-${product.id}-${generateToken(8)}`;
  const existing = readPaymentsDb().orders.find((o) => o.idempotencyKey === idempotencyKey);
  if (existing?.status === "paid") {
    return {
      order: existing,
      payment: existing.paymentId ? getPayment(existing.paymentId) : null,
      checkoutUrl: null,
      accountCreated: Boolean(existing.metadata.accountCreated),
      attachedToExisting: Boolean(existing.metadata.attachedToExisting),
      emailSent: Boolean(existing.metadata.emailSent),
      courseAssigned: Boolean(existing.metadata.courseAssigned),
      temporaryPassword: null,
      loginUrl: quote.loginUrl,
      courseAccessUrl: quote.courseAccessUrl,
    };
  }

  const stamp = nowIso();
  const fullName = `${sanitizeString(input.firstName)} ${sanitizeString(input.lastName)}`.trim();
  const billingName = sanitizeString(input.billingName || fullName);
  const settings = readPaymentsDb().settings;
  const origin = appOrigin();

  const item: OrderItem = {
    id: generateId(),
    productId: product.id,
    productName: product.name,
    courseId: product.courseId,
    instructorId: product.instructorId,
    pricingModel: product.pricingModel,
    unitAmount: product.priceAmount,
    quantity: 1,
    discountAmount: 0,
    taxAmount: quote.taxAmount,
    totalAmount: quote.totalAmount,
  };

  let order: Order;
  if (existing && (existing.status === "pending" || existing.status === "failed")) {
    writePaymentsDb((db) => {
      const o = db.orders.find((x) => x.id === existing.id);
      if (!o) return;
      o.status = "pending";
      o.failureReason = null;
      o.billingName = billingName;
      o.billingEmail = email;
      o.billingCountry = input.country.toUpperCase();
      o.billingAddress = sanitizeString(input.billingAddress || "");
      o.studentName = fullName;
      o.studentEmail = email;
      o.updatedAt = stamp;
      o.expiresAt = new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60_000).toISOString();
      o.metadata = {
        ...o.metadata,
        purchaseFirst: true,
        guestFirstName: sanitizeString(input.firstName),
        guestLastName: sanitizeString(input.lastName),
        guestPhone: normalizePhone(input.phone),
        guestCountry: input.country.toUpperCase(),
      };
    });
    order = getOrder(existing.id)!;
  } else {
    order = {
      id: generateId(),
      orderNumber: nextOrderNumber(),
      studentId: GUEST_STUDENT_ID,
      studentName: fullName,
      studentEmail: email,
      status: "pending",
      currency: quote.currency,
      subtotalAmount: quote.subtotalAmount,
      discountAmount: 0,
      taxAmount: quote.taxAmount,
      taxRatePercent: quote.taxRatePercent,
      totalAmount: quote.totalAmount,
      couponId: null,
      couponCode: null,
      billingName,
      billingEmail: email,
      billingCountry: input.country.toUpperCase(),
      billingAddress: sanitizeString(input.billingAddress || ""),
      items: [item],
      paymentId: null,
      invoiceId: null,
      idempotencyKey,
      failureReason: null,
      paidAt: null,
      cancelledAt: null,
      expiresAt: new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60_000).toISOString(),
      metadata: {
        purchaseFirst: true,
        guestFirstName: sanitizeString(input.firstName),
        guestLastName: sanitizeString(input.lastName),
        guestPhone: normalizePhone(input.phone),
        guestCountry: input.country.toUpperCase(),
      },
      createdAt: stamp,
      updatedAt: stamp,
    };
    writePaymentsDb((db) => {
      db.orders.unshift(order);
    });
  }

  await logActivity({
    actorId: existingUser?.id ?? null,
    action: ACTIVITY_ACTIONS.CHECKOUT_STARTED,
    entityType: "order",
    entityId: order.id,
    metadata: { purchaseFirst: true, productId: product.id, email },
  });

  if (methodBrand === "manual") {
    throw new PaymentError("Manual payment is not enabled. Choose Credit Card or a wallet.");
  }

  const gateway = getPaymentGateway();
  const charge = await gateway.createPayment({
    orderId: order.id,
    amount: order.totalAmount,
    currency: order.currency,
    customerEmail: email,
    customerName: billingName,
    methodBrand,
    paymentToken: input.paymentToken,
    idempotencyKey: `${order.idempotencyKey}-pay`,
    simulateFailure: input.simulateFailure || input.paymentToken === "fail",
    successUrl: `${origin}${routes.checkoutSuccess}?order=${order.id}`,
    cancelUrl: `${origin}${routes.checkout}?canceled=1&productId=${product.id}`,
  });

  const payStamp = nowIso();
  const payment: PaymentRecord = {
    id: generateId(),
    orderId: order.id,
    provider: charge.provider,
    providerPaymentId: charge.providerPaymentId,
    status: charge.status,
    methodBrand: charge.methodBrand,
    paymentMethodSummary: charge.paymentMethodSummary,
    amount: order.totalAmount,
    currency: order.currency,
    clientSecret: charge.clientSecret,
    checkoutUrl: charge.checkoutUrl,
    webhookVerified:
      charge.provider === "mock" || charge.provider === "tamara" || charge.provider === "tabby",
    failureCode: charge.failureCode,
    failureMessage: charge.failureMessage,
    rawProviderPayload: { ...charge.rawProviderPayload, purchaseFirst: true },
    createdAt: payStamp,
    updatedAt: payStamp,
  };

  writePaymentsDb((db) => {
    db.payments.unshift(payment);
    const o = db.orders.find((x) => x.id === order.id);
    if (!o) return;
    o.paymentId = payment.id;
    o.updatedAt = payStamp;
    o.metadata = { ...o.metadata, checkoutUrl: charge.checkoutUrl, processor: settings.provider };
    if (charge.status === "failed") {
      o.status = "failed";
      o.failureReason = charge.failureMessage;
    } else if (charge.status === "succeeded" || order.totalAmount === 0) {
      o.status = "paid";
      o.paidAt = payStamp;
      o.failureReason = null;
    }
    db.transactionLogs.unshift({
      id: generateId(),
      kind: "payment",
      referenceId: payment.id,
      actorId: existingUser?.id ?? null,
      studentId: o.studentId === GUEST_STUDENT_ID ? null : o.studentId,
      instructorId: o.items[0]?.instructorId ?? null,
      amount: o.totalAmount,
      currency: o.currency,
      description: `Purchase-first payment ${charge.status} for ${o.orderNumber}`,
      metadata: { provider: charge.provider, method: charge.methodBrand, purchaseFirst: true },
      createdAt: payStamp,
    });
  });

  const savedPayment = getPayment(payment.id)!;
  const savedOrder = getOrder(order.id)!;

  if (charge.status === "failed") {
    await logActivity({
      actorId: existingUser?.id ?? null,
      action: ACTIVITY_ACTIONS.PAYMENT_FAILED,
      entityType: "payment",
      entityId: payment.id,
      metadata: { purchaseFirst: true, email, createdAccount: false },
    });
    return {
      order: savedOrder,
      payment: savedPayment,
      checkoutUrl: null,
      accountCreated: false,
      attachedToExisting: false,
      emailSent: false,
      courseAssigned: false,
      temporaryPassword: null,
      loginUrl: quote.loginUrl,
      courseAccessUrl: quote.courseAccessUrl,
    };
  }

  if (charge.status === "requires_payment") {
    return {
      order: savedOrder,
      payment: savedPayment,
      checkoutUrl: charge.checkoutUrl,
      accountCreated: false,
      attachedToExisting: false,
      emailSent: false,
      courseAssigned: false,
      temporaryPassword: null,
      loginUrl: quote.loginUrl,
      courseAccessUrl: quote.courseAccessUrl,
    };
  }

  return fulfillGuestPaidOrder(savedOrder, savedPayment);
}

export async function fulfillGuestPaidOrder(
  orderInput: Order,
  payment: PaymentRecord,
): Promise<GuestPayResult> {
  const order = getOrder(orderInput.id);
  if (!order) throw new PaymentError("Order not found", 404);

  const quote = quoteGuestCheckout(order.items[0]?.productId);
  if (order.metadata.provisioned === true && order.studentId !== GUEST_STUDENT_ID) {
    if (order.status !== "paid") {
      await completePaidOrder(order, payment, order.studentId);
    }
    return {
      order: getOrder(order.id)!,
      payment,
      checkoutUrl: null,
      accountCreated: Boolean(order.metadata.accountCreated),
      attachedToExisting: Boolean(order.metadata.attachedToExisting),
      emailSent: Boolean(order.metadata.emailSent),
      courseAssigned: Boolean(order.metadata.courseAssigned),
      temporaryPassword: null,
      loginUrl: quote.loginUrl,
      courseAccessUrl: quote.courseAccessUrl,
    };
  }

  const email = sanitizeEmail(order.billingEmail || order.studentEmail);
  const firstName = String(
    order.metadata.guestFirstName || order.studentName.split(" ")[0] || "Aviator",
  );
  const lastName = String(
    order.metadata.guestLastName || order.studentName.split(" ").slice(1).join(" ") || "Student",
  );
  const phone = String(order.metadata.guestPhone || "");
  const country = String(order.metadata.guestCountry || order.billingCountry || "KW");

  const provisioned = provisionPurchaseFirstStudent({
    email,
    firstName,
    lastName,
    phone,
    country,
  });

  writePaymentsDb((db) => {
    const o = db.orders.find((x) => x.id === order.id);
    if (!o) return;
    o.studentId = provisioned.user.id;
    o.studentName = `${provisioned.user.firstName} ${provisioned.user.lastName}`.trim();
    o.studentEmail = provisioned.user.email;
    o.status = "paid";
    o.paidAt = o.paidAt ?? nowIso();
    o.updatedAt = nowIso();
    o.metadata = {
      ...o.metadata,
      purchaseFirst: true,
      provisioned: true,
      accountCreated: provisioned.accountCreated,
      attachedToExisting: provisioned.attachedToExisting,
      emailSent: false,
      courseAssigned: false,
    };
  });

  const bound = getOrder(order.id)!;
  const user = toUserProfile(findUserById(provisioned.user.id)!);

  const plan = await createInstallmentPlanForOrder({
    order: bound,
    user,
    mode: "full",
    installmentCount: 1,
    agreementAccepted: true,
    passportDocumentId: null,
    actorId: user.id,
  });
  for (const schedule of listScheduleForPlan(plan.id)) {
    if (schedule.status !== "paid") {
      await markInstallmentPaid({
        planId: plan.id,
        scheduleItemId: schedule.id,
        paymentId: payment.id,
        actorId: user.id,
      });
    }
  }

  await completePaidOrder(getOrder(order.id)!, payment, user.id);

  let emailSent = false;
  if (provisioned.temporaryPassword) {
    const brand = getPublicBrandConfig();
    const welcome = await dispatchEmailEvent({
      event: "registration",
      userIds: [user.id],
      to: user.email,
      subject: "Welcome to ATPL PASS — your account and course access",
      data: {
        recipientName: user.fullName || firstName,
        title: "Welcome to ATPL PASS",
        detail: `${bound.items[0]?.productName ?? "ATPL PASS"} is unlocked. Sign in with the temporary password below, then choose a new password. Invoice ${bound.orderNumber} is in your billing inbox.`,
        temporaryPassword: provisioned.temporaryPassword,
        accountEmail: user.email,
        loginUrl: quote.loginUrl,
        courseUrl: quote.courseAccessUrl,
        supportEmail: brand.supportEmail,
        reference: bound.orderNumber,
        amountLabel: formatMinor(bound.totalAmount, bound.currency),
        cta: "Sign in",
      },
      actorId: user.id,
      system: true,
      meta: { kind: "purchase_first_welcome", orderId: bound.id, passwordEmailed: true },
    });
    emailSent = welcome.sent > 0;
  } else {
    emailSent = true;
  }

  const enrolled = listStudentEnrollments(user.id).some((e) => e.status === "approved");
  writePaymentsDb((db) => {
    const o = db.orders.find((x) => x.id === order.id);
    if (!o) return;
    o.metadata = {
      ...o.metadata,
      emailSent,
      courseAssigned: enrolled,
      studentCreatedAutomatically: provisioned.accountCreated,
    };
    o.updatedAt = nowIso();
  });

  await dispatchRoleAlert({
    event: "admin_alert",
    title: "New purchase-first enrollment",
    detail: `${bound.orderNumber} · ${formatMinor(bound.totalAmount, bound.currency)} · ${email} · student ${provisioned.accountCreated ? "created automatically" : "attached to existing account"} · email ${emailSent ? "sent" : "queued"} · course ${enrolled ? "assigned" : "pending"}.`,
    reference: bound.orderNumber,
    actorId: user.id,
    system: true,
  });

  await logActivity({
    actorId: user.id,
    action: ACTIVITY_ACTIONS.PAYMENT_COMPLETED,
    entityType: "order",
    entityId: bound.id,
    metadata: {
      purchaseFirst: true,
      accountCreated: provisioned.accountCreated,
      attachedToExisting: provisioned.attachedToExisting,
      emailSent,
      courseAssigned: enrolled,
    },
  });

  return {
    order: getOrder(order.id)!,
    payment: getPayment(payment.id)!,
    checkoutUrl: null,
    accountCreated: provisioned.accountCreated,
    attachedToExisting: provisioned.attachedToExisting,
    emailSent,
    courseAssigned: enrolled,
    temporaryPassword: provisioned.temporaryPassword,
    loginUrl: quote.loginUrl,
    courseAccessUrl: quote.courseAccessUrl,
  };
}

function provisionPurchaseFirstStudent(input: {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  country: string;
}): {
  user: StoredUser;
  accountCreated: boolean;
  attachedToExisting: boolean;
  temporaryPassword: string | null;
} {
  const existing = findUserByEmail(input.email);
  if (existing) {
    writeAuthDb((d) => {
      const u = d.users.find((x) => x.id === existing.id);
      if (!u) return;
      if (!u.firstName) u.firstName = sanitizeString(input.firstName);
      if (!u.lastName) u.lastName = sanitizeString(input.lastName);
      if (!u.phone && input.phone) u.phone = input.phone;
      if (!u.countryCode) u.countryCode = input.country;
      if (!u.nationality) u.nationality = countryName(input.country);
      if (u.status === ACCOUNT_STATUS.PENDING && u.role !== ROLES.INSTRUCTOR) {
        u.status = ACCOUNT_STATUS.ACTIVE;
      }
      u.emailVerified = true;
      u.profileComplete = isStudentProfileComplete(u);
      u.updatedAt = nowIso();
    });
    const fresh = findUserById(existing.id)!;
    let temporaryPassword: string | null = null;
    if (!fresh.passwordHash || !fresh.passwordSalt) {
      temporaryPassword = generateSecurePassword(16);
      const { hash, salt } = hashPassword(temporaryPassword);
      writeAuthDb((d) => {
        const u = d.users.find((x) => x.id === fresh.id);
        if (!u) return;
        u.passwordHash = hash;
        u.passwordSalt = salt;
        u.mustChangePassword = true;
        u.updatedAt = nowIso();
      });
    }
    return {
      user: findUserById(fresh.id)!,
      accountCreated: false,
      attachedToExisting: true,
      temporaryPassword,
    };
  }

  const temporaryPassword = generateSecurePassword(16);
  const { hash, salt } = hashPassword(temporaryPassword);
  const ts = nowIso();
  const initials = `${input.firstName[0] ?? ""}${input.lastName[0] ?? ""}`;
  const created: StoredUser = {
    id: generateId(),
    email: input.email,
    firstName: sanitizeString(input.firstName),
    lastName: sanitizeString(input.lastName),
    phone: input.phone || null,
    countryCode: input.country,
    nationality: countryName(input.country),
    dateOfBirth: null,
    gender: null,
    city: null,
    bio: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    avatarUrl: defaultAvatarDataUri(initials),
    timezone: "UTC",
    language: "en",
    role: ROLES.STUDENT,
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
    if (db.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
      throw new PaymentError("An account with this email already exists.", 409);
    }
    db.users.push(created);
    db.notificationPreferences.push(defaultNotificationPreferences(created.id, false));
    db.securitySettings.push(defaultSecuritySettings(created.id));
  });

  void logActivity({
    actorId: created.id,
    action: ACTIVITY_ACTIONS.USER_CREATED,
    entityType: "user",
    entityId: created.id,
    metadata: { email: created.email, via: "purchase_first", role: created.role },
  });

  return {
    user: created,
    accountCreated: true,
    attachedToExisting: false,
    temporaryPassword,
  };
}
