import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MARKETING_REVALIDATE_PATHS,
  siteCopyRevalidatePaths,
} from "@/lib/marketing/revalidate-marketing";
import { SITE_COPY_PAGES } from "@/services/marketing/site-copy-catalog";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("marketing revalidation helpers", () => {
  it("covers the public marketing surfaces", () => {
    expect(MARKETING_REVALIDATE_PATHS).toContain("/");
    expect(MARKETING_REVALIDATE_PATHS).toContain("/atpl");
    expect(MARKETING_REVALIDATE_PATHS).toContain("/courses");
    expect(MARKETING_REVALIDATE_PATHS).toContain("/about");
    expect(SITE_COPY_PAGES.every((page) => typeof page.path === "string")).toBe(true);
  });

  it("maps site-copy pages to public paths", () => {
    expect(siteCopyRevalidatePaths("home")).toEqual(expect.arrayContaining(["/", "/atpl"]));
    expect(siteCopyRevalidatePaths("atpl")).toEqual(expect.arrayContaining(["/", "/atpl"]));
    expect(siteCopyRevalidatePaths("contact")).toEqual(["/contact"]);
  });

  it("busts marketing ISR after Super Admin course publishing and catalog settings", () => {
    expect(src("app/api/courses/[id]/publishing/route.ts")).toMatch(/revalidateCoursePublishing\(\)/);
    expect(src("app/api/courses/[id]/actions/route.ts")).toMatch(/revalidateCoursePublishing\(\)/);
    expect(src("app/api/admin/settings/route.ts")).toMatch(/revalidateMarketingPaths\(\)/);
    expect(src("lib/marketing/revalidate-marketing.ts")).toMatch(/revalidatePath\(path, type\)/);
    expect(src("lib/marketing/revalidate-marketing.ts")).toMatch(/bust\("\/courses\/\[id\]"/);
  });
});
