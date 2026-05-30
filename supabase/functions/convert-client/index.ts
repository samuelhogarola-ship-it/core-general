/**
 * core-general · convert-client
 * Edge Function que convierte un intake en un client validado.
 *
 * POST /functions/v1/convert-client
 * Body: { intake_id: string, extra_data?: object, notes?: string }
 *
 * Requiere autenticación (JWT del usuario que hace la conversión).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { intake_id, extra_data = {}, notes = "" } = await req.json();

  if (!intake_id) {
    return new Response(
      JSON.stringify({ ok: false, error: "intake_id requerido" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 1. Lee el intake
  const { data: intake, error: readErr } = await sb
    .from("intake")
    .select("*")
    .eq("id", intake_id)
    .single();

  if (readErr || !intake) {
    return new Response(
      JSON.stringify({ ok: false, error: "Intake no encontrado" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // 2. Crea el client
  const { data: client, error: insertErr } = await sb
    .from("clients")
    .insert({
      tenant_id:  intake.tenant_id,
      intake_id:  intake.id,
      name:       intake.name,
      email:      intake.email,
      phone:      intake.phone,
      data:       { ...intake.data, ...extra_data },
      notes,
    })
    .select()
    .single();

  if (insertErr) {
    return new Response(
      JSON.stringify({ ok: false, error: insertErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3. Marca el intake como done
  await sb
    .from("intake")
    .update({ status: "done" })
    .eq("id", intake_id);

  return new Response(
    JSON.stringify({ ok: true, client_id: client.id }),
    { headers: { "Content-Type": "application/json" } }
  );
});
