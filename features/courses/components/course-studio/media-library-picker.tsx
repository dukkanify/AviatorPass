"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { courseFetch } from "@/features/courses/lib/api";

type LibraryAsset = {
  id: string;
  title: string;
  url: string;
  tags: string[];
  createdAt: string;
};

const FILTERS = [
  { id: "recent", label: "Recently uploaded" },
  { id: "course", label: "Course" },
  { id: "lesson", label: "Lesson" },
  { id: "instructor", label: "Instructor" },
  { id: "certificates", label: "Certificates" },
] as const;

interface MediaLibraryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string, title: string) => void;
}

export function MediaLibraryPicker({ open, onOpenChange, onSelect }: MediaLibraryPickerProps) {
  const [q, setQ] = React.useState("");
  const [context, setContext] = React.useState<(typeof FILTERS)[number]["id"]>("recent");
  const [assets, setAssets] = React.useState<LibraryAsset[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    void courseFetch<LibraryAsset[]>(
      `/api/courses/media?q=${encodeURIComponent(q)}&context=${context}`,
    )
      .then((res) => setAssets(res.data ?? []))
      .finally(() => setLoading(false));
  }, [open, q, context]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Media library</DialogTitle>
          <DialogDescription>
            Search existing images or filter by course, lesson, instructor, or certificates.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search images…"
            aria-label="Search media library"
          />
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <Button
                key={filter.id}
                type="button"
                size="sm"
                variant={context === filter.id ? "default" : "outline"}
                onClick={() => setContext(filter.id)}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading library…</p>
        ) : assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No images in this filter yet.</p>
        ) : (
          <div className="grid max-h-[420px] grid-cols-2 gap-3 overflow-auto sm:grid-cols-3">
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                className="overflow-hidden rounded-2xl border bg-card text-left shadow-sm"
                onClick={() => {
                  onSelect(asset.url, asset.title);
                  onOpenChange(false);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- library thumb */}
                <img
                  src={asset.url}
                  alt={asset.title}
                  className="aspect-video w-full object-cover"
                />
                <span className="block truncate px-3 py-2 text-sm">{asset.title}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
