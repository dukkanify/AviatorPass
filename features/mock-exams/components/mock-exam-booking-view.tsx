"use client";

import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMinor } from "@/lib/money";
import type { MockExamSessionWithNames, MockExamSlot, MockExamType } from "@/types/mock-exams";

type Catalog = {
  settings: { enabled: boolean; currency: string; timezone: string; pricingMode: string };
  examTypes: MockExamType[];
  examiners: Array<{ id: string; name: string; email: string }>;
};

async function apiGet<T>(query: string): Promise<T> {
  const res = await fetch(`/api/mock-exams${query}`, { cache: "no-store" });
  const json = (await res.json()) as { success: boolean; data: T; error: string | null };
  if (!res.ok || !json.success) throw new Error(json.error ?? "Request failed");
  return json.data;
}

async function apiPost(body: Record<string, unknown>) {
  const res = await fetch("/api/mock-exams", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { success: boolean; data: unknown; error: string | null };
  if (!res.ok || !json.success) throw new Error(json.error ?? "Request failed");
  return json.data;
}

function readQueryParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

export function MockExamBookingView() {
  const [catalog, setCatalog] = React.useState<Catalog | null>(null);
  const [sessions, setSessions] = React.useState<MockExamSessionWithNames[]>([]);
  const [examTypeId, setExamTypeId] = React.useState("");
  const [examinerId, setExaminerId] = React.useState("");
  const [date, setDate] = React.useState(
    () => readQueryParam("date") || new Date().toISOString().slice(0, 10),
  );
  const [slots, setSlots] = React.useState<MockExamSlot[]>([]);
  const [selectedStart, setSelectedStart] = React.useState(() => readQueryParam("startsAt"));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [studentName, setStudentName] = React.useState("");

  const load = React.useCallback(async () => {
    const [c, s, me] = await Promise.all([
      apiGet<Catalog>("?view=catalog"),
      apiGet<MockExamSessionWithNames[]>("?view=sessions"),
      fetch("/api/auth/me").then((r) => r.json()) as Promise<{
        data?: { user?: { firstName?: string; lastName?: string; fullName?: string } };
      }>,
    ]);
    setCatalog(c);
    setSessions(s);
    const elp = c.examTypes.find((t) => t.code === "ELP-MOCK") ?? c.examTypes[0];
    if (elp) setExamTypeId(elp.id);
    if (c.examiners[0]) setExaminerId(c.examiners[0].id);
    setStudentName(me.data?.user?.fullName || me.data?.user?.firstName || "Student");
  }, []);

  React.useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [load]);

  React.useEffect(() => {
    if (!examTypeId || !examinerId || !date) return;
    const q = new URLSearchParams({
      view: "slots",
      date,
      examinerId,
      examTypeId,
    });
    void apiGet<MockExamSlot[]>(`?${q}`)
      .then((rows) => {
        setSlots(rows.filter((s) => s.available));
      })
      .catch((err: Error) => setError(err.message));
  }, [examTypeId, examinerId, date]);

  async function reserveThenPay() {
    if (!selectedStart) {
      toast.error("Select a time slot");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const reserved = (await apiPost({
        action: "book",
        examinerId,
        examTypeId,
        startsAt: selectedStart,
        selectedExtraFeeIds: [],
        markPaid: false,
      })) as MockExamSessionWithNames;
      const paid = (await apiPost({
        action: "confirm_payment",
        sessionId: reserved.id,
      })) as MockExamSessionWithNames;
      toast.success("Booking confirmed — Zoom room and emails sent");
      setSelectedStart("");
      await load();
      void paid;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  }

  const selectedSlot = slots.find((s) => s.startsAt === selectedStart);
  const exam = catalog?.examTypes.find((t) => t.id === examTypeId);

  return (
    <div className="space-y-8">
      <PageHeader
        title="ELP mock exam"
        description="Choose a published slot, review the total including rush fees, then confirm and pay. The Zoom room is created after payment."
        breadcrumbs={[{ label: "Student" }, { label: "Mock exams" }]}
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!catalog ? (
        <p className="text-sm text-muted-foreground">Loading catalog…</p>
      ) : !catalog.settings.enabled ? (
        <p className="text-sm text-muted-foreground">Mock exam booking is currently disabled.</p>
      ) : (
        <section className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Working hours ({catalog.settings.timezone}): Monday–Friday 17:00–20:00 · Saturday–Sunday
            09:00–18:00. Slots outside these hours are hidden.
          </p>
          <div className="space-y-1.5 max-w-xs">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Available slots</Label>
            {slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open slots for this day.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => (
                  <Button
                    key={s.startsAt}
                    size="sm"
                    variant={selectedStart === s.startsAt ? "default" : "outline"}
                    onClick={() => setSelectedStart(s.startsAt)}
                  >
                    {new Date(s.startsAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: catalog.settings.timezone,
                    })}
                    {s.quote ? ` · ${formatMinor(s.quote.total, s.quote.currency)}` : ""}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {selectedSlot?.quote ? (
            <div className="space-y-1 rounded-xl border border-border p-4 text-sm">
              <p className="font-medium">Review before payment</p>
              <p>Name: {studentName}</p>
              <p>Service: {exam?.name ?? "ELP Mock Exam"}</p>
              <p>
                Date and time:{" "}
                {new Date(selectedSlot.startsAt).toLocaleString([], {
                  timeZone: catalog.settings.timezone,
                })}
              </p>
              <p>Base: {formatMinor(selectedSlot.quote.baseAmount, selectedSlot.quote.currency)}</p>
              {selectedSlot.quote.extraFees.map((f) => (
                <p key={f.code} className="text-muted-foreground">
                  + {f.label}: {formatMinor(f.amount, selectedSlot.quote!.currency)}
                </p>
              ))}
              <p className="font-medium">
                Total: {formatMinor(selectedSlot.quote.total, selectedSlot.quote.currency)}
              </p>
              <Button
                className="mt-3"
                disabled={busy || !selectedStart}
                onClick={() => void reserveThenPay()}
              >
                {busy ? "Confirming…" : "Confirm and pay"}
              </Button>
            </div>
          ) : null}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">My mock exams</h2>
        <ul className="space-y-3 text-sm">
          {sessions.length === 0 ? (
            <li className="text-muted-foreground">No mock exams booked yet.</li>
          ) : (
            sessions.map((s) => (
              <li key={s.id} className="border-b border-border/60 pb-3">
                <p className="font-medium">
                  {s.examTypeName} · <Badge variant="secondary">{s.status}</Badge>
                </p>
                <p className="text-muted-foreground">
                  {new Date(s.startsAt).toLocaleString()} · Examiner: {s.examinerName ?? "—"} ·{" "}
                  {formatMinor(s.quote.total, s.currency)}
                </p>
                {s.zoom ? (
                  <a
                    className="text-primary hover:underline"
                    href={s.zoom.joinUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Join Zoom meeting
                  </a>
                ) : null}
                {s.documents?.length ? (
                  <ul className="mt-1 text-muted-foreground">
                    {s.documents.map((doc) => (
                      <li key={doc.id}>
                        <a
                          className="text-primary hover:underline"
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {doc.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {s.certificateId ? (
                  <p className="text-muted-foreground">
                    Aviator Pass certificate available · score {s.scorePercent ?? "—"}% ·{" "}
                    <a
                      className="text-primary hover:underline"
                      href={`/api/mock-exams/certificate/${s.certificateId}`}
                    >
                      View certificate
                    </a>
                  </p>
                ) : null}
                {s.status === "pending_payment" ? (
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={() =>
                      void apiPost({ action: "confirm_payment", sessionId: s.id }).then(() =>
                        load(),
                      )
                    }
                  >
                    Pay now
                  </Button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
