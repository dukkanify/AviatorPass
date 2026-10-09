import Image from "next/image";

import { cn } from "@/lib/utils";

export const MARKETING_HERO_SRC = "/images/marketing/hero-aircraft.jpg";

type HeroLcpImageProps = {
  className?: string;
  src?: string;
  sizes?: string;
};

/**
 * Above-the-fold marketing hero. Next.js Image emits a high-priority
 * preload and serves AVIF/WebP when the client supports them.
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
      className={cn("object-cover object-[center_25%]", className)}
    />
  );
}

export { HeroLcpImage };
