import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("Partnerships strip", () => {
  it("shows the four required partner logos only", () => {
    const strip = src("features/marketing/components/partner-strip.tsx");
    expect(strip).toContain("/partners/pilot100-logo.svg");
    expect(strip).toContain("/partners/tamara-logo.svg");
    expect(strip).toContain("/partners/taly-logo.svg");
    expect(strip).toContain("/partners/easa-logo.png");
    expect(strip).not.toContain("Future partner");
    expect(strip).not.toContain("future-partner.svg");
  });

  it("ships original partner logo files (not placeholder wordmarks)", () => {
    const pilot = src("public/partners/pilot100-logo.svg");
    const tamara = src("public/partners/tamara-logo.svg");
    const taly = src("public/partners/taly-logo.svg");
    expect(pilot).not.toContain("QUESTION BANK");
    expect(tamara).not.toContain("PAY LATER");
    expect(taly).not.toContain("INSTALLMENTS");
    expect(pilot).toContain("#5EEAD4");
    expect(tamara).toContain("#16181D");
    expect(taly).toContain("#0E6FF7");
  });

  it("keeps a four-column responsive partner grid", () => {
    const css = src("styles/landing.css");
    expect(css).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(css).toContain(".partner-strip-logo");
    expect(css).toContain("object-fit: contain");
  });
});
