"use client";

import * as React from "react";
import Link from "@/components/ui/app-link";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseMediaUploader } from "@/features/courses/components/course-studio/course-media-uploader";
import { courseFetch } from "@/features/courses/lib/api";
import { routes } from "@/constants/routes";
import type { AtplLandingSubject } from "@/types/atpl-subjects";

const DEFAULT_ATPL_SUBJECT_BADGE = "Included";

interface AtplSubjectManagerProps {
  basePath: string;
  roleLabel: string;
}

type Draft = {
  id?: string;
  code: string;
  title: string;
  shortDescription: string;
  badgeLabel: string;
  imageUrl: string;
  visible: boolean;
};

const emptyDraft = (): Draft => ({
  code: "",
  title: "",
  shortDescription: "",
  badgeLabel: DEFAULT_ATPL_SUBJECT_BADGE,
  imageUrl: "",
  visible: true,
});

function AtplSubjectManager({ basePath, roleLabel }: AtplSubjectManagerProps) {
  const [subjects, setSubjects] = React.useState<AtplLandingSubject[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [saving, setSaving] = React.useState(false);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const result = await courseFetch<AtplLandingSubject[]>(
      "/api/marketing/atpl-subjects?includeHidden=1",
    );
    setSubjects(result.data ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setDraft(emptyDraft());
    setOpen(true);
  }

  function openEdit(row: AtplLandingSubject) {
    setDraft({
      id: row.id,
      code: row.code,
      title: row.title,
      shortDescription: row.shortDescription,
      badgeLabel: row.badgeLabel,
      imageUrl: row.imageUrl ?? "",
      visible: row.visible,
    });
    setOpen(true);
  }

  async function save() {
    if (!draft.title.trim()) {
      toast.error("Course name is required");
      return;
    }
    setSaving(true);
    const payload = {
      code: draft.code,
      title: draft.title,
      shortDescription: draft.shortDescription,
      badgeLabel: draft.badgeLabel,
      imageUrl: draft.imageUrl || null,
      visible: draft.visible,
    };
    const result = draft.id
      ? await courseFetch<AtplLandingSubject>(`/api/marketing/atpl-subjects/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
      : await courseFetch<AtplLandingSubject>("/api/marketing/atpl-subjects", {
          method: "POST",
          body: JSON.stringify(payload),
        });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error ?? "Unable to save subject");
      return;
    }
    toast.success(draft.id ? "Subject updated" : "Subject created");
    setOpen(false);
    void load();
  }

  async function toggleVisible(row: AtplLandingSubject) {
    const result = await courseFetch(`/api/marketing/atpl-subjects/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ visible: !row.visible }),
    });
    if (!result.success) {
      toast.error(result.error ?? "Update failed");
      return;
    }
    void load();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this ATPL subject? It will disappear from the public page.")) {
      return;
    }
    const result = await courseFetch(`/api/marketing/atpl-subjects/${id}`, { method: "DELETE" });
    if (!result.success) {
      toast.error(result.error ?? "Delete failed");
      return;
    }
    toast.success("Subject deleted");
    void load();
  }

  async function persistOrder(next: AtplLandingSubject[]) {
    const result = await courseFetch("/api/marketing/atpl-subjects/reorder", {
      method: "POST",
      body: JSON.stringify({ ids: next.map((row) => row.id) }),
    });
    if (!result.success) {
      toast.error(result.error ?? "Reorder failed");
      return;
    }
    void load();
  }

  async function move(index: number, delta: number) {
    const next = [...subjects];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [row] = next.splice(index, 1);
    if (!row) return;
    next.splice(target, 0, row);
    await persistOrder(next);
  }

  function onDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    const from = subjects.findIndex((row) => row.id === draggingId);
    const to = subjects.findIndex((row) => row.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...subjects];
    const [row] = next.splice(from, 1);
    if (!row) return;
    next.splice(to, 0, row);
    setDraggingId(null);
    void persistOrder(next);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="ATPL course subjects"
        description="Manage the official ATPL syllabus cards shown on the public ATPL page. Hidden subjects stay off the website."
        breadcrumbs={[
          { label: roleLabel },
          { label: "Courses", href: basePath },
          { label: "ATPL subjects" },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={basePath}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to courses
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={routes.atpl} target="_blank" rel="noopener noreferrer">
                View ATPL page
              </Link>
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Add course
            </Button>
          </div>
        }
      />

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-3">
          {subjects.map((row, index) => (
            <Card
              key={row.id}
              draggable
              onDragStart={() => setDraggingId(row.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDrop(row.id)}
              className={draggingId === row.id ? "opacity-60" : undefined}
            >
              <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <GripVertical className="mt-1 h-4 w-4 cursor-grab text-muted-foreground" />
                  {row.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.imageUrl}
                      alt=""
                      className="mt-0.5 h-10 w-10 rounded-md object-cover"
                    />
                  ) : null}
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Order {index + 1}
                    </p>
                    <CardTitle className="text-base">
                      {row.code ? <span className="mr-2 text-accent">{row.code}</span> : null}
                      {row.title}
                    </CardTitle>
                    <CardDescription>{row.shortDescription || "No description"}</CardDescription>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Move up"
                    onClick={() => void move(index, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Move down"
                    onClick={() => void move(index, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Switch
                    checked={row.visible}
                    onCheckedChange={() => void toggleVisible(row)}
                    aria-label="Show subject on website"
                  />
                  <Badge variant={row.visible ? "success" : "secondary"}>
                    {row.visible ? "Visible" : "Hidden"}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                    <Pencil className="mr-1 h-4 w-4" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete subject"
                    onClick={() => void remove(row.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
          {!subjects.length ? (
            <p className="text-sm text-muted-foreground">
              No ATPL subjects yet. Add the first one.
            </p>
          ) : null}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit course" : "Add course"}</DialogTitle>
            <DialogDescription>
              Changes appear on /atpl as soon as the subject is visible.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="atpl-code">Course code</Label>
              <Input
                id="atpl-code"
                value={draft.code}
                onChange={(e) => setDraft((current) => ({ ...current, code: e.target.value }))}
                placeholder="010"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="atpl-badge">Included badge</Label>
              <Input
                id="atpl-badge"
                value={draft.badgeLabel}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, badgeLabel: e.target.value }))
                }
                placeholder={DEFAULT_ATPL_SUBJECT_BADGE}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="atpl-title">Course name</Label>
              <Input
                id="atpl-title"
                value={draft.title}
                onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))}
                placeholder="Air Law"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="atpl-desc">Short description</Label>
              <Textarea
                id="atpl-desc"
                rows={3}
                value={draft.shortDescription}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, shortDescription: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch
                checked={draft.visible}
                onCheckedChange={(visible) => setDraft((current) => ({ ...current, visible }))}
              />
              <Label>Show on ATPL page</Label>
            </div>
            <div className="sm:col-span-2">
              <CourseMediaUploader
                value={draft.imageUrl}
                context="atpl-subject"
                label="Course icon or image (optional)"
                onChange={(url) => setDraft((current) => ({ ...current, imageUrl: url }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save course"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { AtplSubjectManager };
