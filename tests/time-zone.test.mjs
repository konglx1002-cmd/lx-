import assert from "node:assert/strict";
import test from "node:test";

import { getTodayDateKey, validateTimeZone } from "../src/lib/time-zone.ts";

test("calculates each user's date at the Shanghai and Tokyo boundary", () => {
  const boundary = new Date("2026-01-01T15:30:00.000Z");

  assert.equal(getTodayDateKey("Asia/Shanghai", boundary), "2026-01-01");
  assert.equal(getTodayDateKey("Asia/Tokyo", boundary), "2026-01-02");
});

test("rejects invalid time zones on the server", () => {
  assert.equal(validateTimeZone("Asia/Shanghai"), "Asia/Shanghai");
  assert.throws(() => validateTimeZone("Mars/Olympus_Mons"), /无效的时区/);
});
