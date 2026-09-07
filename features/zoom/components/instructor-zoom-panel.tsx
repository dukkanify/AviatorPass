"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Link2, RefreshCw, Unplug, Video } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    if (flag === "error") toast.error("Zoom connection failed. Try again.");
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
  const needsReconnect = Boolean(status?.needsReconnect);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Zoom Integration</CardTitle>
            <CardDescription>
              Connect your Zoom account so live classes create meetings automatically.
            </CardDescription>
          </div>
          <Badge variant={connected ? "success" : needsReconnect ? "warning" : "outline"}>
            {loading
              ? "Checking"
              : connected
                ? "Connected"
                : needsReconnect
                  ? "Reconnect required"
                  : "Not connected"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Connected Zoom email:</span>{" "}
            {status?.zoomEmail ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Connected since:</span>{" "}
            {formatWhen(status?.connectedAt ?? null)}
          </p>
          <p>
            <span className="text-muted-foreground">Last sync:</span>{" "}
            {formatWhen(status?.lastSyncAt ?? null)}
          </p>
          <p>
            <span className="text-muted-foreground">OAuth configured:</span>{" "}
            {status?.oauthConfigured ? "Yes" : "No"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <Button asChild disabled={!status?.oauthConfigured}>
              <a href="/api/integrations/zoom/connect">
                <Link2 className="mr-2 h-4 w-4" />
                {needsReconnect ? "Reconnect" : "Connect"}
              </a>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <a href="/api/integrations/zoom/connect">
                <Video className="mr-2 h-4 w-4" /> Reconnect
              </a>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => void syncNow()}
            disabled={!connected || busy !== null}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {busy === "sync" ? "Syncing…" : "Sync now"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void disconnect()}
            disabled={(!connected && !needsReconnect) || busy !== null}
          >
            <Unplug className="mr-2 h-4 w-4" />
            {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export { InstructorZoomPanel };
