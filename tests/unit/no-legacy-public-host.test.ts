import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  LEGACY_PUBLIC_HOST,
  remapAtplpassMailbox,
  rewriteLegacyPublicHost,
} from "@/lib/branding/legacy-client-identity";

describe("retired public host is gone from source and remapped at runtime", () => {
  it("rewrites persisted mailboxes and URLs onto aviatorpass.com", () => {
    expect(remapAtplpassMailbox(`support@${LEGACY_PUBLIC_HOST}`)).toBe("support@aviatorpass.com");
    expect(remapAtplpassMailbox(`info@${LEGACY_PUBLIC_HOST}`)).toBe("info@aviatorpass.com");
    expect(remapAtplpassMailbox(`noreply@${LEGACY_PUBLIC_HOST}`)).toBe("noreply@aviatorpass.com");
    expect(rewriteLegacyPublicHost(`https://www.${LEGACY_PUBLIC_HOST}`)).toBe(
      "https://www.aviatorpass.com",
    );
  });

  it("has zero source matches for the retired public host", () => {
    const output = execSync(
      `rg -F --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!.next/**' --glob '!*.png' --glob '!*.pdf' --glob '!*.jpg' -- ${JSON.stringify(LEGACY_PUBLIC_HOST)} . || true`,
      { cwd: process.cwd(), encoding: "utf8" },
    ).trim();
    expect(output).toBe("");
  });
});
