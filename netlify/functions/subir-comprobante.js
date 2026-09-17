/**
 * subir-comprobante.js — Petra · RANNIX Consulting 2026
 *
 * Sube un archivo a Storage con la service_role key, desde el servidor.
 *
 * SEGURIDAD — por qué esta función lleva verificación de sesión:
 * la service_role key salta todas las políticas RLS. Sin autenticar al que
 * llama, cualquiera en internet que conociera la URL podía escribir en los
 * buckets del proyecto y sobrescribir comprobantes existentes (x-upsert). Se
 * exige el JWT de una sesión activa y se
 * valida la ruta para que nadie pueda escribir fuera de la carpeta que le toca.
 */

const { createClient } = require('@supabase/supabase-js')

// Node.js 20 en Netlify Functions no tiene WebSocket nativo; supabase-js lo requiere
// para realtime. Lo polyfillamos con el paquete ws (ya en node_modules).
if (typeof WebSocket === 'undefined') global.WebSocket = require('ws')

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://kusuoxwzdxfuybvyiakg.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

// Bucket -> carpetas raíz donde se permite escribir. Nadie escribe en la raíz
// del bucket ni en una carpeta que no esté aquí.
const BUCKETS = {
  'facturas-cfdi':     ['comprobantes', 'facturas'],
  'tickets-gastos':    ['restaurante', 'gastos'],
  'vending-reportes':  ['vending'],
}

const MIMES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
  'application/pdf', 'application/xml', 'text/xml',
]

const MAX_BYTES = 15 * 1024 * 1024   // 15 MB
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Solo el propio sitio y el entorno de desarrollo. Antes era '*', que dejaba a
// cualquier página del mundo llamar a la función desde el navegador.
function corsOrigin(event) {
  const origin = event.headers.origin || event.headers.Origin || ''
  const ok = /^https:\/\/([a-z0-9-]+--)?petraprp\.netlify\.app$/.test(origin)
    || /^https:\/\/deploy-preview-\d+--petraprp\.netlify\.app$/.test(origin)
    || /^http:\/\/localhost:\d+$/.test(origin)
  return ok ? origin : 'https://petraprp.netlify.app'
}

/**
 * Deja la ruta en algo que no pueda salirse de su carpeta: sin '..', sin barra
 * inicial, sin barras dobles, y con la primera carpeta dentro de lo permitido.
 */
function rutaValida(filePath, bucket) {
  if (typeof filePath !== 'string' || !filePath || filePath.length > 400) return null
  if (filePath.includes('..') || filePath.startsWith('/') || filePath.includes('//')) return null
  if (!/^[A-Za-z0-9._/-]+$/.test(filePath)) return null
  const raiz = filePath.split('/')[0]
  if (!BUCKETS[bucket].includes(raiz)) return null
  if (!filePath.includes('/')) return null      // exige carpeta, no raíz del bucket
  return filePath
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  corsOrigin(event),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  }
  const responder = (statusCode, obj) => ({ statusCode, headers, body: JSON.stringify(obj) })

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  if (event.httpMethod !== 'POST')    return responder(405, { error: 'Método no permitido' })
  if (!SERVICE_KEY)                   return responder(500, { error: 'SUPABASE_SERVICE_ROLE_KEY no configurada' })

  // ── Sesión activa ────────────────────────────────────────────────────────
  const jwt = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  if (!jwt) return responder(401, { error: 'No autorizado' })

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: { user }, error: authErr } = await admin.auth.getUser(jwt)
  if (authErr || !user) return responder(401, { error: 'Sesión inválida' })

  // Y que sea personal del sistema. Los roles de portal (arrendatario,
  // prospecto) y el de solo lectura no suben archivos por aquí: el portal del
  // arrendatario tiene su propia función acotada a su carpeta.
  const { data: perfil } = await admin
    .from('irp_usuarios').select('rol_id, activo').eq('id', user.id).single()
  const VETADOS = ['arrendatario', 'prospecto', 'read_only']
  if (!perfil?.activo || VETADOS.includes(perfil.rol_id)) {
    return responder(403, { error: 'Acceso denegado' })
  }

  // ── Body ─────────────────────────────────────────────────────────────────
  let body
  try { body = JSON.parse(event.body) }
  catch { return responder(400, { error: 'JSON inválido' }) }

  const { bucket, path: rutaCruda, file_base64, mime_type, ingreso_id } = body
  const targetBucket = bucket || 'facturas-cfdi'

  if (!BUCKETS[targetBucket])           return responder(400, { error: 'Bucket no permitido' })
  if (!rutaCruda || !file_base64 || !mime_type) return responder(400, { error: 'Faltan campos requeridos' })
  if (!MIMES.includes(mime_type))       return responder(400, { error: 'Tipo de archivo no permitido' })

  const filePath = rutaValida(rutaCruda, targetBucket)
  if (!filePath) return responder(400, { error: 'Ruta no permitida' })

  const buffer = Buffer.from(file_base64, 'base64')
  if (!buffer.length)            return responder(400, { error: 'Archivo vacío' })
  if (buffer.length > MAX_BYTES) return responder(413, { error: 'El archivo excede 15 MB' })

  // ── Subida ───────────────────────────────────────────────────────────────
  let upRes
  try {
    upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${targetBucket}/${filePath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Content-Type': mime_type,
        'x-upsert': 'true',
      },
      body: buffer,
    })
  } catch (netErr) {
    console.error('subir-comprobante network error', netErr)
    return responder(502, { error: 'Error de red al contactar storage: ' + netErr.message })
  }

  if (!upRes.ok) {
    const errText = await upRes.text().catch(() => '')
    const host = new URL(SUPABASE_URL).hostname
    console.error('subir-comprobante storage', upRes.status, host, errText)
    return responder(502, { error: `Storage devolvió ${upRes.status} (${host}): ${errText.slice(0, 200)}` })
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${targetBucket}/${filePath}`

  // Los buckets son privados: se guarda la ruta completa y el frontend la firma
  // con urlFirmada(), que acepta este formato.
  if (ingreso_id) {
    if (!UUID.test(String(ingreso_id))) return responder(400, { error: 'ingreso_id inválido' })
    await fetch(`${SUPABASE_URL}/rest/v1/ingresos?id=eq.${ingreso_id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ comprobante_url: publicUrl }),
    })
  }

  return responder(200, { url: publicUrl })
}
