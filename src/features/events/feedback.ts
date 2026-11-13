import { z } from "zod";

/**
 * Fixed post-event questionnaire (FL-019), version 1. Changing wording or items needs
 * a new version: stored answers keep the version they were given under, and
 * submit_event_feedback validates this exact shape.
 */
export const FEEDBACK_VERSION = 1;

export const FEEDBACK_QUESTIONS = [
  { key: "q1", text: "Overall, how satisfied were you with this event?", low: "Very dissatisfied", high: "Very satisfied" },
  { key: "q2", text: "The event was well organized.", low: "Strongly disagree", high: "Strongly agree" },
  { key: "q3", text: "The schedule and venue were suitable.", low: "Strongly disagree", high: "Strongly agree" },
  { key: "q4", text: "The event contributed to my learning and growth as a nursing student.", low: "Strongly disagree", high: "Strongly agree" },
  { key: "q5", text: "The event was worth my time.", low: "Strongly disagree", high: "Strongly agree" },
] as const;

export type FeedbackKey = (typeof FEEDBACK_QUESTIONS)[number]["key"];

/** Matches submit_event_feedback: opens when attendance closes, open this many days. */
export const FEEDBACK_WINDOW_DAYS = 7;

export const FEEDBACK_DISCLOSURE =
  "This response is not anonymous. Council Executives and Operations will see your name with your answers. You can't edit it after submitting.";

const rating = z.number({ message: "Choose a rating" }).int().min(1, "Choose a rating").max(5);

export const feedbackSchema = z.object({
  eventId: z.string().uuid("Invalid event"),
  requestKey: z.string().uuid("Invalid request"),
  q1: rating, q2: rating, q3: rating, q4: rating, q5: rating,
  comment: z.string().trim().max(1000, "Keep comments under 1,000 characters").optional(),
});

export type FeedbackInput = z.input<typeof feedbackSchema>;

export type FeedbackResponses = { version: number; comment?: string } & Record<FeedbackKey, number>;

/** The stored JSON shape; an empty comment is left out. */
export function toResponses(input: z.output<typeof feedbackSchema>): FeedbackResponses {
  const { q1, q2, q3, q4, q5, comment } = input;
  return { version: FEEDBACK_VERSION, q1, q2, q3, q4, q5, ...(comment ? { comment } : {}) };
}

export type QuestionSummary = { key: FeedbackKey; text: string; average: number | null; counts: [number, number, number, number, number] };

/** Average (one decimal) and 1–5 counts per question. */
export function summarizeFeedback(responses: Partial<FeedbackResponses>[]): QuestionSummary[] {
  return FEEDBACK_QUESTIONS.map(({ key, text }) => {
    const counts: QuestionSummary["counts"] = [0, 0, 0, 0, 0];
    let total = 0;
    let n = 0;
    for (const r of responses) {
      const value = r[key];
      if (typeof value === "number" && value >= 1 && value <= 5) {
        counts[value - 1] += 1;
        total += value;
        n += 1;
      }
    }
    return { key, text, average: n ? Math.round((total / n) * 10) / 10 : null, counts };
  });
}
