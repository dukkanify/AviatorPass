/**
 * Indexed student payment ledger — never hydrate every order/invoice/charge
 * to find one student's billing history.
 *
 * Production: Postgres tables keyed by student / order / payment.
 * Local / tests: `.data/aep-payment-*.json` with in-memory indexes.
 * These are transactional rows and are never capped.
 */

import path from "node:path";

import {
  dataDir,
  postgresStoreEnabled,
  readJsonFile,
  writeJsonFile,
} from "@/lib/data/json-file-store";
import { neonSql } from "@/lib/data/neon-sql-sync";
import type { Invoice, Order, PaymentRecord } from "@/types/payments";

const ORDER_FILE = path.join(dataDir(), "aep-payment-orders.json");
const INVOICE_FILE = path.join(dataDir(), "aep-payment-invoices.json");
const PAYMENT_FILE = path.join(dataDir(), "aep-payment-records.json");

const ORDER_TABLE = "aep_lms_payment_orders";
const INVOICE_TABLE = "aep_lms_payment_invoices";
const PAYMENT_TABLE = "aep_lms_payment_records";

type OrderFile = { orders: Order[] };
type InvoiceFile = { invoices: Invoice[] };
type PaymentFile = { payments: PaymentRecord[] };

let tablesReady = false;
let orderIndex: {
  byId: Map<string, Order>;
  byStudent: Map<string, Order[]>;
  byEmail: Map<string, Order[]>;
  byStatus: Map<string, Order[]>;
  byIdempotency: Map<string, Order>;
} | null = null;
let invoiceIndex: {
  byId: Map<string, Invoice>;
  byStudent: Map<string, Invoice[]>;
  byPayment: Map<string, Invoice>;
} | null = null;
let paymentIndex: {
  byId: Map<string, PaymentRecord>;
  byOrder: Map<string, PaymentRecord[]>;
  byProviderRef: Map<string, PaymentRecord>;
} | null = null;

function sqlEnabled(): boolean {
  return postgresStoreEnabled();
}

function emailKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function asOrder(row: unknown): Order | null {
  if (!row || typeof row !== "object") return null;
  const value = row as Order;
  if (!value.id || !value.studentId) return null;
  return value;
}

function asInvoice(row: unknown): Invoice | null {
  if (!row || typeof row !== "object") return null;
  const value = row as Invoice;
  if (!value.id || !value.studentId || !value.orderId) return null;
  return value;
}

function asPayment(row: unknown): PaymentRecord | null {
  if (!row || typeof row !== "object") return null;
  const value = row as PaymentRecord;
  if (!value.id || !value.orderId) return null;
  return {
    ...value,
    stripeCustomerId: value.stripeCustomerId ?? null,
    checkoutSessionId: value.checkoutSessionId ?? null,
    paymentIntentId: value.paymentIntentId ?? null,
    stripeInvoiceId: value.stripeInvoiceId ?? null,
    receiptUrl: value.receiptUrl ?? null,
    stripeFeeMinor: value.stripeFeeMinor ?? null,
    netAmountMinor: value.netAmountMinor ?? null,
    country: value.country ?? null,
    billingAddressSnapshot: value.billingAddressSnapshot ?? null,
    studentId: value.studentId ?? null,
    courseId: value.courseId ?? null,
    stripeEventId: value.stripeEventId ?? null,
    invoiceNumber: value.invoiceNumber ?? null,
  };
}

function payloadFromSql<T>(
  row: { payload?: unknown },
  parse: (value: unknown) => T | null,
): T | null {
  return parse(row.payload);
}

function ensureSqlTables(): void {
  if (tablesReady || !sqlEnabled()) return;
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${ORDER_TABLE} (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      status TEXT NOT NULL,
      student_email TEXT,
      billing_email TEXT,
      idempotency_key TEXT,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_payment_orders_student_idx ON ${ORDER_TABLE} (student_id)`,
  );
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_payment_orders_status_idx ON ${ORDER_TABLE} (status)`,
  );
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_payment_orders_email_idx ON ${ORDER_TABLE} (student_email)`,
  );
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_payment_orders_billing_idx ON ${ORDER_TABLE} (billing_email)`,
  );
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_payment_orders_idempotency_idx ON ${ORDER_TABLE} (idempotency_key)`,
  );
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${INVOICE_TABLE} (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      payment_id TEXT,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_payment_invoices_student_idx ON ${INVOICE_TABLE} (student_id)`,
  );
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_payment_invoices_payment_idx ON ${INVOICE_TABLE} (payment_id)`,
  );
  neonSql(`
    CREATE TABLE IF NOT EXISTS ${PAYMENT_TABLE} (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      student_id TEXT,
      provider_payment_id TEXT,
      checkout_session_id TEXT,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_payment_records_order_idx ON ${PAYMENT_TABLE} (order_id)`,
  );
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_payment_records_provider_idx ON ${PAYMENT_TABLE} (provider_payment_id)`,
  );
  neonSql(
    `CREATE INDEX IF NOT EXISTS aep_lms_payment_records_session_idx ON ${PAYMENT_TABLE} (checkout_session_id)`,
  );
  tablesReady = true;
}

function pushMap<T>(map: Map<string, T[]>, key: string, row: T): void {
  if (!key) return;
  const list = map.get(key) ?? [];
  list.push(row);
  map.set(key, list);
}

function rebuildOrderIndex(rows: Order[]): void {
  const byId = new Map<string, Order>();
  const byStudent = new Map<string, Order[]>();
  const byEmail = new Map<string, Order[]>();
  const byStatus = new Map<string, Order[]>();
  const byIdempotency = new Map<string, Order>();
  for (const row of rows) {
    byId.set(row.id, row);
    pushMap(byStudent, row.studentId, row);
    const studentEmail = emailKey(row.studentEmail);
    const billingEmail = emailKey(row.billingEmail);
    pushMap(byEmail, studentEmail, row);
    if (billingEmail && billingEmail !== studentEmail) pushMap(byEmail, billingEmail, row);
    pushMap(byStatus, row.status, row);
    if (row.idempotencyKey) byIdempotency.set(row.idempotencyKey, row);
  }
  orderIndex = { byId, byStudent, byEmail, byStatus, byIdempotency };
}

function rebuildInvoiceIndex(rows: Invoice[]): void {
  const byId = new Map<string, Invoice>();
  const byStudent = new Map<string, Invoice[]>();
  const byPayment = new Map<string, Invoice>();
  for (const row of rows) {
    byId.set(row.id, row);
    pushMap(byStudent, row.studentId, row);
    if (row.paymentId) byPayment.set(row.paymentId, row);
    const metaPayment = row.metadata?.paymentId;
    if (typeof metaPayment === "string" && metaPayment) byPayment.set(metaPayment, row);
  }
  invoiceIndex = { byId, byStudent, byPayment };
}

function rebuildPaymentIndex(rows: PaymentRecord[]): void {
  const byId = new Map<string, PaymentRecord>();
  const byOrder = new Map<string, PaymentRecord[]>();
  const byProviderRef = new Map<string, PaymentRecord>();
  for (const row of rows) {
    byId.set(row.id, row);
    pushMap(byOrder, row.orderId, row);
    if (row.providerPaymentId) byProviderRef.set(row.providerPaymentId, row);
    if (row.checkoutSessionId) byProviderRef.set(row.checkoutSessionId, row);
  }
  paymentIndex = { byId, byOrder, byProviderRef };
}

function readOrderRows(): Order[] {
  const file = readJsonFile<OrderFile>(ORDER_FILE, () => ({ orders: [] }));
  const rows = (file.orders ?? []).map(asOrder).filter(Boolean) as Order[];
  if (!orderIndex) rebuildOrderIndex(rows);
  return rows;
}

function readInvoiceRows(): Invoice[] {
  const file = readJsonFile<InvoiceFile>(INVOICE_FILE, () => ({ invoices: [] }));
  const rows = (file.invoices ?? []).map(asInvoice).filter(Boolean) as Invoice[];
  if (!invoiceIndex) rebuildInvoiceIndex(rows);
  return rows;
}

function readPaymentRows(): PaymentRecord[] {
  const file = readJsonFile<PaymentFile>(PAYMENT_FILE, () => ({ payments: [] }));
  const rows = (file.payments ?? []).map(asPayment).filter(Boolean) as PaymentRecord[];
  if (!paymentIndex) rebuildPaymentIndex(rows);
  return rows;
}

function ensureOrderIndex() {
  if (!orderIndex) readOrderRows();
  return orderIndex!;
}

function ensureInvoiceIndex() {
  if (!invoiceIndex) readInvoiceRows();
  return invoiceIndex!;
}

function ensurePaymentIndex() {
  if (!paymentIndex) readPaymentRows();
  return paymentIndex!;
}

function writeOrderRows(rows: Order[]): void {
  rebuildOrderIndex(rows);
  writeJsonFile(ORDER_FILE, { orders: rows });
}

function writeInvoiceRows(rows: Invoice[]): void {
  rebuildInvoiceIndex(rows);
  writeJsonFile(INVOICE_FILE, { invoices: rows });
}

function writePaymentRows(rows: PaymentRecord[]): void {
  rebuildPaymentIndex(rows);
  writeJsonFile(PAYMENT_FILE, { payments: rows });
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    if (row?.id) unique.set(row.id, row);
  }
  return [...unique.values()];
}

function chunkInsert(
  table: string,
  columns: string,
  rowWidth: number,
  rows: unknown[][],
  conflict: string,
): void {
  const chunkSize = 80;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values: unknown[] = [];
    const placeholders = chunk.map((row, offset) => {
      const base = offset * rowWidth;
      values.push(...row);
      return `(${row.map((_, index) => `$${base + index + 1}${index === rowWidth - 1 ? "::jsonb" : ""}`).join(", ")}, NOW())`;
    });
    neonSql(
      `INSERT INTO ${table} (${columns}, updated_at)
       VALUES ${placeholders.join(",")}
       ON CONFLICT (id) DO UPDATE SET ${conflict}, updated_at = NOW()`,
      values,
    );
  }
}

export function listOrdersForStudent(studentId: string): Order[] {
  if (!studentId) return [];
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${ORDER_TABLE} WHERE student_id = $1`,
      [studentId],
    )
      .map((row) => payloadFromSql(row, asOrder))
      .filter(Boolean) as Order[];
  }
  return [...(ensureOrderIndex().byStudent.get(studentId) ?? [])];
}

export function listOrdersForEmail(email: string): Order[] {
  const needle = emailKey(email);
  if (!needle) return [];
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${ORDER_TABLE} WHERE student_email = $1 OR billing_email = $1`,
      [needle],
    )
      .map((row) => payloadFromSql(row, asOrder))
      .filter(Boolean) as Order[];
  }
  return [...(ensureOrderIndex().byEmail.get(needle) ?? [])];
}

export function listOrdersByStatus(status: Order["status"]): Order[] {
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${ORDER_TABLE} WHERE status = $1`, [
      status,
    ])
      .map((row) => payloadFromSql(row, asOrder))
      .filter(Boolean) as Order[];
  }
  return [...(ensureOrderIndex().byStatus.get(status) ?? [])];
}

export function getOrderById(id: string): Order | null {
  if (!id) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(`SELECT payload FROM ${ORDER_TABLE} WHERE id = $1`, [
      id,
    ]);
    return payloadFromSql(rows[0] ?? {}, asOrder);
  }
  return ensureOrderIndex().byId.get(id) ?? null;
}

export function getOrderByIdempotencyKey(key: string): Order | null {
  if (!key) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${ORDER_TABLE} WHERE idempotency_key = $1`,
      [key],
    );
    return payloadFromSql(rows[0] ?? {}, asOrder);
  }
  return ensureOrderIndex().byIdempotency.get(key) ?? null;
}

export function countOrders(): number {
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ n: number | string }>(`SELECT COUNT(*)::int AS n FROM ${ORDER_TABLE}`);
    return Number(rows[0]?.n ?? 0);
  }
  return ensureOrderIndex().byId.size;
}

export function listAllOrders(): Order[] {
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${ORDER_TABLE}`)
      .map((row) => payloadFromSql(row, asOrder))
      .filter(Boolean) as Order[];
  }
  return [...readOrderRows()];
}

export function upsertOrder(item: Order): void {
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(
      `INSERT INTO ${ORDER_TABLE} (id, student_id, status, student_email, billing_email, idempotency_key, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         student_id = EXCLUDED.student_id,
         status = EXCLUDED.status,
         student_email = EXCLUDED.student_email,
         billing_email = EXCLUDED.billing_email,
         idempotency_key = EXCLUDED.idempotency_key,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [
        item.id,
        item.studentId,
        item.status,
        emailKey(item.studentEmail) || null,
        emailKey(item.billingEmail) || null,
        item.idempotencyKey || null,
        JSON.stringify(item),
      ],
    );
    return;
  }
  const rows = readOrderRows();
  const index = rows.findIndex((row) => row.id === item.id);
  if (index >= 0) rows[index] = item;
  else rows.push(item);
  writeOrderRows(rows);
}

export function replaceAllOrders(rows: Order[]): void {
  const next = uniqueById(rows);
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(`DELETE FROM ${ORDER_TABLE}`);
    chunkInsert(
      ORDER_TABLE,
      "id, student_id, status, student_email, billing_email, idempotency_key, payload",
      7,
      next.map((row) => [
        row.id,
        row.studentId,
        row.status,
        emailKey(row.studentEmail) || null,
        emailKey(row.billingEmail) || null,
        row.idempotencyKey || null,
        JSON.stringify(row),
      ]),
      `student_id = EXCLUDED.student_id,
       status = EXCLUDED.status,
       student_email = EXCLUDED.student_email,
       billing_email = EXCLUDED.billing_email,
       idempotency_key = EXCLUDED.idempotency_key,
       payload = EXCLUDED.payload`,
    );
    return;
  }
  writeOrderRows(next);
}

export function listInvoicesForStudent(studentId: string): Invoice[] {
  if (!studentId) return [];
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${INVOICE_TABLE} WHERE student_id = $1`,
      [studentId],
    )
      .map((row) => payloadFromSql(row, asInvoice))
      .filter(Boolean) as Invoice[];
  }
  return [...(ensureInvoiceIndex().byStudent.get(studentId) ?? [])];
}

export function getInvoiceById(id: string): Invoice | null {
  if (!id) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${INVOICE_TABLE} WHERE id = $1`,
      [id],
    );
    return payloadFromSql(rows[0] ?? {}, asInvoice);
  }
  return ensureInvoiceIndex().byId.get(id) ?? null;
}

export function getInvoiceByPaymentId(paymentId: string): Invoice | null {
  if (!paymentId) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${INVOICE_TABLE} WHERE payment_id = $1`,
      [paymentId],
    );
    return payloadFromSql(rows[0] ?? {}, asInvoice);
  }
  return ensureInvoiceIndex().byPayment.get(paymentId) ?? null;
}

export function countInvoices(): number {
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ n: number | string }>(`SELECT COUNT(*)::int AS n FROM ${INVOICE_TABLE}`);
    return Number(rows[0]?.n ?? 0);
  }
  return ensureInvoiceIndex().byId.size;
}

export function listAllInvoices(): Invoice[] {
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${INVOICE_TABLE}`)
      .map((row) => payloadFromSql(row, asInvoice))
      .filter(Boolean) as Invoice[];
  }
  return [...readInvoiceRows()];
}

export function upsertInvoice(item: Invoice): void {
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(
      `INSERT INTO ${INVOICE_TABLE} (id, student_id, order_id, payment_id, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         student_id = EXCLUDED.student_id,
         order_id = EXCLUDED.order_id,
         payment_id = EXCLUDED.payment_id,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [item.id, item.studentId, item.orderId, item.paymentId, JSON.stringify(item)],
    );
    return;
  }
  const rows = readInvoiceRows();
  const index = rows.findIndex((row) => row.id === item.id);
  if (index >= 0) rows[index] = item;
  else rows.unshift(item);
  writeInvoiceRows(rows);
}

export function replaceAllInvoices(rows: Invoice[]): void {
  const next = uniqueById(rows);
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(`DELETE FROM ${INVOICE_TABLE}`);
    chunkInsert(
      INVOICE_TABLE,
      "id, student_id, order_id, payment_id, payload",
      5,
      next.map((row) => [row.id, row.studentId, row.orderId, row.paymentId, JSON.stringify(row)]),
      `student_id = EXCLUDED.student_id,
       order_id = EXCLUDED.order_id,
       payment_id = EXCLUDED.payment_id,
       payload = EXCLUDED.payload`,
    );
    return;
  }
  writeInvoiceRows(next);
}

export function listPaymentsForOrder(orderId: string): PaymentRecord[] {
  if (!orderId) return [];
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${PAYMENT_TABLE} WHERE order_id = $1`,
      [orderId],
    )
      .map((row) => payloadFromSql(row, asPayment))
      .filter(Boolean) as PaymentRecord[];
  }
  return [...(ensurePaymentIndex().byOrder.get(orderId) ?? [])];
}

export function getPaymentById(id: string): PaymentRecord | null {
  if (!id) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${PAYMENT_TABLE} WHERE id = $1`,
      [id],
    );
    return payloadFromSql(rows[0] ?? {}, asPayment);
  }
  return ensurePaymentIndex().byId.get(id) ?? null;
}

export function getPaymentByProviderRef(ref: string): PaymentRecord | null {
  if (!ref) return null;
  if (sqlEnabled()) {
    ensureSqlTables();
    const rows = neonSql<{ payload: unknown }>(
      `SELECT payload FROM ${PAYMENT_TABLE}
       WHERE provider_payment_id = $1 OR checkout_session_id = $1`,
      [ref],
    );
    return payloadFromSql(rows[0] ?? {}, asPayment);
  }
  return ensurePaymentIndex().byProviderRef.get(ref) ?? null;
}

export function listAllPayments(): PaymentRecord[] {
  if (sqlEnabled()) {
    ensureSqlTables();
    return neonSql<{ payload: unknown }>(`SELECT payload FROM ${PAYMENT_TABLE}`)
      .map((row) => payloadFromSql(row, asPayment))
      .filter(Boolean) as PaymentRecord[];
  }
  return [...readPaymentRows()];
}

export function upsertPayment(item: PaymentRecord): void {
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(
      `INSERT INTO ${PAYMENT_TABLE} (id, order_id, student_id, provider_payment_id, checkout_session_id, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         order_id = EXCLUDED.order_id,
         student_id = EXCLUDED.student_id,
         provider_payment_id = EXCLUDED.provider_payment_id,
         checkout_session_id = EXCLUDED.checkout_session_id,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [
        item.id,
        item.orderId,
        item.studentId,
        item.providerPaymentId || null,
        item.checkoutSessionId,
        JSON.stringify(item),
      ],
    );
    return;
  }
  const rows = readPaymentRows();
  const index = rows.findIndex((row) => row.id === item.id);
  if (index >= 0) rows[index] = item;
  else rows.push(item);
  writePaymentRows(rows);
}

export function replaceAllPayments(rows: PaymentRecord[]): void {
  const next = uniqueById(rows);
  if (sqlEnabled()) {
    ensureSqlTables();
    neonSql(`DELETE FROM ${PAYMENT_TABLE}`);
    chunkInsert(
      PAYMENT_TABLE,
      "id, order_id, student_id, provider_payment_id, checkout_session_id, payload",
      6,
      next.map((row) => [
        row.id,
        row.orderId,
        row.studentId,
        row.providerPaymentId || null,
        row.checkoutSessionId,
        JSON.stringify(row),
      ]),
      `order_id = EXCLUDED.order_id,
       student_id = EXCLUDED.student_id,
       provider_payment_id = EXCLUDED.provider_payment_id,
       checkout_session_id = EXCLUDED.checkout_session_id,
       payload = EXCLUDED.payload`,
    );
    return;
  }
  writePaymentRows(next);
}

/** Tests only. */
export function resetPaymentLedgerStoreRuntime(): void {
  tablesReady = false;
  orderIndex = null;
  invoiceIndex = null;
  paymentIndex = null;
}
