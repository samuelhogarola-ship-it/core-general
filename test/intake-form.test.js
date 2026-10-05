import test from "node:test";
import assert from "node:assert/strict";
import { submitIntake } from "../src/intake/form.js";

test("public intake succeeds with insert-only permissions and no response body", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    // PostgREST requires SELECT for a representation; anonymous callers have INSERT only.
    if (options.headers.Prefer === "return=representation") {
      return Response.json(
        { message: "permission denied for table intake" },
        { status: 403 },
      );
    }
    assert.equal(options.headers.Prefer, "return=minimal");
    assert.equal(options.headers.apikey, "sb_publishable_test");
    assert.equal(options.headers.Authorization, undefined);
    return new Response(null, { status: 201 });
  });
  globalThis.window = { location: { pathname: "/contact" } };
  t.after(() => delete globalThis.window);
  const result = await submitIntake(
    {
      supabase_url: "https://example.test",
      supabase_publishable_key: "sb_publishable_test",
      tenant_id: "a",
      form_type: "lead",
    },
    { name: "Ana" },
  );
  assert.deepEqual(result, { ok: true });
});
