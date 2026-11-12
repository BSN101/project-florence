import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  ACADEMIC_STATUSES,
  FIXED_CSV_ROSTER_HEADERS,
  academicStatusSchema,
  createStudentSchema,
  csvRosterRowSchema,
  studentNumberSchema,
  updateStudentSchema,
  yearLevelSchema,
} from "./schemas.ts";

describe("studentNumberSchema", () => {
  test("accepts valid student numbers matching XX-1-XXXXX", () => {
    assert.equal(studentNumberSchema.safeParse("26-1-00123").success, true);
    assert.equal(studentNumberSchema.safeParse("24-1-99999").success, true);
    assert.equal(studentNumberSchema.safeParse(" 25-1-12345 ").success, true);
  });

  test("rejects invalid student numbers", () => {
    assert.equal(studentNumberSchema.safeParse("12345").success, false);
    assert.equal(studentNumberSchema.safeParse("ABC-1-00000").success, false);
    assert.equal(studentNumberSchema.safeParse("26-2-00123").success, false);
    assert.equal(studentNumberSchema.safeParse("26-1-1234").success, false);
    assert.equal(studentNumberSchema.safeParse("26-1-123456").success, false);
    assert.equal(studentNumberSchema.safeParse("").success, false);
  });
});

describe("yearLevelSchema", () => {
  test("accepts year levels 1 to 4 as number or numeric string", () => {
    assert.equal(yearLevelSchema.safeParse(1).success, true);
    assert.equal(yearLevelSchema.safeParse(4).success, true);
    assert.equal(yearLevelSchema.safeParse("2").success, true);
    assert.equal(yearLevelSchema.safeParse("3").data, 3);
  });

  test("rejects year levels outside 1 to 4", () => {
    assert.equal(yearLevelSchema.safeParse(0).success, false);
    assert.equal(yearLevelSchema.safeParse(5).success, false);
    assert.equal(yearLevelSchema.safeParse(-1).success, false);
    assert.equal(yearLevelSchema.safeParse(2.5).success, false);
    assert.equal(yearLevelSchema.safeParse("abc").success, false);
  });
});

describe("academicStatusSchema", () => {
  test("ACADEMIC_STATUSES contains regular and irregular", () => {
    assert.deepEqual(ACADEMIC_STATUSES, ["regular", "irregular"]);
  });

  test("accepts regular and irregular case-insensitively", () => {
    assert.equal(academicStatusSchema.safeParse("regular").data, "regular");
    assert.equal(academicStatusSchema.safeParse("irregular").data, "irregular");
    assert.equal(academicStatusSchema.safeParse("Regular").data, "regular");
    assert.equal(academicStatusSchema.safeParse("IRREGULAR").data, "irregular");
    assert.equal(academicStatusSchema.safeParse("  regular  ").data, "regular");
  });

  test("rejects invalid academic status strings", () => {
    assert.equal(academicStatusSchema.safeParse("part-time").success, false);
    assert.equal(academicStatusSchema.safeParse("full-time").success, false);
    assert.equal(academicStatusSchema.safeParse("").success, false);
  });
});

describe("FIXED_CSV_ROSTER_HEADERS", () => {
  test("contains exactly the required 8 headers in order", () => {
    assert.deepEqual(FIXED_CSV_ROSTER_HEADERS, [
      "university_id",
      "last_name",
      "first_name",
      "middle_name",
      "suffix",
      "email",
      "year_level",
      "academic_status",
    ]);
  });
});

describe("csvRosterRowSchema", () => {
  const validRow = {
    university_id: "26-1-00123",
    last_name: "Dela Cruz",
    first_name: "Juan Carlos",
    middle_name: "Santos",
    suffix: "Jr.",
    email: "juancarlos.delacruz@university.edu.ph",
    year_level: 1,
    academic_status: "regular",
  };

  test("parses valid 8-column data successfully", () => {
    const result = csvRosterRowSchema.safeParse(validRow);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.university_id, "26-1-00123");
      assert.equal(result.data.last_name, "Dela Cruz");
      assert.equal(result.data.first_name, "Juan Carlos");
      assert.equal(result.data.middle_name, "Santos");
      assert.equal(result.data.suffix, "Jr.");
      assert.equal(result.data.email, "juancarlos.delacruz@university.edu.ph");
      assert.equal(result.data.year_level, 1);
      assert.equal(result.data.academic_status, "regular");
    }
  });

  test("normalizes empty middle names, suffixes, and emails to null", () => {
    const rowWithBlanks = {
      ...validRow,
      middle_name: "",
      suffix: "   ",
      email: "",
    };
    const result = csvRosterRowSchema.safeParse(rowWithBlanks);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.middle_name, null);
      assert.equal(result.data.suffix, null);
      assert.equal(result.data.email, null);
    }
  });

  test("handles undefined optional fields by normalizing to null", () => {
    const rowOmitted = {
      university_id: "26-1-00123",
      last_name: "Reyes",
      first_name: "Maria Teresa",
      year_level: "2",
      academic_status: "Irregular",
    };
    const result = csvRosterRowSchema.safeParse(rowOmitted);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.middle_name, null);
      assert.equal(result.data.suffix, null);
      assert.equal(result.data.email, null);
      assert.equal(result.data.year_level, 2);
      assert.equal(result.data.academic_status, "irregular");
    }
  });

  test("rejects invalid student number format", () => {
    const result = csvRosterRowSchema.safeParse({ ...validRow, university_id: "12345" });
    assert.equal(result.success, false);
  });

  test("rejects empty first_name or last_name", () => {
    assert.equal(csvRosterRowSchema.safeParse({ ...validRow, first_name: "  " }).success, false);
    assert.equal(csvRosterRowSchema.safeParse({ ...validRow, last_name: "" }).success, false);
  });

  test("rejects invalid year level", () => {
    assert.equal(csvRosterRowSchema.safeParse({ ...validRow, year_level: 5 }).success, false);
    assert.equal(csvRosterRowSchema.safeParse({ ...validRow, year_level: 0 }).success, false);
  });

  test("rejects invalid academic status", () => {
    assert.equal(csvRosterRowSchema.safeParse({ ...validRow, academic_status: "special" }).success, false);
  });
});

describe("createStudentSchema & updateStudentSchema", () => {
  test("createStudentSchema accepts valid student data", () => {
    const result = createStudentSchema.safeParse({
      university_id: "26-1-00456",
      last_name: "Bautista",
      first_name: "Angela",
      middle_name: "Cruz",
      suffix: "",
      email: "angela.bautista@university.edu.ph",
      year_level: 3,
      academic_status: "regular",
    });
    assert.equal(result.success, true);
  });

  test("updateStudentSchema requires valid UUID and demographic updates", () => {
    assert.equal(
      updateStudentSchema.safeParse({
        student_id: "11111111-1111-4111-8111-111111111111",
        last_name: "Bautista",
        first_name: "Angela",
        middle_name: null,
        suffix: null,
        email: null,
        year_level: 4,
        academic_status: "irregular",
      }).success,
      true,
    );

    assert.equal(
      updateStudentSchema.safeParse({
        student_id: "not-a-uuid",
        last_name: "Bautista",
        first_name: "Angela",
        year_level: 4,
        academic_status: "irregular",
      }).success,
      false,
    );
  });
});
