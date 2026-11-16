import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildCouncilClearanceCandidates } from "./candidates.ts";

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
