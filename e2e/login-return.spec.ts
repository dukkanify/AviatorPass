/**
 * Direct landing: unauthenticated instructors return to /instructor/profile
 * after login. Students never land on instructor pages.
 * Option A: personal Zoom Account UI is hidden on the instructor profile.
 */

import { expect, test } from "@playwright/test";

const INSTRUCTOR = {
  email: "instructor@aviatorpass.com",
  password: "DemoPass123!",
};
const STUDENT = {
  email: "student@aviatorpass.com",
  password: "DemoPass123!",
};

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("login return path", () => {
  test("unauthenticated instructor returns to the profile page", async ({ page }) => {
    await page.goto("/instructor/profile");
    await expect(page).toHaveURL(/\/login\?next=%2Finstructor%2Fprofile/);

    await signIn(page, INSTRUCTOR.email, INSTRUCTOR.password);
    await page.waitForURL("**/instructor/profile", { timeout: 30_000 });

    await expect(page.getByText("Account status").first()).toBeVisible();
    await expect(page.getByText("Zoom Account")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Connect Zoom|Reconnect/ })).toHaveCount(0);
  });

  test("a normal login without next still opens the role dashboard", async ({ page }) => {
    await page.goto("/login");
    await signIn(page, INSTRUCTOR.email, INSTRUCTOR.password);
    await page.waitForURL("**/instructor/dashboard", { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/instructor\/profile/);
  });

  test("a student return path cannot open the instructor Zoom page", async ({ page }) => {
    await page.goto("/login?next=%2Finstructor%2Fprofile");
    await signIn(page, STUDENT.email, STUDENT.password);
    await page.waitForURL("**/student/dashboard", { timeout: 30_000 });

    await page.goto("/instructor/profile");
    await expect(page).toHaveURL(/\/access-denied/);
    await expect(page.getByText("Zoom Account")).toHaveCount(0);
  });
});
