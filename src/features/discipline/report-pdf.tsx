import "server-only";

import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { formatManilaDate } from "@/lib/manila-date";

import type { DisciplinaryBucket } from "./contracts";
import type { StudentDisciplinaryReportData } from "./report-contracts";

// Helvetica: the PDF built-in Arial is metric-compatible with (Arial itself cannot be bundled).
// shortcut: built-in Helvetica covers Latin-1 (incl. ñ, é) only; embed a TTF if names need other scripts.
// Formal documents do not hyphenate words across lines.
Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 12,
    color: "#000000",
    backgroundColor: "#ffffff",
    paddingTop: 72,
    paddingBottom: 72,
    paddingHorizontal: 72,
  },
  bold: { fontFamily: "Helvetica-Bold" },
  italic: { fontFamily: "Helvetica-Oblique" },
  header: { alignItems: "center", marginBottom: 18 },
  institution: { fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 14, marginTop: 4 },
  rule: { borderBottomWidth: 1, borderBottomColor: "#000000", marginBottom: 14 },
  detailRow: { flexDirection: "row", marginBottom: 3 },
  detailLabel: { width: 130, fontFamily: "Helvetica-Bold" },
  detailValue: { flex: 1 },
  sectionGap: { height: 18 },
  sectionTitle: { fontFamily: "Helvetica-Bold", marginBottom: 6 },
  paragraph: { textAlign: "justify" },
  headRow: { flexDirection: "row", borderTopWidth: 0.75, borderBottomWidth: 0.75, borderColor: "#000000" },
  row: { flexDirection: "row", borderTopWidth: 0.25, borderColor: "#000000" },
  lastRow: { borderBottomWidth: 0.75 },
  cell: { paddingVertical: 3, paddingRight: 6 },
  empty: { fontFamily: "Helvetica-Oblique" },
  // On the content, not the page: an inherited lineHeight hides react-pdf page-number text.
  // Points (1.35 x 12pt), since a unitless lineHeight on a View over-spaces lines.
  content: { lineHeight: "16pt" },
  footer: { position: "absolute", bottom: 36, left: 72, right: 72, fontSize: 9 },
});

type Column<T> = { label: string; width: number | string; value: (row: T) => string };

function Table<T extends { id: string }>({ columns, rows, empty }: {
  columns: Column<T>[];
  rows: readonly T[];
  empty: string;
}) {
  if (rows.length === 0) return <Text style={s.empty}>{empty}</Text>;
  return (
    <>
      <View style={s.headRow} fixed wrap={false}>
        {columns.map((c) => (
          <Text key={c.label} style={[s.cell, s.bold, { width: c.width }]}>{c.label}</Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View
          key={row.id}
          style={[s.row, i === 0 ? { borderTopWidth: 0 } : {}, i === rows.length - 1 ? s.lastRow : {}]}
          wrap={false}
        >
          {columns.map((c) => (
            <Text key={c.label} style={[s.cell, { width: c.width }]}>{c.value(row)}</Text>
          ))}
        </View>
      ))}
    </>
  );
}

const duty = (bucket: DisciplinaryBucket) => (bucket === "office" ? "Office" : "RLE");
const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      {/* The gap is a sibling, not a margin: react-pdf only moves a title with minPresenceAhead
          to the next page when something precedes it in the same parent. The body gets its own
          View so a table's repeating header only covers the pages the table is on. */}
      <View style={s.sectionGap} />
      <Text style={s.sectionTitle} minPresenceAhead={120}>{title}</Text>
      <View>{children}</View>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

function DisciplinaryReportDocument({ report }: { report: StudentDisciplinaryReportData }) {
  const { office, rle, merits } = report.cumulativeSummary;
  const p = report.periodSummary;
  const yearScope = report.scope === "year";
  const termPrefix = (label: string) => (yearScope ? `${label.split(" · ")[0]}\n` : "");

  const enrollment = report.coveredTerms
    .filter((t) => t.yearLevel !== null)
    .map((t) => `${yearScope ? `${t.term}: ` : ""}Year ${t.yearLevel}, ${t.academicStatus === "irregular" ? "Irregular" : "Regular"}`)
    .join("; ");

  const standing = [office, rle].map((b) => ({ id: b.bucket, ...b }));

  return (
    <Document title={`Student Disciplinary Report — ${report.periodLabel}`} author="Project Florence">
      <Page size="A4" style={s.page}>
        <Text style={s.footer} fixed>Informational record only. Not a certified document.</Text>
        <Text
          style={[s.footer, { textAlign: "right" }]}
          fixed
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
        <View style={s.content}>
          <View style={s.header}>
            <Text style={s.institution}>FACULTY OF NURSING</Text>
            <Text style={s.title}>Student Disciplinary Report</Text>
            <Text>{report.periodLabel}</Text>
          </View>
          <View style={s.rule} />

          <Detail label="Student" value={report.student.fullName} />
          <Detail label="University number" value={report.student.universityId ?? "—"} />
          {enrollment && <Detail label="Year level" value={enrollment} />}
          <Detail label="Date issued" value={formatManilaDate(report.generatedAt)} />

          <Section title={`I. Current Standing (as of ${formatManilaDate(report.asOfDateManila)})`}>
            <Table
              rows={standing}
              empty=""
              columns={[
                { label: "Duty", width: "20%", value: (b) => (b.bucket === "office" ? "Office" : "Clinical (RLE)") },
                { label: "Active demerits", width: "22%", value: (b) => String(b.activeDemerits) },
                { label: "Merits applied", width: "21%", value: (b) => String(b.appliedMerits) },
                { label: "Service credits", width: "22%", value: (b) => String(b.activeServiceCredits) },
                { label: "Balance", width: "15%", value: (b) => days(Math.max(0, b.balance)) },
              ]}
            />
            <Text style={{ marginTop: 6 }}>
              Unused merits available: {days(merits.available)}. Figures are cumulative across all semesters.
            </Text>
          </Section>

          <Section title="II. Summary of the Period">
            <Text style={s.paragraph}>
              During this period, {days(p.demeritsRecorded)} of demerit {p.demeritsRecorded === 1 ? "was" : "were"} recorded
              ({p.demeritsActive} active, {p.demeritsWaived} waived), {days(p.meritsAwarded)} of merit{" "}
              {p.meritsAwarded === 1 ? "was" : "were"} awarded, and {days(p.serviceCreditsEarned)} of service duty{" "}
              {p.serviceCreditsEarned === 1 ? "was" : "were"} credited.
            </Text>
          </Section>

          <Section title="III. Demerits">
            <Table
              rows={report.demerits}
              empty="No demerits recorded in this period."
              columns={[
                { label: "Date", width: "19%", value: (d) => termPrefix(d.term_label) + formatManilaDate(d.incident_on) },
                { label: "Duty", width: "10%", value: (d) => duty(d.bucket) },
                {
                  label: "Offence",
                  width: "34%",
                  value: (d) =>
                    (d.misconduct_label ?? d.description) +
                    (d.group_unit_count > 1 ? ` (day ${d.incident_unit_index} of ${d.group_unit_count})` : ""),
                },
                { label: "Issued by", width: "19%", value: (d) => d.issuer_label },
                {
                  label: "Status",
                  width: "18%",
                  value: (d) => (d.status === "waived" ? `Waived ${formatManilaDate(d.waived_at)}` : "Active"),
                },
              ]}
            />
          </Section>

          <Section title="IV. Merits">
            <Table
              rows={report.merits}
              empty="No merits awarded in this period."
              columns={[
                { label: "Date", width: "19%", value: (m) => termPrefix(m.term_label) + formatManilaDate(m.awarded_on) },
                { label: "Description", width: "29%", value: (m) => m.description },
                { label: "Awarded by", width: "18%", value: (m) => m.awarder_label },
                { label: "Expires", width: "17%", value: (m) => formatManilaDate(m.expires_on) },
                {
                  label: "Status",
                  width: "17%",
                  value: (m) =>
                    m.status === "applied"
                      ? `Applied${m.applied_bucket ? ` (${m.applied_bucket === "office" ? "Office" : "RLE"})` : ""}`
                      : m.status === "expired" ? "Expired" : "Available",
                },
              ]}
            />
          </Section>

          <Section title="V. Service Duty Credits">
            <Table
              rows={report.serviceCredits}
              empty="No service duty credited in this period."
              columns={[
                { label: "Date", width: "19%", value: (c) => termPrefix(c.term_label) + formatManilaDate(c.issued_at) },
                { label: "Duty", width: "15%", value: (c) => duty(c.bucket) },
                { label: "Supervised by", width: "43%", value: (c) => c.supervisor_label },
                {
                  label: "Status",
                  width: "23%",
                  value: (c) => (c.status === "revoked" ? `Revoked ${formatManilaDate(c.revoked_at)}` : "Credited"),
                },
              ]}
            />
          </Section>
        </View>
      </Page>
    </Document>
  );
}

export async function renderDisciplinaryReportPdf(report: StudentDisciplinaryReportData) {
  return new Uint8Array(await renderToBuffer(<DisciplinaryReportDocument report={report} />));
}
