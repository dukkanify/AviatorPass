"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";

import { AppLink } from "@/components/ui/app-link";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  trend?: { value: number; label?: string };
  href?: string;
  className?: string;
}

function StatCard({ label, value, hint, icon: Icon, trend, href, className }: StatCardProps) {
  const positive = (trend?.value ?? 0) >= 0;
  const card = (
    <Card
      className={cn(
        "h-full overflow-hidden transition-[box-shadow,border-color,transform] duration-200",
        href
          ? "group-hover:border-accent/50 group-hover:shadow-soft group-focus-visible:border-accent/50"
          : "hover:border-border/80 hover:shadow-soft",
        className,
      )}
    >
      <CardContent className={cn("p-5", href && "pr-10")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="break-words font-display text-3xl font-semibold tracking-tight text-foreground">
              {value}
            </p>
            {trend ? (
              <p
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium",
                  positive ? "text-success" : "text-destructive",
                )}
              >
                {positive ? (
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                )}
                {positive ? "+" : ""}
                {trend.value}%
                {trend.label ? (
                  <span className="font-normal text-muted-foreground"> {trend.label}</span>
                ) : null}
              </p>
            ) : hint ? (
              <p className="break-words text-xs text-muted-foreground">{hint}</p>
            ) : null}
          </div>
          {Icon ? (
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-accent/15 dark:text-accent"
              aria-hidden
            >
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );

  if (!href) return card;

  return (
    <AppLink
      href={href}
      aria-label={`${label}: ${value}`}
      className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="relative block h-full">
        {card}
        <ArrowUpRight
          className="pointer-events-none absolute bottom-4 right-4 h-4 w-4 text-muted-foreground transition-colors group-hover:text-accent"
          aria-hidden
        />
      </span>
    </AppLink>
  );
}

export { StatCard };
