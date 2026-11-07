import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

await import("../../../custom_components/garbage_view/frontend/garbage-view-card.js");
const { occursOn, parseDate } = globalThis.__gv;

// Verità condivisa: generata da recurrence.py (vedi test_occurrences_fixture_is_current).
const data = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/occurrences.json"), "utf8"));

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("ricorrenze JS = ricorrenze Python", () => {
  data.cases.forEach(({ rule, dates }, i) => {
    it(`caso ${i + 1}: ${rule.type} (${dates.length} date, 2026-2028)`, () => {
      const start = parseDate(data.start);
      const end = parseDate(data.end);
      const got = [];
      for (let d = start; d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        if (occursOn(rule, d)) got.push(iso(d));
      }
      expect(got).toEqual(dates);
    });
  });

  it("regole malformate non cadono mai e non sollevano errori", () => {
    const day = parseDate("2026-11-07");
    for (const bad of [null, {}, { type: "boh" }, { type: "weekly" }, { type: "every_n_weeks", weekdays: [5] },
      { type: "every_n_weeks", weekdays: [5], interval: 2, anchor_date: "x" }, { type: "monthly_day", day: "7" }]) {
      expect(occursOn(bad, day)).toBe(false);
    }
  });
});
