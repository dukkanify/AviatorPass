"use client";

import * as React from "react";
import { ImagePlus, Library, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { courseFetch } from "@/features/courses/lib/api";
import { COURSE_IMAGE_ACCEPT, COURSE_IMAGE_MAX_BYTES } from "@/features/courses/lib/course-studio";
import { ImageCropperDialog } from "./image-cropper-dialog";
import { MediaLibraryPicker } from "./media-library-picker";

interface CourseMediaUploaderProps {
  value: string;
  courseId?: string | null;
  context?: string;
  label?: string;
  onChange: (url: string) => void;
}

export function CourseMediaUploader({
  value,
  courseId,
  context = "course",
  label = "Course image",
  onChange,
}: CourseMediaUploaderProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [cropOpen, setCropOpen] = React.useState(false);
  const [libraryOpen, setLibraryOpen] = React.useState(false);

  function acceptFile(file: File) {
    if (!COURSE_IMAGE_ACCEPT.split(",").includes(file.type) && file.type !== "image/jpg") {
      toast.error("Use JPG, PNG, WEBP, or SVG.");
      return;
    }
    if (file.size > COURSE_IMAGE_MAX_BYTES) {
      toast.error("Image must be 10MB or smaller.");
      return;
    }
    if (file.type === "image/svg+xml") {
      void upload(file);
      return;
    }
    setPendingFile(file);
    setCropOpen(true);
  }

  async function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    form.set("kind", "cover");
    form.set("context", context);
    if (courseId) form.set("courseId", courseId);
    setProgress(12);
    const timer = window.setInterval(() => {
      setProgress((current) => (current == null ? 12 : Math.min(90, current + 8)));
    }, 180);
    const result = await courseFetch<{ publicUrl: string }>("/api/courses/media", {
      method: "POST",
      body: form,
    });
    window.clearInterval(timer);
    setProgress(null);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Upload failed");
      return;
    }
    onChange(result.data.publicUrl);
    toast.success("Image uploaded");
  }

  React.useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const file = event.clipboardData?.files?.[0];
      if (file?.type.startsWith("image/")) acceptFile(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  return (
    <div className="cs-uploader">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          JPG, PNG, WEBP, SVG · 10MB · 16:9 recommended
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={COURSE_IMAGE_ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) acceptFile(file);
          e.currentTarget.value = "";
        }}
      />
      {value ? (
        <div className="cs-uploader__preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- course cover */}
          <img src={value} alt="Course cover preview" />
          <div className="cs-uploader__actions">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setLibraryOpen(true)}>
              Library
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Remove image"
              onClick={() => onChange("")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={`cs-uploader__drop ${dragging ? "is-dragging" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) acceptFile(file);
          }}
        >
          <ImagePlus className="h-6 w-6" aria-hidden />
          <strong>Drag & drop course image</strong>
          <p>JPG, PNG, WEBP, SVG · 10MB max · or paste from clipboard</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" size="sm">
              Choose image
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setLibraryOpen(true);
              }}
            >
              <Library className="mr-1 h-4 w-4" />
              Browse library
            </Button>
          </div>
        </div>
      )}
      {progress != null ? (
        <div
          className="cs-uploader__progress"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${progress}%` }} />
          <p>Uploading {progress}%</p>
        </div>
      ) : null}
      <ImageCropperDialog
        open={cropOpen}
        file={pendingFile}
        onOpenChange={setCropOpen}
        onConfirm={(file) => void upload(file)}
      />
      <p className="rounded-xl bg-muted/70 px-3 py-2 text-xs text-muted-foreground">
        Use a sharp 16:9 image (1920×1080). Thumbnail, medium, large, and WebP variants are
        generated on upload.
      </p>
      <MediaLibraryPicker
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onSelect={(url) => onChange(url)}
      />
    </div>
  );
}
