"use client";

import * as React from "react";
import { BookOpen, ImagePlus, Save } from "lucide-react";

import { SafeImage } from "@/components/media/safe-image";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BLOG_STATUS_LABELS } from "@/constants/communication";
import { commFetch, commJson } from "@/features/communication/lib/api";
import type { BlogCategory, BlogPost, BlogPostStatus } from "@/types/communication";

function emptyDraft() {
  return {
    id: "",
    title: "",
    excerpt: "",
    bodyHtml: "",
    tags: "atpl",
    status: "draft" as BlogPostStatus,
    seoTitle: "",
    seoDescription: "",
    featuredImageUrl: "",
  };
}

function BlogManagerView({ manage = false }: { manage?: boolean }) {
  const [posts, setPosts] = React.useState<BlogPost[]>([]);
  const [categories, setCategories] = React.useState<BlogCategory[]>([]);
  const [draft, setDraft] = React.useState(emptyDraft());
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);

  const load = React.useCallback(async () => {
    const url = manage ? "/api/communication/blog" : "/api/communication/blog?public=1";
    const result = await commFetch<{ posts: BlogPost[]; categories: BlogCategory[] }>(url);
    setPosts(result.data?.posts ?? []);
    setCategories(result.data?.categories ?? []);
  }, [manage]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function edit(post: BlogPost) {
    setDraft({
      id: post.id,
      title: post.title,
      excerpt: post.excerpt,
      bodyHtml: post.bodyHtml,
      tags: post.tags.join(", "),
      status: post.status,
      seoTitle: post.seoTitle ?? "",
      seoDescription: post.seoDescription ?? "",
      featuredImageUrl: post.featuredImageUrl ?? "",
    });
  }

  async function uploadImage(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/communication/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { url?: string };
        error?: string;
      };
      if (!json.success || !json.data?.url) {
        setError(json.error ?? "Image upload failed");
        return;
      }
      setDraft((prev) => ({ ...prev, featuredImageUrl: json.data!.url! }));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const result = await commJson<BlogPost>("/api/communication/blog", "POST", {
      id: draft.id || undefined,
      title: draft.title,
      excerpt: draft.excerpt,
      bodyHtml: draft.bodyHtml.includes("<") ? draft.bodyHtml : `<p>${draft.bodyHtml}</p>`,
      tags: draft.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      status: draft.status,
      seoTitle: draft.seoTitle || null,
      seoDescription: draft.seoDescription || null,
      featuredImageUrl: draft.featuredImageUrl || null,
      categoryId: categories[0]?.id ?? null,
    });
    if (!result.success) {
      setError(result.error);
      return;
    }
    setDraft(emptyDraft());
    void load();
  }

  async function setStatus(post: BlogPost, status: BlogPostStatus) {
    await commJson("/api/communication/blog", "POST", {
      id: post.id,
      title: post.title,
      excerpt: post.excerpt,
      bodyHtml: post.bodyHtml,
      tags: post.tags,
      status,
      featuredImageUrl: post.featuredImageUrl,
      categoryId: post.categoryId,
    });
    void load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={manage ? "Blog studio" : "AviatorPass Blog"}
        description={
          manage
            ? "Draft, publish, and attach featured images. Links and article copy stay editable."
            : "Aviation insights, study tips, and platform updates."
        }
        breadcrumbs={[{ label: "Communication" }, { label: "Blog" }]}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {manage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {draft.id ? "Edit article" : "Compose article"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Input
              placeholder="Title"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
            <Input
              placeholder="Excerpt"
              value={draft.excerpt}
              onChange={(e) => setDraft((d) => ({ ...d, excerpt: e.target.value }))}
            />
            <Textarea
              placeholder="Rich text / HTML body. Use <a href='/courses'>links</a> for internal pages."
              className="min-h-[140px]"
              value={draft.bodyHtml}
              onChange={(e) => setDraft((d) => ({ ...d, bodyHtml: e.target.value }))}
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <ImagePlus className="size-4" />
                Featured image
                <input
                  type="file"
                  accept="image/*"
                  className="text-xs"
                  onChange={(e) => void uploadImage(e.target.files?.[0] ?? null)}
                />
              </label>
              {uploading ? <span className="text-xs text-muted-foreground">Uploading…</span> : null}
            </div>
            {draft.featuredImageUrl ? (
              <SafeImage
                src={draft.featuredImageUrl}
                alt="Featured"
                className="h-40 w-full rounded-lg object-cover"
              />
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Tags (comma separated)"
                value={draft.tags}
                onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
              />
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={draft.status}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, status: e.target.value as BlogPostStatus }))
                }
              >
                {Object.entries(BLOG_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <Input
                placeholder="SEO title"
                value={draft.seoTitle}
                onChange={(e) => setDraft((d) => ({ ...d, seoTitle: e.target.value }))}
              />
              <Input
                placeholder="SEO description"
                value={draft.seoDescription}
                onChange={(e) => setDraft((d) => ({ ...d, seoDescription: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void save()}>
                <Save className="size-4" />
                {draft.id ? "Update article" : "Save article"}
              </Button>
              {draft.id ? (
                <Button variant="outline" onClick={() => setDraft(emptyDraft())}>
                  New article
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {posts.map((p) => (
          <Card key={p.id}>
            {p.featuredImageUrl ? (
              <SafeImage
                src={p.featuredImageUrl}
                alt={p.title}
                className="h-40 w-full rounded-t-xl"
              />
            ) : null}
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="font-display text-xl">{p.title}</CardTitle>
                <Badge variant="secondary">{BLOG_STATUS_LABELS[p.status]}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {p.authorName} · {p.tags.join(", ")}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{p.excerpt}</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={`/blog/${p.slug}`}>
                    <BookOpen className="size-4" />
                    Open
                  </a>
                </Button>
                {manage ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => edit(p)}>
                      Edit
                    </Button>
                    {p.status === "published" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void setStatus(p, "draft")}
                      >
                        Unpublish
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => void setStatus(p, "published")}>
                        Publish
                      </Button>
                    )}
                  </>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export { BlogManagerView };
