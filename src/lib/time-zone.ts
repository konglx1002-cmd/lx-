export const DEFAULT_TIME_ZONE = "Asia/Shanghai";

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function validateTimeZone(value: unknown) {
  if (!isValidTimeZone(value)) {
    throw new RangeError("无效的时区");
  }

  return value;
}

export function getTodayDateKey(timeZone: string, now = new Date()) {
  validateTimeZone(timeZone);

  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export const timeZoneInputSchema = {
  "~standard": {
    version: 1 as const,
    vendor: "scientific-growth-log",
    validate(value: unknown) {
      if (isValidTimeZone(value)) {
        return { value };
      }

      return { issues: [{ message: "无效的时区" }] };
    },
  },
};
