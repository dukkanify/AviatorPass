import Image from "next/image";

import { cn } from "@/lib/utils";

type EasaBadgeProps = {
  className?: string;
  variant?: "light" | "dark";
};

function EasaBadge({ className, variant = "dark" }: EasaBadgeProps) {
  return (
    <div
      className={cn(
        "easa-badge inline-flex max-w-full items-center gap-3 rounded-xl border px-3 py-2",
        variant === "dark"
          ? "border-accent/40 bg-[#143048] text-white"
          : "border-accent/35 bg-white text-[#143048]",
        className,
      )}
    >
      <Image
        src="/partners/easa-badge.svg"
        alt="EASA Certified Instructors"
        width={160}
        height={48}
        unoptimized
        className="h-10 w-auto max-w-[min(160px,55vw)]"
      />
      <p className="min-w-0 text-left text-[11px] font-semibold uppercase leading-tight tracking-[0.14em]">
        EASA Certified Instructors
      </p>
    </div>
  );
}

export { EasaBadge };
