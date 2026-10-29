#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createBloggerConfig,
  renderBloggerRuntimeConfig,
} from "../src/blogger/config.js";
import { normalizeAnalyticsProfile } from "../src/analytics/profile.js";
import {
  normalizeSiteManifest,
  upsertSiteManifest,
} from "../src/sites/registry.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--blogger" || argument === "--legacy-dashboard") {
      result[argument.slice(2)] = true;
      continue;
    }
    if (!argument.startsWith("--") || !argv[index + 1])
      throw new Error(`Argumento invalido: ${argument}`);
    result[argument.slice(2)] = argv[index + 1];
    index += 1;
  }
  return result;
}

async function readRegistry(registryPath) {
  try {
    const parsed = JSON.parse(await readFile(registryPath, "utf8"));
    if (!Array.isArray(parsed))
      throw new Error("El registro de Panel Studio debe ser un array JSON.");
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function installBlogger(siteRoot, site, args) {
  const target = path.resolve(siteRoot, args["blogger-dir"] || "admin/blogger");
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(packageRoot, "blogger", "editor"), target, {
    recursive: true,
    force: true,
  });
  const runtime = createBloggerConfig(site, {
    ...(args["auth-module"] ? { authModule: args["auth-module"] } : {}),
    ...(args.author ? { defaultAuthor: args.author } : {}),
    ...(args.language ? { defaultLanguage: args.language } : {}),
  });
  const indexPath = path.join(target, "index.html");
  const html = await readFile(indexPath, "utf8");
  await writeFile(
    indexPath,
    html.replace(
      /(<script id="bloggerConfig" type="application\/json">)[\s\S]*?(<\/script>)/,
      (_, open, close) =>
        `${open}${renderBloggerRuntimeConfig(runtime)}${close}`,
    ),
    "utf8",
  );
}

export async function onboardSite(args) {
  for (const required of ["root", "panel-root", "key", "name", "domain"]) {
    if (!args[required]) throw new Error(`Falta --${required}`);
  }
  const siteRoot = path.resolve(args.root);
  const panelRoot = path.resolve(args["panel-root"]);
  const analyticsProfile = args["analytics-profile"]
    ? normalizeAnalyticsProfile(
        JSON.parse(
          await readFile(path.resolve(args["analytics-profile"]), "utf8"),
        ),
      )
    : null;
  const siteInput = {
    key: args.key,
    name: args.name,
    domain: args.domain,
    ...(args.url ? { productionUrl: args.url } : {}),
    ...(args.repository ? { repository: args.repository } : {}),
    panel: {
      ...(args["panel-key"] ? { key: args["panel-key"] } : {}),
      ...(args["panel-path"] ? { path: args["panel-path"] } : {}),
    },
    analytics: {
      ...(args["analytics-source"] ? { source: args["analytics-source"] } : {}),
      ...(args["analytics-env-suffix"]
        ? { envSuffix: args["analytics-env-suffix"] }
        : {}),
      ...(args["analytics-legacy-key"]
        ? { legacyKey: args["analytics-legacy-key"] }
        : {}),
      ...(args["analytics-legacy-label"]
        ? { legacyLabel: args["analytics-legacy-label"] }
        : {}),
      ...(args["legacy-dashboard"] ? { legacyDashboard: true } : {}),
      ...(analyticsProfile ? { profile: analyticsProfile } : {}),
    },
    blogger: {
      enabled: Boolean(args.blogger),
      ...(args["blogger-variant"] ? { variant: args["blogger-variant"] } : {}),
      ...(args["blogger-runtime"] ? { runtime: args["blogger-runtime"] } : {}),
      ...(args["blogger-custom-origin"]
        ? { customOrigin: args["blogger-custom-origin"] }
        : {}),
      ...(args["blogger-logo-path"]
        ? { logoPath: args["blogger-logo-path"] }
        : {}),
      ...(args["blogger-preview-image-path"]
        ? { previewImagePath: args["blogger-preview-image-path"] }
        : {}),
      ...(args["blogger-url"] ? { url: args["blogger-url"] } : {}),
      ...(args["api-base"] ? { apiBase: args["api-base"] } : {}),
      ...(args["build-endpoint"]
        ? { buildEndpoint: args["build-endpoint"] }
        : {}),
      ...(args["public-post-base"]
        ? { publicPostBase: args["public-post-base"] }
        : {}),
    },
  };
  const site = normalizeSiteManifest(siteInput);

  const manifestPath = path.join(siteRoot, ".web-core", "site.json");
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(site, null, 2)}\n`, "utf8");

  const registryPath = path.join(panelRoot, "src", "config", "sites.json");
  const registry = upsertSiteManifest(
    await readRegistry(registryPath),
    siteInput,
  );
  await mkdir(path.dirname(registryPath), { recursive: true });
  await writeFile(
    registryPath,
    `${JSON.stringify(registry, null, 2)}\n`,
    "utf8",
  );

  const installLegacyEditor = site.blogger.enabled && !site.blogger.variant;
  if (installLegacyEditor) await installBlogger(siteRoot, site, args);
  if (analyticsProfile) {
    await cp(
      path.join(packageRoot, "src", "analytics", "umami-browser.js"),
      path.join(siteRoot, "umami-analytics-core.js"),
      { force: true },
    );
    await writeFile(
      path.join(siteRoot, "analytics-profile.json"),
      `${JSON.stringify(analyticsProfile, null, 2)}\n`,
      "utf8",
    );
  }
  return {
    manifestPath,
    registryPath,
    bloggerInstalled: installLegacyEditor,
    analyticsInstalled: Boolean(analyticsProfile),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await onboardSite(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
