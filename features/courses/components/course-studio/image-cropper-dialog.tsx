"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type AspectMode = "16:9" | "1:1" | "auto";

interface ImageCropperDialogProps {
  open: boolean;
  file: File | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (file: File, previewUrl: string) => void;
}

export function ImageCropperDialog({
  open,
  file,
  onOpenChange,
  onConfirm,
}: ImageCropperDialogProps) {
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const [src, setSrc] = React.useState<string | null>(null);
  const [aspect, setAspect] = React.useState<AspectMode>("16:9");
  const [zoom, setZoom] = React.useState(1);
  const [rotation, setRotation] = React.useState(0);
  const [quality, setQuality] = React.useState(0.82);

  React.useEffect(() => {
    if (!file) {
      setSrc(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    setZoom(1);
    setRotation(0);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function confirm() {
    if (!imageRef.current || !file) return;
    const img = imageRef.current;
    const ratio =
      aspect === "1:1" ? 1 : aspect === "16:9" ? 16 / 9 : img.naturalWidth / img.naturalHeight;
    const outputWidth = Math.min(1920, img.naturalWidth);
    const outputHeight = Math.round(outputWidth / ratio);
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0f2235";
    ctx.fillRect(0, 0, outputWidth, outputHeight);
    ctx.translate(outputWidth / 2, outputHeight / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);
    const drawWidth = outputWidth;
    const drawHeight = outputWidth / (img.naturalWidth / img.naturalHeight);
    ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type === "image/png" ? "image/png" : "image/webp", quality),
    );
    if (!blob) return;
    const next = new File(
      [blob],
      file.name.replace(/\.[^.]+$/, "") + (blob.type.includes("png") ? ".png" : ".webp"),
      {
        type: blob.type,
      },
    );
    onConfirm(next, URL.createObjectURL(blob));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crop course image</DialogTitle>
          <DialogDescription>
            Choose 16:9, 1:1, or auto. Zoom, rotate, and compress before saving.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["16:9", "1:1", "auto"] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={aspect === mode ? "default" : "outline"}
                onClick={() => setAspect(mode)}
              >
                {mode === "auto" ? "Auto crop" : mode}
              </Button>
            ))}
          </div>
          <div className="overflow-hidden rounded-2xl bg-[#0f2235]">
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element -- crop source
              <img
                ref={imageRef}
                src={src}
                alt=""
                className="mx-auto max-h-[360px] w-full object-contain"
                style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
              />
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <Label htmlFor="crop-zoom">Zoom</Label>
              <input
                id="crop-zoom"
                type="range"
                min={1}
                max={2.4}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <Label htmlFor="crop-rotate">Rotate</Label>
              <input
                id="crop-rotate"
                type="range"
                min={-180}
                max={180}
                step={1}
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <Label htmlFor="crop-quality">Compress</Label>
              <input
                id="crop-quality"
                type="range"
                min={0.5}
                max={1}
                step={0.02}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
              />
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void confirm()}>
            Use cropped image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
