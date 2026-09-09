/**
 * Certificates & reports durable store (.data/aep-certificates.json).
 * Uses json-file-store so read-only hosts (Vercel) never 500 Server Components.
 */

import path from "path";

import { dataDir, readJsonFile, writeJsonFile } from "@/lib/data/json-file-store";
import { canonicalCertificateVerifyUrl } from "@/lib/site-origin";
import type { Certificate, CertificateTemplate, CompletionRecord } from "@/types/certificates";

export interface CertificatesDatabase {
  templates: CertificateTemplate[];
  certificates: Certificate[];
  completions: CompletionRecord[];
  seeded: boolean;
}

function dataFile() {
  return path.join(dataDir(), "aep-certificates.json");
}

function emptyDb(): CertificatesDatabase {
  return {
    templates: [],
    certificates: [],
    completions: [],
    seeded: false,
  };
}

function normalizeDb(raw: Partial<CertificatesDatabase>): CertificatesDatabase {
  const certificates = (raw.certificates ?? []).map((cert) => ({
    ...cert,
    qrPayload: canonicalCertificateVerifyUrl(cert.qrPayload, cert.verificationCode),
  }));
  return {
    ...emptyDb(),
    ...raw,
    templates: raw.templates ?? [],
    certificates,
    completions: raw.completions ?? [],
    seeded: Boolean(raw.seeded),
  };
}

export function ensureCertificatesStore(): CertificatesDatabase {
  const raw = readJsonFile<Partial<CertificatesDatabase>>(dataFile(), emptyDb);
  const db = normalizeDb(raw);
  const dirty = (raw.certificates ?? []).some(
    (cert) =>
      cert.qrPayload !== canonicalCertificateVerifyUrl(cert.qrPayload, cert.verificationCode),
  );
  if (dirty) writeJsonFile(dataFile(), db);
  return db;
}

export function readCertificatesDb(): CertificatesDatabase {
  return ensureCertificatesStore();
}

export function writeCertificatesDb(
  mutator: (db: CertificatesDatabase) => void,
): CertificatesDatabase {
  const db = ensureCertificatesStore();
  mutator(db);
  writeJsonFile(dataFile(), db);
  return db;
}
