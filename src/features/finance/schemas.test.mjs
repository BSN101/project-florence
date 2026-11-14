import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createDefinitionSchema,
  updateDefinitionSchema,
  archiveDefinitionSchema,
  previewFeeObligationsSchema,
  publishFeeObligationsSchema,
  createPaymentAccountSchema,
  updatePaymentAccountSchema,
  archivePaymentAccountSchema,
} from "./schemas.ts";

const validUuid = "11111111-1111-4111-8111-111111111111";

test("definition creation schema accepts valid name and positive 2-decimal amount", () => {
  const result = createDefinitionSchema.safeParse({
    name: "Late Flag Ceremony",
    amount: "50.00",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, "Late Flag Ceremony");
    assert.equal(result.data.amount, 50);
  }
});

test("definition creation schema trims leading and trailing whitespace", () => {
  const result = createDefinitionSchema.safeParse({
    name: "   Absence - General Assembly   ",
    amount: 100,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, "Absence - General Assembly");
  }
});

test("definition creation schema rejects empty or whitespace-only names", () => {
  assert.equal(createDefinitionSchema.safeParse({ name: "", amount: 50 }).success, false);
  assert.equal(createDefinitionSchema.safeParse({ name: "   ", amount: 50 }).success, false);
});

test("definition creation schema rejects zero, negative, and non-numeric amounts", () => {
  assert.equal(createDefinitionSchema.safeParse({ name: "Fine", amount: 0 }).success, false);
  assert.equal(createDefinitionSchema.safeParse({ name: "Fine", amount: -25 }).success, false);
  assert.equal(createDefinitionSchema.safeParse({ name: "Fine", amount: "not-a-number" }).success, false);
});

test("definition schemas accept cent amounts despite binary floating-point representation", () => {
  for (const amount of ["0.07", "0.29", "1.13"]) {
    const created = createDefinitionSchema.safeParse({ name: "Fine", amount });
    assert.equal(created.success, true, `Creation rejected ${amount}`);
    const updated = updateDefinitionSchema.safeParse({ id: validUuid, name: "Fine", amount });
    assert.equal(updated.success, true, `Update rejected ${amount}`);
  }
});

test("definition creation schema rejects amounts with more than two decimal places", () => {
  assert.equal(createDefinitionSchema.safeParse({ name: "Fine", amount: 50.125 }).success, false);
  assert.equal(createDefinitionSchema.safeParse({ name: "Fine", amount: "75.999" }).success, false);
  assert.equal(createDefinitionSchema.safeParse({ name: "Fine", amount: "1.005" }).success, false);
  assert.equal(updateDefinitionSchema.safeParse({ id: validUuid, name: "Fine", amount: 1.005 }).success, false);
});

test("definition update schema requires a valid UUID, name, and amount", () => {
  assert.equal(
    updateDefinitionSchema.safeParse({
      id: validUuid,
      name: "Updated Fine",
      amount: 75.5,
    }).success,
    true
  );
  assert.equal(
    updateDefinitionSchema.safeParse({
      id: "not-a-uuid",
      name: "Updated Fine",
      amount: 75.5,
    }).success,
    false
  );
  assert.equal(
    updateDefinitionSchema.safeParse({
      id: validUuid,
      name: "",
      amount: 75.5,
    }).success,
    false
  );
  assert.equal(
    updateDefinitionSchema.safeParse({
      id: validUuid,
      name: "Updated Fine",
      amount: -10,
    }).success,
    false
  );
});

test("definition archival schema requires a valid UUID", () => {
  assert.equal(archiveDefinitionSchema.safeParse({ id: validUuid }).success, true);
  assert.equal(archiveDefinitionSchema.safeParse({ id: "invalid-uuid" }).success, false);
  assert.equal(archiveDefinitionSchema.safeParse({}).success, false);
});

test("fee obligation preview schema accepts valid audience selection", () => {
  const result = previewFeeObligationsSchema.safeParse({
    feeDefinitionId: validUuid,
    semesterId: validUuid,
    yearLevels: [1, 2, 3, 4],
    academicStatuses: ["regular", "irregular"],
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.feeDefinitionId, validUuid);
    assert.equal(result.data.semesterId, validUuid);
    assert.deepEqual(result.data.yearLevels, [1, 2, 3, 4]);
    assert.deepEqual(result.data.academicStatuses, ["regular", "irregular"]);
  }
});

test("fee obligation schemas accept subset of year levels and academic statuses", () => {
  const result = previewFeeObligationsSchema.safeParse({
    feeDefinitionId: validUuid,
    semesterId: validUuid,
    yearLevels: [1, 3],
    academicStatuses: ["regular"],
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.yearLevels, [1, 3]);
    assert.deepEqual(result.data.academicStatuses, ["regular"]);
  }
});

test("fee obligation schemas reject empty or invalid year levels", () => {
  assert.equal(
    previewFeeObligationsSchema.safeParse({
      feeDefinitionId: validUuid,
      semesterId: validUuid,
      yearLevels: [],
      academicStatuses: ["regular"],
    }).success,
    false,
    "Empty year levels should be rejected"
  );

  assert.equal(
    previewFeeObligationsSchema.safeParse({
      feeDefinitionId: validUuid,
      semesterId: validUuid,
      yearLevels: [0],
      academicStatuses: ["regular"],
    }).success,
    false,
    "Year level 0 should be rejected"
  );

  assert.equal(
    previewFeeObligationsSchema.safeParse({
      feeDefinitionId: validUuid,
      semesterId: validUuid,
      yearLevels: [5],
      academicStatuses: ["regular"],
    }).success,
    false,
    "Year level 5 should be rejected"
  );

  assert.equal(
    previewFeeObligationsSchema.safeParse({
      feeDefinitionId: validUuid,
      semesterId: validUuid,
      yearLevels: [1, 1],
      academicStatuses: ["regular"],
    }).success,
    false,
    "Duplicate year levels should be rejected"
  );
});

test("fee obligation schemas reject empty, invalid, or duplicate academic statuses", () => {
  assert.equal(
    previewFeeObligationsSchema.safeParse({
      feeDefinitionId: validUuid,
      semesterId: validUuid,
      yearLevels: [1],
      academicStatuses: [],
    }).success,
    false,
    "Empty academic statuses should be rejected"
  );

  assert.equal(
    previewFeeObligationsSchema.safeParse({
      feeDefinitionId: validUuid,
      semesterId: validUuid,
      yearLevels: [1],
      academicStatuses: ["invalid_status"],
    }).success,
    false,
    "Invalid academic status should be rejected"
  );

  assert.equal(
    previewFeeObligationsSchema.safeParse({
      feeDefinitionId: validUuid,
      semesterId: validUuid,
      yearLevels: [1],
      academicStatuses: ["regular", "regular"],
    }).success,
    false,
    "Duplicate academic statuses should be rejected"
  );
});

test("fee obligation schemas require valid UUIDs for fee definition and semester", () => {
  assert.equal(
    previewFeeObligationsSchema.safeParse({
      feeDefinitionId: "invalid",
      semesterId: validUuid,
      yearLevels: [1],
      academicStatuses: ["regular"],
    }).success,
    false
  );

  assert.equal(
    previewFeeObligationsSchema.safeParse({
      feeDefinitionId: validUuid,
      semesterId: "invalid",
      yearLevels: [1],
      academicStatuses: ["regular"],
    }).success,
    false
  );
});

test("publish fee obligations schema accepts optional valid requestKey and rejects invalid requestKey", () => {
  const withoutKey = publishFeeObligationsSchema.safeParse({
    feeDefinitionId: validUuid,
    semesterId: validUuid,
    yearLevels: [1, 2],
    academicStatuses: ["regular"],
  });
  assert.equal(withoutKey.success, true);

  const withKey = publishFeeObligationsSchema.safeParse({
    feeDefinitionId: validUuid,
    semesterId: validUuid,
    yearLevels: [1, 2],
    academicStatuses: ["regular"],
    requestKey: validUuid,
  });
  assert.equal(withKey.success, true);
  if (withKey.success) {
    assert.equal(withKey.data.requestKey, validUuid);
  }

  const withBadKey = publishFeeObligationsSchema.safeParse({
    feeDefinitionId: validUuid,
    semesterId: validUuid,
    yearLevels: [1, 2],
    academicStatuses: ["regular"],
    requestKey: "not-a-uuid",
  });
  assert.equal(withBadKey.success, false);
});

test("payment account creation schema accepts valid attributes and trims inputs", () => {
  const result = createPaymentAccountSchema.safeParse({
    label: "  GCash - Council Treasury  ",
    accountName: "  Florence Nightingale  ",
    accountReference: "  0917-123-4567  ",
    qrFileId: validUuid,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.label, "GCash - Council Treasury");
    assert.equal(result.data.accountName, "Florence Nightingale");
    assert.equal(result.data.accountReference, "0917-123-4567");
    assert.equal(result.data.qrFileId, validUuid);
  }
});

test("payment account creation schema treats an empty qrFileId as null", () => {
  const result = createPaymentAccountSchema.safeParse({
    label: "Landbank",
    accountName: "Nursing Student Council",
    accountReference: "1234-5678-90",
    qrFileId: "",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.qrFileId, null);
  }
});

test("payment account creation schema rejects empty or whitespace-only required fields", () => {
  assert.equal(
    createPaymentAccountSchema.safeParse({
      label: "",
      accountName: "Florence",
      accountReference: "09171234567",
    }).success,
    false
  );
  assert.equal(
    createPaymentAccountSchema.safeParse({
      label: "GCash",
      accountName: "   ",
      accountReference: "09171234567",
    }).success,
    false
  );
  assert.equal(
    createPaymentAccountSchema.safeParse({
      label: "GCash",
      accountName: "Florence",
      accountReference: "   ",
    }).success,
    false
  );
});

test("payment account update schema requires valid UUID and attributes", () => {
  const valid = updatePaymentAccountSchema.safeParse({
    id: validUuid,
    label: "BPI",
    accountName: "Treasury",
    accountReference: "9876-5432-10",
  });
  assert.equal(valid.success, true);

  const invalidId = updatePaymentAccountSchema.safeParse({
    id: "not-a-uuid",
    label: "BPI",
    accountName: "Treasury",
    accountReference: "9876-5432-10",
  });
  assert.equal(invalidId.success, false);
});

test("payment account archival schema requires valid UUID", () => {
  assert.equal(archivePaymentAccountSchema.safeParse({ id: validUuid }).success, true);
  assert.equal(archivePaymentAccountSchema.safeParse({ id: "invalid" }).success, false);
});


test("payment account number needs at least 10 digits, ignoring separators", () => {
  const parse = (accountReference) =>
    createPaymentAccountSchema.safeParse({ label: "GCash", accountName: "Treasury", accountReference }).success;
  assert.equal(parse("09171234567"), true);
  assert.equal(parse("0917-123-4567"), true);
  assert.equal(parse("1234567890"), true);
  assert.equal(parse("123456789"), false);
  assert.equal(parse("0917-123-45"), false);
  assert.equal(parse("ABCDEFGHIJK"), false);
});
