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
import {
  formatDnsRecordLine,
  registrarHost,
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

export function ResendDnsRecords({
  domain,
  records,
}: {
  domain: string;
  records: ResendDomainRecord[];
}) {
  if (records.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No DNS records yet. Register the domain, then paste Type / Host / Value into Namecheap.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">DNS records for Namecheap</p>
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
        >
          <Copy className="h-3.5 w-3.5" />
          Copy all
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Host is the left-hand name without {domain || "the apex"}. MX rows need Priority. After
        saving at the registrar, click Verify DNS (propagation can take a few minutes).
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Host</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((row, index) => {
            const host = registrarHost(row.name, domain);
            const priority =
              row.priority !== undefined && row.priority !== "" ? String(row.priority) : "";
            return (
              <TableRow key={`${row.type}-${row.name}-${index}`}>
                <TableCell className="font-medium uppercase">{row.type}</TableCell>
                <TableCell>
                  <CopyCell label="host" value={host} />
                </TableCell>
                <TableCell>
                  {priority ? <CopyCell label="priority" value={priority} /> : "—"}
                </TableCell>
                <TableCell className="max-w-[28rem]">
                  <CopyCell label="value" value={row.value} />
                </TableCell>
                <TableCell>
                  {row.status ? <Badge variant={statusTone(row.status)}>{row.status}</Badge> : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
