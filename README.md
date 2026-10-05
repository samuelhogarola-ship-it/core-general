# web-core

`web-core` es una base reusable para tus webs y templates comerciales.

El foco de esta primera versión es lo que mejor encaja con un producto transversal:

- SEO metadata y social sharing
- JSON-LD para `WebSite`, `Organization`, `BreadcrumbList`, `BlogPosting` y `FAQPage`
- helpers de blog para index y posts
- helpers SEO para páginas de servicios
- plantilla editable de OG image para landings de negocio
- navbar base para empresas y servicios
- helpers de intake y cuestionarios repetibles con Supabase + Resend
- utilidades pequeñas de texto y arrays

## Qué migré de `core`

Se reutilizó y adaptó especialmente la lógica de `src/share-seo.js`, quitando el acoplamiento a `VokabelLab` y convirtiéndola en una API más genérica.

También extraje helpers base inspirados en utilidades compartidas del repo original, pero sin arrastrar lógica de producto.

## Qué dejé fuera a propósito

Estas piezas no entraron porque hoy están demasiado ligadas a apps concretas, branding o flujos educativos:

- configs de dashboard y errores persistidos
- práctica, flashcards, quiz review y mistake review
- naming legacy de `window.VokabelLabCore` y `window.LabWorldCore`

Eso mantiene `web-core` más vendible y más limpio para templates generales.

## Estructura

```text
src/
  content/
    blog.js
    service-pages.js
  intake/
    form.js
    questionnaire.js
  seo/
    og-image.js
    share.js
    structured-data.js
  ui/
    navbar.js
  utils/
    array.js
    text.js
styles/
  navbar.css
```

## Uso rápido

```js
import {
  createBlogPostSeoBundle,
  createFaqSchema,
  createServiceOgImageHtml,
  mountNavbar,
  renderJsonLdScripts,
} from "web-core";

const seo = createBlogPostSeoBundle({
  siteUrl: "https://example.com",
  siteName: "Example Studio",
  title: "How to structure a blog for SEO",
  description: "A practical guide for commercial templates.",
  imageUrl: "https://example.com/og/blog-seo.jpg",
  datePublished: "2026-05-14",
  author: "Samuel",
  tags: ["seo", "blog", "template"],
});

const faqSchema = createFaqSchema([
  {
    question: "Does blog schema help ranking?",
    answer: "It helps search engines understand the page better.",
  },
]);

const jsonLd = renderJsonLdScripts([...seo.schemas, faqSchema]);

const ogImageHtml = createServiceOgImageHtml({
  brand: "Example Studio",
  title: "The website your business deserves.",
  subtitle: "Fast, clear, professional sites for local businesses.",
  priceBadge: "From EUR 500",
});

mountNavbar("#site-header", {
  brandName: "Example Studio",
  brandHref: "/",
  currentPath: "/blog/",
  links: [
    { label: "Home", href: "/" },
    { label: "Services", href: "/services/" },
    { label: "About", href: "/about/" },
    { label: "Blog", href: "/blog/" },
    { label: "Contact", href: "/contact/" },
  ],
});
```

## Intake reutilizable

`core-general` ya incluye dos niveles de intake:

- `submitIntake`: formulario simple orientado a leads/clientes
- `submitQuestionnaire`: cuestionarios multipaso con payload estructurado y adjuntos
- `submitClientForm`: alias de negocio para formularios de clientes reutilizables

Ejemplo rápido:

```js
import { submitQuestionnaire } from "web-core/intake/questionnaire";

const result = await submitQuestionnaire(
  {
    endpoint: "/api/questionnaire",
    projectSlug: "saulo",
    formType: "technical-questionnaire",
    fieldMap: {
      brandName: "appProjectName",
      logoFile: "logoFile",
    },
    multiValueFields: ["routineVariables"],
  },
  document.querySelector("#questionnaire-form"),
);

if (!result.ok) {
  console.error(result.error);
}
```

Si quieres tratarlo como pieza de negocio transversal en vez de como
“questionnaire”, puedes usar el alias:

```js
import { submitClientForm } from "web-core/intake/client-form";
```

La idea es repetir siempre el mismo patrón:

1. frontend normaliza respuestas
2. backend del proyecto guarda en Supabase
3. Resend notifica al equipo o manda resumen

## API principal

- `createSeoMetadata`
- `applySeoMetadata`
- `renderSeoMetadata`
- `buildShareableUrl`
- `buildSharePayload`
- `createOrganizationSchema`
- `createProfessionalServiceSchema`
- `createWebSiteSchema`
- `createBreadcrumbSchema`
- `createBlogPostingSchema`
- `createFaqSchema`
- `renderJsonLdScript`
- `renderJsonLdScripts`
- `createBlogIndexMetadata`
- `createBlogPostMetadata`
- `createBlogPostSeoBundle`
- `createServicePageMetadata`
- `createServicePageSeoBundle`
- `createServiceOgImageHtml`
- `submitIntake`
- `initIntakeForm`
- `isSpam`
- `buildClientFormSubmission`
- `submitClientForm`
- `flattenClientFormAnswers`
- `buildQuestionnaireSubmission`
- `submitQuestionnaire`
- `flattenQuestionnaireAnswers`
- `getDefaultNavbarLinks`
- `createNavbarMarkup`
- `mountNavbar`
- `slugify`
- `createExcerpt`
- `estimateReadingTime`
- `shuffle`
- `uniqueBy`

## Verificación

```bash
npm run check
```

## Intake: authorization and retries

Apply `supabase/migrations/002_intake_authorization.sql` after migration 001.
This is a fail-closed change: authenticated users cannot read or manage intake
or clients until an administrator provisions their memberships in
`public.intake_tenant_members(tenant_id, user_id)`. Use verified `auth.users.id`
values and the exact project tenant slug. Users cannot grant themselves access;
user-editable signup metadata is never used for authorization. A member can
manage records for their assigned tenants; no read-only role is provided yet.

Before migration, check existing `clients` for repeated non-null `intake_id`
values. The unique index intentionally aborts the migration if duplicates exist;
review them explicitly instead of automatically deleting customer records.
The migration is transactional and does not provision memberships automatically.

Deploy the updated `convert-client` function after applying migration 002. It
requires the caller's user access token and Supabase URL/anon key; it does not
use a service-role key. Conversion runs as that user under RLS, atomically
creates the client and marks the intake done, and returns the same client ID
on retries. Existing client edits are preserved. Missing/invalid users receive
401; an inaccessible intake receives 403 without disclosing whether it exists.

`submitIntake(config, data)` now returns `{ ok: true }` on success, with no `id`.
The documented ID was optional; consumers needing it must use an authenticated
workflow. Anonymous submissions request an empty response, keeping private
intake data unreadable. Publishable keys are sent as `apikey`, not user JWTs.
The existing notification webhook configuration and email delivery still require
separate deployment verification; these tests do not send email.

## Toast

Import `showToast` from `web-core` or `web-core/ui/toast`, and import
`web-core/styles/toast.css` once in the consuming app.

## Regression tests

Run `npm test` for the form and conversion handler tests. Database tests are
skipped unless `CORE_TEST_DATABASE_URL` is provided. Supply **only a disposable
local PostgreSQL database**: the suite recreates its `public` schema. It loads
the real migrations, supplies minimal Supabase auth roles/`auth.uid()`, and
stubs only `pg_net` delivery (no external notifications).

```sh
CORE_TEST_DATABASE_URL='postgresql:///core_test?host=/tmp&port=55439' npm test
```
