import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  isAuthorizedPaymentAccountManager,
  sanitizePaymentAccountError,
} from "./contracts.ts";
import {
  createPaymentAccountSchema,
  updatePaymentAccountSchema,
  archivePaymentAccountSchema,
  paymentAccountQrFileIdSchema,
  PAYMENT_ACCOUNT_QR_MAX_BYTES,
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

    test("QR file ID schema and size constant enforce expected boundaries", () => {
      assert.equal(PAYMENT_ACCOUNT_QR_MAX_BYTES, 2 * 1024 * 1024);
      assert.equal(paymentAccountQrFileIdSchema.safeParse(validUuid).success, true);
      assert.equal(paymentAccountQrFileIdSchema.safeParse("not-a-uuid").success, false);
      assert.equal(paymentAccountQrFileIdSchema.safeParse("").success, false);
    });
  });

  describe("Defensive error sanitization", () => {
    test("sanitizes 42501 permission denied without leaking internal role details", () => {
      const sanitized = sanitizePaymentAccountError({ code: "42501", message: "permission denied for table payment_accounts" });
      assert.equal(sanitized, "You do not have permission to modify payment accounts.");
      assert.equal(sanitized.includes("payment_accounts"), false);
    });

    test("sanitizes 23503 foreign key constraint errors", () => {
      const sanitized = sanitizePaymentAccountError({
        code: "23503",
        message: 'update or delete on table "payment_accounts" violates foreign key constraint "payments_payment_account_id_fkey"',
      });
      assert.equal(
        sanitized,
        "This operation is restricted because the account is referenced by existing payment records."
      );
      assert.equal(sanitized.includes("payments_payment_account_id_fkey"), false);
    });

    test("sanitizes database trigger guard messages safely", () => {
      const qrGuard = sanitizePaymentAccountError({
        code: "P0001",
        message: "Invalid payment destination QR purpose",
      });
      assert.equal(
        qrGuard,
        "The attached QR code is invalid or not registered for payment accounts."
      );

      const snapshotGuard = sanitizePaymentAccountError({
        code: "P0001",
        message: "Active destination snapshot required",
      });
      assert.equal(
        snapshotGuard,
        "An active payment account snapshot is required for this operation."
      );
    });

    test("falls back to user-safe message on unexpected errors without exposing stack trace", () => {
      const fallback = "Failed to update payment account.";
      const sanitized = sanitizePaymentAccountError(
        new Error("Fatal connection timeout to pgpool on port 5432"),
        fallback
      );
      assert.equal(sanitized, fallback);
      assert.equal(sanitized.includes("pgpool"), false);
      assert.equal(sanitized.includes("5432"), false);
    });
  });
});
