"use client";

import * as React from "react";
import Image from "next/image";

import { MARKETING_HERO_SRC } from "@/constants/marketing-hero";
import { cn } from "@/lib/utils";
import type { HomeSliderSlide } from "@/types/home-slider";

type HomeHeroSliderProps = {
  slides: HomeSliderSlide[];
  intervalMs?: number;
  className?: string;
};

function HomeHeroSlider({ slides, intervalMs = 6000, className }: HomeHeroSliderProps) {
  const activeSlides =
    slides.length > 0
      ? slides
      : [
          {
            id: "fallback",
            imageUrl: MARKETING_HERO_SRC,
            altText: "",
            sortOrder: 0,
            active: true,
            createdAt: "",
            updatedAt: "",
          } satisfies HomeSliderSlide,
        ];
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (activeSlides.length <= 1) return;
    const timer = window.setInterval(
      () => {
        setIndex((current) => (current + 1) % activeSlides.length);
      },
      Math.max(2500, intervalMs),
    );
    return () => window.clearInterval(timer);
  }, [activeSlides.length, intervalMs]);

  React.useEffect(() => {
    if (index >= activeSlides.length) setIndex(0);
  }, [activeSlides.length, index]);

  return (
    <div className={cn("absolute inset-0", className)} aria-hidden={activeSlides.length <= 1}>
      {activeSlides.map((slide, slideIndex) => {
        const isActive = slideIndex === index;
        return (
          <Image
            key={slide.id}
            src={slide.imageUrl}
            alt={isActive ? slide.altText : ""}
            fill
            priority={slideIndex === 0}
            fetchPriority={slideIndex === 0 ? "high" : "auto"}
            loading={slideIndex === 0 ? "eager" : "lazy"}
            quality={68}
            sizes="100vw"
            className={cn(
              "object-cover object-[center_25%] transition-opacity duration-1000 ease-out",
              isActive ? "opacity-100" : "opacity-0",
            )}
          />
        );
      })}
      {activeSlides.length > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center gap-2">
          {activeSlides.map((slide, slideIndex) => (
            <span
              key={slide.id}
              className={cn(
                "h-1.5 w-1.5 rounded-full bg-white/35",
                slideIndex === index && "bg-white/90",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export { HomeHeroSlider };
