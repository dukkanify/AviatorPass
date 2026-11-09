import Image from "next/image";

import { cn } from "@/lib/utils";

export const MARKETING_HERO_SRC = "/images/marketing/hero-aircraft.jpg";

type HeroLcpImageProps = {
  className?: string;
  src?: string;
  sizes?: string;
  /** Kept for callers; hero always fills the frame edge-to-edge. */
  fit?: "contain" | "cover";
};

/**
 * Above-the-fold marketing hero. Next.js Image emits a high-priority
 * preload and serves AVIF/WebP when the client supports them.
 * Desktop: cover. Mobile/tablet: contain so the full airframe stays visible
 * against the solid navy hero background (no blurred side plates).
 */
function HeroLcpImage({ className, src = MARKETING_HERO_SRC, sizes = "100vw" }: HeroLcpImageProps) {
  return (
    <Image
      src={src}
      alt=""
      fill
      priority
      fetchPriority="high"
      loading="eager"
      quality={68}
      sizes={sizes}
      className={cn("atpl-hero-photo object-cover object-center max-lg:object-contain", className)}
    />
  );
}

export { HeroLcpImage };
