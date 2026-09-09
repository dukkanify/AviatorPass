import type { Metadata } from "next";

import { siteConfig } from "@/config/site";
import { routes } from "@/constants/routes";
import { TERMS_DESCRIPTION, TERMS_SECTIONS, TERMS_TITLE } from "@/features/legal/content";
import { LegalDocument } from "@/features/legal/legal-document";

export const metadata: Metadata = {
  title: TERMS_TITLE,
  description: TERMS_DESCRIPTION,
  alternates: { canonical: routes.legal.terms },
  openGraph: {
    title: `${TERMS_TITLE} | ${siteConfig.name}`,
    description: TERMS_DESCRIPTION,
    url: routes.legal.terms,
  },
};

export default function TermsOfServicePage() {
  return (
    <LegalDocument
      title={TERMS_TITLE}
      description={TERMS_DESCRIPTION}
      path={routes.legal.terms}
      sections={TERMS_SECTIONS}
    />
  );
}
