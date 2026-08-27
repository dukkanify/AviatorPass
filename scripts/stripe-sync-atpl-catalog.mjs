/**
 * Create Stripe Product "ATPL PASS" and one Price per supported currency.
 *
 * Amounts are NEVER computed by this script. Pass operator-set unit amounts:
 *
 *   STRIPE_SECRET_KEY=rk_test_... \
 *   STRIPE_UNIT_AMOUNT_USD=129900 \
 *   STRIPE_UNIT_AMOUNT_GBP=99900 \
 *   npm run stripe:sync
 *
 * Prints Product / Price IDs for Vercel env (STRIPE_PRODUCT_ID, STRIPE_PRICE_USD, …).
 */

import Stripe from "stripe";

const CURRENCIES = [
  "USD",
  "GBP",
  "EUR",
  "AED",
  "SAR",
  "KWD",
  "BHD",
  "QAR",
  "OMR",
  "EGP",
  "JOD",
  "CAD",
  "AUD",
  "NZD",
  "SGD",
  "MYR",
  "JPY",
  "INR",
  "TRY",
  "ZAR",
];

const PRODUCT_NAME = "ATPL PASS";

function requiredKey() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error("STRIPE_SECRET_KEY is required");
    process.exit(1);
  }
  return key;
}

async function main() {
  const stripe = new Stripe(requiredKey());
  const existingId = process.env.STRIPE_PRODUCT_ID?.trim();
  let product;
  if (existingId) {
    product = await stripe.products.retrieve(existingId);
  } else {
    const listed = await stripe.products.list({ active: true, limit: 100 });
    product = listed.data.find((p) => p.name === PRODUCT_NAME);
    if (!product) {
      product = await stripe.products.create({
        name: PRODUCT_NAME,
        description: "Airline Transport Pilot License theory package",
        metadata: { sku: "ATPL-PACKAGE", platform: "aviatorpass" },
      });
      console.log(`Created product ${product.id}`);
    } else {
      console.log(`Reusing product ${product.id}`);
    }
  }

  console.log(`STRIPE_PRODUCT_ID=${product.id}`);

  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  for (const currency of CURRENCIES) {
    const envAmount = process.env[`STRIPE_UNIT_AMOUNT_${currency}`]?.trim();
    const existing = prices.data.find(
      (p) => p.currency === currency.toLowerCase() && p.type === "one_time" && p.active,
    );
    if (existing) {
      console.log(
        `STRIPE_PRICE_${currency}=${existing.id}  # existing ${existing.unit_amount} ${currency}`,
      );
      continue;
    }
    if (!envAmount) {
      console.warn(
        `# skip ${currency} — set STRIPE_UNIT_AMOUNT_${currency} (Stripe minor units) to create a Price`,
      );
      continue;
    }
    const unitAmount = Number(envAmount);
    if (!Number.isInteger(unitAmount) || unitAmount <= 0) {
      console.warn(
        `# skip ${currency} — STRIPE_UNIT_AMOUNT_${currency} must be a positive integer`,
      );
      continue;
    }
    const price = await stripe.prices.create({
      product: product.id,
      currency: currency.toLowerCase(),
      unit_amount: unitAmount,
      nickname: `${PRODUCT_NAME} ${currency}`,
      metadata: { sku: "ATPL-PACKAGE" },
    });
    console.log(`STRIPE_PRICE_${currency}=${price.id}  # created ${unitAmount} ${currency}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
