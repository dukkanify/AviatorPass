"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { otpDigitsFromText } from "@/utils/otp-code";

interface OtpInputProps {
  length?: number;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

function applyOtpText(
  text: string,
  length: number,
  onChange?: (value: string) => void,
  inputs?: Array<HTMLInputElement | null>,
) {
  const pasted = otpDigitsFromText(text, length);
  if (!pasted) return;
  onChange?.(pasted);
  const focusIndex = Math.min(pasted.length, length) - 1;
  if (focusIndex >= 0) inputs?.[focusIndex]?.focus();
}

function OtpInput({
  length = 6,
  value = "",
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel = "One-time password",
}: OtpInputProps) {
  const inputs = React.useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const setDigit = (index: number, char: string) => {
    const next = digits.slice();
    next[index] = char.replace(/\D/g, "").slice(-1);
    onChange?.(next.join("").slice(0, length));
  };

  return (
    <div
      className={cn("flex gap-2", className)}
      role="group"
      aria-label={ariaLabel}
      onPaste={(event) => {
        const text = event.clipboardData.getData("text");
        if (!text) return;
        event.preventDefault();
        applyOtpText(text, length, onChange, inputs.current);
      }}
    >
      {digits.map((digit, index) => (
        <Input
          key={index}
          ref={(el) => {
            inputs.current[index] = el;
          }}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={length}
          disabled={disabled}
          value={digit}
          aria-label={`Digit ${index + 1}`}
          className="h-12 w-10 rounded-xl text-center text-lg font-semibold sm:w-12"
          onChange={(event) => {
            const raw = event.target.value;
            const numeric = raw.replace(/\D/g, "");
            if (numeric.length > 1 || raw.trim().length > 1) {
              applyOtpText(raw, length, onChange, inputs.current);
              return;
            }
            setDigit(index, numeric);
            if (numeric && index < length - 1) inputs.current[index + 1]?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !digits[index] && index > 0) {
              inputs.current[index - 1]?.focus();
            }
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (!text) return;
            event.preventDefault();
            event.stopPropagation();
            applyOtpText(text, length, onChange, inputs.current);
          }}
        />
      ))}
    </div>
  );
}

export { OtpInput };
