"use client";

import { SafeImage } from "@/components/media/safe-image";
import { usableMediaSrc } from "@/lib/media/public-media-url";
import { cn } from "@/lib/utils";

interface AtplSubjectCoverProps {
  src?: string | null;
  title: string;
  code?: string;
  className?: string;
}

function AtplSubjectCover({ src, title, code, className }: AtplSubjectCoverProps) {
  if (usableMediaSrc(src)) {
    return <SafeImage src={src} alt={title} className={className} />;
  }

  return (
    <div className={cn("atpl-subject-cover", className)} role="img" aria-label={title}>
      <span className="atpl-subject-cover-kicker">{code ? `ATPL ${code}` : "ATPL"}</span>
      <span className="atpl-subject-cover-name">{title}</span>
    </div>
  );
}

export { AtplSubjectCover };
