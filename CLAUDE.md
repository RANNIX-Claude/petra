# CLAUDE.md — Petra
## RANNIX Consulting | v1.0.0 | 2026

---

## Identidad del Proyecto

**Petra** *(Plataforma de Espacios, Transacciones, Rentas y Administración)* es una plataforma SaaS multi-tenant para la administración integral de inmuebles comerciales en México (plazas comerciales, edificios de oficinas, consultorios médicos, bodegas industriales).

Desarrollado por **Roberto Aguilar Cota / RANNIX Consulting**.

---

## Stack Tecnológico

- **Frontend**: React 18 + Vite 5 + TailwindCSS 3 (con estilos inline sobre variables CSS)
- **Backend/DB**: Supabase (PostgreSQL + Auth + Storage privado + RLS)
- **Deploy**: Netlify (Functions como proxy seguro para Claude API)
- **IA**: Claude API vía Netlify Functions (NUNCA expuesta en frontend)
- **Routing**: React Router DOM v6
- **State**: Zustand + React Query (`@tanstack/react-query`)
- **Forms**: React Hook Form + Zod
- **Gráficas**: Recharts · **Export**: exceljs, xlsx, docx · **Toasts**: react-hot-toast · **Iconos**: lucide-react

---

## Estructura de Archivos

```
DEv/
├── src/
│   ├── components/
│   │   ├── agents/     # AgenteOperativo.jsx, AgenteAnalitico.jsx
│   │   ├── layout/     # Header.jsx, Sidebar.jsx, Footer.jsx
│   │   ├── ui/         # KPICard, StatusBadge, LoadingSpinner, EmptyState,
│   │   │               # NuevoContratoModal, ElaborarContratoModal,
│   │   │               # ExpedienteForm, ExpedienteModal,
│   │   │               # ModalSolicitudPersona, TicketModal
│   │   └── dummy/      # DummyTable.jsx (prueba de conexión Supabase)
│   ├── context/        # AppContext.jsx (user, perfil, loading, sidebarOpen)
│   ├── hooks/          # useSupabase.js, useAuth.js, usePRP.js, useAudit.js
│   ├── lib/            # supabase.js (+ urlFirmada), auth.js, claude.js
│   ├── pages/          # 32 páginas (ver tabla de módulos)
│   └── styles/         # theme.css (variables CSS completas)
├── netlify/functions/  # 12 funciones serverless
├── migrations/         # 001–035 (SQL numerado, serie histórica)
├── supabase/migrations/# migraciones con timestamp (CLI Supabase)
├── sql/, scripts/      # utilidades y consultas de apoyo
├── public/
├── .env.local          # Solo variables VITE_* (seguras para frontend)
├── netlify.toml
├── tailwind.config.js
└── vite.config.js
```

---

## Variables de Entorno

### GRUPO A — `.env.local` (VITE_ prefix, seguras para frontend)
```
VITE_SUPABASE_URL=<url_supabase_petra>
VITE_SUPABASE_ANON_KEY=<anon_key>
VITE_APP_TITLE=Petra
VITE_APP_URL=<url_netlify_petra>
VITE_PARKING_URL=<url del proyecto Supabase del sistema de tickets>
VITE_PARKING_ANON_KEY=<anon_key del sistema de tickets>
```

### GRUPO B — Netlify Environment Variables ÚNICAMENTE (NUNCA en frontend)
```
ANTHROPIC_API_KEY=<claude_api_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
GOOGLE_CLIENT_ID=<google_oauth_client_id>
GOOGLE_CLIENT_SECRET=<google_oauth_client_secret>
```

⚠️ **REGLA ABSOLUTA**: ANTHROPIC_API_KEY y SUPABASE_SERVICE_ROLE_KEY NUNCA van en variables VITE_ ni en .env.local ni en el frontend bajo ninguna circunstancia.

---

## Paleta de Colores RANNIX Standard

```css
--color-primary: #0A66C2        /* Azul corporativo */
--color-primary-dark: #1A3C5E   /* Azul oscuro / footer */
--color-secondary: #E8A020      /* Dorado acento */
--color-success: #057642        /* Verde */
--color-warning: #F59E0B        /* Ámbar */
--color-danger: #B24020         /* Rojo */
```

---

## Base de Datos — Supabase

**Proyecto principal**: (pendiente — crear proyecto Supabase para Petra)

**Proyecto secundario**: sistema de tickets de estacionamiento — cliente `supabaseParking` en `src/lib/supabase.js` (lectura, sin sesión persistida). Alimenta EDR con Estacionamiento / Pensiones / Vending.

### Convención de acceso: vistas `prp_*`
El frontend **lee siempre desde vistas `prp_*`**, nunca de las tablas base. Las escrituras sí van a la tabla base correspondiente (p. ej. actualizar `foto_url` va a `rh_empleados`, no a `prp_empleados`).

Vistas en uso: `prp_contratos`, `prp_empleados`, `prp_unidades`, `prp_inmuebles`, `prp_cartera`, `prp_cobros`, `prp_gastos`, `prp_ingresos`, `prp_incidencias`, `prp_asistencia`, `prp_prenomina`, `prp_vacantes`, `prp_bitacora`, `prp_proveedores`, `prp_movimientos_bancarios`, `prp_estacionamiento`, `prp_estacionamiento_mensual`, `prp_pensiones_estacionamiento`, `prp_vending_semanas`, `prp_fondos_revolventes`, `prp_fondo_semana`, `prp_fondo_revolvente_cierres`, `prp_mapa_locales`, `prp_notas_contrato`, `prp_expediente_arrendatario`, `prp_checadas`, `prp_asistencia_semana`, `prp_tipos_incidencia`, `prp_vacaciones_anio`, `prp_vacaciones_detalle`, `prp_historico_sueldos`.

### Tablas principales
- **Inmobiliario**: `cat_locales`, `contratos`, `contratos_locales`, `arrendatarios`
- **Cobranza**: `cargos_programados`, `comprobantes_pago`, `aplicaciones_pago`, `movimientos_banco`
- **Financiero**: `ingresos`, `gastos_operativos`, `gasto_detalle`, `er_mensual`
- **Operación**: `ordenes_trabajo`, `cat_proveedores`, `cat_productos`
- **Estacionamiento**: `estacionamiento_diario`, `estacionamiento_pensiones`
- **Vending**: `vending_productos`, `vending_semanas`
- **RH**: `rh_empleados`, `rh_incidencias`, `rh_historial_sueldo`, `rh_historial_nombre`, `rh_historial_cambios`, `rh_expediente_documentos`, `rh_beneficios`, `rh_capacitacion`, `rh_evaluaciones`, `rh_asistencia`, `rh_checadas`, `rh_tipos_incidencia`, `rh_vacaciones_anio`, `rh_vacaciones_detalle`
- **Validación**: `validacion_puntos`, `validacion_revisiones`, `validacion_reportes`, `validacion_adjuntos`
- **Catálogos / DW**: `cat_estado_general`, `dw.dim_tiempo_dia`, `dw.dim_tiempo_mes`, `dw.dim_tiempo_anio`

### Storage

Estado del cierre de buckets (etapa 2 de `20260829120000_storage_privado_urls_firmadas.sql`):

| Bucket | `public` | Políticas RLS |
|---|---|---|
| `contratos-firmados` | **false** | authenticated |
| `prospecto-docs` | **false** | authenticated + insert anónimo acotado a `prospectos/` |
| `facturas-cfdi` | **false** | authenticated |
| `tickets-gastos` | **false** | authenticated |
| `vending-reportes` | **false** | authenticated |
| `expedientes-docs` | **false** | authenticated (`20260907100000`) |
| `validacion-capturas` | **false** | authenticated (`20260910400000`) |
| `contratos-docs` | **false** (`20260913100000`) | solo INSERT authenticated; sin uso en el código |
| `ot-evidencias` | **false** | authenticated |
| `avatars` | **true a propósito** | lectura pública — fotos de empleados |
| `catalogos` · `logos-arrendatarios` | **true a propósito** | logos e imágenes de marca (`LogoEditable.jsx`) |

`20260913100000` también elimina `public_read_expedientes` (lectura pública sobre `expedientes-docs`) y la
política anon de INSERT sin carpeta en `prospecto-docs`; queda `anon_insert_prospecto_docs` acotada a `prospectos/`.

**Regla de lectura**: salvo `avatars`, ningún archivo se pinta con su URL directa. Se usa
`src/components/ui/ArchivoPrivado.jsx` — `<ImagenPrivada>`, `<EnlacePrivado>` y el hook
`useUrlFirmada` — que firman con `urlFirmada()` de `src/lib/supabase.js`. `EnlacePrivado`
firma al hacer clic, no al pintar, para no gastar una firma por fila de tabla. El portal de
prospectos, que es anónimo, obtiene su URL desde la function `portal-prospecto`.

**Escrituras**: todavía guardan la URL pública completa en las columnas `*_url`. No hace
falta migrarlas: `urlFirmada()` detecta ese formato y extrae la ruta. Guardar la ruta es
preferible para filas nuevas, pero ambas funcionan.

**Cierre**: `20260908200000_storage_cerrar_buckets_publicos.sql` pone `public = false` en los
cinco buckets que quedaban abiertos. Es reversible: si algo deja de verse, se vuelve a poner
`public = true` en el bucket afectado.

### Migraciones — dos carriles
- `migrations/NNN_*.sql` — numeradas, serie histórica del proyecto (hasta `035_fix_avatars_policy.sql`)
- `supabase/migrations/<timestamp>_*.sql` — carril del CLI de Supabase, el usado para lo reciente

### Esquema `prp` (legado, todavía vivo)
Además del esquema `public` (donde viven las tablas base y la mayoría de las vistas `prp_*`), la base de datos
tiene un esquema **`prp`** más antiguo con ~38 tablas base (`prp.arrendatarios`, `prp.contratos_arrendamiento`,
`prp.empleados`, etc.) de una arquitectura previa del proyecto. **No está muerto**: varias vistas `prp_*` en
`public` (`prp_cobros`, `prp_kpis`, `prp_mapa_locales`, `prp_expediente_arrendatario`, `prp_conciliacion_cobros`,
`prp_adendums`, `prp_bitacora`, `prp_estacionamiento`, `prp_fondos_revolventes`, `prp_movimientos_bancarios`,
`prp_notas_contrato`, `prp_prospectos`, `prp_proveedores`, `prp_cat_estado_general`, `prp_cat_grupo_gasto`,
`prp_documentos`, `prp_pensiones_estacionamiento`, `prp_cajones_estacionamiento`,
`prp_fondo_revolvente_cierres`) leen directamente de tablas del esquema `prp`, no de `public`. El archivo
`reset_database.sql` en la raíz del repo referencia un proyecto de Supabase distinto/antiguo
(`ywashdlhkbvleigakjus`) y una arquitectura `prp`/`dw` diferente a la actual — **no usarlo** para reconstruir
esquema; está obsoleto y no coincide con la estructura real de producción.

Para reconstruir el esquema completo desde cero (p. ej. para un ambiente nuevo) usar
`scripts/dump-schema.mjs` (introspección vía `pg_catalog`, sin depender de `pg_dump`/Docker) — genera
`supabase/qa-bootstrap/schema.sql` a partir de producción, cubriendo ambos esquemas (`prp` + `public`),
tablas, constraints, FKs, índices, vistas (ordenadas topológicamente), funciones, triggers y políticas RLS.

### Asistencia — modelo de eventos

`rh_checadas` guarda **cada marcaje** del biométrico (`operacion` ENTRADA/SALIDA + `fecha_hora`).
Un trigger consolida el día en `rh_asistencia` (primera entrada, última salida, retardo contra
el horario del empleado). Se escribe en `rh_checadas`, nunca en `rh_asistencia` directamente.
`prp_asistencia_semana` da un renglón por empleado y día (`dia_semana`: 1=lunes … 7=domingo)
y es la que alimenta la columna de asistencia del reporte semanal de nómina.

### RLS — modelo por rol (desde `20260913100000_cierre_rls_auditoria_tenant.sql`)

Resultado de la auditoría de aislamiento del 2026-09-12. Antes, las 90 políticas de negocio eran
`USING (true)` para `authenticated`, las vistas saltaban RLS y `anon` leía todo el esquema `public`.

- **`es_staff()`** decide el acceso: `rol_id NOT IN ('arrendatario','prospecto','restaurante','locatario')`.
  Toda tabla de `public` y `prp` tiene la política `staff_all` (`FOR ALL TO authenticated USING (es_staff())`).
- **Locatario** (`irp_usuarios.contrato_id`): políticas `locatario_lee` en `contratos`, `contratos_locales`,
  `arrendatarios`, `cargos_programados`, `aplicaciones_pago`, `documentos`, `ingresos`, más
  `locatario_sube_comprobante` (INSERT en `ingresos` con `estatus_validacion = 'POR_VALIDAR'`). Helpers
  `mi_contrato_id()` y `mi_arrendatario_id()`. Si `ExpedienteContrato.jsx` toca una tabla nueva, hay que
  darle política; si no, el locatario ve vacío.
- **Restaurante**: `restaurante_all` solo en `restaurante_gastos` y `restaurante_gasto_detalle`.
- **Catálogos de lectura libre** para cualquier autenticado (`auth_lee`): `irp_roles`, `cat_parametros`, `cat_locales`.
- **Vistas** `public.*` llevan `security_invoker = true`: heredan la RLS de quien consulta. Una vista nueva
  debe crearse `WITH (security_invoker = true)`; `authenticated` tiene `USAGE` + `SELECT` sobre `prp` para
  las 19 vistas que leen ese esquema.
- **`anon`** no tiene grants en `public` salvo `SELECT, UPDATE` en `prospecto_documentos` y
  `prospecto_personas` (portal de prospectos) ni `EXECUTE` en ninguna función. Tabla o función nueva nace
  sin acceso anon por `ALTER DEFAULT PRIVILEGES`. Ojo: `REVOKE ... FROM anon` no basta para funciones,
  porque heredan el `EXECUTE` implícito de `PUBLIC`; `20260913110000_funciones_sin_execute_public.sql`
  revoca a `PUBLIC` y otorga solo a `authenticated` y `service_role` en `public` y `prp`.
- **Funciones `SECURITY DEFINER` de escritura** (`crear_empleado`, `confirmar_cobro*`, `desmarcar_cobros`,
  `renovar_contrato`, `*_nomina*`) validan `IF NOT es_staff() THEN RAISE ... '42501'` al inicio.

**Pruebas automáticas**: `npm run test:rls` (QA) / `npm run test:rls:prod` corren `scripts/test-rls.mjs`:
66 aserciones por rol (anon, staff, locatario, restaurante) con `SET LOCAL ROLE` + claims JWT simulados,
todo en transacciones con `ROLLBACK`, más una prueba REST con la clave anon. El workflow
`.github/workflows/rls-tests.yml` las corre contra QA en cada push a `develop` que toque migraciones y a
diario. Aplicar una migración: `npm run migrate:qa -- supabase/migrations/<archivo>.sql` (aplica y corre
las pruebas); igual con `migrate:prod`. `node scripts/verificar-post-migracion.mjs qa|prod` corre los 7
bloques de verificación (76 pruebas) y deja `docs/verificacion-rls-<env>-<fecha>.md` con diagnóstico y SQL
propuesto por cada ✗. Antes de migrar producción: `node scripts/snapshot-seguridad.mjs prod` guarda en
`supabase/backups/` la foto de políticas, grants, funciones, vistas y buckets más un `rollback-*.sql`, e
imprime la lista de verificación manual de storage.

Tras cambiar políticas de Storage se recarga el esquema con `notify pgrst` (ver `20260820910000_notify_pgrst_reload.sql`).

---

## Módulos Petra — 30 rutas en producción

Registradas en `src/App.jsx`.

| Ruta | Módulo | Página |
|---|---|---|
| `/` | Dashboard + KPIs | `Dashboard.jsx` |
| `/inmuebles` | Inmuebles y Unidades | `Inmuebles.jsx` |
| `/mapa-locales` | Mapa visual de locales | `MapaLocales.jsx` |
| `/contratos` | Contratos de Arrendamiento | `Contratos.jsx` |
| `/renovaciones` | Renovaciones de contrato | `Renovaciones.jsx` |
| `/arrendatarios` | Arrendatarios | `Arrendatarios.jsx` |
| `/cobranza` | Cobranza | `Cobranza.jsx` |
| `/conciliacion` | Conciliación bancaria | `Conciliacion.jsx` |
| `/ingresos` | Ingresos | `Ingresos.jsx` |
| `/gastos-operativos` | Gastos operativos | `GastosOperativos.jsx` |
| `/fondo-revolvente` | Fondo revolvente | `FondoRevolvente.jsx` |
| `/utilidades` | Utilidades | `Utilidades.jsx` |
| `/edr` | Estado de Resultados mensual | `EDR.jsx` |
| `/resumen-semanal` | Resumen semanal | `ResumenSemanal.jsx` |
| `/reportes` | Reportes y BI | `Reportes.jsx` |
| `/mantenimiento` | Mantenimiento y OT | `Mantenimiento.jsx` |
| `/proyectos` | Proyectos y Obras | `Proyectos.jsx` |
| `/proveedores` | Proveedores | `Proveedores.jsx` |
| `/bitacora` | Bitácora | `Bitacora.jsx` |
| `/agua` | Consumo de agua | `Agua.jsx` |
| `/estacionamiento` | Estacionamiento y pensiones | `Estacionamiento.jsx` |
| `/vending` | Vending | `Vending.jsx` |
| `/despachos` | Despachos | `Despachos.jsx` |
| `/restaurante/gastos` | Gastos de restaurante | `RestauranteGastos.jsx` |
| `/rh` | RH y Nómina | `RH.jsx` |
| `/rh/empleado/:id` | Expediente Digital de Empleado | `ExpedienteEmpleado.jsx` |
| `/prospectos` | Prospectos y CRM | `Prospectos.jsx` |
| `/calculos` | Cálculos del Sistema (documentación) | `Calculos.jsx` |
| `/validacion` | Validación del Sistema | `Validacion.jsx` |
| `/config` | Configuración | `Configuracion.jsx` |
| `/portal/prospecto/:token` | Portal público de prospecto | `PortalProspecto.jsx` |
| — | Login | `Login.jsx` |

---

## Roles y shells de aplicación

`AppLayout` en `src/App.jsx` decide qué aplicación ve cada usuario según `perfil.rol_id`:

1. **Rutas `/portal/*`** — públicas, sin layout admin (prospecto y arrendatario)
2. **`arrendatario` / `prospecto` logueado** (`ROLES_SIN_APP`) — pantalla "sin acceso", nunca el admin. El portal de
   arrendatario se retiró el 2026-09-13 (`20260913120000`): el inquilino usa el rol `locatario`, uno por contrato
   (`irp_usuarios.contrato_id`), que ve solo `/contratos/:id` en modo acotado
3. **`restaurante`** — shell admin recortado: únicamente `/restaurante/gastos`
4. **Resto (staff)** — layout admin completo con las 28 rutas internas

---

## Netlify Functions (10)

| Function | Propósito |
|---|---|
| `chat-operativo.js` | Agente Operativo conversacional |
| `chat-analitico.js` | Agente Analítico BI/DW |
| `extraer-documento.js` | Extracción de datos de documentos con Claude |
| `gastos-ocr.js` | OCR de tickets de gastos |
| `vending-ocr.js` | OCR de reportes de vending |
| `generar-contrato.js` | Generación de contrato |
| `generar-documentos.js` | Generación de documentos (docx) |
| `generar-sanciones.js` | Cálculo/generación de sanciones |
| `portal-prospecto.js` | Backend anónimo del portal de prospectos (firma URLs) |
| `subir-comprobante.js` | Carga de comprobantes de pago (exige JWT de sesión activa) |

Todas usan `claude-sonnet-4-6`; `max_tokens` va de 800 a 4096 según la función.

---

## Agentes IA

### AgenteOperativo (chat flotante)
- Componente: `src/components/agents/AgenteOperativo.jsx`
- Function: `netlify/functions/chat-operativo.js`
- Modelo: `claude-sonnet-4-6`, max_tokens: 1024
- Posición: botón circular fijo bottom-right, panel deslizante 380x520px

### AgenteAnalitico (barra de búsqueda BI)
- Componente: `src/components/agents/AgenteAnalitico.jsx`
- Function: `netlify/functions/chat-analitico.js`
- Modelo: `claude-sonnet-4-6`, max_tokens: 800
- Formato de respuesta: DATO + INTERPRETACION + RECOMENDACION

---

## Autenticación

- **Usuarios internos**: Email + contraseña (vía Supabase Auth)
- **Google OAuth**: `signInWithGoogle()` en `src/lib/auth.js`
- **Prospectos**: token de portal anónimo (`/portal/prospecto/:token`)
- **Inquilinos**: cuenta con rol `locatario` vinculada a su contrato (`irp_usuarios.contrato_id`)
- **Sesión persistida**: `persistSession: true` en el cliente principal; `false` en `supabaseParking`

---

## Comandos de Desarrollo

```bash
npm run dev        # Servidor local en http://localhost:5173
npm run build      # Build de producción en /dist
npm run preview    # Vista previa del build
```

---

## Versión de la aplicación

El número de versión se genera **automáticamente en tiempo de build** con el formato:

```
V_YYMMDD_HH_MM
```

Ejemplos: `V_260915_17_45`, `V_261023_09_02`

- **Generado en**: `vite.config.js` → función `getBuildId()` → variable global `__APP_VERSION__`
- **Mostrado en**: Header superior de la app (parte superior de la pantalla, badge dorado junto al logo Petra)
- **Regla**: cada despliegue produce una versión única por timestamp del build — no se edita manualmente
- **Historial**: el timestamp del commit git sirve como referencia complementaria

---

## Deploy

- **URL producción**: (pendiente de configurar)
- **URL QA**: (pendiente de configurar)
- **GitHub**: (pendiente de configurar)
- **Ramas**: `master` (producción), `develop` (QA), `demo`
- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Functions directory**: `netlify/functions`
- **Node version**: 20
- **SPA redirect**: `/*` → `/index.html` (200)

---

## Ambiente QA (staging)

Ambiente paralelo completo para pruebas antes de llegar a producción — base de datos, sitio Netlify y rama
de git independientes, con datos reales replicados (no dummy).

| Componente | Valor |
|---|---|
| Proyecto Supabase QA | `wijcjdbmdbxzmwpdxoal` (región distinta a producción — conexión directa `db.wijcjdbmdbxzmwpdxoal.supabase.co:5432`, no pooler) |
| Sitio Netlify QA | `irpapp-qa` (id `59764536-8357-4a8d-89c9-ee4d752fa159`) — https://irpapp-qa.netlify.app |
| Rama de git | `develop` |
| `VITE_AMBIENTE` | `QA` (activa el badge morado "QA" en `Header.jsx`) |

**Estado del vínculo Netlify↔GitHub**: pendiente de vincular manualmente el sitio `irpapp-qa` a la rama
`develop` desde el dashboard de Netlify (Site configuration → Build & deploy → Continuous deployment) — no
hay operación de API/MCP para esto.

### Credenciales
`SUPABASE_DB_PASSWORD` (producción) y `QA_SUPABASE_DB_PASSWORD` (QA) viven únicamente en `.env.local`
(gitignored), nunca en el repo ni en el chat. Las demás env vars de QA (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` — esta última compartida con
producción a propósito) están configuradas directamente en Netlify.

### Cómo reconstruir QA desde cero
1. `node scripts/dump-schema.mjs` — introspecciona producción (`prp` + `public`) y escribe
   `supabase/qa-bootstrap/schema.sql`.
2. `node scripts/apply-schema-qa.mjs` — aplica ese esquema a la base de datos QA (requiere que esté vacía;
   si no, primero `DROP SCHEMA public/prp CASCADE; CREATE SCHEMA ...`).
3. `node scripts/clone-data-to-qa.mjs` — copia los datos reales de producción a QA tabla por tabla
   (`session_replication_role = replica` para no pelear con FKs durante la carga; reajusta secuencias al
   final). Pensado para correr sobre un esquema recién aplicado (no trunca antes de insertar).
4. `node scripts/clone-auth-to-qa.mjs` — copia `auth.users` + `auth.identities` de producción a QA
   preservando `id` y el hash bcrypt de la contraseña: cada usuario entra a QA con su mismo correo y
   password de producción. Decisión explícita del usuario (2026-09-12): usar cuentas reales en QA en vez
   de cuentas separadas con password temporal — asumido a propósito, no es el default más seguro.
5. `node scripts/grant-api-roles-qa.mjs` — **imprescindible, fácil de olvidar**: otorga a `anon`,
   `authenticated` y `service_role` los privilegios sobre el esquema `public` (`USAGE` + CRUD en todas las
   tablas/vistas/funciones/secuencias) que Supabase aprovisiona automáticamente en un proyecto nuevo pero
   que **no** quedan capturados por un dump vía `pg_catalog` — sin esto, PostgREST responde
   `permission denied for schema public` (42501) y el frontend nunca llega a leer nada, aunque los datos y
   las políticas RLS estén perfectos. Este fue exactamente el bug que causó "Tu cuenta todavía no está
   vinculada a ningún contrato" en QA la primera vez, con `irp_usuarios` teniendo el `contrato_id`
   correcto — el fallo estaba en el permiso de esquema, no en los datos ni en RLS.

Estos cinco scripts no dependen de `pg_dump`/`psql`/Docker (ninguno está instalado en esta máquina) — usan
`pg_catalog`/`information_schema` directamente vía el paquete `pg` de Node.

---

## Cumplimiento SAT

- CFDI 4.0 con Complemento de Pago (REP)
- Validación RFC con regex oficial SAT
- Retención ISR 10% / IVA 16% automática
- Cancelación CFDI siguiendo cat_motivo_cancelacion SAT
- Regímenes fiscales: 612, 626, 601, 603, 605, 621

---

## Reglas de Negocio Absolutas

1. Un inmueble puede tener múltiples unidades; una unidad pertenece a un solo inmueble
2. Un contrato activo por unidad; al renovar se crea nuevo contrato con período de gracia
3. Cobranza se genera automáticamente día 1 de cada mes
4. Factura CFDI se emite únicamente cuando el pago está conciliado en banco
5. Depósito en garantía = 2 meses de renta (configurable por contrato)
6. Penalización morosidad = 5% mensual (configurable)
7. Contrato mínimo 1 año; opción renovación anticipada 60 días antes

---

## Convenciones de Código

- **Leer por vista, escribir por tabla**: consultas desde `prp_*`, mutaciones a la tabla base
- **Storage siempre firmado**: `urlFirmada()`, nunca `getPublicUrl()`
- **Commits en español** con prefijo tipo + módulo: `feat(rh):`, `fix(storage):`, `chore:`
- **Estilos**: variables CSS de `theme.css` mediante `style={{ ... }}` inline; Tailwind disponible pero no dominante
- **Claves secretas**: jamás en `VITE_*`; toda llamada a Claude pasa por Netlify Functions

---

*Generado automáticamente por Claude Code — RANNIX Consulting 2026*
