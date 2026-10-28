const TOP_LEVEL_FIELDS = new Set([
  "schemaVersion",
  "key",
  "name",
  "domain",
  "productionUrl",
  "repository",
  "panel",
  "analytics",
  "blogger",
]);

const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function clean(value) {
  return String(value ?? "").trim();
}

function assertHttpsUrl(value, field) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} debe ser una URL valida.`);
  }
  if (url.protocol !== "https:") throw new Error(`${field} debe usar HTTPS.`);
  return url.toString().replace(/\/$/, "");
}

function assertHttpsOrigin(value, field) {
  const normalized = assertHttpsUrl(value, field);
  const url = new URL(normalized);
  if (normalized !== url.origin)
    throw new Error(`${field} debe ser un origen HTTPS sin ruta.`);
  return url.origin;
}

function assertPublicAssetPath(value, field) {
  const path = clean(value);
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("..") ||
    path.includes("?") ||
    path.includes("#") ||
    !/^\/[a-zA-Z0-9/_-]+\.(?:avif|png|svg|webp)$/.test(path)
  )
    throw new Error(`${field} debe ser una ruta pública segura.`);
  return path;
}

export function validateSiteManifest(input = {}) {
  for (const field of Object.keys(input)) {
    if (!TOP_LEVEL_FIELDS.has(field))
      throw new Error(`Campo no permitido: ${field}`);
  }
  const key = clean(input.key).toLowerCase();
  if (!KEY_RE.test(key))
    throw new Error("key debe usar minusculas, numeros y guiones.");
  if (!clean(input.name)) throw new Error("name es obligatorio.");
  const domain = clean(input.domain)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!domain || !domain.includes("."))
    throw new Error("domain debe ser un dominio valido.");
  if (input.productionUrl)
    assertHttpsUrl(clean(input.productionUrl), "productionUrl");
  if (input.repository) assertHttpsUrl(clean(input.repository), "repository");
  if (input.blogger?.url)
    assertHttpsUrl(clean(input.blogger.url), "blogger.url");
  if (
    input.blogger?.variant &&
    !["static", "vps"].includes(input.blogger.variant)
  )
    throw new Error("blogger.variant debe ser static o vps.");
  if (input.blogger?.customOrigin)
    assertHttpsOrigin(
      clean(input.blogger.customOrigin),
      "blogger.customOrigin",
    );
  if (input.blogger?.logoPath)
    assertPublicAssetPath(input.blogger.logoPath, "blogger.logoPath");
  if (input.blogger?.previewImagePath)
    assertPublicAssetPath(
      input.blogger.previewImagePath,
      "blogger.previewImagePath",
    );
  return true;
}

export function normalizeSiteManifest(input = {}) {
  validateSiteManifest(input);
  const key = clean(input.key).toLowerCase();
  const originalDomain = clean(input.domain)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const domain = originalDomain.replace(/^www\./, "");
  const productionUrl = input.productionUrl
    ? assertHttpsUrl(clean(input.productionUrl), "productionUrl")
    : `https://${originalDomain}`;
  const analytics = input.analytics || {};
  const blogger = input.blogger || {};
  const bloggerEnabled = Boolean(blogger.enabled);

  return {
    schemaVersion: 1,
    key,
    name: clean(input.name),
    domain,
    productionUrl,
    ...(input.repository
      ? { repository: assertHttpsUrl(clean(input.repository), "repository") }
      : {}),
    panel: {
      key: clean(input.panel?.key || key),
      path: clean(
        input.panel?.path || `/paneladmin/${input.panel?.key || key}`,
      ),
    },
    analytics: {
      source: clean(analytics.source || "personal"),
      envSuffix: clean(
        analytics.envSuffix || key.replace(/-/g, "_"),
      ).toUpperCase(),
      legacyDashboard: Boolean(analytics.legacyDashboard),
      ...(analytics.legacyKey
        ? { legacyKey: clean(analytics.legacyKey).toLowerCase() }
        : {}),
      ...(analytics.legacyLabel
        ? { legacyLabel: clean(analytics.legacyLabel) }
        : {}),
    },
    blogger: {
      enabled: bloggerEnabled,
      ...(bloggerEnabled
        ? {
            ...(blogger.variant ? { variant: blogger.variant } : {}),
            ...(blogger.customOrigin
              ? {
                  customOrigin: assertHttpsOrigin(
                    clean(blogger.customOrigin),
                    "blogger.customOrigin",
                  ),
                }
              : {}),
            ...(blogger.logoPath
              ? {
                  logoPath: assertPublicAssetPath(
                    blogger.logoPath,
                    "blogger.logoPath",
                  ),
                }
              : {}),
            ...(blogger.previewImagePath
              ? {
                  previewImagePath: assertPublicAssetPath(
                    blogger.previewImagePath,
                    "blogger.previewImagePath",
                  ),
                }
              : {}),
            url: blogger.url
              ? `${assertHttpsUrl(clean(blogger.url), "blogger.url")}/`
              : `${productionUrl}/admin/blogger/`,
            apiBase: clean(blogger.apiBase || "/api/posts"),
            buildEndpoint: clean(blogger.buildEndpoint || "/api/build"),
            publicPostBase: clean(blogger.publicPostBase || "/f/"),
          }
        : {}),
    },
  };
}

export function upsertSiteManifest(registry = [], input = {}) {
  const site = normalizeSiteManifest(input);
  return [
    ...registry.filter((entry) => clean(entry.key).toLowerCase() !== site.key),
    site,
  ]
    .map(normalizeSiteManifest)
    .sort((left, right) => left.key.localeCompare(right.key));
}
