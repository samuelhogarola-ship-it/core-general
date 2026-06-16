/**
 * core-general · intake/form.js
 * Helper de frontend para enviar un formulario de intake a Supabase.
 * Agnóstico de framework — funciona en HTML puro, React, Vue, etc.
 *
 * Uso:
 *   import { submitIntake } from 'core-general/src/intake/form.js';
 *   await submitIntake(config, formData);
 */

/**
 * Envía un intake a Supabase.
 *
 * @param {object} config  - PROJECT_CONFIG del proyecto
 * @param {object} data    - Datos del formulario
 * @param {string} data.name
 * @param {string} [data.email]
 * @param {string} [data.phone]
 * @param {object} [data.extra]  - Campos adicionales → van a intake.data
 * @returns {Promise<{ok: boolean, id?: string, error?: string}>}
 */
export async function submitIntake(config, data) {
  const { name, email, phone, extra = {} } = data;

  // Anti-spam: delay mínimo de 2.5s desde que se cargó el form
  if (data._startedAt) {
    const elapsed = Date.now() - data._startedAt;
    if (elapsed < 2500) {
      await new Promise((r) => setTimeout(r, 2500 - elapsed));
    }
  }

  const payload = {
    tenant_id:  config.tenant_id,
    form_type:  config.form_type,
    name,
    email:      email || null,
    phone:      phone || null,
    data:       extra,
    source:     window?.location?.pathname || null,
    user_agent: navigator?.userAgent || null,
  };

  try {
    const res = await fetch(
      `${config.supabase_url}/rest/v1/intake`,
      {
        method:  "POST",
        headers: {
          "apikey":        config.supabase_publishable_key,
          "Authorization": `Bearer ${config.supabase_publishable_key}`,
          "Content-Type":  "application/json",
          "Prefer":        "return=representation",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      return { ok: false, error: err?.message || "Error desconocido" };
    }

    const [record] = await res.json();
    return { ok: true, id: record?.id };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Inicializa el anti-spam en un formulario HTML.
 * Llámalo cuando el form se renderiza.
 *
 * @param {HTMLFormElement} form
 */
export function initIntakeForm(form) {
  if (!form) return;
  form.dataset.startedAt = String(Date.now());
}

/**
 * Lee el campo honeypot. Si tiene valor, es spam.
 *
 * @param {HTMLFormElement} form
 * @param {string} [selector="#intake-hp"]
 * @returns {boolean}
 */
export function isSpam(form, selector = "#intake-hp") {
  return !!form.querySelector(selector)?.value?.trim();
}
