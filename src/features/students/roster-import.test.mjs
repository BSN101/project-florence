import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isAuthorizedRosterManager } from "./contracts.ts";
import { CSV_TEMPLATE_CONTENT, mergeRosterImportFindings, parseCsv, parseRosterCsv } from "./csv.ts";
import {
  applyRosterImportSchema,
  csvRosterRowSchema,
  FIXED_CSV_ROSTER_HEADERS,
  previewRosterImportSchema,
  rosterImportRowInputSchema,
} from "./schemas.ts";

describe("parseCsv", () => {
  test("handles UTF-8 BOM, quotes, escaped quotes, CRLF and LF", () => {
    const raw = '\uFEFFcol1,col2\r\n"Dela Cruz, Jr.","say ""hello"""\r\n\r\n26-1-00123,regular\n';
    assert.deepEqual(parseCsv(raw), [
      ["col1", "col2"],
      ["Dela Cruz, Jr.", 'say "hello"'],
      ["26-1-00123", "regular"],
    ]);
  });

  test("filters out whitespace-only rows", () => {
    const raw = "a,b\n   \n\t,  \nc,d\n";
    assert.deepEqual(parseCsv(raw), [
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("parseRosterCsv headers", () => {
  test("accepts canonical 8-column header contract", () => {
    const csv = `${FIXED_CSV_ROSTER_HEADERS.join(",")}\n26-1-00123,Dela Cruz,Juan,Santos,Jr.,juan@example.com,1,regular\n`;
    const result = parseRosterCsv(csv);
    assert.ok(!("error" in result));
    assert.equal(result.rows.length, 1);
    assert.equal(result.invalid.length, 0);
  });

  test("accepts headers case-insensitively with surrounding whitespace", () => {
    const headers = " UNIVERSITY_ID , Last_Name , First_Name , Middle_Name , Suffix , Email , Year_Level , Academic_Status ";
    const row = "26-1-00123,Dela Cruz,Juan,,,juan@example.com,2,irregular";
    const result = parseRosterCsv(`${headers}\n${row}`);
    assert.ok(!("error" in result));
    assert.equal(result.rows[0].university_id, "26-1-00123");
    assert.equal(result.rows[0].academic_status, "irregular");
  });

  test("rejects empty file", () => {
    const result = parseRosterCsv("");
    assert.ok("error" in result);
    assert.match(result.error, /empty/i);
  });

  test("rejects file with missing headers", () => {
    const result = parseRosterCsv("university_id,last_name,first_name\n26-1-00123,Cruz,Juan\n");
    assert.ok("error" in result);
    assert.match(result.error, /headers must be/i);
  });

  test("rejects file with unexpected extra columns", () => {
    const headers = [...FIXED_CSV_ROSTER_HEADERS, "extra_col"].join(",");
    const result = parseRosterCsv(`${headers}\n26-1-00123,Cruz,Juan,,,,,,extra\n`);
    assert.ok("error" in result);
    assert.match(result.error, /headers must be/i);
  });

  test("rejects file with duplicate column names", () => {
    const headers = "university_id,last_name,first_name,middle_name,suffix,email,year_level,university_id";
    const result = parseRosterCsv(`${headers}\n1,2,3,4,5,6,7,8`);
    assert.ok("error" in result);
    assert.match(result.error, /headers must be/i);
  });

  test("rejects file with header only (no data rows)", () => {
    const result = parseRosterCsv(`${FIXED_CSV_ROSTER_HEADERS.join(",")}\n`);
    assert.ok("error" in result);
    assert.match(result.error, /no student rows/i);
  });
});

describe("parseRosterCsv row extraction and normalization", () => {
  test("normalizes empty optional fields to null and trims strings", () => {
    const csv = [
      FIXED_CSV_ROSTER_HEADERS.join(","),
      " 26-1-00123 , Dela Cruz , Juan ,  ,  , Juan.Cruz@Univ.edu.ph , 3 , Regular ",
      "26-1-00124,Reyes,Maria,Santos,III,,4,irregular",
    ].join("\n");

    const result = parseRosterCsv(csv);
    assert.ok(!("error" in result));
    assert.equal(result.rows.length, 2);

    const r1 = result.rows[0];
    assert.equal(r1.row, 2);
    assert.equal(r1.university_id, "26-1-00123");
    assert.equal(r1.last_name, "Dela Cruz");
    assert.equal(r1.first_name, "Juan");
    assert.equal(r1.middle_name, null);
    assert.equal(r1.suffix, null);
    assert.equal(r1.email, "juan.cruz@univ.edu.ph");
    assert.equal(r1.year_level, 3);
    assert.equal(r1.academic_status, "regular");

    const r2 = result.rows[1];
    assert.equal(r2.row, 3);
    assert.equal(r2.university_id, "26-1-00124");
    assert.equal(r2.middle_name, "Santos");
    assert.equal(r2.suffix, "III");
    assert.equal(r2.email, null);
    assert.equal(r2.year_level, 4);
    assert.equal(r2.academic_status, "irregular");
  });

  test("flags rows with extra unmapped column fields", () => {
    const csv = [
      FIXED_CSV_ROSTER_HEADERS.join(","),
      "26-1-00123,Dela Cruz,Juan,,,juan@univ.edu.ph,1,regular,extra_value",
    ].join("\n");

    const result = parseRosterCsv(csv);
    assert.ok(!("error" in result));
    assert.equal(result.invalid.length, 1);
    assert.equal(result.invalid[0].row, 2);
    assert.match(result.invalid[0].message, /too many columns/i);
  });

  test("handles quoted fields with commas and escaped quotes within CSV roster data", () => {
    const csv = [
      FIXED_CSV_ROSTER_HEADERS.join(","),
      '26-1-00123,"Dela Cruz, Jr.",Juan,"Santos ""The Great""",III,juan.cruz@example.com,1,regular',
    ].join("\n");

    const result = parseRosterCsv(csv);
    assert.ok(!("error" in result));
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].last_name, "Dela Cruz, Jr.");
    assert.equal(result.rows[0].middle_name, 'Santos "The Great"');
  });

  test("rejects files exceeding MAX_ROSTER_IMPORT_ROWS limit", () => {
    const header = FIXED_CSV_ROSTER_HEADERS.join(",");
    const sampleRow = "26-1-00123,Dela Cruz,Juan,,,juan@example.com,1,regular";
    const oversizedBody = new Array(10001).fill(sampleRow).join("\n");
    const result = parseRosterCsv(`${header}\n${oversizedBody}`);
    assert.ok("error" in result);
    assert.match(result.error, /more than 10000 rows/i);
  });
});

describe("csvRosterRowSchema and row validation", () => {
  test("validates compliant student roster rows", () => {
    const valid = {
      university_id: "26-1-00123",
      last_name: "Dela Cruz",
      first_name: "Juan",
      middle_name: "Santos",
      suffix: null,
      email: "juan@example.com",
      year_level: 2,
      academic_status: "regular",
    };
    const parsed = csvRosterRowSchema.safeParse(valid);
    assert.equal(parsed.success, true);
  });

  test("rejects malformed student numbers", () => {
    const row = {
      university_id: "invalid-id",
      last_name: "Santos",
      first_name: "Pedro",
      middle_name: null,
      suffix: null,
      email: null,
      year_level: 1,
      academic_status: "regular",
    };
    const parsed = csvRosterRowSchema.safeParse(row);
    assert.equal(parsed.success, false);
    assert.match(parsed.error.issues[0].message, /XX-1-XXXXX/);
  });

  test("rejects invalid year levels (outside 1-4)", () => {
    const badYears = [0, 5, -1, 99];
    for (const y of badYears) {
      const parsed = csvRosterRowSchema.safeParse({
        university_id: "26-1-00123",
        last_name: "Santos",
        first_name: "Pedro",
        middle_name: null,
        suffix: null,
        email: null,
        year_level: y,
        academic_status: "regular",
      });
      assert.equal(parsed.success, false);
    }
  });

  test("rejects invalid academic status strings", () => {
    const badStatuses = ["probation", "graduated", "unknown", ""];
    for (const s of badStatuses) {
      const parsed = csvRosterRowSchema.safeParse({
        university_id: "26-1-00123",
        last_name: "Santos",
        first_name: "Pedro",
        middle_name: null,
        suffix: null,
        email: null,
        year_level: 1,
        academic_status: s,
      });
      assert.equal(parsed.success, false);
    }
  });

  test("rejects malformed email format when provided", () => {
    const parsed = csvRosterRowSchema.safeParse({
      university_id: "26-1-00123",
      last_name: "Santos",
      first_name: "Pedro",
      middle_name: null,
      suffix: null,
      email: "not-an-email",
      year_level: 1,
      academic_status: "regular",
    });
    assert.equal(parsed.success, false);
    assert.match(parsed.error.issues[0].message, /invalid email/i);
  });
});

describe("import action schemas", () => {
  test("rosterImportRowInputSchema validates normalized input shape", () => {
    assert.equal(
      rosterImportRowInputSchema.safeParse({
        row: 2,
        university_id: "26-1-00123",
        last_name: "Dela Cruz",
        first_name: "Juan",
        middle_name: null,
        suffix: null,
        email: "juan@example.com",
        year_level: 1,
        academic_status: "regular",
      }).success,
      true,
    );
  });

  test("previewRosterImportSchema validates non-empty csvText", () => {
    assert.equal(previewRosterImportSchema.safeParse({ csvText: "a,b\n1,2" }).success, true);
    assert.equal(previewRosterImportSchema.safeParse({ csvText: "" }).success, false);
  });

  test("applyRosterImportSchema requires valid UUID requestKey", () => {
    assert.equal(
      applyRosterImportSchema.safeParse({
        requestKey: "550e8400-e29b-41d4-a716-446655440000",
        csvText: "a,b\n1,2",
      }).success,
      true,
    );
    assert.equal(
      applyRosterImportSchema.safeParse({
        requestKey: "not-a-uuid",
        csvText: "a,b\n1,2",
      }).success,
      false,
    );
  });
});

describe("mergeRosterImportFindings", () => {
  test("merges parser and db findings by line number and updates totals", () => {
    const dbPreview = {
      semester_id: "550e8400-e29b-41d4-a716-446655440000",
      ready: 1,
      conflicts: 1,
      invalid: 0,
      created: 1,
      re_enrolled: 0,
      updated: 0,
      rows: [
        {
          row: 2,
          university_id: "26-1-00123",
          name: "Juan Dela Cruz",
          action: "create",
          status: "ready",
          message: "New student to be created",
        },
        {
          row: 3,
          university_id: "26-1-00124",
          name: "Pedro Santos",
          action: "none",
          status: "conflict",
          message: "Name conflicts with existing profile (Santos, Maria)",
        },
      ],
    };

    const parserInvalid = [
      {
        row: 2,
        university_id: "26-1-00123",
        name: "Juan Dela Cruz",
        action: "none",
        status: "invalid",
        message: "Too many columns",
      },
    ];

    const merged = mergeRosterImportFindings(dbPreview, parserInvalid);
    assert.equal(merged.rows.length, 2);
    // Row 2 is upgraded to invalid because parser detected too many columns
    assert.equal(merged.rows[0].status, "invalid");
    assert.match(merged.rows[0].message, /too many columns/i);
    assert.equal(merged.ready, 0);
    assert.equal(merged.conflicts, 1);
    assert.equal(merged.invalid, 1);
  });
});

describe("isAuthorizedRosterManager authorization predicate", () => {
  test("authorizes Executive and Operations", () => {
    assert.equal(isAuthorizedRosterManager("executive"), true);
    assert.equal(isAuthorizedRosterManager("operations"), true);
  });

  test("denies Representatives, Students, Faculty, and unauthorized callers", () => {
    assert.equal(isAuthorizedRosterManager("representative"), false);
    assert.equal(isAuthorizedRosterManager("student"), false);
    assert.equal(isAuthorizedRosterManager("faculty"), false);
    assert.equal(isAuthorizedRosterManager("admin"), false);
    assert.equal(isAuthorizedRosterManager(null), false);
    assert.equal(isAuthorizedRosterManager(undefined), false);
    assert.equal(isAuthorizedRosterManager(""), false);
  });
});

describe("CSV template content contract", () => {
  test("template strictly conforms to the canonical 8-column header contract and valid sample rows", () => {
    const result = parseRosterCsv(CSV_TEMPLATE_CONTENT);
    assert.ok(!("error" in result));
    assert.equal(result.invalid.length, 0);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].university_id, "26-1-00123");
    assert.equal(result.rows[0].academic_status, "regular");
    assert.equal(result.rows[1].university_id, "26-1-00124");
    assert.equal(result.rows[1].academic_status, "irregular");
  });
});
