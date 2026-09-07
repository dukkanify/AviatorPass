"use client";

import * as React from "react";

function formatCountdown(startsAt: string, now: number): string {
  const start = Date.parse(startsAt);
  if (Number.isNaN(start)) return "—";
  const diff = start - now;
  if (diff <= 0) return "Starting now";
  const totalMinutes = Math.floor(diff / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

function MeetingCountdown({ startsAt }: { startsAt: string }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return <span>{formatCountdown(startsAt, now)}</span>;
}

export { MeetingCountdown, formatCountdown };
