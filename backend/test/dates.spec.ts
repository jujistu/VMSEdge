import { displayDate, invitationCalendar } from "../src/common/dates";

it("formats WAT timestamps with unpadded hours, including day rollover", () => {
  expect(displayDate("2026-10-18T08:30:00.000Z")).toBe("2026-10-18 9:30");
  expect(displayDate("2026-10-18T23:05:00.000Z")).toBe("2026-10-19 0:05");
  expect(displayDate("invalid")).toBe("—");
});
it("preserves calendar instants and escapes/folds UTF-8 content", () => {
  const calendar = invitationCalendar(
    {
      _id: "abc",
      version: 3,
      expectedArrivalAt: "2026-10-18T08:30:00.000Z",
      expectedDepartureAt: "2026-10-18T09:30:00.000Z",
      snapshot: {
        hostName: "é".repeat(70) + ", Host;\nTest",
        departmentName: "Operations",
      },
    },
    "VMS-2026-000001",
  );
  expect(calendar).toContain("DTSTART:20261018T083000Z");
  expect(calendar).toContain("UID:visit-abc@gatewise.local");
  expect(calendar).toContain("SEQUENCE:3");
  expect(calendar.replace(/\r\n /g, "")).toContain("\\, Host\\;\\nTest");
  for (const line of calendar.split("\r\n"))
    expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
});
