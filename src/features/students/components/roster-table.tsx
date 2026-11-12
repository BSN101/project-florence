"use client";

import { useMemo, useState } from "react";
import { GraduationCap, Search, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { StudentRosterItem } from "../contracts";
import { EditStudentDialog } from "./edit-student-dialog";

export function RosterTable({
  students,
  activeSemesterId,
  canManage,
}: {
  students: StudentRosterItem[];
  activeSemesterId: string;
  canManage: boolean;
}) {
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      // Search filter
      if (search.trim() !== "") {
        const q = search.trim().toLowerCase();
        const num = student.university_id.toLowerCase();
        const name =
          `${student.last_name} ${student.first_name} ${student.middle_name ?? ""} ${student.suffix ?? ""}`.toLowerCase();
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
            There are no students enrolled in the active semester roster yet. Use &ldquo;Add Student&rdquo;
            to enroll students or download the CSV template to prepare a roster import.
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
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by student number or name..."
              className="pl-9 text-xs sm:text-sm"
            />
          </div>

          <div className="grid w-full grid-cols-2 gap-2.5 shrink-0 sm:grid-cols-2 md:grid-cols-2 lg:flex lg:w-auto lg:items-center lg:gap-2.5">
            {/* Year Level Filter */}
            <div className="w-full lg:w-[170px]">
              <Select value={yearFilter} onValueChange={(val) => setYearFilter(val ?? "all")}>
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
              <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val ?? "all")}>
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
          Showing <strong>{filteredStudents.length}</strong> of {students.length} students
        </span>
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden">
            {filteredStudents.map((student) => {
              const fullName = `${student.last_name}, ${student.first_name}${
                student.middle_name ? ` ${student.middle_name}` : ""
              }${student.suffix ? ` ${student.suffix}` : ""}`;

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

                    {canManage && (
                      <div className="shrink-0">
                        <EditStudentDialog
                          student={student}
                          activeSemesterId={activeSemesterId}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5 text-xs">
                    <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                      Year {student.year_level}
                    </span>

                    {student.academic_status === "regular" ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        Regular
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-600/30 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        Irregular
                      </span>
                    )}

                    {student.has_auth_account ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Uninvited / Pending
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
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
                    <th className="px-4 py-3.5">Account Status</th>
                    {canManage && <th className="px-4 py-3.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredStudents.map((student) => {
                    const fullName = `${student.last_name}, ${student.first_name}${
                      student.middle_name ? ` ${student.middle_name}` : ""
                    }${student.suffix ? ` ${student.suffix}` : ""}`;

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
                          {student.academic_status === "regular" ? (
                            <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                              Regular
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-amber-600/30 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                              Irregular
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {student.has_auth_account ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                              <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                              <span className="size-1.5 rounded-full bg-current" />
                              Uninvited / Pending
                            </span>
                          )}
                        </td>
                        {canManage && (
                          <td className="px-4 py-3.5 text-right">
                            <EditStudentDialog
                              student={student}
                              activeSemesterId={activeSemesterId}
                            />
                          </td>
                        )}
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
