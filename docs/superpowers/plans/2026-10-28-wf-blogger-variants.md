# WF-Blogger Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register one reusable WF-Blogger product with explicit `static` and `vps` delivery variants.

**Architecture:** Core General owns the portable manifest and onboarding arguments. It records only generic runtime and branding metadata; tenant assets and the operational editor remain in WF-Studio Panel.

**Tech Stack:** Node.js ESM, JSON manifests, Node test runner.

**Spec:** User-approved two-variant WF-Blogger model from 2026-10-28.

## Global Constraints

- Allowed variants are exactly `static` and `vps`.
- Existing Blogger manifests without a variant remain compatible.
- Core General contains no Sport Massage branding.
- Visual asset paths are public root-relative paths and may not contain traversal, query strings or fragments.

## Review Focus

- Reject unknown variants rather than silently inventing a third model.
- Reject unsafe asset paths.
- Preserve legacy manifests and onboarding calls.
- Preserve deterministic registry output.
- Never serialize secrets or filesystem roots.

---

### Task 1: Extend the portable Blogger contract

**Files:**

- Modify: `src/sites/registry.js`
- Modify: `test/site-registry.test.js`
- Modify: `scripts/site-onboard.mjs`
- Modify: `test/site-onboard.test.js`

**Interfaces:**

- Consumes: existing `normalizeSiteManifest(input)` and `site:onboard` CLI.
- Produces: `blogger.variant`, `blogger.customOrigin`, `blogger.logoPath`, and `blogger.previewImagePath`.

- [x] Add failing registry and onboarding tests for both variants and safe branding paths.
- [x] Run the focused tests and confirm failures describe missing metadata.
- [x] Implement validation, normalization and CLI argument mapping.
- [x] Run focused and full Core General checks.

### Task 2: Document the product boundary

**Files:**

- Modify: `README.md`
- Modify: `blogger/README.md`
- Modify: `docs/site-onboarding.md`

**Interfaces:**

- Consumes: the Task 1 manifest fields.
- Produces: the canonical responsibility split between Core General, WF-Studio Panel and each website repository.

- [x] Document WF-Blogger Static and WF-Blogger VPS.
- [x] Mark copied editor assets as compatibility behavior, not a third product model.
- [x] Verify formatting and repository status.
