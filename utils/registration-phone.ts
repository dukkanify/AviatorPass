/**
 * Registration mobile numbers — dial codes aligned with REGISTRATION_COUNTRIES
 * (GCC, Egypt, and other active markets). Validates local mobile shape per country.
 */

export type RegistrationDialCountry =
  | "KW"
  | "AE"
  | "SA"
  | "QA"
  | "BH"
  | "OM"
  | "EG"
  | "JO"
  | "LB"
  | "IQ"
  | "SY"
  | "PS"
  | "TR"
  | "IN"
  | "PK"
  | "BD"
  | "PH"
  | "GB"
  | "US"
  | "CA"
  | "AU"
  | "DE"
  | "FR"
  | "IT"
  | "ES"
  | "NL"
  | "ZA"
  | "NG"
  | "KE"
  | "MA"
  | "TN";

export type RegistrationPhoneCountry = {
  code: RegistrationDialCountry;
  dialCode: string;
  flag: string;
  label: string;
  /** Exact local digit count after the country dial code. */
  localLength: number;
  pattern: RegExp;
  placeholder: string;
  hint: string;
};

export const REGISTRATION_PHONE_COUNTRIES: readonly RegistrationPhoneCountry[] = [
  {
    code: "KW",
    dialCode: "+965",
    flag: "🇰🇼",
    label: "Kuwait",
    localLength: 8,
    pattern: /^[569]\d{7}$/,
    placeholder: "5XXX XXXX",
    hint: "Kuwait mobile — 8 digits starting with 5, 6, or 9",
  },
  {
    code: "AE",
    dialCode: "+971",
    flag: "🇦🇪",
    label: "UAE",
    localLength: 9,
    pattern: /^5\d{8}$/,
    placeholder: "5X XXX XXXX",
    hint: "UAE mobile — 9 digits starting with 5",
  },
  {
    code: "SA",
    dialCode: "+966",
    flag: "🇸🇦",
    label: "Saudi Arabia",
    localLength: 9,
    pattern: /^5\d{8}$/,
    placeholder: "5X XXX XXXX",
    hint: "Saudi mobile — 9 digits starting with 5",
  },
  {
    code: "QA",
    dialCode: "+974",
    flag: "🇶🇦",
    label: "Qatar",
    localLength: 8,
    pattern: /^[3567]\d{7}$/,
    placeholder: "3XXX XXXX",
    hint: "Qatar mobile — 8 digits starting with 3, 5, 6, or 7",
  },
  {
    code: "BH",
    dialCode: "+973",
    flag: "🇧🇭",
    label: "Bahrain",
    localLength: 8,
    pattern: /^[13-9]\d{7}$/,
    placeholder: "3XXX XXXX",
    hint: "Bahrain mobile — 8 digits",
  },
  {
    code: "OM",
    dialCode: "+968",
    flag: "🇴🇲",
    label: "Oman",
    localLength: 8,
    pattern: /^[79]\d{7}$/,
    placeholder: "9XXX XXXX",
    hint: "Oman mobile — 8 digits starting with 7 or 9",
  },
  {
    code: "EG",
    dialCode: "+20",
    flag: "🇪🇬",
    label: "Egypt",
    localLength: 10,
    pattern: /^1[0125]\d{8}$/,
    placeholder: "10 XXXX XXXX",
    hint: "Egypt mobile — 10 digits starting with 10, 11, 12, or 15 (no leading 0)",
  },
  {
    code: "JO",
    dialCode: "+962",
    flag: "🇯🇴",
    label: "Jordan",
    localLength: 9,
    pattern: /^7\d{8}$/,
    placeholder: "7X XXX XXXX",
    hint: "Jordan mobile — 9 digits starting with 7",
  },
  {
    code: "LB",
    dialCode: "+961",
    flag: "🇱🇧",
    label: "Lebanon",
    localLength: 8,
    pattern: /^[378]\d{7}$/,
    placeholder: "3XXX XXXX",
    hint: "Lebanon mobile — 8 digits starting with 3, 7, or 8",
  },
  {
    code: "IQ",
    dialCode: "+964",
    flag: "🇮🇶",
    label: "Iraq",
    localLength: 10,
    pattern: /^7\d{9}$/,
    placeholder: "7XX XXX XXXX",
    hint: "Iraq mobile — 10 digits starting with 7",
  },
  {
    code: "SY",
    dialCode: "+963",
    flag: "🇸🇾",
    label: "Syria",
    localLength: 9,
    pattern: /^9\d{8}$/,
    placeholder: "9XX XXX XXX",
    hint: "Syria mobile — 9 digits starting with 9",
  },
  {
    code: "PS",
    dialCode: "+970",
    flag: "🇵🇸",
    label: "Palestine",
    localLength: 9,
    pattern: /^5\d{8}$/,
    placeholder: "5X XXX XXXX",
    hint: "Palestine mobile — 9 digits starting with 5",
  },
  {
    code: "TR",
    dialCode: "+90",
    flag: "🇹🇷",
    label: "Turkey",
    localLength: 10,
    pattern: /^5\d{9}$/,
    placeholder: "5XX XXX XXXX",
    hint: "Turkey mobile — 10 digits starting with 5",
  },
  {
    code: "IN",
    dialCode: "+91",
    flag: "🇮🇳",
    label: "India",
    localLength: 10,
    pattern: /^[6-9]\d{9}$/,
    placeholder: "9XXXX XXXXX",
    hint: "India mobile — 10 digits starting with 6–9",
  },
  {
    code: "PK",
    dialCode: "+92",
    flag: "🇵🇰",
    label: "Pakistan",
    localLength: 10,
    pattern: /^3\d{9}$/,
    placeholder: "3XX XXXXXXX",
    hint: "Pakistan mobile — 10 digits starting with 3",
  },
  {
    code: "BD",
    dialCode: "+880",
    flag: "🇧🇩",
    label: "Bangladesh",
    localLength: 10,
    pattern: /^1\d{9}$/,
    placeholder: "1XXX XXXXXX",
    hint: "Bangladesh mobile — 10 digits starting with 1",
  },
  {
    code: "PH",
    dialCode: "+63",
    flag: "🇵🇭",
    label: "Philippines",
    localLength: 10,
    pattern: /^9\d{9}$/,
    placeholder: "9XX XXX XXXX",
    hint: "Philippines mobile — 10 digits starting with 9",
  },
  {
    code: "GB",
    dialCode: "+44",
    flag: "🇬🇧",
    label: "United Kingdom",
    localLength: 10,
    pattern: /^7\d{9}$/,
    placeholder: "7XXX XXXXXX",
    hint: "UK mobile — 10 digits starting with 7",
  },
  {
    code: "US",
    dialCode: "+1",
    flag: "🇺🇸",
    label: "United States",
    localLength: 10,
    pattern: /^[2-9]\d{9}$/,
    placeholder: "(201) 555-0123",
    hint: "US mobile — 10 digits",
  },
  {
    code: "CA",
    dialCode: "+1",
    flag: "🇨🇦",
    label: "Canada",
    localLength: 10,
    pattern: /^[2-9]\d{9}$/,
    placeholder: "(416) 555-0123",
    hint: "Canada mobile — 10 digits",
  },
  {
    code: "AU",
    dialCode: "+61",
    flag: "🇦🇺",
    label: "Australia",
    localLength: 9,
    pattern: /^4\d{8}$/,
    placeholder: "4XX XXX XXX",
    hint: "Australia mobile — 9 digits starting with 4",
  },
  {
    code: "DE",
    dialCode: "+49",
    flag: "🇩🇪",
    label: "Germany",
    localLength: 11,
    pattern: /^1[5-7]\d{8,9}$/,
    placeholder: "15X XXXXXXXX",
    hint: "Germany mobile — 10–11 digits starting with 15, 16, or 17",
  },
  {
    code: "FR",
    dialCode: "+33",
    flag: "🇫🇷",
    label: "France",
    localLength: 9,
    pattern: /^[67]\d{8}$/,
    placeholder: "6 XX XX XX XX",
    hint: "France mobile — 9 digits starting with 6 or 7",
  },
  {
    code: "IT",
    dialCode: "+39",
    flag: "🇮🇹",
    label: "Italy",
    localLength: 10,
    pattern: /^3\d{9}$/,
    placeholder: "3XX XXX XXXX",
    hint: "Italy mobile — 10 digits starting with 3",
  },
  {
    code: "ES",
    dialCode: "+34",
    flag: "🇪🇸",
    label: "Spain",
    localLength: 9,
    pattern: /^[67]\d{8}$/,
    placeholder: "6XX XXX XXX",
    hint: "Spain mobile — 9 digits starting with 6 or 7",
  },
  {
    code: "NL",
    dialCode: "+31",
    flag: "🇳🇱",
    label: "Netherlands",
    localLength: 9,
    pattern: /^6\d{8}$/,
    placeholder: "6 XXXXXXXX",
    hint: "Netherlands mobile — 9 digits starting with 6",
  },
  {
    code: "ZA",
    dialCode: "+27",
    flag: "🇿🇦",
    label: "South Africa",
    localLength: 9,
    pattern: /^[6-8]\d{8}$/,
    placeholder: "8X XXX XXXX",
    hint: "South Africa mobile — 9 digits starting with 6–8",
  },
  {
    code: "NG",
    dialCode: "+234",
    flag: "🇳🇬",
    label: "Nigeria",
    localLength: 10,
    pattern: /^[789]\d{9}$/,
    placeholder: "801 XXX XXXX",
    hint: "Nigeria mobile — 10 digits starting with 7, 8, or 9",
  },
  {
    code: "KE",
    dialCode: "+254",
    flag: "🇰🇪",
    label: "Kenya",
    localLength: 9,
    pattern: /^7\d{8}$/,
    placeholder: "7XX XXX XXX",
    hint: "Kenya mobile — 9 digits starting with 7",
  },
  {
    code: "MA",
    dialCode: "+212",
    flag: "🇲🇦",
    label: "Morocco",
    localLength: 9,
    pattern: /^[67]\d{8}$/,
    placeholder: "6XX XXX XXX",
    hint: "Morocco mobile — 9 digits starting with 6 or 7",
  },
  {
    code: "TN",
    dialCode: "+216",
    flag: "🇹🇳",
    label: "Tunisia",
    localLength: 8,
    pattern: /^[2459]\d{7}$/,
    placeholder: "2X XXX XXX",
    hint: "Tunisia mobile — 8 digits",
  },
] as const;

const BY_CODE = new Map(REGISTRATION_PHONE_COUNTRIES.map((row) => [row.code, row]));

/** Longest dial codes first so +880 matches before +88… and +1 is unambiguous per selected country. */
const BY_DIAL_LENGTH = [...REGISTRATION_PHONE_COUNTRIES].sort(
  (a, b) => b.dialCode.length - a.dialCode.length,
);

export function phoneCountry(code: RegistrationDialCountry): RegistrationPhoneCountry {
  return BY_CODE.get(code) ?? REGISTRATION_PHONE_COUNTRIES[0]!;
}

export function dialCountryFromRegistrationCountry(
  countryCode: string,
): RegistrationDialCountry | null {
  const code = countryCode.toUpperCase();
  if (BY_CODE.has(code as RegistrationDialCountry)) return code as RegistrationDialCountry;
  return null;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Extract local mobile digits from pasted/full phone value for a dial country. */
export function parseLocalDigitsFromInput(
  dialCountry: RegistrationDialCountry,
  raw: string,
): string {
  const dial = phoneCountry(dialCountry);
  let digits = digitsOnly(raw);
  const dialDigits = dial.dialCode.replace("+", "");
  if (digits.startsWith(dialDigits)) {
    digits = digits.slice(dialDigits.length);
  }
  // National trunk 0 (e.g. Egypt 010… → 10…)
  if (digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }
  // Germany allows 10–11 local digits; cap at 11.
  const max = dial.code === "DE" ? 11 : dial.localLength;
  return digits.slice(0, max);
}

export function buildRegistrationPhone(
  dialCountry: RegistrationDialCountry,
  localDigits: string,
): string {
  return `${phoneCountry(dialCountry).dialCode}${localDigits}`;
}

export function formatLocalPhoneDisplay(
  dialCountry: RegistrationDialCountry,
  localDigits: string,
): string {
  if (!localDigits) return "";
  if (dialCountry === "KW") {
    if (localDigits.length <= 4) return localDigits;
    return `${localDigits.slice(0, 4)} ${localDigits.slice(4)}`;
  }
  if (dialCountry === "AE" || dialCountry === "SA") {
    if (localDigits.length <= 2) return localDigits;
    if (localDigits.length <= 5) return `${localDigits.slice(0, 2)} ${localDigits.slice(2)}`;
    return `${localDigits.slice(0, 2)} ${localDigits.slice(2, 5)} ${localDigits.slice(5)}`;
  }
  if (dialCountry === "EG") {
    if (localDigits.length <= 2) return localDigits;
    if (localDigits.length <= 6) return `${localDigits.slice(0, 2)} ${localDigits.slice(2)}`;
    return `${localDigits.slice(0, 2)} ${localDigits.slice(2, 6)} ${localDigits.slice(6)}`;
  }
  if (dialCountry === "US" || dialCountry === "CA") {
    if (localDigits.length <= 3) return localDigits;
    if (localDigits.length <= 6) return `(${localDigits.slice(0, 3)}) ${localDigits.slice(3)}`;
    return `(${localDigits.slice(0, 3)}) ${localDigits.slice(3, 6)}-${localDigits.slice(6)}`;
  }
  // Generic groups of 3–4
  if (localDigits.length <= 4) return localDigits;
  if (localDigits.length <= 7) return `${localDigits.slice(0, 3)} ${localDigits.slice(3)}`;
  return `${localDigits.slice(0, 3)} ${localDigits.slice(3, 6)} ${localDigits.slice(6)}`;
}

export function validateLocalMobile(
  dialCountry: RegistrationDialCountry,
  localDigits: string,
): string | null {
  const dial = phoneCountry(dialCountry);

  if (!localDigits) {
    return "Enter your mobile number";
  }
  if (!/^\d+$/.test(localDigits)) {
    return `Enter a valid ${dial.label} mobile number`;
  }

  if (dial.code === "DE") {
    if (localDigits.length < 10) {
      return "Germany mobile numbers are 10–11 digits starting with 15, 16, or 17";
    }
    if (!dial.pattern.test(localDigits)) {
      return "Enter a valid Germany mobile number (starts with 15, 16, or 17)";
    }
    return null;
  }

  if (localDigits.length < dial.localLength) {
    return `${dial.label} mobile numbers are ${dial.localLength} digits`;
  }
  if (!dial.pattern.test(localDigits)) {
    return `Enter a valid ${dial.label} mobile number`;
  }
  return null;
}

export function validateRegistrationPhoneE164(
  phone: string,
  preferredCountry?: RegistrationDialCountry | null,
): string | null {
  const normalized = phone.replace(/[\s()-]/g, "");
  if (!normalized.startsWith("+")) {
    return "Use an international mobile number with a country code";
  }

  const tryCountry = (code: RegistrationDialCountry) => {
    const dial = phoneCountry(code);
    if (!normalized.startsWith(dial.dialCode)) return null;
    const local = normalized.slice(dial.dialCode.length);
    return validateLocalMobile(code, local);
  };

  if (preferredCountry) {
    const preferred = tryCountry(preferredCountry);
    if (preferred === null) return null;
    if (normalized.startsWith(phoneCountry(preferredCountry).dialCode)) return preferred;
  }

  // Shared +1: accept if either US or CA pattern matches.
  if (normalized.startsWith("+1")) {
    const local = normalized.slice(2);
    const us = validateLocalMobile("US", local);
    if (us === null) return null;
    const ca = validateLocalMobile("CA", local);
    if (ca === null) return null;
    return us;
  }

  for (const row of BY_DIAL_LENGTH) {
    if (row.dialCode === "+1") continue;
    if (!normalized.startsWith(row.dialCode)) continue;
    return validateLocalMobile(row.code, normalized.slice(row.dialCode.length));
  }

  return "Select a supported country code and enter a valid mobile number";
}

export function localPlaceholder(dialCountry: RegistrationDialCountry): string {
  return phoneCountry(dialCountry).placeholder;
}

export function localHint(dialCountry: RegistrationDialCountry): string {
  return phoneCountry(dialCountry).hint;
}

/** @deprecated kept for tests that imported legacy names */
export const KUWAIT_MOBILE_PATTERN = /^[569]\d{7}$/;
export const UAE_MOBILE_PATTERN = /^5\d{8}$/;
