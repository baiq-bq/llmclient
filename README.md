# @baiq/llmclient

Cliente TypeScript para backend **Node.js ≥24**, basado en AI SDK. Unifica texto, objetos validados, streaming, herramientas y generación/edición de imágenes. Incluye adaptadores para OpenAI, Anthropic, Google Gemini y xAI, un modelo `mock` sin red ni coste, y registro de proveedores/modelos externos.

Puedes instalar el mismo paquete en tantos proyectos como necesites, incluso fuera de Google Cloud. Cada aplicación necesita acceso lector al registro para instalar; después, solo usa las credenciales del proveedor que configure.

Cada cliente tiene configuración y tarifas independientes. El paquete no lee variables de entorno, no convierte documentos y no registra automáticamente credenciales, prompts, respuestas ni cuerpos del proveedor.

## Instalación privada

Registro: `https://europe-west1-npm.pkg.dev/baiq-459807/npm-private/`.

Añade al `.npmrc` de la aplicación **solo** el registro del scope:

```ini
@baiq:registry=https://europe-west1-npm.pkg.dev/baiq-459807/npm-private/
```

Autentica con una identidad que tenga `roles/artifactregistry.reader` sobre el repositorio. Para desarrollo, un token temporal de `gcloud` puede usarse en un archivo de configuración externo al proyecto; no lo subas a Git:

```bash
gcloud auth login
npm config set --userconfig="$HOME/.npmrc" \
  //europe-west1-npm.pkg.dev/baiq-459807/npm-private/:_authToken \
  "$(gcloud auth print-access-token --project=baiq-459807)"
npm install @baiq/llmclient @ai-sdk/openai zod
```

El token caduca aproximadamente en una hora. En CI utiliza identidad federada o una cuenta de servicio autorizada y genera el token al instalar. Los SDK de proveedores son **peer dependencies opcionales**: instala únicamente los que vayas a importar.

```bash
npm install @ai-sdk/anthropic   # adaptador Anthropic
npm install @ai-sdk/google      # adaptador Google
npm install @ai-sdk/xai         # adaptador xAI
```

Disponibles entradas ESM y CommonJS con declaraciones TypeScript. Las subrutas de proveedores evitan cargar SDK que no utilices.

## Crear un cliente y elegir modelos sin errores de escritura

```ts
import { createLlmClient, LanguageModel, ImageModel, Provider } from '@baiq/llmclient';
import { openaiAdapter } from '@baiq/llmclient/providers/openai';
import { anthropicAdapter } from '@baiq/llmclient/providers/anthropic';
import { googleAdapter } from '@baiq/llmclient/providers/google';
import { xaiAdapter } from '@baiq/llmclient/providers/xai';

// Las credenciales las obtiene TU aplicación; el paquete siempre las recibe explícitamente.
const client = createLlmClient({
  providers: [
    openaiAdapter({ apiKey: process.env.OPENAI_API_KEY! }),
    anthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY! }),
    googleAdapter({ apiKey: process.env.GOOGLE_API_KEY! }),
    xaiAdapter({ apiKey: process.env.XAI_API_KEY! }),
  ],
  defaults: {
    model: LanguageModel.GPT61Sol,
    timeoutMs: 60_000,
    maxOutputTokens: 4096,
    maxSteps: 5,
  },
  retries: { maxRetries: 2 },
  // fetch: miTransporte, // transporte global; un adaptador puede definir su propio fetch
});

const provider = Provider.OpenAI;        // 'openai'
const model = LanguageModel.GPT61Sol;   // 'openai:gpt-6.1-sol'
const imageModel = ImageModel.GPTImage25Sunburst;
console.log(client.listModels());       // capacidades, fuentes y proveedores configurados
```

`Provider`, `LanguageModel` e `ImageModel` son constantes `as const` con uniones exportadas (`BuiltinProvider`, `BuiltinLanguageModel`, `BuiltinImageModel`). Ofrecen autocompletado sin los inconvenientes de un enum numérico. Un identificador mal escrito o un modelo de imagen pasado a `generate` falla en TypeScript. También se valida en ejecución. Los modelos externos registrados con claves literales se incorporan al tipo del cliente.

## Texto y conversación

```ts
const answer = await client.generate({
  model: LanguageModel.GPT61Sol,
  system: 'Responde en español con frases breves.',
  messages: [{ role: 'user', content: '¿Qué es una API?' }],
  reasoning: { effort: 'low' },
});

console.log(answer.text);
console.log(answer.cost);

// Conservar los mensajes completos incluye llamadas/resultados de herramientas
// y los metadatos necesarios para continuar una conversación.
const followup = await client.generate({
  model: LanguageModel.GPT61Sol,
  messages: [
    { role: 'user', content: '¿Qué es una API?' },
    ...answer.messages,
    { role: 'user', content: 'Pon un ejemplo.' },
  ],
});
```

Forma de respuesta (ejemplo ilustrativo; texto y consumo reales varían):

```ts
{
  model: 'openai:gpt-6.1-sol',
  provider: 'openai',
  text: 'Una API permite que dos programas intercambien datos.',
  finishReason: 'stop',
  messages: [{ role: 'assistant', content: /* partes y metadatos del SDK */ [] }],
  toolCalls: [],
  toolResults: [],
  attemptCount: 1,
  usage: {
    inputTokens: 100, outputTokens: 30, totalTokens: 130,
    reasoningTokens: 10, cachedInputTokens: 0,
    cacheWriteTokens: 0, uncachedInputTokens: 100,
  },
  usageComplete: true,
  cost: { currency: 'USD', status: 'known', estimatedUsd: 0.0005 },
  entries: [{
    attempt: 1, step: 1,
    usage: /* consumo de esa llamada */ {},
    cost: {
      currency: 'USD', status: 'known', estimatedUsd: 0.0005, missing: [],
      appliedPricing: {
        rates: { input: 2, output: 10, cachedInput: 0.1, cacheWrite: 2.5 },
        origins: { input: 'internal', output: 'internal', cachedInput: 'internal', cacheWrite: 'internal' },
        context: 'standard',
        source: 'https://developers.openai.com/api/docs/pricing', version: '2026-10-05',
      },
    },
  }],
}
```

`reasoningTokens` forma parte de `outputTokens`: **no se vuelve a cobrar**. Los campos de consumo ausentes permanecen ausentes. `attemptCount` cuenta llamadas reales al proveedor, incluidas las de herramientas y los intentos fallidos; no es el número de reintentos.

## Extraer un objeto validado

```ts
import { z } from 'zod';

const schema = z.object({
  title: z.string(),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  tags: z.array(z.string()),
});
const extracted = await client.generateObject({
  model: LanguageModel.ClaudeSonnet55,
  messages: [{ role: 'user', content: 'Clasifica: el envío llegó rápido y todo funciona.' }],
}, { schema, name: 'classification', description: 'Clasificación de una reseña' });

console.log(extracted.object);
// { title: 'Buena experiencia', sentiment: 'positive', tags: ['envío', 'funcionamiento'] }
// También incluye text, messages, usage, cost y entries como generate().
```

El objeto final debe satisfacer Zod. Una respuesta inválida, filtrada o truncada devuelve un error propio y conserva el consumo conocido. Con la política predeterminada se permiten tres intentos en total; desde el segundo se añade una instrucción de reparación con los campos y códigos de validación que fallaron. `retries.repairFromAttempt` permite cambiar ese umbral.

## Streaming de texto y objetos

```ts
const stream = client.stream({
  model: LanguageModel.Gemini38Flash,
  messages: [{ role: 'user', content: 'Cuenta una historia breve.' }],
});
for await (const event of stream.events) {
  if (event.type === 'text-delta') process.stdout.write(event.text);
  // También hay eventos tipados de inicio/fin, reasoning y herramientas.
}
const final = await stream.result;
console.log(final.usage, final.cost);
// stream.cancel() cancela la operación.
```

Eventos ilustrativos de texto:

```ts
{ type: 'text-start', id: '0' }
{ type: 'text-delta', id: '0', text: 'Había una vez…' }
{ type: 'text-end', id: '0' }
```

Para objetos usa `client.stream(request, { schema })`. Los fragmentos son provisionales: solo `await stream.result` contiene el objeto validado. Consume `events` y maneja también el rechazo de `result`; abandonar el iterador cancela la operación. Una vez emitido un evento no se reinicia la operación completa.

## Analizar una imagen de entrada

```ts
import { readFile, writeFile } from 'node:fs/promises';

const photo = await readFile('./producto.png');
const analysis = await client.generate({
  model: LanguageModel.Grok47,
  images: [{ bytes: photo, mediaType: 'image/png' }],
  messages: [{ role: 'user', content: 'Describe el producto y los defectos visibles.' }],
});
console.log(analysis.text);
// 'Se observa una taza blanca con una pequeña grieta en el borde…'
// analysis.usage/cost/entries contienen también el consumo de la entrada visual.
```

También puedes usar `files` o partes `image` dentro de `messages`. Los bytes se envían directamente al proveedor. No se aceptan URLs ni IDs de archivos remotos: la aplicación debe entregar el contenido, para poder validar MIME, tamaño y número de archivos antes de llamar al proveedor.

## PDF: resumir y extraer datos

```ts
const report = await client.generate({
  model: LanguageModel.Gemini38Flash,
  files: [{
    bytes: await readFile('./informe.pdf'),
    mediaType: 'application/pdf', filename: 'informe.pdf',
  }],
  messages: [{ role: 'user', content: 'Resume las conclusiones y los riesgos del informe.' }],
});
console.log(report.text);
// 'El informe propone aumentar la capacidad de producción…'

const invoice = await client.generateObject({
  model: LanguageModel.ClaudeSonnet55,
  files: [{
    bytes: await readFile('./factura.pdf'),
    mediaType: 'application/pdf', filename: 'factura.pdf',
  }],
  messages: [{ role: 'user', content: 'Extrae los campos de la factura.' }],
}, { schema: z.object({ number: z.string(), total: z.number(), currency: z.string() }) });
console.log(invoice.object);
// { number: 'F-2026-0042', total: 121, currency: 'EUR' }
```

PDF se admite en los modelos de texto del catálogo de OpenAI, Anthropic y Google. La ruta de texto inline de xAI de este paquete no admite PDF; los flujos separados de upload/Collections del proveedor requieren otro adaptador.

## DOCX y otros documentos

```ts
const contract = await client.generate({
  model: LanguageModel.GPT61Sol,
  files: [{
    bytes: await readFile('./contrato.docx'),
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    filename: 'contrato.docx',
  }],
  messages: [{ role: 'user', content: 'Identifica las obligaciones y los plazos del contrato.' }],
});
console.log(contract.text);
// 'Obligaciones: entregar el servicio… Plazos: treinta días desde la firma…'
```

OpenAI Responses recibe DOCX directamente con `input_file`, igual que DOC, TXT, Markdown, JSON, HTML, RTF, XLSX y PPTX admitidos en el catálogo. El paquete no extrae texto ni convierte archivos. El proveedor decide cómo procesa el documento; no presupongas que las imágenes incrustadas de un DOCX se interpretan igual que las páginas de un PDF. Anthropic y Google rechazan DOCX en estos adaptadores.

## Error de entrada incompatible y modelos alternativos

```ts
import { LlmError } from '@baiq/llmclient';

try {
  await client.generate({
    model: LanguageModel.Gemini38Flash,
    files: [{
      bytes: await readFile('./contrato.docx'),
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename: 'contrato.docx',
    }],
    messages: [{ role: 'user', content: 'Resume el contrato.' }],
  });
} catch (error) {
  if (error instanceof LlmError && error.code === 'UNSUPPORTED_CAPABILITY') {
    console.log(error.details);
    // {
    //   model: 'google:gemini-3.8-flash', operation: 'generate',
    //   reasons: ['unsupported_media_type'],
    //   validModels: [
    //     { model: 'openai:gpt-6-astra', configured: true },
    //     { model: 'openai:gpt-6.1-sol', configured: true },
    //     { model: 'openai:gpt-6-luna', configured: true },
    //   ],
    // }
  }
}
```

No hay llamada de red cuando falla esta validación. Las alternativas satisfacen **toda** la petición (formatos, límites, herramientas, reasoning y operación), no solo el MIME. `configured` indica si ese proveedor está configurado; no certifica permisos de la cuenta ni disponibilidad en una región. No se cambia automáticamente de modelo. `mock` no se ofrece como alternativa real.

Límites del paquete: normalmente 10 archivos de hasta 5 MiB y 20 MiB totales para texto; OpenAI permite 20 MiB por archivo dentro del mismo total. Los modelos de imagen tienen límites separados de referencias. Son límites conservadores declarados en `modelCatalog`/`imageModelCatalog`, no una promesa de agotar los máximos del proveedor. Un adaptador puede declarar otros límites verificados.

## Generar imágenes

OpenAI, Google y xAI tienen modelos de generación de imágenes. **Anthropic no ofrece uno**; sus modelos Claude analizan imágenes de entrada.

```ts
const illustration = await client.generateImage({
  model: ImageModel.GPTImage25Sunburst,
  prompt: 'Una ilustración de un robot leyendo, fondo blanco y líneas limpias.',
  size: '1024x1024',
  n: 1,
});
await writeFile('./robot.png', illustration.images[0]!.bytes);
```

Forma de respuesta (los bytes no son una URL):

```ts
{
  model: 'openai:gpt-image-2.5-sunburst', provider: 'openai',
  images: [{ bytes: /* Uint8Array con el archivo */ new Uint8Array(), mediaType: 'image/png' }],
  attemptCount: 1,
  usage: { images: 1, inputImages: 0, /* tokens si los reporta el proveedor */ },
  usageComplete: true,
  cost: { currency: 'USD', status: 'unknown', estimatedUsd: null },
  entries: [/* consumo, componentes desconocidos y tarifas aplicadas por llamada */],
}
```

OpenAI y Google facturan modalidades de tokens distintos al generar imágenes. Esta versión conserva su consumo, pero no inventa una tarifa plana equivalente: su coste es `unknown` salvo que proporciones una tarifa `image` que cubra esa configuración. Para xAI hay tarifas por imagen integradas.

Con Google usa `aspectRatio` en lugar de `size`:

```ts
const banner = await client.generateImage({
  model: ImageModel.Gemini31FlashImage,
  prompt: 'Banner de una biblioteca luminosa sin texto.',
  aspectRatio: '16:9',
  providerOptions: { google: { imageConfig: { imageSize: '1K' } } },
});
await writeFile('./biblioteca.png', banner.images[0]!.bytes);
```

Con xAI, dos imágenes con la configuración predeterminada 1K/low:

```ts
const variations = await client.generateImage({
  model: ImageModel.GrokImagineImage2,
  prompt: 'Dos propuestas de una lámpara de escritorio minimalista.',
  n: 2, aspectRatio: '1:1',
});
console.log(variations.usage); // { images: 2, inputImages: 0, ... }
console.log(variations.cost);  // { currency: 'USD', status: 'known', estimatedUsd: 0.08 }
```

Cada imagen se genera en una llamada independiente; el plazo es común para todas. Si una llamada posterior falla, el error conserva el consumo de las anteriores. Los tokens, cuando el proveedor no los reporta, no se inventan.

## Editar una imagen o usar referencias

```ts
const edited = await client.generateImage({
  model: ImageModel.GrokImagineImage2,
  prompt: 'Conserva el producto y cambia el fondo a gris claro.',
  files: [{ bytes: await readFile('./producto.png'), mediaType: 'image/png', filename: 'producto.png' }],
  n: 1,
});
await writeFile('./producto-editado.png', edited.images[0]!.bytes);
console.log(edited.cost); // { currency: 'USD', status: 'known', estimatedUsd: 0.05 }
// 0.04 por imagen generada + 0.01 por referencia.
```

Las referencias también funcionan con los modelos de imagen OpenAI y Google del catálogo. `generateImage` admite referencias **de imagen**; no admite documentos PDF/DOCX. Aunque determinados modelos Gemini ofrecen PDF en su endpoint multimodal, la interfaz `ImageModel` del SDK utilizada aquí solo transporta referencias de imagen. Para documentos utiliza `generate`/`generateObject`; un adaptador externo puede implementar un flujo multimodal específico.

## Herramientas automáticas

```ts
import { tool } from '@baiq/llmclient';

const quote = await client.generate({
  model: LanguageModel.GPT61Sol,
  messages: [{ role: 'user', content: '¿Cuánto cuesta el producto P-42?' }],
  maxSteps: 5,
  tools: {
    getPrice: tool({
      description: 'Consulta el precio actual de un producto por su identificador.',
      inputSchema: z.object({ productId: z.string() }),
      execute: async ({ productId }, { abortSignal }) => {
        // Sustituir por la consulta real; propaga abortSignal al servicio.
        return { productId, amount: 29.9, currency: 'EUR' };
      },
    }),
  },
});
console.log(quote.text);        // 'El producto P-42 cuesta 29,90 EUR.'
console.log(quote.toolResults); // [{ type: 'tool-result', toolName: 'getPrice', ... }]
console.log(quote.messages);    // mensajes assistant/tool/assistant para continuar
console.log(quote.entries);     // consumo acumulado de todos los pasos
```

`maxSteps` limita pasos del modelo, no el número de herramientas paralelas dentro de un paso. Cada herramienta debe tener esquema, descripción y `execute`; las herramientas gestionadas por el proveedor y las que requieren aprobación no están habilitadas. El plazo incluye herramientas y esperas. Tras ejecutar una herramienta no se reintenta la operación completa, para evitar duplicar efectos. Una dependencia que ignore `AbortSignal` puede seguir trabajando fuera del cliente: propaga la señal y diseña los efectos de la herramienta para ser idempotentes.

## Diagnóstico y reparación de objetos

`llmclient` valida siempre el objeto completo con el esquema Zod original, incluidas sus transformaciones y reglas adicionales. Para OpenAI selecciona `strictJsonSchema: true` antes de llamar cuando el esquema tiene forma compatible: objeto raíz, campos obligatorios, objetos cerrados y límites soportados. Es conservador con referencias recursivas, mapas dinámicos, campos opcionales, formatos no admitidos y modelos fine-tuned; en esos casos selecciona `false` y conserva la validación Zod. La elección explícita en `providerOptions.openai.strictJsonSchema` prevalece. No transforma el contrato, cambia de modelo ni prueba otro modo tras un rechazo del proveedor. Véase [Structured Outputs de OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs).

Los errores de objetos incluyen `error.structuredOutput`; los intentos rechazados conservan el mismo diagnóstico en `accounting.entries[].structuredOutput`. Contiene clase de fallo (`json_parse`, `schema_validation`, `truncated`, `no_output` o `unknown`), hasta 20 códigos/rutas de validación, número de incidencias omitidas, motivo de finalización cuando se conoce y longitud de salida. No contiene valores recibidos, mensajes personalizados de validadores, claves dinámicas, prompts ni cuerpos del proveedor. Las rutas dinámicas aparecen como `<key>` y los mensajes son descripciones seguras del cliente. Si el SDK no proporciona detalles, el diagnóstico lo indica; no se infiere un campo culpable.

Desde el segundo intento se envían esos diagnósticos al mismo modelo. Una salida previa completa solo se utiliza como contexto si cabe en `retries.maxRepairCharacters` (32000 por defecto); una salida demasiado grande o marcada como truncada se omite entera. Nunca se envía un prefijo de JSON cortado. Se mantienen el plazo único, los dos reintentos máximos predeterminados y la contabilidad de todos los intentos. Esto mejora la reparación estructural; la corrección del contenido sigue siendo responsabilidad de la revisión del agente consumidor.

## Tarifas parciales, ceros y tramos de contexto

```ts
const priced = createLlmClient({
  providers: [openaiAdapter({ apiKey: process.env.OPENAI_API_KEY! })],
  pricing: {
    [LanguageModel.GPT61Sol]: {
      rates: { input: 1.8, cachedInput: 0 }, // output/cacheWrite heredan la tabla interna
      longContext: { rates: { input: 3.6, cachedInput: 0 } },
      source: 'Contrato de mi organización', version: '2026-10-05',
    },
  },
});
```

Las tarifas de tokens están en **USD por millón de tokens**; `image`/`inputImage` están en USD por imagen. Se combinan por modelo y campo. `0` es válido; no se sustituye por la tarifa interna. Los tramos largos heredan sus tarifas internas hasta que se sobrescriban explícitamente. `longContext: null` elimina el tramo. Las opciones se copian al crear cada cliente, sin modificar el catálogo compartido.

Para una tarifa plana de imagen acordada con tu proveedor:

```ts
const imageClient = createLlmClient({
  providers: [googleAdapter({ apiKey: process.env.GOOGLE_API_KEY! })],
  pricing: {
    [ImageModel.Gemini31FlashImage]: {
      rates: { image: 0.08, inputImage: 0.002 },
      source: 'Estimación interna para imágenes 1K', version: '2026-10-05',
    },
  },
});
```

Esta tarifa cubre la llamada completa; no se suman además sus tokens. Ajusta tu tarifa si cambias resolución, calidad o número de referencias. En xAI las tarifas integradas de Image 2.0 y Quality corresponden a 1K/low: al cambiar configuración se conserva el coste conocido de referencias y se marca la salida desconocida si no hay tarifa personalizada.

`cost.status` es `known`, `partial` o `unknown`. `estimatedUsd` es el subtotal conocido; `null` significa que no se conoce ningún componente facturable. Una llamada fallida sin consumo reportado impide presentar la factura total como completa. `entries[].cost.missing` explica qué falta y `appliedPricing.origins` indica `internal`/`custom` por campo. Caché de lectura se descuenta de la entrada normal; caché de escritura se cobra aparte cuando se reporta.

Las tarifas internas son una instantánea de **2026-10-05** de procesamiento estándar/global bajo demanda. No incluyen impuestos, almacenamiento de caché, herramientas alojadas, descuentos Batch/Flex ni recargos regionales/Priority/Fast. Anthropic usa escritura de caché de cinco minutos; si seleccionas una hora, debes sobrescribir esa tarifa. Google 3.8/3.7/3.6 tiene precios introductorios hasta 2026-12-31: actualiza la tabla para operaciones posteriores. No hay descubrimiento automático de precios ni modelos al arrancar.

## Modelo mock: desarrollo sin credenciales ni coste

```ts
const local = createLlmClient({
  providers: [],
  mock: { text: 'Respuesta de prueba', object: { number: 'F-42', total: 121 } },
});
const text = await local.generate({ model: LanguageModel.Mock, messages: [{ role: 'user', content: 'Hola' }] });
console.log(text.text); // 'Respuesta de prueba'
console.log(text.cost); // { currency: 'USD', status: 'known', estimatedUsd: 0 }
const object = await local.generateObject({ model: LanguageModel.Mock, messages: [{ role: 'user', content: 'Extrae' }] }, {
  schema: z.object({ number: z.string(), total: z.number() }),
});
console.log(object.object); // { number: 'F-42', total: 121 }
const image = await local.generateImage({ model: ImageModel.Mock, prompt: 'Prueba' });
// PNG fijo de 1×1 píxel, coste cero. También existe streaming de texto/objetos mock.
```

Opcionalmente `mock.generateObject(schema)` produce un objeto de forma dinámica. Sigue validándose contra el esquema. Mock no llama proveedores ni ejecuta herramientas; sirve para pruebas de integración de tu aplicación, no para comprobar capacidades reales o efectos de herramientas.

## Registrar un proveedor o modelo externo

```ts
import { defineProvider } from '@baiq/llmclient';
import type { LanguageModel as SdkLanguageModel } from 'ai';

// Obtén este modelo de cualquier proveedor compatible con AI SDK LanguageModel V4.
declare const mySdkModel: SdkLanguageModel;
const external = defineProvider({
  id: 'acme',
  models: {
    chat: {
      capabilities: {
        images: false, structuredOutput: true, streaming: true, tools: true,
        maxOutputTokens: 8192,
      },
    },
  },
  resolveModel: () => mySdkModel,
});
const extended = createLlmClient({
  providers: [external],
  pricing: { 'acme:chat': { rates: { input: 1, output: 2 } } },
});
const response = await extended.generate({
  model: 'acme:chat', // literal inferido; 'acme:cht' daría error TypeScript
  messages: [{ role: 'user', content: 'Hola' }],
});
```

`ProviderAdapter` permite declarar `models`, `imageModels`, `resolveModel`, `resolveImageModel`, `resolveOptions` para traducir reasoning y `normalizeUsage` para consumo específico. Una aplicación puede añadir modelos con `options.models`/`options.imageModels` a un adaptador ya configurado. Declare capacidades verificadas; no amplíes MIME únicamente para eludir un error. Si no hay precio, el resultado sigue siendo válido y el coste queda desconocido.

## Cancelación, errores y reintentos

```ts
const controller = new AbortController();
const pending = client.generate({
  model: LanguageModel.GPT61Sol,
  messages: [{ role: 'user', content: 'Analiza este problema.' }],
  signal: controller.signal, timeoutMs: 30_000,
});
controller.abort();
try { await pending; }
catch (error) {
  if (error instanceof LlmError) {
    console.log(error.code); // ABORTED
    console.log(error.accounting); // consumo conocido hasta la cancelación
  }
}
```

Códigos estables: `INVALID_CONFIGURATION`, `INVALID_REQUEST`, `PROVIDER_NOT_CONFIGURED`, `UNSUPPORTED_CAPABILITY`, `PROVIDER_ERROR`, `STRUCTURED_OUTPUT_ERROR`, `TRUNCATED_OUTPUT`, `CONTENT_FILTERED`, `TOOL_ERROR`, `TIMEOUT`, `ABORTED`.

Dos reintentos por defecto, con backoff y respeto de `Retry-After`. Los reintentos internos del SDK están desactivados. Hay un único plazo para llamadas, pasos, reparación, herramientas y esperas. Los errores no conservan cuerpos privados del proveedor; `upstreamStatus` expone el estado numérico cuando se conoce. `accounting` no es enumerable: léelo explícitamente si necesitas persistirlo. Claude Sonnet 5.5 no admite desactivar todo el thinking; `none` se rechaza. Su modo específico `between_tools` se puede seleccionar mediante `providerOptions.anthropic.thinking`, según la documentación del SDK. `providerOptions` es una salida avanzada hacia opciones específicas del SDK: comprueba su documentación; puede cambiar precio/comportamiento y no sustituye la API canónica de reasoning.

## Catálogo y fuentes oficiales

Revisado el **2026-10-05**. Se incorporan las últimas familias disponibles de generación de texto e imagen; también se mantienen alternativas activas. El catálogo es estático, tipado y ampliable. La presencia de un modelo no otorga acceso a una cuenta restringida ni convierte un preview en estable.

- **OpenAI texto:** `GPT6Astra`, `GPT61Sol`, `GPT6Luna`. Imagen: `GPTImage25Sunburst`, `GPTImage25Flare`, `GPTImage2`. [Catálogo](https://developers.openai.com/api/docs/models), [precios](https://developers.openai.com/api/docs/pricing), [archivos](https://developers.openai.com/api/docs/guides/file-inputs).
- **Anthropic texto:** `ClaudeFable51`, `ClaudeMythos51` (acceso restringido), `ClaudeOpus55`, `ClaudeSonnet55`, `ClaudeHaiku45`; alternativas `ClaudeOpus5` y `ClaudeSonnet5`. No tiene generación de imágenes. [Modelos](https://platform.claude.com/docs/en/models/overview), [precios](https://platform.claude.com/docs/en/about-claude/pricing), [reasoning](https://platform.claude.com/docs/en/build-with-claude/effort).
- **Google texto:** `Gemini38Flash`, `Gemini37Flash`, `Gemini36Flash`, `Gemini35Flash`, `Gemini35FlashLite`, `Gemini31FlashLite`, `Gemini31ProPreview`, `Gemini3FlashPreview`. Imagen: `Gemini31FlashImage`, `Gemini31FlashLiteImage`, `Gemini3ProImage`; también el identificador anterior `Gemini31FlashImagePreview` para compatibilidad. [Modelos](https://ai.google.dev/gemini-api/docs/models), [precios](https://ai.google.dev/gemini-api/docs/pricing), [imágenes](https://ai.google.dev/gemini-api/docs/image-generation).
- **xAI texto:** `Grok47`, `GrokBuild01`, `Grok46`, `Grok45`, `Grok43`, `Grok420Reasoning`, `Grok420NonReasoning`. Imagen: `GrokImagineImage2`, `GrokImagineImage`, `GrokImagineImageQuality` (retirada anunciada para 2026-11-02). Texto admite PNG/JPEG; las referencias de imagen de generación siguen su propio contrato. [Modelos](https://docs.x.ai/developers/models), [precios](https://docs.x.ai/developers/pricing).

Se excluyen endpoints de voz/Live, vídeo, embeddings, moderación, entrenamiento, multiagente alojado y ofertas especializadas con contrato de acceso/endpoint distinto. Los modelos retirados no se recomiendan. Para servicios especializados utiliza otro adaptador; este paquete no promete cubrir todos los endpoints de cada proveedor.

## Cloud Build: publicación automática desde main

Con el trigger de GitHub activado, cada push a `main` ejecuta `cloudbuild.yaml` mediante `llmclient-main-publish` de `baiq-459807`, región `europe-west1`. El pipeline instala dependencias, obtiene un token temporal, comprueba la versión, verifica tipos/build/imports y publica en el registro privado. **No ejecuta los tests unitarios**: son obligatorios en local antes de crear una PR y después del último cambio.

La versión debe ser **mayor por precedencia SemVer que todas las versiones ya publicadas**, no solo distinta ni mayor que el dist-tag `latest`. `package.json` y las versiones raíz del lockfile deben coincidir. Una versión igual/inferior, credenciales inválidas o metadatos del registro no verificables hacen fallar el build; nunca se convierten en un skip exitoso. El gate se repite justo antes de publicar para detectar publicaciones concurrentes.

Antes de crear cualquier PR, también si solo modifica documentación o CI:

```bash
git fetch origin main
npm version patch --no-git-tag-version # minor/major si corresponde
npm run check                         # tests obligatorios en local
npm pack --dry-run --ignore-scripts
npm run check:release -- --base origin/main
```

El último comando necesita acceso lector al registro y comprueba además que se haya incrementado respecto a la base de la PR. Si otra PR publica primero, actualiza la versión antes del merge. Un reintento del trigger sobre la misma versión publicada debe fallar. El trigger procesa el commit del evento de push; no publica por separado todos los commits intermedios enviados en un único push.

La cuenta `llmclient-publisher@baiq-459807.iam.gserviceaccount.com` tiene writer únicamente sobre el repositorio npm y permiso de escritura de logs. No se entregan credenciales de publicación a builds de PR. La conexión dedicada `llmclient` usa la instalación existente de Cloud Build para `baiq-bq`; su credencial se guarda en Secret Manager y debe estar vigente. Con la conexión autorizada, `bash scripts/create-cloudbuild-trigger.sh` vincula el repositorio y crea el trigger sin cambiar las credenciales de ninguna conexión. No ejecutes ese script si el trigger ya existe; inspecciónalo con `gcloud builds triggers describe llmclient-main-publish --region=europe-west1 --project=baiq-459807`.

Las [reglas del repositorio](https://github.com/baiq-bq/llmclient/blob/main/AGENTS.md) y la [skill de preparación/revisión de PRs](https://github.com/baiq-bq/llmclient/blob/main/.agents/skills/llmclient-pr-review/SKILL.md) exigen incremento de versión, pruebas locales y revisión de contratos, capacidades y costes. No publiques manualmente una versión que publicará el trigger del mismo commit; `publish:private` queda para operaciones manuales expresamente solicitadas.

## Desarrollo, comprobación y publicación

```bash
npm ci
npm run check                 # tipos, pruebas HTTP simuladas, build y ESM/CommonJS
npm pack --dry-run            # revisar contenido del paquete
npm run publish:private      # comprueba y publica usando autenticación temporal
npm run check:private-install # instala la versión de package.json en un proyecto temporal
```

Las pruebas habituales no hacen llamadas de pago. Verifican payloads de los cuatro SDK, esquemas válidos/erróneos/truncados, capacidades, archivos, streaming, herramientas, caché, costes parciales, aislamiento, cancelación, plazo común y ausencia de ejecuciones duplicadas.

El script de publicación verifica el destino, usa el token de la identidad autenticada en `gcloud`, lo escribe con permisos `0600` fuera del checkout y elimina la configuración temporal al terminar. No cambia el proyecto activo. El registro está fijado en `publishConfig` y en el scope `@baiq`; nunca se publica al registro público.

Creación del repositorio estándar:

```bash
gcloud artifacts repositories create npm-private \
  --repository-format=npm --location=europe-west1 --project=baiq-459807 \
  --description='Private npm packages for baiq'
```

Para autorizar una aplicación consumidora, concede lectura únicamente sobre este repositorio, sustituyendo la identidad:

```bash
gcloud artifacts repositories add-iam-policy-binding npm-private \
  --location=europe-west1 --project=baiq-459807 \
  --member='serviceAccount:CONSUMER@baiq-459807.iam.gserviceaccount.com' \
  --role='roles/artifactregistry.reader'
```

Un publicador necesita `roles/artifactregistry.writer`. No concedas `allUsers` ni `allAuthenticatedUsers`. [Autenticación npm en Google](https://docs.cloud.google.com/artifact-registry/docs/nodejs/authentication). Las versiones publicadas deben tratarse como inmutables: aumenta la versión antes de publicar cambios posteriores.
