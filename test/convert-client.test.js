import test from "node:test";
import assert from "node:assert/strict";
import { createConvertHandler } from "../supabase/functions/convert-client/handler.js";
const id = "10000000-0000-0000-0000-000000000001";
const request = (authorization, body = { intake_id: id }) =>
  new Request("https://example.test/convert", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : {},
    body: JSON.stringify(body),
  });

test("missing and invalid user tokens cannot invoke conversion", async () => {
  const handler = createConvertHandler(() => ({
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: new Error("invalid"),
      }),
    },
    rpc: () => {
      throw new Error("must not reach database");
    },
  }));
  assert.equal((await handler(request())).status, 401);
  assert.equal((await handler(request("Bearer anonymous-token"))).status, 401);
});
test("authorized request forwards caller token and returns committed client", async () => {
  const handler = createConvertHandler((token) => {
    assert.equal(token, "user-token");
    return {
      auth: {
        getUser: async () => ({ data: { user: { id: "user" } }, error: null }),
      },
      rpc: async (fn, args) => {
        assert.equal(fn, "convert_intake");
        assert.deepEqual(args, {
          p_intake_id: id,
          p_extra_data: {},
          p_notes: "",
        });
        return { data: "client-id", error: null };
      },
    };
  });
  const response = await handler(request("Bearer user-token"));
  assert.deepEqual(await response.json(), { ok: true, client_id: "client-id" });
});
test("RLS refusal stays denied and is not reported as a successful conversion", async () => {
  const handler = createConvertHandler(() => ({
    auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
    rpc: async () => ({
      data: null,
      error: { code: "42501", message: "private detail" },
    }),
  }));
  const response = await handler(request("Bearer user-token"));
  assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /private detail/);
});
