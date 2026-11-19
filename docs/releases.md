# Publicar una release

El paquete público es [`@baiq-bq/llmclient`](https://www.npmjs.com/package/@baiq-bq/llmclient). Su README contiene los ejemplos de consumo y se incluye en el archivo que npm publica. El código, las pruebas y los ejemplos ampliados están en GitHub.

1. Incrementa la versión SemVer en `package.json` y `package-lock.json` antes de integrar cambios en `main`. La versión debe superar la base y todas las versiones ya publicadas. Para un parche, ejecuta `npm version patch --no-git-tag-version`.
2. Ejecuta `npm ci`, `npm run check` y `npm pack --dry-run --ignore-scripts`. El control de Artifact Registry sigue disponible con `npm run check:release -- --base origin/main` y requiere acceso lector a Google Cloud.
3. Integra los cambios en `main` y crea una [release de GitHub](https://github.com/baiq-bq/llmclient/releases/new) desde ese commit. Usa la etiqueta exacta del manifiesto con prefijo `v`. Si el manifiesto dice `0.5.1`, la etiqueta será `v0.5.1`. Para una versión preliminar como `0.6.0-rc.1`, marca también la release como preliminar.
4. Publica la release y comprueba el flujo [Publish to npm](https://github.com/baiq-bq/llmclient/actions/workflows/publish-npm.yml). El paquete estable se instala desde `latest` y el preliminar desde `next`. Espera a que termine el flujo antes de publicar otra versión.

Un borrador o un tag por sí solo no dispara el flujo de npm. GitHub Actions valida el commit, la etiqueta, el lockfile y las versiones existentes. Después compila, comprueba imports y entrega el archivo al job de publicación, que recibe la identidad OIDC. El registro puede tardar varios minutos en habilitar la descarga. Si falla antes de subir el archivo, corrige el problema y reintenta. Si npm aceptó el envío, comprueba la pestaña **Versions** antes de reintentar. Cada versión publicada es inmutable.

En [Settings del paquete](https://www.npmjs.com/package/@baiq-bq/llmclient?activeTab=admin), el Trusted Publisher de GitHub Actions debe apuntar a la organización `baiq-bq`, repositorio `llmclient`, archivo `publish-npm.yml` y tener habilitado **Allow npm publish**. El flujo usa runners de GitHub y no necesita un token npm en secretos. Las configuraciones nuevas se deben validar con una publicación correcta en dos días. [Documentación de npm](https://docs.npmjs.com/trusted-publishers/).

## Distribución privada interna

El trigger `llmclient-main-publish` de Cloud Build publica `@baiq/llmclient` en el repositorio interno `npm-private` al actualizar `main`. La única distribución pública es `@baiq-bq/llmclient` en npmjs.org.

El trigger interno se consulta con `gcloud builds triggers describe llmclient-main-publish --region=europe-west1 --project=baiq-459807`. Las pruebas unitarias se ejecutan en local. El comando `npm run publish:private` se reserva para operaciones manuales de Google expresamente solicitadas.
