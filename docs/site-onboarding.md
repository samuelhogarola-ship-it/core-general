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
  --blogger \
  --blogger-variant "static" \
  --blogger-custom-origin "https://blogger.mi-web.com" \
  --auth-module "/assets/js/blogger-auth.js"
```

También puede ejecutarse como `web-core-site-onboard` cuando el paquete esté instalado. Repetir exactamente el mismo alta actualiza la entrada existente; nunca crea duplicados.

## Resultado obligatorio

1. La web contiene `.web-core/site.json`, sin secretos ni rutas locales.
2. `wf-studio-panel/src/config/sites.json` contiene una única entrada con la misma `key`.
3. Panel Studio muestra la web, su panel y sus herramientas activas.
4. Si se usa `--blogger`, el manifiesto registra explícitamente la variante `static` o `vps` que consume WF-Studio Panel.
5. La instalación histórica de activos en `admin/blogger/` se conserva como compatibilidad; el runtime canónico es el editor central de WF-Studio.
6. El repositorio de la web implementa únicamente el adaptador de publicación que corresponda, descrito en `blogger/README.md`.

No se debe añadir una web editando a mano las listas antiguas de analítica. El manifiesto y el registro canónico son la fuente para esas vistas.

## Opciones útiles

- `--url`: URL de producción si no es `https://<domain>`.
- `--panel-path`: ruta existente en Panel Studio.
- `--analytics-source`: conexión Umami, por defecto `personal`.
- `--analytics-env-suffix`: sufijo estable de variables de entorno.
- `--legacy-dashboard`: incluye la web en la fachada antigua de estadísticas.
- `--analytics-legacy-key`: conserva una clave antigua sin duplicar el sitio.
- `--analytics-legacy-label`: conserva el nombre visible de una fachada antigua.
- `--blogger-url`: URL publicada del editor si no es `/admin/blogger/`.
- `--blogger-dir`: destino de los activos dentro de la web.
- `--blogger-variant`: `static` para publicación en repositorio o `vps` para almacenamiento/build dinámico.
- `--blogger-custom-origin`: origen HTTPS de marca, sin ruta, como `https://blogger.mi-web.com`.
- `--blogger-logo-path`: ruta pública segura del logotipo que mostrará Studio.
- `--blogger-preview-image-path`: ruta pública segura de la portada de WF-Blogger.

## Cierre del alta

Antes de considerar una web incorporada, valida su build, login administrativo, Blogger si está activo, analítica y enlaces desde Panel Studio. Los cambios del sitio, `core-general` y Panel Studio siguen sus propios PR y despliegues; el registro no sustituye esas comprobaciones.
