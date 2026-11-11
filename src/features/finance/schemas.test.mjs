import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createFineDefinitionSchema,
  updateFineDefinitionSchema,
  archiveFineDefinitionSchema,
} from "./schemas.ts";

const validUuid = "11111111-1111-4111-8111-111111111111";

test("fine creation schema accepts valid name and positive 2-decimal amount", () => {
  const result = createFineDefinitionSchema.safeParse({
    name: "Late Flag Ceremony",
    amount: "50.00",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, "Late Flag Ceremony");
    assert.equal(result.data.amount, 50);
  }
});

test("fine creation schema trims leading and trailing whitespace", () => {
  const result = createFineDefinitionSchema.safeParse({
    name: "   Absence - General Assembly   ",
    amount: 100,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, "Absence - General Assembly");
  }
});

test("fine creation schema rejects empty or whitespace-only names", () => {
  assert.equal(createFineDefinitionSchema.safeParse({ name: "", amount: 50 }).success, false);
  assert.equal(createFineDefinitionSchema.safeParse({ name: "   ", amount: 50 }).success, false);
});

test("fine creation schema rejects zero, negative, and non-numeric amounts", () => {
  assert.equal(createFineDefinitionSchema.safeParse({ name: "Fine", amount: 0 }).success, false);
  assert.equal(createFineDefinitionSchema.safeParse({ name: "Fine", amount: -25 }).success, false);
  assert.equal(createFineDefinitionSchema.safeParse({ name: "Fine", amount: "not-a-number" }).success, false);
});

test("fine creation schema rejects amounts with more than two decimal places", () => {
  assert.equal(createFineDefinitionSchema.safeParse({ name: "Fine", amount: 50.125 }).success, false);
  assert.equal(createFineDefinitionSchema.safeParse({ name: "Fine", amount: "75.999" }).success, false);
});

test("fine update schema requires a valid UUID, name, and amount", () => {
  assert.equal(
    updateFineDefinitionSchema.safeParse({
      id: validUuid,
      name: "Updated Fine",
      amount: 75.5,
    }).success,
    true
  );
  assert.equal(
    updateFineDefinitionSchema.safeParse({
      id: "not-a-uuid",
      name: "Updated Fine",
      amount: 75.5,
    }).success,
    false
  );
  assert.equal(
    updateFineDefinitionSchema.safeParse({
      id: validUuid,
      name: "",
      amount: 75.5,
    }).success,
    false
  );
  assert.equal(
    updateFineDefinitionSchema.safeParse({
      id: validUuid,
      name: "Updated Fine",
      amount: -10,
    }).success,
    false
  );
});

test("fine archival schema requires a valid UUID", () => {
  assert.equal(archiveFineDefinitionSchema.safeParse({ id: validUuid }).success, true);
  assert.equal(archiveFineDefinitionSchema.safeParse({ id: "invalid-uuid" }).success, false);
  assert.equal(archiveFineDefinitionSchema.safeParse({}).success, false);
});

