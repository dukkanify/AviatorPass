"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Headset, Send, Ticket } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TICKET_STATUS_LABELS } from "@/constants/communication";
import { cn } from "@/lib/utils";
import { commFetch, commJson } from "@/features/communication/lib/api";
import type { SupportTicket, TicketReply, TicketStatus } from "@/types/communication";

function formatTicketDate(iso?: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SupportCenter({ manage = false }: { manage?: boolean }) {
  return (
    <React.Suspense
      fallback={
        <div className="space-y-4 p-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[480px] w-full rounded-2xl" />
        </div>
      }
    >
      <SupportCenterInner manage={manage} />
    </React.Suspense>
  );
}

function SupportCenterInner({ manage = false }: { manage?: boolean }) {
  const searchParams = useSearchParams();
  const [tickets, setTickets] = React.useState<SupportTicket[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [replies, setReplies] = React.useState<TicketReply[]>([]);
  const [stats, setStats] = React.useState<Record<string, number> | null>(null);
  const [subject, setSubject] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [reply, setReply] = React.useState("");
  const [internalNote, setInternalNote] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    const result = await commFetch<SupportTicket[]>("/api/communication/tickets");
    setTickets(result.data ?? []);
    if (manage) {
      const s = await commFetch<Record<string, number>>("/api/communication/tickets?stats=1");
      setStats(s.data);
    }
    setLoading(false);
  }, [manage]);

  const loadTicket = React.useCallback(async (id: string) => {
    const result = await commFetch<{ ticket: SupportTicket; replies: TicketReply[] }>(
      `/api/communication/tickets?id=${id}`,
    );
    if (result.data) {
      setReplies(result.data.replies);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const fromQuery = searchParams.get("ticket");
    if (fromQuery) setActiveId(fromQuery);
  }, [searchParams]);

  React.useEffect(() => {
    if (activeId) void loadTicket(activeId);
  }, [activeId, loadTicket]);

  async function create() {
    const result = await commJson<SupportTicket>("/api/communication/tickets", "POST", {
      action: "create",
      type: "general",
      subject,
      description,
    });
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSubject("");
    setDescription("");
    if (result.data) setActiveId(result.data.id);
    void load();
  }

  async function sendReply() {
    if (!activeId || !reply.trim()) return;
    const result = await commJson("/api/communication/tickets", "POST", {
      action: "reply",
      ticketId: activeId,
      body: reply,
      isInternal: manage ? internalNote : false,
    });
    if (!result.success) {
      setError(result.error);
      return;
    }
    setReply("");
    setInternalNote(false);
    void loadTicket(activeId);
    void load();
  }

  async function setStatus(status: TicketStatus) {
    if (!activeId) return;
    await commJson("/api/communication/tickets", "POST", {
      action: "update",
      ticketId: activeId,
      status,
    });
    void load();
    void loadTicket(activeId);
  }

  const active = tickets.find((t) => t.id === activeId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={manage ? "Support tickets" : "Support tickets"}
        description="Tickets only — open a ticket, track replies, and keep the real created date from the record."
        breadcrumbs={[{ label: "Support" }, { label: "Tickets" }]}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Object.entries(stats).map(([k, v]) => (
            <Card key={k} className="border-border/80">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{k}</p>
                <p className="font-display text-2xl">{v}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {!manage ? (
        <Card className="border-[#143048]/15 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Headset className="size-4 text-[#CCA04C]" />
              New ticket
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="font-medium text-red-600 placeholder:text-red-400"
            />
            <Textarea
              placeholder="Describe the issue"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Button onClick={() => void create()}>Submit ticket</Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <aside className="space-y-2">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
          ) : tickets.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
                <Ticket className="size-8 opacity-40" />
                <p>No tickets yet.</p>
              </CardContent>
            </Card>
          ) : (
            tickets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveId(t.id)}
                className={cn(
                  "w-full rounded-xl border border-border px-3 py-3 text-left transition-colors hover:bg-muted/50",
                  activeId === t.id && "border-[#143048] bg-muted",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{t.ticketNumber}</span>
                  <Badge variant="secondary">{TICKET_STATUS_LABELS[t.status]}</Badge>
                </div>
                <p className="mt-1 text-sm font-semibold text-red-600">{t.subject}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <CalendarDays className="size-3" />
                  {formatTicketDate(t.createdAt)}
                </p>
              </button>
            ))
          )}
        </aside>

        <section>
          {!active ? (
            <p className="text-sm text-muted-foreground">Select a ticket to view the thread.</p>
          ) : (
            <Card className="overflow-hidden">
              <CardHeader className="bg-[#143048] text-white">
                <CardTitle className="text-xl text-red-300">{active.subject}</CardTitle>
                <p className="text-sm text-white/80">{active.description}</p>
                <p className="text-xs text-white/60">
                  Opened {formatTicketDate(active.createdAt)}
                  {active.updatedAt && active.updatedAt !== active.createdAt
                    ? ` · Updated ${formatTicketDate(active.updatedAt)}`
                    : ""}
                </p>
                {manage ? (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {(Object.keys(TICKET_STATUS_LABELS) as TicketStatus[]).map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant="outline"
                        className="border-white/20 bg-white/5 text-white hover:bg-white/10"
                        onClick={() => void setStatus(s)}
                      >
                        {TICKET_STATUS_LABELS[s]}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4 p-4 sm:p-6">
                <div className="space-y-2">
                  {replies.map((r) => (
                    <div
                      key={r.id}
                      className={cn(
                        "rounded-md border border-border px-3 py-2 text-sm",
                        r.isInternal && "border-amber-500/40 bg-amber-500/5",
                      )}
                    >
                      <p className="text-xs text-muted-foreground">
                        {r.authorName}
                        {r.isStaff ? " · staff" : ""}
                        {r.isInternal ? " · internal note" : ""} · {formatTicketDate(r.createdAt)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{r.body}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {manage ? (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={internalNote}
                        onChange={(e) => setInternalNote(e.target.checked)}
                      />
                      Internal note (not visible to requester)
                    </label>
                  ) : null}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder={internalNote ? "Internal note…" : "Reply…"}
                    />
                    <Button className="self-end" onClick={() => void sendReply()}>
                      <Send className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}

export { SupportCenter };
