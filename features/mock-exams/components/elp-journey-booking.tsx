"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMinor } from "@/lib/money";
import { routes } from "@/constants/routes";
import type { MockExamSlot, MockExamType, MockExamWorkingHours } from "@/types/mock-exams";

type Catalog = {
  settings: {
    enabled: boolean;
    currency: string;
    timezone: string;
    workingHours: MockExamWorkingHours[];
  };
  examTypes: MockExamType[];
  examiners: Array<{ id: string; name: string }>;
};

function hoursLabel(hours: MockExamWorkingHours[]) {
  const weekday = hours.find((h) => h.weekday === 1 && h.active);
  const weekend = hours.find((h) => (h.weekday === 0 || h.weekday === 6) && h.active);
  const fmt = (h?: MockExamWorkingHours) =>
    h ? `${String(h.startHour).padStart(2, "0")}:00–${String(h.endHour).padStart(2, "0")}:00` : "—";
  return {
    weekday: fmt(weekday),
    weekend: fmt(weekend),
  };
}

export function ElpJourneyBooking() {
  const [catalog, setCatalog] = React.useState<Catalog | null>(null);
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = React.useState<MockExamSlot[]>([]);
  const [selected, setSelected] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void fetch("/api/public/mock-exams?view=catalog")
      .then((r) => r.json())
      .then((json: { success: boolean; data: Catalog; error: string | null }) => {
        if (!json.success) throw new Error(json.error ?? "Could not load ELP catalog");
        setCatalog(json.data);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  React.useEffect(() => {
    if (!catalog?.examiners[0] || !catalog.examTypes[0] || !date) return;
    const q = new URLSearchParams({
      view: "slots",
      date,
      examinerId: catalog.examiners[0].id,
      examTypeId: catalog.examTypes[0].id,
    });
    void fetch(`/api/public/mock-exams?${q}`)
      .then((r) => r.json())
      .then((json: { success: boolean; data: { slots: MockExamSlot[] }; error: string | null }) => {
        if (!json.success) throw new Error(json.error ?? "Could not load slots");
        setSlots((json.data.slots ?? []).filter((s) => s.available));
        setSelected("");
      })
      .catch((err: Error) => setError(err.message));
  }, [catalog, date]);

  const hours = catalog ? hoursLabel(catalog.settings.workingHours) : null;
  const chosen = slots.find((s) => s.startsAt === selected);
  const loginHref = `${routes.login}?next=${encodeURIComponent(`/student/mock-exams?date=${date}&startsAt=${encodeURIComponent(selected)}`)}`;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white sm:p-6">
      <h2 className="font-heading text-xl">Choose your mock exam slot</h2>
      <p className="mt-2 text-sm text-white/70">
        Only working hours appear. Monday–Friday {hours?.weekday ?? "17:00–20:00"} · Saturday–Sunday{" "}
        {hours?.weekend ?? "09:00–18:00"} ({catalog?.settings.timezone ?? "Asia/Kuwait"}).
      </p>
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-white/80">Date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="max-w-xs bg-white/10 text-white"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {slots.length === 0 ? (
            <p className="text-sm text-white/60">No open slots on this day.</p>
          ) : (
            slots.map((s) => (
              <Button
                key={s.startsAt}
                size="sm"
                variant={selected === s.startsAt ? "accent" : "outline"}
                className={
                  selected === s.startsAt
                    ? ""
                    : "border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                }
                onClick={() => setSelected(s.startsAt)}
              >
                {new Date(s.startsAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: catalog?.settings.timezone,
                })}
                {s.quote ? ` · ${formatMinor(s.quote.total, s.quote.currency)}` : ""}
              </Button>
            ))
          )}
        </div>
        {chosen?.quote ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
            <p className="font-medium">Review before payment</p>
            <p className="mt-1 text-white/70">Service: English Language Proficiency — Mock Exam</p>
            <p className="text-white/70">
              Base: {formatMinor(chosen.quote.baseAmount, chosen.quote.currency)}
            </p>
            {chosen.quote.extraFees.map((f) => (
              <p key={f.code} className="text-white/70">
                + {f.label}: {formatMinor(f.amount, chosen.quote!.currency)}
              </p>
            ))}
            <p className="mt-2 font-semibold">
              Total: {formatMinor(chosen.quote.total, chosen.quote.currency)}
            </p>
            <Button variant="accent" className="mt-4" asChild>
              <a href={loginHref}>Sign in to confirm and pay</a>
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
