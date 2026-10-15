"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Link2, RefreshCw, Unplug, Video } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { zoomOAuthFailureUserMessage } from "@/features/zoom/oauth-error-messages";
import type { ZoomIntegrationPublic } from "@/types/zoom-oauth";

function formatWhen(value: string | null) {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "—";
  return new Date(parsed).toLocaleString();
}

function InstructorZoomPanel() {
  const searchParams = useSearchParams();
  const [status, setStatus] = React.useState<ZoomIntegrationPublic | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<"disconnect" | "sync" | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/zoom/status", { cache: "no-store" });
      const json = (await res.json()) as {
        success: boolean;
        data?: ZoomIntegrationPublic;
        error?: string;
      };
      if (!res.ok || !json.success || !json.data) {
        setStatus(null);
        return;
      }
      setStatus(json.data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const flag = searchParams.get("zoom");
    if (flag === "connected") toast.success("Zoom account connected");
    if (flag === "error") {
      const reason = searchParams.get("reason");
      const cid = searchParams.get("cid");
      const base = zoomOAuthFailureUserMessage(reason);
      toast.error(cid ? `${base} Reference: ${cid}` : base);
    }
  }, [searchParams]);

  async function disconnect() {
    setBusy("disconnect");
    const res = await fetch("/api/integrations/zoom/disconnect", { method: "POST" });
    const json = (await res.json()) as { success: boolean; error?: string };
    setBusy(null);
    if (!res.ok || !json.success) {
      toast.error(json.error ?? "Unable to disconnect Zoom");
      return;
    }
    toast.success("Zoom disconnected");
    void load();
  }

  async function syncNow() {
    setBusy("sync");
    const res = await fetch("/api/integrations/zoom/sync", { method: "POST" });
    const json = (await res.json()) as { success: boolean; error?: string };
    setBusy(null);
    if (!res.ok || !json.success) {
      toast.error(json.error ?? "Sync failed");
      return;
    }
    toast.success("Zoom meetings synchronised");
    void load();
  }

  const connected = Boolean(status?.connected);
  const sharedPlatform = Boolean(status?.sharedPlatformAccount);
  const personalReady = Boolean(status?.personalZoomReady);
  const needsReconnect = Boolean(status?.needsReconnect) || sharedPlatform;
  const oauthReady = Boolean(status?.oauthConfigured);
  const statusLabel = loading
    ? "Checking"
    : sharedPlatform
      ? "Shared platform — reconnect"
      : personalReady
        ? "Connected"
        : needsReconnect
          ? "Reconnect required"
          : connected
            ? "Connected"
            : "Not Connected";

  const badgeVariant = loading
    ? "outline"
    : personalReady
      ? "success"
      : sharedPlatform || needsReconnect
        ? "warning"
        : "outline";

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <div className="h-1 w-full bg-gradient-to-r from-[#9E712E] via-[#CCA04C] to-[#F6C36C]" />
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#CCA04C]">
              Zoom Account
            </p>
            <CardTitle className="font-display text-xl text-[#143048]">Zoom Account</CardTitle>
            <CardDescription className="max-w-xl text-sm leading-relaxed">
              {personalReady
                ? "Your live classes are hosted on this Zoom account. Students join in-app as participants."
                : sharedPlatform
                  ? "Live classes must use your personal Zoom account — not the shared platform host."
                  : "Connect your personal Zoom account once to create and host your live classes."}
            </CardDescription>
          </div>
          <Badge variant={badgeVariant} className="shrink-0">
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Connected Email
            </dt>
            <dd className="mt-1 truncate text-sm font-medium text-foreground">
              {status?.zoomEmail ?? "—"}
            </dd>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Connection Status
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{statusLabel}</dd>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Last Synchronization
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {formatWhen(status?.lastSyncAt ?? null)}
            </dd>
          </div>
        </dl>

        {sharedPlatform ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-950 dark:text-amber-100">
            {status?.zoomEmail ? (
              <>
                <span className="font-medium">{status.zoomEmail}</span> is the shared platform Zoom
                account and cannot host live classes. Disconnect, then Connect Zoom with your own
                personal Zoom login.
              </>
            ) : (
              <>
                This connection uses the shared platform Zoom account and cannot host live classes.
                Disconnect, then Connect Zoom with your own personal Zoom login.
              </>
            )}
          </p>
        ) : null}

        {!connected && !needsReconnect ? (
          <p className="rounded-lg border border-[#CCA04C]/35 bg-[#CCA04C]/10 px-3 py-2.5 text-sm text-[#143048]">
            Connect your personal Zoom account once to create and host your live classes.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!personalReady ? (
            <Button
              asChild
              disabled={!oauthReady}
              className="bg-[#143048] text-white hover:bg-[#0f2538]"
            >
              <a href="/api/integrations/zoom/connect?returnTo=/instructor/profile">
                <Link2 className="mr-2 h-4 w-4" />
                {sharedPlatform || needsReconnect ? "Reconnect personal Zoom" : "Connect Zoom"}
              </a>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <a href="/api/integrations/zoom/connect?returnTo=/instructor/profile">
                <Video className="mr-2 h-4 w-4" /> Reconnect Zoom
              </a>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => void syncNow()}
            disabled={!personalReady || busy !== null}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {busy === "sync" ? "Syncing…" : "Sync now"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void disconnect()}
            disabled={(!connected && !needsReconnect && !sharedPlatform) || busy !== null}
          >
            <Unplug className="mr-2 h-4 w-4" />
            {busy === "disconnect" ? "Disconnecting…" : "Disconnect Zoom"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export { InstructorZoomPanel };
