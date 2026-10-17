import { normalizeSiteManifest } from "../sites/registry.js";

export function createBloggerConfig(siteInput, overrides = {}) {
  const site = normalizeSiteManifest(siteInput);
  if (!site.blogger.enabled)
    throw new Error("Blogger no esta habilitado para este sitio.");
  return {
    siteName: site.name,
    defaultAuthor: site.name,
    defaultLanguage: "es",
    apiBase: site.blogger.apiBase,
    buildEndpoint: site.blogger.buildEndpoint,
    publicPostBase: site.blogger.publicPostBase,
    authModule: "/assets/js/blogger-auth.js",
    ...overrides,
  };
}

export function renderBloggerRuntimeConfig(config = {}) {
  return JSON.stringify(config).replace(/</g, "\\u003c");
}
