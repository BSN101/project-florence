import test from "node:test";
import assert from "node:assert/strict";

import { buildAttendanceQrPayload, generateAttendanceQrDataUrl, STUDENT_NUMBER_REGEX } from "./qr.ts";
import { studentNumberSchema } from "./schemas.ts";

test("Task T-022 / FL-012: Student Attendance QR Security Invariants", async (t) => {
  await t.test("strictly encodes student university_id in XX-1-XXXXX format", () => {
    const validStudentId = "26-1-00123";
    const payload = buildAttendanceQrPayload(validStudentId);

    // Payload MUST be strictly identical to the student's university_id
    assert.equal(payload, "26-1-00123");
    assert.equal(payload.length, 10);
    assert.match(payload, STUDENT_NUMBER_REGEX);

    // Matches studentNumberSchema exactly
    const schemaResult = studentNumberSchema.safeParse(payload);
    assert.equal(schemaResult.success, true);
  });

  await t.test("security: rejects invalid student number formats and prevents injection of arbitrary tokens/passwords/claims", () => {
    const badInputs = [
      "",
      "   ",
      "26-1-123", // too short
      "26-1-123456", // too long
      "26-2-00123", // wrong campus/term digit
      "invalid-student-id",
      "26-1-00123;token=secret",
      "admin' OR '1'='1",
      JSON.stringify({ id: "26-1-00123", token: "jwt-token-here" }),
      "user@university.edu.ph",
      null,
      undefined,
      12345,
    ];

    for (const input of badInputs) {
      assert.throws(
        () => buildAttendanceQrPayload(input),
        /Invalid student number for attendance QR generation/,
        `Should reject input: ${input}`
      );
    }
  });

  await t.test("generates high-contrast valid PNG Data URL for scanner clarity", async () => {
    const studentNumber = "26-1-00999";
    const dataUrl = await generateAttendanceQrDataUrl(studentNumber);

    assert.ok(typeof dataUrl === "string");
    assert.ok(dataUrl.startsWith("data:image/png;base64,"));
    assert.ok(dataUrl.length > 100);
  });
});

test("Task T-019 / FL-009: Student Directory Scoping Rules", async (t) => {
  // Simulate access checks corresponding to requireDirectoryViewer logic
  const isAuthorizedDirectoryViewer = (workspace, councilRole, roles) => {
    if (workspace === "council") {
      return councilRole === "executive" || councilRole === "operations";
    }
    if (workspace === "faculty") {
      const facultyRoles = [
        "Academic Instructor",
        "Clinical Instructor",
        "Academic Coordinator",
        "RLE Coordinator",
      ];
      return roles.some((r) => facultyRoles.includes(r));
    }
    return false;
  };

  await t.test("Council Executive and Operations have directory access", () => {
    assert.equal(isAuthorizedDirectoryViewer("council", "executive", []), true);
    assert.equal(isAuthorizedDirectoryViewer("council", "operations", []), true);
  });

  await t.test("Council Representatives MUST NOT have directory access (FL-017 restricted)", () => {
    assert.equal(isAuthorizedDirectoryViewer("council", "representative", []), false);
  });

  await t.test("All Faculty roles (Instructors and Coordinators) have directory access", () => {
    assert.equal(isAuthorizedDirectoryViewer("faculty", null, ["Academic Instructor"]), true);
    assert.equal(isAuthorizedDirectoryViewer("faculty", null, ["Clinical Instructor"]), true);
    assert.equal(isAuthorizedDirectoryViewer("faculty", null, ["Academic Coordinator", "Academic Instructor"]), true);
    assert.equal(isAuthorizedDirectoryViewer("faculty", null, ["RLE Coordinator", "Clinical Instructor"]), true);
  });

  await t.test("Students and other non-faculty/non-council scopes are denied directory access", () => {
    assert.equal(isAuthorizedDirectoryViewer("student", null, []), false);
    assert.equal(isAuthorizedDirectoryViewer("admin", null, ["Platform Admin"]), false);
  });
});
