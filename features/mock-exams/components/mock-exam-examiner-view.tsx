"use client";

import * as React from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { csrfHeaders } from "@/lib/security/browser-csrf";
import { formatMinor } from "@/lib/money";
import type { MockExamSessionWithNames } from "@/types/mock-exams";

export function MockExamExaminerView() {
  const [sessions, setSessions] = React.useState<MockExamSessionWithNames[]>([]);
  const [scores, setScores] = React.useState<Record<string, string>>({});
  const [docs, setDocs] = React.useState<Record<string, { name: string; url: string }>>({});
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/mock-exams", { cache: "no-store" });
    const json = (await res.json()) as {
      success: boolean;
      data: MockExamSessionWithNames[];
      error: string | null;
    };
    if (!res.ok || !json.success) throw new Error(json.error ?? "Failed");
    setSessions(json.data);
  }, []);

  React.useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [load]);

  async function complete(sessionId: string) {
    const scorePercent = Number(scores[sessionId] ?? "75");
    const res = await fetch("/api/mock-exams", {
      method: "POST",
      headers: { "content-type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({
        action: "complete",
        sessionId,
        scorePercent,
        passed: scorePercent >= 75,
      }),
    });
    const json = (await res.json()) as { success: boolean; error: string | null };
    if (!res.ok || !json.success) {
      toast.error(json.error ?? "Failed");
      return;
    }
    toast.success("Session approved — Aviator Pass certificate issued");
    await load();
  }

  async function attach(sessionId: string) {
    const doc = docs[sessionId];
    if (!doc?.name || !doc?.url) {
      toast.error("Add a document name and link");
      return;
    }
    const res = await fetch("/api/mock-exams", {
      method: "POST",
      headers: { "content-type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({
        action: "attach_document",
        sessionId,
        documentName: doc.name,
        documentUrl: doc.url,
      }),
    });
    const json = (await res.json()) as { success: boolean; error: string | null };
    if (!res.ok || !json.success) {
      toast.error(json.error ?? "Failed");
      return;
    }
    toast.success("Document saved to the student account");
    setDocs((prev) => ({ ...prev, [sessionId]: { name: "", url: "" } }));
    await load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mock exam sessions"
        description="Join Zoom, share the screen, send files to the student account, then approve the session so the Aviator Pass certificate is issued."
        breadcrumbs={[{ label: "Instructor" }, { label: "Mock exams" }]}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ul className="space-y-4 text-sm">
        {sessions.length === 0 ? (
          <li className="text-muted-foreground">No assigned mock exam sessions.</li>
        ) : (
          sessions.map((s) => (
            <li key={s.id} className="border-b border-border/60 pb-4">
              <p className="font-medium">
                {s.examTypeName} · {s.studentName ?? "Student"} ·{" "}
                <Badge variant="secondary">{s.status}</Badge>
              </p>
              <p className="text-muted-foreground">
                {new Date(s.startsAt).toLocaleString()} · {formatMinor(s.quote.total, s.currency)}
              </p>
              {s.zoom ? (
                <p>
                  {s.zoom.topic ? (
                    <span className="block text-muted-foreground">{s.zoom.topic}</span>
                  ) : null}
                  <a
                    className="text-primary hover:underline"
                    href={s.zoom.startUrl || s.zoom.joinUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Start Zoom meeting
                  </a>
                </p>
              ) : null}
              {s.documents?.length ? (
                <ul className="mt-1 text-muted-foreground">
                  {s.documents.map((doc) => (
                    <li key={doc.id}>
                      <a
                        className="text-primary hover:underline"
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {doc.name}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              {(s.status === "confirmed" || s.status === "in_progress") && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label>File or link for the student</Label>
                      <Input
                        className="w-48"
                        placeholder="Document name"
                        value={docs[s.id]?.name ?? ""}
                        onChange={(e) =>
                          setDocs((prev) => ({
                            ...prev,
                            [s.id]: { name: e.target.value, url: prev[s.id]?.url ?? "" },
                          }))
                        }
                      />
                    </div>
                    <Input
                      className="w-64"
                      placeholder="https://…"
                      value={docs[s.id]?.url ?? ""}
                      onChange={(e) =>
                        setDocs((prev) => ({
                          ...prev,
                          [s.id]: { name: prev[s.id]?.name ?? "", url: e.target.value },
                        }))
                      }
                    />
                    <Button size="sm" variant="outline" onClick={() => void attach(s.id)}>
                      Save to student account
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label>Score %</Label>
                      <Input
                        className="w-24"
                        value={scores[s.id] ?? "75"}
                        onChange={(e) => setScores((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      />
                    </div>
                    <Button size="sm" onClick={() => void complete(s.id)}>
                      Approve session
                    </Button>
                  </div>
                </div>
              )}
              {s.certificateId ? (
                <p className="mt-1 text-muted-foreground">
                  Aviator Pass certificate issued · {s.scorePercent}% ·{" "}
                  {s.passed ? "PASS" : "Completed"}
                </p>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
