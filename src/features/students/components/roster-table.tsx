"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, GraduationCap, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { sortName } from "@/features/access/components/provisioning-ui";

import type { StudentRosterItem } from "../contracts";
import { AcademicStatusBadge } from "./academic-status-badge";
import { EditStudentDialog } from "./edit-student-dialog";
import { StudentDetailDialog } from "./student-detail-dialog";

const PAGE_SIZE = 25;

export function RosterTable({ students, canEdit }: { students: StudentRosterItem[]; canEdit: boolean }) {
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      // Search filter
      if (search.trim() !== "") {
        const q = search.trim().toLowerCase();
        const num = student.university_id.toLowerCase();
        const name = sortName(student).toLowerCase();
        if (!num.includes(q) && !name.includes(q)) return false;
      }

      // Year level filter
      if (yearFilter !== "all" && student.year_level !== Number(yearFilter)) {
        return false;
      }

      // Academic status filter
      if (statusFilter !== "all" && student.academic_status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [students, search, yearFilter, statusFilter]);

  const yearLabel =
    yearFilter === "all" ? "Year: All Years" : `Year: Year ${yearFilter}`;

  const statusLabel =
    statusFilter === "all"
      ? "Status: All Statuses"
      : statusFilter === "regular"
        ? "Status: Regular"
        : "Status: Irregular";

  // Clamped so a shrinking roster (e.g. after a refresh) never lands on an empty page.
  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const firstIndex = currentPage * PAGE_SIZE;
  const pageStudents = filteredStudents.slice(firstIndex, firstIndex + PAGE_SIZE);

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

  return (
    <div className="flex flex-col gap-4">
      {/* Search and Filters Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1 sm:min-w-[300px] lg:min-w-[340px]">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search by student number or name..."
              className="pl-9 text-xs sm:text-sm"
            />
          </div>

          <div className="grid w-full grid-cols-2 gap-2.5 shrink-0 sm:grid-cols-2 md:grid-cols-2 lg:flex lg:w-auto lg:items-center lg:gap-2.5">
            {/* Year Level Filter */}
            <div className="w-full lg:w-[170px]">
              <Select value={yearFilter} onValueChange={(val) => { setYearFilter(val ?? "all"); setPage(0); }}>
                <SelectTrigger className="w-full text-xs">
                  <span className="truncate">{yearLabel}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  <SelectItem value="1">Year 1</SelectItem>
                  <SelectItem value="2">Year 2</SelectItem>
                  <SelectItem value="3">Year 3</SelectItem>
                  <SelectItem value="4">Year 4</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Academic Status Filter */}
            <div className="w-full lg:w-[170px]">
              <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val ?? "all"); setPage(0); }}>
                <SelectTrigger className="w-full text-xs">
                  <span className="truncate">{statusLabel}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="irregular">Irregular</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Roster Counter */}
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>
          {filteredStudents.length === 0
            ? <>Showing <strong>0</strong> of {students.length} students</>
            : <>Showing <strong>{firstIndex + 1}–{firstIndex + pageStudents.length}</strong> of {filteredStudents.length} students
                {filteredStudents.length !== students.length && <> (filtered from {students.length})</>}</>}
        </span>
        {pageCount > 1 && (
          <nav aria-label="Roster pages" className="flex items-center gap-2">
            <Button variant="outline" size="sm" aria-label="Previous page"
              disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span aria-live="polite">Page {currentPage + 1} of {pageCount}</span>
            <Button variant="outline" size="sm" aria-label="Next page"
              disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>
              <ChevronRight className="size-4" />
            </Button>
          </nav>
        )}
      </div>

      {filteredStudents.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          <Users className="size-8 text-muted-foreground/60" />
          <p className="text-xs text-muted-foreground">
            No students match your filter criteria. Try clearing or adjusting the search query.
          </p>
        </Card>
      ) : (
        <>
          {/* Mobile & Tablet Card View (< lg: 1 col on mobile, 2 cols on tablet / iPad) */}
          <div className="min-h-[360px] max-h-[600px] overflow-y-auto pr-1 pb-1 lg:hidden">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {pageStudents.map((student) => {
                const fullName = sortName(student);

                return (
                  <div
                    key={student.enrollment_id}
                    className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {student.university_id}
                        </span>
                        <h4 className="font-heading text-sm font-semibold text-foreground break-words">
                          {fullName}
                        </h4>
                        {student.email && (
                          <p className="text-[11px] text-muted-foreground break-all">
                            {student.email}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <StudentDetailDialog student={student} canEdit={canEdit} />
                        {canEdit && <EditStudentDialog student={student} />}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5 text-xs">
                      <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                        Year {student.year_level}
                      </span>

                      <AcademicStatusBadge status={student.academic_status} size="sm" />

                      {student.has_account ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          Account linked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          No account
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Desktop Table View (>= lg) */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card lg:block shadow-xs">
            <div className="overflow-auto min-h-[360px] max-h-[600px]">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-muted/95 backdrop-blur-xs text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3.5">Student Number</th>
                    <th className="px-4 py-3.5">Full Name</th>
                    <th className="px-4 py-3.5">Year Level</th>
                    <th className="px-4 py-3.5">Academic Status</th>
                    <th className="px-4 py-3.5">Account</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {pageStudents.map((student) => {
                    const fullName = sortName(student);

                    return (
                      <tr
                        key={student.enrollment_id}
                        className="transition-colors hover:bg-muted/40"
                      >
                        <td className="px-4 py-3.5 font-mono text-xs font-semibold text-foreground">
                          {student.university_id}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{fullName}</span>
                            {student.email && (
                              <span className="text-[11px] text-muted-foreground">
                                {student.email}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-foreground">
                          Year {student.year_level}
                        </td>
                        <td className="px-4 py-3.5">
                          <AcademicStatusBadge status={student.academic_status} />
                        </td>
                        <td className="px-4 py-3.5">
                          {student.has_account ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                              <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                              Account linked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                              <span className="size-1.5 rounded-full bg-current" />
                              No account
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <StudentDetailDialog student={student} canEdit={canEdit} />
                            {canEdit && <EditStudentDialog student={student} />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
