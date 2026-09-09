"use client";

import { Layout, Monitor, Smartphone, Square } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COURSE_STATUS_LABELS } from "@/constants/courses";
import { formatDurationHours } from "@/features/courses/lib/course-studio";
import { cn } from "@/lib/utils";
import { formatMinor } from "@/services/payments/money";
import type { CourseStatus } from "@/types/courses";

export type PreviewMode = "card" | "page" | "mobile" | "desktop";

type CoursePreviewPanelProps = {
  title: string;
  description: string;
  thumbnailUrl: string;
  category: string;
  instructorName: string;
  priceAmount: number;
  currency: string;
  durationMinutes: number;
  status: CourseStatus;
  mode: PreviewMode;
  onModeChange: (mode: PreviewMode) => void;
};

export function CoursePreviewPanel({
  title,
  description,
  thumbnailUrl,
  category,
  instructorName,
  priceAmount,
  currency,
  durationMinutes,
  status,
  mode,
  onModeChange,
}: CoursePreviewPanelProps) {
  const modes: { id: PreviewMode; label: string; icon: typeof Square }[] = [
    { id: "card", label: "Card", icon: Square },
    { id: "page", label: "Page", icon: Layout },
    { id: "mobile", label: "Mobile", icon: Smartphone },
    { id: "desktop", label: "Desktop", icon: Monitor },
  ];

  const priceLabel = formatMinor(priceAmount, currency || "AED");
  const durationLabel = formatDurationHours(durationMinutes).label;

  const card = (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="relative aspect-video bg-muted">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- live preview
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Course image
          </div>
        )}
        <Badge className="absolute left-3 top-3">{category || "Course"}</Badge>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="font-semibold leading-snug">{title || "Untitled course"}</h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {description || "Add a short description to preview the course card."}
        </p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{instructorName || "Instructor"}</span>
          <span className="font-semibold">{priceLabel}</span>
        </div>
        <p className="text-xs text-muted-foreground">{durationLabel}</p>
      </div>
    </article>
  );

  const page = (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="relative aspect-[16/7] bg-muted">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- live preview
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 text-white">
          <p className="text-xs uppercase tracking-wide opacity-80">{category}</p>
          <h3 className="text-xl font-semibold">{title || "Untitled course"}</h3>
          <p className="mt-1 text-sm opacity-90">{instructorName}</p>
        </div>
      </div>
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold">{priceLabel}</span>
          <Badge>{COURSE_STATUS_LABELS[status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {description || "Full course description will appear here for learners."}
        </p>
        <Button className="w-full" disabled>
          Enrol now
        </Button>
      </div>
    </div>
  );

  return (
    <aside className="sticky top-4 space-y-4 rounded-2xl border border-border bg-card/80 p-4 shadow-soft backdrop-blur-sm">
      <h2 className="text-sm font-semibold">Live preview</h2>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {modes.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onModeChange(item.id)}
              className={cn(
                "flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                mode === item.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>
      <div className={cn("mx-auto", mode === "mobile" && "max-w-[280px]")}>
        {mode === "card" ? card : page}
      </div>
    </aside>
  );
}
