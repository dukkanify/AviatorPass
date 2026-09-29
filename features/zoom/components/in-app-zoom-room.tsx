"use client";

import * as React from "react";
import { ExternalLink, Radio, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isSameOriginJoin as sameOriginJoin, toWebClientUrl } from "@/lib/zoom/web-client";

function isSameOriginJoin(joinUrl: string) {
  if (typeof window === "undefined") return false;
  return sameOriginJoin(joinUrl, window.location.origin);
}

interface InAppZoomRoomProps {
  joinUrl: string;
  startUrl?: string | null;
  meetingNumber?: string | null;
  password?: string | null;
  isHost?: boolean;
  title?: string;
  className?: string;
}

function InAppZoomRoom({
  joinUrl,
  startUrl,
  meetingNumber,
  password,
  isHost = false,
  title = "Live class",
  className,
}: InAppZoomRoomProps) {
  const sameOrigin = isSameOriginJoin(joinUrl);
  const embedUrl = sameOrigin
    ? null
    : toWebClientUrl(isHost && startUrl ? startUrl : joinUrl, meetingNumber, password);
  const [failed, setFailed] = React.useState(false);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-[#143048] text-white",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div>
          <p className="font-display text-lg">{title}</p>
          <p className="flex items-center gap-1 text-xs text-white/70">
            <Radio className="size-3 text-[#CCA04C]" />
            Meeting stays inside AviatorPass
          </p>
        </div>
        {embedUrl ? (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-white/20 bg-white/5 text-white hover:bg-white/10"
          >
            <a href={embedUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              Open in Zoom
            </a>
          </Button>
        ) : null}
      </div>

      {embedUrl && !failed ? (
        <iframe
          title={title}
          src={embedUrl}
          allow="camera; microphone; fullscreen; display-capture; autoplay"
          className="h-[min(70vh,640px)] w-full bg-black"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center">
          <Shield className="size-8 text-[#CCA04C]" />
          <p className="font-display text-xl">{title}</p>
          <p className="max-w-md text-sm text-white/70">
            {sameOrigin
              ? "This session is hosted on AviatorPass. Use the meeting ID below with your instructor."
              : "The Zoom client could not be embedded. Continue with the official Zoom join link."}
          </p>
          {meetingNumber ? (
            <p className="font-mono text-sm">
              Meeting ID {meetingNumber}
              {password ? ` · Passcode ${password}` : ""}
            </p>
          ) : null}
          <Button asChild>
            <a href={joinUrl} target="_blank" rel="noreferrer">
              Continue to meeting
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

export { InAppZoomRoom, toWebClientUrl };
