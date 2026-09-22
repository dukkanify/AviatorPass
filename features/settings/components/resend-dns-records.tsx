"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  formatDnsRecordLine,
  formatNamecheapTsv,
  probeRowState,
  registrarHost,
  zoneTtl,
  type DnsEditorHint,
  type PublicDnsProbeRow,
  type ResendDomainRecord,
} from "@/services/email/resend-dns";

async function copyText(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`Copied ${label}`);
    return true;
  } catch {
    toast.error("Could not copy to clipboard");
    return false;
  }
}

function CopyCell({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-start gap-1">
      <code className="min-w-0 flex-1 break-all font-mono text-xs leading-5">{value}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          const ok = await copyText(label, value);
          if (ok) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function statusTone(status?: string) {
  if (!status) return "secondary" as const;
  if (/verified|success/i.test(status)) return "success" as const;
  if (/pending|not_started|temporary/i.test(status)) return "warning" as const;
  return "destructive" as const;
}

function ProbeBadge({ row }: { row: PublicDnsProbeRow }) {
  const state = probeRowState(row);
  if (state === "published") return <Badge variant="success">published</Badge>;
  if (state === "mismatch") return <Badge variant="warning">mismatch</Badge>;
  return <Badge variant="destructive">missing</Badge>;
}

function probeFor(row: ResendDomainRecord, domain: string, probe: PublicDnsProbeRow[]) {
  const host = registrarHost(row.name, domain);
  return (
    probe.find(
      (item) =>
        item.type.toUpperCase() === row.type.toUpperCase() &&
        item.host.toLowerCase() === host.toLowerCase(),
    ) ?? null
  );
}

export function ResendDnsRecords({
  domain,
  records,
  nameservers = [],
  dnsEditor,
  probe = [],
  publishedCount,
  missingCount,
}: {
  domain: string;
  records: ResendDomainRecord[];
  nameservers?: string[];
  dnsEditor?: DnsEditorHint | null;
  probe?: PublicDnsProbeRow[];
  publishedCount?: number;
  missingCount?: number;
}) {
  const editor = dnsEditor ?? {
    kind: "unknown" as const,
    title: "DNS zone editor",
    nameservers,
    instruction:
      "Add Type / Host / Value / TTL / Priority at the DNS host for this domain. After saving, click Verify DNS.",
  };
  const published = publishedCount ?? probe.filter((row) => row.matched).length;
  const mismatched = probe.filter((row) => probeRowState(row) === "mismatch").length;
  const missing =
    missingCount !== undefined
      ? Math.max(0, missingCount - mismatched)
      : probe.filter((row) => probeRowState(row) === "missing").length;

  if (records.length === 0 && probe.length === 0) {
    return (
      <div className="space-y-2">
        <Alert variant="warning">
          <AlertTitle>{editor.title}</AlertTitle>
          <AlertDescription>{editor.instruction}</AlertDescription>
        </Alert>
        <p className="text-xs text-muted-foreground">
          No DNS records yet. Register the domain, then paste Type / Host / Value / TTL / Priority
          into {editor.title}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Alert variant={editor.kind === "cpanel_zone_editor" ? "warning" : "info"}>
        <AlertTitle>{editor.title}</AlertTitle>
        <AlertDescription>
          <p>{editor.instruction}</p>
          {nameservers.length > 0 || editor.nameservers.length > 0 ? (
            <p className="mt-2 font-mono text-xs">
              NS {(nameservers.length > 0 ? nameservers : editor.nameservers).join(" · ")}
            </p>
          ) : null}
          {probe.length > 0 ? (
            <p className="mt-2 text-xs">
              Public DNS: {published} of {probe.length} Resend records published
              {mismatched > 0 ? ` · ${mismatched} mismatch` : ""}
              {missing > 0 ? ` · ${missing} missing` : ""}.
            </p>
          ) : null}
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">DNS records for {editor.title}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void copyText("cPanel / Namecheap TSV", formatNamecheapTsv(records, domain))
            }
            disabled={records.length === 0}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy TSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void copyText(
                "all DNS records",
                records.map((row) => formatDnsRecordLine(row, domain)).join("\n"),
              )
            }
            disabled={records.length === 0}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy all
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Host is the left-hand name without {domain || "the apex"}. MX rows need Priority. TTL Auto
        from Resend becomes 14400 for cPanel. After saving at the zone editor, click Verify DNS
        (propagation can take a few minutes).
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Host</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>TTL</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Resend</TableHead>
            <TableHead>Public DNS</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(records.length > 0 ? records : []).map((row, index) => {
            const host = registrarHost(row.name, domain);
            const priority =
              row.priority !== undefined && row.priority !== "" ? String(row.priority) : "";
            const seen = probeFor(row, domain, probe);
            return (
              <TableRow key={`${row.type}-${row.name}-${index}`}>
                <TableCell className="font-medium uppercase">{row.type}</TableCell>
                <TableCell>
                  <CopyCell label="host" value={host} />
                </TableCell>
                <TableCell>
                  {priority ? <CopyCell label="priority" value={priority} /> : "—"}
                </TableCell>
                <TableCell>
                  <CopyCell label="ttl" value={zoneTtl(row.ttl)} />
                </TableCell>
                <TableCell className="max-w-[28rem]">
                  <CopyCell label="value" value={row.value} />
                </TableCell>
                <TableCell>
                  {row.status ? <Badge variant={statusTone(row.status)}>{row.status}</Badge> : "—"}
                </TableCell>
                <TableCell>{seen ? <ProbeBadge row={seen} /> : "—"}</TableCell>
              </TableRow>
            );
          })}
          {records.length === 0
            ? probe.map((row, index) => (
                <TableRow key={`probe-${row.type}-${row.host}-${index}`}>
                  <TableCell className="font-medium uppercase">{row.type}</TableCell>
                  <TableCell>
                    <CopyCell label="host" value={row.host} />
                  </TableCell>
                  <TableCell>
                    {row.priority ? <CopyCell label="priority" value={row.priority} /> : "—"}
                  </TableCell>
                  <TableCell>—</TableCell>
                  <TableCell className="max-w-[28rem]">
                    <CopyCell label="value" value={row.expected} />
                  </TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>
                    <ProbeBadge row={row} />
                  </TableCell>
                </TableRow>
              ))
            : null}
        </TableBody>
      </Table>
    </div>
  );
}
