# Reglas de @baiq/llmclient

Estas instrucciones se aplican a todo el repositorio. Para preparar o revisar una PR, lee y aplica [llmclient-pr-review](.agents/skills/llmclient-pr-review/SKILL.md).

## Propósito y arquitectura

- Paquete TypeScript para backend Node.js ≥24, basado en AI SDK. Mantener entradas ESM/CommonJS y declaraciones para ambas.
- `src/client.ts`: orquestación; `types.ts`: contratos; `models.ts`/`catalog.ts`: identificadores, capacidades y tarifas; `pricing.ts`/`accounting.ts`: costes; `execution.ts`: plazo/reintentos; `images.ts`: imágenes; `providers/`: adaptadores opcionales.
- Proveedores integrados: OpenAI, Anthropic, Google, xAI, DeepSeek y Kimi (Moonshot AI). No introducir dependencias de Editavia ni leer variables de entorno en el paquete; recibir configuración explícita.
- Mantener tipos de modelos de texto/imagen separados. Los identificadores externos registrados con claves literales deben inferirse sin aceptar errores de escritura arbitrarios.
- `mock` existe para texto, objetos, streaming e imágenes: sin red, credenciales ni coste; validar esquemas y no ejecutar herramientas reales.

## Invariantes de ejecución

- Validar operación, reasoning, herramientas, MIME, cantidad y tamaño antes de cualquier I/O. Un rechazo devuelve `LlmError` con código estable, motivos y modelos alternativos estructurados, indicando proveedores configurados.
- Enviar archivos directamente; no extraer ni convertir PDF/DOCX automáticamente, no cambiar de modelo a escondidas. La compatibilidad depende del modelo y de la ruta implementada por el adaptador.
- Los objetos solo son válidos tras validar el resultado final con Zod. Un fragmento de streaming no es un objeto válido.
- Herramientas con descripción/esquema/execute, máximo predeterminado de cinco pasos. No repetir una operación después de ejecutar herramientas o emitir eventos. Propagar AbortSignal a las dependencias.
- Un solo plazo incluye llamadas, backoff y herramientas. SDK con `maxRetries: 0`; política propia con dos reintentos por defecto y reparación de objetos desde el segundo intento.
- Conservar consumo conocido de intentos/pasos anteriores, incluso al fallar. No registrar secretos, prompts, respuestas o cuerpos privados automáticamente.

## Modelos y costes

- Verificar nuevos modelos, capacidades y precios en documentación oficial. Guardar fuente/fecha, diferenciar preview, acceso restringido, modelos retirados y límites conservadores del paquete.
- Mantener sincronizados constantes exportadas, catálogos y adaptadores. Añadir pruebas de payloads de SDK simulados.
- Tarifas de tokens en USD/millón; tarifas de imágenes en USD/imagen. Sobrescribir por modelo/campo y tramo; `0` es válido. Aislar la configuración de cada cliente.
- Descontar entrada cacheada y contemplar escritura reportada. Reasoning incluido en output no se cobra dos veces.
- Si falta consumo/precio, devolver coste parcial/desconocido y subtotal conocido; no inventar un precio cero. Calidad, resolución, caché de una hora, región y tiers especiales pueden necesitar una tarifa externa.
- Actualizar README y ejemplos compilables al cambiar API, modelos, capacidades o formas de respuesta.

## Tests y comprobación obligatoria en local

- Los tests unitarios son obligatorios: conservar y ampliar `tests/*.test.ts` para todo cambio de comportamiento, incluido el control de versiones/publicación. Usar transporte simulado; ninguna llamada de pago en tests habituales.
- Antes de una PR y después del último cambio, ejecutar `npm ci`, `npm run check` y `npm pack --dry-run --ignore-scripts`. Si falla, reparar y repetir los checks afectados antes de presentar la PR.
- `npm run check` ejecuta tipos, tests unitarios, build y comprobaciones de imports ESM/CommonJS. Informar comandos/resultados y cualquier comprobación no realizada; nunca afirmar un pase sin evidencia.
- **Los tests unitarios no se ejecutan en CI.** No añadir `npm test`, Vitest ni `npm run check` al Cloud Build. CI utiliza `npm run check:ci` (tipos, build e imports).

## Versiones y PRs

- **Antes de crear una PR hay que incrementar la versión** de `package.json` y `package-lock.json`. También para documentación, reglas o CI: cada push a main intenta publicar.
- La nueva versión SemVer debe ser mayor que la base actual de la PR y que todas las versiones publicadas. `npm version patch --no-git-tag-version` es lo habitual; usar minor/major según compatibilidad. Los metadatos `+build` no aumentan precedencia.
- Ejecutar `git fetch origin main` y `npm run check:release -- --base origin/main` con acceso lector al registro. Tras un rebase o publicación concurrente, revisar de nuevo la versión.
- No editar una versión publicada ni saltarse el control de versión. No publicar manualmente una versión que vaya a publicarse por el trigger del mismo commit.
- Usar ramas `codex/<nombre>` por defecto para PRs. Revisar y bloquear PRs sin incremento de versión o sin comprobaciones locales documentadas.

## Releases públicas en npm

- El nombre en npmjs.org es `@baiq-bq/llmclient`. Solo una release de GitHub publicada desde un commit de `main` activa `.github/workflows/publish-npm.yml`, con un Trusted Publisher de npm.
- La etiqueta debe ser `v` seguida de la versión exacta del manifiesto y lockfile. La versión debe superar todas las versiones del registro público. Las versiones estables publican con `latest` y las preliminares con `next`.
- Mantener un README para usuarios en GitHub y npm. Las instrucciones de mantenimiento están en `docs/releases.md`.

## Publicación en Google Artifact Registry

- Proyecto: `baiq-459807`; región: `europe-west1`; repositorio npm estándar privado: `npm-private`; scope: `@baiq`.
- Registro privado original: `https://europe-west1-npm.pkg.dev/baiq-459807/npm-private/`. No guardar tokens/keys en Git ni en el tarball.
- Trigger: `llmclient-main-publish`, GitHub `baiq-bq/llmclient`, push a `^main$`, configuración `cloudbuild.yaml`. No triggers de PR con permisos de publicación.
- Conexión GitHub dedicada: `llmclient`, instalación existente de `baiq-bq`. Credencial OAuth en Secret Manager; no copiar tokens al repositorio. No modificar la conexión compartida `baiq`.
- Cuenta de servicio dedicada: `llmclient-publisher@baiq-459807.iam.gserviceaccount.com`, writer solo sobre `npm-private` y logWriter en el proyecto. La distribución pública se realiza en npmjs.org.
- Cloud Build: npm ci → token temporal → gate SemVer/lockfile contra todas las versiones del registro → tipos/build/imports → repetir gate y publicar en privado. Una versión repetida o inferior es **error**, no skip ni éxito. Errores de auth/red/metadatos también bloquean publicación.
- El gate final protege frente a builds concurrentes; npm puede rechazar un conflicto de publicación y no debe ocultarse. No prometer una publicación por cada commit intermedio de un push: el trigger procesa el commit recibido por el evento GitHub.
- Comandos gcloud siempre con proyecto/región explícitos; no cambiar el proyecto activo ni alterar conexiones/triggers de otros servicios.
- El script manual `publish:private` ejecuta checks locales y usa gcloud; el script CI no llama tests ni gcloud desde el contenedor Node. Los tokens temporales se eliminan al finalizar.
