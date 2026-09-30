"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { courseFetch } from "@/features/courses/lib/api";
import { COURSE_CURRENCIES } from "@/features/courses/lib/course-studio";
import { formatMinor, majorToMinor, minorToMajor } from "@/services/payments/money";
import type { CourseListItem } from "@/types/courses";

function InlineCoursePrice({ course, onSaved }: { course: CourseListItem; onSaved: () => void }) {
  const currency = course.currency || "AED";
  const [editing, setEditing] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [code, setCode] = React.useState(currency);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setCode(course.currency || "AED");
    setAmount(
      course.priceAmount != null
        ? String(minorToMajor(course.priceAmount, course.currency || "AED"))
        : "",
    );
  }, [course.currency, course.priceAmount]);

  async function save() {
    setSaving(true);
    const result = await courseFetch(`/api/courses/${course.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        priceAmount: amount.trim() ? majorToMinor(Number(amount), code) : null,
        currency: code,
      }),
    });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error ?? "Could not save price");
      return;
    }
    toast.success(`${course.title} price updated`);
    setEditing(false);
    onSaved();
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
        onClick={() => setEditing(true)}
      >
        {course.priceAmount != null ? formatMinor(course.priceAmount, currency) : "Set price"}
        <Pencil className="size-3 opacity-60" />
      </button>
    );
  }

  return (
    <div className="flex min-w-56 flex-col gap-2">
      <div className="flex gap-2">
        <Input
          type="number"
          min={0}
          step="0.001"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="h-8"
          aria-label={`Price for ${course.title}`}
        />
        <Select value={code} onValueChange={setCode}>
          <SelectTrigger className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COURSE_CURRENCIES.map((item) => (
              <SelectItem key={item.code} value={item.code}>
                {item.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export { InlineCoursePrice };
