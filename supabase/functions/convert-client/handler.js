const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers });

// The factory must create a client using this caller's token, never a service role.
export function createConvertHandler(clientForToken) {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers });
    if (req.method !== "POST")
      return reply(405, { ok: false, error: "Method not allowed" });
    const token = req.headers
      .get("Authorization")
      ?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token)
      return reply(401, { ok: false, error: "Authentication required" });
    try {
      const client = clientForToken(token);
      const { data, error } = await client.auth.getUser(token);
      if (error || !data?.user)
        return reply(401, { ok: false, error: "Authentication required" });
      let body;
      try {
        body = await req.json();
      } catch {
        return reply(400, { ok: false, error: "Invalid JSON" });
      }
      const { intake_id, extra_data = {}, notes = "" } = body ?? {};
      if (
        typeof intake_id !== "string" ||
        !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(intake_id) ||
        !extra_data ||
        typeof extra_data !== "object" ||
        Array.isArray(extra_data) ||
        typeof notes !== "string"
      ) {
        return reply(400, { ok: false, error: "Invalid conversion data" });
      }
      const result = await client.rpc("convert_intake", {
        p_intake_id: intake_id,
        p_extra_data: extra_data,
        p_notes: notes,
      });
      if (result.error) {
        const status = result.error.code === "42501" ? 403 : 500;
        return reply(status, {
          ok: false,
          error: status === 403 ? "Intake unavailable" : "Conversion failed",
        });
      }
      return reply(200, { ok: true, client_id: result.data });
    } catch {
      return reply(500, { ok: false, error: "Conversion failed" });
    }
  };
}
