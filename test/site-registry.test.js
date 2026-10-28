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
      customOrigin: "https://blogger.static.example.com",
      logoPath: "/brands/static/logo.png",
      previewImagePath: "/brands/static/wf-blogger-preview.webp",
    },
  });
  const vpsSite = normalizeSiteManifest({
    key: "vps-site",
    name: "VPS Site",
    domain: "vps.example.com",
    blogger: { enabled: true, variant: "vps" },
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
    blogger: { enabled: true, variant: "static" },
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
    "https://blogger.sportmassagefuengirola.com/",
  );
});
