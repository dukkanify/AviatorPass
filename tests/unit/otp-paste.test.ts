import { describe, expect, it } from "vitest";

import { otpDigitsFromText } from "@/utils/otp-code";

describe("otp paste from email", () => {
  it("keeps a plain 6-digit code", () => {
    expect(otpDigitsFromText("482913")).toBe("482913");
  });

  it("reads the code from an email sentence", () => {
    expect(otpDigitsFromText("Your AviatorPass code is 482913. It expires in 10 minutes.")).toBe(
      "482913",
    );
  });

  it("joins a code that was copied with spaces", () => {
    expect(otpDigitsFromText("482 913")).toBe("482913");
  });

  it("ignores letters around the digits", () => {
    expect(otpDigitsFromText("Code:\n482913\n")).toBe("482913");
  });
});
