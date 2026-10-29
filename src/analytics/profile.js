export const ANALYTICS_SCHEMA_VERSION = 1;

const PROFILE_FIELDS = new Set([
  "schemaVersion",
  "languages",
  "sections",
  "allowedEvents",
  "allowedContextKeys",
  "excludedDestinations",
]);
const DIMENSION_FIELDS = new Set(["key", "label", "routes"]);
const ROUTE_FIELDS = new Set(["exact", "prefixes"]);
const EVENT_FIELDS = new Set(["key", "label", "category"]);
const KEY_RE = /^[a-z][a-z0-9_-]{0,39}$/;
const CONTEXT_KEY_RE = /^[a-z][A-Za-z0-9]{0,39}$/;
const MAX_DIMENSIONS = 32;
const MAX_EVENTS = 64;
const MAX_CONTEXT_KEYS = 32;
const MAX_DESTINATIONS = 32;
const MAX_PATHS = 128;
const MAX_PATH_LENGTH = 256;
const MAX_LABEL_LENGTH = 80;

function assertObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} debe ser un objeto.`);
  }
}

function rejectUnknown(value, allowed, field) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${field}.${key} no está permitido.`);
    }
  }
}

function normalizeKey(value, field, pattern = KEY_RE) {
  const key = String(value ?? "").trim();
  if (!pattern.test(key)) throw new Error(`${field}.key no es válido.`);
  return key;
}

function normalizeLabel(value, field) {
  const label = String(value ?? "").trim();
  if (!label || label.length > MAX_LABEL_LENGTH) {
    throw new Error(`${field}.label no es válido.`);
  }
  return label;
}

function normalizePath(value, field, prefix = false) {
  let path = String(value ?? "").trim();
  if (!path || path.length > MAX_PATH_LENGTH || /[?#]/.test(path)) {
    throw new Error(`${field} contiene una ruta no válida.`);
  }
  if (/^(?:[a-z]+:)?\/\//i.test(path) || path.includes("..")) {
    throw new Error(`${field} contiene una ruta no válida.`);
  }
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path !== "/") path = path.replace(/\/+$/, "");
  if (prefix && path !== "/") path = `${path}/`;
  return path;
}

function normalizePaths(input, field, prefix) {
  const values = input ?? [];
  if (!Array.isArray(values) || values.length > MAX_PATHS) {
    throw new Error(`${field} debe ser una lista de rutas acotada.`);
  }
  return [
    ...new Set(values.map((value) => normalizePath(value, field, prefix))),
  ];
}

function normalizeDimensions(input, field) {
  const values = input ?? [];
  if (!Array.isArray(values) || values.length > MAX_DIMENSIONS) {
    throw new Error(`${field} debe ser una lista acotada.`);
  }
  const seen = new Set();
  return values.map((value, index) => {
    const itemField = `${field}[${index}]`;
    assertObject(value, itemField);
    rejectUnknown(value, DIMENSION_FIELDS, itemField);
    const key = normalizeKey(value.key, itemField);
    if (seen.has(key))
      throw new Error(`${field} contiene una key duplicada: ${key}.`);
    seen.add(key);
    const routes = value.routes ?? {};
    assertObject(routes, `${itemField}.routes`);
    rejectUnknown(routes, ROUTE_FIELDS, `${itemField}.routes`);
    return {
      key,
      label: normalizeLabel(value.label, itemField),
      routes: {
        exact: normalizePaths(routes.exact, `${itemField}.routes.exact`, false),
        prefixes: normalizePaths(
          routes.prefixes,
          `${itemField}.routes.prefixes`,
          true,
        ),
      },
    };
  });
}

function normalizeEvents(input) {
  const values = input ?? [];
  if (!Array.isArray(values) || values.length > MAX_EVENTS) {
    throw new Error("allowedEvents debe ser una lista acotada.");
  }
  const seen = new Set();
  return values.map((value, index) => {
    const field = `allowedEvents[${index}]`;
    assertObject(value, field);
    rejectUnknown(value, EVENT_FIELDS, field);
    const key = normalizeKey(value.key, field);
    if (seen.has(key))
      throw new Error(`allowedEvents contiene una key duplicada: ${key}.`);
    seen.add(key);
    const category = value.category
      ? normalizeKey(value.category, `${field}.category`)
      : "general";
    return { key, label: normalizeLabel(value.label, field), category };
  });
}

function normalizeContextKeys(input) {
  const values = input ?? [];
  if (!Array.isArray(values) || values.length > MAX_CONTEXT_KEYS) {
    throw new Error("allowedContextKeys debe ser una lista acotada.");
  }
  const normalized = values.map((value, index) =>
    normalizeKey(value, `allowedContextKeys[${index}]`, CONTEXT_KEY_RE),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("allowedContextKeys contiene una key duplicada.");
  }
  return normalized;
}

function normalizeDestinations(input) {
  const values = input ?? [];
  if (!Array.isArray(values) || values.length > MAX_DESTINATIONS) {
    throw new Error("excludedDestinations debe ser una lista acotada.");
  }
  return [
    ...new Set(
      values.map((value, index) => {
        const text = String(value ?? "").trim();
        let url;
        try {
          url = new URL(text);
        } catch {
          throw new Error(
            `excludedDestinations[${index}] debe ser una URL pública.`,
          );
        }
        if (
          !/^https?:$/.test(url.protocol) ||
          url.username ||
          url.password ||
          text.length > 512
        ) {
          throw new Error(
            `excludedDestinations[${index}] debe ser una URL pública.`,
          );
        }
        return url.toString().replace(/\/$/, "");
      }),
    ),
  ];
}

export function normalizeAnalyticsProfile(input = {}) {
  assertObject(input, "analyticsProfile");
  rejectUnknown(input, PROFILE_FIELDS, "analyticsProfile");
  if (
    input.schemaVersion !== undefined &&
    Number(input.schemaVersion) !== ANALYTICS_SCHEMA_VERSION
  ) {
    throw new Error(`schemaVersion debe ser ${ANALYTICS_SCHEMA_VERSION}.`);
  }
  return {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    languages: normalizeDimensions(input.languages, "languages"),
    sections: normalizeDimensions(input.sections, "sections"),
    allowedEvents: normalizeEvents(input.allowedEvents),
    allowedContextKeys: normalizeContextKeys(input.allowedContextKeys),
    excludedDestinations: normalizeDestinations(input.excludedDestinations),
  };
}

function resolveDimension(items, pathname) {
  const exact = [];
  const prefixes = [];
  for (const item of items) {
    for (const path of item.routes.exact) exact.push({ key: item.key, path });
    for (const path of item.routes.prefixes)
      prefixes.push({ key: item.key, path });
  }
  exact.sort((left, right) => right.path.length - left.path.length);
  prefixes.sort((left, right) => right.path.length - left.path.length);
  return (
    exact.find((rule) => pathname === rule.path)?.key ||
    prefixes.find((rule) => rule.path === "/" || pathname.startsWith(rule.path))
      ?.key ||
    ""
  );
}

function normalizeRuntimePath(value) {
  const raw = String(value ?? "/").split(/[?#]/, 1)[0] || "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash === "/" ? "/" : withSlash.replace(/\/+$/, "");
}

export function resolveAnalyticsContext(profileInput, context = {}) {
  const profile = normalizeAnalyticsProfile(profileInput);
  const pathname = normalizeRuntimePath(context.pathname);
  let contentLanguage = resolveDimension(profile.languages, pathname);
  if (!contentLanguage) {
    const documentLanguage = String(context.documentLanguage ?? "")
      .trim()
      .toLowerCase()
      .split("-")[0];
    if (profile.languages.some(({ key }) => key === documentLanguage)) {
      contentLanguage = documentLanguage;
    }
  }
  return {
    contentLanguage,
    section: resolveDimension(profile.sections, pathname),
  };
}
