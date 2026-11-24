import assert from "node:assert/strict";
import { test } from "node:test";

import { commandRolledBack } from "./contracts.ts";

test("only database-answered errors allow a new request key", () => {
  for (const code of ["22023", "42501", "23505", "P0001", "57014", "PGRST202"]) {
    assert.equal(commandRolledBack({ code }), true, code);
  }
  // Dropped connection (postgrest-js sets code ""), gateway HTML page (no code), or nothing at all.
  for (const error of [{ code: "" }, { message: "<html>502 Bad Gateway</html>" }, null, { code: "ECONNRESET" }]) {
    assert.equal(commandRolledBack(error), false, JSON.stringify(error));
  }
});
