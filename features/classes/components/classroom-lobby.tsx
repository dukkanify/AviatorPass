"use client";

import * as React from "react";
import Link from "@/components/ui/app-link";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { ROLE_DASHBOARD, type Role } from "@/constants/roles";
import { useAuth } from "@/providers/auth-provider";
import { classFetch } from "@/features/classes/lib/api";
import {
  MEETING_SDK_APP_NAME,
  MEETING_SDK_INDEPENDENCE,
} from "@/features/zoom/content/meeting-sdk-public";
import type { LiveClassListItem } from "@/types/classes";

type ClassPage = {
  data: LiveClassListItem[];
  total: number;
};

function formatWhen(startsAt: string): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "Time not set";
  return start.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ClassroomLobby() {
  const { user } = useAuth();
  const home = user && user.role in ROLE_DASHBOARD ? ROLE_DASHBOARD[user.role as Role] : "/login";
  const [classes, setClasses] = React.useState<LiveClassListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await classFetch<ClassPage>("/api/classes?pageSize=50&status=all");
      if (cancelled) return;
      if (!result.success || !result.data) {
        setError(result.error ?? "Unable to load classes");
        setClasses([]);
      } else {
        setClasses(result.data.data ?? []);
        setError(null);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="classroom-shell relative"
      style={{ minHeight: "100dvh", backgroundColor: "#071018", color: "#fff" }}
    >
      <div className="classroom-page relative z-10">
        <header className="classroom-topbar">
          <BrandLogo variant="dark" href="/" priority />
          <Link href={home} className="text-sm text-white/70 hover:text-white">
            Dashboard
          </Link>
        </header>

        <section
          className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6"
          aria-labelledby="classroom-heading"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#CCA04C]">
            Meeting SDK
          </p>
          <h1
            id="classroom-heading"
            className="mt-3 font-display text-3xl font-semibold sm:text-4xl"
          >
            {MEETING_SDK_APP_NAME}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
            Choose a class to open the in-app classroom. {MEETING_SDK_INDEPENDENCE} This page does
            not connect a Zoom account.
          </p>

          {loading ? <p className="mt-8 text-sm text-white/60">Loading your classes…</p> : null}

          {error ? (
            <p
              className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {!loading && !error && classes.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="font-display text-xl font-semibold">No class is ready</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                Your account has no assigned live class. The embedded meeting cannot start until a
                class exists. Creating a meeting requires the instructor’s personal Zoom connection
                on the separate AviatorPass for Zoom application.
              </p>
            </div>
          ) : null}

          {!loading && classes.length > 0 ? (
            <ul className="mt-8 space-y-3">
              {classes.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-sm text-white/60">
                      {formatWhen(item.startsAt)}
                      {item.instructorName ? ` · ${item.instructorName}` : ""}
                      {item.computedStatus ? ` · ${item.computedStatus}` : ""}
                    </p>
                  </div>
                  <Button asChild variant="accent">
                    <Link href={`/join/${item.id}`}>Open classroom</Link>
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </div>
  );
}
