"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/features/auth/services/auth-api";
import { COURSE_CURRENCIES } from "@/features/courses/lib/course-studio";

const ATPL_CODES = ["KWD", "AED", "SAR", "USD", "EUR"] as const;

function EasyAtplPrices() {
  const [prices, setPrices] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const result = await authFetch<{ prices: Record<string, number> }>(
      "/api/payments/catalog?view=atpl_prices",
    );
    const next: Record<string, string> = {};
    for (const code of ATPL_CODES) {
      next[code] = result.data?.prices?.[code] != null ? String(result.data.prices[code]) : "";
    }
    setPrices(next);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    const majors: Record<string, number> = {};
    for (const code of ATPL_CODES) {
      majors[code] = Number(prices[code] || 0);
    }
    const result = await authFetch("/api/payments/catalog", {
      method: "POST",
      body: JSON.stringify({ action: "atpl_prices", prices: majors }),
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
          This is the public checkout price on /atpl and /courses/met. Enter the amount students pay
          in each currency, then Save.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading prices…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {ATPL_CODES.map((code) => {
              const meta = COURSE_CURRENCIES.find((item) => item.code === code);
              return (
                <div key={code} className="space-y-2">
                  <Label htmlFor={`atpl-price-${code}`}>
                    {meta?.flag} {code}
                  </Label>
                  <Input
                    id={`atpl-price-${code}`}
                    type="number"
                    min={0}
                    step="0.001"
                    value={prices[code] ?? ""}
                    onChange={(event) =>
                      setPrices((current) => ({ ...current, [code]: event.target.value }))
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
        <Button type="button" onClick={() => void save()} disabled={saving || loading}>
          {saving ? "Saving…" : "Save ATPL prices"}
        </Button>
      </CardContent>
    </Card>
  );
}

export { EasyAtplPrices };
