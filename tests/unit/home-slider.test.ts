import { beforeEach, describe, expect, it } from "vitest";

import { MARKETING_HERO_SRC } from "@/constants/marketing-hero";
import {
  addHomeSliderSlide,
  deleteHomeSliderSlide,
  listActiveHomeSliderSlides,
  reorderHomeSliderSlides,
  updateHomeSliderSlide,
} from "@/services/marketing/home-slider-service";
import { resetHomeSliderDbForTests } from "@/services/marketing/home-slider-store";

describe("homepage hero slider", () => {
  beforeEach(() => {
    resetHomeSliderDbForTests();
  });

  it("seeds the default aircraft hero slide", () => {
    const slides = listActiveHomeSliderSlides();
    expect(slides).toHaveLength(1);
    expect(slides[0]?.imageUrl).toBe(MARKETING_HERO_SRC);
  });

  it("adds, reorders, updates, and protects the last slide", async () => {
    const second = await addHomeSliderSlide({
      imageUrl: "/images/marketing/hero-aircraft.jpg?v=2",
      altText: "Second aircraft",
      actorId: "test",
      maxBytes: 5_000_000,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    expect(listActiveHomeSliderSlides()).toHaveLength(2);

    const first = listActiveHomeSliderSlides()[0]!;
    reorderHomeSliderSlides([second.id, first.id]);
    expect(listActiveHomeSliderSlides().map((slide) => slide.id)).toEqual([second.id, first.id]);

    updateHomeSliderSlide(second.id, { active: false, altText: "Hidden aircraft" });
    expect(listActiveHomeSliderSlides()).toHaveLength(1);
    expect(listActiveHomeSliderSlides()[0]?.id).toBe(first.id);

    deleteHomeSliderSlide(second.id);
    expect(() => deleteHomeSliderSlide(first.id)).toThrow(/at least one slide/i);
  });
});
