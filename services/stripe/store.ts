/**
 * Stripe Checkout durable store (.data/aep-stripe.json).
 */

import path from "path";

import { dataDir, readJsonFile, writeJsonFile } from "@/lib/data/json-file-store";
import { generateId } from "@/lib/security/crypto";
import { stripeCancelUrl, stripeSuccessUrl } from "@/services/stripe/config";
import type { StripeCheckoutRecord } from "@/services/stripe/types";

export interface StripeDatabase {
  checkouts: StripeCheckoutRecord[];
}

function dataFile() {
  return path.join(dataDir(), "aep-stripe.json");
}

function emptyDb(): StripeDatabase {
  return { checkouts: [] };
}

export function readStripeDb(): StripeDatabase {
  const raw = readJsonFile<Partial<StripeDatabase>>(dataFile(), emptyDb);
  return { checkouts: raw.checkouts ?? [] };
}

export function writeStripeDb(mutator: (db: StripeDatabase) => void): StripeDatabase {
  const db = readStripeDb();
  mutator(db);
  writeJsonFile(dataFile(), db);
  return db;
}

export function findCheckoutBySessionId(sessionId: string): StripeCheckoutRecord | null {
  return readStripeDb().checkouts.find((row) => row.stripeSessionId === sessionId) ?? null;
}

export function findCheckoutByOrderId(orderId: string): StripeCheckoutRecord | null {
  return readStripeDb().checkouts.find((row) => row.orderId === orderId) ?? null;
}

export function findCheckoutByPaymentIntentId(
  paymentIntentId: string,
): StripeCheckoutRecord | null {
  return (
    readStripeDb().checkouts.find((row) => row.stripePaymentIntentId === paymentIntentId) ?? null
  );
}

export function findCheckoutById(id: string): StripeCheckoutRecord | null {
  return readStripeDb().checkouts.find((row) => row.id === id) ?? null;
}

export function upsertCheckout(record: StripeCheckoutRecord): StripeCheckoutRecord {
  writeStripeDb((db) => {
    const idx = db.checkouts.findIndex(
      (row) => row.id === record.id || row.stripeSessionId === record.stripeSessionId,
    );
    if (idx >= 0) db.checkouts[idx] = record;
    else db.checkouts.unshift(record);
    if (db.checkouts.length > 5000) db.checkouts = db.checkouts.slice(0, 5000);
  });
  return record;
}

export function resetStripeStoreForTests() {
  writeStripeDb((db) => {
    db.checkouts = [];
  });
}

export function recordPendingCheckout(input: {
  sessionId: string;
  orderId: string;
  paymentId: string;
  courseId: string;
  studentId: string;
  instructorId: string;
  currency: string;
  amount: number;
  checkoutUrl: string | null;
}): StripeCheckoutRecord {
  const stamp = new Date().toISOString();
  return upsertCheckout({
    id: generateId(),
    stripeSessionId: input.sessionId,
    stripePaymentIntentId: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripeConnectAccountId: null,
    mode: "payment",
    status: "pending",
    courseId: input.courseId,
    studentId: input.studentId,
    instructorId: input.instructorId,
    currency: input.currency,
    amount: input.amount,
    enrollmentId: null,
    orderId: input.orderId,
    paymentId: input.paymentId,
    checkoutUrl: input.checkoutUrl,
    successUrl: stripeSuccessUrl(),
    cancelUrl: stripeCancelUrl(),
    failureMessage: null,
    createdAt: stamp,
    updatedAt: stamp,
    paidAt: null,
  });
}
