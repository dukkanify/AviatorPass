/**
 * Money helpers — minor units formatting.
 */

export function currencyExponent(currency = "USD"): number {
  const code = currency.toUpperCase();
  if (
    code === "BIF" ||
    code === "CLP" ||
    code === "DJF" ||
    code === "GNF" ||
    code === "JPY" ||
    code === "KMF" ||
    code === "KRW" ||
    code === "MGA" ||
    code === "PYG" ||
    code === "RWF" ||
    code === "UGX" ||
    code === "VND" ||
    code === "VUV" ||
    code === "XAF" ||
    code === "XOF" ||
    code === "XPF"
  ) {
    return 0;
  }
  if (code === "BHD" || code === "JOD" || code === "KWD" || code === "OMR" || code === "TND") {
    return 3;
  }
  return 2;
}

export function formatMinor(amount: number, currency = "KWD"): string {
  const digits = currencyExponent(currency);
  const major = amount / 10 ** digits;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(major);
}

export function majorToMinor(major: number, currency = "KWD"): number {
  return Math.round(major * 10 ** currencyExponent(currency));
}

export function calcTax(subtotalAfterDiscount: number, taxRatePercent: number): number {
  return Math.round((subtotalAfterDiscount * taxRatePercent) / 100);
}

export function calcPlatformFee(gross: number, feePercent: number): number {
  return Math.round((gross * feePercent) / 100);
}
