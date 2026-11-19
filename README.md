# @baiq-bq/llmclient

Cliente TypeScript para backend **Node.js ≥24**, basado en AI SDK. Unifica texto, objetos validados, streaming, herramientas y generación/edición de imágenes. Incluye adaptadores para OpenAI, Anthropic, Google Gemini, xAI, DeepSeek y Kimi (Moonshot AI), un modelo `mock` sin red ni coste, y registro de proveedores/modelos externos.

Puedes instalar el mismo paquete en tantos proyectos como necesites, incluso fuera de Google Cloud. La instalación pública no requiere credenciales de Google Cloud; la aplicación usa las credenciales del proveedor que configure.

Cada cliente tiene configuración y tarifas independientes. El paquete no lee variables de entorno, no convierte documentos y no registra automáticamente credenciales, prompts, respuestas ni cuerpos del proveedor.

## Instalación

Con Node.js 24 o posterior, instala el paquete desde npm sin credenciales ni configuración de registro:

```bash
npm install @baiq-bq/llmclient
```

Puedes probarlo sin llamar a ningún proveedor. Guarda esto como `ejemplo.mjs` y ejecuta `node ejemplo.mjs`.

```js
import { createLlmClient, LanguageModel } from '@baiq-bq/llmclient';

const client = createLlmClient({ providers: [], mock: { text: 'Hola desde llmclient' } });
const respuesta = await client.generate({
  model: LanguageModel.Mock,
  messages: [{ role: 'user', content: 'Hola' }],
});
console.log(respuesta.text, respuesta.cost);
```

Para llamar a un modelo real instala el SDK de ese proveedor. Los SDK son dependencias opcionales y se importan por separado. Por ejemplo, para OpenAI:

```bash
npm install @ai-sdk/openai
```

```js
import { createLlmClient, LanguageModel } from '@baiq-bq/llmclient';
import { openaiAdapter } from '@baiq-bq/llmclient/providers/openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('Configura OPENAI_API_KEY antes de ejecutar el ejemplo');
const client = createLlmClient({ providers: [openaiAdapter({ apiKey })] });
const respuesta = await client.generate({
  model: LanguageModel.GPT62Sol,
  messages: [{ role: 'user', content: 'Explícame qué es una API en una frase.' }],
});
console.log(respuesta.text, respuesta.cost);
```

Para los demás adaptadores instala `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/xai`, `@ai-sdk/deepseek` o `@ai-sdk/moonshotai`, según el proveedor. Si vas a definir esquemas con `generateObject`, instala también `zod`. El paquete admite ESM y CommonJS e incluye declaraciones TypeScript.

Si ya instalas `@baiq/llmclient` desde Google Artifact Registry, puedes seguir usando ese nombre. Sustituye `@baiq-bq/llmclient` por `@baiq/llmclient` en los imports.

## Crear un cliente y elegir modelos sin errores de escritura

```ts
import { createLlmClient, LanguageModel, ImageModel, Provider } from '@baiq-bq/llmclient';
import { openaiAdapter } from '@baiq-bq/llmclient/providers/openai';
import { anthropicAdapter } from '@baiq-bq/llmclient/providers/anthropic';
import { googleAdapter } from '@baiq-bq/llmclient/providers/google';
import { xaiAdapter } from '@baiq-bq/llmclient/providers/xai';
import { deepseekAdapter } from '@baiq-bq/llmclient/providers/deepseek';
import { kimiAdapter } from '@baiq-bq/llmclient/providers/kimi';

// Las credenciales las obtiene TU aplicación; el paquete siempre las recibe explícitamente.
const client = createLlmClient({
  providers: [
    openaiAdapter({ apiKey: process.env.OPENAI_API_KEY! }),
    anthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY! }),
    googleAdapter({ apiKey: process.env.GOOGLE_API_KEY! }),
    xaiAdapter({ apiKey: process.env.XAI_API_KEY! }),
    deepseekAdapter({ apiKey: process.env.DEEPSEEK_API_KEY! }),
    kimiAdapter({ apiKey: process.env.MOONSHOT_API_KEY! }),
  ],
  defaults: {
    model: LanguageModel.GPT62Sol,
    timeoutMs: 60_000,
    maxOutputTokens: 4096,
    maxSteps: 5,
  },
  retries: { maxRetries: 2 },
  // fetch: miTransporte, // transporte global; un adaptador puede definir su propio fetch
});

const provider = Provider.OpenAI;        // 'openai'
const model = LanguageModel.GPT62Sol;   // 'openai:gpt-6.2-sol'
const imageModel = ImageModel.GPTImage26Sunburst;
console.log(client.listModels());       // capacidades, fuentes y proveedores configurados
```

`Provider`, `LanguageModel` e `ImageModel` son constantes `as const` con uniones exportadas (`BuiltinProvider`, `BuiltinLanguageModel`, `BuiltinImageModel`). Ofrecen autocompletado sin los inconvenientes de un enum numérico. Un identificador mal escrito o un modelo de imagen pasado a `generate` falla en TypeScript. También se valida en ejecución. Los modelos externos registrados con claves literales se incorporan al tipo del cliente.

## Texto y conversación

```ts
const answer = await client.generate({
  model: LanguageModel.GPT62Sol,
  system: 'Responde en español con frases breves.',
  messages: [{ role: 'user', content: '¿Qué es una API?' }],
  reasoning: { effort: 'low' },
});

console.log(answer.text);
console.log(answer.cost);

// Conservar los mensajes completos incluye llamadas/resultados de herramientas
// y los metadatos necesarios para continuar una conversación.
const followup = await client.generate({
  model: LanguageModel.GPT62Sol,
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
  model: 'openai:gpt-6.2-sol',
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
        source: 'https://developers.openai.com/api/docs/pricing', version: '2026-10-27',
      },
    },
  }],
}
```

`reasoningTokens` forma parte de `outputTokens`: **no se vuelve a cobrar**. Los campos de consumo ausentes permanecen ausentes. `attemptCount` cuenta llamadas reales al proveedor, incluidas las de herramientas y los intentos fallidos; no es el número de reintentos.

## DeepSeek: texto, JSON, streaming y herramientas

Instala el peer opcional `@ai-sdk/deepseek` e importa `deepseekAdapter` desde `@baiq-bq/llmclient/providers/deepseek`. La aplicación pasa su clave explícitamente; no hace falta instalar el SDK de OpenAI. Se usa Chat Completions nativo (`https://api.deepseek.com/chat/completions`), que conserva `reasoning_content` en las conversaciones y pasos de herramientas. `baseURL`, `headers` y `fetch` son configurables como en los demás adaptadores.

```ts
const deepseek = createLlmClient({
  providers: [deepseekAdapter({ apiKey: process.env.DEEPSEEK_API_KEY! })],
});
const answer = await deepseek.generate({
  model: LanguageModel.DeepSeekFlash,
  messages: [{ role: 'user', content: 'Explica cómo funciona una caché.' }],
  reasoning: { effort: 'high' },
});
console.log(answer.text, answer.usage);
```

Los esfuerzos canónicos son `none`, `low`, `high` y `max`; `none` desactiva thinking y el proveedor usa `high` si se omite. No se admiten presupuestos de reasoning ni se remapean esfuerzos a escondidas. El límite de salida es 393.216 tokens, incluido reasoning. El paquete no expone temperatura para estos modelos porque se ignora con el thinking predeterminado. El adaptador usa `@ai-sdk/deepseek` ≥3.0.74 y el núcleo AI SDK 7.0.154; consulta también el [contrato del SDK nativo](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek). Flash admite PNG, JPEG, WebP y GIF en bytes, con los límites conservadores del paquete. Ambos rechazan PDF/DOCX antes de I/O y no generan imágenes.

`generateObject` y el streaming de objetos usan `response_format: { type: 'json_object' }`. El SDK añade una instrucción JSON con el esquema; la validación final Zod y la reparación siguen siendo responsabilidad del cliente. DeepSeek no recibe `json_schema` estricto en este endpoint estable. El SDK nativo también devuelve reasoning en los eventos del streaming y lo conserva al continuar herramientas.

**Costes:** DeepSeek cambia sus tarifas según horas punta y festivos chinos. El catálogo conserva fuente y fecha, pero devuelve coste `unknown` sin una tarifa explícita. En USD por millón de tokens, Flash cuesta input/caché/output **0,15/0,003/0,60** fuera de punta y **0,30/0,006/1,20** en punta; Pro cuesta **0,66/0,022/1,98** fuera de punta y **1,32/0,044/3,96** en punta. Las horas punta son 01:00–04:00 y 06:00–10:00 UTC de lunes a viernes, excluidos festivos chinos. La aplicación debe elegir la tarifa correspondiente a cada operación; un cliente no cambia de tarifa automáticamente:

```ts
const offPeak = createLlmClient({
  providers: [deepseekAdapter({ apiKey: process.env.DEEPSEEK_API_KEY! })],
  pricing: {
    [LanguageModel.DeepSeekFlash]: {
      rates: { input: 0.15, cachedInput: 0.003, output: 0.6 },
      source: 'https://api-docs.deepseek.com/quick_start/pricing/',
      version: '2026-10-27-off-peak',
    },
  },
});
```

Se conserva la entrada cacheada por separado y el reasoning ya incluido en output no se vuelve a facturar. El consumo ausente permanece desconocido aunque el SDK rellene campos con cero.

## Kimi: K3.1 Pro, Highspeed y K3

Instala `@ai-sdk/moonshotai` ≥3.0.79 e importa `kimiAdapter` desde `@baiq-bq/llmclient/providers/kimi`. Usa Chat Completions directo (`https://api.moonshot.ai/v1/chat/completions`), con clave explícita y `baseURL`, `headers` y `fetch` configurables. El identificador del proveedor en el paquete es `Provider.Kimi` (`kimi`); las opciones específicas del SDK usan `providerOptions.moonshotai`.

```ts
const kimi = createLlmClient({
  providers: [kimiAdapter({ apiKey: process.env.MOONSHOT_API_KEY! })],
});
const answer = await kimi.generate({
  model: LanguageModel.KimiK31Pro,
  messages: [{ role: 'user', content: 'Explica cómo funciona una caché.' }],
  reasoning: { effort: 'high' },
});
console.log(answer.text, answer.usage, answer.cost);
```

El catálogo incluye `KimiK31Pro` (`kimi-k3.1-pro`), `KimiK31ProHighspeed` (`kimi-k3.1-pro-highspeed`) y `KimiK3` (`kimi-k3`). Todos razonan siempre y admiten `low`, `high` y `max` (predeterminado del proveedor). Se rechazan `none`, esfuerzos intermedios y presupuestos en tokens antes de I/O. El paquete aplica un límite conservador de **32.768 tokens de salida**, independiente de la ventana de contexto de 1M. No expone temperatura porque el SDK la omite para Kimi. [Modelos](https://platform.kimi.ai/docs/models), [razonamiento](https://platform.kimi.ai/docs/guide/use-reasoning-effort), [SDK nativo](https://ai-sdk.dev/providers/ai-sdk-providers/moonshotai).

Admite imágenes PNG/JPEG/WebP/GIF en bytes, hasta 5 MiB por imagen, diez imágenes y 20 MiB totales. PDF/DOCX, vídeo y generación de imágenes quedan fuera de esta ruta. `generateObject` envía `json_schema` estricto y valida el resultado final con Zod. El streaming expone texto y reasoning; las conversaciones y herramientas conservan `reasoning_content`. [Visión](https://platform.kimi.ai/docs/guide/use-kimi-vision-model), [salida estructurada y herramientas](https://platform.kimi.ai/docs/guide/kimi-k3-1-pro-quickstart).

**Tarifas estándar en USD/millón, verificadas el 2026-10-27:** input/output/lectura de caché/escritura de cinco minutos: K3.1 Pro **2/10/0,20/2**; Highspeed **4/20/0,20/4**; K3 **3/15/0,30/3**. Se descuentan lectura y escritura del total de entrada; el reasoning ya está incluido en output. Los contadores ausentes permanecen desconocidos y producen coste parcial/desconocido. Si eliges `providerOptions.moonshotai.promptCacheOptions: { mode: 'implicit', ttl: '1h' }`, sobrescribe `pricing[modelo].rates.cacheWrite` a **4**, **8** o **6**, respectivamente. El cliente no cambia la tarifa automáticamente y la API puede renovar una entrada con su TTL original: la aplicación debe usar la tarifa correspondiente a la escritura facturada. [Precios](https://platform.kimi.ai/docs/pricing/chat), [caché](https://platform.kimi.ai/docs/guide/context-caching).

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
  model: LanguageModel.GPT62Sol,
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
import { LlmError } from '@baiq-bq/llmclient';

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
    //     { model: 'openai:gpt-6.2-sol', configured: true },
    //     { model: 'openai:gpt-6-luna', configured: true },
    //   ],
    // }
  }
}
```

No hay llamada de red cuando falla esta validación. Las alternativas satisfacen **toda** la petición (formatos, límites, herramientas, reasoning y operación), no solo el MIME. `configured` indica si ese proveedor está configurado; no certifica permisos de la cuenta ni disponibilidad en una región. No se cambia automáticamente de modelo. `mock` no se ofrece como alternativa real.

Límites del paquete: normalmente 10 archivos de hasta 5 MiB y 20 MiB totales para texto; OpenAI permite 20 MiB por archivo dentro del mismo total. Los modelos de imagen tienen límites separados de referencias. Son límites conservadores declarados en `modelCatalog`/`imageModelCatalog`, no una promesa de agotar los máximos del proveedor. Un adaptador puede declarar otros límites verificados.

## Generar imágenes

OpenAI, Google y xAI tienen modelos de generación de imágenes. **Anthropic y DeepSeek no ofrecen uno en este catálogo**; sus modelos Claude analizan imágenes de entrada.

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
import { tool } from '@baiq-bq/llmclient';

const quote = await client.generate({
  model: LanguageModel.GPT62Sol,
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
    [LanguageModel.GPT62Sol]: {
      rates: { input: 1.8, cachedInput: 0 }, // output/cacheWrite heredan la tabla interna
      longContext: { rates: { input: 3.6, cachedInput: 0 } },
      source: 'Contrato de mi organización', version: '2026-10-27',
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
      source: 'Estimación interna para imágenes 1K', version: '2026-10-27',
    },
  },
});
```

Esta tarifa cubre la llamada completa; no se suman además sus tokens. Ajusta tu tarifa si cambias resolución, calidad o número de referencias. En xAI las tarifas integradas de Image 2.0 y Quality corresponden a 1K/low: al cambiar configuración se conserva el coste conocido de referencias y se marca la salida desconocida si no hay tarifa personalizada.

`cost.status` es `known`, `partial` o `unknown`. `estimatedUsd` es el subtotal conocido; `null` significa que no se conoce ningún componente facturable. Una llamada fallida sin consumo reportado impide presentar la factura total como completa. `entries[].cost.missing` explica qué falta y `appliedPricing.origins` indica `internal`/`custom` por campo. Caché de lectura se descuenta de la entrada normal; caché de escritura se cobra aparte cuando se reporta.

Las tarifas internas son una instantánea de **2026-11-19** de procesamiento estándar/global bajo demanda. No incluyen impuestos, almacenamiento de caché, herramientas alojadas, descuentos Batch/Flex ni recargos regionales/Priority/Fast. Anthropic usa escritura de caché de cinco minutos; si seleccionas una hora, debes sobrescribir esa tarifa. Gemini 4 Argon y Carbon usan precios introductorios hasta 2026-11-30: desde 2026-12-01, input/output/caché pasan de 2/10/0,10 a 4/20/0,20 USD por millón. Google 3.8/3.7/3.6 tiene precios introductorios hasta 2026-12-31: actualiza la tabla para operaciones posteriores. No hay descubrimiento automático de precios ni modelos al arrancar.

## Tabla de modelos y costes de texto

Tarifas internas estándar en USD por millón de tokens, verificadas el 19 de noviembre de 2026. Columnas: entrada, salida, lectura de caché y escritura de caché (cinco minutos para Anthropic). «—» indica que el paquete no dispone de una tarifa para ese concepto. Consulta las fuentes enlazadas: los tramos de contexto largo y condiciones especiales se describen bajo la tabla.

| Proveedor y modelos | Entrada | Salida | Caché lectura | Caché escritura |
| --- | ---: | ---: | ---: | ---: |
| OpenAI GPT-6.2 Astra | 8 | 40 | 0,4 | 10 |
| OpenAI GPT-6.2 Sol | 2 | 10 | 0,1 | 2,5 |
| OpenAI GPT-6 Astra | 10 | 50 | 1 | 12,5 |
| OpenAI GPT-6.1 Sol | 2 | 10 | 0,1 | 2,5 |
| OpenAI GPT-6.1 Terra | 1 | 5 | 0,05 | 1,25 |
| OpenAI GPT-6 Luna | 0,1 | 0,5 | 0,01 | 0,125 |
| Anthropic Claude Fable 5.2, Mythos 5.2 | 8 | 40 | 0,2 | 10 |
| Anthropic Claude Fable 5.1, Mythos 5.1 | 10 | 50 | 0,25 | 12,5 |
| Anthropic Claude Opus 5.5 | 4 | 20 | 0,2 | 5 |
| Anthropic Claude Opus 5 | 5 | 25 | 0,5 | 6,25 |
| Anthropic Claude Sonnet 5.5 | 2 | 10 | 0,1 | 2,5 |
| Anthropic Claude Sonnet 5 | 2 | 10 | 0,2 | 2,5 |
| Anthropic Claude Haiku 5.5 | 0,1 | 0,5 | 0,01 | 0,125 |
| Anthropic Claude Haiku 4.5 | 1 | 5 | 0,1 | 1,25 |
| Google Gemini 4 Carbon, 4 Argon | 2 | 10 | 0,1 | — |
| Google Gemini 4 Neon | 3 | 15 | 0,15 | — |
| Google Gemini 4 Hydrogen | 1,5 | 7,5 | 0,075 | — |
| Google Gemini 3.8, 3.7, 3.6 Flash | 0,75 | 3,75 | 0,075 | — |
| Google Gemini 3.5 Flash | 1,5 | 9 | 0,15 | — |
| Google Gemini 3.5 Flash Lite | 0,3 | 2,5 | 0,03 | — |
| Google Gemini 3.1 Flash Lite | 0,25 | 1,5 | 0,025 | — |
| Google Gemini 3.1 Pro Preview | 2 | 12 | 0,2 | — |
| Google Gemini 3 Flash Preview | 0,5 | 3 | 0,05 | — |
| xAI Grok 4.7, 4.6 | 2 | 6 | 0,5 | — |
| xAI Grok 4.5 | 2 | 6 | 0,3 | — |
| xAI Grok 4.3, 4.20 Reasoning y Non-Reasoning | 1,25 | 2,5 | 0,2 | — |
| xAI Grok Build 0.1 | 1 | 2 | 0,2 | — |
| Kimi K3.1 Pro | 2 | 10 | 0,2 | 2 |
| Kimi K3.1 Pro Highspeed | 4 | 20 | 0,2 | 4 |
| Kimi K3 | 3 | 15 | 0,3 | 3 |
| DeepSeek Flash y V4 Pro | Variable | Variable | Variable | — |
| Mock | 0 | 0 | 0 | 0 |

Los tramos largos de OpenAI, Haiku 5.5, Gemini 3.1 Pro Preview y xAI se aplican por solicitud; `defaultPricing` expone los umbrales y tarifas exactos. DeepSeek requiere tarifas explícitas por horario y festivos, detalladas arriba. Mythos requiere verificación de la organización. Los modelos Preview están sujetos a cambios. Fuentes: [OpenAI](https://developers.openai.com/api/docs/pricing), [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing), [Google](https://ai.google.dev/gemini-api/docs/pricing), [xAI](https://docs.x.ai/developers/pricing), [DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/) y [Kimi](https://platform.kimi.ai/docs/pricing/chat).

## Costes de imágenes

| Modelos | Tarifa interna |
| --- | --- |
| xAI Grok Imagine Image | 0,02 USD/imagen generada y 0,002 USD/imagen de entrada |
| xAI Grok Imagine Image 2.0 y Quality | 0,04 USD/imagen generada y 0,01 USD/imagen de entrada para 1K y calidad low |
| OpenAI GPT Image 2.6 Sunburst/Flare, 2.5 Sunburst/Flare y 2 | Sin tarifa interna: el precio depende de tokens, calidad y resolución |
| Google Nano Banana 2.1, Gemini 3.1 Flash Image, Flash Image Preview, Flash Lite Image y 3 Pro Image | Sin tarifa interna: el precio depende de tokens y resolución |
| Mock | 0 USD |

xAI retiró `grok-imagine-image-quality` y redirige su identificador a Image 2.0 low desde el 2 de noviembre; se conserva por compatibilidad. Consulta [la migración de xAI](https://docs.x.ai/developers/migration/imagine-image-quality-nov-2), [precios de OpenAI](https://developers.openai.com/api/docs/pricing) y [precios de Google](https://ai.google.dev/gemini-api/docs/pricing). Para otras resoluciones y calidades configura una tarifa explícita.

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
import { defineProvider } from '@baiq-bq/llmclient';
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
  model: LanguageModel.GPT62Sol,
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

Actualización de modelos contrastada el **2026-11-19**. Las nuevas capacidades y tarifas se verifican en las páginas enlazadas de cada proveedor. Los modelos Gemini 4 se limitan a 65.536 tokens de salida síncrona: su long decode de hasta 1M requiere otro flujo. Neon y Hydrogen admiten `xhigh` en la API, pero el SDK instalado no lo transporta y el paquete lo rechaza. GPT‑6.1 Terra admite `low`, `medium`, `high`, `xhigh` y `max` en este paquete; `none` se rechaza porque el SDK lo descarta, aunque la API lo admite. Nano Banana 2.1 mantiene los límites conservadores de referencias de imagen del paquete. Se incorporan las últimas familias disponibles de generación de texto e imagen; también se mantienen alternativas activas. El catálogo es estático, tipado y ampliable. La presencia de un modelo no otorga acceso a una cuenta restringida ni convierte un preview en estable.

- **OpenAI texto:** `GPT62Astra`, `GPT62Sol`, `GPT6Astra`, `GPT61Sol`, `GPT61Terra`, `GPT6Luna`. Imagen: `GPTImage26Sunburst`, `GPTImage26Flare`, `GPTImage25Sunburst`, `GPTImage25Flare`, `GPTImage2` (obsoleto). [Catálogo](https://developers.openai.com/api/docs/models), [precios](https://developers.openai.com/api/docs/pricing), [archivos](https://developers.openai.com/api/docs/guides/file-inputs).
- **Anthropic texto:** `ClaudeFable52`, `ClaudeMythos52` (acceso restringido), `ClaudeFable51`, `ClaudeMythos51` (acceso restringido), `ClaudeOpus55`, `ClaudeSonnet55`, `ClaudeHaiku55`; alternativas `ClaudeHaiku45`, `ClaudeOpus5` y `ClaudeSonnet5`. No tiene generación de imágenes. [Modelos](https://platform.claude.com/docs/en/models/overview), [precios](https://platform.claude.com/docs/en/about-claude/pricing), [reasoning](https://platform.claude.com/docs/en/build-with-claude/effort).
- **Google texto:** `Gemini4Carbon`, `Gemini4Neon`, `Gemini4Hydrogen`, `Gemini4Argon`, `Gemini38Flash`, `Gemini37Flash`, `Gemini36Flash`, `Gemini35Flash`, `Gemini35FlashLite`, `Gemini31FlashLite`, `Gemini31ProPreview`, `Gemini3FlashPreview`. Imagen: `GeminiNanoBanana21`, `Gemini31FlashImage`, `Gemini31FlashLiteImage`, `Gemini3ProImage`; también el identificador anterior `Gemini31FlashImagePreview` para compatibilidad. [Modelos](https://ai.google.dev/gemini-api/docs/models), [precios](https://ai.google.dev/gemini-api/docs/pricing), [imágenes](https://ai.google.dev/gemini-api/docs/image-generation).
- **xAI texto:** `Grok47`, `GrokBuild01`, `Grok46`, `Grok45`, `Grok43`, `Grok420Reasoning`, `Grok420NonReasoning`. Imagen: `GrokImagineImage2`, `GrokImagineImage`, `GrokImagineImageQuality` (retirado; redirigido desde 2026-11-02). Texto admite PNG/JPEG; las referencias de imagen de generación siguen su propio contrato. [Modelos](https://docs.x.ai/developers/models), [precios](https://docs.x.ai/developers/pricing).

- **DeepSeek texto:** `DeepSeekFlash` (`deepseek-flash`, versión V4.1-Flash-1017) y `DeepSeekV4Pro` (`deepseek-v4-pro`, versión V4-Pro-0813). Flash admite imágenes; Pro solo texto. Los alias retirados `deepseek-chat`, `deepseek-reasoner` y `deepseek-v4-flash` no se añaden al catálogo. [Modelos y tarifas](https://api-docs.deepseek.com/quick_start/pricing/), [razonamiento](https://api-docs.deepseek.com/guides/thinking_mode/), [visión](https://api-docs.deepseek.com/guides/vision/), [JSON](https://api-docs.deepseek.com/guides/json_mode/), [herramientas](https://api-docs.deepseek.com/guides/thinking_mode/#tool-calls).

- **Kimi texto/visión:** `KimiK31Pro`, `KimiK31ProHighspeed`, `KimiK3`. Solo la familia K3; no se incorpora K2. [Modelos](https://platform.kimi.ai/docs/models), [precios](https://platform.kimi.ai/docs/pricing/chat).

Se excluyen endpoints de voz/Live, vídeo, embeddings, moderación, entrenamiento, multiagente alojado y ofertas especializadas con contrato de acceso/endpoint distinto. Los modelos retirados no se recomiendan. Para servicios especializados utiliza otro adaptador; este paquete no promete cubrir todos los endpoints de cada proveedor.

## Desarrollo y releases

Las pruebas locales usan HTTP simulado. Ejecuta `npm ci` y `npm run check` para comprobar tipos, pruebas, compilación e imports ESM/CommonJS. Consulta la [guía de releases](https://github.com/baiq-bq/llmclient/blob/main/docs/releases.md) para preparar una versión y seguir su publicación en npm.
