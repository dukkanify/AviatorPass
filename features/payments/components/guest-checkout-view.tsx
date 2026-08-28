"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Apple, CheckCircle2, CreditCard, Lock, ShieldCheck, Smartphone } from "lucide-react";
import Link from "@/components/ui/app-link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { routes } from "@/constants/routes";
import { authFetch } from "@/features/auth/services/auth-api";
import type { CatalogProduct, PaymentMethodBrand } from "@/types/payments";

type Quote = {
  product: CatalogProduct;
  currency: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  totalLabel: string;
  processor: string;
  supportEmail: string;
  loginUrl: string;
  courseAccessUrl: string;
  methods: Array<{
    id: PaymentMethodBrand;
    label: string;
    available: boolean;
    comingSoon?: boolean;
    processor: string;
  }>;
  countries: Array<{ code: string; name: string; dialCode: string }>;
};

type PayResult = {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    totalLabel: string;
    productName: string;
    billingEmail: string;
    failureReason: string | null;
  };
  checkoutUrl: string | null;
  redirectTo?: string | null;
  accountCreated: boolean;
  attachedToExisting: boolean;
  emailSent: boolean;
  courseAssigned: boolean;
  temporaryPassword: string | null;
  loginUrl: string;
  courseAccessUrl: string;
};

function methodIcon(id: PaymentMethodBrand) {
  if (id === "apple_pay") return Apple;
  if (id === "google_pay" || id === "mada") return Smartphone;
  return CreditCard;
}

function GuestCheckoutView() {
  const search = useSearchParams();
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<PayResult | null>(null);
  const [form, setForm] = React.useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    country: "KW",
    billingAddress: "",
    methodBrand: "card" as PaymentMethodBrand,
  });

  const productId = search.get("productId") ?? "";
  const canceled = search.get("canceled") === "1";

  const load = React.useCallback(async () => {
    setLoadingQuote(true);
    const params = new URLSearchParams();
    if (productId) params.set("productId", productId);
    params.set("country", form.country);
    try {
      const res = await fetch(`/api/public/checkout?${params.toString()}`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: Quote;
        error?: string | null;
      } | null;
      if (!json?.success || !json.data) {
        setLoadError(json?.error ?? "Checkout is unavailable");
        return;
      }
      setQuote(json.data);
      setLoadError(null);
      const data = json.data;
      const firstAvailable = data.methods.find((m) => m.available)?.id ?? "card";
      setForm((prev) => ({
        ...prev,
        methodBrand: data.methods.some((m) => m.id === prev.methodBrand && m.available)
          ? prev.methodBrand
          : firstAvailable,
      }));
    } catch {
      setLoadError("Checkout is unavailable");
    } finally {
      setLoadingQuote(false);
    }
  }, [productId, form.country]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function onPay(e: React.FormEvent) {
    e.preventDefault();
    if (!quote) return;
    setPending(true);
    try {
      const paid = await authFetch<PayResult>("/api/public/checkout", {
        method: "POST",
        body: JSON.stringify({
          productId: quote.product.id,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          country: form.country,
          billingName: `${form.firstName} ${form.lastName}`.trim(),
          billingAddress: form.billingAddress,
          methodBrand: form.methodBrand,
          paymentToken: "tok_4242",
        }),
      });
      if (!paid.success || !paid.data) {
        toast.error(
          paid.error ?? "Payment could not be processed. You can retry — no account was created.",
        );
        return;
      }
      if (paid.data.checkoutUrl) {
        window.location.href = paid.data.checkoutUrl;
        return;
      }
      if (paid.data.order.status === "paid") {
        const orderId = paid.data.order.id;
        const redirectTo =
          typeof paid.data.redirectTo === "string" && paid.data.redirectTo.startsWith("/")
            ? paid.data.redirectTo
            : `/welcome?orderId=${encodeURIComponent(orderId)}`;
        window.location.assign(redirectTo);
        return;
      }
      setResult(paid.data);
      toast.success("Payment successful — ATPL PASS is yours.");
    } finally {
      setPending(false);
    }
  }

  if (result && result.order.status === "paid") {
    return (
      <div className="mx-auto max-w-xl space-y-6 py-10 text-center">
        <CheckCircle2 className="mx-auto size-12 text-accent" aria-hidden />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
            Enrolment complete
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Welcome to ATPL PASS
          </h1>
          <p className="mt-3 text-muted-foreground">
            {result.order.productName} is unlocked.{" "}
            {result.accountCreated
              ? "We created your student account automatically."
              : "This purchase is attached to your existing AviatorPass account."}{" "}
            Check <span className="break-email">{result.order.billingEmail}</span> for your receipt
            and login details.
          </p>
        </div>
        {result.temporaryPassword ? (
          <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-left text-sm">
            <p className="font-medium">Temporary password (shown once)</p>
            <p className="mt-1 select-all font-mono text-base tracking-wide">
              {result.temporaryPassword}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => {
                void navigator.clipboard.writeText(result.temporaryPassword!);
                toast.success("Password copied");
              }}
            >
              Copy password
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Sign in with this password (not OTP), then choose a new one. We will never email it
              again.
            </p>
          </div>
        ) : null}
        <div className="flex w-full flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
          <Button variant="accent" className="w-full sm:w-auto" asChild>
            <Link href={routes.login}>Sign in</Link>
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" asChild>
            <Link href={routes.home}>Back to home</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Order {result.order.orderNumber}</p>
      </div>
    );
  }

  return (
    <div className="container-app py-10 lg:py-14">
      <div className="mx-auto mb-8 max-w-2xl text-center lg:text-left">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
          Secure checkout
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Enrol in ATPL PASS
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Pay first — no registration. We create your student account the moment payment succeeds.
        </p>
        {canceled ? (
          <p className="mt-3 text-sm text-destructive">
            Checkout was cancelled. You can try again.
          </p>
        ) : null}
        {loadError ? <p className="mt-3 text-sm text-destructive">{loadError}</p> : null}
      </div>

      <form
        onSubmit={(e) => void onPay(e)}
        className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
      >
        <div className="min-w-0 space-y-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Lock className="size-4 text-accent" />
            Customer details
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                autoComplete="given-name"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                autoComplete="family-name"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile number</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+965xxxxxxxx"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <select
                id="country"
                className="h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base sm:h-10 sm:text-sm"
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              >
                {(quote?.countries ?? [{ code: "KW", name: "Kuwait" }]).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="billingAddress">Billing address</Label>
              <Input
                id="billingAddress"
                autoComplete="street-address"
                value={form.billingAddress}
                onChange={(e) => setForm((f) => ({ ...f, billingAddress: e.target.value }))}
                placeholder="Street, city"
              />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Payment method</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(quote?.methods ?? []).map((method) => {
                const Icon = methodIcon(method.id);
                const disabled = !method.available;
                return (
                  <button
                    key={method.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setForm((f) => ({ ...f, methodBrand: method.id }))}
                    className={`flex min-h-11 items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      form.methodBrand === method.id && !disabled
                        ? "border-accent bg-accent/10"
                        : "border-border"
                    } ${disabled ? "cursor-not-allowed opacity-55" : "hover:border-accent/60"}`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="size-4" />
                      {method.label}
                    </span>
                    {method.comingSoon ? <Badge variant="secondary">Soon</Badge> : null}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Available methods are determined by the payment gateway
              {quote?.processor ? ` (${quote.processor})` : ""}. Apple Pay and Google Pay appear
              when the processor enables wallets. Tabby, Tamara, and MyFatoorah stay future-ready.
            </p>
          </div>

          <Button
            type="submit"
            variant="accent"
            className="h-12 w-full"
            disabled={pending || !quote || loadingQuote}
          >
            {loadingQuote
              ? "Loading checkout…"
              : pending
                ? "Processing…"
                : `Pay ${quote?.totalLabel ?? ""} securely`}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Want a free account without buying?{" "}
            <Link href={routes.register} className="text-primary hover:underline">
              Register with OTP
            </Link>
          </p>
        </div>

        <aside className="h-fit min-w-0 space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <p className="text-sm font-semibold">Order summary</p>
          <div>
            <p className="font-display text-lg">{quote?.product.name ?? "ATPL PASS"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {quote?.product.description ?? "Airline Transport Pilot License theory package."}
            </p>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between font-medium">
              <dt>Total due today</dt>
              <dd className="font-display text-xl">{quote?.totalLabel ?? "—"}</dd>
            </div>
          </dl>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 text-accent" />
              Instant access after payment — no OTP before checkout
            </li>
            <li className="flex gap-2">
              <Lock className="mt-0.5 size-4 text-accent" />
              Card data never stored on AviatorPass (PCI-aware tokens)
            </li>
          </ul>
          {quote?.supportEmail ? (
            <p className="break-email text-xs text-muted-foreground">
              Support: {quote.supportEmail}
            </p>
          ) : null}
        </aside>
      </form>
    </div>
  );
}

export { GuestCheckoutView };
