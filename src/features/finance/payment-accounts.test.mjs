import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isAuthorizedPaymentAccountManager } from "./contracts.ts";
import {
  createPaymentAccountSchema,
  updatePaymentAccountSchema,
  archivePaymentAccountSchema,
} from "./schemas.ts";

const validUuid = "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d";

describe("Task T-032 / FL-047: Payment Account Management Rules", () => {
  describe("Role-based access authorization", () => {
    test("Council Executive is authorized to manage payment accounts", () => {
      assert.equal(isAuthorizedPaymentAccountManager("executive"), true);
    });

    test("Council Operations is denied authorization to manage payment accounts", () => {
      assert.equal(isAuthorizedPaymentAccountManager("operations"), false);
    });

    test("Council Representative is denied authorization to manage payment accounts", () => {
      assert.equal(isAuthorizedPaymentAccountManager("representative"), false);
    });

    test("Unauthenticated, student, or unassigned roles are denied authorization", () => {
      assert.equal(isAuthorizedPaymentAccountManager(null), false);
      assert.equal(isAuthorizedPaymentAccountManager(undefined), false);
      assert.equal(isAuthorizedPaymentAccountManager("student"), false);
      assert.equal(isAuthorizedPaymentAccountManager("faculty"), false);
    });
  });

  describe("Validation schema boundaries", () => {
    test("create schema enforces max length limits (100 for strings, 1000 for instructions)", () => {
      const over100 = "a".repeat(101);
      const over1000 = "a".repeat(1001);

      assert.equal(
        createPaymentAccountSchema.safeParse({
          label: over100,
          accountName: "Florence",
          accountReference: "1234",
        }).success,
        false
      );

      assert.equal(
        createPaymentAccountSchema.safeParse({
          label: "GCash",
          accountName: over100,
          accountReference: "1234",
        }).success,
        false
      );

      assert.equal(
        createPaymentAccountSchema.safeParse({
          label: "GCash",
          accountName: "Florence",
          accountReference: over100,
        }).success,
        false
      );

      assert.equal(
        createPaymentAccountSchema.safeParse({
          label: "GCash",
          accountName: "Florence",
          accountReference: "1234",
          instructions: over1000,
        }).success,
        false
      );

      // Boundary values (exact max) succeed
      const exact100 = "a".repeat(100);
      const exact1000 = "a".repeat(1000);
      const boundary = createPaymentAccountSchema.safeParse({
        label: exact100,
        accountName: exact100,
        accountReference: exact100,
        instructions: exact1000,
      });
      assert.equal(boundary.success, true);
    });

    test("update schema enforces valid UUID identifier and non-empty fields", () => {
      assert.equal(
        updatePaymentAccountSchema.safeParse({
          id: "not-a-uuid",
          label: "GCash",
          accountName: "Treasury",
          accountReference: "0917-000-0000",
        }).success,
        false
      );

      assert.equal(
        updatePaymentAccountSchema.safeParse({
          id: validUuid,
          label: "   ",
          accountName: "Treasury",
          accountReference: "0917-000-0000",
        }).success,
        false
      );

      assert.equal(
        updatePaymentAccountSchema.safeParse({
          id: validUuid,
          label: "GCash",
          accountName: "",
          accountReference: "0917-000-0000",
        }).success,
        false
      );

      assert.equal(
        updatePaymentAccountSchema.safeParse({
          id: validUuid,
          label: "GCash",
          accountName: "Treasury",
          accountReference: "   ",
        }).success,
        false
      );
    });

    test("archive schema strictly requires a valid UUID", () => {
      assert.equal(
        archivePaymentAccountSchema.safeParse({ id: validUuid }).success,
        true
      );
      assert.equal(
        archivePaymentAccountSchema.safeParse({ id: "invalid-id" }).success,
        false
      );
      assert.equal(
        archivePaymentAccountSchema.safeParse({ id: "" }).success,
        false
      );
    });
  });
});
