// Human-readable timestamps only. Database/API dates and iCalendar stay standard.
export function displayDate(value: Date | string): string {
  const date = new Date(value);
  if (!Number.isFinite(+date)) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day} ${Number(p.hour)}:${p.minute}`;
}

const escapeCalendar = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
const calendarDate = (d: Date | string) =>
  new Date(d)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export function invitationCalendar(visit: any, code: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gatewise//Visitor Management//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:visit-${visit._id}@gatewise.local`,
    `DTSTAMP:${calendarDate(new Date())}`,
    `SEQUENCE:${visit.version || 0}`,
    `DTSTART:${calendarDate(visit.expectedArrivalAt)}`,
    `DTEND:${calendarDate(visit.expectedDepartureAt)}`,
    `STATUS:${visit.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED"}`,
    `SUMMARY:${escapeCalendar(`Visit with ${visit.snapshot.hostName}`)}`,
    `DESCRIPTION:${escapeCalendar(`Invitation: ${code}\nHost: ${visit.snapshot.hostName}\nDepartment: ${visit.snapshot.departmentName}\nTimes shown in email use Africa/Lagos (WAT).`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // Fold by UTF-8 octets, as required by RFC 5545, including continuation space.
  return (
    lines
      .map((line) => {
        let result = "",
          width = 0;
        for (const character of line) {
          const size = Buffer.byteLength(character);
          if (width + size > 75) {
            result += "\r\n ";
            width = 1;
          }
          result += character;
          width += size;
        }
        return result;
      })
      .join("\r\n") + "\r\n"
  );
}
