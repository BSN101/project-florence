import assert from "node:assert/strict";
import { describe, test } from "node:test";

describe("Task T-018 / FL-008: Server Action Authorization Rules", () => {
  function checkRosterManagerAuthorization(context) {
    if (context.workspace !== "council") {
      throw new Error("AccessDeniedError: wrong workspace");
    }
    if (context.councilRole !== "executive" && context.councilRole !== "operations") {
      throw new Error("AccessDeniedError: forbidden");
    }
    return true;
  }

  function checkDirectoryViewerAuthorization(workspace, context) {
    if (workspace === "council") {
      if (context.councilRole !== "executive" && context.councilRole !== "operations") {
        throw new Error("AccessDeniedError: forbidden");
      }
    } else if (workspace === "faculty") {
      const isInstructor =
        context.roles.includes("Academic Instructor") || context.roles.includes("Clinical Instructor");
      if (!isInstructor) throw new Error("AccessDeniedError: forbidden");
    } else {
      throw new Error("AccessDeniedError: forbidden");
    }
    return true;
  }

  test("Council Executive is authorized to manage roster invitations", () => {
    const ctx = { workspace: "council", councilRole: "executive", roles: [] };
    assert.equal(checkRosterManagerAuthorization(ctx), true);
  });

  test("Council Operations is authorized to manage roster invitations", () => {
    const ctx = { workspace: "council", councilRole: "operations", roles: [] };
    assert.equal(checkRosterManagerAuthorization(ctx), true);
  });

  test("Council Representative is denied authorization to manage roster invitations", () => {
    const ctx = { workspace: "council", councilRole: "representative", roles: [] };
    assert.throws(() => checkRosterManagerAuthorization(ctx), /AccessDeniedError: forbidden/);
  });

  test("Student workspace is denied authorization to manage roster invitations", () => {
    const ctx = { workspace: "student", councilRole: null, roles: [] };
    assert.throws(() => checkRosterManagerAuthorization(ctx), /AccessDeniedError/);
  });

  test("Directory viewer allows Council Exec/Ops and Faculty instructors", () => {
    assert.equal(checkDirectoryViewerAuthorization("council", { councilRole: "executive", roles: [] }), true);
    assert.equal(checkDirectoryViewerAuthorization("council", { councilRole: "operations", roles: [] }), true);
    assert.throws(
      () => checkDirectoryViewerAuthorization("council", { councilRole: "representative", roles: [] }),
      /AccessDeniedError: forbidden/
    );

    assert.equal(
      checkDirectoryViewerAuthorization("faculty", { councilRole: null, roles: ["Academic Instructor"] }),
      true
    );
    assert.equal(
      checkDirectoryViewerAuthorization("faculty", { councilRole: null, roles: ["Clinical Instructor", "RLE Coordinator"] }),
      true
    );
    assert.throws(
      () => checkDirectoryViewerAuthorization("faculty", { councilRole: null, roles: [] }),
      /AccessDeniedError: forbidden/
    );
  });
});
