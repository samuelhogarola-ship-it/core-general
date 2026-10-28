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
const LOCAL_SUFFIXES = new Set([
  "localhost",
  "local",
  "internal",
  "lan",
  "home",
  "test",
  "invalid",
  "example",
]);
const BLOGGER_RUNTIMES = new Set([
  "central-multisite",
  "central-legacy",
  "external",
]);
const PANEL_OWNED_BLOGGER_FIELDS = [
  "runtime",
  "adapter",
  "capabilities",
  "launchUrl",
  "healthUrl",
  "contentDir",
];

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
  const original = clean(value);
  let url;
  try {
    url = new URL(original);
  } catch {
    throw new Error(`${field} debe ser un origen HTTPS sin ruta.`);
  }
  if (
    url.protocol !== "https:" ||
    original !== url.origin ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  )
    throw new Error(`${field} debe ser un origen HTTPS sin ruta.`);
  return url.origin;
}

function isIpLiteral(hostname) {
  if (hostname.includes(":")) return true;
  const parts = hostname.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
}

function assertCustomOrigin(value, domain) {
  const origin = assertHttpsOrigin(value, "blogger.customOrigin");
  const hostname = new URL(origin).hostname.toLowerCase();
  const labels = hostname.split(".");
  const suffix = labels.at(-1);
  if (
    isIpLiteral(hostname) ||
    labels.length < 2 ||
    labels.some(
      (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    ) ||
    !suffix ||
    LOCAL_SUFFIXES.has(suffix) ||
    (!/^[a-z]{2,63}$/.test(suffix) && !/^xn--[a-z0-9-]{2,59}$/.test(suffix)) ||
    hostname === domain ||
    !hostname.endsWith(`.${domain}`)
  ) {
    throw new Error(
      "blogger.customOrigin debe ser un subdominio HTTPS público del sitio.",
    );
  }
  return origin;
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
  if (input.blogger?.variant && !BLOGGER_RUNTIMES.has(input.blogger?.runtime))
    throw new Error(
      "blogger.runtime es obligatorio para una variante central de WF-Blogger.",
    );
  if (input.blogger?.variant && !input.blogger?.url)
    throw new Error(
      "blogger.url es obligatoria para una variante central de WF-Blogger.",
    );
  if (input.blogger?.customOrigin)
    assertCustomOrigin(clean(input.blogger.customOrigin), domain);
  if (
    input.blogger?.customOrigin &&
    !["central-multisite", "central-legacy"].includes(input.blogger.runtime)
  )
    throw new Error(
      "blogger.customOrigin requiere un runtime central de WF-Blogger.",
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
            ...(blogger.runtime ? { runtime: blogger.runtime } : {}),
            ...(blogger.customOrigin
              ? {
                  customOrigin: assertCustomOrigin(
                    clean(blogger.customOrigin),
                    domain,
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
  const existing = registry.find(
    (entry) =>
      clean(entry.key).toLowerCase() === clean(input.key).toLowerCase(),
  );
  const existingPortable = existing
    ? Object.fromEntries(
        Object.entries(existing).filter(([field]) =>
          TOP_LEVEL_FIELDS.has(field),
        ),
      )
    : null;
  const hydratedInput = existing
    ? {
        ...existingPortable,
        ...input,
        panel: { ...existing.panel, ...input.panel },
        analytics: { ...existing.analytics, ...input.analytics },
        blogger: { ...existing.blogger, ...input.blogger },
      }
    : input;
  const site = normalizeSiteManifest(hydratedInput);
  const merged = existing
    ? {
        ...existing,
        ...site,
        panel: { ...existing.panel, ...site.panel },
        analytics: { ...existing.analytics, ...site.analytics },
        blogger: site.blogger.enabled
          ? { ...existing.blogger, ...site.blogger }
          : { enabled: false },
      }
    : site;
  if (site.blogger.enabled && existing?.blogger) {
    for (const field of PANEL_OWNED_BLOGGER_FIELDS) {
      if (existing.blogger[field] !== undefined)
        merged.blogger[field] = existing.blogger[field];
    }
  }
  return [
    ...registry.filter((entry) => clean(entry.key).toLowerCase() !== site.key),
    merged,
  ].sort((left, right) => clean(left.key).localeCompare(clean(right.key)));
}
