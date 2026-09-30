"use client";

import * as React from "react";

import { PageHeader } from "@/components/shared/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/utils/format";
import { authFetch } from "@/features/auth/services/auth-api";
import type { ActivityLogRecord, AuditLogRecord, PaginatedResponse } from "@/types";

type ActivityRow = ActivityLogRecord & {
  actorName?: string | null;
  actorEmail?: string | null;
  device?: string;
  browser?: string;
  os?: string;
  location?: string;
};

function ActivityLogsView() {
  const [activity, setActivity] = React.useState<ActivityRow[]>([]);
  const [audit, setAudit] = React.useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    void (async () => {
      setLoading(true);
      const [activityRes, auditRes] = await Promise.all([
        authFetch<PaginatedResponse<ActivityRow>>("/api/admin/activity-logs?page=1&pageSize=50"),
        authFetch<PaginatedResponse<AuditLogRecord>>("/api/admin/audit-logs?page=1&pageSize=50"),
      ]);
      setActivity(activityRes.data?.data ?? []);
      setAudit(auditRes.data?.data ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="System logs"
        description="Real activity from the database — user, action, time, IP, device, browser, OS, and approximate IP location. No demo rows."
        breadcrumbs={[
          { label: "Super Admin", href: "/super-admin/dashboard" },
          { label: "System Logs" },
        ]}
      />

      <Tabs defaultValue="activity">
        <TabsList>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-4">
          <div className="table-scroll rounded-xl border border-border bg-card shadow-soft">
            <Table className="min-w-[72rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>Date / Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Browser</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : activity.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      No activity yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  activity.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(log.createdAt, "MMM d, yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{log.actorName || log.actorId?.slice(0, 8) || "—"}</div>
                        <div className="text-xs text-muted-foreground">{log.actorEmail ?? ""}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{log.action}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.ipAddress || "—"}</TableCell>
                      <TableCell className="text-sm">{log.device || "—"}</TableCell>
                      <TableCell className="text-sm">{log.browser || "—"}</TableCell>
                      <TableCell className="text-sm">{log.os || "—"}</TableCell>
                      <TableCell className="text-sm">{log.location || "Unknown"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <div className="table-scroll rounded-xl border border-border bg-card shadow-soft">
            <Table className="min-w-[36rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : audit.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No audit events yet. Settings changes will appear here.
                    </TableCell>
                  </TableRow>
                ) : (
                  audit.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(log.createdAt, "MMM d, yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.action}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{log.resource}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.actorId?.slice(0, 8) ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.ipAddress || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export { ActivityLogsView };
