#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeSiteManifest,
  upsertSiteManifest,
} from "../src/sites/registry.js";

const BLOGGER_STUDIO_ORIGIN = "https://admin.webfuengirola.com";
const SITE_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  if (!SITE_KEY_RE.test(site.key))
    throw new Error("La key de Blogger no es valida.");
  const destination = `${BLOGGER_STUDIO_ORIGIN}/acceso/blogger/${encodeURIComponent(site.key)}`;
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="referrer" content="no-referrer">
    <meta http-equiv="refresh" content="0; url=${destination}">
    <title>Abriendo Blogger</title>
  </head>
  <body>
    <p><a href="${destination}" rel="noreferrer">Abrir Blogger</a></p>
  </body>
</html>
`;
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, "index.html"), html, "utf8");
}

export async function onboardSite(args) {
  for (const required of ["root", "panel-root", "key", "name", "domain"]) {
    if (!args[required]) throw new Error(`Falta --${required}`);
  }
  const siteRoot = path.resolve(args.root);
  const panelRoot = path.resolve(args["panel-root"]);
  const site = normalizeSiteManifest({
    key: args.key,
    name: args.name,
    domain: args.domain,
    ...(args.url ? { productionUrl: args.url } : {}),
    ...(args.repository ? { repository: args.repository } : {}),
    panel: {
      key: args["panel-key"] || args.key,
      path:
        args["panel-path"] || `/paneladmin/${args["panel-key"] || args.key}`,
    },
    analytics: {
      source: args["analytics-source"] || "personal",
      ...(args["analytics-env-suffix"]
        ? { envSuffix: args["analytics-env-suffix"] }
        : {}),
      ...(args["analytics-legacy-key"]
        ? { legacyKey: args["analytics-legacy-key"] }
        : {}),
      ...(args["analytics-legacy-label"]
        ? { legacyLabel: args["analytics-legacy-label"] }
        : {}),
      legacyDashboard: Boolean(args["legacy-dashboard"]),
    },
    blogger: {
      enabled: Boolean(args.blogger),
      ...(args["blogger-url"] ? { url: args["blogger-url"] } : {}),
      ...(args["api-base"] ? { apiBase: args["api-base"] } : {}),
      ...(args["build-endpoint"]
        ? { buildEndpoint: args["build-endpoint"] }
        : {}),
      ...(args["public-post-base"]
        ? { publicPostBase: args["public-post-base"] }
        : {}),
    },
  });

  const manifestPath = path.join(siteRoot, ".web-core", "site.json");
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(site, null, 2)}\n`, "utf8");

  const registryPath = path.join(panelRoot, "src", "config", "sites.json");
  const registry = upsertSiteManifest(await readRegistry(registryPath), site);
  await mkdir(path.dirname(registryPath), { recursive: true });
  await writeFile(
    registryPath,
    `${JSON.stringify(registry, null, 2)}\n`,
    "utf8",
  );

  if (site.blogger.enabled) await installBlogger(siteRoot, site, args);
  return { manifestPath, registryPath, bloggerInstalled: site.blogger.enabled };
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
