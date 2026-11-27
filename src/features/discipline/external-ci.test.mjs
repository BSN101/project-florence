import assert from "node:assert/strict";
import test from "node:test";

import {
  awardExternalCiMeritsSchema,
  logExternalCiDemeritsSchema,
} from "./schemas.ts";

const KEY_1 = "11111111-1111-4111-8111-111111111111";
const KEY_2 = "44444444-4444-4444-8444-444444444444";
const STUDENT_1 = "22222222-2222-4222-8222-222222222222";
const STUDENT_2 = "33333333-3333-4333-8333-333333333333";
const MISCONDUCT_ID = "55555555-5555-4555-8555-555555555555";

const validMerit = {
  recipients: [
    { studentId: STUDENT_1, requestKey: KEY_1 },
    { studentId: STUDENT_2, requestKey: KEY_2 },
  ],
  externalSource: "CI Maria Santos, RN",
  days: 2,
  awardedOn: "2026-11-16",
  description: "Assisted during emergency ward admission.",
};

const validDemerit = {
  recipients: [
    { studentId: STUDENT_1, requestKey: KEY_1 },
    { studentId: STUDENT_2, requestKey: KEY_2 },
  ],
  externalSource: "CI Maria Santos, RN",
  days: 1,
  misconductId: MISCONDUCT_ID,
  isOther: false,
  incidentOn: "2026-11-16",
  notes: "",
};

const parseMerit = (patch = {}) =>
  awardExternalCiMeritsSchema.safeParse({ ...validMerit, ...patch });

const parseDemerit = (patch = {}) =>
  logExternalCiDemeritsSchema.safeParse({ ...validDemerit, ...patch });

// --- External CI source attribution (exercised through both schemas) ---

test("External CI schemas trim externalSource and enforce 2 to 120 characters", () => {
  for (const parse of [parseMerit, parseDemerit]) {
    const trimmed = parse({ externalSource: "  Dr. Li  " });
    assert.equal(trimmed.success && trimmed.data.externalSource, "Dr. Li");

    const min = parse({ externalSource: "Li" });
    assert.equal(min.success && min.data.externalSource, "Li");

    const maxStr = "x".repeat(120);
    const max = parse({ externalSource: `  ${maxStr}  ` });
    assert.equal(max.success && max.data.externalSource, maxStr);

    for (const bad of ["", "   ", "a", "  a  ", "x".repeat(121)]) {
      assert.equal(parse({ externalSource: bad }).success, false, `externalSource=${bad}`);
    }
  }
});

// --- awardExternalCiMeritsSchema ---------------------------------------

test("awardExternalCiMeritsSchema accepts valid awards and coerces whole days", () => {
  assert.equal(parseMerit().success, true);
  const coerced = parseMerit({ days: "4" });
  assert.equal(coerced.success && coerced.data.days, 4);
  assert.equal(parseMerit({ days: 30 }).success, true);
});

test("awardExternalCiMeritsSchema rejects non-whole or non-positive days", () => {
  for (const days of [0, -1, 1.5, "", "abc"]) {
    assert.equal(parseMerit({ days }).success, false, `days=${days}`);
  }
});

test("awardExternalCiMeritsSchema rejects empty, duplicate, or malformed recipients", () => {
  assert.equal(parseMerit({ recipients: [] }).success, false);
  assert.equal(
    parseMerit({
      recipients: [
        { studentId: STUDENT_1, requestKey: KEY_1 },
        { studentId: STUDENT_1, requestKey: KEY_2 },
      ],
    }).success,
    false
  );
  assert.equal(
    parseMerit({ recipients: [{ studentId: "bad-id", requestKey: KEY_1 }] }).success,
    false
  );
  assert.equal(
    parseMerit({ recipients: [{ studentId: STUDENT_1, requestKey: "bad-key" }] }).success,
    false
  );
});

test("awardExternalCiMeritsSchema validates award date and trims reason bounds", () => {
  for (const awardedOn of ["16-11-2026", "not-a-date", "2026-02-30"]) {
    assert.equal(parseMerit({ awardedOn }).success, false, awardedOn);
  }
  assert.equal(parseMerit({ description: "   " }).success, false);
  assert.equal(parseMerit({ description: "ab" }).success, false);
  assert.equal(parseMerit({ description: "x".repeat(501) }).success, false);

  const ok = parseMerit({ description: "  Completed extra clinical shift  " });
  assert.equal(ok.success && ok.data.description, "Completed extra clinical shift");
});

// --- logExternalCiDemeritsSchema ---------------------------------------

test("logExternalCiDemeritsSchema normalizes blank or whitespace optional notes to null", () => {
  for (const notes of [undefined, null, "", "   \n\t  "]) {
    const res = parseDemerit({ isOther: false, notes });
    assert.equal(res.success, true, `notes=${String(notes)}`);
    assert.equal(res.data.notes, null);
  }

  const withNote = parseDemerit({ isOther: false, notes: "  Ward 3B pre-conference  " });
  assert.equal(withNote.success && withNote.data.notes, "Ward 3B pre-conference");

  assert.equal(parseDemerit({ isOther: false, notes: "x".repeat(501) }).success, false);
});

test("logExternalCiDemeritsSchema requires 3 to 500 trimmed characters when isOther is true", () => {
  for (const notes of [undefined, null, "", "   ", "ab", "  ab  ", "x".repeat(501)]) {
    const res = parseDemerit({ isOther: true, notes });
    assert.equal(res.success, false, `isOther notes=${String(notes)}`);
  }

  const ok = parseDemerit({
    isOther: true,
    notes: "  Unannounced departure from pediatric ward  ",
  });
  assert.equal(
    ok.success && ok.data.notes,
    "Unannounced departure from pediatric ward"
  );
});

test("logExternalCiDemeritsSchema validates misconduct, days, incident date, recipients, and strips bucket", () => {
  assert.equal(parseDemerit({ misconductId: "not-a-uuid" }).success, false);
  for (const days of [0, -2, 2.5, "", "abc"]) {
    assert.equal(parseDemerit({ days }).success, false, `days=${days}`);
  }
  for (const incidentOn of ["16-11-2026", "invalid", "2026-02-29"]) {
    assert.equal(parseDemerit({ incidentOn }).success, false, incidentOn);
  }
  assert.equal(parseDemerit({ recipients: [] }).success, false);
  assert.equal(
    parseDemerit({
      recipients: [
        { studentId: STUDENT_1, requestKey: KEY_1 },
        { studentId: STUDENT_1, requestKey: KEY_2 },
      ],
    }).success,
    false
  );

  // Bucket is hardcoded to RLE on the server; client-supplied bucket fields are stripped.
  const stripped = parseDemerit({ bucket: "office" });
  assert.equal(stripped.success, true);
  assert.equal("bucket" in stripped.data, false);
});
