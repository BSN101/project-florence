import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildCouncilClearanceCandidates,
  buildFacultyClearanceCandidates,
} from "./candidates.ts";

describe("Task T-052 / FL-040: Council Clearance Candidate Mapping", () => {
  const actorId = "11111111-1111-4111-8111-111111111111";
  const student1Id = "11111111-1111-4111-8111-111111111111"; // Officer themselves
  const student2Id = "22222222-2222-4222-8222-222222222222";
  const student3Id = "33333333-3333-4333-8333-333333333333";

  const mockRoster = [
    {
      student_id: student1Id,
      university_id: "21-1-00001",
      name: "Officer Student",
      year_level: 4,
      academic_status: "regular",
    },
    {
      student_id: student2Id,
      university_id: "21-1-00002",
      name: "Cleared Student",
      year_level: 3,
      academic_status: "regular",
    },
    {
      student_id: student3Id,
      university_id: "21-1-00003",
      name: "Indebted Student",
      year_level: 2,
      academic_status: "irregular",
    },
  ];

  const mockClearances = [
    {
      student_id: student2Id,
      confirmed_at: "2026-11-16T12:00:00Z",
      confirmed_by: actorId,
    },
  ];

  const mockFinancialSummaries = new Map([
    [student1Id, { totalOutstandingPayable: 0 }],
    [student2Id, { totalOutstandingPayable: 150 }],
    [student3Id, { totalOutstandingPayable: 450 }],
  ]);

  const mockCouncilDemerits = new Map([
    [student1Id, 0],
    [student2Id, 1],
    [student3Id, 3],
  ]);

  test("accurately maps student demographics, clearance status, balances, and demerits", () => {
    const candidates = buildCouncilClearanceCandidates({
      roster: mockRoster,
      clearances: mockClearances,
      financialSummaries: mockFinancialSummaries,
      councilDemeritCounts: mockCouncilDemerits,
      actorProfileId: actorId,
    });

    assert.equal(candidates.length, 3);

    // Candidate 1 (Officer themselves)
    const c1 = candidates.find((c) => c.studentId === student1Id);
    assert.ok(c1);
    assert.equal(c1.isSelf, true);
    assert.equal(c1.status.cleared, false);
    assert.equal(c1.totalOutstandingPayable, 0);
    assert.equal(c1.activeCouncilDemerits, 0);

    // Candidate 2 (Already cleared)
    const c2 = candidates.find((c) => c.studentId === student2Id);
    assert.ok(c2);
    assert.equal(c2.isSelf, false);
    assert.equal(c2.status.cleared, true);
    assert.equal(c2.status.confirmedAt, "2026-11-16T12:00:00Z");
    assert.equal(c2.status.confirmedBy, actorId);
    assert.equal(c2.totalOutstandingPayable, 150);
    assert.equal(c2.activeCouncilDemerits, 1);

    // Candidate 3 (Not cleared, has balance and demerits)
    const c3 = candidates.find((c) => c.studentId === student3Id);
    assert.ok(c3);
    assert.equal(c3.isSelf, false);
    assert.equal(c3.status.cleared, false);
    assert.equal(c3.status.confirmedAt, null);
    assert.equal(c3.totalOutstandingPayable, 450);
    assert.equal(c3.activeCouncilDemerits, 3);
  });

  test("handles empty/missing balance and demerit map entries gracefully", () => {
    const candidates = buildCouncilClearanceCandidates({
      roster: [mockRoster[0]],
      clearances: [],
      financialSummaries: new Map(),
      councilDemeritCounts: new Map(),
      actorProfileId: "some-other-actor",
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].totalOutstandingPayable, 0);
    assert.equal(candidates[0].activeCouncilDemerits, 0);
    assert.equal(candidates[0].status.cleared, false);
    assert.equal(candidates[0].isSelf, false);
  });
});

describe("Task T-053 / FL-041: Faculty Clearance Candidate Mapping", () => {
  const coordinatorId = "11111111-1111-4111-8111-111111111111";
  const student1Id = "11111111-1111-4111-8111-111111111111"; // Coordinator themselves (enrolled)
  const student2Id = "22222222-2222-4222-8222-222222222222"; // Council cleared + Faculty cleared
  const student3Id = "33333333-3333-4333-8333-333333333333"; // Council cleared + Faculty pending (has demerits)
  const student4Id = "44444444-4444-4444-8444-444444444444"; // Council NOT cleared

  const mockRoster = [
    {
      student_id: student1Id,
      university_id: "21-1-00001",
      name: "Coordinator Student",
      year_level: 4,
      academic_status: "regular",
    },
    {
      student_id: student2Id,
      university_id: "21-1-00002",
      name: "Fully Cleared Student",
      year_level: 3,
      academic_status: "regular",
    },
    {
      student_id: student3Id,
      university_id: "21-1-00003",
      name: "Ready For Clearance Student",
      year_level: 2,
      academic_status: "irregular",
    },
    {
      student_id: student4Id,
      university_id: "21-1-00004",
      name: "Awaiting Council Student",
      year_level: 1,
      academic_status: "regular",
    },
  ];

  const mockCouncilClearances = [
    {
      student_id: student1Id,
      confirmed_at: "2026-11-15T10:00:00Z",
      confirmed_by: "council-officer-1",
    },
    {
      student_id: student2Id,
      confirmed_at: "2026-11-15T11:00:00Z",
      confirmed_by: "council-officer-1",
    },
    {
      student_id: student3Id,
      confirmed_at: "2026-11-16T09:00:00Z",
      confirmed_by: "council-officer-2",
    },
    // student4Id is intentionally missing from Council clearances!
  ];

  const mockAcademicClearances = [
    {
      student_id: student2Id,
      confirmed_at: "2026-11-16T14:00:00Z",
      confirmed_by: coordinatorId,
      confirmed_by_name: "Dr. Maria Santos",
    },
  ];

  const mockRleClearances = [
    {
      student_id: student1Id,
      confirmed_at: "2026-11-17T09:30:00Z",
      confirmed_by: "rle-coordinator-1",
      confirmed_by_name: "Prof. Juan Dela Cruz",
    },
  ];

  const mockDisciplineMap = new Map([
    [student1Id, { activeDemerits: 0, appliedMerits: 0, serviceCredits: 0, netBalance: 0 }],
    [student2Id, { activeDemerits: 1, appliedMerits: 1, serviceCredits: 0, netBalance: 0 }],
    [student3Id, { activeDemerits: 5, appliedMerits: 2, serviceCredits: 1, netBalance: 2 }],
    [student4Id, { activeDemerits: 0, appliedMerits: 0, serviceCredits: 0, netBalance: 0 }],
  ]);

  test("accurately maps Council prerequisite, Faculty clearance, counterpart clearance, and bucket disciplinary balance", () => {
    const candidates = buildFacultyClearanceCandidates({
      roster: mockRoster,
      councilClearances: mockCouncilClearances,
      academicClearances: mockAcademicClearances,
      rleClearances: mockRleClearances,
      disciplineMap: mockDisciplineMap,
      actorProfileId: coordinatorId,
      component: "academic",
      bucket: "office",
    });

    assert.equal(candidates.length, 4);

    // Candidate 1 (Coordinator themselves, Academic pending, RLE cleared)
    const c1 = candidates.find((c) => c.studentId === student1Id);
    assert.ok(c1);
    assert.equal(c1.isSelf, true);
    assert.equal(c1.councilCleared, true);
    assert.equal(c1.councilConfirmedAt, "2026-11-15T10:00:00Z");
    assert.equal(c1.status.cleared, false);
    assert.equal(c1.academicClearance.cleared, false);
    assert.equal(c1.rleClearance.cleared, true);
    assert.equal(c1.rleClearance.confirmedByName, "Prof. Juan Dela Cruz");
    assert.equal(c1.bucket, "office");
    assert.equal(c1.netBalance, 0);

    // Candidate 2 (Fully cleared in Council and Academic, has offset history)
    const c2 = candidates.find((c) => c.studentId === student2Id);
    assert.ok(c2);
    assert.equal(c2.isSelf, false);
    assert.equal(c2.councilCleared, true);
    assert.equal(c2.status.cleared, true);
    assert.equal(c2.status.confirmedAt, "2026-11-16T14:00:00Z");
    assert.equal(c2.status.confirmedBy, coordinatorId);
    assert.equal(c2.status.confirmedByName, "Dr. Maria Santos");
    assert.equal(c2.academicClearance.cleared, true);
    assert.equal(c2.rleClearance.cleared, false);
    assert.equal(c2.activeDemerits, 1);
    assert.equal(c2.appliedMerits, 1);
    assert.equal(c2.serviceCredits, 0);
    assert.equal(c2.netBalance, 0);

    // Candidate 3 (Council cleared, Faculty pending with non-zero balance)
    const c3 = candidates.find((c) => c.studentId === student3Id);
    assert.ok(c3);
    assert.equal(c3.isSelf, false);
    assert.equal(c3.councilCleared, true);
    assert.equal(c3.councilConfirmedAt, "2026-11-16T09:00:00Z");
    assert.equal(c3.status.cleared, false);
    assert.equal(c3.status.confirmedAt, null);
    assert.equal(c3.activeDemerits, 5);
    assert.equal(c3.appliedMerits, 2);
    assert.equal(c3.serviceCredits, 1);
    assert.equal(c3.netBalance, 2);

    // Candidate 4 (Council NOT cleared)
    const c4 = candidates.find((c) => c.studentId === student4Id);
    assert.ok(c4);
    assert.equal(c4.isSelf, false);
    assert.equal(c4.councilCleared, false);
    assert.equal(c4.councilConfirmedAt, null);
    assert.equal(c4.status.cleared, false);
  });

  test("handles empty/missing discipline entries gracefully", () => {
    const candidates = buildFacultyClearanceCandidates({
      roster: [mockRoster[3]],
      councilClearances: [],
      academicClearances: [],
      rleClearances: [],
      disciplineMap: new Map(),
      actorProfileId: "other-actor",
      component: "rle",
      bucket: "rle",
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].bucket, "rle");
    assert.equal(candidates[0].councilCleared, false);
    assert.equal(candidates[0].councilConfirmedAt, null);
    assert.equal(candidates[0].status.cleared, false);
    assert.equal(candidates[0].academicClearance.cleared, false);
    assert.equal(candidates[0].rleClearance.cleared, false);
    assert.equal(candidates[0].activeDemerits, 0);
    assert.equal(candidates[0].appliedMerits, 0);
    assert.equal(candidates[0].serviceCredits, 0);
    assert.equal(candidates[0].netBalance, 0);
    assert.equal(candidates[0].isSelf, false);
  });
});

