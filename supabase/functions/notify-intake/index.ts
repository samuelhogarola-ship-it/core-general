/**
 * core-general · notify-intake
 * Edge Function que envía un email al equipo cuando llega un intake nuevo.
 *
 * Variables de entorno requeridas (supabase secrets set):
 *   RESEND_API_KEY   — API key de Resend
 *
 * Variables opcionales por proyecto (se pasan en intake.data o en config):
 *   La config por proyecto se lee del campo tenant_id del record.
 *   Añade un objeto TENANT_CONFIG en esta función o usa una tabla de config.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

// ── Config por tenant ──────────────────────────────────────────────────────────
// Añade aquí cada proyecto que use este Supabase.
const TENANT_CONFIG: Record<string, {
  notify_to: string;
  project_name: string;
  from: string;
}> = {
  "agama": {
    notify_to:    "ventas@agama.com.mx",
    project_name: "AGAMA Pigmentos & Masterbatch",
    from:         "AGAMA Web <onboarding@resend.dev>",
  },
  // Añade más proyectos aquí:
  // "clinica-x": {
  //   notify_to:    "admin@clinicax.com",
  //   project_name: "Clínica X",
  //   from:         "Clínica X <onboarding@resend.dev>",
  // },
};

const DEFAULT_CONFIG = {
  notify_to:    Deno.env.get("DEFAULT_NOTIFY_TO") || "admin@example.com",
  project_name: "Core General",
  from:         "Core General <onboarding@resend.dev>",
};

// ── Handler ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const payload = await req.json();
  const record = payload?.record;

  if (!record) {
    return new Response("No record", { status: 400 });
  }

  const tenant = TENANT_CONFIG[record.tenant_id] || DEFAULT_CONFIG;
  const { name, email, phone, form_type, data, source, created_at } = record;
  const extra = data || {};

  // Construye filas de campos extra
  const extraRows = Object.entries(extra)
    .map(([k, v]) => `<tr>
      <td style="padding:8px;color:#555;width:140px"><strong>${k}</strong></td>
      <td style="padding:8px;color:#222">${v}</td>
    </tr>`)
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#002f6c;padding:24px;border-radius:8px 8px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:18px">
          ${tenant.project_name}
        </h2>
      </div>
      <div style="background:#f7f8fa;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;">
        <h3 style="color:#002f6c;margin:0 0 16px">
          Nuevo intake — <em>${form_type}</em>
        </h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:8px;color:#555;width:140px"><strong>Nombre</strong></td>
            <td style="padding:8px;color:#222">${name}</td>
          </tr>
          ${email ? `<tr>
            <td style="padding:8px;color:#555"><strong>Email</strong></td>
            <td style="padding:8px"><a href="mailto:${email}" style="color:#0055b3">${email}</a></td>
          </tr>` : ""}
          ${phone ? `<tr>
            <td style="padding:8px;color:#555"><strong>Teléfono</strong></td>
            <td style="padding:8px;color:#222">${phone}</td>
          </tr>` : ""}
          ${extraRows}
          <tr>
            <td style="padding:8px;color:#555"><strong>Origen</strong></td>
            <td style="padding:8px;color:#888;font-size:12px">${source || "-"} · ${created_at}</td>
          </tr>
        </table>
        ${email ? `
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
          <a href="mailto:${email}?subject=Re: Tu solicitud en ${tenant.project_name}"
             style="background:#0055b3;color:#fff;padding:10px 20px;border-radius:6px;
                    text-decoration:none;font-weight:600;display:inline-block">
            Responder a ${name}
          </a>
        </div>` : ""}
      </div>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:     tenant.from,
      to:       [tenant.notify_to],
      reply_to: email || undefined,
      subject:  `[${tenant.project_name}] Nuevo ${form_type} — ${name}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    return new Response(`Resend error: ${err}`, { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
