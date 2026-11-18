import "server-only";

import type { SemesterOption } from "@/features/access/access-policy";
import { getRoster } from "@/features/students/queries";
import { displayName } from "@/lib/format-name";
import { AccessDeniedError, requireWorkspace } from "@/server/auth/require-workspace";
import { createUserClient } from "@/server/db/user-client";
import {
  calculateObligationsStanding,
  calculateStudentFinancialSummary,
  mapPaymentHistory,
  priorSemesterIdsFor,
  scopeFinancialRecordsForSemester,
  summarizeStudentBalances,
} from "./calculations";
import {
  type FeeDefinitionCatalogItem,
  type FeeDefinitionDTO,
  type FeePublicationDTO,
  type FeePublicationPreview,
  type FineDefinitionCatalogItem,
  type FineDefinitionDTO,
  type CouncilFinancialRosterItem,
  type ObligationWithStandingDTO,
  type PaymentAccountDTO,
  type StudentFinancialAccountData,
  type StudentPaymentAccountDTO,
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
        "id, semester_id, kind, consequence_outcome, description, amount, waived_at, waiver_reason"
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
        "id, student_id, semester_id, method, status, record_status, receipt_id, is_receipt_record, destination_label, destination_account_name, destination_account_reference, reference_number, proof_file_id, amount, submitted_at, decided_at, decision_reason, receipt:payment_receipts(received_at)"
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

  // Flatten the receipt join: the record view shows when the money was actually received.
  const rawPayments = (paymentsRes.data ?? []).map(({ receipt, ...p }) => ({
    ...p,
    received_at: receipt?.received_at ?? null,
  }));
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

  const priorSemesterIds = priorSemesterIdsFor(semesters, targetSemesterId);

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
    paymentItems: rawPaymentItems,
    obligations: rawObligations,
  });

  const scoped = scopeFinancialRecordsForSemester({
    obligationsWithStanding: allObligationsWithStanding,
    payments: allPayments,
    paymentItems: rawPaymentItems,
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

/** Reads every row past the API row cap; callers order by a unique column so pages never overlap. */
export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  errorMessage: string
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(errorMessage);
    if (!data?.length) return rows;
    rows.push(...data);
    from += data.length;
  }
}

/**
 * The semester's enrolled students with their financial summary, for the Council ledger table (FL-022).
 * Restricted to Council Executive and Operations; totals match each student's own account view.
 */
export async function getCouncilFinancialRoster(
  semesterId: string
): Promise<CouncilFinancialRosterItem[]> {
  const context = await assertAuthorizedCouncilManager();
  const client = await createUserClient();
  const priorSemesterIds = priorSemesterIdsFor(context.semesters, semesterId);
  const semesterIds = [semesterId, ...priorSemesterIds];

  // shortcut: reads all refund receipt ids (no semester column); filter by receipt once refunds grow large.
  const [roster, obligations, paymentItems, payments, refunds] = await Promise.all([
    getRoster(semesterId),
    allRows(
      (from, to) =>
        client
          .from("obligations")
          .select("id, student_id, semester_id, kind, consequence_outcome, description, amount, waived_at, waiver_reason")
          .in("semester_id", semesterIds)
          .order("id")
          .range(from, to),
      "Unable to load student obligations."
    ),
    allRows(
      (from, to) =>
        client
          .from("payment_items")
          .select("id, payment_id, obligation_id")
          .in("semester_id", semesterIds)
          .order("id")
          .range(from, to),
      "Unable to load payment allocations."
    ),
    allRows(
      (from, to) =>
        client
          .from("payments")
          .select("id, status, record_status, is_receipt_record, receipt_id")
          .in("semester_id", semesterIds)
          .order("id")
          .range(from, to),
      "Unable to load payment records."
    ),
    allRows(
      (from, to) => client.from("payment_refunds").select("id, receipt_id").order("id").range(from, to),
      "Unable to load payment refunds."
    ),
  ]);

  const summaries = summarizeStudentBalances({
    obligations,
    paymentItems,
    payments,
    refunds,
    targetSemesterId: semesterId,
    priorSemesterIds,
  });
  const empty = calculateStudentFinancialSummary({ obligationsWithStanding: [] });
  return roster.map((student) => ({ ...student, summary: summaries.get(student.student_id) ?? empty }));
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
 * Resolves student identity via the florence_finance_student RPC in parallel with financial records.
 */
export async function getCouncilStudentFinancialAccount(
  input: CouncilStudentFinancialQueryInput
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

  const [identityRes, accountData] = await Promise.all([
    client.rpc("florence_finance_student", { p_student: parsed.studentId }),
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

  if (identityRes.error) {
    throw new Error("Unable to load the student profile.");
  }
  const matchedStudent = identityRes.data[0];
  if (!matchedStudent) {
    throw new Error("Student profile not found.");
  }

  return {
    ...accountData,
    student: {
      id: matchedStudent.id,
      universityId: matchedStudent.university_id,
      fullName: displayName(matchedStudent),
    },
  };
}

/**
 * Fetch active payment destination accounts for the student transfer wizard (FL-023 / T-034).
 * Uses the request-scoped user client (RLS `accounts_read` permits active accounts for students)
 * and resolves short-lived signed QR URLs when an account has a QR code attached.
 */
export async function getActivePaymentAccountsForStudent(): Promise<
  StudentPaymentAccountDTO[]
> {
  await requireWorkspace("student");
  const client = await createUserClient();

  const { data, error } = await client
    .from("payment_accounts")
    .select("id, label, account_name, account_reference, instructions, qr_file_id")
    .is("archived_at", null)
    .order("label", { ascending: true });

  if (error) {
    throw new Error("Unable to load payment destination accounts.");
  }

  // QR links are signed later, when the wizard shows them (getStudentPaymentAccountQrUrl).
  return data ?? [];
}

async function fetchStudentPayableObligations({
  client,
  studentId,
  semesters,
}: {
  client: Awaited<ReturnType<typeof createUserClient>>;
  studentId: string;
  semesters: SemesterOption[];
}): Promise<ObligationWithStandingDTO[]> {
  const [obligationsRes, paymentItemsRes, paymentsRes] = await Promise.all([
    client
      .from("obligations")
      .select(
        "id, semester_id, kind, consequence_outcome, description, amount, waived_at, waiver_reason"
      )
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    client
      .from("payment_items")
      .select("payment_id, obligation_id")
      .eq("student_id", studentId),
    client
      .from("payments")
      .select("id, receipt_id, status, record_status, is_receipt_record")
      .eq("student_id", studentId),
  ]);

  if (obligationsRes.error || paymentItemsRes.error || paymentsRes.error) {
    throw new Error("Unable to load payable obligations.");
  }

  const rawPayments = paymentsRes.data ?? [];
  const receiptIds = Array.from(
    new Set(
      rawPayments
        .map((p) => p.receipt_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );

  let rawRefunds: Array<{ receipt_id: string }> = [];
  if (receiptIds.length > 0) {
    const { data: refundsData, error: refundError } = await client
      .from("payment_refunds")
      .select("receipt_id")
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

  const currentSemester =
    semesters.find((s) => s.is_current) ?? semesters[0];
  const priorSemesterIds = priorSemesterIdsFor(
    semesters,
    currentSemester?.id
  );

  const allWithStanding = calculateObligationsStanding({
    obligations: obligationsRes.data ?? [],
    paymentItems: paymentItemsRes.data ?? [],
    payments: rawPayments,
    refunds: rawRefunds,
    targetSemesterId: currentSemester?.id,
    priorSemesterIds,
    semesterCodeMap,
  });

  return allWithStanding.filter(
    (item) => item.status === "unpaid" || item.status === "pending_verification"
  );
}

/**
 * Fetch all payable obligations across all semesters for the student transfer wizard (FL-023 / T-034).
 * Includes older unpaid semesters; excludes waived and already settled obligations.
 * Obligations with `pending_verification` are returned so the wizard can show them, but
 * they cannot be submitted again until Council rejects the pending transfer
 * (enforced by submit_transfer_payment).
 */
export async function getStudentPayableObligations(): Promise<
  ObligationWithStandingDTO[]
> {
  const context = await requireWorkspace("student");
  const client = await createUserClient();
  return fetchStudentPayableObligations({
    client,
    studentId: context.profile.id,
    semesters: context.semesters,
  });
}

/**
 * Fetch all payable obligations across all semesters for a specific student when Council
 * records an in-person cash payment (FL-024 / T-035).
 * Strictly restricted to Council Executive and Operations; uses the request-scoped user client.
 */
export async function getCouncilStudentPayableObligations(
  studentId: string
): Promise<ObligationWithStandingDTO[]> {
  const context = await assertAuthorizedCouncilManager();
  const validStudentId = councilStudentFinancialQuerySchema.shape.studentId.parse(studentId);
  const client = await createUserClient();
  return fetchStudentPayableObligations({
    client,
    studentId: validStudentId,
    semesters: context.semesters,
  });
}
