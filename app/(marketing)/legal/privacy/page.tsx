import type { Metadata } from "next";

import { siteConfig } from "@/config/site";
import { routes } from "@/constants/routes";
import { PRIVACY_DESCRIPTION, PRIVACY_SECTIONS, PRIVACY_TITLE } from "@/features/legal/content";
import { LegalDocument } from "@/features/legal/legal-document";

export const metadata: Metadata = {
  title: PRIVACY_TITLE,
  description: PRIVACY_DESCRIPTION,
  alternates: { canonical: routes.legal.privacy },
  openGraph: {
    title: `${PRIVACY_TITLE} | ${siteConfig.name}`,
    description: PRIVACY_DESCRIPTION,
    url: routes.legal.privacy,
  },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument
      title={PRIVACY_TITLE}
      description={PRIVACY_DESCRIPTION}
      path={routes.legal.privacy}
      sections={PRIVACY_SECTIONS}
    />
  );
}
