import { useModuleAudit } from '../hooks/useAudit'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarRange, ChevronRight, Printer, CheckCircle, AlertCircle, Car, ShoppingBag, Home, Wallet, ExternalLink, Plus, X, Pencil, Trash2 } from 'lucide-react'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { supabase, supabaseParking } from '../lib/supabase'
import toast from 'react-hot-toast'
import { ImagenPrivada, EnlacePrivado } from '../components/ui/ArchivoPrivado'

// ── Helpers ───────────────────────────────────────────────────────────────────
// Extrae nombre legible de proveedor (puede ser string normal, objeto JSON o JSON serializado)
const parseProvNombre = (val) => {
  if (!val) return ''
  if (typeof val === 'object') return val.nombre_comercial || ''
  if (typeof val === 'string' && val.startsWith('{')) {
    try { return JSON.parse(val)?.nombre_comercial || val } catch { return val }
  }
  return val
}

function fmt(n, dec = 2) {
  return '$' + (parseFloat(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

const DIAS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function isoDate(d) { return d.toISOString().split('T')[0] }

// Fecha local como YYYY-MM-DD (evita cambio de día por diferencia UTC vs hora local)
function hoyLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function labelFecha(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T12:00:00')
  return `${DIAS_ES[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${MESES_ES[d.getMonth()]}`
}

// ── Tabla de semanas operativas ──────────────────────────────────────────────
// Cada semana tiene 3 fechas:
//   ini      = Sábado (inicio oficial del corte)
//   fin      = Viernes (fin del corte)
//   iniEstac = Viernes anterior al Sábado (estac. se cobra desde ese Vie)
//
// Formato de label corto para el combo: "Sáb 27/Jun — Vie 03/Jul/2026"

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function labelCorto(ini, fin) {
  const i = new Date(ini + 'T12:00:00')
  const f = new Date(fin + 'T12:00:00')
  const dI = `${DIAS_ES[i.getDay()].slice(0,3)} ${i.getDate()}/${MESES_ES[i.getMonth()]}`
  const dF = `${DIAS_ES[f.getDay()].slice(0,3)} ${f.getDate()}/${MESES_ES[f.getMonth()]}/${f.getFullYear()}`
  return `${dI} — ${dF}`
}

// Genera la tabla de semanas desde ORIGEN hasta la semana actual (nunca a
// futuro: no puede existir un corte de una semana que aún no termina), y
// solo conserva las últimas 10 — más reciente primero.
function generarTablaSemanas() {
  const ORIGEN_INI = '2026-06-27'   // primer Sábado registrado
  const hoy = new Date()
  // Sábado de la semana actual (usando fecha local, no UTC)
  const dow = hoy.getDay()                            // 0=Dom … 6=Sáb
  const diasHastaSab = dow === 6 ? 0 : dow + 1
  const sabHoy = new Date(hoy)
  sabHoy.setDate(sabHoy.getDate() - diasHastaSab)
  const sabHoyLocal = `${sabHoy.getFullYear()}-${String(sabHoy.getMonth()+1).padStart(2,'0')}-${String(sabHoy.getDate()).padStart(2,'0')}`

  const semanas = []
  let cur = ORIGEN_INI
  while (cur <= sabHoyLocal) {
    const fin = addDays(cur, 6)          // Vie = Sáb + 6
    const iniEstac = addDays(cur, -1)    // Vie anterior = Sáb - 1
    semanas.push({ ini: cur, fin, iniEstac, label: labelCorto(cur, fin) })
    cur = addDays(cur, 7)
  }
  semanas.reverse()   // más reciente primero
  return semanas.slice(0, 10)
}

// Sábado de la semana que contiene una fecha dada
function sabadoDe(iso) {
  const d = new Date(iso + 'T12:00:00')
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 6 ? 0 : dow + 1))
  return d.toISOString().split('T')[0]
}

// ── Carga pensiones del sistema de estacionamiento (proyecto separado) ─────────
async function cargarPensionesParking(ini, fin) {
  if (!supabaseParking) return { cobradas: [], pendientes: [], esperadas: [] }
  // Usa el Viernes final de la semana para determinar el mes (la semana puede cruzar dos meses)
  const d = new Date((fin || ini) + 'T12:00:00')
  const mes  = d.getMonth() + 1
  const anio = d.getFullYear()

  // Traer TODAS las pensiones del mes (cobradas y pendientes)
  const { data: todasMes } = await supabaseParking
    .from('pagos_pension')
    .select('pago_id, monto_pagado, monto_tarifa, fecha_pago, periodo_mes, estado, notas, pension:pension_id(codigo_acceso, monto_mensual)')
    .eq('periodo_mes', mes)
    .eq('periodo_año', anio)
    .order('estado')  // pagado primero

  const todas      = todasMes ?? []
  const pendientes = todas.filter(p => p.estado !== 'pagado' && p.estado !== 'validado')
  // "Cobradas" del corte semanal: solo las que se pagaron dentro de la
  // semana que se está informando (por fecha_pago), no todas las del mes —
  // si no, aparecían aquí pagos de semanas anteriores ya reportados.
  const cobradas = todas.filter(p =>
    (p.estado === 'pagado' || p.estado === 'validado') &&
    p.fecha_pago && p.fecha_pago.slice(0, 10) >= ini && p.fecha_pago.slice(0, 10) <= fin
  )

  return { cobradas, pendientes, esperadas: todas, mes, anio }
}

// ── Carga de datos: estac usa iniEstac→fin, resto usa ini→fin ─────────────────
async function cargarDatos(ini, fin, iniEstac) {
  const [
    { data: estac },
    { data: pensionesLegacy },
    { data: vending },
    { data: gastos },
    { data: rentasEf },
    pensionesParking,
  ] = await Promise.all([
    // Estacionamiento: desde Vie anterior (iniEstac) hasta el Vie del corte
    supabase.from('estacionamiento_diario')
      .select('id, fecha, cantidad, dia_semana, notas')
      .gte('fecha', iniEstac).lte('fecha', fin)
      .order('fecha'),

    // Pensiones legacy (tabla local — fallback si parking no disponible)
    supabase.from('estacionamiento_pensiones')
      .select('id, local_referencia, arrendatario_nombre, monto, num_recibo, fecha, pagado, nota')
      .eq('semana_inicio', ini)
      .order('num_recibo'),

    // Vending: semana cuyo fecha_inicio = Sábado seleccionado
    supabase.from('vending_semanas')
      .select('id, fecha_inicio, venta_pesos, residual_pesos, es_material, nota')
      .eq('fecha_inicio', ini)
      .limit(10),

    // Gastos operativos por fecha dentro del rango Sáb→Vie
    supabase.from('gastos_operativos')
      .select('id, fecha, proveedor, grupo_gasto, descripcion, cantidad, ticket_total, ticket_url')
      .gte('fecha', ini).lte('fecha', fin)
      .order('fecha'),

    // Ingresos efectivo (RENTA + AGUA + SANCION + OTRO): rango Sáb→Vie
    supabase.from('ingresos')
      .select('id, fecha, importe, tipo, origen, concepto_origen, nota, propietario, id_contrato')
      .eq('origen', 'EFECTIVO')
      .gte('fecha', ini).lte('fecha', fin)
      .order('fecha'),

    // Pensiones del sistema de estacionamiento (proyecto externo)
    cargarPensionesParking(ini, fin),
  ])

  const ingresosEf = rentasEf ?? []

  // Calcular venta_pesos real desde el JOIN con vending_semana_producto
  const vendingRows = (vending ?? []).map(v => {
    const det = v.vending_semana_producto ?? []
    if (det.length === 0) return v
    const realVentas = det.reduce((s, r) => s + (parseFloat(r.importe_ventas) || 0), 0)
    if (Math.abs(realVentas - (parseFloat(v.venta_pesos) || 0)) > 0.5) {
      supabase.from('vending_semanas').update({ venta_pesos: realVentas }).eq('id', v.id).then(() => {})
      return { ...v, venta_pesos: realVentas }
    }
    return v
  })

  // Pensiones: priorizar sistema parking; fallback a tabla legacy
  const pensionesParking_cobradas   = pensionesParking.cobradas   ?? []
  const pensionesParking_pendientes = pensionesParking.pendientes ?? []
  const pensionesParking_esperadas  = pensionesParking.esperadas  ?? []
  const usarParking = supabaseParking !== null

  const normalizarPension = (p, pagado) => ({
    id:                  p.pago_id,
    local_referencia:    p.pension?.codigo_acceso || '—',
    arrendatario_nombre: p.pension?.codigo_acceso || '—',
    monto:               parseFloat(p.monto_pagado) || parseFloat(p.monto_tarifa) || 0,
    monto_tarifa:        parseFloat(p.monto_tarifa) || 0,
    num_recibo:          null,
    fecha:               p.fecha_pago,
    pagado,
    nota:                p.notas,
    estado:              p.estado,
  })

  // Normalizar pensiones cobradas a formato común
  const pensiones = usarParking
    ? [
        ...pensionesParking_cobradas.map(p => normalizarPension(p, true)),
        ...pensionesParking_pendientes.map(p => normalizarPension(p, false)),
      ]
    : (pensionesLegacy ?? [])

  return {
    estac:     estac     ?? [],
    pensiones,
    pensionesEsperadasMes: usarParking ? pensionesParking_esperadas : [],
    pensionesParking: { mes: pensionesParking.mes, anio: pensionesParking.anio },
    vending:   vendingRows,
    gastos:    gastos    ?? [],
    rentasEf:  ingresosEf.filter(r => r.tipo === 'RENTA'),
    aguaEf:    ingresosEf.filter(r => r.tipo === 'AGUA'),
    otrosEf:   ingresosEf.filter(r => !['RENTA','AGUA'].includes(r.tipo)),
  }
}

// ── Grupos de gasto para el modal ─────────────────────────────────────────────
const GRUPOS_GASTO = [
  'Ferretería y materiales','Limpieza e higiene','Servicios externos',
  'Papelería y oficina','Alimentación','Vending / Reabasto',
  'Herramienta y equipo','Seguridad','Nómina / Personal','Otros',
]

const DIAS_SEMANA = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']

// ── Modal base ────────────────────────────────────────────────────────────────
function Modal({ titulo, onClose, children }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
      <div style={{ background:'white', borderRadius:'14px', width:'420px', maxWidth:'95vw', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 20px', borderBottom:'1px solid #F3F4F6' }}>
          <h3 style={{ margin:0, fontSize:'15px', fontWeight:700, color:'#111827' }}>{titulo}</h3>
          <button onClick={onClose} style={{ background:'#F3F4F6', border:'none', borderRadius:'6px', padding:'5px', cursor:'pointer', display:'flex', alignItems:'center', color:'#6B7280' }}><X size={16}/></button>
        </div>
        <div style={{ padding:'20px' }}>{children}</div>
      </div>
    </div>
  )
}

// ── Modal: Detalle de pensiones cobradas en la semana ────────────────────────
function ModalPensionesCobradas({ pensiones, semIni, semFin, onClose }) {
  const total = pensiones.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0)
  const ordenadas = [...pensiones].sort((a, b) =>
    String(a.fecha || '').localeCompare(String(b.fecha || '')) ||
    String(a.local_referencia || '').localeCompare(String(b.local_referencia || '')))
  const th = { padding:'6px 10px', fontSize:'10px', fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.04em', background:'#F9FAFB', borderBottom:'1px solid #E5E7EB', textAlign:'left' }
  const td = { padding:'6px 10px', fontSize:'12px', color:'#374151', borderBottom:'1px solid #F3F4F6' }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background:'white', borderRadius:'14px', width:'520px', maxWidth:'95vw', maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 20px', borderBottom:'1px solid #F3F4F6' }}>
          <div>
            <h3 style={{ margin:0, fontSize:'15px', fontWeight:700, color:'#111827' }}>✅ Pensiones cobradas</h3>
            <div style={{ fontSize:'11px', color:'#6B7280', marginTop:'2px' }}>Semana {labelFecha(semIni)} → {labelFecha(semFin)} · {pensiones.length} pago{pensiones.length === 1 ? '' : 's'}</div>
          </div>
          <button onClick={onClose} style={{ background:'#F3F4F6', border:'none', borderRadius:'6px', padding:'5px', cursor:'pointer', display:'flex', alignItems:'center', color:'#6B7280' }}><X size={16}/></button>
        </div>
        <div style={{ overflowY:'auto', flex:1 }}>
          {ordenadas.length === 0 ? (
            <div style={{ padding:'24px', textAlign:'center', color:'#9CA3AF', fontSize:'12px' }}>Sin pensiones cobradas esta semana</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Local / Pensión</th>
                  <th style={th}>Fecha de pago</th>
                  <th style={{ ...th, textAlign:'right' }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((p, i) => (
                  <tr key={p.id ?? i} style={{ background: i % 2 === 0 ? 'white' : '#FAFAFA' }}>
                    <td style={td}>
                      <strong>{p.local_referencia || '—'}</strong>
                      {p.arrendatario_nombre && p.arrendatario_nombre !== p.local_referencia && <span style={{ color:'#6B7280', marginLeft:'6px' }}>{p.arrendatario_nombre}</span>}
                      {p.nota && <div style={{ fontSize:'10px', color:'#9CA3AF' }}>{p.nota}</div>}
                    </td>
                    <td style={td}>{p.fecha ? labelFecha(String(p.fecha).slice(0, 10)) : '—'}</td>
                    <td style={{ ...td, textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#057642' }}>{fmt(p.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', background:'#F0FDF4', borderTop:'1px solid #BBF7D0', borderRadius:'0 0 14px 14px' }}>
          <span style={{ fontSize:'12px', fontWeight:700, color:'#065F46' }}>Total cobrado</span>
          <span style={{ fontSize:'18px', fontWeight:900, color:'#057642', fontFamily:'monospace' }}>{fmt(total)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Gasto Fondo Revolvente ─────────────────────────────────────────────
function ModalGasto({ semIni, semFin, onClose, onSaved }) {
  const hoy = hoyLocal()
  const fechaDefault = hoy >= semIni && hoy <= semFin ? hoy : semFin
  const [form, setForm] = useState({ fecha: fechaDefault, proveedor: '', grupo_gasto: '', descripcion: '', cantidad: '' })
  const [saving, setSaving] = useState(false)

  const guardar = async () => {
    if (!form.proveedor || !form.cantidad) return toast.error('Proveedor y monto son obligatorios')
    setSaving(true)
    const dt = new Date(form.fecha + 'T12:00:00')
    const payload = {
      fecha: form.fecha,
      anio: dt.getFullYear(),
      mes: MESES_ES[dt.getMonth()],
      dia_semana: DIAS_SEMANA[dt.getDay()],
      semana: 'S' + Math.ceil(dt.getDate() / 7),
      semana_inicio: semIni,
      proveedor: form.proveedor.toUpperCase(),
      proveedor_nombre: form.proveedor,
      grupo_gasto: form.grupo_gasto || 'Otros',
      descripcion: form.descripcion || form.proveedor,
      cantidad: parseFloat(form.cantidad),
      monto_pagado: parseFloat(form.cantidad),
      tiene_factura: false,
    }
    const { error } = await supabase.from('gastos_operativos').insert(payload)
    if (error) toast.error(error.message)
    else { toast.success('Gasto registrado'); onSaved() }
    setSaving(false)
  }

  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontSize:'14px', boxSizing:'border-box' }
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'12px' }}>
        <div>
          <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>Fecha</label>
          <input type="date" value={form.fecha} min={semIni} max={semFin}
            onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} style={inp} />
        </div>
        <div>
          <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>Monto ($)</label>
          <input type="number" min="0" step="0.50" value={form.cantidad} placeholder="0.00" autoFocus
            onChange={e => setForm(p => ({ ...p, cantidad: e.target.value }))}
            style={{ ...inp, fontSize:'18px', fontWeight:800, textAlign:'right', color:'#DC2626' }} />
        </div>
      </div>
      <div style={{ marginBottom:'12px' }}>
        <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>Proveedor</label>
        <input value={form.proveedor} onChange={e => setForm(p => ({ ...p, proveedor: e.target.value }))} placeholder="Ej: Dogo, Office Depot..." style={inp} />
      </div>
      <div style={{ marginBottom:'12px' }}>
        <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>Categoría</label>
        <select value={form.grupo_gasto} onChange={e => setForm(p => ({ ...p, grupo_gasto: e.target.value }))} style={inp}>
          <option value="">— Seleccionar —</option>
          {GRUPOS_GASTO.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <div style={{ marginBottom:'20px' }}>
        <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>Concepto / Descripción</label>
        <input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Papel higiénico, Cloro..." style={inp} />
      </div>
      <button onClick={guardar} disabled={saving}
        style={{ width:'100%', padding:'13px', background:'#DC2626', color:'white', border:'none', borderRadius:'8px', fontSize:'15px', fontWeight:800, cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Guardando...' : 'Registrar gasto'}
      </button>
    </>
  )
}

// ── Modal: Ingreso Efectivo (Renta o Agua) ────────────────────────────────────
const MESES_INGRESO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function ModalIngreso({ tipo, semIni, semFin, onClose, onSaved }) {
  const hoy = hoyLocal()
  const fechaDefault = hoy >= semIni && hoy <= semFin ? hoy : semFin
  const [form, setForm] = useState({
    fecha: fechaDefault, importe: '', propietario: '',
    id_contrato: '', concepto_origen: '', nota: '',
  })
  const [saving, setSaving] = useState(false)

  const guardar = async () => {
    if (!form.importe) return toast.error('Ingresa el importe')
    setSaving(true)
    const _fecha = new Date(form.fecha + 'T12:00:00')
    const { error } = await supabase.from('ingresos').insert({
      fecha: form.fecha,
      mes: _fecha.getMonth() + 1,
      anio: _fecha.getFullYear(),
      tipo,
      origen: 'EFECTIVO',
      importe: parseFloat(form.importe),
      propietario: form.propietario || null,
      id_contrato: form.id_contrato || null,
      concepto_origen: form.concepto_origen || `${tipo} ${MESES_INGRESO[_fecha.getMonth()]}${_fecha.getFullYear().toString().slice(2)}`,
      nota: form.nota || null,
    })
    if (error) toast.error(error.message)
    else { toast.success(`${tipo} registrada`); onSaved() }
    setSaving(false)
  }

  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontSize:'14px', boxSizing:'border-box' }
  const color = tipo === 'RENTA' ? 'var(--color-success)' : '#0284C7'
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'12px' }}>
        <div>
          <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>Fecha de pago</label>
          <input type="date" value={form.fecha} min={semIni} max={semFin}
            onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} style={inp} />
        </div>
        <div>
          <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>Importe ($)</label>
          <input type="number" min="0" step="0.01" value={form.importe} placeholder="0.00" autoFocus
            onChange={e => setForm(p => ({ ...p, importe: e.target.value }))}
            style={{ ...inp, fontSize:'22px', fontWeight:800, textAlign:'right', color }} />
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'12px' }}>
        <div>
          <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>Propietario / Razón Social</label>
          <input value={form.propietario} onChange={e => setForm(p => ({ ...p, propietario: e.target.value }))} placeholder="Nombre..." style={inp} />
        </div>
        <div>
          <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>ID Contrato / Local</label>
          <input value={form.id_contrato} onChange={e => setForm(p => ({ ...p, id_contrato: e.target.value }))} placeholder="Ej: L04" style={inp} />
        </div>
      </div>
      <div style={{ marginBottom:'12px' }}>
        <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>Concepto (opcional)</label>
        <input value={form.concepto_origen} onChange={e => setForm(p => ({ ...p, concepto_origen: e.target.value }))}
          placeholder={tipo === 'RENTA' ? 'Ej: RENTA AGO26' : 'Ej: AGUA AGO26'} style={inp} />
      </div>
      <div style={{ marginBottom:'20px' }}>
        <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>Nota</label>
        <input value={form.nota} onChange={e => setForm(p => ({ ...p, nota: e.target.value }))} placeholder="Observaciones..." style={inp} />
      </div>
      <button onClick={guardar} disabled={saving}
        style={{ width:'100%', padding:'13px', background: color, color:'white', border:'none', borderRadius:'8px', fontSize:'15px', fontWeight:800, cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Guardando...' : `Registrar ${tipo.charAt(0)+tipo.slice(1).toLowerCase()}`}
      </button>
    </>
  )
}

// ── Modal: Pensión de Estacionamiento ─────────────────────────────────────────
function ModalPension({ semIni, semFin, onClose, onSaved }) {
  const hoy = hoyLocal()
  const fechaDefault = hoy >= semIni && hoy <= semFin ? hoy : semFin
  const [form, setForm] = useState({ fecha: fechaDefault, local_referencia: '', arrendatario_nombre: '', monto: '', num_recibo: '', nota: '' })
  const [saving, setSaving] = useState(false)

  const guardar = async () => {
    if (!form.monto) return toast.error('Ingresa el monto')
    setSaving(true)
    const _fp = new Date(form.fecha + 'T12:00:00')
    const { error } = await supabase.from('estacionamiento_pensiones').insert({
      fecha: form.fecha,
      mes: _fp.getMonth() + 1,
      anio: _fp.getFullYear(),
      semana_inicio: semIni,
      local_referencia: form.local_referencia || null,
      arrendatario_nombre: form.arrendatario_nombre || null,
      monto: parseFloat(form.monto),
      num_recibo: form.num_recibo || null,
      pagado: true,
      nota: form.nota || null,
    })
    if (error) toast.error(error.message)
    else { toast.success('Pensión registrada'); onSaved() }
    setSaving(false)
  }

  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontSize:'14px', boxSizing:'border-box' }
  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'12px' }}>
        <div>
          <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>Fecha de cobro</label>
          <input type="date" value={form.fecha} min={semIni} max={semFin}
            onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} style={inp} />
        </div>
        <div>
          <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>Monto ($)</label>
          <input type="number" min="0" step="50" value={form.monto} placeholder="0.00" autoFocus
            onChange={e => setForm(p => ({ ...p, monto: e.target.value }))}
            style={{ ...inp, fontSize:'18px', fontWeight:800, textAlign:'right', color:'var(--color-primary)' }} />
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'12px' }}>
        <div>
          <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>No. Local</label>
          <input value={form.local_referencia} onChange={e => setForm(p => ({ ...p, local_referencia: e.target.value }))} placeholder="Ej: L17, L26-27" style={inp} />
        </div>
        <div>
          <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>No. Recibo</label>
          <input value={form.num_recibo} onChange={e => setForm(p => ({ ...p, num_recibo: e.target.value }))} placeholder="001" style={inp} />
        </div>
      </div>
      <div style={{ marginBottom:'12px' }}>
        <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>Nombre del pensionado</label>
        <input value={form.arrendatario_nombre} onChange={e => setForm(p => ({ ...p, arrendatario_nombre: e.target.value }))} placeholder="Nombre completo" style={inp} />
      </div>
      <div style={{ marginBottom:'20px' }}>
        <label style={{ fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }}>Nota</label>
        <input value={form.nota} onChange={e => setForm(p => ({ ...p, nota: e.target.value }))} placeholder="Observaciones..." style={inp} />
      </div>
      <button onClick={guardar} disabled={saving}
        style={{ width:'100%', padding:'13px', background:'var(--color-primary)', color:'white', border:'none', borderRadius:'8px', fontSize:'15px', fontWeight:800, cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Guardando...' : 'Registrar pensión'}
      </button>
    </>
  )
}

// ── Componente fila de tabla ──────────────────────────────────────────────────
function FilaTabla({ label, monto, sub, bold, highlight, indent }) {
  return (
    <tr style={{ background: highlight ? '#FFFBEB' : 'transparent' }}>
      <td style={{ padding: '5px 8px', fontSize: '13px', paddingLeft: indent ? '24px' : '8px', color: bold ? '#111827' : '#374151', fontWeight: bold ? 700 : 400 }}>
        {label}
      </td>
      {sub != null && <td style={{ padding: '5px 8px', fontSize: '11px', color: '#9CA3AF', textAlign: 'center' }}>{sub}</td>}
      <td style={{ padding: '5px 8px', fontSize: '13px', fontWeight: bold ? 700 : 500, textAlign: 'right', color: bold ? '#111827' : '#374151' }}>
        {monto != null ? fmt(monto) : ''}
      </td>
    </tr>
  )
}

// ── Generador HTML para imprimir ──────────────────────────────────────────────
function generarHTML({ iniStr, finStr, pensiones, estac, parkingData, vending, gastos, rentasEf, aguaEf, otrosEf, totales }) {
  const { totPensiones, totEstac, totParking, totVending, totRentas, totAgua, totOtros, totalEfectivo, totGastosFondo, diferencia, residualVending } = totales

  const rowsPensiones = pensiones.map(p =>
    `<tr><td style="padding:3px 6px;font-size:11px;padding-left:16px">${p.local_referencia || '—'} ${p.arrendatario_nombre || ''}</td><td style="text-align:center;font-size:11px">${p.num_recibo || ''}</td><td style="text-align:right;padding:3px 6px">${fmt(p.monto)}</td><td></td></tr>`
  ).join('')

  const rowsRentas = rentasEf.map(r =>
    `<tr><td style="padding:3px 6px;font-size:12px">${r.propietario ? `${r.propietario} ${r.id_contrato||''}` : (r.concepto_origen || 'Renta')}</td><td style="font-size:11px;color:#6B7280">${r.fecha}</td><td style="text-align:right;padding:3px 6px">${fmt(r.importe)}</td><td></td></tr>`
  ).join('')
  const rowsAgua = (aguaEf||[]).map(r =>
    `<tr><td style="padding:3px 6px;font-size:12px">${r.propietario ? `${r.propietario} ${r.id_contrato||''}` : (r.concepto_origen || 'Agua')}</td><td style="font-size:11px;color:#6B7280">${r.fecha}</td><td style="text-align:right;padding:3px 6px;color:#0284C7">${fmt(r.importe)}</td><td></td></tr>`
  ).join('')

  const rowsGastos = gastos.map(g =>
    `<tr>
      <td style="padding:3px 6px;font-size:11px">${g.fecha ? g.fecha.slice(5).replace('-','/') : '—'}</td>
      <td style="padding:3px 6px;font-size:11px">${parseProvNombre(g.proveedor) || '—'}</td>
      <td style="padding:3px 6px;font-size:11px">${g.grupo_gasto || g.descripcion || '—'}</td>
      <td style="padding:3px 6px;text-align:right;font-size:11px">${fmt(g.cantidad)}</td>
      <td style="padding:3px 6px;text-align:right;font-size:11px;color:#6B7280">${g.monto_comprobante ? fmt(g.monto_comprobante) : ''}</td>
      <td style="padding:3px 6px;font-size:11px">${g.tiene_factura ? '✓ Fact.' : ''}</td>
    </tr>`
  ).join('')

  const vendingRows = vending.map(v =>
    `<tr><td style="padding:3px 6px;font-size:12px">Vending Machine</td><td></td><td style="text-align:right;padding:3px 6px;color:${v.es_material ? '#DC2626':'#374151'}">${fmt(v.venta_pesos)}${v.es_material ? ' (Material)' : ''}</td><td></td></tr>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Corte Semanal — ${iniStr}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1A1A1A; padding: 24px; }
  h1 { font-size:16px; color:#0A66C2; font-weight:800; }
  .sub { font-size:11px; color:#6B7280; }
  .hdr { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #0A66C2; padding-bottom:12px; margin-bottom:16px; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
  .panel-title { background:#1A3C5E; color:white; font-weight:800; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; padding:6px 10px; border-radius:4px 4px 0 0; }
  table { width:100%; border-collapse:collapse; }
  th { background:#F3F4F6; font-size:10px; font-weight:700; text-transform:uppercase; padding:5px 6px; color:#6B7280; text-align:left; border-bottom:1px solid #E5E7EB; }
  th.r, td.r { text-align:right; }
  tr:nth-child(even) { background:#FAFAFA; }
  .section-row td { background:#F0F4FF; font-weight:700; font-size:11px; text-transform:uppercase; color:#0A66C2; padding:5px 8px; border-top:1px solid #DBEAFE; }
  .total-box { border:2px solid #0A66C2; border-radius:6px; padding:8px 12px; margin:10px 0; display:flex; justify-content:space-between; align-items:center; }
  .total-box .lbl { font-size:11px; font-weight:700; text-transform:uppercase; color:#0A66C2; }
  .total-box .val { font-size:18px; font-weight:900; color:#0A66C2; }
  .sum-row td { font-weight:800; border-top:2px solid #1A3C5E; }
  .warn { color:#DC2626; font-weight:700; }
  .note { font-size:10px; color:#6B7280; font-style:italic; margin-top:4px; }
  .footer { border-top:1px solid #E5E7EB; margin-top:16px; padding-top:8px; display:flex; justify-content:space-between; font-size:10px; color:#9CA3AF; }
  @media print { @page { size: landscape; margin:10mm; } }
</style>
</head>
<body>
  <div class="hdr">
    <div>
      <h1>CORTE SEMANAL OPERATIVO</h1>
      <div class="sub">Inmobiliaria Alcedines del Norte · Plaza IWOL, Metepec</div>
      <div style="margin-top:4px; font-weight:700; color:#374151">${labelCorto(iniStr, finStr)}</div>
    </div>
    <div style="text-align:right">
      <div class="sub">Generado: ${new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric', hour:'2-digit',minute:'2-digit'})}</div>
      <div class="sub">Semana: Viernes → Jueves</div>
    </div>
  </div>

  <div class="cols">
    <!-- ── COLUMNA IZQUIERDA: INGRESOS ── -->
    <div>
      <div class="panel-title">💵 Ingresos en Efectivo</div>
      <table>
        <tbody>
          <!-- PENSIONES -->
          ${pensiones.length > 0 ? `
          <tr class="section-row"><td colspan="4">Pensiones de Estacionamiento</td></tr>
          <tr><td colspan="3" style="padding:4px 8px;font-weight:700">Total Pensiones</td><td style="text-align:right;font-weight:800;padding:4px 8px">${fmt(totPensiones)}</td></tr>
          <tr><td colspan="4" style="padding:4px 8px;font-size:10px;color:#057642;border-top:1px dashed #D1FAE5;line-height:1.6">
            ✅ Cobradas (${pensiones.filter(p=>p.pagado).length}/${pensiones.length}): ${pensiones.filter(p=>p.pagado).map(p=>p.local_referencia).join(', ')}
            ${pensiones.filter(p=>!p.pagado).length > 0 ? `<br/><span style="color:#B91C1C">⏳ Pendientes: ${pensiones.filter(p=>!p.pagado).map(p=>p.local_referencia).join(', ')}</span>` : ''}
          </td></tr>
          ` : ''}

          ${totParking > 0 && parkingData?.porDia ? `
          <tr class="section-row"><td colspan="4" style="color:#7C3AED">Tickets Sistema Parking (Vie–Jue)</td></tr>
          ${parkingData.porDia.map(d => `<tr><td style="padding:3px 6px;font-size:11px;padding-left:16px">${labelFecha(d.fecha)}</td><td style="text-align:right;font-size:11px;padding:3px 6px;color:#6B7280">${d.tickets} tickets</td><td style="text-align:right;font-weight:600;padding:3px 6px;color:#7C3AED">${fmt(d.importe)}</td><td></td></tr>`).join('')}
          <tr><td colspan="2" style="padding:4px 8px;font-weight:700;color:#7C3AED">Total Parking</td><td style="text-align:right;font-weight:800;padding:4px 8px;color:#7C3AED">${fmt(totParking)}</td><td></td></tr>
          ` : ''}

          <!-- VENDING MACHINE -->
          ${vending.length > 0 ? `
          <tr class="section-row"><td colspan="4">Vending Machine</td></tr>
          ${vendingRows}
          ` : ''}

          <!-- RENTAS EN EFECTIVO -->
          <tr class="section-row"><td colspan="4">Rentas cobradas en efectivo</td></tr>
          ${rowsRentas || '<tr><td colspan="4" style="padding:4px 8px;color:#9CA3AF;font-size:11px">Sin registros</td></tr>'}
          ${rentasEf.length > 0 ? `<tr><td colspan="2" style="padding:3px 8px;font-weight:700;font-size:11px">Total rentas</td><td></td><td style="text-align:right;font-weight:800;padding:3px 8px">${fmt(totRentas)}</td></tr>` : ''}

          <!-- AGUA -->
          <tr class="section-row"><td colspan="4">💧 Agua cobrada en efectivo</td></tr>
          ${rowsAgua || '<tr><td colspan="4" style="padding:4px 8px;color:#9CA3AF;font-size:11px">Sin registros</td></tr>'}
          ${(aguaEf||[]).length > 0 ? `<tr><td colspan="2" style="padding:3px 8px;font-weight:700;font-size:11px">Total agua</td><td></td><td style="text-align:right;font-weight:800;padding:3px 8px;color:#0284C7">${fmt(totAgua)}</td></tr>` : ''}
        </tbody>
      </table>

      <div class="total-box" style="margin-top:12px">
        <span class="lbl">Total Efectivo a Entregar</span>
        <span class="val">${fmt(totalEfectivo)}</span>
      </div>

      ${totGastosFondo > 5000 ? `
      <table>
        <tbody>
          <tr><td style="padding:4px 8px;color:#DC2626">Déficit Fondo Revolvente</td><td style="text-align:right;font-weight:700;color:#DC2626;padding:4px 8px">— ${fmt(totGastosFondo - 5000)}</td></tr>
          <tr><td style="padding:4px 8px;font-weight:700;border-top:1px solid #E5E7EB">Diferencia a entregar</td><td style="text-align:right;font-weight:800;border-top:1px solid #E5E7EB;padding:4px 8px;color:#15803D">${fmt(totalEfectivo - (totGastosFondo - 5000))}</td></tr>
          ${residualVending > 0 ? `<tr><td style="padding:4px 8px;font-size:11px;color:#6B7280">Residual Vending Machine</td><td style="text-align:right;font-size:11px;color:#6B7280;padding:4px 8px">${fmt(residualVending)}</td></tr>` : ''}
        </tbody>
      </table>` : ''}

      ${pensiones.some(p => p.nota) ? `<div class="note">${pensiones.filter(p=>p.nota).map(p=>`${p.local_referencia}: ${p.nota}`).join(' · ')}</div>` : ''}
    </div>

    <!-- ── COLUMNA DERECHA: GASTOS FONDO ── -->
    <div>
      <div class="panel-title">🧾 Gastos a Comprobar — Fondo Revolvente</div>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Gasto</th>
            <th>Concepto</th>
            <th class="r">Importe</th>
            <th class="r">$$ Comprob.</th>
            <th>Factura</th>
          </tr>
        </thead>
        <tbody>
          ${rowsGastos || '<tr><td colspan="6" style="padding:12px;color:#9CA3AF;text-align:center">Sin gastos registrados</td></tr>'}
          <tr class="sum-row">
            <td colspan="3" style="padding:5px 6px">Total</td>
            <td style="text-align:right;padding:5px 6px">${fmt(totGastosFondo)}</td>
            <td></td><td></td>
          </tr>
        </tbody>
      </table>

      <!-- Fondo recibido vs gastado -->
      ${(() => {
        const sobrante = 5000 - totGastosFondo
        const excede   = totGastosFondo > 5000
        const bgColor  = excede ? '#FEF2F2'  : '#F0FDF4'
        const brColor  = excede ? '#FCA5A5'  : '#86EFAC'
        const hdColor  = excede ? '#DC2626'  : '#15803D'
        const difColor = excede ? '#DC2626'  : '#15803D'
        const label    = excede ? 'Faltante (excede el fondo)' : 'Balance restante'
        return `
        <div style="margin-top:12px;background:${bgColor};border:1px solid ${brColor};border-radius:6px;padding:8px 12px">
          <div style="font-size:11px;font-weight:700;color:${hdColor};margin-bottom:4px">BALANCE FONDO REVOLVENTE</div>
          <div style="display:flex;justify-content:space-between;font-size:11px">
            <span>Fondo recibido (base $5,000)</span><span style="font-weight:700">$5,000.00</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px">
            <span>Total gastado</span><span style="font-weight:700;color:#DC2626">${fmt(totGastosFondo)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;border-top:1px solid ${brColor};margin-top:4px;padding-top:4px;font-weight:700">
            <span>${label}</span><span style="color:${difColor}">${fmt(Math.abs(sobrante))}</span>
          </div>
        </div>`
      })()}
    </div>
  </div>

  <div class="footer">
    <span>RANNIX Consulting · Petra</span>
    <span>Firma administrador: ________________________</span>
  </div>
</body>
</html>`
}

// ── Componente principal ─────────────────────────────────────────────────────
function BtnIr({ to, label, navigate }) {
  return (
    <button
      onClick={() => navigate(to)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', color: 'white', fontSize: '11px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em' }}
    >
      <ExternalLink size={11} /> {label}
    </button>
  )
}

export default function ResumenSemanal() {
  useModuleAudit('RESUMEN_SEMANAL')
  const navigate = useNavigate()

  // Tabla de semanas: [{ ini, fin, iniEstac, label }, ...]  (más reciente primero)
  const semanas = generarTablaSemanas()

  // Índice por defecto: semana actual
  const sabActual = sabadoDe(hoyLocal())
  const defaultIdx = semanas.findIndex(s => s.ini === sabActual)
  const [selIdx, setSelIdx] = useState(defaultIdx >= 0 ? defaultIdx : 0)
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // 'estac' | 'gasto' | 'pension' | 'renta' | 'agua'
  const [editRec, setEditRec] = useState(null)  // { tabla, row } — registro en edición
  const [delRec, setDelRec]   = useState(null)  // { tabla, id, label } — registro a eliminar
  const [parkingData, setParkingData] = useState(null)   // { total, porDia:[] } del sistema de tickets
  const [parkingLoading, setParkingLoading] = useState(false)

  const semSel = semanas[selIdx]   // { ini, fin, iniEstac, label }

  const recargar = () => {
    if (!semSel) return
    setLoading(true)
    cargarDatos(semSel.ini, semSel.fin, semSel.iniEstac)
      .then(d => { setDatos(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { recargar() }, [semSel?.ini])

  // ── Cargar datos de sistema externo de tickets de estacionamiento ──
  useEffect(() => {
    if (!semSel) return
    const PARKING_URL = import.meta.env.VITE_PARKING_URL
    const PARKING_KEY = import.meta.env.VITE_PARKING_ANON_KEY
    if (!PARKING_URL || !PARKING_KEY) return
    setParkingLoading(true)
    setParkingData(null)
    // Ciclo parking: Viernes→Jueves (1 día antes del ciclo IRP Sáb→Vie)
    const viernesAnterior = new Date(semSel.ini + 'T12:00:00')
    viernesAnterior.setDate(viernesAnterior.getDate() - 1)
    const jueves = new Date(semSel.fin + 'T12:00:00')
    jueves.setDate(jueves.getDate() - 1)
    const iniParking = isoDate(viernesAnterior)
    const finParking = isoDate(jueves)
    fetch(
      `${PARKING_URL}/rest/v1/tickets?select=fecha_op,importe,estatus&fecha_op=gte.${iniParking}&fecha_op=lte.${finParking}&estatus=eq.cobrado&limit=2000`,
      { headers: { apikey: PARKING_KEY, Authorization: `Bearer ${PARKING_KEY}` } }
    )
      .then(r => r.json())
      .then(rows => {
        const byDay = {}
        let total = 0
        rows.forEach(t => {
          const d = t.fecha_op
          if (!byDay[d]) byDay[d] = { fecha: d, tickets: 0, importe: 0 }
          byDay[d].tickets++
          byDay[d].importe += parseFloat(t.importe) || 0
          total += parseFloat(t.importe) || 0
        })
        setParkingData({ total, porDia: Object.values(byDay).sort((a,b) => a.fecha.localeCompare(b.fecha)) })
        setParkingLoading(false)
      })
      .catch(() => setParkingLoading(false))
  }, [semSel?.ini])

  // Calcular totales
  // Solo las cobradas (pagado=true) cuentan como ingreso real
  const totPensiones  = (datos?.pensiones  ?? []).filter(p => p.pagado).reduce((a, b) => a + (parseFloat(b.monto) || 0), 0)
  const totEstac      = (datos?.estac      ?? []).reduce((a, b) => a + (parseFloat(b.cantidad)    || 0), 0)
  const totVending    = (datos?.vending    ?? []).reduce((a, b) => a + (parseFloat(b.venta_pesos) || 0), 0)
  const totRentas     = (datos?.rentasEf   ?? []).reduce((a, b) => a + (parseFloat(b.importe)     || 0), 0)
  const totAgua       = (datos?.aguaEf     ?? []).reduce((a, b) => a + (parseFloat(b.importe)     || 0), 0)
  const totOtros      = (datos?.otrosEf    ?? []).reduce((a, b) => a + (parseFloat(b.importe)     || 0), 0)
  const totGastosFondo= (datos?.gastos     ?? []).reduce((a, b) => a + (parseFloat(b.cantidad)    || 0), 0)

  const vendingMaterial = (datos?.vending ?? []).filter(v => v.es_material).reduce((a, b) => a + (parseFloat(b.venta_pesos) || 0), 0)
  const residualVending = (datos?.vending ?? []).reduce((a, b) => a + (parseFloat(b.residual_pesos) || 0), 0)

  const totParking    = parkingData?.total ?? 0
  const totalEfectivo = totPensiones + totEstac + totParking + totVending + totRentas + totAgua + totOtros
  const diferencia    = totalEfectivo - totGastosFondo

  const totales = { totPensiones, totEstac, totParking, totVending, totRentas, totAgua, totOtros, totalEfectivo, totGastosFondo, diferencia, residualVending }

  const handlePrint = () => {
    const html = generarHTML({ iniStr: semSel.ini, finStr: semSel.fin, ...datos, parkingData, aguaEf, otrosEf, totales })
    const w = window.open('', '_blank', 'width=1100,height=750')
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 400)
  }

  // ── Estilos rápidos ──
  const S = {
    panelTitle: { background: '#1A3C5E', color: 'white', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 14px', borderRadius: '8px 8px 0 0' },
    sectionHeader: { background: '#EEF2FF', color: '#0A66C2', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', padding: '6px 12px', borderTop: '1px solid #DBEAFE', borderBottom: '1px solid #DBEAFE' },
    row: (stripe) => ({ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', padding: '6px 12px', background: stripe ? '#F9FAFB' : 'white', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }),
    monto: (color) => ({ fontWeight: 700, fontSize: '13px', color: color || '#374151', textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }),
    lbl: { fontSize: '12px', color: '#374151' },
    lblSmall: { fontSize: '11px', color: '#6B7280', paddingLeft: '14px' },
    acciones: { display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0 },
    btnEdit:  { background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '2px 3px', borderRadius: '4px', display: 'flex', alignItems: 'center' },
    btnDel:   { background: 'none', border: 'none', cursor: 'pointer', color: '#FCA5A5', padding: '2px 3px', borderRadius: '4px', display: 'flex', alignItems: 'center' },
  }

  // ── Eliminar registro ──
  const eliminar = async () => {
    if (!delRec) return
    const { tabla, id } = delRec
    const { error } = await supabase.from(tabla).delete().eq('id', id)
    if (error) { toast.error('No se pudo eliminar'); return }
    toast.success('Registro eliminado')
    setDelRec(null)
    recargar()
  }

  const estac     = datos?.estac     ?? []
  const pensiones = datos?.pensiones ?? []
  const vending   = datos?.vending   ?? []
  const gastos    = datos?.gastos    ?? []

  // ── Drill-down detalle de ticket ──
  const [ticketDetalle, setTicketDetalle] = useState(null) // { gasto, lineas }
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [reciboRec, setReciboRec] = useState(null) // pension para generar recibo
  const [detalleIngreso, setDetalleIngreso] = useState(null) // { tabla, row } — drilldown panel izq
  const [verPensiones, setVerPensiones] = useState(false)    // modal detalle de pensiones cobradas
  const [ticketLightbox, setTicketLightbox] = useState(null) // URL de imagen ticket
  const abrirDetalle = async (g) => {
    setLoadingDetalle(true)
    setTicketDetalle({ gasto: g, lineas: [] })
    const { data } = await supabase.from('gasto_detalle').select('*').eq('gasto_id', g.id).order('created_at')
    setTicketDetalle({ gasto: g, lineas: data || [] })
    setLoadingDetalle(false)
  }
  const rentasEf  = datos?.rentasEf  ?? []
  const aguaEf    = datos?.aguaEf    ?? []
  const otrosEf   = datos?.otrosEf   ?? []

  const esEstaSemana = semSel?.ini === sabActual

  return (
    <div style={{ padding: '24px', maxWidth: '1400px' }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CalendarRange size={22} color="var(--color-primary)" /> Corte Semanal Operativo
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--color-text-light)', margin: 0 }}>Semana: <strong>Sábado → Viernes</strong> · Corte entregado el Sábado en reunión de oficina central</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <select
              value={selIdx}
              onChange={e => setSelIdx(Number(e.target.value))}
              style={{ appearance: 'none', padding: '9px 40px 9px 14px', background: 'white', border: '1.5px solid var(--color-primary)', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#111827', cursor: 'pointer', minWidth: '340px' }}
            >
              {semanas.map((s, i) => (
                <option key={s.ini} value={i}>{s.label}</option>
              ))}
            </select>
            <ChevronRight size={16} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%) rotate(90deg)', pointerEvents: 'none', color: 'var(--color-primary)' }} />
            {esEstaSemana && <span style={{ position: 'absolute', top: '-8px', right: '-8px', fontSize: '10px', fontWeight: 700, color: 'white', background: 'var(--color-primary)', padding: '1px 6px', borderRadius: '10px' }}>HOY</span>}
          </div>
          <button
            onClick={() => { const idx = semanas.findIndex(s => s.ini === sabActual); if (idx >= 0) setSelIdx(idx) }}
            style={{ padding: '8px 14px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            Hoy
          </button>
          <button onClick={handlePrint} disabled={loading || !datos} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: loading || !datos ? '#6B7280' : '#1A3C5E', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: loading || !datos ? 'not-allowed' : 'pointer' }}>
            <Printer size={14} /> Imprimir PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><LoadingSpinner /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>

          {/* ══════════════════════════════════════════════
              COLUMNA IZQUIERDA — INGRESOS EN EFECTIVO
          ══════════════════════════════════════════════ */}
          <div style={{ border: '1px solid #E5E7EB', borderRadius: '10px', overflow: 'hidden', background: 'white' }}>
            <div style={{ ...S.panelTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>💵 Ingresos en Efectivo</span>
            <BtnIr to="/ingresos" label="Ir a Ingresos" navigate={navigate} />
          </div>

            {/* ── PENSIONES ── */}
            {(() => {
              const esperadasMes = datos?.pensionesEsperadasMes ?? []
              const totEsperado  = esperadasMes.reduce((s, p) => s + (parseFloat(p.monto_tarifa) || 0), 0)
              const totCobradoMes = esperadasMes.filter(p => p.estado === 'pagado' || p.estado === 'validado').reduce((s, p) => s + (parseFloat(p.monto_pagado) || 0), 0)
              const pkInfo = datos?.pensionesParking ?? {}
              const mesesStr = pkInfo.mes ? `${['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][pkInfo.mes]} ${pkInfo.anio}` : ''
              return (
                <>
                  <div style={{ ...S.sectionHeader, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span>Pensiones de estacionamiento</span>
                    {!supabaseParking && (
                      <button onClick={() => setModal('pension')} style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'2px 8px', background:'var(--color-primary)', border:'none', borderRadius:'5px', color:'white', fontSize:'10px', fontWeight:700, cursor:'pointer' }}>
                        <Plus size={10}/> Nueva
                      </button>
                    )}
                  </div>

                  {/* Resumen del mes (desde sistema parking) */}
                  {supabaseParking && esperadasMes.length > 0 && (
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 12px', background:'#EFF6FF', borderBottom:'1px solid #DBEAFE' }}>
                      <span style={{ fontSize:'10px', fontWeight:700, color:'#0A66C2' }}>
                        Mes {mesesStr}: {esperadasMes.length} pensiones activas
                      </span>
                      <span style={{ fontSize:'11px', color:'#374151' }}>
                        <span style={{ color:'#6B7280' }}>Esperado: </span>
                        <strong>{fmt(totEsperado)}</strong>
                        {totCobradoMes > 0 && <span style={{ color:'#057642', marginLeft:'8px' }}>· Cobrado: {fmt(totCobradoMes)}</span>}
                      </span>
                    </div>
                  )}

                  {/* Cobradas del mes — formato compacto */}
                  {(() => {
                    const cobradas   = pensiones.filter(p => p.pagado)
                    const pendientes = pensiones.filter(p => !p.pagado)
                    const totCob = cobradas.reduce((s, p) => s + (p.monto || 0), 0)

                    return (
                      <>
                        {pensiones.length === 0
                          ? <div style={{ padding:'10px 12px', color:'#9CA3AF', fontSize:'12px', textAlign:'center' }}>Sin pensiones registradas este mes</div>
                          : <>
                              {/* Pensiones cobradas — total clickeable, el detalle se abre en modal */}
                              {cobradas.length > 0 && (
                                <div title="Ver detalle de pensiones cobradas"
                                  onClick={() => setVerPensiones(true)}
                                  onMouseEnter={e => e.currentTarget.style.background='#DCFCE7'}
                                  onMouseLeave={e => e.currentTarget.style.background='#F0FDF4'}
                                  style={{ display:'grid', gridTemplateColumns:'1fr 110px', padding:'6px 12px', background:'#F0FDF4', borderBottom:'1px solid #BBF7D0', alignItems:'center', gap:'8px', cursor:'pointer' }}>
                                  <span style={{ fontSize:'11px', color:'#057642', display:'flex', alignItems:'center', gap:'6px' }}>
                                    <strong>✅ Pensiones cobradas ({cobradas.length})</strong>
                                    <span style={{ fontSize:'10px', color:'#6B7280' }}>· clic para ver detalle</span>
                                  </span>
                                  <span style={{ textAlign:'right', fontSize:'13px', fontWeight:800, color:'#057642', fontFamily:'monospace' }}>{fmt(totCob)}</span>
                                </div>
                              )}
                            </>
                        }
                        {/* Total */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 110px', padding:'7px 12px', background:'#F0F9FF', borderBottom:'1px solid #BFDBFE' }}>
                          <span style={{ fontSize:'12px', fontWeight:700, color:'#0A66C2' }}>
                            Pensiones del mes · {cobradas.length}/{pensiones.length} cobradas
                          </span>
                          <span style={S.monto('#0A66C2')}>{fmt(totCob)}</span>
                        </div>
                      </>
                    )
                  })()}
                </>
              )
            })()}

            {/* ── TICKETS DE ESTACIONAMIENTO (sistema externo) ── */}
            <div style={{ background:'#F0FDF4', borderBottom:'1px solid #BBF7D0' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 12px 4px' }}>
                <span style={{ fontSize:11, fontWeight:800, color:'#065F46', textTransform:'uppercase', letterSpacing:.5 }}>
                  🎫 Tickets Sistema Parking
                  <span style={{ fontSize:9, fontWeight:600, color:'#6B7280', textTransform:'none', marginLeft:6, letterSpacing:0 }}>
                    (Vie–Jue)
                  </span>
                </span>
                {parkingLoading && <span style={{ fontSize:10, color:'#6B7280' }}>Cargando…</span>}
                {parkingData && !parkingLoading && (
                  <span style={{ fontSize:11, fontWeight:700, color:'#065F46', fontFamily:'monospace' }}>
                    {fmt(parkingData.total)}
                  </span>
                )}
              </div>
              {parkingData?.porDia.map(d => (
                <div key={d.fecha} style={{ display:'grid', gridTemplateColumns:'1fr auto 90px', padding:'3px 12px 3px 20px', borderTop:'1px solid #D1FAE5', fontSize:11 }}>
                  <span style={{ color:'#374151' }}>{labelFecha(d.fecha)}</span>
                  <span style={{ color:'#6B7280', marginRight:8 }}>{d.tickets} tickets</span>
                  <span style={{ fontFamily:'monospace', fontWeight:700, color:'#065F46', textAlign:'right' }}>{fmt(d.importe)}</span>
                </div>
              ))}
              {!parkingData && !parkingLoading && (
                <div style={{ padding:'4px 12px 6px', fontSize:11, color:'#9CA3AF' }}>Sin datos</div>
              )}
            </div>

            {/* ── VENDING MACHINE ── */}
            {vending.length > 0 && (
              <>
                <div style={{ ...S.sectionHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><ShoppingBag size={12} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Vending Machine</span>
                  <button onClick={() => navigate('/vending')} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: 'var(--color-primary)', border: 'none', borderRadius: '5px', color: 'white', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>
                    <ExternalLink size={10} /> Agregar
                  </button>
                </div>
                {vending.map((v, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px', padding: '6px 12px', background: i % 2 === 0 ? 'white' : '#FAFAFA', borderBottom: '1px solid #F3F4F6', alignItems: 'center' }}>
                    <span style={{ ...S.lbl, display:'flex', alignItems:'center', gap:'6px' }}>
                      Vending Machine
                      {v.es_material && <span style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '2px 6px', borderRadius: '8px' }}>Material</span>}
                    </span>
                    <span style={S.monto(v.es_material ? '#DC2626' : '#374151')}>{fmt(v.venta_pesos)}</span>
                  </div>
                ))}
                {residualVending > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', padding: '5px 12px', borderBottom: '1px solid #F3F4F6' }}>
                    <span style={{ fontSize: '11px', color: '#9CA3AF' }}>Residual Vending Machine</span>
                    <span style={S.monto('#9CA3AF')}>{fmt(residualVending)}</span>
                  </div>
                )}
              </>
            )}

            {/* ── RENTAS EN EFECTIVO ── */}
            <div style={{ ...S.sectionHeader, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span><Home size={12} style={{ marginRight:'6px', verticalAlign:'middle' }}/>Rentas cobradas en efectivo</span>
              <button onClick={() => setModal('renta')} style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'2px 8px', background:'var(--color-success)', border:'none', borderRadius:'5px', color:'white', fontSize:'10px', fontWeight:700, cursor:'pointer' }}>
                <Plus size={10}/> Nueva
              </button>
            </div>
            {rentasEf.length === 0
              ? <div style={{ padding:'8px 12px', color:'#9CA3AF', fontSize:'12px' }}>Sin rentas esta semana</div>
              : rentasEf.map((r, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto 110px', padding:'6px 12px', background: i%2===0?'white':'#FAFAFA', borderBottom:'1px solid #F3F4F6', alignItems:'center', gap:'4px', cursor:'pointer' }}
                  onClick={() => setDetalleIngreso({ tabla:'ingresos', row: r })}
                  onMouseEnter={e => e.currentTarget.style.background='#F0EEFF'}
                  onMouseLeave={e => e.currentTarget.style.background= i%2===0?'white':'#FAFAFA'}>
                  <span style={S.lbl}>{r.propietario ? `${r.propietario}${r.id_contrato?' · '+r.id_contrato:''}` : (r.concepto_origen||'Renta')} <span style={{ color:'#9CA3AF', fontSize:'11px' }}>· {r.fecha}</span></span>
                  <span style={S.acciones} onClick={e => e.stopPropagation()}>
                    <button style={S.btnEdit} title="Editar" onClick={() => setEditRec({ tabla:'ingresos', row: r })}><Pencil size={12}/></button>
                    <button style={S.btnDel}  title="Eliminar" onClick={() => setDelRec({ tabla:'ingresos', id: r.id, label: `Renta ${r.propietario||r.concepto_origen||'—'} · ${r.fecha}` })}><Trash2 size={12}/></button>
                  </span>
                  <span style={S.monto('var(--color-success)')}>{fmt(r.importe)}</span>
                </div>
              ))
            }
            {rentasEf.length > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 110px', padding:'6px 12px', background:'#F0FDF4', borderBottom:'1px solid #BBF7D0' }}>
                <span style={{ fontSize:'12px', fontWeight:700, color:'var(--color-success)' }}>Total rentas</span>
                <span style={S.monto('var(--color-success)')}>{fmt(totRentas)}</span>
              </div>
            )}

            {/* ── AGUA EN EFECTIVO ── */}
            <div style={{ ...S.sectionHeader, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>💧 Agua cobrada en efectivo</span>
              <button onClick={() => setModal('agua')} style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'2px 8px', background:'#0284C7', border:'none', borderRadius:'5px', color:'white', fontSize:'10px', fontWeight:700, cursor:'pointer' }}>
                <Plus size={10}/> Nueva
              </button>
            </div>
            {aguaEf.length === 0
              ? <div style={{ padding:'8px 12px', color:'#9CA3AF', fontSize:'12px' }}>Sin cobros de agua esta semana</div>
              : aguaEf.map((r, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto 110px', padding:'6px 12px', background: i%2===0?'white':'#FAFAFA', borderBottom:'1px solid #F3F4F6', alignItems:'center', gap:'4px', cursor:'pointer' }}
                  onClick={() => setDetalleIngreso({ tabla:'ingresos', row: r })}
                  onMouseEnter={e => e.currentTarget.style.background='#F0F9FF'}
                  onMouseLeave={e => e.currentTarget.style.background= i%2===0?'white':'#FAFAFA'}>
                  <span style={S.lbl}>{r.propietario ? `${r.propietario}${r.id_contrato?' · '+r.id_contrato:''}` : (r.concepto_origen||'Agua')} <span style={{ color:'#9CA3AF', fontSize:'11px' }}>· {r.fecha}</span></span>
                  <span style={S.acciones} onClick={e => e.stopPropagation()}>
                    <button style={S.btnEdit} title="Editar" onClick={() => setEditRec({ tabla:'ingresos', row: r })}><Pencil size={12}/></button>
                    <button style={S.btnDel}  title="Eliminar" onClick={() => setDelRec({ tabla:'ingresos', id: r.id, label: `Agua ${r.propietario||r.concepto_origen||'—'} · ${r.fecha}` })}><Trash2 size={12}/></button>
                  </span>
                  <span style={{ ...S.monto(), color:'#0284C7' }}>{fmt(r.importe)}</span>
                </div>
              ))
            }
            {aguaEf.length > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 110px', padding:'6px 12px', background:'#F0F9FF', borderBottom:'1px solid #BAE6FD' }}>
                <span style={{ fontSize:'12px', fontWeight:700, color:'#0284C7' }}>Total agua</span>
                <span style={{ ...S.monto(), color:'#0284C7' }}>{fmt(totAgua)}</span>
              </div>
            )}

            {/* ── OTROS INGRESOS EFECTIVO ── */}
            {otrosEf.length > 0 && (
              <>
                <div style={S.sectionHeader}>Otros ingresos en efectivo</div>
                {otrosEf.map((r, i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto 110px', padding:'6px 12px', background: i%2===0?'white':'#FAFAFA', borderBottom:'1px solid #F3F4F6', alignItems:'center', gap:'4px', cursor:'pointer' }}
                    onClick={() => setDetalleIngreso({ tabla:'ingresos', row: r })}
                    onMouseEnter={e => e.currentTarget.style.background='#F0EEFF'}
                    onMouseLeave={e => e.currentTarget.style.background= i%2===0?'white':'#FAFAFA'}>
                    <span style={S.lbl}>{r.tipo} · {r.concepto_origen || r.propietario || '—'} <span style={{ color:'#9CA3AF', fontSize:'11px' }}>· {r.fecha}</span></span>
                    <span style={S.acciones} onClick={e => e.stopPropagation()}>
                      <button style={S.btnEdit} title="Editar" onClick={() => setEditRec({ tabla:'ingresos', row: r })}><Pencil size={12}/></button>
                      <button style={S.btnDel}  title="Eliminar" onClick={() => setDelRec({ tabla:'ingresos', id: r.id, label: `${r.tipo} · ${r.concepto_origen||r.propietario||'—'} · ${r.fecha}` })}><Trash2 size={12}/></button>
                    </span>
                    <span style={S.monto('#374151')}>{fmt(r.importe)}</span>
                  </div>
                ))}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 110px', padding:'6px 12px', background:'#F9FAFB', borderBottom:'1px solid #E5E7EB' }}>
                  <span style={{ fontSize:'12px', fontWeight:700, color:'#6B7280' }}>Total otros</span>
                  <span style={S.monto('#6B7280')}>{fmt(totOtros)}</span>
                </div>
              </>
            )}

            {/* ── TOTAL EFECTIVO A ENTREGAR ── */}
            <div style={{ marginTop: '8px', borderTop: '2px solid #E5E7EB' }}>
              <div style={{ background: '#1A3C5E', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: '13px', color: 'white', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Efectivo a Entregar</span>
                <span style={{ fontWeight: 900, fontSize: '22px', color: '#E8A020', fontFamily: 'monospace' }}>{fmt(totalEfectivo)}</span>
              </div>
            </div>

            {/* ── CÁLCULO FONDO — solo si gastos exceden el fondo fijo ── */}
            {totGastosFondo > 5000 && (
              <div style={{ padding: '8px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', padding: '6px 14px', borderBottom: '1px solid #F3F4F6' }}>
                  <span style={{ fontSize: '12px', color: '#DC2626' }}>Déficit Fondo Revolvente</span>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: '#DC2626', textAlign: 'right', fontFamily: 'monospace' }}>— {fmt(totGastosFondo - 5000)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', padding: '7px 14px', background: '#F0FDF4', borderBottom: '1px solid #BBF7D0' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#16a34a' }}>Diferencia a entregar</span>
                  <span style={{ fontWeight: 800, fontSize: '14px', color: '#16a34a', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(totalEfectivo - (totGastosFondo - 5000))}</span>
                </div>
                {residualVending > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', padding: '5px 14px' }}>
                    <span style={{ fontSize: '11px', color: '#9CA3AF' }}>Residual Vending Machine</span>
                    <span style={{ fontSize: '11px', color: '#9CA3AF', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(residualVending)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════
              COLUMNA DERECHA — GASTOS FONDO REVOLVENTE
          ══════════════════════════════════════════════ */}
          <div style={{ border: '1px solid #E5E7EB', borderRadius: '10px', overflow: 'hidden', background: 'white' }}>
            <div style={{ ...S.panelTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🧾 Gastos a Comprobar — Fondo Revolvente</span>
              <button onClick={() => setModal('gasto')} style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'4px 10px', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:'6px', color:'white', fontSize:'11px', fontWeight:700, cursor:'pointer' }}>
                <Plus size={12}/> Agregar Gasto
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                    {['Fecha','Gasto','Concepto','Importe','$$ Comprob.','Ticket','Factura'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 8px', textAlign: i >= 3 && i !== 5 ? 'right' : i === 5 ? 'center' : 'left', fontSize: '10px', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gastos.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: '12px' }}>Sin gastos registrados esta semana</td></tr>
                  ) : gastos.map((g, i) => (
                    <tr key={i} onClick={() => abrirDetalle(g)} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? 'white' : '#FAFAFA', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F0EEFF'}
                      onMouseLeave={e => e.currentTarget.style.background= i % 2 === 0 ? 'white' : '#FAFAFA'}>
                      <td style={{ padding: '6px 8px', color: '#6B7280', whiteSpace: 'nowrap' }}>{g.fecha ? g.fecha.slice(5).replace('-','/') : '—'}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{parseProvNombre(g.proveedor) || '—'}</td>
                      <td style={{ padding: '6px 8px', color: '#374151', maxWidth: '120px' }}>{g.grupo_gasto || g.descripcion || '—'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#0A66C2' }}>{fmt(g.cantidad)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: '#6B7280', fontFamily: 'monospace' }}>{g.ticket_total ? fmt(g.ticket_total) : ''}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        {g.ticket_url
                          ? <button onClick={() => setTicketLightbox(g.ticket_url)}
                              style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:5, padding:'3px 7px', cursor:'pointer', color:'#0A66C2', display:'inline-flex', alignItems:'center', gap:3, fontSize:10, fontWeight:700 }}
                              title="Ver imagen del ticket">
                              🖼️
                            </button>
                          : <span style={{ fontSize: '10px', color: '#D1D5DB' }}>—</span>
                        }
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        {g.tiene_factura
                          ? <CheckCircle size={13} color="var(--color-success)" />
                          : <span style={{ fontSize: '10px', color: '#D1D5DB' }}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#1A3C5E', borderTop: '2px solid #1A3C5E' }}>
                    <td colSpan={3} style={{ padding: '9px 8px', color: 'white', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase' }}>
                      Total Fondo Revolvente ({gastos.length} gastos)
                    </td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', color: '#E8A020', fontWeight: 900, fontSize: '16px', fontFamily: 'monospace' }}>
                      {fmt(totGastosFondo)}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Balance del Fondo */}
            <div style={{ padding: '14px', background: '#FFF8F0', borderTop: '1px solid #FDE68A' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#D97706', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Wallet size={13} /> Balance Fondo Revolvente
              </div>
              {[
                ['Fondo Fijo Revolvente', 5000, '#374151'],
                ['Gastos', totGastosFondo, '#DC2626'],
                ['Balance', 5000 - totGastosFondo, (5000 - totGastosFondo) >= 0 ? '#16a34a' : '#DC2626'],
              ].map(([label, val, color]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}>
                  <span style={{ color: '#6B7280' }}>{label}</span>
                  <span style={{ fontWeight: 700, color, fontFamily: 'monospace' }}>{fmt(val)}</span>
                </div>
              ))}
            </div>

          </div>

        </div>
      )}

      {/* ── DETALLE PENSIONES COBRADAS ── */}
      {verPensiones && (
        <ModalPensionesCobradas pensiones={pensiones.filter(p => p.pagado)} semIni={semSel.ini} semFin={semSel.fin} onClose={() => setVerPensiones(false)} />
      )}

      {/* ── MODALES DE CAPTURA RÁPIDA ── */}
      {modal === 'gasto' && (
        <Modal titulo="🧾 Registrar Gasto — Fondo Revolvente" onClose={() => setModal(null)}>
          <ModalGasto semIni={semSel.ini} semFin={semSel.fin}
            onClose={() => setModal(null)}
            onSaved={() => { setModal(null); recargar() }} />
        </Modal>
      )}
      {modal === 'pension' && (
        <Modal titulo="🚗 Nueva Pensión de Estacionamiento" onClose={() => setModal(null)}>
          <ModalPension semIni={semSel.ini} semFin={semSel.fin}
            onClose={() => setModal(null)}
            onSaved={() => { setModal(null); recargar() }} />
        </Modal>
      )}
      {modal === 'renta' && (
        <Modal titulo="🏠 Registrar Renta en Efectivo" onClose={() => setModal(null)}>
          <ModalIngreso tipo="RENTA" semIni={semSel.ini} semFin={semSel.fin}
            onClose={() => setModal(null)}
            onSaved={() => { setModal(null); recargar() }} />
        </Modal>
      )}
      {modal === 'agua' && (
        <Modal titulo="💧 Registrar Cobro de Agua en Efectivo" onClose={() => setModal(null)}>
          <ModalIngreso tipo="AGUA" semIni={semSel.ini} semFin={semSel.fin}
            onClose={() => setModal(null)}
            onSaved={() => { setModal(null); recargar() }} />
        </Modal>
      )}

      {/* ── MODAL EDICIÓN ── */}
      {editRec && (
        <ModalEditar rec={editRec} semIni={semSel.ini} semFin={semSel.fin}
          onClose={() => setEditRec(null)}
          onSaved={() => { setEditRec(null); recargar() }} />
      )}

      {/* ── MODAL DETALLE TICKET ── */}
      {ticketDetalle && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={() => setTicketDetalle(null)}>
          <div style={{ background:'white', borderRadius:14, width:'100%', maxWidth:580, maxHeight:'88vh', overflow:'auto' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'sticky', top:0, background:'white', zIndex:2 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:16, color:'#1A3C5E' }}>{parseProvNombre(ticketDetalle.gasto.proveedor) || 'Ticket sin proveedor'}</div>
                <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>{ticketDetalle.gasto.fecha} · {ticketDetalle.gasto.grupo_gasto || ticketDetalle.gasto.descripcion}</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ fontWeight:900, fontSize:20, color:'#B24020' }}>{fmt(ticketDetalle.gasto.cantidad)}</div>
                <button onClick={() => setTicketDetalle(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF' }}><X size={20}/></button>
              </div>
            </div>
            {/* Imagen del ticket */}
            {ticketDetalle.gasto.ticket_url && (
              <div style={{ padding:'16px 20px', borderBottom:'1px solid #F3F4F6', textAlign:'center' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', marginBottom:8 }}>Ticket Escaneado</div>
                <ImagenPrivada bucket="tickets-gastos" valor={ticketDetalle.gasto.ticket_url} alt="Ticket" style={{ maxWidth:'100%', maxHeight:320, borderRadius:8, border:'1px solid #E5E7EB', objectFit:'contain' }} />
                <div style={{ marginTop:6 }}>
                  <EnlacePrivado bucket="tickets-gastos" valor={ticketDetalle.gasto.ticket_url} style={{ fontSize:11, color:'#0A66C2', display:'inline-flex', alignItems:'center', gap:4 }}>
                    <ExternalLink size={11}/> Abrir en nueva pestaña
                  </EnlacePrivado>
                </div>
              </div>
            )}
            {/* Detalle líneas */}
            <div style={{ padding:'16px 20px' }}>
              {loadingDetalle ? (
                <div style={{ textAlign:'center', padding:24, color:'#9CA3AF' }}>Cargando artículos…</div>
              ) : ticketDetalle.lineas.length === 0 ? (
                <div style={{ textAlign:'center', padding:24, color:'#9CA3AF', fontSize:13 }}>
                  {ticketDetalle.gasto.descripcion && (
                    <div style={{ marginBottom:10, color:'#374151', fontSize:13, lineHeight:1.5 }}>{ticketDetalle.gasto.descripcion}</div>
                  )}
                  Sin detalle de artículos registrado.
                </div>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'#F9FAFB', borderBottom:'2px solid #E5E7EB' }}>
                      {['Cód.','Artículo','Cat.','Cant.','P/U','Subtotal'].map((h,i) => (
                        <th key={h} style={{ padding:'8px 10px', textAlign: i >= 3 ? 'right' : 'left', fontSize:10, fontWeight:700, color:'#6B7280', textTransform:'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ticketDetalle.lineas.map((l, i) => (
                      <tr key={l.id||i} style={{ borderBottom:'1px solid #F3F4F6', background: i%2===0?'white':'#FAFAFA' }}>
                        <td style={{ padding:'7px 10px', color:'#9CA3AF', fontFamily:'monospace', fontSize:11 }}>{l.codigo_proveedor||'—'}</td>
                        <td style={{ padding:'7px 10px', color:'#374151', fontWeight:500 }}>{l.descripcion}</td>
                        <td style={{ padding:'7px 10px' }}>
                          {l.categoria && (
                            <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:99,
                              background: l.categoria==='VENDING'?'#FCE7F3':l.categoria==='MANTENIMIENTO'?'#FEE2E2':'#DBEAFE',
                              color:      l.categoria==='VENDING'?'#BE185D':l.categoria==='MANTENIMIENTO'?'#B24020':'#1D4ED8' }}>
                              {l.categoria}
                            </span>
                          )}
                        </td>
                        <td style={{ padding:'7px 10px', textAlign:'right' }}>{l.cantidad}</td>
                        <td style={{ padding:'7px 10px', textAlign:'right', fontFamily:'monospace' }}>{fmt(l.precio_unit)}</td>
                        <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color:'#1A3C5E', fontFamily:'monospace' }}>{fmt(l.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop:'2px solid #E5E7EB', background:'#F9FAFB' }}>
                      <td colSpan={5} style={{ padding:'9px 10px', fontWeight:700, textAlign:'right', fontSize:13 }}>Total artículos:</td>
                      <td style={{ padding:'9px 10px', textAlign:'right', fontWeight:900, fontSize:15, color:'#1A3C5E', fontFamily:'monospace' }}>
                        {fmt(ticketDetalle.lineas.reduce((a,l) => a + (parseFloat(l.subtotal)||0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── LIGHTBOX IMAGEN TICKET ── */}
      {ticketLightbox && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={() => setTicketLightbox(null)}>
          <div style={{ position:'relative', maxWidth:'90vw', maxHeight:'90vh' }} onClick={e => e.stopPropagation()}>
            <img src={ticketLightbox} alt="Ticket escaneado"
              style={{ maxWidth:'100%', maxHeight:'85vh', objectFit:'contain', borderRadius:8, boxShadow:'0 0 40px rgba(0,0,0,0.6)' }} />
            <div style={{ position:'absolute', top:8, right:8, display:'flex', gap:8 }}>
              <a href={ticketLightbox} target="_blank" rel="noopener noreferrer"
                style={{ background:'rgba(255,255,255,0.9)', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, fontWeight:700, color:'#0A66C2', display:'inline-flex', alignItems:'center', gap:4, textDecoration:'none' }}>
                <ExternalLink size={12}/> Nueva pestaña
              </a>
              <button onClick={() => setTicketLightbox(null)}
                style={{ background:'rgba(255,255,255,0.9)', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, fontWeight:700, cursor:'pointer', color:'#374151', display:'inline-flex', alignItems:'center' }}>
                <X size={14}/>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DETALLE INGRESO ── */}
      {detalleIngreso && (
        <ModalDetalleIngreso rec={detalleIngreso} onClose={() => setDetalleIngreso(null)}
          onEdit={(tabla, row) => { setDetalleIngreso(null); setEditRec({ tabla, row }) }}
          onEliminar={(tabla, id, label) => { setDetalleIngreso(null); setDelRec({ tabla, id, label }) }}
          onRecibo={(row) => { setDetalleIngreso(null); setReciboRec({ ...row, _tabla: detalleIngreso.tabla }) }}
        />
      )}

      {/* ── MODAL RECIBO DE PAGO ── */}
      {reciboRec && (
        <ModalReciboPago rec={reciboRec} onClose={() => setReciboRec(null)} />
      )}

      {/* ── MODAL CONFIRMACIÓN ELIMINAR ── */}
      {delRec && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div style={{ background:'white', borderRadius:'14px', width:'360px', maxWidth:'95vw', padding:'24px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:'32px', textAlign:'center', marginBottom:'12px' }}>🗑️</div>
            <h3 style={{ margin:'0 0 8px', fontSize:'15px', fontWeight:700, textAlign:'center', color:'#111827' }}>¿Eliminar registro?</h3>
            <p style={{ margin:'0 0 20px', fontSize:'13px', color:'#6B7280', textAlign:'center' }}>{delRec.label}</p>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setDelRec(null)} style={{ flex:1, padding:'11px', background:'#F3F4F6', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:600, cursor:'pointer', color:'#374151' }}>
                Cancelar
              </button>
              <button onClick={eliminar} style={{ flex:1, padding:'11px', background:'#DC2626', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:700, cursor:'pointer', color:'white' }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Modal Editar registro genérico ────────────────────────────────────────────
function ModalEditar({ rec, semIni, semFin, onClose, onSaved }) {
  const { tabla, row } = rec
  const [form, setForm] = useState({ ...row })
  const [saving, setSaving] = useState(false)
  const inp = { width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontSize:'14px', boxSizing:'border-box' }
  const lbl = { fontSize:'12px', fontWeight:700, color:'#6B7280', display:'block', marginBottom:'5px' }

  const guardar = async () => {
    setSaving(true)
    let payload = {}
    if (tabla === 'estacionamiento_diario') {
      payload = { fecha: form.fecha, cantidad: parseFloat(form.cantidad), notas: form.notas || null }
    } else if (tabla === 'estacionamiento_pensiones') {
      payload = { monto: parseFloat(form.monto), nota: form.nota || null, local_referencia: form.local_referencia || null, arrendatario_nombre: form.arrendatario_nombre || null }
    } else if (tabla === 'ingresos') {
      payload = { importe: parseFloat(form.importe), nota: form.nota || null, fecha: form.fecha }
    }
    const { error } = await supabase.from(tabla).update(payload).eq('id', row.id)
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Registro actualizado')
    onSaved()
  }

  const titulo = tabla === 'estacionamiento_diario' ? '✏️ Editar Estacionamiento'
    : tabla === 'estacionamiento_pensiones' ? '✏️ Editar Pensión'
    : '✏️ Editar Ingreso'

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
      <div style={{ background:'white', borderRadius:'14px', width:'400px', maxWidth:'95vw', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 20px', borderBottom:'1px solid #F3F4F6' }}>
          <h3 style={{ margin:0, fontSize:'15px', fontWeight:700, color:'#111827' }}>{titulo}</h3>
          <button onClick={onClose} style={{ background:'#F3F4F6', border:'none', borderRadius:'6px', padding:'5px', cursor:'pointer', color:'#6B7280', display:'flex' }}><X size={16}/></button>
        </div>
        <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:'14px' }}>
          {/* Fecha — para estac diario e ingresos */}
          {(tabla === 'estacionamiento_diario' || tabla === 'ingresos') && (
            <div>
              <label style={lbl}>Fecha</label>
              <input type="date" value={form.fecha} min={semIni} max={semFin}
                onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} style={inp} />
            </div>
          )}
          {/* Campos pensión: local y arrendatario */}
          {tabla === 'estacionamiento_pensiones' && (
            <>
              <div>
                <label style={lbl}>Local / Referencia</label>
                <input value={form.local_referencia || ''} onChange={e => setForm(p => ({ ...p, local_referencia: e.target.value }))} style={inp} placeholder="Ej: L-12" />
              </div>
              <div>
                <label style={lbl}>Nombre Arrendatario</label>
                <input value={form.arrendatario_nombre || ''} onChange={e => setForm(p => ({ ...p, arrendatario_nombre: e.target.value }))} style={inp} placeholder="Nombre completo" />
              </div>
            </>
          )}
          {/* Monto */}
          <div>
            <label style={lbl}>Monto ($)</label>
            <input type="number" min="0" step="0.01" autoFocus
              value={tabla === 'estacionamiento_diario' ? form.cantidad : tabla === 'estacionamiento_pensiones' ? form.monto : form.importe}
              onChange={e => {
                const k = tabla === 'estacionamiento_diario' ? 'cantidad' : tabla === 'estacionamiento_pensiones' ? 'monto' : 'importe'
                setForm(p => ({ ...p, [k]: e.target.value }))
              }}
              style={{ ...inp, fontSize:'26px', fontWeight:800, textAlign:'right', color:'#0A66C2' }} />
          </div>
          {/* Nota */}
          <div>
            <label style={lbl}>Nota</label>
            <input value={form.nota ?? form.notas ?? ''}
              onChange={e => {
                const k = tabla === 'estacionamiento_diario' ? 'notas' : 'nota'
                setForm(p => ({ ...p, [k]: e.target.value }))
              }}
              placeholder="Opcional..." style={inp} />
          </div>
          <button onClick={guardar} disabled={saving}
            style={{ padding:'13px', background:'#0A66C2', color:'white', border:'none', borderRadius:'8px', fontSize:'15px', fontWeight:800, cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Detalle Ingreso — drilldown genérico panel izquierdo ────────────────
function ModalDetalleIngreso({ rec, onClose, onEdit, onEliminar, onRecibo }) {
  const { tabla, row } = rec

  // Campos a mostrar según tabla
  const campos = tabla === 'estacionamiento_pensiones' ? [
    ['Local / Ref.', row.local_referencia || '—'],
    ['Titular', row.arrendatario_nombre || '—'],
    ['Folio / Recibo', row.num_recibo ? `#${row.num_recibo}` : '—'],
    ['Semana inicio', row.semana_inicio || '—'],
    ['Fecha', row.fecha || '—'],
    ['Pagado', row.pagado ? '✓ Sí' : '✗ No'],
    ['Nota', row.nota || '—'],
    ['Monto', '$' + (parseFloat(row.monto)||0).toLocaleString('es-MX',{minimumFractionDigits:2})],
  ] : tabla === 'estacionamiento_diario' ? [
    ['Fecha', row.fecha || '—'],
    ['Importe', '$' + (parseFloat(row.cantidad)||0).toLocaleString('es-MX',{minimumFractionDigits:2})],
    ['Nota', row.nota || '—'],
    ['Creado', row.created_at ? new Date(row.created_at).toLocaleString('es-MX') : '—'],
  ] : /* ingresos */ [
    ['Tipo', row.tipo || '—'],
    ['Propietario', row.propietario || '—'],
    ['Contrato', row.id_contrato || '—'],
    ['Concepto', row.concepto_origen || '—'],
    ['Tipo pago', row.tipo_pago || 'Efectivo'],
    ['Fecha', row.fecha || '—'],
    ['Importe', '$' + (parseFloat(row.importe)||0).toLocaleString('es-MX',{minimumFractionDigits:2})],
    ['Nota', row.nota || '—'],
  ]

  const titulos = {
    estacionamiento_pensiones: '🚗 Pensión de Estacionamiento',
    estacionamiento_diario: '🅿️ Estacionamiento Diario',
    ingresos: '💵 Ingreso en Efectivo',
  }
  const monto = parseFloat(row.monto || row.importe || row.cantidad || 0)
  const labelElim = tabla === 'estacionamiento_pensiones'
    ? `Pensión #${row.num_recibo} — ${row.arrendatario_nombre}`
    : tabla === 'estacionamiento_diario'
    ? `Estacionamiento ${row.fecha}`
    : `${row.tipo} · ${row.concepto_origen||row.propietario||'—'} · ${row.fecha}`

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={onClose}>
      <div style={{ background:'white', borderRadius:14, width:'100%', maxWidth:420, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background:'#1A3C5E', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ color:'white', fontWeight:900, fontSize:14 }}>{titulos[tabla] || 'Detalle'}</div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:6, padding:'4px 8px', cursor:'pointer', color:'white', display:'flex' }}><X size={16}/></button>
        </div>

        {/* Monto destacado */}
        <div style={{ background:'#F0F9FF', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #E5E7EB' }}>
          <span style={{ fontSize:12, color:'#6B7280', fontWeight:700, textTransform:'uppercase', letterSpacing:.5 }}>Importe</span>
          <span style={{ fontSize:22, fontWeight:900, color:'#0A66C2', fontFamily:'monospace' }}>
            ${monto.toLocaleString('es-MX',{minimumFractionDigits:2})}
          </span>
        </div>

        {/* Campos */}
        <div style={{ padding:'4px 18px 14px' }}>
          {campos.filter(([,v]) => v && v !== '—').map(([lbl, val]) => (
            <div key={lbl} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'7px 0', borderBottom:'1px solid #F3F4F6' }}>
              <span style={{ color:'#6B7280', fontWeight:600 }}>{lbl}</span>
              <span style={{ fontWeight:700, color:'#1D1D1F', textAlign:'right', maxWidth:'55%' }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Acciones */}
        <div style={{ padding:'12px 18px', borderTop:'1px solid #E5E7EB', display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={() => onRecibo(row)}
            style={{ flex:1, padding:'9px', background:'#7B5EA7', color:'white', border:'none', borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer' }}>
            📄 Generar Recibo
          </button>
          <button onClick={() => onEdit(tabla, row)}
            style={{ flex:1, padding:'9px', background:'#EFF6FF', color:'#0A66C2', border:'1px solid #BFDBFE', borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer' }}>
            ✏️ Editar
          </button>
          <button onClick={() => onEliminar(tabla, row.id, labelElim)}
            style={{ padding:'9px 12px', background:'#FEE2E2', color:'#DC2626', border:'1px solid #FECACA', borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer' }}>
            🗑️
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Número a letra (español, MXN) ─────────────────────────────────────────────
function numLetra(n) {
  const UNIDADES = ['','UN','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE']
  const DECENAS  = ['','DIEZ','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA']
  const CIENTOS  = ['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS']
  const miles    = (x) => x === 1 ? 'MIL' : x > 1 ? `${centenas(x)} MIL` : ''
  const centenas = (x) => {
    if (x === 100) return 'CIEN'
    const c = Math.floor(x/100), r = x % 100
    return [CIENTOS[c], decenas(r)].filter(Boolean).join(' ')
  }
  const decenas = (x) => {
    if (x < 20) return UNIDADES[x]
    const d = Math.floor(x/10), u = x%10
    if (d === 2 && u > 0) return `VEINTI${UNIDADES[u]}`
    return [DECENAS[d], u ? UNIDADES[u] : ''].filter(Boolean).join(' Y ')
  }
  const entero  = Math.floor(Math.abs(n))
  const cents   = Math.round((Math.abs(n) - entero) * 100)
  const mil     = Math.floor(entero / 1000)
  const resto   = entero % 1000
  const partes  = [miles(mil), centenas(resto)].filter(Boolean).join(' ')
  return `${partes || 'CERO'} PESOS ${String(cents).padStart(2,'0')}/100 M.N.`
}

// ── Modal Recibo de Pago (formato físico WOL) ─────────────────────────────────
function ModalReciboPago({ rec, onClose }) {
  const [formaPago, setFormaPago] = useState('Efectivo')

  const hoy    = new Date()
  const dia    = String(hoy.getDate()).padStart(2,'0')
  const mes    = String(hoy.getMonth()+1).padStart(2,'0')
  const anio   = String(hoy.getFullYear())
  const meses  = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const mesNom = meses[hoy.getMonth()+1]

  // Normalizar según tipo de fila (_tabla indica origen)
  const tabla = rec._tabla || 'estacionamiento_pensiones'
  const monto = parseFloat(
    rec.monto ?? rec.importe ?? rec.cantidad ?? 0
  )
  const montoStr = monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })
  const titular = rec.arrendatario_nombre || rec.propietario || rec.origen || '—'
  const folio = String(rec.num_recibo || rec.id || '').padStart(4, '0') || String(hoy.getTime()).slice(-4)
  const concepto = rec.nota
    || rec.concepto_origen
    || (tabla === 'estacionamiento_pensiones' && rec.local_referencia
        ? `Pensión estacionamiento — Local ${rec.local_referencia}`
        : tabla === 'estacionamiento_diario'
        ? `Estacionamiento diario — ${rec.fecha || ''}`
        : rec.tipo
        ? `${rec.tipo}${rec.tipo === 'Renta' && rec.id_contrato ? ` — Contrato ${rec.id_contrato}` : ''}`
        : 'Pago de servicio')
  const letra = numLetra(monto)

  const htmlRecibo = `<!DOCTYPE html><html><head>
    <meta charset="utf-8"/>
    <title>Recibo ${folio} — WOL</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Arial',sans-serif;background:#fff;color:#1D1D1F;padding:20px;max-width:480px}
      .wol-logo{font-size:32px;font-weight:900;color:#1D1D1F;letter-spacing:-1px;line-height:1}
      .wol-bar{height:6px;background:linear-gradient(90deg,#E53935,#FF8A80);border-radius:3px;margin:4px 0 6px}
      .wol-sub{font-size:10px;color:#6E6E73;letter-spacing:0.5px}
      .recibo-title{font-size:13px;font-weight:900;text-align:center;border:2.5px solid #1D1D1F;padding:6px 12px;letter-spacing:2px;margin:14px 0;text-transform:uppercase}
      .top-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
      .fecha-block{display:flex;gap:6px;align-items:center;font-size:11px}
      .fecha-field{display:flex;flex-direction:column;align-items:center;gap:2px}
      .fecha-field span{font-size:9px;color:#6E6E73;text-transform:uppercase;letter-spacing:.5px}
      .fecha-field b{font-size:15px;font-weight:900;border-bottom:1px solid #1D1D1F;min-width:32px;text-align:center;padding-bottom:2px}
      .folio-block{text-align:right}
      .folio-block span{font-size:9px;color:#6E6E73;text-transform:uppercase;letter-spacing:.5px;display:block}
      .folio-block b{font-size:18px;font-weight:900;letter-spacing:1px}
      .cantidad-box{background:#1D1D1F;color:#fff;text-align:right;padding:10px 14px;border-radius:6px;margin-bottom:12px}
      .cantidad-box span{font-size:9px;letter-spacing:1px;opacity:.7;display:block;text-align:left}
      .cantidad-box b{font-size:24px;font-weight:900;font-family:'Courier New',monospace;letter-spacing:1px}
      .linea{border-bottom:1px solid #D2D2D7;padding:8px 0;font-size:12px;display:flex;gap:4px}
      .linea label{font-weight:700;white-space:nowrap;min-width:100px}
      .linea .val{flex:1;border-bottom:1px dotted #9CA3AF}
      .pagos{display:flex;gap:14px;font-size:12px;padding:10px 0}
      .pagos label{font-weight:700;margin-right:4px}
      .check{display:inline-block;width:13px;height:13px;border:1.5px solid #1D1D1F;border-radius:2px;margin-right:4px;vertical-align:middle}
      .firma-row{display:flex;gap:20px;margin-top:24px}
      .firma-col{flex:1;text-align:center}
      .firma-line{border-top:1px solid #1D1D1F;margin-top:40px;padding-top:5px;font-size:9px;color:#6E6E73;text-transform:uppercase;letter-spacing:.5px}
      .disclaimer{margin-top:16px;border-top:1px solid #E5E7EB;padding-top:10px;font-size:9px;color:#9CA3AF;text-align:center;line-height:1.5}
      @media print{body{padding:6px}}
    </style>
  </head><body>
    <div class="top-row">
      <div>
        <div class="wol-logo">WOL.</div>
        <div class="wol-bar"></div>
        <div class="wol-sub">Plaza Comercial IWOL</div>
      </div>
      <div class="folio-block">
        <span>Folio</span>
        <b>${folio}</b>
      </div>
    </div>
    <div class="recibo-title">Recibo de Pago</div>
    <div class="top-row" style="margin-bottom:14px">
      <div class="fecha-block">
        <div class="fecha-field"><span>Día</span><b>${dia}</b></div>
        <div style="font-size:12px;margin-top:14px">/</div>
        <div class="fecha-field"><span>Mes</span><b>${mes}</b></div>
        <div style="font-size:12px;margin-top:14px">/</div>
        <div class="fecha-field"><span>Año</span><b>${anio}</b></div>
        <div style="font-size:11px;color:#6E6E73;margin-top:14px;margin-left:4px">${mesNom} ${anio}</div>
      </div>
      <div class="cantidad-box">
        <span>Cantidad</span>
        <b>$${montoStr}</b>
      </div>
    </div>
    <div class="linea"><label>Recibí de:</label><span class="val">&nbsp;${titular}</span></div>
    <div class="linea"><label>Cantidad con Letra:</label><span class="val">&nbsp;${letra}</span></div>
    <div class="linea"><label>Concepto:</label><span class="val">&nbsp;${concepto}</span></div>
    <div class="pagos">
      <label>Forma de pago:</label>
      <span><span class="check">${formaPago==='Efectivo'?'✓':''}</span> Efectivo</span>
      <span><span class="check">${formaPago==='Cheque'?'✓':''}</span> Cheque</span>
      <span><span class="check">${formaPago==='Transferencia'?'✓':''}</span> Transferencia</span>
    </div>
    <div class="firma-row">
      <div class="firma-col"><div class="firma-line">Nombre y Firma</div></div>
      <div class="firma-col"><div class="firma-line">Administración WOL</div></div>
    </div>
    <div class="disclaimer">Plaza IWOL está obligada a emitirle el recibo correspondiente de cualquier pago de servicio.<br/>Para cualquier aclaración conserve este recibo.</div>
    <script>window.onload=function(){window.print();}</script>
  </body></html>`

  const imprimir = () => {
    const ventana = window.open('', '_blank', 'width=520,height=700')
    ventana.document.write(htmlRecibo)
    ventana.document.close()
  }

  const compartirWA = () => {
    const texto = `*RECIBO DE PAGO — Plaza IWOL*\n` +
      `Folio: ${folio} · Fecha: ${dia}/${mes}/${anio}\n` +
      `Recibí de: ${titular}\n` +
      `Concepto: ${concepto}\n` +
      `*Cantidad: $${montoStr}*\n` +
      `(${letra})\n` +
      `Forma de pago: ✓ Efectivo\n\n` +
      `Plaza IWOL está obligada a emitirle el recibo correspondiente de cualquier pago de servicio.`
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={onClose}>
      <div style={{ background:'white', borderRadius:14, width:'100%', maxWidth:420, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.35)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header preview del recibo */}
        <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid #E5E7EB' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
            <div>
              <div style={{ fontSize:24, fontWeight:900, color:'#1D1D1F', letterSpacing:-1, lineHeight:1 }}>WOL.</div>
              <div style={{ height:4, background:'linear-gradient(90deg,#E53935,#FF8A80)', borderRadius:2, margin:'3px 0 4px' }} />
              <div style={{ fontSize:9, color:'#6E6E73', letterSpacing:.5 }}>Plaza Comercial IWOL</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:9, color:'#6E6E73', textTransform:'uppercase', letterSpacing:.5 }}>Folio</div>
              <div style={{ fontSize:20, fontWeight:900, letterSpacing:1 }}>{folio}</div>
            </div>
          </div>
          <div style={{ border:'2px solid #1D1D1F', borderRadius:4, textAlign:'center', fontSize:11, fontWeight:900, padding:'5px 0', letterSpacing:3, textTransform:'uppercase', marginTop:10 }}>
            Recibo de Pago
          </div>
        </div>

        {/* Cuerpo */}
        <div style={{ padding:'14px 20px', display:'flex', flexDirection:'column', gap:0 }}>
          {/* Fecha + Cantidad */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12, gap:12 }}>
            <div style={{ display:'flex', gap:6, alignItems:'center', fontSize:12 }}>
              {[['Día',dia],['Mes',mes],['Año',anio]].map(([lbl,val]) => (
                <div key={lbl} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                  <span style={{ fontSize:8, color:'#6E6E73', textTransform:'uppercase', letterSpacing:.5 }}>{lbl}</span>
                  <strong style={{ fontSize:15, fontWeight:900, borderBottom:'1px solid #1D1D1F', minWidth:28, textAlign:'center' }}>{val}</strong>
                </div>
              ))}
              <span style={{ fontSize:11, color:'#6E6E73', marginTop:12, marginLeft:4 }}>{mesNom}</span>
            </div>
            <div style={{ background:'#1D1D1F', color:'white', borderRadius:6, padding:'8px 12px', textAlign:'right', flexShrink:0 }}>
              <div style={{ fontSize:8, letterSpacing:1, opacity:.7, textAlign:'left' }}>Cantidad</div>
              <div style={{ fontSize:18, fontWeight:900, fontFamily:'monospace', letterSpacing:1 }}>${montoStr}</div>
            </div>
          </div>

          {/* Campos */}
          {[
            ['Recibí de', titular],
            ['Cantidad con Letra', letra],
            ['Concepto', concepto],
          ].map(([lbl, val]) => (
            <div key={lbl} style={{ borderBottom:'1px solid #E5E7EB', padding:'7px 0', fontSize:12 }}>
              <span style={{ fontWeight:700, marginRight:4 }}>{lbl}:</span>
              <span style={{ color:'#374151' }}>{val}</span>
            </div>
          ))}

          {/* Forma de pago */}
          <div style={{ padding:'10px 0', fontSize:12, display:'flex', gap:14, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontWeight:700 }}>Forma de pago:</span>
            {['Efectivo','Cheque','Transferencia'].map((fp,i) => (
              <label key={fp} style={{ display:'flex', alignItems:'center', gap:4, cursor:'default' }}>
                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:14, height:14, border:'1.5px solid #1D1D1F', borderRadius:2, fontSize:10, background: i===0?'#1D1D1F':'white', color:'white' }}>
                  {i===0?'✓':''}
                </span>
                {fp}
              </label>
            ))}
          </div>

          {/* Firmas */}
          <div style={{ display:'flex', gap:20, marginTop:16 }}>
            {['Nombre y Firma','Administración WOL'].map(f => (
              <div key={f} style={{ flex:1, textAlign:'center' }}>
                <div style={{ borderTop:'1px solid #1D1D1F', marginTop:36, paddingTop:5, fontSize:9, color:'#6E6E73', textTransform:'uppercase', letterSpacing:.5 }}>{f}</div>
              </div>
            ))}
          </div>

          {/* Disclaimer */}
          <div style={{ marginTop:12, fontSize:9, color:'#9CA3AF', textAlign:'center', borderTop:'1px solid #F0EEF8', paddingTop:8, lineHeight:1.5 }}>
            Plaza IWOL está obligada a emitirle el recibo correspondiente de cualquier pago de servicio.<br/>
            Para cualquier aclaración conserve este recibo.
          </div>

          {/* Forma de pago selector */}
          <div style={{ marginTop:12, display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontSize:11, fontWeight:700, color:'#6B7280', whiteSpace:'nowrap' }}>Forma de pago:</span>
            {['Efectivo','Cheque','Transferencia'].map(fp => (
              <button key={fp} onClick={() => setFormaPago(fp)}
                style={{ padding:'4px 12px', borderRadius:20, border:`1.5px solid ${formaPago===fp?'#1D1D1F':'#D1D5DB'}`,
                  background: formaPago===fp?'#1D1D1F':'white',
                  color: formaPago===fp?'white':'#374151',
                  fontSize:11, fontWeight:700, cursor:'pointer' }}>
                {formaPago===fp ? '✓ ' : ''}{fp}
              </button>
            ))}
          </div>

          {/* Botones */}
          <div style={{ display:'flex', gap:10, marginTop:12 }}>
            <button onClick={imprimir} style={{ flex:1, padding:'11px', background:'#1D1D1F', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>
              🖨️ Imprimir / PDF
            </button>
            <button onClick={compartirWA} style={{ flex:1, padding:'11px', background:'#25D366', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>
              📱 WhatsApp
            </button>
            <button onClick={onClose} style={{ padding:'11px 14px', background:'#F3F4F6', color:'#374151', border:'none', borderRadius:8, fontSize:13, cursor:'pointer' }}>
              <X size={16}/>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
