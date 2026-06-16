/**
 * core-general · intake/questionnaire.js
 * Helper reutilizable para cuestionarios multipaso con campos libres y adjuntos.
 *
 * Pensado para proyectos tipo Saulo donde:
 * - el frontend recoge respuestas estructuradas
 * - el backend las guarda en Supabase
 * - Resend envía la notificación o resumen
 *
 * Este helper no decide la persistencia. Solo normaliza y envía el payload al
 * endpoint del proyecto.
 *
 * IMPORTANTE — formularios multipaso:
 * Añadir `novalidate` al elemento <form>. Sin él, el navegador intenta validar
 * campos `required` que están en pasos ocultos (display:none) y bloquea el
 * envío silenciosamente sin mostrar ningún error visible al usuario.
 */

/**
 * Convierte un FormData del navegador en un payload estable para backend.
 *
 * @param {FormData} formData
 * @param {object} options
 * @param {string} options.projectSlug
 * @param {string} [options.formType="questionnaire"]
 * @param {Record<string, string>} [options.fieldMap]
 * @param {string[]} [options.multiValueFields]
 * @returns {{submission: object, files: Record<string, File>}}
 */
export function buildQuestionnaireSubmission(formData, options) {
  const {
    projectSlug,
    formType = "questionnaire",
    fieldMap = {},
    multiValueFields = [],
  } = options;

  const answers = {};
  const files = {};

  const uniqueKeys = [...new Set(formData.keys())];

  uniqueKeys.forEach((key) => {
    const mappedKey = fieldMap[key] || key;
    const values = formData.getAll(key);
    const hasFile = values.some((value) => value instanceof File && value.name);

    if (hasFile) {
      const file = values.find((value) => value instanceof File && value.name);
      if (file) {
        files[mappedKey] = file;
        answers[mappedKey] = {
          name: file.name,
          size: file.size,
          type: file.type,
        };
      }
      return;
    }

    const normalizedValues = values
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (multiValueFields.includes(mappedKey)) {
      answers[mappedKey] = normalizedValues;
      return;
    }

    answers[mappedKey] = normalizedValues[0] || null;
  });

  return {
    submission: {
      submittedAt: new Date().toISOString(),
      tenantId: projectSlug,
      formType,
      answers,
    },
    files,
  };
}

/**
 * Envía el cuestionario a un endpoint del proyecto.
 *
 * @param {object} config
 * @param {string} config.endpoint
 * @param {string} config.projectSlug
 * @param {string} [config.formType]
 * @param {Record<string, string>} [config.fieldMap]
 * @param {string[]} [config.multiValueFields]
 * @param {HTMLFormElement} form
 * @returns {Promise<{ok: boolean, data?: any, error?: string}>}
 */
export async function submitQuestionnaire(config, form) {
  const formData = new FormData(form);
  const { submission } = buildQuestionnaireSubmission(formData, config);

  const requestBody = new FormData();
  requestBody.set("submission", JSON.stringify(submission));

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      if (value.name) {
        requestBody.append(key, value);
      }
      continue;
    }

    requestBody.append(key, value);
  }

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      body: requestBody,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        error: data?.message || "No se pudo enviar el cuestionario.",
      };
    }

    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

/**
 * Crea una lista plana de respuestas para emails o paneles.
 *
 * @param {Record<string, any>} answers
 * @returns {Array<{label: string, value: string}>}
 */
export function flattenQuestionnaireAnswers(answers) {
  return Object.entries(answers).map(([key, rawValue]) => {
    const value = Array.isArray(rawValue)
      ? rawValue.join(", ")
      : typeof rawValue === "object" && rawValue !== null
        ? JSON.stringify(rawValue)
        : String(rawValue ?? "");

    return {
      label: key,
      value,
    };
  });
}
