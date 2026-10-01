"use client";

import * as React from "react";
import Link from "@/components/ui/app-link";
import { useParams } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CERTIFICATE_STATUS_LABELS } from "@/constants/certificates";
import { certFetch } from "@/features/certificates/lib/api";
import type { Certificate } from "@/types/certificates";

function CertificateViewer() {
  const params = useParams<{ id: string }>();
  const [data, setData] = React.useState<{
    certificate: Certificate;
    qrDataUrl: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      const result = await certFetch<{ certificate: Certificate; qrDataUrl: string }>(
        `/api/certificates/${params.id}`,
      );
      if (!result.success || !result.data) {
        setError(result.error ?? "Unable to load certificate");
        return;
      }
      setData(result.data);
    })();
  }, [params.id]);

  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-muted-foreground">Loading certificate…</p>;

  const c = data.certificate;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificate viewer"
        description={c.certificateNumber}
        breadcrumbs={[
          { label: "Certificates", href: "/student/certificates" },
          { label: c.courseName },
        ]}
        actions={
          <Button
            size="sm"
            onClick={() => window.open(`/api/certificates/${c.id}?print=1`, "_blank")}
          >
            Print / Save PDF
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card className="overflow-hidden border-0 bg-transparent shadow-none">
          <CardContent className="p-0">
            <iframe
              title={`${c.courseName} certificate`}
              src={`/api/certificates/${c.id}?print=1`}
              className="aspect-[1.414/1] w-full rounded-2xl border bg-muted"
            />
            <div className="mt-3 flex justify-center">
              <Badge variant="secondary">{CERTIFICATE_STATUS_LABELS[c.status]}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.qrDataUrl} alt="Verification QR code" className="mx-auto h-40 w-40" />
            <p className="font-mono text-xs">{c.verificationCode}</p>
            <p className="break-all text-[10px] text-muted-foreground">
              Sig {c.digitalSignature.slice(0, 32)}…
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/verify/certificate?code=${encodeURIComponent(c.verificationCode)}`}>
                Open public page
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export { CertificateViewer };
