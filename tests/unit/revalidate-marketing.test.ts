import { describe, expect, it } from "vitest";

import {
  MARKETING_REVALIDATE_PATHS,
  siteCopyRevalidatePaths,
} from "@/lib/marketing/revalidate-marketing";
import { SITE_COPY_PAGES } from "@/services/marketing/site-copy-catalog";

describe("marketing revalidation helpers", () => {
  it("covers the public marketing surfaces", () => {
    expect(MARKETING_REVALIDATE_PATHS).toContain("/");
    expect(MARKETING_REVALIDATE_PATHS).toContain("/atpl");
    expect(SITE_COPY_PAGES.every((page) => typeof page.path === "string")).toBe(true);
  });

  it("maps site-copy pages to public paths", () => {
    expect(siteCopyRevalidatePaths("home")).toEqual(expect.arrayContaining(["/", "/atpl"]));
    expect(siteCopyRevalidatePaths("atpl")).toEqual(expect.arrayContaining(["/", "/atpl"]));
    expect(siteCopyRevalidatePaths("contact")).toEqual(["/contact"]);
  });
});
