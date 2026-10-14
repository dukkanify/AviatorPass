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
import { Switch } from "@/components/ui/switch";
import {
  MEETING_TYPE_LABELS,
  MEETING_TYPES,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_LABELS,
} from "@/constants/classes";
import { classFetch } from "@/features/classes/lib/api";
import type { UserProfile } from "@/types";
import type { CourseListItem } from "@/types/courses";

interface ClassFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructors: UserProfile[];
  courses: CourseListItem[];
  defaultInstructorId?: string | null;
  lockInstructor?: boolean;
  onSaved: () => void;
}

function ClassFormDialog({
  open,
  onOpenChange,
  instructors,
  courses,
  defaultInstructorId,
  lockInstructor,
  onSaved,
}: ClassFormDialogProps) {
  const [saving, setSaving] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [courseId, setCourseId] = React.useState("none");
  const [instructorId, setInstructorId] = React.useState("none");
  const [assistantId, setAssistantId] = React.useState("none");
  const [startsAt, setStartsAt] = React.useState("");
  const [durationMinutes, setDurationMinutes] = React.useState("60");
  const [maxStudents, setMaxStudents] = React.useState("30");
  const [meetingType, setMeetingType] = React.useState("meeting");
  const [timezone, setTimezone] = React.useState("Asia/Kuwait");
  const [waitingRoom, setWaitingRoom] = React.useState(false);
  const [frequency, setFrequency] = React.useState("once");
  const [zoomReady, setZoomReady] = React.useState<boolean | null>(null);
  const [zoomHint, setZoomHint] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setCourseId("none");
    setInstructorId(defaultInstructorId ?? "none");
    setAssistantId("none");
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 2);
    setStartsAt(d.toISOString().slice(0, 16));
    setDurationMinutes("60");
    setMaxStudents("30");
    setMeetingType("meeting");
    setTimezone("Asia/Kuwait");
    setWaitingRoom(false);
    setFrequency("once");
    setZoomReady(null);
    setZoomHint(null);
  }, [open, defaultInstructorId]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function checkZoom() {
      if (lockInstructor) {
        const res = await fetch("/api/integrations/zoom/status", { cache: "no-store" });
        const json = (await res.json()) as {
          success?: boolean;
          data?: { connected?: boolean; needsReconnect?: boolean };
        };
        if (cancelled) return;
        const connected = Boolean(json.data?.connected);
        setZoomReady(connected);
        setZoomHint(
          connected ? null : "Please connect your Zoom account before creating a live class.",
        );
        return;
      }
      if (instructorId === "none") {
        setZoomReady(null);
        setZoomHint(null);
        return;
      }
      const res = await fetch("/api/admin/instructors/zoom", { cache: "no-store" });
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          instructors?: Array<{ userId: string; connected: boolean }>;
        };
      };
      if (cancelled) return;
      if (!res.ok || !json.success) {
        setZoomReady(null);
        setZoomHint(null);
        return;
      }
      const row = json.data?.instructors?.find((item) => item.userId === instructorId);
      const connected = Boolean(row?.connected);
      setZoomReady(connected);
      setZoomHint(
        connected ? null : "Please connect your Zoom account before creating a live class.",
      );
    }
    void checkZoom();
    return () => {
      cancelled = true;
    };
  }, [open, instructorId, lockInstructor]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (instructorId === "none") {
      toast.error("Select an instructor");
      return;
    }
    if (zoomReady === false) {
      toast.error(zoomHint ?? "Please connect your Zoom account before creating a live class.");
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      title,
      description,
      courseId: courseId === "none" ? null : courseId,
      instructorId: instructorId === "none" ? null : instructorId,
      assistantInstructorId: assistantId === "none" ? null : assistantId,
      startsAt: new Date(startsAt).toISOString(),
      durationMinutes: Number(durationMinutes) || 60,
      maxStudents: Number(maxStudents) || 30,
      meetingType,
      timezone,
      waitingRoom,
      status: "scheduled",
    };
    if (frequency !== "once") {
      payload.recurrence = { frequency, interval: 1, count: frequency === "weekly" ? 8 : 5 };
    }

    const result = await classFetch("/api/classes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error ?? "Failed to create class");
      return;
    }
    const zoomError =
      result.data && typeof result.data === "object" && "zoomError" in result.data
        ? (result.data as { zoomError?: string | null }).zoomError
        : null;
    if (zoomError) {
      toast.error(
        zoomError.includes("connect")
          ? zoomError
          : "Please connect your Zoom account before creating a live class.",
      );
    } else {
      toast.success("Live class scheduled");
    }
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Schedule live class</DialogTitle>
          <DialogDescription>
            Live meetings are created on the assigned instructor&apos;s connected Zoom account.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          {zoomHint ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
              {zoomHint}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="class-title">Title</Label>
            <Input
              id="class-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="class-desc">Description</Label>
            <Textarea
              id="class-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Course</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional course" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No course link</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Meeting type</Label>
              <Select value={meetingType} onValueChange={setMeetingType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEETING_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {MEETING_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Instructor</Label>
              <Select
                value={instructorId}
                onValueChange={setInstructorId}
                disabled={lockInstructor}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select instructor" />
                </SelectTrigger>
                <SelectContent>
                  {instructors.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.fullName || i.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Required. Zoom is created for this instructor.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Assistant</Label>
              <Select value={assistantId} onValueChange={setAssistantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {instructors.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.fullName || i.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="starts">Start</Label>
              <Input
                id="starts"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min={15}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tz">Timezone</Label>
              <Input id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max">Max students</Label>
              <Input
                id="max"
                type="number"
                min={1}
                value={maxStudents}
                onChange={(e) => setMaxStudents(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Recurrence</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {RECURRENCE_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <Label htmlFor="wr">Waiting room</Label>
                <p className="text-xs text-muted-foreground">
                  Allowed accounts enter the classroom directly.
                </p>
              </div>
              <Switch id="wr" checked={waitingRoom} disabled />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={zoomReady === false}>
              Create session
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { ClassFormDialog };
