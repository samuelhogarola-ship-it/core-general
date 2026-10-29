# Protocolo canónico para crear o incorporar una web

Toda web nueva debe quedar registrada con `core-general`, aunque el proyecto se haya creado desde otro repositorio, un generador, una sesión de Codex o un proveedor externo. El alta crea un manifiesto local portable y actualiza el registro que consume Panel Studio.

## Comando

Ejecuta el comando desde `core-general` indicando rutas absolutas; el directorio actual no afecta al resultado:

```sh
npm run site:onboard -- \
  --root "/ruta/a/la-web" \
  --panel-root "/ruta/a/wf-studio-panel" \
  --key "mi-web" \
  --name "Mi Web" \
  --domain "mi-web.com" \
  --repository "https://github.com/organizacion/mi-web" \
  --panel-key "mi-web" \
  --analytics-profile "/ruta/a/analytics-profile.json" \
  --blogger \
  --blogger-variant "static" \
  --blogger-runtime "central-multisite" \
  --blogger-custom-origin "https://blogger.mi-web.com" \
  --blogger-url "https://portal.webfuengirola.com/acceso/blogger/mi-web"
```

También puede ejecutarse como `web-core-site-onboard` cuando el paquete esté instalado. Repetir exactamente el mismo alta actualiza la entrada existente; nunca crea duplicados.

## Resultado obligatorio

1. La web contiene `.web-core/site.json`, sin secretos ni rutas locales.
2. `wf-studio-panel/src/config/sites.json` contiene una única entrada con la misma `key`.
3. Panel Studio muestra la web, su panel y sus herramientas activas.
4. Si se usa `--blogger`, el manifiesto registra explícitamente la variante `static` o `vps` que consume WF-Studio Panel.
5. Un alta explícita `static` o `vps` registra el editor central y no copia ni sobrescribe `admin/blogger/`. Las llamadas heredadas con `--blogger` pero sin variante conservan la instalación histórica de activos por compatibilidad.
6. El repositorio de la web implementa únicamente el adaptador de publicación que corresponda, descrito en `blogger/README.md`.
7. Si se usa `--analytics-profile`, la web recibe `umami-analytics-core.js` y
   `analytics-profile.json`, y el mismo perfil normalizado queda en ambos
   manifiestos.

No se debe añadir una web editando a mano las listas antiguas de analítica. El manifiesto y el registro canónico son la fuente para esas vistas.

## Opciones útiles

- `--url`: URL de producción si no es `https://<domain>`.
- `--panel-path`: ruta existente en Panel Studio.
- `--analytics-source`: conexión Umami, por defecto `personal`.
- `--analytics-env-suffix`: sufijo estable de variables de entorno.
- `--legacy-dashboard`: incluye la web en la fachada antigua de estadísticas.
- `--analytics-legacy-key`: conserva una clave antigua sin duplicar el sitio.
- `--analytics-legacy-label`: conserva el nombre visible de una fachada antigua.
- `--analytics-profile`: ruta al perfil público de idiomas, secciones, eventos y
  exclusiones. El perfil nunca puede contener website IDs, passwords,
  credenciales Umami, PII ni rutas privadas del servidor.
- `--blogger-url`: acceso directo que Panel ya tiene provisionado para el sitio; es obligatorio con una variante explícita.
- `--blogger-dir`: destino de los activos dentro de la web.
- `--blogger-variant`: `static` para publicación en repositorio o `vps` para almacenamiento/build dinámico.
- `--blogger-runtime`: runtime operativo ya provisionado en Panel (`central-multisite`, `central-legacy` o `external`); es obligatorio con una variante explícita.
- `--blogger-custom-origin`: origen HTTPS de marca, sin ruta, como `https://blogger.mi-web.com`.
- `--blogger-logo-path`: ruta pública segura del logotipo que mostrará Studio.
- `--blogger-preview-image-path`: ruta pública segura de la portada de WF-Blogger.

El alta conserva `runtime`, adaptadores, capacidades y endpoints operativos que ya pertenezcan a la entrada de Panel. No se deben sustituir esos campos desde Core General: su implementación y revisión siguen perteneciendo al repositorio `wf-studio-panel`.

## Cierre del alta

Antes de considerar una web incorporada, valida su build, login administrativo, Blogger si está activo, analítica y enlaces desde Panel Studio. Los cambios del sitio, `core-general` y Panel Studio siguen sus propios PR y despliegues; el registro no sustituye esas comprobaciones.
