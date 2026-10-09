/**
 * Payments durable store (.data/aep-payments.json).
 * Orders, invoices, payments, installments, wallet rows, and audit logs
 * live in indexed stores so student and instructor reads never hydrate
 * the whole catalog blob.
 */

import path from "path";

import { dataDir, readJsonFile, writeJsonFile } from "@/lib/data/json-file-store";
import {
  listAllInstallmentPlans,
  listAllInstallmentSchedule,
  replaceAllInstallmentPlans,
  replaceAllInstallmentSchedule,
} from "@/lib/data/lms-installment-store";
import {
  listAllTransactionLogs,
  listAllWalletTransactions,
  replaceAllTransactionLogs,
  replaceAllWalletTransactions,
} from "@/lib/data/lms-payment-activity-store";
import { listAllRefunds, replaceAllRefunds } from "@/lib/data/lms-refund-store";
import {
  listAllInvoices,
  listAllOrders,
  listAllPayments,
  replaceAllInvoices,
  replaceAllOrders,
  replaceAllPayments,
} from "@/lib/data/lms-payment-ledger-store";
import type {
  CatalogProduct,
  Coupon,
  CouponUsage,
  InstallmentPlan,
  InstallmentReminderLog,
  InstallmentScheduleItem,
  InstructorWallet,
  Invoice,
  Order,
  PaymentRecord,
  PaymentSettings,
  PayoutRequest,
  ProcessedProviderEvent,
  RefundRequest,
  RegionalPaymentRule,
  StudentKycDocument,
  Subscription,
  TransactionLog,
  WalletTransaction,
} from "@/types/payments";
import {
  DEFAULT_INSTALLMENT_REMINDER_OFFSETS_DAYS,
  DEFAULT_PAYMENT_AGREEMENT_TEXT,
  DEFAULT_PAYMENT_AGREEMENT_VERSION,
  DEFAULT_PAYMENT_CURRENCY,
  DEFAULT_PLATFORM_FEE_PERCENT,
  DEFAULT_TAX_RATE_PERCENT,
} from "@/constants/payments";

export interface PaymentsDatabase {
  settings: PaymentSettings;
  products: CatalogProduct[];
  coupons: Coupon[];
  couponUsages: CouponUsage[];
  orders: Order[];
  payments: PaymentRecord[];
  invoices: Invoice[];
  subscriptions: Subscription[];
  wallets: InstructorWallet[];
  walletTransactions: WalletTransaction[];
  payouts: PayoutRequest[];
  refunds: RefundRequest[];
  transactionLogs: TransactionLog[];
  regionalRules: RegionalPaymentRule[];
  installmentPlans: InstallmentPlan[];
  installmentSchedule: InstallmentScheduleItem[];
  installmentReminders: InstallmentReminderLog[];
  kycDocuments: StudentKycDocument[];
  processedProviderEvents: ProcessedProviderEvent[];
  seeded: boolean;
}

function dataFile() {
  return path.join(dataDir(), "aep-payments.json");
}

function defaultSettings(): PaymentSettings {
  return {
    provider: "mock",
    currency: DEFAULT_PAYMENT_CURRENCY,
    taxRatePercent: DEFAULT_TAX_RATE_PERCENT,
    platformFeePercent: DEFAULT_PLATFORM_FEE_PERCENT,
    payoutMinimumAmount: 10_000, // 10.000 KWD in fils
    allowApplePay: true,
    allowGooglePay: true,
    allowAmex: true,
    stripePublishableKeyConfigured: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    stripeWebhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    installmentReminderOffsetsDays: [...DEFAULT_INSTALLMENT_REMINDER_OFFSETS_DAYS],
    installmentGraceDays: 3,
    autoSuspendOnOverdue: true,
    agreementVersion: DEFAULT_PAYMENT_AGREEMENT_VERSION,
    agreementText: DEFAULT_PAYMENT_AGREEMENT_TEXT,
    defaultInstallmentCount: 4,
    revokeAccessOnRefund: false,
  };
}

function emptyDb(): PaymentsDatabase {
  return {
    settings: defaultSettings(),
    products: [],
    coupons: [],
    couponUsages: [],
    orders: [],
    payments: [],
    invoices: [],
    subscriptions: [],
    wallets: [],
    walletTransactions: [],
    payouts: [],
    refunds: [],
    transactionLogs: [],
    regionalRules: [],
    installmentPlans: [],
    installmentSchedule: [],
    installmentReminders: [],
    kycDocuments: [],
    processedProviderEvents: [],
    seeded: false,
  };
}

function normalizeDb(raw: Partial<PaymentsDatabase>): PaymentsDatabase {
  return {
    ...emptyDb(),
    ...raw,
    settings: { ...defaultSettings(), ...(raw.settings ?? {}) },
    products: raw.products ?? [],
    coupons: raw.coupons ?? [],
    couponUsages: raw.couponUsages ?? [],
    orders: raw.orders ?? [],
    payments: (raw.payments ?? []).map(normalizePayment),
    invoices: raw.invoices ?? [],
    subscriptions: raw.subscriptions ?? [],
    wallets: raw.wallets ?? [],
    walletTransactions: raw.walletTransactions ?? [],
    payouts: raw.payouts ?? [],
    refunds: raw.refunds ?? [],
    transactionLogs: raw.transactionLogs ?? [],
    regionalRules: raw.regionalRules ?? [],
    installmentPlans: raw.installmentPlans ?? [],
    installmentSchedule: raw.installmentSchedule ?? [],
    installmentReminders: raw.installmentReminders ?? [],
    kycDocuments: raw.kycDocuments ?? [],
    processedProviderEvents: (raw.processedProviderEvents ?? []).slice(0, 400),
    seeded: Boolean(raw.seeded),
  };
}

export function blankStripePaymentFields(): Pick<
  PaymentRecord,
  | "stripeCustomerId"
  | "checkoutSessionId"
  | "paymentIntentId"
  | "stripeInvoiceId"
  | "receiptUrl"
  | "stripeFeeMinor"
  | "netAmountMinor"
  | "country"
  | "billingAddressSnapshot"
  | "studentId"
  | "courseId"
  | "stripeEventId"
  | "invoiceNumber"
> {
  return {
    stripeCustomerId: null,
    checkoutSessionId: null,
    paymentIntentId: null,
    stripeInvoiceId: null,
    receiptUrl: null,
    stripeFeeMinor: null,
    netAmountMinor: null,
    country: null,
    billingAddressSnapshot: null,
    studentId: null,
    courseId: null,
    stripeEventId: null,
    invoiceNumber: null,
  };
}

function normalizePayment(raw: PaymentRecord): PaymentRecord {
  return {
    ...raw,
    ...blankStripePaymentFields(),
    stripeCustomerId: raw.stripeCustomerId ?? null,
    checkoutSessionId: raw.checkoutSessionId ?? null,
    paymentIntentId: raw.paymentIntentId ?? null,
    stripeInvoiceId: raw.stripeInvoiceId ?? null,
    receiptUrl: raw.receiptUrl ?? null,
    stripeFeeMinor: raw.stripeFeeMinor ?? null,
    netAmountMinor: raw.netAmountMinor ?? null,
    country: raw.country ?? null,
    billingAddressSnapshot: raw.billingAddressSnapshot ?? null,
    studentId: raw.studentId ?? null,
    courseId: raw.courseId ?? null,
    stripeEventId: raw.stripeEventId ?? null,
    invoiceNumber: raw.invoiceNumber ?? null,
  };
}

function catalogSnapshot(db: PaymentsDatabase): PaymentsDatabase {
  return {
    settings: db.settings,
    products: db.products,
    coupons: db.coupons,
    couponUsages: db.couponUsages,
    orders: [],
    payments: [],
    invoices: [],
    subscriptions: db.subscriptions,
    wallets: db.wallets,
    walletTransactions: [],
    payouts: db.payouts,
    refunds: [],
    transactionLogs: [],
    regionalRules: db.regionalRules,
    installmentPlans: [],
    installmentSchedule: [],
    installmentReminders: db.installmentReminders,
    kycDocuments: db.kycDocuments,
    processedProviderEvents: (db.processedProviderEvents ?? []).slice(0, 400),
    seeded: db.seeded,
  };
}

function persistCatalog(db: PaymentsDatabase): void {
  writeJsonFile(dataFile(), catalogSnapshot(db));
}

function extractEmbeddedRefunds(db: PaymentsDatabase): void {
  const embedded = db.refunds ?? [];
  if (embedded.length === 0) return;
  const existing = listAllRefunds();
  replaceAllRefunds(existing.length > 0 ? [...existing, ...embedded] : embedded);
  db.refunds = [];
  persistCatalog(db);
}

function extractEmbeddedActivity(db: PaymentsDatabase): void {
  const embeddedWallet = db.walletTransactions ?? [];
  const embeddedLogs = db.transactionLogs ?? [];
  if (embeddedWallet.length === 0 && embeddedLogs.length === 0) return;
  if (embeddedWallet.length > 0) {
    const existing = listAllWalletTransactions();
    replaceAllWalletTransactions(
      existing.length > 0 ? [...existing, ...embeddedWallet] : embeddedWallet,
    );
    db.walletTransactions = [];
  }
  if (embeddedLogs.length > 0) {
    const existing = listAllTransactionLogs();
    replaceAllTransactionLogs(existing.length > 0 ? [...existing, ...embeddedLogs] : embeddedLogs);
    db.transactionLogs = [];
  }
  persistCatalog(db);
}

function extractEmbeddedLedger(db: PaymentsDatabase): void {
  const embeddedOrders = db.orders ?? [];
  const embeddedInvoices = db.invoices ?? [];
  const embeddedPayments = (db.payments ?? []).map(normalizePayment);
  if (
    embeddedOrders.length === 0 &&
    embeddedInvoices.length === 0 &&
    embeddedPayments.length === 0
  ) {
    return;
  }
  if (embeddedOrders.length > 0) {
    const existing = listAllOrders();
    replaceAllOrders(existing.length > 0 ? [...existing, ...embeddedOrders] : embeddedOrders);
    db.orders = [];
  }
  if (embeddedInvoices.length > 0) {
    const existing = listAllInvoices();
    replaceAllInvoices(existing.length > 0 ? [...existing, ...embeddedInvoices] : embeddedInvoices);
    db.invoices = [];
  }
  if (embeddedPayments.length > 0) {
    const existing = listAllPayments();
    replaceAllPayments(existing.length > 0 ? [...existing, ...embeddedPayments] : embeddedPayments);
    db.payments = [];
  }
  persistCatalog(db);
}

function extractEmbeddedInstallments(db: PaymentsDatabase): void {
  const embeddedPlans = db.installmentPlans ?? [];
  const embeddedSchedule = db.installmentSchedule ?? [];
  if (embeddedPlans.length === 0 && embeddedSchedule.length === 0) return;
  if (embeddedPlans.length > 0) {
    const existing = listAllInstallmentPlans();
    replaceAllInstallmentPlans(
      existing.length > 0 ? [...existing, ...embeddedPlans] : embeddedPlans,
    );
    db.installmentPlans = [];
  }
  if (embeddedSchedule.length > 0) {
    const existing = listAllInstallmentSchedule();
    replaceAllInstallmentSchedule(
      existing.length > 0 ? [...existing, ...embeddedSchedule] : embeddedSchedule,
    );
    db.installmentSchedule = [];
  }
  persistCatalog(db);
}

function withLedgerView(db: PaymentsDatabase): PaymentsDatabase {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "orders") return listAllOrders();
      if (prop === "invoices") return listAllInvoices();
      if (prop === "payments") return listAllPayments();
      if (prop === "installmentPlans") return listAllInstallmentPlans();
      if (prop === "installmentSchedule") return listAllInstallmentSchedule();
      if (prop === "walletTransactions") return listAllWalletTransactions();
      if (prop === "transactionLogs") return listAllTransactionLogs();
      if (prop === "refunds") return listAllRefunds();
      return Reflect.get(target, prop, receiver);
    },
  });
}

function withLazyLedgerWrites(catalog: PaymentsDatabase): {
  working: PaymentsDatabase;
  flushLedger: () => void;
} {
  let ordersLoaded = false;
  let orders: Order[] = [];
  let invoicesLoaded = false;
  let invoices: Invoice[] = [];
  let paymentsLoaded = false;
  let payments: PaymentRecord[] = [];
  let plansLoaded = false;
  let installmentPlans: InstallmentPlan[] = [];
  let scheduleLoaded = false;
  let installmentSchedule: InstallmentScheduleItem[] = [];
  let walletLoaded = false;
  let walletTransactions: WalletTransaction[] = [];
  let logsLoaded = false;
  let transactionLogs: TransactionLog[] = [];
  let refundsLoaded = false;
  let refunds: RefundRequest[] = [];
  const working = {
    ...catalog,
    orders: [],
    invoices: [],
    payments: [],
    installmentPlans: [],
    installmentSchedule: [],
    walletTransactions: [],
    transactionLogs: [],
    refunds: [],
  };
  Object.defineProperty(working, "orders", {
    configurable: true,
    enumerable: true,
    get() {
      if (!ordersLoaded) {
        orders = listAllOrders();
        ordersLoaded = true;
      }
      return orders;
    },
    set(value: Order[]) {
      orders = Array.isArray(value) ? value : [];
      ordersLoaded = true;
    },
  });
  Object.defineProperty(working, "invoices", {
    configurable: true,
    enumerable: true,
    get() {
      if (!invoicesLoaded) {
        invoices = listAllInvoices();
        invoicesLoaded = true;
      }
      return invoices;
    },
    set(value: Invoice[]) {
      invoices = Array.isArray(value) ? value : [];
      invoicesLoaded = true;
    },
  });
  Object.defineProperty(working, "payments", {
    configurable: true,
    enumerable: true,
    get() {
      if (!paymentsLoaded) {
        payments = listAllPayments();
        paymentsLoaded = true;
      }
      return payments;
    },
    set(value: PaymentRecord[]) {
      payments = Array.isArray(value) ? value : [];
      paymentsLoaded = true;
    },
  });
  Object.defineProperty(working, "installmentPlans", {
    configurable: true,
    enumerable: true,
    get() {
      if (!plansLoaded) {
        installmentPlans = listAllInstallmentPlans();
        plansLoaded = true;
      }
      return installmentPlans;
    },
    set(value: InstallmentPlan[]) {
      installmentPlans = Array.isArray(value) ? value : [];
      plansLoaded = true;
    },
  });
  Object.defineProperty(working, "installmentSchedule", {
    configurable: true,
    enumerable: true,
    get() {
      if (!scheduleLoaded) {
        installmentSchedule = listAllInstallmentSchedule();
        scheduleLoaded = true;
      }
      return installmentSchedule;
    },
    set(value: InstallmentScheduleItem[]) {
      installmentSchedule = Array.isArray(value) ? value : [];
      scheduleLoaded = true;
    },
  });
  Object.defineProperty(working, "walletTransactions", {
    configurable: true,
    enumerable: true,
    get() {
      if (!walletLoaded) {
        walletTransactions = listAllWalletTransactions();
        walletLoaded = true;
      }
      return walletTransactions;
    },
    set(value: WalletTransaction[]) {
      walletTransactions = Array.isArray(value) ? value : [];
      walletLoaded = true;
    },
  });
  Object.defineProperty(working, "transactionLogs", {
    configurable: true,
    enumerable: true,
    get() {
      if (!logsLoaded) {
        transactionLogs = listAllTransactionLogs();
        logsLoaded = true;
      }
      return transactionLogs;
    },
    set(value: TransactionLog[]) {
      transactionLogs = Array.isArray(value) ? value : [];
      logsLoaded = true;
    },
  });
  Object.defineProperty(working, "refunds", {
    configurable: true,
    enumerable: true,
    get() {
      if (!refundsLoaded) {
        refunds = listAllRefunds();
        refundsLoaded = true;
      }
      return refunds;
    },
    set(value: RefundRequest[]) {
      refunds = Array.isArray(value) ? value : [];
      refundsLoaded = true;
    },
  });
  return {
    working,
    flushLedger() {
      if (ordersLoaded) replaceAllOrders(orders);
      if (invoicesLoaded) replaceAllInvoices(invoices);
      if (paymentsLoaded) replaceAllPayments(payments.map(normalizePayment));
      if (plansLoaded) replaceAllInstallmentPlans(installmentPlans);
      if (scheduleLoaded) replaceAllInstallmentSchedule(installmentSchedule);
      if (walletLoaded) replaceAllWalletTransactions(walletTransactions);
      if (logsLoaded) replaceAllTransactionLogs(transactionLogs);
      if (refundsLoaded) replaceAllRefunds(refunds);
    },
  };
}

export function ensurePaymentsStore(): PaymentsDatabase {
  const db = normalizeDb(readJsonFile<Partial<PaymentsDatabase>>(dataFile(), emptyDb));
  extractEmbeddedRefunds(db);
  extractEmbeddedActivity(db);
  extractEmbeddedInstallments(db);
  extractEmbeddedLedger(db);
  db.orders = [];
  db.invoices = [];
  db.payments = [];
  db.installmentPlans = [];
  db.installmentSchedule = [];
  db.walletTransactions = [];
  db.transactionLogs = [];
  db.refunds = [];
  return db;
}

export function readPaymentsDb(): PaymentsDatabase {
  return withLedgerView(ensurePaymentsStore());
}

export function writePaymentsDb(mutator: (db: PaymentsDatabase) => void): PaymentsDatabase {
  const catalog = ensurePaymentsStore();
  const { working, flushLedger } = withLazyLedgerWrites(catalog);
  mutator(working);
  flushLedger();
  persistCatalog(working);
  return withLedgerView(ensurePaymentsStore());
}
