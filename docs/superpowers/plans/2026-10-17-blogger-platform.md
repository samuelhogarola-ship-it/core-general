# Blogger platform and site onboarding plan

## Goal

Make `core-general` the canonical source for the reusable Blogger editor and for registering every new website. Register Samuel Coach as the first production Blogger installation and expose that configuration in WF Studio Panel.

## Global constraints

- Keep client branding and secrets out of `core-general`.
- Preserve the Samuel editor's final authoring behavior: contextual formatting, inline image insertion and image movement.
- Keep the site manifest portable and safe to commit.
- A site created from any directory must be onboarded with one command using explicit `--root` and `--panel-root` paths.
- Existing analytics environment variable names remain compatible.

## Task 1: Canonical site manifest and registry helpers

**Produces:** `normalizeSiteManifest`, `validateSiteManifest`, and registry upsert helpers.

1. Add failing unit tests for normalization, validation, secret rejection, and deterministic upsert.
2. Implement the smallest pure module that passes them.
3. Export the module from the package.

## Task 2: Reusable Blogger configuration and editor distribution

**Consumes:** the normalized site manifest from Task 1.
**Produces:** Blogger runtime configuration plus generic editor assets based on the final Samuel editor.

1. Add failing tests proving generic defaults, per-site URLs, and absence of Samuel branding in the reusable assets.
2. Add a Blogger configuration module and copy the final editor assets with runtime configuration for site name, author, API base, public post base, build endpoint, and auth adapter.
3. Document the backend contract and integration points.

## Task 3: Location-independent onboarding command

**Consumes:** manifest validation from Task 1 and Blogger assets/config from Task 2.
**Produces:** `.web-core/site.json` in a target site and a deterministic Panel Studio registry update.

1. Add failing integration tests that invoke the command outside the target directory.
2. Implement `npm run site:onboard -- --root ... --panel-root ...` with safe path handling and idempotent updates.
3. Add the canonical new-site protocol and Samuel migration example to the README.

## Task 4: Panel Studio registry and project page

**Consumes:** the manifest shape from Task 1 and registry output from Task 3.
**Produces:** a checked-in website registry, project overview, and production Blogger access for Samuel.

1. Add failing tests for registry validation, analytics compatibility, project rendering, and Samuel's published Blogger URL.
2. Implement the registry loader, derive analytics projects from it, and replace the placeholder project page with registered website cards.
3. Replace Samuel's fixed localhost link with the registry value.
4. Document that all website creation must run through the core onboarding command.

## Verification

- `core-general`: `npm test`, `npm run lint`, `npm run format:check`, `npm run check`.
- `wf-studio-panel`: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
- Review both complete diffs against this plan, push branches, open PRs, wait for checks, and merge when green.

## Review focus

- No secrets or machine-specific paths in manifests.
- No Samuel-specific defaults inside the reusable package.
- Re-running onboarding must not duplicate a site.
- Existing analytics keys and legacy environment suffixes must remain stable.
- External Blogger links must be validated HTTPS URLs and use safe link attributes.
