import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  normalizeSiteManifest,
  upsertSiteManifest,
  validateSiteManifest,
} from "../src/sites/registry.js";

test("site manifests normalize portable defaults and Blogger configuration", () => {
  assert.deepEqual(
    normalizeSiteManifest({
      key: " Example-Site ",
      name: " Example Site ",
      domain: "www.example.com",
      repository: "https://github.com/example/site",
      panel: { key: "example", path: "/paneladmin/example" },
      blogger: { enabled: true },
    }),
    {
      schemaVersion: 1,
      key: "example-site",
      name: "Example Site",
      domain: "example.com",
      productionUrl: "https://www.example.com",
      repository: "https://github.com/example/site",
      panel: { key: "example", path: "/paneladmin/example" },
      analytics: {
        source: "personal",
        envSuffix: "EXAMPLE_SITE",
        legacyDashboard: false,
      },
      blogger: {
        enabled: true,
        url: "https://www.example.com/admin/blogger/",
        apiBase: "/api/posts",
        buildEndpoint: "/api/build",
        publicPostBase: "/f/",
      },
    },
  );
});

test("site manifest validation rejects unknown secret-bearing and local path fields", () => {
  assert.throws(
    () =>
      validateSiteManifest({
        key: "demo",
        name: "Demo",
        domain: "demo.test",
        apiToken: "secret",
      }),
    /campo no permitido: apiToken/i,
  );
  assert.throws(
    () =>
      validateSiteManifest({
        key: "demo",
        name: "Demo",
        domain: "demo.test",
        rootPath: "/Users/name/site",
      }),
    /campo no permitido: rootPath/i,
  );
});

test("registry upsert replaces by key and returns deterministic ordering", () => {
  const registry = [
    { key: "zeta", name: "Zeta", domain: "zeta.test" },
    { key: "alpha", name: "Old Alpha", domain: "old-alpha.test" },
  ];
  const result = upsertSiteManifest(registry, {
    key: "alpha",
    name: "Alpha",
    domain: "alpha.test",
  });

  assert.deepEqual(
    result.map(({ key }) => key),
    ["alpha", "zeta"],
  );
  assert.equal(result[0].name, "Alpha");
  assert.equal(result.length, 2);
});

test("registry upsert preserves Panel-owned Blogger runtime and adapter metadata", () => {
  const registry = [
    {
      schemaVersion: 1,
      key: "agama",
      name: "Agama",
      domain: "agama.com.mx",
      productionUrl: "https://www.agama.com.mx",
      panel: { key: "reports-only", path: "/paneladmin/informes" },
      analytics: {
        source: "agama",
        envSuffix: "AGAMA",
        legacyDashboard: false,
      },
      blogger: {
        enabled: true,
        variant: "vps",
        runtime: "central-multisite",
        url: "https://admin.webfuengirola.com/paneladmin/blogger/agama",
        adapter: "supabase-api",
        capabilities: ["posts", "media", "publish"],
        launchUrl: "https://www.agama.com.mx/api/blogger/launch",
        healthUrl: "https://www.agama.com.mx/api/blogger/health",
      },
    },
  ];

  const [result] = upsertSiteManifest(registry, {
    key: "agama",
    name: "Agama México",
    domain: "agama.com.mx",
    blogger: { enabled: true, variant: "vps" },
  });

  assert.equal(result.name, "Agama México");
  assert.equal(result.blogger.runtime, "central-multisite");
  assert.equal(result.blogger.adapter, "supabase-api");
  assert.deepEqual(result.blogger.capabilities, ["posts", "media", "publish"]);
  assert.equal(
    result.blogger.launchUrl,
    "https://www.agama.com.mx/api/blogger/launch",
  );
  assert.equal(
    result.blogger.healthUrl,
    "https://www.agama.com.mx/api/blogger/health",
  );
});

test("site manifests preserve explicit legacy analytics aliases", () => {
  const site = normalizeSiteManifest({
    key: "todoplastico",
    name: "TodoPlástico",
    domain: "todo-plastico.com",
    analytics: {
      source: "agama",
      legacyDashboard: true,
      legacyKey: "agama",
      legacyLabel: "Todo Plástico legacy",
      envSuffix: "TODOPLASTICO",
    },
  });

  assert.deepEqual(site.analytics, {
    source: "agama",
    envSuffix: "TODOPLASTICO",
    legacyDashboard: true,
    legacyKey: "agama",
    legacyLabel: "Todo Plástico legacy",
  });
});

test("WF-Blogger registers the static and VPS variants with safe public branding paths", () => {
  const staticSite = normalizeSiteManifest({
    key: "static-site",
    name: "Static Site",
    domain: "static.example.com",
    blogger: {
      enabled: true,
      variant: "static",
      runtime: "central-multisite",
      url: "https://portal.webfuengirola.com/acceso/blogger/static-site",
      customOrigin: "https://blogger.static.example.com",
      logoPath: "/brands/static/logo.png",
      previewImagePath: "/brands/static/wf-blogger-preview.webp",
    },
  });
  const vpsSite = normalizeSiteManifest({
    key: "vps-site",
    name: "VPS Site",
    domain: "vps.example.com",
    blogger: {
      enabled: true,
      variant: "vps",
      runtime: "central-multisite",
      url: "https://admin.webfuengirola.com/paneladmin/blogger/vps-site",
    },
  });

  assert.equal(staticSite.blogger.variant, "static");
  assert.equal(
    staticSite.blogger.customOrigin,
    "https://blogger.static.example.com",
  );
  assert.equal(staticSite.blogger.logoPath, "/brands/static/logo.png");
  assert.equal(
    staticSite.blogger.previewImagePath,
    "/brands/static/wf-blogger-preview.webp",
  );
  assert.equal(vpsSite.blogger.variant, "vps");
});

test("WF-Blogger rejects unknown variants and unsafe public branding paths", () => {
  const base = {
    key: "demo",
    name: "Demo",
    domain: "demo.example.com",
    blogger: {
      enabled: true,
      variant: "static",
      runtime: "central-multisite",
      url: "https://portal.webfuengirola.com/acceso/blogger/demo",
    },
  };

  assert.throws(
    () =>
      normalizeSiteManifest({
        ...base,
        blogger: { ...base.blogger, variant: "third-model" },
      }),
    /variant|variante|WF-Blogger/i,
  );
  for (const logoPath of [
    "brands/logo.png",
    "/../secret.png",
    "/logo.png?x=1",
    "https://evil.example/logo.png",
  ]) {
    assert.throws(
      () =>
        normalizeSiteManifest({
          ...base,
          blogger: { ...base.blogger, logoPath },
        }),
      /logoPath|recurso|ruta|WF-Blogger/i,
      logoPath,
    );
  }
});

test("WF-Blogger custom origins must be exact public HTTPS subdomains of the site", () => {
  const base = {
    key: "demo",
    name: "Demo",
    domain: "demo.example.com",
    blogger: {
      enabled: true,
      variant: "static",
      runtime: "central-multisite",
      url: "https://portal.webfuengirola.com/acceso/blogger/demo",
    },
  };

  for (const customOrigin of [
    "https://evil.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://blogger.demo.example.com:8443",
    "https://blogger.demo.example.com/",
    "https://BLOGGER.demo.example.com",
    "https://bad_host.demo.example.com",
    "https://blogger.demo.example.com/path",
  ]) {
    assert.throws(
      () =>
        normalizeSiteManifest({
          ...base,
          blogger: { ...base.blogger, customOrigin },
        }),
      /customOrigin|origen|dominio|público|subdominio/i,
      customOrigin,
    );
  }

  assert.throws(
    () =>
      normalizeSiteManifest({
        ...base,
        blogger: {
          ...base.blogger,
          runtime: "external",
          customOrigin: "https://blogger.demo.example.com",
        },
      }),
    /customOrigin|origen|central|runtime/i,
  );
});

test("the canonical registry identifies Sport Massage as WF-Blogger Static", async () => {
  const registry = JSON.parse(
    await readFile(
      new URL("../src/config/sites.json", import.meta.url),
      "utf8",
    ),
  );
  const sport = registry.find((site) => site.key === "sportmassagefuengirola");

  assert.ok(sport);
  assert.equal(sport.blogger.variant, "static");
  assert.equal(
    sport.blogger.customOrigin,
    "https://blogger.sportmassagefuengirola.com",
  );
  assert.equal(
    sport.blogger.url,
    "https://portal.webfuengirola.com/acceso/blogger/sportmassagefuengirola",
  );
});
