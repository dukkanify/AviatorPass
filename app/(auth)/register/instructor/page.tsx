import type { Metadata } from "next";

import { RegisterShell } from "@/features/auth/components/register-shell";
import { siteConfig } from "@/config/site";
import { routes } from "@/constants/routes";
import { getPlatformSettings } from "@/services/settings/settings-service";

export const metadata: Metadata = {
  title: "Instructor registration",
  description: `Register as an AviatorPass instructor — teach courses and run live Zoom coaching on ${siteConfig.name}.`,
  alternates: { canonical: routes.registerInstructor },
};

export default function InstructorRegisterPage() {
  const auth = getPlatformSettings().authentication;
  const requireSpecialChar = Boolean(auth.passwordPolicyEnabled && auth.requireSpecialChar);
  return <RegisterShell initialRole="instructor" requireSpecialChar={requireSpecialChar} />;
}
