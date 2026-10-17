# Blogger Studio

Esta carpeta contiene la distribución reutilizable del editor definitivo de posts. Conserva la barra contextual al seleccionar texto, la inserción de imágenes en la posición del cursor, el movimiento de imágenes entre bloques, Markdown/HTML, metadatos SEO, borradores y publicación.

`site:onboard --blogger` copia `editor/` a la web e incrusta una configuración sin secretos. La autenticación queda en un módulo propio del sitio indicado por `authModule`, que debe exportar:

```js
export async function requireBloggerAccess() {
  // Devuelve true solo cuando el administrador puede entrar.
}

export async function getBloggerAccessToken() {
  // Devuelve el access token vigente o null.
}
```

El adaptador debe fallar de forma cerrada. Las claves de servicio y secretos nunca se incluyen en el HTML ni en `.web-core/site.json`.

## Contrato HTTP

- `GET /api/posts`: `{ posts: PostSummary[] }`
- `GET /api/posts/:slug`: post completo
- `POST /api/posts` y `PUT /api/posts/:slug`: guardar post
- `POST /api/posts/:slug/images`: subir `{ fileName, data }`
- `PUT /api/posts/:slug/images/:file`: actualizar alt, descripción y principal
- `DELETE /api/posts/:slug/images/:file`: borrar imagen
- `POST /api/build`: generar y publicar

Todos los endpoints exigen `Authorization: Bearer <token>` y deben validar en servidor que el usuario es administrador. `src/blogger/content-store.js` implementa la persistencia portable en `blog-posts/` y `f/<slug>/`.

La web puede cambiar `apiBase`, `buildEndpoint` y `publicPostBase` durante el alta. Si usa otro framework, conserva el contrato y adapta únicamente la capa HTTP.
