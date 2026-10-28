# WF-Blogger

WF-Blogger es el producto editorial reutilizable de WF-Studio. Conserva la barra contextual al seleccionar texto, la inserción de imágenes en la posición del cursor, el movimiento de imágenes entre bloques, Markdown/HTML, metadatos SEO, borradores y publicación.

## Variantes canónicas

- `static`: la web pública es estática. WF-Studio ejecuta el editor y publica en el repositorio de la web; un origen como `https://blogger.dominio.com` puede ofrecer la puerta de marca sin crear otra aplicación dinámica.
- `vps`: la web es dinámica y vive en un VPS. WF-Studio ejecuta el mismo editor, pero persiste y publica mediante la raíz, API o build hook registrado para esa web.

No existe una tercera variante por cliente. Core General define y valida el contrato; WF-Studio Panel ejecuta el runtime, permisos, acceso temporal y adaptadores; el repositorio de cada web conserva su contenido público.

La copia de `editor/` realizada por el alta histórica se conserva únicamente para llamadas heredadas sin `blogger.variant`. Un alta explícita `static` o `vps` nunca copia ni sobrescribe ese directorio: registra el runtime central de Panel. La instalación heredada no constituye otro producto ni debe usarse para duplicar el runtime central. Su autenticación queda en un módulo propio del sitio indicado por `authModule`, que debe exportar:

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
