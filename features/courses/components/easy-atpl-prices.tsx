"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AtplPackageSku } from "@/constants/atpl-complete-package";
import { authFetch } from "@/features/auth/services/auth-api";
import { COURSE_CURRENCIES } from "@/features/courses/lib/course-studio";

const ATPL_CODES = ["KWD", "AED", "SAR", "USD", "EUR"] as const;

type TierRow = {
  sku: AtplPackageSku;
  title: string;
  subjectCount: number;
  productId: string | null;
  prices: Record<string, string>;
};

function EasyAtplPrices() {
  const [tiers, setTiers] = React.useState<TierRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const result = await authFetch<{
      tiers: Array<{
        sku: AtplPackageSku;
        title: string;
        subjectCount: number;
        productId: string | null;
        prices: Record<string, number>;
      }>;
    }>("/api/payments/catalog?view=atpl_prices");
    setTiers(
      (result.data?.tiers ?? []).map((tier) => {
        const prices: Record<string, string> = {};
        for (const code of ATPL_CODES) {
          prices[code] = tier.prices?.[code] != null ? String(tier.prices[code]) : "";
        }
        return {
          sku: tier.sku,
          title: tier.title,
          subjectCount: tier.subjectCount,
          productId: tier.productId,
          prices,
        };
      }),
    );
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function setPrice(sku: AtplPackageSku, code: string, value: string) {
    setTiers((current) =>
      current.map((tier) =>
        tier.sku === sku ? { ...tier, prices: { ...tier.prices, [code]: value } } : tier,
      ),
    );
  }

  async function save() {
    setSaving(true);
    const payload: Partial<Record<AtplPackageSku, Record<string, number>>> = {};
    for (const tier of tiers) {
      const majors: Record<string, number> = {};
      for (const code of ATPL_CODES) {
        majors[code] = Number(tier.prices[code] || 0);
      }
      payload[tier.sku] = majors;
    }
    const result = await authFetch("/api/payments/catalog", {
      method: "POST",
      body: JSON.stringify({ action: "atpl_prices", tiers: payload }),
    });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error ?? "Could not save ATPL prices");
      return;
    }
    toast.success("ATPL package prices updated");
    void load();
  }

  return (
    <Card className="rounded-2xl shadow-soft">
      <CardHeader>
        <CardTitle className="text-base">ATPL package prices</CardTitle>
        <CardDescription>
          Set an independent checkout price for each package (1, 5, and 13 subjects) in every
          currency. These amounts appear on /atpl and at Stripe Checkout.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading prices…</p>
        ) : (
          tiers.map((tier) => (
            <div
              key={tier.sku}
              className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{tier.title}</p>
                <p className="text-xs text-muted-foreground">
                  {tier.subjectCount} {tier.subjectCount === 1 ? "ATPL subject" : "ATPL subjects"} ·{" "}
                  {tier.sku}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {ATPL_CODES.map((code) => {
                  const meta = COURSE_CURRENCIES.find((item) => item.code === code);
                  return (
                    <div key={`${tier.sku}-${code}`} className="space-y-2">
                      <Label htmlFor={`atpl-price-${tier.sku}-${code}`}>
                        {meta?.flag} {code}
                      </Label>
                      <Input
                        id={`atpl-price-${tier.sku}-${code}`}
                        type="number"
                        min={0}
                        step="0.001"
                        value={tier.prices[code] ?? ""}
                        onChange={(event) => setPrice(tier.sku, code, event.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        <Button type="button" onClick={() => void save()} disabled={saving || loading}>
          {saving ? "Saving…" : "Save ATPL prices"}
        </Button>
      </CardContent>
    </Card>
  );
}

export { EasyAtplPrices };
