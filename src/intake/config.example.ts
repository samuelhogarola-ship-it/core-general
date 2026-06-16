/**
 * core-general · intake config
 * Copia este archivo como config.ts en cada proyecto y rellena los valores.
 */

export const PROJECT_CONFIG = {
  // Identificador único del proyecto (slug, sin espacios)
  tenant_id: "mi-proyecto",

  // Tipo de formulario — determina qué campos se muestran y cómo se etiquetan
  // Opciones: "client" | "patient" | "lead" | "student"
  form_type: "client",

  // Email que recibe la notificación cuando llega un intake nuevo
  notify_to: "admin@miproyecto.com",

  // Nombre del proyecto — aparece en el asunto del email
  project_name: "Mi Proyecto",

  // Supabase
  supabase_url: "https://xxxx.supabase.co",
  supabase_publishable_key: "sb_publishable_xxxx",

  // Resend
  resend_from: "Mi Proyecto <noreply@midominio.com>",

  // Campos extra del formulario (se guardan en intake.data)
  // Ejemplo para clínica: ["birth_date", "insurance", "reason"]
  // Ejemplo para lead:    ["company", "budget", "timeline"]
  extra_fields: [] as string[],
};

export type ProjectConfig = typeof PROJECT_CONFIG;
