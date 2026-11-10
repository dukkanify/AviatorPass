/**
 * Homepage hero slider slides managed from Super Admin Asset Manager.
 */

export type HomeSliderSlide = {
  id: string;
  imageUrl: string;
  altText: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HomeSliderDatabase = {
  slides: HomeSliderSlide[];
  intervalMs: number;
  updatedAt: string;
};
