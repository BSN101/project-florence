import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  APPROVED_SEMESTER_TERMS,
  activateSemesterSchema,
  createSemesterSchema,
  semesterFilterSchema,
} from "./schemas.ts";

describe("semesterFilterSchema", () => {
  test("accepts one UUID and rejects malformed or repeated values", () => {
    assert.equal(semesterFilterSchema.safeParse({}).success, true);
    assert.equal(
      semesterFilterSchema.safeParse({ semester: "11111111-1111-4111-8111-111111111111" }).success,
      true,
    );
    assert.equal(semesterFilterSchema.safeParse({ semester: "not-a-semester" }).success, false);
    assert.equal(
      semesterFilterSchema.safeParse({ semester: ["11111111-1111-4111-8111-111111111111"] }).success,
      false,
    );
  });
});

describe("APPROVED_SEMESTER_TERMS", () => {
  test("contains exactly the approved V1 vocabulary", () => {
    assert.deepEqual(APPROVED_SEMESTER_TERMS, ["1st Semester", "2nd Semester"]);
  });
});

describe("createSemesterSchema", () => {
  const validBase = {
    academic_year_start: 2026,
    term: "1st Semester",
    starts_on: "2026-08-15",
    ends_on: "2026-12-20",
  };

  test("accepts valid inputs for all approved terms", () => {
    assert.equal(createSemesterSchema.safeParse(validBase).success, true);
    assert.equal(
      createSemesterSchema.safeParse({ ...validBase, term: "2nd Semester" }).success,
      true,
    );
  });

  test("rejects unapproved terms like Midyear, Summer, or empty string", () => {
    assert.equal(createSemesterSchema.safeParse({ ...validBase, term: "Midyear" }).success, false);
    assert.equal(createSemesterSchema.safeParse({ ...validBase, term: "Summer" }).success, false);
    assert.equal(createSemesterSchema.safeParse({ ...validBase, term: "" }).success, false);
    assert.equal(createSemesterSchema.safeParse({ ...validBase, term: "Trimester" }).success, false);
    assert.equal(createSemesterSchema.safeParse({ ...validBase, term: "3rd Semester" }).success, false);
  });

  test("enforces date ordering (ends_on >= starts_on)", () => {
    // ends_on before starts_on must fail
    const invalidDates = createSemesterSchema.safeParse({
      ...validBase,
      starts_on: "2026-12-20",
      ends_on: "2026-08-15",
    });
    assert.equal(invalidDates.success, false);
    if (!invalidDates.success) {
      assert.equal(invalidDates.error.issues[0].path[0], "ends_on");
    }

    // Same day passes (ends_on == starts_on)
    assert.equal(
      createSemesterSchema.safeParse({
        ...validBase,
        starts_on: "2026-08-15",
        ends_on: "2026-08-15",
      }).success,
      true,
    );

    // ends_on after starts_on passes
    assert.equal(
      createSemesterSchema.safeParse({
        ...validBase,
        starts_on: "2026-08-15",
        ends_on: "2026-08-16",
      }).success,
      true,
    );
  });

  test("rejects invalid date formats", () => {
    assert.equal(createSemesterSchema.safeParse({ ...validBase, starts_on: "2026/08/15" }).success, false);
    assert.equal(createSemesterSchema.safeParse({ ...validBase, starts_on: "15-08-2026" }).success, false);
    assert.equal(createSemesterSchema.safeParse({ ...validBase, starts_on: "not-a-date" }).success, false);
    assert.equal(createSemesterSchema.safeParse({ ...validBase, ends_on: "2026-8-15" }).success, false);
  });

  test("enforces academic_year_start boundaries (between 1900 and 9998, integer)", () => {
    // Valid boundaries
    assert.equal(createSemesterSchema.safeParse({ ...validBase, academic_year_start: 1900 }).success, true);
    assert.equal(createSemesterSchema.safeParse({ ...validBase, academic_year_start: 9998 }).success, true);
    assert.equal(createSemesterSchema.safeParse({ ...validBase, academic_year_start: 2026 }).success, true);

    // Below min
    assert.equal(createSemesterSchema.safeParse({ ...validBase, academic_year_start: 1899 }).success, false);
    assert.equal(createSemesterSchema.safeParse({ ...validBase, academic_year_start: 0 }).success, false);
    assert.equal(createSemesterSchema.safeParse({ ...validBase, academic_year_start: -2026 }).success, false);

    // Above max
    assert.equal(createSemesterSchema.safeParse({ ...validBase, academic_year_start: 9999 }).success, false);
    assert.equal(createSemesterSchema.safeParse({ ...validBase, academic_year_start: 10000 }).success, false);

    // Non-integer
    assert.equal(createSemesterSchema.safeParse({ ...validBase, academic_year_start: 2026.5 }).success, false);
  });
});

describe("activateSemesterSchema", () => {
  test("accepts a valid UUID", () => {
    assert.equal(
      activateSemesterSchema.safeParse({ semesterId: "11111111-1111-4111-8111-111111111111" }).success,
      true,
    );
  });

  test("rejects invalid or missing UUID", () => {
    assert.equal(activateSemesterSchema.safeParse({ semesterId: "not-a-uuid" }).success, false);
    assert.equal(activateSemesterSchema.safeParse({}).success, false);
    assert.equal(activateSemesterSchema.safeParse({ semesterId: "" }).success, false);
  });
});
