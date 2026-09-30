"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SafeImage } from "@/components/media/safe-image";
import { ATPL_COMPLETE_PACKAGE_SUBJECTS } from "@/constants/atpl-complete-package";
import { CourseMediaUploader } from "@/features/courses/components/course-studio/course-media-uploader";
import { courseFetch } from "@/features/courses/lib/api";
import { atplSubjectPublicHref } from "@/lib/marketing/atpl-subject-ref";
import type { AtplLandingSubject } from "@/types/atpl-subjects";

type CardDraft = {
  code: string;
  title: string;
  shortDescription: string;
  imageUrl: string;
};

function officialCards(cms: AtplLandingSubject[]): CardDraft[] {
  return ATPL_COMPLETE_PACKAGE_SUBJECTS.map((item) => {
    const row = cms.find((subject) => subject.code === item.code);
    return {
      code: item.code,
      title: item.title,
      shortDescription: row?.shortDescription?.trim() || item.shortDescription,
      imageUrl: row?.imageUrl ?? "",
    };
  });
}

function AtplSubjectsEasyPanel() {
  const [cards, setCards] = React.useState<CardDraft[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [draft, setDraft] = React.useState<CardDraft | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const result = await courseFetch<AtplLandingSubject[]>(
      "/api/marketing/atpl-subjects?includeHidden=1",
    );
    setCards(officialCards(result.data ?? []));
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    const result = await courseFetch<AtplLandingSubject>("/api/marketing/atpl-subjects/package", {
      method: "POST",
      body: JSON.stringify({
        code: draft.code,
        shortDescription: draft.shortDescription,
        imageUrl: draft.imageUrl || null,
      }),
    });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error ?? "Could not save subject");
      return;
    }
    toast.success(`${draft.title} updated`);
    setDraft(null);
    void load();
  }

  return (
    <Card className="rounded-2xl shadow-soft">
      <CardHeader>
        <CardTitle className="text-base">ATPL subjects — 13 official titles</CardTitle>
        <CardDescription>
          Click a subject to change its photo or short text. Names stay official. Students see this
          on /atpl and pages such as /courses/met.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading subjects…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <button
                key={card.code}
                type="button"
                onClick={() => setDraft(card)}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left hover:border-accent"
              >
                {card.imageUrl ? (
                  <SafeImage
                    src={card.imageUrl}
                    alt=""
                    className="h-14 w-20 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg bg-muted text-[10px] uppercase tracking-wide text-muted-foreground">
                    Add photo
                  </span>
                )}
                <span>
                  <span className="block text-xs text-muted-foreground">{card.code}</span>
                  <span className="block text-sm font-medium text-foreground">{card.title}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {draft?.code} · {draft?.title}
            </DialogTitle>
            <DialogDescription>
              Upload a photo and a short description. Public page:{" "}
              {draft ? atplSubjectPublicHref(draft) : ""}
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <CourseMediaUploader
                value={draft.imageUrl}
                context="atpl-subject"
                label="Subject photo"
                onChange={(url) =>
                  setDraft((current) => (current ? { ...current, imageUrl: url } : current))
                }
              />
              <div className="space-y-2">
                <Label htmlFor="atpl-subject-copy">Short description</Label>
                <Textarea
                  id="atpl-subject-copy"
                  rows={4}
                  value={draft.shortDescription}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, shortDescription: event.target.value } : current,
                    )
                  }
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export { AtplSubjectsEasyPanel };
