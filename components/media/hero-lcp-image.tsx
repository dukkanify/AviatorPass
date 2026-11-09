import Image from "next/image";

import { cn } from "@/lib/utils";

export const MARKETING_HERO_SRC = "/images/marketing/hero-aircraft.jpg";

type HeroLcpImageProps = {
  className?: string;
  src?: string;
  sizes?: string;
  /**
   * `contain` keeps the full airframe visible (homepage).
   * `cover` fills the frame and may crop (acceptable on smaller decorative heroes).
   */
  fit?: "contain" | "cover";
};

/**
 * Above-the-fold marketing hero. Next.js Image emits a high-priority
 * preload and serves AVIF/WebP when the client supports them.
 *
 * Homepage uses a blurred cover plate behind a sharp contain plate so the
 * jet stays fully visible without empty letterboxing.
 */
function HeroLcpImage({
  className,
  src = MARKETING_HERO_SRC,
  sizes = "100vw",
  fit = "contain",
}: HeroLcpImageProps) {
  if (fit === "cover") {
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
        className={cn("object-cover object-center", className)}
      />
    );
  }

  return (
    <span className="absolute inset-0 block" aria-hidden>
      <Image
        src={src}
        alt=""
        fill
        priority
        fetchPriority="high"
        loading="eager"
        quality={50}
        sizes={sizes}
        className="object-cover object-center scale-110 blur-xl opacity-55"
      />
      <Image
        src={src}
        alt=""
        fill
        priority
        fetchPriority="high"
        loading="eager"
        quality={75}
        sizes={sizes}
        className={cn("object-contain object-center", className)}
      />
    </span>
  );
}

export { HeroLcpImage };
