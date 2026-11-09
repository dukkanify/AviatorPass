"use client";

import * as React from "react";
import Link from "@/components/ui/app-link";
import { ExternalLink, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { authFetch } from "@/features/auth/services/auth-api";
import type { SiteCopyPageId, SiteCopyPageSnapshot } from "@/types/site-copy";

type ListResponse = { pages: SiteCopyPageSnapshot[] };

function SiteCopyManager() {
  const [pages, setPages] = React.useState<SiteCopyPageSnapshot[]>([]);
  const [activeId, setActiveId] = React.useState<SiteCopyPageId | null>(null);
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const active = pages.find((p) => p.id === activeId) ?? null;

  const load = React.useCallback(async () => {
    setLoading(true);
    const result = await authFetch<ListResponse>("/api/admin/site-copy");
    if (result.data?.pages?.length) {
      setPages(result.data.pages);
      setActiveId((prev) => prev ?? result.data!.pages[0]!.id);
    } else if (result.error) {
      toast.error(result.error);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!active) {
      setDraft({});
      return;
    }
    const next: Record<string, string> = {};
    for (const field of active.fields) {
      next[field.key] = field.value;
    }
    setDraft(next);
  }, [active]);

  async function save() {
    if (!activeId) return;
    setSaving(true);
    const result = await authFetch<SiteCopyPageSnapshot>("/api/admin/site-copy", {
      method: "PUT",
      body: JSON.stringify({ pageId: activeId, fields: draft }),
    });
    setSaving(false);
    if (!result.data) {
      toast.error(result.error || "Could not save site copy");
      return;
    }
    setPages((prev) => prev.map((p) => (p.id === result.data!.id ? result.data! : p)));
    toast.success("Site copy saved — live on the website");
  }

  async function resetPage() {
    if (!activeId) return;
    setSaving(true);
    const result = await authFetch<SiteCopyPageSnapshot>("/api/admin/site-copy", {
      method: "PUT",
      body: JSON.stringify({ pageId: activeId, resetPage: true }),
    });
    setSaving(false);
    if (!result.data) {
      toast.error(result.error || "Could not reset page");
      return;
    }
    setPages((prev) => prev.map((p) => (p.id === result.data!.id ? result.data! : p)));
    toast.success("Page reset to defaults");
  }

  async function resetField(fieldKey: string) {
    if (!activeId) return;
    setSaving(true);
    const result = await authFetch<SiteCopyPageSnapshot>("/api/admin/site-copy", {
      method: "PUT",
      body: JSON.stringify({ pageId: activeId, resetField: fieldKey }),
    });
    setSaving(false);
    if (!result.data) {
      toast.error(result.error || "Could not reset field");
      return;
    }
    setPages((prev) => prev.map((p) => (p.id === result.data!.id ? result.data! : p)));
    toast.success("Field reset to default");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Site copy"
        description="Edit the main marketing text on each public page. Empty or reset fields fall back to the built-in defaults."
        breadcrumbs={[
          { label: "Super Admin", href: "/super-admin/dashboard" },
          { label: "Site copy" },
        ]}
      />

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Pages</CardTitle>
              <CardDescription>Public marketing pages</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {pages.map((page) => {
                const overridden = page.fields.some((f) => f.overridden);
                return (
                  <Button
                    key={page.id}
                    variant={page.id === activeId ? "secondary" : "ghost"}
                    className="h-auto justify-start px-3 py-2 text-left"
                    onClick={() => setActiveId(page.id)}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span>{page.label}</span>
                      {overridden ? (
                        <Badge variant="warning" className="shrink-0 text-[10px]">
                          Edited
                        </Badge>
                      ) : null}
                    </span>
                  </Button>
                );
              })}
            </CardContent>
          </Card>

          {active ? (
            <Card>
              <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>{active.label}</CardTitle>
                  <CardDescription>
                    Primary headlines, intros, and CTAs for {active.path}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={active.path} target="_blank" rel="noopener noreferrer">
                      Preview
                      <ExternalLink className="ms-2 size-3.5" />
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => void resetPage()}
                  >
                    <RotateCcw className="me-2 size-3.5" />
                    Reset page
                  </Button>
                  <Button size="sm" disabled={saving} onClick={() => void save()}>
                    <Save className="me-2 size-3.5" />
                    Save
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {active.fields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label htmlFor={`site-copy-${field.key}`}>{field.label}</Label>
                      <div className="flex items-center gap-2">
                        {field.overridden ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Custom
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            Default
                          </Badge>
                        )}
                        {field.overridden ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={saving}
                            onClick={() => void resetField(field.key)}
                          >
                            Reset
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {field.multiline ? (
                      <Textarea
                        id={`site-copy-${field.key}`}
                        rows={4}
                        value={draft[field.key] ?? ""}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                      />
                    ) : (
                      <Input
                        id={`site-copy-${field.key}`}
                        value={draft[field.key] ?? ""}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                      />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}

export { SiteCopyManager };
