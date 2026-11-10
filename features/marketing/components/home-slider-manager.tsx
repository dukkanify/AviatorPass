"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ImageIcon, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { OptimizedImage } from "@/components/media/optimized-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { authFetch, csrfHeaders, ensureBrowserCsrf } from "@/features/auth/services/auth-api";
import type { HomeSliderDatabase, HomeSliderSlide } from "@/types/home-slider";

export function HomeSliderManager() {
  const [data, setData] = React.useState<HomeSliderDatabase | null>(null);
  const [altText, setAltText] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState("");
  const [intervalSec, setIntervalSec] = React.useState("6");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const result = await authFetch<HomeSliderDatabase>("/api/admin/home-slider");
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Could not load slider");
      return;
    }
    setData(result.data);
    setIntervalSec(String(Math.round(result.data.intervalMs / 1000)));
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function refreshFrom(result: {
    success: boolean;
    data?: HomeSliderDatabase | null;
    error?: string | null;
  }) {
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Request failed");
      return false;
    }
    setData(result.data);
    setIntervalSec(String(Math.round(result.data.intervalMs / 1000)));
    return true;
  }

  async function uploadFile(file: File) {
    setBusy(true);
    await ensureBrowserCsrf();
    const form = new FormData();
    form.append("file", file);
    if (altText.trim()) form.append("altText", altText.trim());
    const res = await fetch("/api/admin/home-slider", {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders(),
      body: form,
    });
    const json = (await res.json()) as {
      success: boolean;
      data?: HomeSliderDatabase;
      error?: string;
    };
    setBusy(false);
    if (!(await refreshFrom(json))) return;
    setAltText("");
    toast.success("Slide image added");
  }

  async function addFromUrl() {
    if (!imageUrl.trim()) {
      toast.error("Enter an image URL");
      return;
    }
    setBusy(true);
    const result = await authFetch<HomeSliderDatabase>("/api/admin/home-slider", {
      method: "POST",
      body: JSON.stringify({
        action: "add_url",
        imageUrl: imageUrl.trim(),
        altText: altText.trim() || undefined,
      }),
    });
    setBusy(false);
    if (!(await refreshFrom(result))) return;
    setImageUrl("");
    setAltText("");
    toast.success("Slide added");
  }

  async function saveSettings() {
    setBusy(true);
    const result = await authFetch<HomeSliderDatabase>("/api/admin/home-slider", {
      method: "POST",
      body: JSON.stringify({
        action: "settings",
        intervalMs: Math.round(Number(intervalSec || 6) * 1000),
      }),
    });
    setBusy(false);
    if (!(await refreshFrom(result))) return;
    toast.success("Slider timing saved");
  }

  async function patchSlide(
    slide: HomeSliderSlide,
    patch: Partial<Pick<HomeSliderSlide, "altText" | "active">>,
  ) {
    setBusy(true);
    const result = await authFetch<HomeSliderDatabase>("/api/admin/home-slider", {
      method: "POST",
      body: JSON.stringify({ action: "update_slide", id: slide.id, ...patch }),
    });
    setBusy(false);
    if (!(await refreshFrom(result))) return;
    toast.success("Slide updated");
  }

  async function move(slide: HomeSliderSlide, direction: -1 | 1) {
    if (!data) return;
    const ordered = [...data.slides].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((row) => row.id === slide.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row!);
    setBusy(true);
    const result = await authFetch<HomeSliderDatabase>("/api/admin/home-slider", {
      method: "POST",
      body: JSON.stringify({ action: "reorder", orderedIds: next.map((row) => row.id) }),
    });
    setBusy(false);
    if (!(await refreshFrom(result))) return;
  }

  async function remove(slide: HomeSliderSlide) {
    setBusy(true);
    const result = await authFetch<HomeSliderDatabase>("/api/admin/home-slider", {
      method: "POST",
      body: JSON.stringify({ action: "delete", id: slide.id }),
    });
    setBusy(false);
    if (!(await refreshFrom(result))) return;
    toast.success("Slide removed");
  }

  const slides = [...(data?.slides ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="size-4" />
            Homepage hero slider
          </CardTitle>
          <CardDescription>
            Add and reorder full-bleed hero images for the homepage. Active slides rotate
            automatically behind the Aviator Pass headline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="slider-interval">Rotation interval (seconds)</Label>
              <Input
                id="slider-interval"
                type="number"
                min={3}
                step={1}
                value={intervalSec}
                onChange={(event) => setIntervalSec(event.target.value)}
              />
            </div>
            <Button type="button" onClick={() => void saveSettings()} disabled={busy}>
              Save timing
            </Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="slider-alt">Alt text</Label>
              <Input
                id="slider-alt"
                value={altText}
                onChange={(event) => setAltText(event.target.value)}
                placeholder="Aircraft over runway"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slider-url">Or paste image URL</Label>
              <Input
                id="slider-url"
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="/images/marketing/hero-aircraft.jpg"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} asChild>
              <label className="cursor-pointer">
                <Upload className="me-2 size-4" />
                Upload image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadFile(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </Button>
            <Button type="button" onClick={() => void addFromUrl()} disabled={busy}>
              <Plus className="me-2 size-4" />
              Add from URL
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {slides.map((slide, index) => (
          <Card key={slide.id} className="overflow-hidden rounded-2xl">
            <CardContent className="grid gap-4 p-4 md:grid-cols-[180px_1fr_auto]">
              <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-muted">
                <OptimizedImage
                  src={slide.imageUrl}
                  alt={slide.altText}
                  fill
                  className="object-cover"
                  sizes="180px"
                />
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor={`slide-alt-${slide.id}`}>Alt text</Label>
                  <Input
                    id={`slide-alt-${slide.id}`}
                    defaultValue={slide.altText}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next && next !== slide.altText) {
                        void patchSlide(slide, { altText: next });
                      }
                    }}
                  />
                </div>
                <p className="truncate text-xs text-muted-foreground">{slide.imageUrl}</p>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={slide.active}
                    onCheckedChange={(active) => void patchSlide(slide, { active })}
                    disabled={busy}
                  />
                  <span className="text-sm">{slide.active ? "Active" : "Hidden"}</span>
                </div>
              </div>
              <div className="flex flex-row gap-2 md:flex-col">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  disabled={busy || index === 0}
                  onClick={() => void move(slide, -1)}
                  aria-label="Move up"
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  disabled={busy || index === slides.length - 1}
                  onClick={() => void move(slide, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  disabled={busy || slides.length <= 1}
                  onClick={() => void remove(slide)}
                  aria-label="Delete slide"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
