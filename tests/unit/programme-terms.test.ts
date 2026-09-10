import { describe, expect, it } from "vitest";

import { ACTION_LABELS, PROGRAMME_TERMS } from "@/constants/programme-terms";

describe("programme terms", () => {
  it("keeps official titles and adds the conventional aviation names", () => {
    expect(PROGRAMME_TERMS.atpl.title).toBe("ATPL Course");
    expect(PROGRAMME_TERMS.atpl.commonName).toBe("Airline Transport Pilot License");
    expect(PROGRAMME_TERMS.basics.commonName).toBe("Introduction to aviation");
    expect(PROGRAMME_TERMS.ppl.commonName).toBe("PPL ground school");
    expect(PROGRAMME_TERMS.elp.commonName).toBe("English Language Proficiency");
  });

  it("uses plain action labels on buttons", () => {
    expect(ACTION_LABELS.browseCourses).toBe("Browse all courses");
    expect(ACTION_LABELS.viewAtplCourse).toBe("View ATPL course");
    expect(ACTION_LABELS.contactAdvisor).toBe("Contact an advisor");
    expect(ACTION_LABELS.enrolNow).toBe("Enrol now");
    expect(ACTION_LABELS.viewCourse).toBe("View course details");
    expect(ACTION_LABELS.continueLesson).toBe("Continue lesson");
  });
});
