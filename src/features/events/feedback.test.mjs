import assert from "node:assert/strict";
import { test } from "node:test";

import { FEEDBACK_QUESTIONS, feedbackSchema, summarizeFeedback, toResponses } from "./feedback.ts";

const uuid = "11111111-1111-4111-8111-111111111111";
const base = { eventId: uuid, requestKey: uuid, q1: 5, q2: 4, q3: 3, q4: 5, q5: 4 };

test("questionnaire has five rated items including educational value", () => {
  assert.deepEqual(FEEDBACK_QUESTIONS.map((q) => q.key), ["q1", "q2", "q3", "q4", "q5"]);
  assert.match(FEEDBACK_QUESTIONS[3].text, /learning and growth/);
});

test("every rating is required and must be a whole number from 1 to 5", () => {
  assert.equal(feedbackSchema.safeParse(base).success, true);
  assert.equal(feedbackSchema.safeParse({ ...base, q2: undefined }).success, false);
  assert.equal(feedbackSchema.safeParse({ ...base, q3: 0 }).success, false);
  assert.equal(feedbackSchema.safeParse({ ...base, q4: 6 }).success, false);
  assert.equal(feedbackSchema.safeParse({ ...base, q5: 2.5 }).success, false);
  assert.equal(feedbackSchema.safeParse({ ...base, comment: "x".repeat(1001) }).success, false);
});

test("stored responses carry the version and drop an empty comment", () => {
  assert.deepEqual(toResponses(feedbackSchema.parse({ ...base, comment: "   " })),
    { version: 1, q1: 5, q2: 4, q3: 3, q4: 5, q5: 4 });
  assert.equal(toResponses(feedbackSchema.parse({ ...base, comment: " Great " })).comment, "Great");
});

test("summary gives averages to one decimal and 1-5 counts", () => {
  const [q1, , , q4] = summarizeFeedback([{ q1: 5, q4: 4 }, { q1: 4, q4: 4 }, { q1: 4, q4: 5 }]);
  assert.equal(q1.average, 4.3);
  assert.deepEqual(q1.counts, [0, 0, 0, 2, 1]);
  assert.equal(q4.average, 4.3);
  assert.equal(summarizeFeedback([])[0].average, null);
});
