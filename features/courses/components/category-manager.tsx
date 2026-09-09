"use client";

import * as React from "react";
import Link from "@/components/ui/app-link";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseMediaUploader } from "@/features/courses/components/course-studio/course-media-uploader";
import { courseFetch } from "@/features/courses/lib/api";
import type { CourseCategory } from "@/types/courses";

interface CategoryManagerProps {
  basePath: string;
  roleLabel: string;
}

type Draft = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  parentId: string;
  icon: string;
  imageUrl: string;
  visible: boolean;
  seoTitle: string;
  metaDescription: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  slug: "",
  description: "",
  parentId: "none",
  icon: "Folder",
  imageUrl: "",
  visible: true,
  seoTitle: "",
  metaDescription: "",
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function CategoryManager({ basePath, roleLabel }: CategoryManagerProps) {
  const [categories, setCategories] = React.useState<CourseCategory[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const result = await courseFetch<CourseCategory[]>("/api/courses/categories?includeHidden=1");
    setCategories(result.data ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const roots = React.useMemo(
    () => [...categories.filter((c) => !c.parentId)].sort((a, b) => a.order - b.order),
    [categories],
  );

  function openCreate() {
    setDraft(emptyDraft());
    setSlugTouched(false);
    setOpen(true);
  }

  function openEdit(cat: CourseCategory) {
    setDraft({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      parentId: cat.parentId ?? "none",
      icon: cat.icon,
      imageUrl: cat.imageUrl ?? "",
      visible: cat.visible,
      seoTitle: cat.seoTitle ?? "",
      metaDescription: cat.metaDescription ?? "",
    });
    setSlugTouched(true);
    setOpen(true);
  }

  async function save() {
    if (!draft.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const payload = {
      name: draft.name,
      slug: draft.slug || slugify(draft.name),
      description: draft.description,
      parentId: draft.parentId === "none" ? null : draft.parentId,
      icon: draft.icon,
      imageUrl: draft.imageUrl || null,
      visible: draft.visible,
      seoTitle: draft.seoTitle,
      metaDescription: draft.metaDescription,
    };
    const result = draft.id
      ? await courseFetch<CourseCategory>(`/api/courses/categories/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
      : await courseFetch<CourseCategory>("/api/courses/categories", {
          method: "POST",
          body: JSON.stringify(payload),
        });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error ?? "Unable to save category");
      return;
    }
    toast.success(draft.id ? "Category updated" : "Category created");
    setOpen(false);
    void load();
  }

  async function toggleVisible(cat: CourseCategory) {
    const result = await courseFetch(`/api/courses/categories/${cat.id}`, {
      method: "PATCH",
      body: JSON.stringify({ visible: !cat.visible }),
    });
    if (!result.success) {
      toast.error(result.error ?? "Update failed");
      return;
    }
    void load();
  }

  async function remove(id: string) {
    const result = await courseFetch(`/api/courses/categories/${id}`, { method: "DELETE" });
    if (!result.success) {
      toast.error(result.error ?? "Delete failed");
      return;
    }
    toast.success("Category deleted");
    void load();
  }

  async function persistOrder(nextRoots: CourseCategory[]) {
    const remaining = categories.filter((c) => c.parentId).map((c) => c.id);
    const ids = [...nextRoots.map((c) => c.id), ...remaining];
    const result = await courseFetch("/api/courses/categories/reorder", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    if (!result.success) {
      toast.error(result.error ?? "Reorder failed");
      return;
    }
    void load();
  }

  async function move(index: number, delta: number) {
    const next = [...roots];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [row] = next.splice(index, 1);
    if (!row) return;
    next.splice(target, 0, row);
    await persistOrder(next);
  }

  function onDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    const from = roots.findIndex((c) => c.id === draggingId);
    const to = roots.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...roots];
    const [row] = next.splice(from, 1);
    if (!row) return;
    next.splice(to, 0, row);
    setDraggingId(null);
    void persistOrder(next);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Course categories"
        description="Create, edit, reorder, and publish categories used across the Aviator Pass website."
        breadcrumbs={[
          { label: roleLabel },
          { label: "Courses", href: basePath },
          { label: "Categories" },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={basePath}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to courses
              </Link>
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> Add category
            </Button>
          </div>
        }
      />

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-3">
          {roots.map((root, index) => {
            const children = categories
              .filter((c) => c.parentId === root.id)
              .sort((a, b) => a.order - b.order);
            return (
              <Card
                key={root.id}
                draggable
                onDragStart={() => setDraggingId(root.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => onDrop(root.id)}
                className={draggingId === root.id ? "opacity-60" : undefined}
              >
                <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <GripVertical className="mt-1 h-4 w-4 cursor-grab text-muted-foreground" />
                    <div>
                      <CardTitle className="text-base">
                        {root.name}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          /{root.slug} · {root.icon}
                        </span>
                      </CardTitle>
                      <CardDescription>{root.description || "No description"}</CardDescription>
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
                      checked={root.visible}
                      onCheckedChange={() => void toggleVisible(root)}
                      aria-label="Enable category"
                    />
                    <Badge variant={root.visible ? "success" : "secondary"}>
                      {root.visible ? "Enabled" : "Disabled"}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => openEdit(root)}>
                      <Pencil className="mr-1 h-4 w-4" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete category"
                      onClick={() => void remove(root.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                {children.length ? (
                  <CardContent className="space-y-2">
                    {children.map((child) => (
                      <div
                        key={child.id}
                        className="flex flex-col gap-2 rounded-xl border border-border/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-medium">↳ {child.name}</p>
                          <p className="text-xs text-muted-foreground">/{child.slug}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={child.visible}
                            onCheckedChange={() => void toggleVisible(child)}
                          />
                          <Button variant="outline" size="sm" onClick={() => openEdit(child)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete subcategory"
                            onClick={() => void remove(child.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                ) : null}
              </Card>
            );
          })}
          {!roots.length ? (
            <p className="text-sm text-muted-foreground">
              No categories yet. Create the first one.
            </p>
          ) : null}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit category" : "Add category"}</DialogTitle>
            <DialogDescription>
              Categories appear on the public catalog once enabled.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={draft.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setDraft((current) => ({
                    ...current,
                    name,
                    slug: slugTouched ? current.slug : slugify(name),
                  }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-slug">Slug</Label>
              <Input
                id="cat-slug"
                value={draft.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setDraft((current) => ({ ...current, slug: slugify(e.target.value) }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Parent</Label>
              <Select
                value={draft.parentId}
                onValueChange={(value) => setDraft((current) => ({ ...current, parentId: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Main category</SelectItem>
                  {roots
                    .filter((c) => c.id !== draft.id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-icon">Icon</Label>
              <Input
                id="cat-icon"
                value={draft.icon}
                onChange={(e) => setDraft((current) => ({ ...current, icon: e.target.value }))}
                placeholder="Plane"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cat-desc">Description</Label>
              <Textarea
                id="cat-desc"
                rows={3}
                value={draft.description}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, description: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-seo">SEO title</Label>
              <Input
                id="cat-seo"
                value={draft.seoTitle}
                onChange={(e) => setDraft((current) => ({ ...current, seoTitle: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={draft.visible}
                onCheckedChange={(visible) => setDraft((current) => ({ ...current, visible }))}
              />
              <Label>Enabled on website</Label>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cat-meta">Meta description</Label>
              <Textarea
                id="cat-meta"
                rows={3}
                value={draft.metaDescription}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, metaDescription: e.target.value }))
                }
              />
            </div>
            <div className="sm:col-span-2">
              <CourseMediaUploader
                value={draft.imageUrl}
                context="category"
                label="Category image (optional)"
                onChange={(url) => setDraft((current) => ({ ...current, imageUrl: url }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { CategoryManager };
