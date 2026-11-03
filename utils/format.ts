import { format, formatDistanceToNow, parseISO } from "date-fns";

/** Platform-clear numeric date (day/month/year), e.g. 03/11/2026. */
export const PLATFORM_DATE_DISPLAY = "dd/MM/yyyy";

export function formatDate(date: string | Date, pattern = PLATFORM_DATE_DISPLAY): string {
  const value = typeof date === "string" ? parseISO(date) : date;
  return format(value, pattern);
}

export function formatRelative(date: string | Date): string {
  const value = typeof date === "string" ? parseISO(date) : date;
  return formatDistanceToNow(value, { addSuffix: true });
}

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}
