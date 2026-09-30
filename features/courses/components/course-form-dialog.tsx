"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { courseFetch } from "@/features/courses/lib/api";
import { CourseMediaUploader } from "@/features/courses/components/course-studio/course-media-uploader";
import { COURSE_CURRENCIES, suggestCourseCode } from "@/features/courses/lib/course-studio";
import { currencyExponent, majorToMinor } from "@/services/payments/money";
import type { CourseCategory, CourseListItem } from "@/types/courses";
import type { UserProfile } from "@/types";

interface CourseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course?: CourseListItem | null;
  categories: CourseCategory[];
  instructors: UserProfile[];
  onSaved: (course: CourseListItem) => void;
  lockedInstructorId?: string | null;
}

function CourseFormDialog({
  open,
  onOpenChange,
  course,
  categories,
  instructors,
  onSaved,
  lockedInstructorId = null,
}: CourseFormDialogProps) {
  const lockInstructor = Boolean(lockedInstructorId);
  const [saving, setSaving] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [code, setCode] = React.useState("");
  const [shortDescription, setShortDescription] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string>("none");
  const [primaryInstructorId, setPrimaryInstructorId] = React.useState<string>("none");
  const [priceMajor, setPriceMajor] = React.useState("");
  const [currency, setCurrency] = React.useState("AED");
  const [thumbnailUrl, setThumbnailUrl] = React.useState("");
  const [codeTouched, setCodeTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(course?.title ?? "");
    setCode(course?.code ?? "");
    setShortDescription(course?.shortDescription ?? "");
    setCategoryId(course?.categoryId ?? "none");
    setPrimaryInstructorId(lockedInstructorId ?? course?.primaryInstructorId ?? "none");
    const nextCurrency = course?.currency || "AED";
    setCurrency(nextCurrency);
    const existingMinor = course?.priceAmount;
    setPriceMajor(
      existingMinor != null && existingMinor > 0
        ? String(existingMinor / 10 ** currencyExponent(nextCurrency))
        : "",
    );
    setThumbnailUrl(course?.thumbnailUrl ?? "");
    setCodeTouched(Boolean(course?.code));
  }, [open, course, lockedInstructorId]);

  function changeTitle(value: string) {
    setTitle(value);
    if (!course && !codeTouched) setCode(suggestCourseCode(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title,
      code: code.trim() || suggestCourseCode(title),
      shortDescription,
      categoryId: categoryId === "none" ? null : categoryId,
      primaryInstructorId: lockInstructor
        ? lockedInstructorId
        : primaryInstructorId === "none"
          ? null
          : primaryInstructorId,
      language: "en",
      currency,
      priceAmount: priceMajor.trim() ? majorToMinor(Number(priceMajor), currency) : null,
      thumbnailUrl: thumbnailUrl.trim() || null,
    };

    const result = course
      ? await courseFetch<CourseListItem>(`/api/courses/${course.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
      : await courseFetch<CourseListItem>("/api/courses", {
          method: "POST",
          body: JSON.stringify(payload),
        });

    setSaving(false);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Unable to save course");
      return;
    }
    toast.success(course ? "Course updated" : "Course added as a draft");
    onSaved(result.data);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{course ? "Edit course" : "Add a course"}</DialogTitle>
          <DialogDescription>
            Name, photo, and price only. Publish later from the course menu if students should see
            it.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="course-title">Course name</Label>
            <Input
              id="course-title"
              value={title}
              onChange={(e) => changeTitle(e.target.value)}
              required
              maxLength={160}
              placeholder="Private Pilot License — Live Online"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="course-code">Code</Label>
            <Input
              id="course-code"
              value={code}
              onChange={(e) => {
                setCodeTouched(true);
                setCode(e.target.value.toUpperCase());
              }}
              maxLength={32}
              placeholder="Filled automatically from the name"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-2">
              <Label htmlFor="course-price">Price</Label>
              <Input
                id="course-price"
                type="number"
                min={0}
                step="0.001"
                value={priceMajor}
                onChange={(e) => setPriceMajor(e.target.value)}
                placeholder="480"
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
                      {item.flag} {item.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="course-short">Short description</Label>
            <Textarea
              id="course-short"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              rows={3}
              placeholder="What the student gets in one or two sentences."
            />
          </div>
          <CourseMediaUploader
            value={thumbnailUrl}
            onChange={setThumbnailUrl}
            courseId={course?.id}
            label="Course photo"
          />
          {categories.length ? (
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {!lockInstructor && instructors.length ? (
            <div className="space-y-2">
              <Label>Instructor</Label>
              <Select value={primaryInstructorId} onValueChange={setPrimaryInstructorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Assign later</SelectItem>
                  {instructors.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.fullName || i.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {course ? "Save course" : "Add course"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { CourseFormDialog };
