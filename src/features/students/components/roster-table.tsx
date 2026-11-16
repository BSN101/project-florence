"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Award, GraduationCap, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  FilterSelect,
  matches,
  TableEmpty,
  TableFrame,
  THEAD_CLASS,
  usePagedRows,
} from "@/features/discipline/components/table-controls";
import { sortName } from "@/lib/format-name";

import type { StudentRosterItem } from "../contracts";
import { AcademicStatusBadge } from "./academic-status-badge";
import { EditStudentDialog } from "./edit-student-dialog";
import { InvitationStatusBadge } from "./invitation-status-badge";
import { StudentDetailDialog } from "./student-detail-dialog";
import { StudentRowActions } from "./student-invitation-dialogs";

const YEAR_OPTIONS = [
  { value: "all", label: "All" },
  ...[1, 2, 3, 4].map((year) => ({ value: String(year), label: `Year ${year}` })),
];
const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "regular", label: "Regular" },
  { value: "irregular", label: "Irregular" },
];
const ACCOUNT_OPTIONS = [
  { value: "all", label: "All" },
  { value: "linked", label: "Linked" },
  { value: "pending", label: "Pending" },
  { value: "uninvited", label: "Uninvited" },
  { value: "no_email", label: "No email" },
];

const hasEmail = (student: StudentRosterItem) => Boolean(student.email && student.email.trim() !== "");

function matchesAccount(filter: string, student: StudentRosterItem) {
  if (filter === "linked") return student.has_account;
  if (filter === "pending") return !student.has_account && student.invitation_state === "pending";
  if (filter === "uninvited") return !student.has_account && student.invitation_state !== "pending" && hasEmail(student);
  if (filter === "no_email") return !student.has_account && !hasEmail(student);
  return true;
}

export function RosterTable({
  students,
  canEdit,
  workspace = "council",
}: {
  students: StudentRosterItem[];
  canEdit: boolean;
  workspace?: "council" | "faculty";
}) {
  // Account and invitation state is Council's provisioning concern; faculty don't see it.
  const accounts = workspace === "council";
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("all");
  const [status, setStatus] = useState("all");
  const [account, setAccount] = useState("all");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((student) =>
      (!q || student.university_id.toLowerCase().includes(q) || sortName(student).toLowerCase().includes(q))
      && matches(year, String(student.year_level))
      && matches(status, student.academic_status)
      && (!accounts || matchesAccount(account, student))
    );
  }, [students, search, year, status, account, accounts]);

  const { pageRows, pager } = usePagedRows(rows, `${search}|${year}|${status}|${account}`);

  if (students.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-4 p-6 text-center sm:p-12">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <GraduationCap className="size-6 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="font-heading text-base font-semibold text-foreground">
            No Students Enrolled
          </h3>
          <p className="max-w-md text-xs text-muted-foreground">
            {canEdit
              ? "No students are enrolled in this semester yet. Use “Add Student” to enroll students or download the CSV template to prepare a roster import."
              : "No students were enrolled in this semester."}
          </p>
        </div>
      </Card>
    );
  }

  const filters = (
    <>
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by student number or name..."
          aria-label="Search students"
          className="pl-8 text-xs"
        />
      </div>
      <FilterSelect label="Year" value={year} options={YEAR_OPTIONS} onChange={setYear} />
      <FilterSelect label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
      {accounts && <FilterSelect label="Account" value={account} options={ACCOUNT_OPTIONS} onChange={setAccount} />}
    </>
  );

  function actions(student: StudentRosterItem) {
    return (
      <div className="flex shrink-0 items-center justify-end gap-1">
        {workspace === "faculty" && (
          <Button variant="ghost" size="sm" nativeButton={false}
            className="h-8 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            render={<Link href={`/faculty/my-merits-and-demerits?award&student=${student.student_id}`} aria-label={`Award merits to ${sortName(student)}`} />}>
            <Award className="size-3.5" />
            <span>Award merits</span>
          </Button>
        )}
        <StudentRowActions student={student} canEdit={canEdit} />
        <StudentDetailDialog student={student} canEdit={canEdit} workspace={workspace} />
        {canEdit && <EditStudentDialog student={student} />}
      </div>
    );
  }

  return (
    <TableFrame filters={filters} pager={pager}>
      {rows.length === 0 ? (
        <TableEmpty icon={Users} title="No students" text="" filtered />
      ) : (
        <>
          {/* Phones and tablets: cards */}
          <ul className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 lg:hidden">
            {pageRows.map((student) => (
              <li key={student.enrollment_id} className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
                <div className="min-w-0">
                  <span className="font-mono text-xs font-semibold text-primary">{student.university_id}</span>
                  <h4 className="break-words font-heading text-sm font-semibold text-foreground">{sortName(student)}</h4>
                  {student.email && <p className="break-all text-[11px] text-muted-foreground">{student.email}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">Year {student.year_level}</span>
                  <AcademicStatusBadge status={student.academic_status} size="sm" />
                  {accounts && <InvitationStatusBadge student={student} size="sm" />}
                </div>
                <div className="border-t border-border/60 pt-2">{actions(student)}</div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <table className="hidden w-full text-left text-sm lg:table">
            <thead className={`${THEAD_CLASS} text-xs`}>
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Status</th>
                {accounts && <th className="px-4 py-3">Account / Invitation</th>}
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {pageRows.map((student) => (
                <tr key={student.enrollment_id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{sortName(student)}</span>
                      <span className="text-[11px] text-muted-foreground">
                        <span className="font-mono">{student.university_id}</span>
                        {student.email && <> · {student.email}</>}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-foreground">Year {student.year_level}</td>
                  <td className="px-4 py-3"><AcademicStatusBadge status={student.academic_status} /></td>
                  {accounts && <td className="px-4 py-3"><InvitationStatusBadge student={student} size="md" /></td>}
                  <td className="px-4 py-3">{actions(student)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </TableFrame>
  );
}
