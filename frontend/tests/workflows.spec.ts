import { test, expect, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test.beforeEach(() => {
  execFileSync(process.execPath, [
    fileURLToPath(
      new URL("../../backend/test/reset-browser-limits.cjs", import.meta.url),
    ),
  ]);
});
const password = "Browser test password 2026";
async function signIn(page: Page, role: string) {
  await page.goto("/");
  await page
    .getByLabel("Email address")
    .fill(`${role.toLowerCase()}@browser.test`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Account menu" }),
  ).toBeVisible();
}
async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to Gatewise" }),
  ).toBeVisible();
}
async function nav(page: Page, name: string) {
  await page
    .locator("aside")
    .getByRole("button", { name, exact: false })
    .click();
}
async function saved(page: Page) {
  await expect(page.getByText("Saving…", { exact: true })).toHaveCount(0);
}
function wat(hours: number) {
  return new Date(Date.now() + hours * 3600000 + 3600000)
    .toISOString()
    .slice(0, 16);
}

test("sign-in validates credentials, restores session, and revokes logout", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Email address").fill("admin@browser.test");
  await page.getByLabel("Password", { exact: true }).fill("wrong password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("invalid credentials");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Account menu" }),
  ).toBeVisible();
  await expect(page.getByText(/demo/i)).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Account menu" }),
  ).toBeVisible();
  await signOut(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sign in to Gatewise" }),
  ).toBeVisible();
});

test("roles restrict navigation and direct page access", async ({ page }) => {
  await signIn(page, "staff");
  await expect(
    page.locator("aside").getByRole("button", { name: "Users", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator("aside")
      .getByRole("button", { name: "Register walk-in", exact: true }),
  ).toHaveCount(0);
  await page.goto("/?page=users");
  await expect(
    page.getByRole("heading", { name: "My dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "User management" }),
  ).toHaveCount(0);
  await signOut(page);
  await signIn(page, "receptionist");
  await expect(
    page.locator("aside").getByRole("button", { name: "Users", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator("aside")
      .getByRole("button", { name: "Register walk-in", exact: true }),
  ).toBeVisible();
});

test("reception registers a walk-in, staff approves, reception checks in and out", async ({
  page,
  browser,
}) => {
  const name = `Walkin${Date.now()}`;
  await signIn(page, "receptionist");
  await nav(page, "Register walk-in");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("First name").fill(name);
  await dialog.getByLabel("Last name").fill("Guest");
  await dialog.getByLabel("Email address").fill(`${name}@browser.test`);
  await dialog
    .getByLabel("Staff host")
    .selectOption({ label: "Staff Host — Engineering" });
  await dialog.getByLabel("Purpose of visit").fill("Integration meeting");
  await dialog.getByLabel("Departure (Africa/Lagos)").fill(wat(3));
  await dialog
    .getByRole("button", { name: "Register & request approval" })
    .click();
  await expect(dialog).toHaveCount(0);
  await nav(page, "Waiting visitors");
  await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible();
  const staffContext = await browser.newContext({
    baseURL: "http://localhost:3010",
  });
  const staff = await staffContext.newPage();
  await signIn(staff, "staff");
  await nav(staff, "Approval inbox");
  await staff.getByRole("row").filter({ hasText: name }).click();
  await staff.getByRole("button", { name: "Approve", exact: true }).click();
  await saved(staff);
  await expect(
    staff.getByRole("dialog").getByText("Approved", { exact: true }),
  ).toBeVisible();
  await staffContext.close();
  await page.reload();
  await page.getByRole("row").filter({ hasText: name }).click();
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await saved(page);
  await expect(
    page.getByRole("dialog").getByText("Checked in", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check out", exact: true }).click();
  await saved(page);
  await expect(
    page.getByRole("dialog").getByText("Checked out", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await nav(page, "History");
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
    "Checked out",
  );
});

test("staff creates, edits, activates, and shares a real invitation", async ({
  page,
}) => {
  const name = `Invited${Date.now()}`;
  await signIn(page, "staff");
  await nav(page, "Create invitation");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("First name").fill(name);
  await dialog.getByLabel("Email address").fill(`${name}@browser.test`);
  await dialog.getByLabel("Purpose of visit").fill("Planned meeting");
  await dialog.getByLabel("Arrival (Africa/Lagos)").fill(wat(1));
  await dialog.getByLabel("Departure (Africa/Lagos)").fill(wat(2));
  await dialog.getByLabel("Save as draft").check();
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await nav(page, "My invitations");
  await page.getByRole("row").filter({ hasText: name }).click();
  await page
    .getByRole("button", { name: "Edit invitation", exact: true })
    .click();
  await page.getByLabel("Purpose of visit").fill("Updated meeting");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("row").filter({ hasText: name }).click();
  await expect(page.getByRole("dialog")).toContainText("Updated meeting");
  await page
    .getByRole("button", { name: "Activate draft", exact: true })
    .click();
  await saved(page);
  await expect(
    page.getByRole("dialog").getByText("Expected", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Share invitation", exact: true })
    .click();
  await expect(
    page.getByText("Invitation details", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("VMS-");
  await expect(page.getByRole("dialog")).toContainText(
    "Invitation email queued for delivery.",
  );
  await expect(page.getByRole("dialog")).toContainText(
    /\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}/,
  );
  await page
    .getByRole("button", { name: "Resend invitation email", exact: true })
    .click();
  await saved(page);
  await expect(page.getByRole("dialog")).toContainText(
    "Invitation email queued for delivery.",
  );
  await expect(
    page.getByRole("button", { name: "Check in", exact: true }),
  ).toHaveCount(0);
});

test("admin manages departments, visitors, restrictions, settings, profile and reports", async ({
  page,
}) => {
  const suffix = Date.now();
  await signIn(page, "admin");
  await nav(page, "Departments");
  await page
    .getByRole("button", { name: "Add department", exact: true })
    .click();
  await page.getByLabel("Department name").fill(`Team${suffix}`);
  await page.getByLabel("Description", { exact: true }).fill("API department");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: `Team${suffix}` }),
  ).toBeVisible();
  await nav(page, "Visitors");
  await page.getByRole("button", { name: "Add visitor", exact: true }).click();
  await page.getByLabel("First name").fill(`Visitor${suffix}`);
  await page.getByLabel("Company", { exact: true }).fill("Integration Co");
  await page
    .getByLabel("Email", { exact: false })
    .fill(`visitor${suffix}@browser.test`);
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("row")
    .filter({ hasText: `Visitor${suffix}` })
    .click();
  await page
    .getByRole("button", { name: "Archive profile", exact: true })
    .click();
  await saved(page);
  await expect(
    page.getByRole("dialog").getByText("Archived", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore profile", exact: true })
    .click();
  await saved(page);
  await page.keyboard.press("Escape");
  await nav(page, "Blacklist");
  await page
    .getByRole("button", { name: "Add restriction", exact: true })
    .click();
  const visitorId = await page
    .locator('select[name="visitorId"] option')
    .filter({ hasText: `Visitor${suffix}` })
    .getAttribute("value");
  await page
    .getByRole("combobox", { name: "Visitor *", exact: true })
    .selectOption(visitorId!);
  await page.getByLabel("Reason").fill("Integration restriction");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("row")
    .filter({ hasText: `Visitor${suffix}` })
    .getByRole("button", { name: "Lift restriction", exact: true })
    .click();
  await page.getByLabel("Reason").fill("Restriction resolved");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: `Visitor${suffix}` }),
  ).toContainText("Archived");
  await nav(page, "Settings");
  await page.getByLabel("Organization name").fill("Integrated Gatewise");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await saved(page);
  await page.reload();
  await expect(page.getByLabel("Organization name")).toHaveValue(
    "Integrated Gatewise",
  );
  await nav(page, "Reports");
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  await expect(await download).toBeTruthy();
  await page
    .getByRole("combobox", { name: "Report", exact: true })
    .selectOption("average-duration");
  await expect(
    page.getByText("Average completed visit duration"),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("reports.png"),
    fullPage: true,
  });
  await nav(page, "Audit logs");
  await expect(
    page.getByRole("row").filter({ hasText: "UPDATE_SETTINGS" }).first(),
  ).toBeVisible();
});

test("failed writes keep forms open and do not show success", async ({
  page,
}) => {
  await signIn(page, "admin");
  await nav(page, "Departments");
  await page
    .getByRole("button", { name: "Add department", exact: true })
    .click();
  await page.getByLabel("Department name").fill("Rejected department");
  await page.route("**/api/v1/departments", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "DUPLICATE_RECORD", message: "DUPLICATE_RECORD" },
          }),
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("duplicate record", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("loads records after the first API page and renews an expired access token", async ({
  page,
}) => {
  await signIn(page, "admin");
  let renewed = false;
  let injected = false;
  await page.route("**/api/v1/auth/me", async (route) => {
    if (!injected) {
      injected = true;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "UNAUTHORIZED", message: "UNAUTHORIZED" },
        }),
      });
    } else await route.continue();
  });
  page.on("response", (response) => {
    if (response.url().endsWith("/auth/refresh") && response.status() === 201)
      renewed = true;
  });
  // A mutation reloads the workspace while keeping its access token in memory.
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "My profile" }).click();
  await page.getByLabel("First name").fill("API Administrator");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await saved(page);
  await expect.poll(() => renewed).toBe(true);
  await expect(
    page.getByRole("button", { name: "Account menu" }),
  ).toBeVisible();
  await nav(page, "Visitors");
  await page
    .getByRole("textbox", { name: "Search visitors…" })
    .fill("Paginated000");
  await expect(
    page.getByRole("row").filter({ hasText: "Paginated000" }),
  ).toBeVisible();
});

test("admin creates and disables a user, and can mark notifications read", async ({
  page,
}) => {
  await signIn(page, "admin");
  const suffix = Date.now();
  await nav(page, "Users");
  await page.getByRole("button", { name: "Add user", exact: true }).click();
  await page.getByLabel("First name").fill("New");
  await page.getByLabel("Last name").fill("Receptionist");
  await page
    .getByLabel("Email *", { exact: true })
    .fill(`reception${suffix}@browser.test`);
  await page.getByLabel("Employee ID").fill(`R-${suffix}`);
  await page
    .getByRole("combobox", { name: "Role", exact: true })
    .selectOption("RECEPTIONIST");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const row = page
    .getByRole("row")
    .filter({ hasText: `reception${suffix}@browser.test` });
  await expect(row).toContainText("receptionist");
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("First name").fill("Updated");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row).toContainText("Updated Receptionist");
  await row.getByRole("button", { name: "Disable", exact: true }).click();
  await page.getByLabel("Reason").fill("Test disable");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row).toContainText("Disabled");
  await page.getByRole("button", { name: /unread notifications/ }).click();
  await page
    .getByRole("button", { name: "Mark all as read", exact: true })
    .click();
  await saved(page);
  await expect(
    page.getByRole("button", { name: "0 unread notifications" }),
  ).toBeVisible();
});

test("password recovery gives a private response and handles invalid reset links", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page.getByLabel("Email address").fill("unknown@browser.test");
  await page
    .getByRole("button", { name: "Send password instructions", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "If an active account exists",
  );
  await page.goto(`/reset-password#token=${"f".repeat(64)}`);
  await page.getByLabel("New password").fill("Recovery test password 2026");
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("invalid reset token");
});

test("staff changes their password and signs in with the new password", async ({
  page,
}) => {
  await signIn(page, "staff");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "My profile", exact: true }).click();
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page
    .getByLabel("New password", { exact: true })
    .fill("Changed browser password 2026");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sign in to Gatewise" }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill("staff@browser.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Changed browser password 2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My dashboard" }),
  ).toBeVisible();
});
