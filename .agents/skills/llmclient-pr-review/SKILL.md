---
name: llmclient-pr-review
description: Prepara y revisa PRs de @baiq/llmclient; verifica incremento obligatorio de versión, tests locales, contratos de proveedores, costes y publicación privada. Usar al crear una PR, revisar una PR o evaluar cambios antes de merge en este repositorio.
---
# Preparar y revisar PRs de llmclient

1. Lee `AGENTS.md`, `package.json`, `cloudbuild.yaml` y el diff completo contra la base actual de la PR. Confirma que revisas el HEAD correcto; identifica cambios de API, proveedores, costes o publicación.
2. **Antes de crear la PR se debe incrementar la versión.** Exige que `package.json` y las dos versiones raíz de `package-lock.json` coincidan y sean mayores, por precedencia SemVer, que la base y todas las versiones ya publicadas. No basta con cambiar `+build`, un dist-tag o el texto del README. Aplica también a cambios exclusivos de documentación, skills y CI.
3. Para preparar una PR, incrementa con `npm version patch --no-git-tag-version` (minor/major cuando corresponda); incluye el cambio en la PR. Ejecuta `git fetch origin main` y `npm run check:release -- --base origin/main`. Si otra PR publica primero, vuelve a comprobar antes del merge. Si no hay acceso al registro, informa la limitación: no lo marques como verificado.
4. **Tests unitarios obligatorios en local:** exige pruebas significativas de comportamiento para cambios relevantes y ejecuta `npm ci`, `npm run check`, `npm pack --dry-run --ignore-scripts` después del último cambio. Utiliza HTTP simulado, mock o dobles de SDK; nunca claves reales ni llamadas de pago. La descripción de PR debe incluir los checks y resultados reales. Una prueba fallida bloquea la aprobación.
5. **No ejecutar tests unitarios en CI.** Rechaza cambios que introduzcan `npm test`, Vitest o `npm run check` en Cloud Build. `check:ci` solo realiza tipos, build y comprobaciones de imports. No interpretar un CI verde como evidencia de que los tests locales pasaron.
6. Comprueba los contratos del cambio:
   - Tipos/autocompletado de modelos de texto e imagen, extensibilidad externa e imports ESM/CommonJS con peers opcionales.
   - Capacidades verificadas por modelo; archivos directos y rechazo antes de I/O con alternativas estructuradas; sin conversión/fallback automático.
   - Objetos finales validados; streaming con cancelación y sin reinicios tras emitir eventos; herramientas sin efectos duplicados y límite de pasos.
   - Plazo global, maxRetries SDK=0, backoff/Retry-After, reparación a partir del tercer intento y consumo conservado al fallar.
   - Merge parcial de tarifas por campo/tramo, ceros válidos, caché separada, reasoning no duplicado, coste desconocido/parcial honesto y aislamiento entre clientes.
   - `mock` local de coste cero, sin red ni herramientas; documentación y ejemplos actualizados, fuentes oficiales para nuevos modelos/precios.
7. Si cambia publicación, revisa el destino privado fijado, gate estricto contra todas las versiones, lockfile consistente, revalidación antes de publicar, errores de red/auth propagados, permisos mínimos por repositorio y ausencia de tokens en logs/tarball. No publicar desde una PR ni saltar el gate con un éxito ficticio.
8. Reporta hallazgos accionables por gravedad con archivo/línea, escenario, impacto y corrección. Distingue errores bloqueantes de sugerencias. Cierra con evidencia de versión, tests locales y empaquetado, y limitaciones pendientes. No apruebes si falta incremento o verificación local.

## Ejemplo de descripción de PR

```markdown
Corrige la contabilización de caché de entrada de un proveedor.
Versión: 0.1.1 → 0.1.2 (package.json y lockfile).
Validación local: npm run check, 228 tests pasados; npm pack --dry-run --ignore-scripts; check:release contra origin/main y Artifact Registry.
CI: tipos, empaquetado y publicación en main; sin tests unitarios.
```

El número de tests del ejemplo es ilustrativo: informa siempre el resultado real. No publiques comentarios en GitHub salvo autorización del usuario para enviar esa revisión.
