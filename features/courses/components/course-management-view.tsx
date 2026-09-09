"use client";

import * as React from "react";
import Link from "@/components/ui/app-link";
import {
  Archive,
  BookOpen,
  Copy,
  DollarSign,
  Download,
  Eye,
  Grid3X3,
  List,
  MoreHorizontal,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/dashboard/data-table";
import {
  COURSE_STATUS_LABELS,
  COURSE_STATUSES,
  COURSE_DELIVERY_LABELS,
  DIFFICULTY_LABELS,
  DIFFICULTY_LEVELS,
  ENROLLMENT_MODE_LABELS,
} from "@/constants/courses";
import { COURSE_CURRENCIES } from "@/features/courses/lib/course-studio";
import { courseFetch } from "@/features/courses/lib/api";
import { CourseStatsWidgets } from "@/features/courses/components/course-stats-widgets";
import { formatRelative } from "@/utils/format";
import { cn } from "@/lib/utils";
import { formatMinor, majorToMinor } from "@/services/payments/money";
import type { CourseCategory, CourseListItem, CourseStats } from "@/types/courses";

const statusClass: Record<string, string> = {
  published: "course-studio-status-published",
  draft: "course-studio-status-draft",
  review: "course-studio-status-review",
  private: "course-studio-status-private",
  scheduled: "course-studio-status-scheduled",
  archived: "course-studio-status-archived",
};

interface CourseManagementViewProps {
  basePath: string;
  roleLabel: string;
  /** Super Admin only — publish / unpublish / archive / bulk publish (CR001). */
  canManagePublishing?: boolean;
}

function CourseManagementView({
  basePath,
  roleLabel,
  canManagePublishing = false,
}: CourseManagementViewProps) {
  const [courses, setCourses] = React.useState<CourseListItem[]>([]);
  const [stats, setStats] = React.useState<CourseStats | null>(null);
  const [categories, setCategories] = React.useState<CourseCategory[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [view, setView] = React.useState<"table" | "grid">("table");
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [difficulty, setDifficulty] = React.useState("all");
  const [categoryId, setCategoryId] = React.useState("all");
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [priceOpen, setPriceOpen] = React.useState(false);
  const [bulkPrice, setBulkPrice] = React.useState("");
  const [bulkCurrency, setBulkCurrency] = React.useState("AED");
  const importRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status !== "all") params.set("status", status);
    if (difficulty !== "all") params.set("difficulty", difficulty);
    if (categoryId !== "all") params.set("categoryId", categoryId);
    params.set("pageSize", "100");
    params.set("sortBy", "updatedAt");

    const [listRes, statsRes, catRes] = await Promise.all([
      courseFetch<{ data: CourseListItem[] }>(`/api/courses?${params}`),
      courseFetch<CourseStats>("/api/courses/stats"),
      courseFetch<CourseCategory[]>("/api/courses/categories?includeHidden=1"),
    ]);

    setCourses(listRes.data?.data ?? []);
    setStats(statsRes.data);
    setCategories(catRes.data ?? []);
    setLoading(false);
  }, [q, status, difficulty, categoryId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function runAction(id: string, action: string) {
    const result = await courseFetch(`/api/courses/${id}/actions`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    if (!result.success) {
      toast.error(result.error ?? "Action failed");
      return;
    }
    toast.success(`Course ${action}d`);
    void load();
  }

  async function runBulk(action: string, extra?: Record<string, unknown>, ids = selected) {
    if (action !== "import" && !ids.length) {
      toast.error("Select at least one course");
      return;
    }
    const result = await courseFetch<{ affected: number; exportRows?: CourseListItem[] }>(
      "/api/courses/bulk",
      {
        method: "POST",
        body: JSON.stringify({ action, courseIds: ids, ...extra }),
      },
    );
    if (!result.success) {
      toast.error(result.error ?? "Bulk action failed");
      return;
    }
    if (action === "export" && result.data?.exportRows) {
      const blob = new Blob([JSON.stringify(result.data.exportRows, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "courses-export.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
      return;
    }
    toast.success(`Updated ${result.data?.affected ?? 0} courses`);
    setSelected([]);
    void load();
  }

  async function duplicateSelected() {
    if (!selected.length) {
      toast.error("Select at least one course");
      return;
    }
    let affected = 0;
    for (const id of selected) {
      const result = await courseFetch(`/api/courses/${id}/actions`, {
        method: "POST",
        body: JSON.stringify({ action: "duplicate" }),
      });
      if (result.success) affected += 1;
    }
    toast.success(`Duplicated ${affected} courses`);
    setSelected([]);
    void load();
  }

  async function onImportFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const rows = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { data?: unknown }).data)
          ? (parsed as { data: unknown[] }).data
          : null;
      if (!rows) {
        toast.error("Import file must be a JSON array of courses");
        return;
      }
      await runBulk("import", { importRows: rows }, []);
    } catch {
      toast.error("Could not parse import file");
    }
  }

  const columns: DataTableColumn<CourseListItem>[] = [
    {
      id: "title",
      header: "Title",
      sortable: true,
      cell: (row) => (
        <div className="flex min-w-52 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- catalog thumb */}
          <img
            src={row.coverImageUrl || row.thumbnailUrl || "/images/hero-aviation.svg"}
            alt=""
            loading="lazy"
            className="h-12 w-20 rounded-lg object-cover"
          />
          <div>
            <Link
              href={`${basePath}/${row.id}/edit`}
              className="font-medium text-primary hover:underline"
            >
              {row.title}
            </Link>
            <p className="text-xs text-muted-foreground">{row.code}</p>
          </div>
        </div>
      ),
    },
    {
      id: "primaryInstructorName",
      header: "Instructor",
      sortable: true,
      cell: (row) => row.primaryInstructorName ?? "—",
    },
    {
      id: "categoryName",
      header: "Category",
      cell: (row) => row.categoryName ?? "—",
    },
    {
      id: "deliveryType",
      header: "Badge",
      cell: (row) => COURSE_DELIVERY_LABELS[row.deliveryType],
    },
    {
      id: "featured",
      header: "Featured",
      cell: (row) => (row.featured ? "Yes" : "—"),
    },
    {
      id: "displayOrder",
      header: "Order",
      sortable: true,
      cell: (row) => row.displayOrder,
    },
    {
      id: "students",
      header: "Students",
      cell: (row) => row.counts.activeEnrollments,
    },
    {
      id: "revenue",
      header: "Revenue",
      cell: (row) =>
        formatMinor((row.priceAmount ?? 0) * row.counts.activeEnrollments, row.currency || "AED"),
    },
    {
      id: "priceAmount",
      header: "Price",
      sortable: true,
      cell: (row) =>
        row.priceAmount != null ? formatMinor(row.priceAmount, row.currency || "AED") : "—",
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      cell: (row) => (
        <span
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
            statusClass[row.status],
          )}
        >
          {COURSE_STATUS_LABELS[row.status]}
        </span>
      ),
    },
    {
      id: "updatedAt",
      header: "Updated",
      sortable: true,
      cell: (row) => (
        <span className="text-xs text-muted-foreground">{formatRelative(row.updatedAt)}</span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      className: "w-12",
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Course actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`${basePath}/${row.id}`}>
                <Eye className="mr-2 h-4 w-4" /> Open curriculum
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`${basePath}/${row.id}/edit`}>Edit course</Link>
            </DropdownMenuItem>
            {canManagePublishing ? (
              <>
                <DropdownMenuItem onClick={() => void runAction(row.id, "publish")}>
                  <Upload className="mr-2 h-4 w-4" /> Publish
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void runAction(row.id, "unpublish")}>
                  Unpublish
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void runAction(row.id, "archive")}>
                  <Archive className="mr-2 h-4 w-4" /> Archive
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuItem onClick={() => void runAction(row.id, "duplicate")}>
              <Copy className="mr-2 h-4 w-4" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(row.id)}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Courses"
        description="Create, price, publish, and manage the AviatorPass catalogue."
        breadcrumbs={[{ label: roleLabel }, { label: "Courses" }]}
        actions={
          <div className="flex flex-wrap gap-2">
            {canManagePublishing ? (
              <Button variant="outline" asChild>
                <Link href="/super-admin/courses/publishing">Publishing & visibility</Link>
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link href={`${basePath}/categories`}>Categories</Link>
            </Button>
            <Button asChild>
              <Link href={`${basePath}/new`}>
                <Plus className="mr-2 h-4 w-4" /> Create course
              </Link>
            </Button>
          </div>
        }
      />

      <CourseStatsWidgets stats={stats} loading={loading} />

      <Card className="rounded-2xl shadow-soft">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">Catalog</CardTitle>
              <CardDescription>
                Search, filter, sort, and run bulk actions without reloading the page.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={view === "table" ? "secondary" : "ghost"}
                size="icon"
                aria-label="Table view"
                onClick={() => setView("table")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon"
                aria-label="Grid view"
                onClick={() => setView("grid")}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
            <Input
              placeholder="Search title or code…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="lg:max-w-xs"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="lg:w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {COURSE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {COURSE_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger className="lg:w-44">
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                {DIFFICULTY_LEVELS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DIFFICULTY_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="lg:w-52">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <input
            ref={importRef}
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImportFile(file);
              e.currentTarget.value = "";
            }}
          />

          <div className="flex flex-wrap gap-2">
            {canManagePublishing ? (
              <Button size="sm" variant="outline" onClick={() => void runBulk("publish")}>
                Bulk publish
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => void duplicateSelected()}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              Duplicate
            </Button>
            <Button size="sm" variant="outline" onClick={() => void runBulk("archive")}>
              <Archive className="mr-1 h-3.5 w-3.5" />
              Archive
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPriceOpen(true)}>
              <DollarSign className="mr-1 h-3.5 w-3.5" />
              Bulk price
            </Button>
            <Button size="sm" variant="outline" onClick={() => void runBulk("export")}>
              <Download className="mr-1 h-3.5 w-3.5" />
              Export
            </Button>
            <Button size="sm" variant="outline" onClick={() => importRef.current?.click()}>
              <Upload className="mr-1 h-3.5 w-3.5" />
              Import
            </Button>
            <Button size="sm" variant="outline" onClick={() => void runBulk("delete")}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>
            {selected.length ? <Badge variant="secondary">{selected.length} selected</Badge> : null}
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : courses.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-6 w-6" />}
              title="No courses yet"
              description="Create your first course in the new studio — media, SEO, pricing, and live preview included."
              actionLabel="Create course"
              actionHref={`${basePath}/new`}
            />
          ) : view === "table" ? (
            <DataTable
              columns={columns}
              data={courses}
              searchKeys={["title", "code", "primaryInstructorName"]}
              searchPlaceholder="Filter rows…"
              emptyMessage="No courses match filters"
              onSelectedIdsChange={setSelected}
              onExport={() =>
                void runBulk(
                  "export",
                  undefined,
                  courses.map((c) => c.id),
                )
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {courses.map((course) => (
                <Card key={course.id} className="overflow-hidden rounded-2xl shadow-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element -- catalog card */}
                  <img
                    src={course.coverImageUrl || course.thumbnailUrl || "/images/hero-aviation.svg"}
                    alt=""
                    loading="lazy"
                    className="h-36 w-full object-cover"
                  />
                  <CardHeader className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">
                        <Link href={`${basePath}/${course.id}/edit`} className="hover:underline">
                          {course.title}
                        </Link>
                      </CardTitle>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                          statusClass[course.status],
                        )}
                      >
                        {COURSE_STATUS_LABELS[course.status]}
                      </span>
                    </div>
                    <CardDescription>{course.shortDescription}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      {course.primaryInstructorName ?? "Unassigned"} ·{" "}
                      {course.counts.activeEnrollments} students
                    </p>
                    <p>
                      {course.priceAmount != null
                        ? formatMinor(course.priceAmount, course.currency || "AED")
                        : "No price"}{" "}
                      · {DIFFICULTY_LABELS[course.difficulty]} ·{" "}
                      {ENROLLMENT_MODE_LABELS[course.enrollmentMode]}
                    </p>
                    <Button asChild size="sm" variant="outline" className="w-full">
                      <Link href={`${basePath}/${course.id}/edit`}>Edit course</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {stats?.recentlyUpdated?.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently updated</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.recentlyUpdated.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-0"
              >
                <div>
                  <Link href={`${basePath}/${c.id}/edit`} className="font-medium hover:underline">
                    {c.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {c.code} · updated {new Date(c.updatedAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                    statusClass[c.status],
                  )}
                >
                  {COURSE_STATUS_LABELS[c.status]}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete course?</AlertDialogTitle>
            <AlertDialogDescription>
              This soft-deletes the course. Structure is retained for audit but hidden from the
              catalog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void (async () => {
                  if (!deleteId) return;
                  const result = await courseFetch(`/api/courses/${deleteId}`, {
                    method: "DELETE",
                  });
                  if (!result.success) {
                    toast.error(result.error ?? "Delete failed");
                    return;
                  }
                  toast.success("Course deleted");
                  setDeleteId(null);
                  void load();
                })();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={priceOpen} onOpenChange={setPriceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk price update</AlertDialogTitle>
            <AlertDialogDescription>
              Apply a new price to {selected.length || 0} selected courses.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bulk-price">Price</Label>
              <Input
                id="bulk-price"
                type="number"
                min={0}
                step="0.01"
                value={bulkPrice}
                onChange={(e) => setBulkPrice(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={bulkCurrency} onValueChange={setBulkCurrency}>
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
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void runBulk("update_price", {
                  priceAmount: majorToMinor(Number(bulkPrice) || 0, bulkCurrency),
                  currency: bulkCurrency,
                }).then(() => setPriceOpen(false));
              }}
            >
              Update prices
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export { CourseManagementView };
