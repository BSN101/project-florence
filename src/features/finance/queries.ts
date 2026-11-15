import "server-only";

import type { SemesterOption } from "@/features/access/access-policy";
import type { StudentRosterItem } from "@/features/students/contracts";
import { getRoster } from "@/features/students/queries";
import { displayName } from "@/lib/format-name";
import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createUserClient } from "@/server/db/user-client";
import {
  calculateObligationsStanding,
  calculateStudentFinancialSummary,
  mapPaymentHistory,
  scopeFinancialRecordsForSemester,
} from "./calculations";
import {
  type FeeDefinitionCatalogItem,
  type FeeDefinitionDTO,
  type FeePublicationDTO,
  type FeePublicationPreview,
  type FineDefinitionCatalogItem,
  type FineDefinitionDTO,
  type PaymentAccountDTO,
  type StudentFinancialAccountData,
  isAuthorizedCouncilFinancialViewer,
  isAuthorizedPaymentAccountManager,
} from "./contracts";
import {
  councilStudentFinancialQuerySchema,
  previewFeeObligationsSchema,
  type CouncilStudentFinancialQueryInput,
  type PreviewFeeObligationsInput,
} from "./schemas";

/**
 * Enforce that the caller is an authenticated Council member with Executive or Operations authority.
 * Council Representatives, Students, and Faculty are strictly forbidden.
 */
export async function assertAuthorizedCouncilManager() {
  const context = await requireWorkspace("council");
  if (!isAuthorizedCouncilFinancialViewer(context.councilRole)) {
    throw new AccessDeniedError("forbidden");
  }
  return context;
}

/**
 * Enforce that the caller is an authenticated Council Executive (FL-047 / T-032).
 * Council Operations, Representatives, Students, and Faculty are strictly forbidden.
 * Operations may read historical snapshots through payments, but cannot manage payment accounts.
 */
export async function assertAuthorizedCouncilExecutive() {
  const context = await requireWorkspace("council");
  if (!isAuthorizedPaymentAccountManager(context.councilRole)) {
    throw new AccessDeniedError("forbidden");
  }
  return context;
}

/**
 * Fetch active fee definitions for future fee publication (T-031).
 * Automatically filtered by database RLS so only authorized Council users receive records.
 */
export async function getActiveFeeDefinitions(): Promise<FeeDefinitionDTO[]> {
  const client = await createUserClient();
  const { data, error } = await client
    .from("fee_definitions")
    .select("id, name, amount, archived_at, created_by, created_at, updated_at")
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch active fee definitions: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Fetch fee definitions with creator names for the Council catalog dashboard.
 * Archived definitions are included only when requested.
 */
export async function getFeeDefinitions(options?: {
  includeArchived?: boolean;
}): Promise<FeeDefinitionCatalogItem[]> {
  const client = await createUserClient();
  const { data, error } = await client.rpc("florence_fee_definitions");
  if (error) {
    throw new Error(`Failed to fetch fee definitions: ${error.message}`);
  }

  // Generated RPC types mark archived_at as non-null; the column is nullable.
  const definitions = (data ?? []) as unknown as FeeDefinitionCatalogItem[];
  return options?.includeArchived ? definitions : definitions.filter((fee) => fee.archived_at === null);
}

/**
 * Fetch active fine definitions for display and future event consequence configuration.
 * Automatically filtered by database RLS so only authorized Council users receive records.
 */
export async function getActiveFineDefinitions(): Promise<FineDefinitionDTO[]> {
  const client = await createUserClient();
  const { data, error } = await client
    .from("fine_definitions")
    .select("id, name, amount, archived_at, created_by, created_at, updated_at")
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch active fine definitions: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Fetch fine definitions with optional archival filtering for the Council catalog dashboard.
 */
export async function getFineDefinitions(options?: {
  includeArchived?: boolean;
}): Promise<FineDefinitionCatalogItem[]> {
  const client = await createUserClient();
  // Regenerate database.types.ts after the catalog migration is applied.
  const { data, error } = await client.rpc("florence_fine_definitions" as never);
  if (error) {
    throw new Error(`Failed to fetch fine definitions: ${error.message}`);
  }

  const definitions = (data ?? []) as FineDefinitionCatalogItem[];
  return options?.includeArchived ? definitions : definitions.filter((fine) => fine.archived_at === null);
}

/** Reads every page so the API row cap cannot silently truncate preview counts. */
async function allStudentIds(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: { student_id: string }[] | null; error: { message: string } | null }>
): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(`Failed to load fee audience: ${error.message}`);
    if (!data?.length) return ids;
    ids.push(...data.map((row) => row.student_id));
    from += data.length;
  }
}

/**
 * Preview audience size, existing obligations, and projected totals before publishing fee obligations.
 * Restricted to Council Executive and Operations.
 */
export async function previewFeeObligations(
  input: PreviewFeeObligationsInput
): Promise<FeePublicationPreview> {
  await assertAuthorizedCouncilManager();
  const parsed = previewFeeObligationsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid audience preview input");
  }

  const client = await createUserClient();

  const { data: feeDef, error: feeError } = await client
    .from("fee_definitions")
    .select("id, name, amount, archived_at")
    .eq("id", parsed.data.feeDefinitionId)
    .is("archived_at", null)
    .maybeSingle();

  if (feeError || !feeDef) {
    throw new Error("Active fee definition required");
  }

  const { semesterId, feeDefinitionId, yearLevels, academicStatuses } = parsed.data;
  const matchingStudentIds = await allStudentIds((from, to) =>
    client
      .from("enrollments")
      .select("student_id")
      .eq("semester_id", semesterId)
      .in("year_level", yearLevels)
      .in("academic_status", academicStatuses)
      .order("student_id")
      .range(from, to)
  );
  if (matchingStudentIds.length === 0) {
    return {
      totalMatchingStudents: 0,
      alreadyObligatedCount: 0,
      newObligationsCount: 0,
      unitAmount: Number(feeDef.amount),
      totalNewAmount: 0,
    };
  }

  // Filter by fee and semester only; listing every student ID in the URL breaks on large audiences.
  const chargedStudentIds = new Set(
    await allStudentIds((from, to) =>
      client
        .from("obligations")
        .select("student_id")
        .eq("kind", "fee")
        .eq("fee_definition_id", feeDefinitionId)
        .eq("semester_id", semesterId)
        .order("student_id")
        .range(from, to)
    )
  );
  const alreadyObligatedCount = matchingStudentIds.filter((id) => chargedStudentIds.has(id)).length;
  const totalMatchingStudents = matchingStudentIds.length;
  const newObligationsCount = Math.max(0, totalMatchingStudents - alreadyObligatedCount);
  const unitAmount = Number(feeDef.amount);
  const totalNewAmount = Number((newObligationsCount * unitAmount).toFixed(2));

  return {
    totalMatchingStudents,
    alreadyObligatedCount,
    newObligationsCount,
    unitAmount,
    totalNewAmount,
  };
}

/**
 * Fetch historical fee publications for audit and display.
 * Restricted to Council Executive and Operations.
 */
export async function getFeePublications(
  semesterId?: string
): Promise<FeePublicationDTO[]> {
  await assertAuthorizedCouncilManager();
  const client = await createUserClient();

  let query = client
    .from("fee_publications")
    .select(
      "id, fee_definition_id, semester_id, year_levels, academic_statuses, description, amount, published_by, published_at"
    )
    .order("published_at", { ascending: false });

  if (semesterId) {
    query = query.eq("semester_id", semesterId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch fee publications: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Fetch payment accounts for Council Executive administration (FL-047 / T-032).
 * Strictly restricted to Council Executives.
 * Uses the request-scoped user client and explicit permitted projection.
 */
export async function getPaymentAccounts(options?: {
  includeArchived?: boolean;
}): Promise<PaymentAccountDTO[]> {
  await assertAuthorizedCouncilExecutive();
  const client = await createUserClient();

  let query = client
    .from("payment_accounts")
    .select("id, label, account_name, account_reference, qr_file_id, archived_at")
    .order("label", { ascending: true });

  if (!options?.includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch payment accounts: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Shared underlying query pipeline for student financial accounts.
 * Executes within the user's RLS context, joining obligations, payments, and refunds,
 * and running pure financial calculations for consistent cross-role figures.
 */
async function fetchStudentFinancialAccountData({
  client,
  studentId,
  studentInfo,
  semesters,
  requestedSemesterId,
}: {
  client: Awaited<ReturnType<typeof createUserClient>>;
  studentId: string;
  studentInfo: {
    id: string;
    universityId: string | null;
    fullName: string;
  };
  semesters: SemesterOption[];
  requestedSemesterId?: string | null;
}): Promise<StudentFinancialAccountData> {
  const currentSemester = semesters.find((s) => s.is_current) ?? semesters[0];
  const targetSemesterId =
    requestedSemesterId !== undefined
      ? requestedSemesterId
      : currentSemester?.id ?? null;

  const [obligationsRes, paymentItemsRes, paymentsRes] = await Promise.all([
    client
      .from("obligations")
      .select(
        "id, student_id, semester_id, kind, fee_definition_id, fee_publication_id, consequence_outcome, event_attendance_id, description, amount, waived_at, waived_by, waiver_reason, created_at"
      )
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    client
      .from("payment_items")
      .select("payment_id, obligation_id")
      .eq("student_id", studentId),
    client
      .from("payments")
      .select(
        "id, student_id, semester_id, method, status, record_status, receipt_id, is_receipt_record, destination_label, destination_account_name, destination_account_reference, reference_number, amount, submitted_at, decided_at, decision_reason"
      )
      .eq("student_id", studentId)
      .order("submitted_at", { ascending: false }),
  ]);

  if (obligationsRes.error) {
    throw new Error("Unable to load student obligations.");
  }
  if (paymentItemsRes.error) {
    throw new Error("Unable to load payment allocations.");
  }
  if (paymentsRes.error) {
    throw new Error("Unable to load payment history.");
  }

  const rawPayments = paymentsRes.data ?? [];
  const receiptIds = Array.from(
    new Set(
      rawPayments
        .map((p) => p.receipt_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );

  let rawRefunds: Array<{
    id: string;
    receipt_id: string;
    payment_id: string;
    amount: number;
    reason: string;
    refunded_at: string;
  }> = [];

  if (receiptIds.length > 0) {
    const { data: refundsData, error: refundError } = await client
      .from("payment_refunds")
      .select("id, receipt_id, payment_id, amount, reason, refunded_at")
      .in("receipt_id", receiptIds);

    if (refundError) {
      throw new Error("Unable to load payment refunds.");
    }
    rawRefunds = refundsData ?? [];
  }

  const semesterCodeMap = new Map<string, string>();
  for (const s of semesters) {
    semesterCodeMap.set(s.id, `${s.academic_year_start} · ${s.term}`);
  }

  const targetSemester = targetSemesterId
    ? semesters.find((s) => s.id === targetSemesterId)
    : undefined;
  const priorSemesterIds = new Set(
    targetSemester
      ? semesters
          .filter((s) => s.id !== targetSemester.id && s.starts_on < targetSemester.starts_on)
          .map((s) => s.id)
      : semesters.filter((s) => s.id !== targetSemesterId).map((s) => s.id)
  );

  const rawObligations = obligationsRes.data ?? [];
  const rawPaymentItems = paymentItemsRes.data ?? [];

  const allObligationsWithStanding = calculateObligationsStanding({
    obligations: rawObligations,
    paymentItems: rawPaymentItems,
    payments: rawPayments,
    refunds: rawRefunds,
    targetSemesterId,
    priorSemesterIds,
    semesterCodeMap,
  });

  const allPayments = mapPaymentHistory({
    payments: rawPayments,
    refunds: rawRefunds,
    semesterCodeMap,
  });

  const scoped = scopeFinancialRecordsForSemester({
    obligationsWithStanding: allObligationsWithStanding,
    payments: allPayments,
    targetSemesterId,
    priorSemesterIds,
  });

  const summary = calculateStudentFinancialSummary({
    obligationsWithStanding: scoped.obligations,
    targetSemesterId,
  });

  return {
    student: studentInfo,
    obligations: scoped.obligations,
    summary,
    payments: scoped.payments,
  };
}

/**
 * Fetch financial obligations, standing, and payment history for the signed-in student (FL-022 / T-033).
 * Strictly restricted to the Student workspace; RLS ensures students read only their own rows.
 */
export async function getStudentFinancialAccount(params?: {
  semesterId?: string | null;
}): Promise<StudentFinancialAccountData> {
  const context = await requireWorkspace("student");

  const studentInfo = {
    id: context.profile.id,
    universityId: context.profile.university_id,
    fullName: displayName(context.profile),
  };

  const client = await createUserClient();
  return fetchStudentFinancialAccountData({
    client,
    studentId: context.profile.id,
    studentInfo,
    semesters: context.semesters,
    requestedSemesterId: params?.semesterId,
  });
}

/**
 * Fetch financial obligations, standing, and payment history for a specific student (FL-022 / T-033).
 * Strictly restricted to Council Executive and Council Operations.
 * Resolves student identity via the authorized florence_roster RPC in parallel with financial records.
 */
export async function getCouncilStudentFinancialAccount(
  input: CouncilStudentFinancialQueryInput,
  rosterPromise?: Promise<StudentRosterItem[]>
): Promise<StudentFinancialAccountData> {
  const context = await assertAuthorizedCouncilManager();
  const parsed = councilStudentFinancialQuerySchema.parse(input);

  const currentSemester =
    context.semesters.find((s) => s.is_current) ?? context.semesters[0];
  const targetSemesterId =
    parsed.semesterId !== undefined && parsed.semesterId !== null
      ? parsed.semesterId
      : currentSemester?.id ?? null;

  const client = await createUserClient();
  const initialRosterPromise =
    rosterPromise ??
    (targetSemesterId ? getRoster(targetSemesterId) : Promise.resolve([]));

  const [roster, accountData] = await Promise.all([
    initialRosterPromise,
    fetchStudentFinancialAccountData({
      client,
      studentId: parsed.studentId,
      studentInfo: {
        id: parsed.studentId,
        universityId: null,
        fullName: "",
      },
      semesters: context.semesters,
      requestedSemesterId: targetSemesterId,
    }),
  ]);

  let matchedStudent = roster.find((s) => s.student_id === parsed.studentId);

  if (!matchedStudent) {
    for (const sem of context.semesters) {
      if (sem.id === targetSemesterId) continue;
      const semRoster = await getRoster(sem.id);
      matchedStudent = semRoster.find((s) => s.student_id === parsed.studentId);
      if (matchedStudent) break;
    }
  }

  if (!matchedStudent) {
    throw new Error("Student profile not found in the roster.");
  }

  return {
    ...accountData,
    student: {
      id: matchedStudent.student_id,
      universityId: matchedStudent.university_id,
      fullName: displayName(matchedStudent),
    },
  };
}
