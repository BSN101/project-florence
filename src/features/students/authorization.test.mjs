import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  isAuthorizedDirectoryViewer,
  isAuthorizedRosterManager,
} from "./contracts.ts";

describe("Task T-018 / FL-008: Server Action Authorization Rules", () => {
  test("Council Executive is authorized to manage roster invitations", () => {
    assert.equal(isAuthorizedRosterManager("executive"), true);
  });

  test("Council Operations is authorized to manage roster invitations", () => {
    assert.equal(isAuthorizedRosterManager("operations"), true);
  });

  test("Council Representative is denied authorization to manage roster invitations", () => {
    assert.equal(isAuthorizedRosterManager("representative"), false);
  });

  test("Student or unassigned role is denied authorization to manage roster invitations", () => {
    assert.equal(isAuthorizedRosterManager(null), false);
    assert.equal(isAuthorizedRosterManager(undefined), false);
  });

  test("Directory viewer allows Council Exec/Ops and Faculty instructors", () => {
    assert.equal(isAuthorizedDirectoryViewer("council", "executive", []), true);
    assert.equal(isAuthorizedDirectoryViewer("council", "operations", []), true);
    assert.equal(isAuthorizedDirectoryViewer("council", "representative", []), false);

    assert.equal(
      isAuthorizedDirectoryViewer("faculty", null, ["Academic Instructor"]),
      true
    );
    assert.equal(
      isAuthorizedDirectoryViewer("faculty", null, ["Clinical Instructor", "RLE Coordinator"]),
      true
    );
    assert.equal(
      isAuthorizedDirectoryViewer("faculty", null, ["Platform Admin"]),
      false
    );
    assert.equal(
      isAuthorizedDirectoryViewer("faculty", null, []),
      false
    );
  });
});
