"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "@/components/ui/app-link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Eye, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CourseMediaUploader } from "./course-media-uploader";
import { CoursePreviewPanel, type PreviewMode } from "./course-preview-panel";
import {
  COURSE_DELIVERY_LABELS,
  COURSE_DELIVERY_TYPES,
  COURSE_STATUSES,
  COURSE_STATUS_LABELS,
  DIFFICULTY_LABELS,
  DIFFICULTY_LEVELS,
  ENROLLMENT_MODE_LABELS,
  ENROLLMENT_MODES,
} from "@/constants/courses";
import { courseFetch } from "@/features/courses/lib/api";
import {
  COURSE_CURRENCIES,
  COURSE_FORM_TABS,
  courseSeoFrom,
  courseSlugFrom,
  emptySeo,
  formatDurationHours,
  publicStudioHref,
  seoScore,
  slugifyCourse,
} from "@/features/courses/lib/course-studio";
import { publicCourseHref } from "@/lib/courses/public-course-path";
import { cn } from "@/lib/utils";
import { majorToMinor, minorToMajor } from "@/services/payments/money";
import type {
  CourseCategory,
  CourseDeliveryType,
  CourseDetail,
  CourseSeo,
  CourseStatus,
  DifficultyLevel,
  EnrollmentMode,
} from "@/types/courses";
import type { UserProfile } from "@/types";

type SaveState = "saved" | "saving" | "unsaved";

type StudioPayload = {
  title: string;
  code: string;
  shortDescription: string;
  fullDescription: string;
  categoryId: string | null;
  difficulty: DifficultyLevel;
  language: string;
  thumbnailUrl: string | null;
  coverImageUrl: string | null;
  primaryInstructorId: string | null;
  estimatedDurationMinutes: number;
  priceAmount: number | null;
  currency: string;
  enrollmentMode: EnrollmentMode;
  deliveryType: CourseDeliveryType;
  enrollmentOpen: boolean;
  hidden: boolean;
  status: CourseStatus;
  scheduledPublishAt: string | null;
  metadata: {
    slug: string;
    seo: CourseSeo;
    mediaVariants?: {
      original: string;
      thumbnail: string;
      medium: string;
      large: string;
      webp: string;
    };
  };
};

export function CourseStudioView({
  courseId,
  basePath = "/super-admin/courses",
}: {
  courseId?: string;
  basePath?: string;
}) {
  const router = useRouter();
  const isEdit = Boolean(courseId);
  const [loading, setLoading] = useState(isEdit);
  const [tab, setTab] = useState<(typeof COURSE_FORM_TABS)[number]["id"]>("basic");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("card");
  const [saveState, setSaveState] = useState<SaveState>(isEdit ? "saved" : "unsaved");
  const [savedId, setSavedId] = useState<string | undefined>(courseId);
  const [copied, setCopied] = useState(false);
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [instructors, setInstructors] = useState<UserProfile[]>([]);
  const skipAutosave = useRef(true);
  const lastSaved = useRef("");

  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [categoryId, setCategoryId] = useState("none");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("beginner");
  const [shortDescription, setShortDescription] = useState("");
  const [fullDescription, setFullDescription] = useState("");
  const [instructorId, setInstructorId] = useState("none");
  const [instructorQuery, setInstructorQuery] = useState("");
  const [enrollmentMode, setEnrollmentMode] = useState<EnrollmentMode>("open");
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [priceMajor, setPriceMajor] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [status, setStatus] = useState<CourseStatus>("draft");
  const [language, setLanguage] = useState("en");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [ogImageUrl, setOgImageUrl] = useState("");
  const [seo, setSeo] = useState<CourseSeo>(emptySeo());
  const [scheduledPublishAt, setScheduledPublishAt] = useState("");
  const [deliveryType, setDeliveryType] = useState<CourseDeliveryType>("recorded");
  const [enrollmentOpen, setEnrollmentOpen] = useState(true);
  const [hidden, setHidden] = useState(false);

  const applyCourse = useCallback((course: CourseDetail) => {
    skipAutosave.current = true;
    const nextSeo = courseSeoFrom(course);
    const nextSlug = courseSlugFrom(course);
    setTitle(course.title);
    setCode(course.code);
    setSlug(nextSlug);
    setSlugTouched(Boolean(course.metadata?.slug));
    setCategoryId(course.categoryId ?? "none");
    setDifficulty(course.difficulty);
    setShortDescription(course.shortDescription);
    setFullDescription(course.fullDescription);
    setInstructorId(course.primaryInstructorId ?? "none");
    setEnrollmentMode(course.enrollmentMode);
    setDurationMinutes(course.estimatedDurationMinutes);
    setCurrency(course.currency || "AED");
    setPriceMajor(
      course.priceAmount != null
        ? String(minorToMajor(course.priceAmount, course.currency || "AED"))
        : "",
    );
    setStatus(course.status);
    setLanguage(course.language);
    setThumbnailUrl(course.coverImageUrl || course.thumbnailUrl || "");
    setOgImageUrl(nextSeo.ogImageUrl || course.coverImageUrl || course.thumbnailUrl || "");
    setSeo(nextSeo);
    setScheduledPublishAt(course.scheduledPublishAt ? course.scheduledPublishAt.slice(0, 16) : "");
    setDeliveryType(course.deliveryType);
    setEnrollmentOpen(course.enrollmentOpen);
    setHidden(course.hidden);
    setSaveState("saved");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cats, inst] = await Promise.all([
        courseFetch<CourseCategory[]>("/api/courses/categories?includeHidden=1"),
        courseFetch<UserProfile[]>("/api/users?role=instructor"),
      ]);
      if (cancelled) return;
      setCategories(cats.data ?? []);
      setInstructors(inst.data ?? []);
      if (courseId) {
        const detail = await courseFetch<CourseDetail>(`/api/courses/${courseId}`);
        if (!cancelled && detail.data) applyCourse(detail.data);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, applyCourse]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugifyCourse(title || code));
  }, [title, code, slugTouched]);

  const instructorName =
    instructors.find((item) => item.id === instructorId)?.fullName ||
    instructors.find((item) => item.id === instructorId)?.email ||
    "";
  const categoryName = categories.find((item) => item.id === categoryId)?.name ?? "";
  const liveUrl = publicStudioHref(slug);
  const previewPath = publicCourseHref({
    id: savedId ?? "draft",
    code,
    metadata: { slug },
  });
  const scored = seoScore(
    {
      ...seo,
      metaTitle: seo.metaTitle || title,
      metaDescription: seo.metaDescription || shortDescription,
      ogImageUrl: seo.ogImageUrl || ogImageUrl || thumbnailUrl,
    },
    title,
  );

  const payload = useCallback((): StudioPayload => {
    const priceAmount = priceMajor.trim() ? majorToMinor(Number(priceMajor) || 0, currency) : null;
    return {
      title: title.trim(),
      code: code.trim().toUpperCase(),
      shortDescription: shortDescription.trim(),
      fullDescription: fullDescription.trim(),
      categoryId: categoryId === "none" ? null : categoryId,
      difficulty,
      language,
      thumbnailUrl: thumbnailUrl || null,
      coverImageUrl: thumbnailUrl || null,
      primaryInstructorId: instructorId === "none" ? null : instructorId,
      estimatedDurationMinutes: durationMinutes,
      priceAmount,
      currency,
      enrollmentMode,
      deliveryType,
      enrollmentOpen,
      hidden,
      status,
      scheduledPublishAt: scheduledPublishAt ? new Date(scheduledPublishAt).toISOString() : null,
      metadata: {
        slug,
        seo: {
          ...seo,
          ogImageUrl: seo.ogImageUrl || ogImageUrl || thumbnailUrl,
        },
        mediaVariants: thumbnailUrl
          ? {
              original: thumbnailUrl,
              thumbnail: thumbnailUrl,
              medium: thumbnailUrl,
              large: thumbnailUrl,
              webp: thumbnailUrl,
            }
          : undefined,
      },
    };
  }, [
    title,
    code,
    shortDescription,
    fullDescription,
    categoryId,
    difficulty,
    language,
    thumbnailUrl,
    instructorId,
    durationMinutes,
    priceMajor,
    currency,
    enrollmentMode,
    deliveryType,
    enrollmentOpen,
    hidden,
    status,
    scheduledPublishAt,
    slug,
    seo,
    ogImageUrl,
  ]);

  const persist = useCallback(
    async (manual = false) => {
      const body = payload();
      if (!body.title || !body.code) {
        if (manual) toast.error("Title and course code are required.");
        return;
      }
      if (body.status === "scheduled" && !body.scheduledPublishAt) {
        if (manual) toast.error("Scheduled courses need a future publish date.");
        return;
      }
      setSaveState("saving");
      try {
        if (savedId) {
          const result = await courseFetch(`/api/courses/${savedId}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
          if (!result.success) throw new Error(result.error ?? "Could not save course.");
        } else {
          const result = await courseFetch<CourseDetail>("/api/courses", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!result.success || !result.data)
            throw new Error(result.error ?? "Could not save course.");
          setSavedId(result.data.id);
          router.replace(`${basePath}/${result.data.id}/edit`);
        }
        lastSaved.current = JSON.stringify(body);
        setSaveState("saved");
        if (manual) toast.success("Course saved");
      } catch (error) {
        setSaveState("unsaved");
        if (manual) {
          toast.error(error instanceof Error ? error.message : "Could not save course.");
        }
      }
    },
    [payload, savedId, router, basePath],
  );

  useEffect(() => {
    const snapshot = JSON.stringify(payload());
    if (skipAutosave.current) {
      skipAutosave.current = false;
      lastSaved.current = snapshot;
      return;
    }
    if (snapshot === lastSaved.current) {
      setSaveState("saved");
      return;
    }
    setSaveState("unsaved");
    const timer = window.setTimeout(() => {
      void persist(false);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [payload, persist]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void persist(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key >= "1" && event.key <= "7") {
        event.preventDefault();
        const next = COURSE_FORM_TABS[Number(event.key) - 1];
        if (next) setTab(next.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [persist]);

  const filteredInstructors = useMemo(() => {
    const q = instructorQuery.trim().toLowerCase();
    return instructors.filter(
      (item) =>
        !q ||
        (item.fullName ?? "").toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q),
    );
  }, [instructors, instructorQuery]);

  const filteredCategories = useMemo(() => {
    const q = categoryQuery.trim().toLowerCase();
    return categories.filter((item) => !q || item.name.toLowerCase().includes(q));
  }, [categories, categoryQuery]);

  async function copyUrl() {
    await navigator.clipboard.writeText(liveUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-10 w-64 animate-pulse rounded-xl bg-muted" />
        <div className="h-[480px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="course-studio space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href={basePath}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Courses
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">
            {isEdit ? "Edit Course" : "Create New Course"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build a complete course with media, pricing, SEO, and a live learner preview.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              saveState === "saved" &&
                "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
              saveState === "saving" &&
                "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
              saveState === "unsaved" &&
                "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
            )}
            aria-live="polite"
          >
            {saveState === "saved"
              ? "Saved"
              : saveState === "saving"
                ? "Saving…"
                : "Unsaved Changes"}
          </span>
          <Button variant="outline" asChild>
            <Link href={previewPath} target="_blank">
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Link>
          </Button>
          <Button onClick={() => void persist(true)} disabled={saveState === "saving"}>
            {saveState === "saving" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Course
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-soft md:p-6">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as typeof tab)}
            className="course-studio-tabs"
          >
            <TabsList className="mb-6 flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
              {COURSE_FORM_TABS.map((item) => (
                <TabsTrigger
                  key={item.id}
                  value={item.id}
                  className="rounded-xl px-3 py-2 data-[state=active]:shadow-sm"
                >
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cs-title">Title *</Label>
                  <Input
                    id="cs-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="PPL Ground School Essentials"
                    maxLength={160}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cs-code">Course Code *</Label>
                  <Input
                    id="cs-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="PPL-GS-01"
                    maxLength={32}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cs-category-search">Category</Label>
                  <Input
                    id="cs-category-search"
                    placeholder="Search categories…"
                    value={categoryQuery}
                    onChange={(e) => setCategoryQuery(e.target.value)}
                  />
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger aria-label="Category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Uncategorized</SelectItem>
                      {filteredCategories.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.parentId ? `↳ ${item.name}` : item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Difficulty Level</Label>
                  <Select
                    value={difficulty}
                    onValueChange={(value) => setDifficulty(value as DifficultyLevel)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTY_LEVELS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {DIFFICULTY_LABELS[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cs-short">Short Description</Label>
                  <Textarea
                    id="cs-short"
                    rows={3}
                    maxLength={200}
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{shortDescription.length}/200</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cs-full">Full Description</Label>
                  <Textarea
                    id="cs-full"
                    rows={8}
                    maxLength={5000}
                    value={fullDescription}
                    onChange={(e) => setFullDescription(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{fullDescription.length}/5000</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cs-instructor-search">Primary Instructor</Label>
                  <Input
                    id="cs-instructor-search"
                    placeholder="Search instructors…"
                    value={instructorQuery}
                    onChange={(e) => setInstructorQuery(e.target.value)}
                  />
                  <Select value={instructorId} onValueChange={setInstructorId}>
                    <SelectTrigger aria-label="Primary instructor">
                      <SelectValue placeholder="Select instructor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {filteredInstructors.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.fullName || item.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Enrolment Mode</Label>
                  <Select
                    value={enrollmentMode}
                    onValueChange={(value) => setEnrollmentMode(value as EnrollmentMode)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENROLLMENT_MODES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {ENROLLMENT_MODE_LABELS[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="content" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cs-duration">Estimated Duration (minutes)</Label>
                  <Input
                    id="cs-duration"
                    type="number"
                    min={0}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value) || 0)}
                  />
                  <p className="text-sm text-muted-foreground">
                    {formatDurationHours(durationMinutes).label}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cs-language">Language</Label>
                  <Input
                    id="cs-language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Delivery type</Label>
                  <Select
                    value={deliveryType}
                    onValueChange={(value) => setDeliveryType(value as CourseDeliveryType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COURSE_DELIVERY_TYPES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {COURSE_DELIVERY_LABELS[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                Lessons and curriculum modules are managed from the course workspace
                {savedId ? (
                  <>
                    .{" "}
                    <Link
                      href={`${basePath}/${savedId}`}
                      className="font-medium text-primary underline"
                    >
                      Open curriculum
                    </Link>
                  </>
                ) : (
                  " after the draft is created."
                )}
              </p>
            </TabsContent>

            <TabsContent value="pricing" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cs-price">Price</Label>
                  <Input
                    id="cs-price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={priceMajor}
                    onChange={(e) => setPriceMajor(e.target.value)}
                    placeholder="7200"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COURSE_CURRENCIES.map((item) => (
                        <SelectItem key={item.code} value={item.code}>
                          {item.flag} {item.code} ({item.label})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="media" className="space-y-4">
              <CourseMediaUploader
                value={thumbnailUrl}
                onChange={setThumbnailUrl}
                context="course"
                courseId={savedId}
                label="Course image"
              />
            </TabsContent>

            <TabsContent value="seo" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cs-meta-title">Meta Title</Label>
                  <Input
                    id="cs-meta-title"
                    value={seo.metaTitle}
                    onChange={(e) =>
                      setSeo((current) => ({ ...current, metaTitle: e.target.value }))
                    }
                    placeholder={title}
                    maxLength={70}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cs-meta-desc">Meta Description</Label>
                  <Textarea
                    id="cs-meta-desc"
                    rows={3}
                    maxLength={160}
                    value={seo.metaDescription}
                    onChange={(e) =>
                      setSeo((current) => ({ ...current, metaDescription: e.target.value }))
                    }
                    placeholder={shortDescription}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cs-keyword">Focus Keyword</Label>
                  <Input
                    id="cs-keyword"
                    value={seo.focusKeyword}
                    onChange={(e) =>
                      setSeo((current) => ({ ...current, focusKeyword: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>SEO Score</Label>
                  <div className="flex h-10 items-center rounded-xl bg-muted px-3 text-sm font-semibold">
                    {scored.score}/100
                  </div>
                </div>
              </div>
              <CourseMediaUploader
                value={ogImageUrl}
                onChange={(url) => {
                  setOgImageUrl(url);
                  setSeo((current) => ({ ...current, ogImageUrl: url }));
                }}
                context="course"
                courseId={savedId}
                label="Open Graph image"
              />
              <div className="rounded-2xl border border-border p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Google preview
                </p>
                <p className="text-lg text-[#1a0dab] dark:text-sky-300">
                  {seo.metaTitle || title || "Course title"}
                </p>
                <p className="text-sm text-[#006621] dark:text-emerald-400">{liveUrl}</p>
                <p className="text-sm text-muted-foreground">
                  {seo.metaDescription || shortDescription || "Meta description will appear here."}
                </p>
                {scored.notes.length ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                    {scored.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="publishing" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={status}
                    onValueChange={(value) => setStatus(value as CourseStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COURSE_STATUSES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {COURSE_STATUS_LABELS[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                      `course-studio-status-${status}`,
                    )}
                  >
                    {COURSE_STATUS_LABELS[status]}
                  </span>
                </div>
                <div className="space-y-2">
                  <Label>Catalogue visibility</Label>
                  <Select
                    value={hidden ? "hidden" : "visible"}
                    onValueChange={(value) => setHidden(value === "hidden")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visible">Listed</SelectItem>
                      <SelectItem value="hidden">Hidden</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cs-pub">Scheduled publish at</Label>
                  <Input
                    id="cs-pub"
                    type="datetime-local"
                    value={scheduledPublishAt}
                    onChange={(e) => setScheduledPublishAt(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Enrolment open</Label>
                  <Select
                    value={enrollmentOpen ? "open" : "closed"}
                    onValueChange={(value) => setEnrollmentOpen(value === "open")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cs-slug">Course URL slug</Label>
                <Input
                  id="cs-slug"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(slugifyCourse(e.target.value));
                  }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">
                <p className="min-w-0 break-all">{liveUrl}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => void copyUrl()}>
                  {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                  Copy Link
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <CoursePreviewPanel
          title={title}
          description={shortDescription || fullDescription}
          thumbnailUrl={thumbnailUrl}
          category={categoryName}
          instructorName={instructorName}
          priceAmount={priceMajor.trim() ? majorToMinor(Number(priceMajor) || 0, currency) : 0}
          currency={currency}
          durationMinutes={durationMinutes}
          status={status}
          mode={previewMode}
          onModeChange={setPreviewMode}
        />
      </div>
    </div>
  );
}
