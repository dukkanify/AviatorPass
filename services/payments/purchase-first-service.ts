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
import { logActivity, logAudit } from "@/services/auth/activity-log";
import { issuePasswordSetupToken } from "@/services/auth/password-setup-service";
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
import { emitNotification } from "@/services/notifications/notification-service";
import { PaymentError } from "@/services/payments/access";
import { getProduct, listProducts } from "@/services/payments/catalog-service";
import { completePaidOrder, getOrder, getPayment } from "@/services/payments/checkout-service";
import {
  detectCheckoutCurrency,
  type CurrencyDetection,
} from "@/services/payments/currency-detection";
import { getPaymentGateway } from "@/services/payments/gateway";
import {
  createInstallmentPlanForOrder,
  listScheduleForPlan,
  markInstallmentPaid,
} from "@/services/payments/installment-service";
import { calcTax, formatMinor } from "@/services/payments/money";
import { getRegionalPaymentRule } from "@/services/payments/regional-rules-service";
import { isStripeConfigured } from "@/services/payments/stripe-client";
import { tryResolveStripePrice } from "@/services/payments/stripe-catalog";
import {
  blankStripePaymentFields,
  readPaymentsDb,
  writePaymentsDb,
} from "@/services/payments/store";
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
  hostedCheckout: boolean;
  detectedCountry: string | null;
  detectedCurrency: string;
  detectionSource: string;
  stripePriceId: string | null;
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
  passwordSetupUrl: string | null;
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
  const detection = detectCheckoutCurrency({ country });
  const subtotal = product.isFree ? 0 : product.priceAmount;
  const taxAmount = calcTax(subtotal, settings.taxRatePercent);
  const totalAmount = subtotal + taxAmount;
  const brand = getPublicBrandConfig();
  const origin = appOrigin();
  const hosted = isStripeConfigured();
  return {
    product,
    currency: product.currency || settings.currency,
    subtotalAmount: subtotal,
    taxAmount,
    taxRatePercent: settings.taxRatePercent,
    totalAmount,
    totalLabel: formatMinor(totalAmount, product.currency || settings.currency),
    methods: listGuestCheckoutMethods(country),
    processor: hosted ? "stripe" : settings.provider,
    supportEmail: brand.supportEmail,
    loginUrl: `${origin}${routes.login}`,
    courseAccessUrl: `${origin}/student/courses`,
    hostedCheckout: hosted,
    detectedCountry: detection.country,
    detectedCurrency: detection.currency,
    detectionSource: detection.source,
    stripePriceId: null,
  };
}

export async function quotePublicCheckout(input: {
  productId?: string | null;
  country?: string | null;
  locale?: string | null;
  geoCountry?: string | null;
}): Promise<GuestCheckoutQuote> {
  const detection = detectCheckoutCurrency({
    country: input.country,
    geoCountry: input.geoCountry,
    locale: input.locale,
  });
  const base = quoteGuestCheckout(input.productId, detection.country ?? "US");
  const stripePrice = await tryResolveStripePrice(detection.currency);
  if (!stripePrice) {
    return {
      ...base,
      detectedCountry: detection.country,
      detectedCurrency: detection.currency,
      detectionSource: detection.source,
    };
  }
  return {
    ...base,
    currency: stripePrice.currency,
    subtotalAmount: stripePrice.unitAmount,
    taxAmount: 0,
    taxRatePercent: 0,
    totalAmount: stripePrice.unitAmount,
    totalLabel: formatMinor(stripePrice.unitAmount, stripePrice.currency),
    processor: "stripe",
    hostedCheckout: true,
    detectedCountry: detection.country,
    detectedCurrency: stripePrice.currency,
    detectionSource: detection.source,
    stripePriceId: stripePrice.stripePriceId,
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
    checkoutSessionId:
      typeof order.metadata.checkoutSessionId === "string"
        ? order.metadata.checkoutSessionId
        : null,
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
      passwordSetupUrl: null,
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
    successUrl: `${origin}${routes.welcome}?session_id={CHECKOUT_SESSION_ID}`,
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
    ...blankStripePaymentFields(),
    checkoutSessionId: charge.checkoutSessionId,
    stripeCustomerId: charge.stripeCustomerId,
    country: input.country.toUpperCase(),
    billingAddressSnapshot: sanitizeString(input.billingAddress || ""),
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
      passwordSetupUrl: null,
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
      passwordSetupUrl: null,
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
      passwordSetupUrl: null,
      loginUrl: quote.loginUrl,
      courseAccessUrl: quote.courseAccessUrl,
    };
  }

  const email = sanitizeEmail(order.billingEmail || order.studentEmail);
  if (!email || email.includes(".invalid") || email.endsWith("@invalid.local")) {
    throw new PaymentError("Customer email is required before enrollment", 422);
  }
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

  const brand = getPublicBrandConfig();
  let emailSent = false;
  if (provisioned.accountCreated || provisioned.passwordSetupUrl) {
    const welcome = await dispatchEmailEvent({
      event: "registration",
      userIds: [user.id],
      to: user.email,
      subject: "Welcome to ATPL PASS — set your password",
      data: {
        recipientName: user.fullName || firstName,
        title: "Welcome to ATPL PASS",
        detail: `${bound.items[0]?.productName ?? "ATPL PASS"} is unlocked. Set your password with the secure link below, then sign in. Invoice ${bound.orderNumber} is in your billing inbox.`,
        passwordSetupUrl: provisioned.passwordSetupUrl,
        temporaryPassword: provisioned.passwordSetupUrl ? "" : provisioned.temporaryPassword,
        accountEmail: user.email,
        loginUrl: quote.loginUrl,
        courseUrl: quote.courseAccessUrl,
        supportEmail: brand.supportEmail,
        reference: bound.orderNumber,
        amountLabel: formatMinor(bound.totalAmount, bound.currency),
        cta: "Set your password",
      },
      actorId: user.id,
      system: true,
      meta: {
        kind: "purchase_first_welcome",
        orderId: bound.id,
        setupLink: Boolean(provisioned.passwordSetupUrl),
      },
    });
    emailSent = welcome.sent > 0;
  } else {
    const confirm = await dispatchEmailEvent({
      event: "payment",
      userIds: [user.id],
      to: user.email,
      subject: "ATPL PASS purchase confirmed",
      data: {
        recipientName: user.fullName || firstName,
        title: "Purchase confirmed",
        detail: `${bound.items[0]?.productName ?? "ATPL PASS"} is active on your existing AviatorPass account.`,
        loginUrl: quote.loginUrl,
        courseUrl: quote.courseAccessUrl,
        supportEmail: brand.supportEmail,
        reference: bound.orderNumber,
        amountLabel: formatMinor(bound.totalAmount, bound.currency),
        cta: "Open your course",
      },
      actorId: user.id,
      system: true,
      meta: { kind: "purchase_first_existing", orderId: bound.id },
    });
    emailSent = confirm.sent > 0;
  }

  await emitNotification({
    userId: user.id,
    type: provisioned.accountCreated ? "account.welcome" : "payment.succeeded",
    title: provisioned.accountCreated ? "Account created" : "Course activated",
    body: provisioned.accountCreated
      ? "Your AviatorPass student account is ready. Check your email to set a password."
      : `${bound.items[0]?.productName ?? "ATPL PASS"} is now on your account.`,
    actionUrl: "/student/courses",
    email: false,
    dedupeKey: `purchase-first:${bound.id}:${user.id}`,
  });

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
  await logAudit({
    actorId: user.id,
    action: provisioned.accountCreated
      ? "users.purchase_first_created"
      : "payments.attached_existing",
    resource: `order:${bound.id}`,
    afterState: {
      email,
      accountCreated: provisioned.accountCreated,
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
    passwordSetupUrl: provisioned.passwordSetupUrl,
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
  passwordSetupUrl: string | null;
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
    let passwordSetupUrl: string | null = null;
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
      passwordSetupUrl = issuePasswordSetupToken(fresh.id).url;
    }
    return {
      user: findUserById(fresh.id)!,
      accountCreated: false,
      attachedToExisting: true,
      temporaryPassword,
      passwordSetupUrl,
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
    passwordSetupUrl: issuePasswordSetupToken(created.id).url,
  };
}

export async function startHostedCheckout(input: {
  productId?: string | null;
  country?: string | null;
  locale?: string | null;
  geoCountry?: string | null;
  email?: string | null;
  ipAddress?: string | null;
}): Promise<{
  checkoutUrl: string;
  sessionId: string;
  orderId: string;
  currency: string;
  detection: CurrencyDetection;
}> {
  if (!isStripeConfigured()) {
    throw new PaymentError("Stripe Checkout is not configured", 503);
  }

  const rl = rateLimit(`stripe-checkout:${input.ipAddress || "unknown"}`, 8, 15 * 60_000);
  if (!rl.allowed) {
    throw new PaymentError("Too many checkout attempts. Please wait a few minutes and retry.", 429);
  }

  const quote = await quotePublicCheckout({
    productId: input.productId,
    country: input.country,
    locale: input.locale,
    geoCountry: input.geoCountry,
  });
  const product = quote.product;
  const detection = detectCheckoutCurrency({
    country: input.country,
    geoCountry: input.geoCountry,
    locale: input.locale,
  });
  const email = input.email ? sanitizeEmail(input.email) : "";
  const existingUser = email ? findUserByEmail(email) : null;
  if (existingUser && alreadyOwnsProduct(existingUser.id, product.id)) {
    throw new PaymentError("This email already has ATPL PASS. Sign in to continue learning.", 409);
  }

  const stamp = nowIso();
  const origin = appOrigin();
  const placeholderEmail = email || `pending+${generateId().slice(0, 10)}@checkout.invalid`;
  const country = (detection.country ?? "US").toUpperCase();
  const item: OrderItem = {
    id: generateId(),
    productId: product.id,
    productName: product.name,
    courseId: product.courseId,
    instructorId: product.instructorId,
    pricingModel: product.pricingModel,
    unitAmount: quote.subtotalAmount,
    quantity: 1,
    discountAmount: 0,
    taxAmount: quote.taxAmount,
    totalAmount: quote.totalAmount,
  };

  const order: Order = {
    id: generateId(),
    orderNumber: nextOrderNumber(),
    studentId: GUEST_STUDENT_ID,
    studentName: "Checkout guest",
    studentEmail: placeholderEmail,
    status: "pending",
    currency: quote.currency,
    subtotalAmount: quote.subtotalAmount,
    discountAmount: 0,
    taxAmount: quote.taxAmount,
    taxRatePercent: quote.taxRatePercent,
    totalAmount: quote.totalAmount,
    couponId: null,
    couponCode: null,
    billingName: "Checkout guest",
    billingEmail: placeholderEmail,
    billingCountry: country,
    billingAddress: "",
    items: [item],
    paymentId: null,
    invoiceId: null,
    idempotencyKey: `stripe-${generateToken(12)}`,
    failureReason: null,
    paidAt: null,
    cancelledAt: null,
    expiresAt: new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60_000).toISOString(),
    metadata: {
      purchaseFirst: true,
      hostedCheckout: true,
      guestCountry: country,
      detectedCurrency: detection.currency,
      detectionSource: detection.source,
      stripePriceId: quote.stripePriceId,
    },
    createdAt: stamp,
    updatedAt: stamp,
  };

  writePaymentsDb((db) => {
    db.orders.unshift(order);
  });

  await logActivity({
    actorId: existingUser?.id ?? null,
    action: ACTIVITY_ACTIONS.CHECKOUT_STARTED,
    entityType: "order",
    entityId: order.id,
    metadata: {
      purchaseFirst: true,
      hostedCheckout: true,
      productId: product.id,
      currency: quote.currency,
    },
  });

  const gateway = getPaymentGateway();
  const charge = await gateway.createPayment({
    orderId: order.id,
    amount: order.totalAmount,
    currency: order.currency,
    customerEmail: email || placeholderEmail,
    customerName: "ATPL PASS student",
    methodBrand: "card",
    stripePriceId: quote.stripePriceId ?? undefined,
    country,
    locale: input.locale ?? undefined,
    idempotencyKey: `${order.idempotencyKey}-pay`,
    successUrl: `${origin}${routes.welcome}?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}${routes.checkout}?canceled=1&productId=${product.id}`,
  });

  if (!charge.checkoutUrl) {
    throw new PaymentError("Stripe did not return a Checkout URL", 502);
  }

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
    webhookVerified: false,
    failureCode: charge.failureCode,
    failureMessage: charge.failureMessage,
    rawProviderPayload: { ...charge.rawProviderPayload, purchaseFirst: true, hostedCheckout: true },
    createdAt: payStamp,
    updatedAt: payStamp,
    ...blankStripePaymentFields(),
    checkoutSessionId: charge.checkoutSessionId ?? charge.providerPaymentId,
    stripeCustomerId: charge.stripeCustomerId,
    country,
  };

  writePaymentsDb((db) => {
    db.payments.unshift(payment);
    const o = db.orders.find((x) => x.id === order.id);
    if (!o) return;
    o.paymentId = payment.id;
    o.updatedAt = payStamp;
    o.metadata = {
      ...o.metadata,
      checkoutUrl: charge.checkoutUrl,
      checkoutSessionId: payment.checkoutSessionId,
      processor: "stripe",
    };
  });

  return {
    checkoutUrl: charge.checkoutUrl,
    sessionId: payment.checkoutSessionId ?? charge.providerPaymentId,
    orderId: order.id,
    currency: quote.currency,
    detection,
  };
}

export function getWelcomeBySessionId(sessionId: string) {
  const payment = readPaymentsDb().payments.find(
    (p) => p.checkoutSessionId === sessionId || p.providerPaymentId === sessionId,
  );
  if (!payment) return null;
  const order = getOrder(payment.orderId);
  if (!order || !order.metadata?.purchaseFirst) return null;
  const invoiceId = order.invoiceId;
  return {
    ...publicOrderSnapshot(order),
    paymentStatus: payment.status,
    receiptUrl: payment.receiptUrl,
    currency: payment.currency,
    amountPaid: payment.amount,
    amountLabel: formatMinor(payment.amount, payment.currency),
    country: payment.country,
    invoiceId,
    invoicePrintUrl: invoiceId
      ? `/api/public/checkout/invoice?session_id=${encodeURIComponent(sessionId)}`
      : null,
    loginUrl: `${appOrigin()}${routes.login}`,
    courseAccessUrl: `${appOrigin()}/student/courses`,
    dashboardUrl: `${appOrigin()}${routes.studentDashboard}`,
    setupPasswordPath: routes.setupPassword,
    supportEmail: getPublicBrandConfig().supportEmail,
  };
}
