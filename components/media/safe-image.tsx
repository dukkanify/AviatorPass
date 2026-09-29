"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const PLACEHOLDER = "/brand/logo.png";

function usableSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  const value = src.trim();
  if (!value) return null;
  if (/^(unknown|null|undefined|n\/a)$/i.test(value)) return null;
  if (value.startsWith("blob:") || value.startsWith("data:")) return value;
  if (value.startsWith("/") || /^https?:\/\//i.test(value)) return value;
  return null;
}

interface SafeImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  alt: string;
  fallbackSrc?: string;
}

function SafeImage({
  src,
  alt,
  fallbackSrc = PLACEHOLDER,
  className,
  onError,
  ...rest
}: SafeImageProps) {
  const resolved = usableSrc(src) ?? fallbackSrc;
  const [current, setCurrent] = React.useState(resolved);

  React.useEffect(() => {
    setCurrent(usableSrc(src) ?? fallbackSrc);
  }, [src, fallbackSrc]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      src={current}
      alt={alt}
      className={cn("bg-muted object-cover", className)}
      onError={(event) => {
        if (current !== fallbackSrc) setCurrent(fallbackSrc);
        onError?.(event);
      }}
    />
  );
}

export { SafeImage, usableSrc };
