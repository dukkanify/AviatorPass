export interface AtplLandingSubject {
  id: string;
  code: string;
  title: string;
  shortDescription: string;
  badgeLabel: string;
  imageUrl: string | null;
  sortOrder: number;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AtplLandingSubjectWrite = {
  code?: string;
  title: string;
  shortDescription?: string;
  badgeLabel?: string;
  imageUrl?: string | null;
  sortOrder?: number;
  visible?: boolean;
};

export type AtplLandingSubjectPublic = Pick<
  AtplLandingSubject,
  "id" | "code" | "title" | "shortDescription" | "badgeLabel" | "imageUrl"
>;
