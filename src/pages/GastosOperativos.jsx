import { useModuleAudit, logAudit } from '../hooks/useAudit'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Receipt, Plus, X, Search, Pencil, Trash2, ChevronDown, ChevronRight, AlertTriangle, Check, BookUser, ToggleLeft, ToggleRight, Images, Loader2, Eye, Paperclip } from 'lucide-react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import TicketModal from '../components/ui/TicketModal'
import { ImagenPrivada, EnlacePrivado } from '../components/ui/ArchivoPrivado'

// ─── Helper: extrae nombre legible de proveedor (string, objeto, o JSON serializado) ──
const parseProvNombre = (val) => {
  if (!val) return ''
  if (typeof val === 'object') return val.nombre_comercial || ''
  if (typeof val === 'string' && val.startsWith('{')) {
    try { return JSON.parse(val)?.nombre_comercial || val } catch { return val }
  }
  return val
}

// ─── Catálogo de proveedores ──────────────────────────────────────────────────

const CATS_PRV = [
  { id: 'VENDING',       label: 'Vending',       color: '#EC4899' },
  { id: 'OPERACION',     label: 'Operación',     color: '#057642' },
  { id: 'MANTENIMIENTO', label: 'Mantenimiento', color: '#E8A020' },
  { id: 'MIXTO',         label: 'Mixto',         color: '#0A66C2' },
]
const catColor = (id) => CATS_PRV.find(c => c.id === id)?.color || '#6B7280'
const catLabel = (id) => CATS_PRV.find(c => c.id === id)?.label || (id || '—')

const PRV_EMPTY = { clave: '', nombre: '', rfc: '', categoria: 'OPERACION', telefono: '', email: '', contacto: '', notas: '', activo: true }

function FormProveedor({ inicial, onSaved, onCancel }) {
  const [form, setForm] = useState(inicial ? { ...inicial } : { ...PRV_EMPTY })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const isEdit = !!inicial?.id

  const guardar = async (e) => {
    e.preventDefault()
    if (!form.clave.trim() || !form.nombre.trim()) { setErr('Clave y nombre son obligatorios'); return }
    setSaving(true); setErr(null)
    try {
      const payload = { ...form, clave: form.clave.toUpperCase().trim() }
      if (isEdit) {
        const { error } = await supabase.from('cat_proveedores').update(payload).eq('id', inicial.id)
        if (error) throw error
        toast.success('Proveedor actualizado')
      } else {
        const { error } = await supabase.from('cat_proveedores').insert(payload)
        if (error) throw error
        toast.success('Proveedor agregado')
      }
      onSaved()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const inp = { width: '100%', padding: '8px 10px', border: '1.5px solid #E5E7EB', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }
  const lbl = { display: 'block', fontSize: 10, fontWeight: 700, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase' }

  return (
    <form onSubmit={guardar} style={{ background: '#F8FAFC', border: '1.5px solid #C7D2FE', borderRadius: 10, padding: '16px 18px', marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#0A66C2', marginBottom: 12, textTransform: 'uppercase' }}>
        {isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}
      </div>
      {err && <div style={{ padding: '6px 10px', background: '#FEE2E2', color: '#B24020', borderRadius: 6, fontSize: 12, marginBottom: 10 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>Clave *</label>
          <input value={form.clave} onChange={e => set('clave', e.target.value.toUpperCase())} style={inp} placeholder="DOGO" maxLength={12} required />
        </div>
        <div>
          <label style={lbl}>Nombre *</label>
          <input value={form.nombre} onChange={e => set('nombre', e.target.value)} style={inp} placeholder="Sam's Club" required />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>RFC</label>
          <input value={form.rfc} onChange={e => set('rfc', e.target.value.toUpperCase())} style={inp} placeholder="RFC del proveedor" />
        </div>
        <div>
          <label style={lbl}>Categoría</label>
          <select value={form.categoria} onChange={e => set('categoria', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            {CATS_PRV.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>Teléfono</label>
          <input value={form.telefono} onChange={e => set('telefono', e.target.value)} style={inp} placeholder="(614) 000-0000" />
        </div>
        <div>
          <label style={lbl}>Contacto</label>
          <input value={form.contacto} onChange={e => set('contacto', e.target.value)} style={inp} placeholder="Nombre del contacto" />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={lbl}>Email</label>
        <input value={form.email} onChange={e => set('email', e.target.value)} style={inp} placeholder="proveedor@email.com" type="email" />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>Notas</label>
        <textarea value={form.notas} onChange={e => set('notas', e.target.value)} rows={2}
          style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Condiciones de pago, horarios, etc." />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={saving}
          style={{ flex: 1, padding: '9px', background: saving ? '#9CA3AF' : '#0A66C2', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: saving ? 'default' : 'pointer' }}>
          {saving ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Agregar proveedor')}
        </button>
        <button type="button" onClick={onCancel}
          style={{ padding: '9px 16px', background: '#F3F4F6', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function DrawerProveedores({ onClose }) {
  const [lista, setLista]     = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [editando, setEditando] = useState(null)  // null | 'nuevo' | proveedor
  const [filtroCat, setFiltroCat] = useState('TODOS')

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('cat_proveedores').select('*').order('nombre')
    setLista(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const toggleActivo = async (p) => {
    await supabase.from('cat_proveedores').update({ activo: !p.activo }).eq('id', p.id)
    setLista(l => l.map(x => x.id === p.id ? { ...x, activo: !x.activo } : x))
  }

  const filtrados = lista.filter(p => {
    const q = search.toLowerCase()
    const matchQ = !q || p.nombre?.toLowerCase().includes(q) || p.clave?.toLowerCase().includes(q) || p.rfc?.toLowerCase().includes(q)
    const matchC = filtroCat === 'TODOS' || p.categoria === filtroCat
    return matchQ && matchC
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: 520, height: '100%', background: 'white', boxShadow: '-4px 0 30px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #E5E7EB', background: '#EFF6FF', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookUser size={18} color="#0A66C2" />
              <span style={{ fontWeight: 800, fontSize: 16, color: '#1A3C5E' }}>Catálogo de Proveedores</span>
              <span style={{ fontSize: 11, background: '#DBEAFE', color: '#0A66C2', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>{lista.length}</span>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}><X size={18} /></button>
          </div>
          {/* Búsqueda + botón nuevo */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, clave, RFC…"
                style={{ width: '100%', paddingLeft: 26, padding: '7px 8px 7px 26px', border: '1.5px solid #DBEAFE', borderRadius: 7, fontSize: 12, outline: 'none', boxSizing: 'border-box', background: 'white' }} />
            </div>
            <button onClick={() => setEditando('nuevo')} disabled={editando === 'nuevo'}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: '#0A66C2', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <Plus size={13} /> Agregar
            </button>
          </div>
          {/* Filtro categoría */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {['TODOS', ...CATS_PRV.map(c => c.id)].map(cat => {
              const active = filtroCat === cat
              const color = cat === 'TODOS' ? '#6B7280' : catColor(cat)
              return (
                <button key={cat} onClick={() => setFiltroCat(cat)}
                  style={{ padding: '3px 10px', borderRadius: 20, border: `1.5px solid ${color}`, fontSize: 10, fontWeight: 700, cursor: 'pointer', background: active ? color : 'transparent', color: active ? 'white' : color }}>
                  {cat === 'TODOS' ? 'Todos' : catLabel(cat)}
                </button>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
          {/* Formulario nuevo/edición */}
          {editando && (
            <FormProveedor
              inicial={editando === 'nuevo' ? null : editando}
              onSaved={() => { setEditando(null); cargar() }}
              onCancel={() => setEditando(null)}
            />
          )}

          {loading && <div style={{ textAlign: 'center', color: '#9CA3AF', padding: 30, fontSize: 13 }}>Cargando…</div>}

          {!loading && filtrados.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9CA3AF', padding: 30, fontSize: 13 }}>
              {search ? 'Sin resultados para la búsqueda' : 'Sin proveedores registrados'}
            </div>
          )}

          {filtrados.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: 8, background: p.activo ? 'white' : '#FAFAFA', opacity: p.activo ? 1 : 0.6 }}>
              {/* Cat badge */}
              <div style={{ width: 6, borderRadius: 3, alignSelf: 'stretch', background: catColor(p.categoria), flexShrink: 0 }} />
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#1A3C5E' }}>{p.nombre}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', fontFamily: 'monospace', background: '#F3F4F6', padding: '1px 6px', borderRadius: 4 }}>{p.clave}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: catColor(p.categoria), background: catColor(p.categoria) + '18', padding: '1px 7px', borderRadius: 10 }}>{catLabel(p.categoria)}</span>
                </div>
                {p.rfc && <div style={{ fontSize: 11, color: '#6B7280', fontFamily: 'monospace' }}>RFC: {p.rfc}</div>}
                {p.contacto && <div style={{ fontSize: 11, color: '#6B7280' }}>Contacto: {p.contacto}</div>}
                {p.telefono && <div style={{ fontSize: 11, color: '#6B7280' }}>{p.telefono}{p.email ? `  ·  ${p.email}` : ''}</div>}
                {p.notas && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2, fontStyle: 'italic' }}>{p.notas}</div>}
              </div>
              {/* Acciones */}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={() => setEditando(p)} title="Editar"
                  style={{ padding: '5px 7px', background: '#EFF6FF', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#0A66C2' }}><Pencil size={13} /></button>
                <button onClick={() => toggleActivo(p)} title={p.activo ? 'Desactivar' : 'Activar'}
                  style={{ padding: '5px 7px', background: p.activo ? '#FEF3C7' : '#F0FDF4', border: 'none', borderRadius: 6, cursor: 'pointer', color: p.activo ? '#D97706' : '#057642' }}>
                  {p.activo ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const fmt = (n) => '$' + (parseFloat(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })

const GRUPO_COLOR = {
  'Ferretería y materiales': '#0A66C2', 'Limpieza e higiene': '#057642',
  'Papelería y oficina': '#E8A020', 'Electricidad': '#F59E0B',
  'Plomería': '#3B82F6', 'Herramienta y equipo': '#6366F1',
  'Servicios externos': '#8B5CF6', 'Vending / Reabasto': '#EC4899',
  'Combustible': '#EF4444', 'Seguridad': '#B24020',
  'Alimentación': '#10B981', 'Otros': '#6B7280',
}

// ─── Utilidades OCR ───────────────────────────────────────────────────────────
function calcDatosGasto(fecha) {
  const dt = new Date(fecha + 'T12:00:00')
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const DIAS  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
  return { anio: dt.getFullYear(), mes: MESES[dt.getMonth()], dia_semana: DIAS[dt.getDay()], semana: `S${Math.ceil(dt.getDate() / 7)}` }
}

const SUPPORTED_IMG = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

async function fileToB64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target.result
      if (!SUPPORTED_IMG.includes(file.type)) {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width  = img.naturalWidth
          canvas.height = img.naturalHeight
          canvas.getContext('2d').drawImage(img, 0, 0)
          const jpegUrl = canvas.toDataURL('image/jpeg', 0.92)
          resolve({ b64: jpegUrl.split(',')[1], mtype: 'image/jpeg', preview: jpegUrl })
        }
        img.onerror = () => resolve(null)
        img.src = dataUrl
      } else {
        resolve({ b64: dataUrl.split(',')[1], mtype: file.type, preview: dataUrl })
      }
    }
    reader.readAsDataURL(file)
  })
}

async function ocrizarTicket(b64, mtype) {
  const res = await fetch('/.netlify/functions/gastos-ocr', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image_base64: b64, media_type: mtype }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}

const GRUPOS_LISTA = [
  'Ferretería y materiales', 'Limpieza e higiene', 'Papelería y oficina',
  'Electricidad', 'Plomería', 'Herramienta y equipo', 'Servicios externos',
  'Vending / Reabasto', 'Combustible', 'Seguridad', 'Alimentación', 'Nómina / Personal', 'Otros',
]

// ─── Modal Carga en Grupo ─────────────────────────────────────────────────────
const fmt2 = n => n != null ? '$' + (parseFloat(n)||0).toLocaleString('es-MX',{minimumFractionDigits:2}) : '—'

function TicketCard({ t, idx, setForm, quitar }) {
  const [showLineas, setShowLineas] = useState(false)
  const ocr = t.ocr || {}
  const prv = ocr.proveedor || {}
  const tkt = ocr.ticket   || {}
  const lineas = ocr.lineas || []
  const ok = t.estado === 'listo' || t.estado === 'error_guardar'

  return (
    <div style={{ border:'1.5px solid #E5E7EB', borderRadius:10, marginBottom:14, overflow:'hidden', background: t.estado==='guardado' ? '#F0FDF4' : 'white' }}>
      {/* ── Encabezado de card ── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#F9FAFB', borderBottom:'1px solid #E5E7EB' }}>
        <div style={{ flexShrink:0, width:52, height:52, borderRadius:7, overflow:'hidden', background:'#F3F4F6', border:'1px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {t.preview
            ? <img src={t.preview} alt="ticket" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : <Loader2 size={18} color="#9CA3AF" style={{ animation:'spin 1s linear infinite' }} />}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#374151', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            #{idx+1} {prv.nombre_comercial || parseProvNombre(t.form?.proveedor_nombre) || t.file.name}
          </div>
          {prv.rfc && <div style={{ fontSize:10, color:'#6B7280' }}>RFC: {prv.rfc}</div>}
          {prv.nombre_sucursal && <div style={{ fontSize:10, color:'#6B7280' }}>{prv.nombre_sucursal}</div>}
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
          {t.estado === 'leyendo'   && <span style={{ fontSize:10, background:'#EFF6FF', color:'#0A66C2', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>Leyendo…</span>}
          {t.estado === 'ocrizando' && <span style={{ fontSize:10, background:'#FFF7ED', color:'#C2410C', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>⏳ IA…</span>}
          {t.estado === 'listo'     && <span style={{ fontSize:10, background:'#ECFDF5', color:'#057642', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>✓ Listo</span>}
          {t.estado === 'guardado'  && <span style={{ fontSize:10, background:'#DCFCE7', color:'#15803D', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>✅ Guardado</span>}
          {(t.estado==='error'||t.estado==='error_guardar') && <span style={{ fontSize:10, background:'#FEF2F2', color:'#B24020', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>❌ Error</span>}
          <button onClick={() => quitar(t.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:14, lineHeight:1, padding:'2px 4px' }}>✕</button>
        </div>
      </div>

      {ok && (
        <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>

          {/* ── Sección PROVEEDOR ── */}
          <div style={{ background:'#F5F3FF', borderRadius:7, padding:'8px 10px' }}>
            <div style={{ fontSize:10, fontWeight:800, color:'#7B5EA7', textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>🏪 Proveedor</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 10px' }}>
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:'#6B7280' }}>Nombre comercial</label>
                <input value={t.form.proveedor_nombre} onChange={e => setForm(t.id,'proveedor_nombre',e.target.value)}
                  placeholder="Nombre visible en ticket"
                  style={{ width:'100%', padding:'4px 7px', border:'1.5px solid #DDD6FE', borderRadius:5, fontSize:12, boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:'#6B7280' }}>RFC</label>
                <input value={t.form.proveedor_rfc} onChange={e => setForm(t.id,'proveedor_rfc',e.target.value.toUpperCase())}
                  placeholder="Ej: NWM9709244W4"
                  style={{ width:'100%', padding:'4px 7px', border:'1.5px solid #DDD6FE', borderRadius:5, fontSize:12, boxSizing:'border-box', fontFamily:'monospace' }} />
              </div>
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:'#6B7280' }}>Razón social</label>
                <input value={t.form.proveedor_razon_social} onChange={e => setForm(t.id,'proveedor_razon_social',e.target.value)}
                  placeholder="Razón social completa"
                  style={{ width:'100%', padding:'4px 7px', border:'1.5px solid #DDD6FE', borderRadius:5, fontSize:12, boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:'#6B7280' }}>Sucursal / Unidad</label>
                <input value={t.form.proveedor_sucursal} onChange={e => setForm(t.id,'proveedor_sucursal',e.target.value)}
                  placeholder="Ej: Suc. Portales"
                  style={{ width:'100%', padding:'4px 7px', border:'1.5px solid #DDD6FE', borderRadius:5, fontSize:12, boxSizing:'border-box' }} />
              </div>
            </div>
          </div>

          {/* ── Sección TICKET FINANCIERO ── */}
          <div style={{ background:'#FFFBEB', borderRadius:7, padding:'8px 10px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <div style={{ fontSize:10, fontWeight:800, color:'#92400E', textTransform:'uppercase', letterSpacing:.5 }}>🧾 Ticket</div>
              {tkt.validacion && (
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99,
                  background: tkt.validacion==='ok' ? '#DCFCE7' : '#FEF3C7',
                  color:      tkt.validacion==='ok' ? '#15803D'  : '#92400E' }}>
                  {tkt.validacion==='ok' ? '✔ Totales OK' : `⚠ ${tkt.validacion}`}
                </span>
              )}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'4px 10px', marginBottom:8 }}>
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:'#6B7280' }}>Fecha</label>
                <input type="date" value={t.form.fecha} onChange={e => setForm(t.id,'fecha',e.target.value)}
                  style={{ width:'100%', padding:'4px 7px', border:'1.5px solid #FDE68A', borderRadius:5, fontSize:12, boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:'#6B7280' }}>Hora</label>
                <input value={t.form.hora || ''} onChange={e => setForm(t.id,'hora',e.target.value)} placeholder="HH:MM:SS"
                  style={{ width:'100%', padding:'4px 7px', border:'1.5px solid #FDE68A', borderRadius:5, fontSize:12, boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:'#6B7280' }}>Folio / Terminal</label>
                <input value={t.form.folio || ''} onChange={e => setForm(t.id,'folio',e.target.value)} placeholder="Folio o No. ticket"
                  style={{ width:'100%', padding:'4px 7px', border:'1.5px solid #FDE68A', borderRadius:5, fontSize:12, boxSizing:'border-box' }} />
              </div>
            </div>
            {/* Fila de montos */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {[
                ['Subtotal', 'subtotal'],
                ['Descuentos', 'descuentos'],
                ['IVA', 'iva_monto'],
                ['IEPS', 'ieps_monto'],
              ].map(([lbl, key]) => (
                <div key={key} style={{ flex:'1 1 70px' }}>
                  <label style={{ fontSize:10, fontWeight:700, color:'#6B7280' }}>{lbl}</label>
                  <input type="number" value={t.form[key] || ''} onChange={e => setForm(t.id, key, e.target.value)} placeholder="0.00"
                    style={{ width:'100%', padding:'4px 7px', border:'1.5px solid #FDE68A', borderRadius:5, fontSize:12, boxSizing:'border-box' }} />
                </div>
              ))}
              <div style={{ flex:'1 1 80px' }}>
                <label style={{ fontSize:10, fontWeight:800, color:'#92400E' }}>TOTAL $</label>
                <input type="number" value={t.form.ticket_total} onChange={e => setForm(t.id,'ticket_total',e.target.value)} placeholder="0.00"
                  style={{ width:'100%', padding:'4px 7px', border:'2px solid #F59E0B', borderRadius:5, fontSize:13, fontWeight:800, boxSizing:'border-box', color:'#92400E' }} />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 10px', marginTop:6 }}>
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:'#6B7280' }}>Forma de pago</label>
                <input value={t.form.forma_pago || ''} onChange={e => setForm(t.id,'forma_pago',e.target.value)} placeholder="Efectivo / Tarjeta"
                  style={{ width:'100%', padding:'4px 7px', border:'1.5px solid #FDE68A', borderRadius:5, fontSize:12, boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:'#6B7280' }}>Cambio</label>
                <input type="number" value={t.form.cambio || ''} onChange={e => setForm(t.id,'cambio',e.target.value)} placeholder="0.00"
                  style={{ width:'100%', padding:'4px 7px', border:'1.5px solid #FDE68A', borderRadius:5, fontSize:12, boxSizing:'border-box' }} />
              </div>
            </div>
          </div>

          {/* ── Sección ARTÍCULOS ── */}
          {lineas.length > 0 && (
            <div style={{ border:'1px solid #E5E7EB', borderRadius:7, overflow:'hidden' }}>
              <button onClick={() => setShowLineas(v => !v)}
                style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 10px', background:'#F9FAFB', border:'none', cursor:'pointer', fontSize:11, fontWeight:700, color:'#374151' }}>
                <span>📦 {lineas.length} artículo{lineas.length!==1?'s':''} detectados</span>
                {showLineas ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
              </button>
              {showLineas && (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                    <thead>
                      <tr style={{ background:'#F3F4F6' }}>
                        {['SKU','Descripción','Cant.','P/U','Subtotal','Imp.'].map((h,i) => (
                          <th key={h} style={{ padding:'5px 7px', textAlign: i>1?'right':'left', fontSize:9, fontWeight:700, color:'#6B7280', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lineas.map((l, li) => (
                        <tr key={li} style={{ borderTop:'1px solid #F3F4F6', background: li%2===0?'white':'#FAFAFA' }}>
                          <td style={{ padding:'4px 7px', color:'#9CA3AF', fontFamily:'monospace', fontSize:10 }}>{l.sku||'—'}</td>
                          <td style={{ padding:'4px 7px', color:'#111827', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.descripcion}</td>
                          <td style={{ padding:'4px 7px', textAlign:'right' }}>{l.cantidad}</td>
                          <td style={{ padding:'4px 7px', textAlign:'right', fontFamily:'monospace' }}>{fmt2(l.precio_unit)}</td>
                          <td style={{ padding:'4px 7px', textAlign:'right', fontFamily:'monospace', fontWeight:700 }}>{fmt2(l.subtotal_linea ?? (l.cantidad*(l.precio_unit||0)))}</td>
                          <td style={{ padding:'4px 7px', textAlign:'right' }}>
                            {l.tasa_impuesto
                              ? <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:3, background:'#DBEAFE', color:'#1D4ED8' }}>{l.tasa_impuesto}</span>
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Sección DATOS DE GASTO (requeridos para BD) ── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 10px' }}>
            <div>
              <label style={{ fontSize:10, fontWeight:800, color:'#374151' }}>Grupo * <span style={{ color:'#EF4444' }}>requerido</span></label>
              <select value={t.form.grupo_gasto} onChange={e => setForm(t.id,'grupo_gasto',e.target.value)}
                style={{ width:'100%', padding:'5px 8px', border: t.form.grupo_gasto ? '1.5px solid #E5E7EB' : '2px solid #FCA5A5', borderRadius:6, fontSize:12, boxSizing:'border-box', background:'white' }}>
                <option value="">— Seleccionar grupo —</option>
                {GRUPOS_LISTA.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:10, fontWeight:700, color:'#374151' }}>Descripción / Concepto</label>
              <input value={t.form.descripcion} onChange={e => setForm(t.id,'descripcion',e.target.value)} placeholder="Opcional"
                style={{ width:'100%', padding:'5px 8px', border:'1.5px solid #E5E7EB', borderRadius:6, fontSize:12, boxSizing:'border-box' }} />
            </div>
          </div>
        </div>
      )}

      {(t.estado==='error'||t.estado==='error_guardar') && (
        <div style={{ padding:'8px 14px', fontSize:12, color:'#B24020' }}>❌ {t.errorMsg}</div>
      )}
    </div>
  )
}

function ModalCargaGrupo({ onClose, onSaved }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [tickets, setTickets] = useState([])
  const [saving, setSaving]   = useState(false)
  const fileRef = useRef()

  const setTicket = (id, patch) =>
    setTickets(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  const setForm = (id, field, val) =>
    setTickets(prev => prev.map(t => t.id === id ? { ...t, form: { ...t.form, [field]: val } } : t))
  const quitar = (id) => setTickets(prev => prev.filter(t => t.id !== id))

  const formDeOcr = (ocr, hoy) => {
    const prv = ocr?.proveedor || {}
    const tkt = ocr?.ticket   || {}
    return {
      fecha:                 tkt.fecha || ocr?.fecha || hoy,
      hora:                  tkt.hora  || null,
      folio:                 tkt.folio || null,
      grupo_gasto:           '',
      descripcion:           '',
      proveedor_nombre:      parseProvNombre(prv.nombre_comercial || prv || ocr?.proveedor_str) || '',
      proveedor_rfc:         prv.rfc || '',
      proveedor_razon_social: prv.razon_social || '',
      proveedor_sucursal:    prv.nombre_sucursal || '',
      ticket_total:          tkt.total != null ? String(tkt.total) : (ocr?.total != null ? String(ocr.total) : ''),
      subtotal:              tkt.subtotal    || '',
      descuentos:            tkt.descuentos  || '',
      iva_monto:             tkt.iva_monto   || '',
      ieps_monto:            tkt.ieps_monto  || '',
      forma_pago:            tkt.forma_pago  || '',
      cambio:                tkt.cambio      || '',
    }
  }

  const agregarArchivos = async (files) => {
    const nuevos = Array.from(files).map(f => ({
      id: `${Date.now()}-${Math.random()}`,
      file: f,
      preview: null, b64: null, mtype: null,
      estado: 'leyendo',
      ocr: null,
      form: { fecha:hoy, hora:'', folio:'', grupo_gasto:'', descripcion:'', proveedor_nombre:'', proveedor_rfc:'', proveedor_razon_social:'', proveedor_sucursal:'', ticket_total:'', subtotal:'', descuentos:'', iva_monto:'', ieps_monto:'', forma_pago:'', cambio:'' },
    }))
    setTickets(prev => [...prev, ...nuevos])

    for (const ticket of nuevos) {
      try {
        const img = await fileToB64(ticket.file)
        if (!img) { setTicket(ticket.id, { estado:'error', errorMsg:'No se pudo leer la imagen' }); continue }
        setTicket(ticket.id, { b64:img.b64, mtype:img.mtype, preview:img.preview, estado:'ocrizando' })

        const ocr = await ocrizarTicket(img.b64, img.mtype)
        // Backward compat: si viene proveedor como string
        if (typeof ocr.proveedor === 'string') ocr.proveedor_str = ocr.proveedor
        setTicket(ticket.id, { estado:'listo', ocr, form: formDeOcr(ocr, hoy) })
      } catch (e) {
        setTicket(ticket.id, { estado:'error', errorMsg: e.message })
      }
    }
  }

  const guardarTodos = async () => {
    const listos = tickets.filter(t => t.estado === 'listo' && t.form.grupo_gasto)
    if (!listos.length) { toast.error('Ningún ticket listo con grupo asignado'); return }
    setSaving(true)
    let ok = 0, fail = 0

    for (const t of listos) {
      try {
        const monto = parseFloat(t.form.ticket_total) || 0

        // Upsert proveedor si hay RFC
        let proveedor_id = null
        if (t.form.proveedor_rfc) {
          const { data: prvExistente } = await supabase.from('proveedores')
            .select('id').eq('rfc', t.form.proveedor_rfc).maybeSingle()
          if (prvExistente) {
            proveedor_id = prvExistente.id
          } else {
            const { data: prvNuevo } = await supabase.from('proveedores').insert({
              nombre:    t.form.proveedor_nombre || null,
              rfc:       t.form.proveedor_rfc    || null,
              razon_social: t.form.proveedor_razon_social || null,
              sucursal:  t.form.proveedor_sucursal || null,
            }).select('id').maybeSingle()
            proveedor_id = prvNuevo?.id || null
          }
        }

        const payload = {
          fecha:        t.form.fecha,
          proveedor:    t.form.proveedor_nombre || null,
          grupo_gasto:  t.form.grupo_gasto,
          descripcion:  t.form.descripcion || null,
          cantidad:     monto,
          ticket_total: monto,
          ...calcDatosGasto(t.form.fecha),
        }
        const { data: ins, error } = await supabase.from('gastos_operativos').insert(payload).select('id').single()
        if (error) throw error
        logAudit({ modulo: 'GASTOS_OPERATIVOS', accion: 'CREAR', entidad: 'gasto', entidad_id: ins.id, descripcion: `Gasto OCR: ${t.form.proveedor_nombre || 'sin proveedor'} — ${t.form.grupo_gasto}` })

        // Líneas OCR
        const lineas = (t.ocr?.lineas || []).filter(l => l.descripcion && l.precio_unit).map(l => ({
          gasto_id:         ins.id,
          descripcion:      l.descripcion,
          cantidad:         parseFloat(l.cantidad) || 1,
          precio_unit:      parseFloat(l.precio_unit),
          codigo_proveedor: l.sku || l.codigo_proveedor || null,
          categoria:        null,
          producto_id:      null,
        }))
        if (lineas.length) await supabase.from('gasto_detalle').insert(lineas)

        // Foto a Storage
        if (t.b64) {
          try {
            const ext  = t.mtype?.includes('png') ? 'png' : 'jpg'
            const path = `${t.form.fecha?.slice(0,7) || 'sin-fecha'}/${ins.id}.${ext}`
            const byteArr = Uint8Array.from(atob(t.b64), c => c.charCodeAt(0))
            const blob = new Blob([byteArr], { type: t.mtype || 'image/jpeg' })
            const { data: upData } = await supabase.storage.from('tickets-gastos').upload(path, blob, { upsert:true })
            if (upData?.path) {
              const { data: { publicUrl } } = supabase.storage.from('tickets-gastos').getPublicUrl(path)
              await supabase.from('gastos_operativos').update({ ticket_url: publicUrl }).eq('id', ins.id)
            }
          } catch (_) {}
        }

        setTicket(t.id, { estado:'guardado' })
        ok++
      } catch (e) {
        setTicket(t.id, { estado:'error_guardar', errorMsg: e.message })
        fail++
      }
    }
    setSaving(false)
    if (ok)   toast.success(`✅ ${ok} ticket${ok>1?'s':''} guardado${ok>1?'s':''}`)
    if (fail) toast.error(`${fail} ticket${fail>1?'s':''} con error`)
    if (!fail) { onSaved(); onClose() }
  }

  const listos   = tickets.filter(t => t.estado === 'listo')
  const sinGrupo = listos.filter(t => !t.form.grupo_gasto).length

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:'12px' }} onClick={onClose}>
      <div style={{ background:'white', borderRadius:14, width:'100%', maxWidth:820, maxHeight:'94vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding:'14px 20px', background:'#E8A020', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'white' }}>📷 Carga en Grupo — Comprobantes</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.85)' }}>Sube fotos → IA extrae Proveedor · Ticket · Artículos → Revisas → Guardas</div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8, padding:'6px 10px', color:'white', cursor:'pointer', fontWeight:800 }}>✕</button>
        </div>

        {/* Zona de carga */}
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
          <label style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 20px', background:'#FFFBEB', border:'2px dashed #FCD34D', borderRadius:10, cursor:'pointer', justifyContent:'center' }}>
            <Images size={20} color="#E8A020" />
            <span style={{ fontSize:13, fontWeight:700, color:'#92400E' }}>Seleccionar fotos de tickets (una o varias)</span>
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={e => { agregarArchivos(e.target.files); e.target.value = '' }} style={{ display:'none' }} />
          </label>
        </div>

        {/* Lista de tickets */}
        <div style={{ flex:1, overflowY:'auto', padding:'14px 20px' }}>
          {tickets.length === 0 && (
            <div style={{ textAlign:'center', padding:'48px 0', color:'#9CA3AF', fontSize:14 }}>
              Aún no has cargado ningún comprobante.<br/>Selecciona una o varias fotos arriba.
            </div>
          )}
          {tickets.map((t, i) => (
            <TicketCard key={t.id} t={t} idx={i} setForm={setForm} quitar={quitar} />
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 20px', borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0, background:'#F9FAFB' }}>
          <div style={{ fontSize:13, color:'#6B7280' }}>
            {tickets.length} foto{tickets.length!==1?'s':''} · {listos.length} lista{listos.length!==1?'s':''}
            {sinGrupo > 0 && <span style={{ color:'#F59E0B', marginLeft:8 }}>· ⚠ {sinGrupo} sin grupo</span>}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} style={{ padding:'9px 18px', background:'white', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', color:'#374151' }}>Cancelar</button>
            <button onClick={guardarTodos} disabled={saving || !listos.filter(t => t.form.grupo_gasto).length}
              style={{ padding:'9px 22px', background: saving?'#9CA3AF':'#057642', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:800, cursor: saving?'not-allowed':'pointer' }}>
              {saving ? 'Guardando…' : `Guardar ${listos.filter(t=>t.form.grupo_gasto).length} ticket${listos.filter(t=>t.form.grupo_gasto).length!==1?'s':''}`}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ── Semanas Sáb→Vie (plaza) — misma lógica que ResumenSemanal ─────────────
const DIAS_GO  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MESES_GO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function addDaysGO(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function labelSemana(ini, fin) {
  const i = new Date(ini + 'T12:00:00')
  const f = new Date(fin + 'T12:00:00')
  return `${DIAS_GO[i.getDay()]} ${i.getDate()} ${MESES_GO[i.getMonth()]} — ${DIAS_GO[f.getDay()]} ${f.getDate()} ${MESES_GO[f.getMonth()]} ${f.getFullYear()}`
}

function generarSemanasGO() {
  const ORIGEN = '2026-06-27' // primer sábado registrado
  const hoy = new Date()
  const dow = hoy.getDay()
  const diasHastaSab = dow === 6 ? 0 : dow + 1
  const sabHoy = new Date(hoy)
  sabHoy.setDate(sabHoy.getDate() - diasHastaSab)
  const sabHoyISO = `${sabHoy.getFullYear()}-${String(sabHoy.getMonth()+1).padStart(2,'0')}-${String(sabHoy.getDate()).padStart(2,'0')}`
  const limite = addDaysGO(sabHoyISO, 4 * 7)
  const semanas = []
  let cur = ORIGEN
  while (cur <= limite) {
    const fin = addDaysGO(cur, 6)
    semanas.push({ ini: cur, fin, label: labelSemana(cur, fin) })
    cur = addDaysGO(cur, 7)
  }
  semanas.reverse()
  return semanas
}
const SEMANAS_SAB_VIE = generarSemanasGO()

export default function GastosOperativos() {
  useModuleAudit('GASTOS_OPERATIVOS')
  const [gastos, setGastos]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filtroGrupo, setFiltroGrupo] = useState('Todos')
  const [modal, setModal]         = useState(null) // null | 'nuevo' | gasto
  const [showCargaGrupo, setShowCargaGrupo] = useState(false)
  const [showProveedores, setShowProveedores] = useState(false)
  const [expanded, setExpanded]   = useState(null)
  const [detalle, setDetalle]     = useState({})
  const [semSel, setSemSel]       = useState(SEMANAS_SAB_VIE[0])

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('gastos_operativos')
      .select('*, cat_proveedores(nombre, categoria)')
      .gte('fecha', semSel.ini)
      .lte('fecha', semSel.fin)
      .order('fecha', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(500)
    setGastos(data || [])
    setLoading(false)
  }, [semSel])

  useEffect(() => { cargar() }, [cargar])

  const cargarDetalle = async (gastoId) => {
    if (detalle[gastoId]) return
    const { data } = await supabase.from('gasto_detalle').select('*').eq('gasto_id', gastoId).order('created_at')
    setDetalle(d => ({ ...d, [gastoId]: data || [] }))
  }

  const toggleExpand = async (id) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    await cargarDetalle(id)
  }

  const eliminar = async (g) => {
    if (!window.confirm(`¿Eliminar gasto ${g.descripcion || fmt(g.cantidad)}?`)) return
    await supabase.from('gastos_operativos').delete().eq('id', g.id)
    logAudit({ modulo: 'GASTOS_OPERATIVOS', accion: 'ELIMINAR', entidad: 'gasto', entidad_id: g.id, descripcion: `Gasto eliminado: ${g.descripcion || g.proveedor || ''}` })
    cargar()
    toast.success('Gasto eliminado')
  }

  const filtrados = gastos.filter(g => {
    const matchQ = !search || (g.descripcion || '').toLowerCase().includes(search.toLowerCase()) || (g.proveedor || '').toLowerCase().includes(search.toLowerCase())
    const matchG = filtroGrupo === 'Todos' || g.grupo_gasto === filtroGrupo
    return matchQ && matchG
  })

  const totalFiltrado = filtrados.reduce((a, g) => a + (parseFloat(g.cantidad) || 0), 0)
  const gruposPresentes = ['Todos', ...new Set(gastos.map(g => g.grupo_gasto).filter(Boolean))]

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Receipt size={22} color="#E8A020" />
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1A3C5E' }}>Gastos Operativos</h1>
            <p style={{ margin: 0, fontSize: 12, color: '#9CA3AF' }}>Tickets con detalle de productos • Proveedor • OCR</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowProveedores(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#EFF6FF', color: '#0A66C2', border: '1.5px solid #BFDBFE', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <BookUser size={15} /> Proveedores
          </button>
          <button onClick={() => setShowCargaGrupo(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#057642', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Images size={15} /> Carga en Grupo
          </button>
          <button onClick={() => setModal('nuevo')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: '#E8A020', color: 'white', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            <Plus size={15} /> Nuevo ticket
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Selector de semana Sáb→Vie */}
        <select value={semSel.ini} onChange={e => setSemSel(SEMANAS_SAB_VIE.find(s => s.ini === e.target.value))}
          style={{ padding: '7px 10px', border: '2px solid #0A66C2', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#1A3C5E', background: '#EFF6FF', cursor: 'pointer', outline: 'none' }}>
          {SEMANAS_SAB_VIE.map(s => <option key={s.ini} value={s.ini}>{s.label}</option>)}
        </select>
        <div style={{ position: 'relative', flex: '0 0 220px' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar concepto o proveedor…"
            style={{ width: '100%', paddingLeft: 28, padding: '7px 8px 7px 28px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto' }}>
          {gruposPresentes.map(g => {
            const color = g === 'Todos' ? '#6B7280' : (GRUPO_COLOR[g] || '#6B7280')
            const active = filtroGrupo === g
            return (
              <button key={g} onClick={() => setFiltroGrupo(g)} style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${color}`, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: active ? color : 'white', color: active ? 'white' : color }}>
                {g}
              </button>
            )
          })}
        </div>
        <div style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 15, color: '#1A3C5E' }}>{fmt(totalFiltrado)}</div>
      </div>

      {/* Tabla agrupada por día */}
      <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Cargando…</div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
            <Receipt size={36} style={{ marginBottom: 12, opacity: 0.3 }} />
            <div>Sin gastos esta semana. Usa "+ Nuevo ticket" para agregar.</div>
          </div>
        ) : (() => {
          const DIAS_L = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
          const MESES_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
          const porFecha = {}
          filtrados.forEach(g => { if (!porFecha[g.fecha]) porFecha[g.fecha] = []; porFecha[g.fecha].push(g) })
          const fechasOrdenadas = Object.keys(porFecha).sort()
          const labelF = iso => { const d = new Date(iso+'T12:00:00'); return `${DIAS_L[d.getDay()]} ${d.getDate()} ${MESES_L[d.getMonth()]}` }

          return (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #E5E7EB' }}>
                  {['', 'Fecha', 'Proveedor', 'Grupo', 'Descripción', 'Monto', 'TOTAL DÍA', 'Detalle', ''].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: h==='Monto'||h==='TOTAL DÍA'?'right':'left', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fechasOrdenadas.map(fecha => {
                  const items = porFecha[fecha]
                  const dayTotal = items.reduce((a,g) => a+(parseFloat(g.cantidad)||0), 0)
                  return items.map((g, idx) => {
                    const isOpen = expanded === g.id
                    const lineas = detalle[g.id] || []
                    const sumaD  = lineas.reduce((a,l) => a+parseFloat(l.subtotal||0), 0)
                    const cuadra = !g.ticket_total || lineas.length===0 || Math.abs(sumaD - parseFloat(g.ticket_total)) < 0.02
                    const color  = GRUPO_COLOR[g.grupo_gasto] || '#6B7280'
                    const prvNombre = g.cat_proveedores?.nombre || parseProvNombre(g.proveedor) || '—'
                    return (
                      <>
                        <tr key={g.id} style={{ borderBottom: isOpen?'none':'1px solid #F3F4F6', background: isOpen?'#F0FDF4':'transparent', cursor:'pointer', borderLeft: idx===0?'3px solid #0A66C2':'3px solid transparent' }}
                          onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background='#F9FAFB' }}
                          onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background=isOpen?'#F0FDF4':'transparent' }}>
                          <td style={{ padding:'10px 8px 10px 10px', width:24 }}>
                            <button onClick={() => toggleExpand(g.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', padding:0, display:'flex' }}>
                              {isOpen ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}
                            </button>
                          </td>
                          <td style={{ padding:'10px 12px', fontSize:13, color: idx===0?'#374151':'#9CA3AF', fontWeight:idx===0?700:400, whiteSpace:'nowrap' }}>
                            {idx===0 ? labelF(fecha) : ''}
                          </td>
                          <td style={{ padding:'10px 12px', fontSize:13, color:'#374151' }}>{prvNombre}</td>
                          <td style={{ padding:'10px 12px' }}>
                            <span style={{ padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700, background:color+'22', color }}>{g.grupo_gasto}</span>
                          </td>
                          <td style={{ padding:'10px 12px', fontSize:13, color:'#374151', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.descripcion||'—'}</td>
                          <td style={{ padding:'10px 12px', fontSize:14, fontWeight:700, color:'#1A3C5E', whiteSpace:'nowrap', textAlign:'right' }}>{fmt(g.cantidad)}</td>
                          <td style={{ padding:'10px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:900, fontSize:13, color:idx===items.length-1?'#0A66C2':'transparent', background:idx===items.length-1?'#EFF6FF':'transparent', whiteSpace:'nowrap' }}>
                            {idx===items.length-1 ? fmt(dayTotal) : ''}
                          </td>
                          <td style={{ padding:'10px 12px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              {lineas.length > 0
                                ? <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, color:cuadra?'#057642':'#B24020', fontWeight:700 }}>
                                    {cuadra?<Check size={13}/>:<AlertTriangle size={13}/>} {lineas.length} líneas
                                  </span>
                                : <span style={{ fontSize:12, color:'#9CA3AF' }}>Sin detalle</span>}
                              {g.ticket_url && (
                                <span title="Tiene imagen adjunta" style={{ color:'#6B7280', display:'flex', alignItems:'center' }}>
                                  <Paperclip size={12}/>
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding:'10px 12px' }}>
                            <div style={{ display:'flex', gap:5 }}>
                              <button onClick={e => { e.stopPropagation(); toggleExpand(g.id) }} title="Ver detalle"
                                style={{ padding:'4px 8px', background: isOpen?'#F0FDF4':'#F9FAFB', color: isOpen?'#057642':'#6B7280', border:'none', borderRadius:5, cursor:'pointer' }}>
                                <Eye size={12}/>
                              </button>
                              {g.ticket_url && (
                                <EnlacePrivado bucket="tickets-gastos" valor={g.ticket_url} title="Ver imagen del ticket" style={{ display:'inline-flex', padding:'4px 8px', background:'#F0FDF4', color:'#057642', border:'none', borderRadius:5, cursor:'pointer' }}><Paperclip size={12}/></EnlacePrivado>
                              )}
                              <button onClick={e => { e.stopPropagation(); setModal(g) }} title="Editar" style={{ padding:'4px 8px', background:'#EFF6FF', color:'#0A66C2', border:'none', borderRadius:5, cursor:'pointer' }}><Pencil size={12}/></button>
                              <button onClick={e => { e.stopPropagation(); eliminar(g) }} title="Eliminar" style={{ padding:'4px 8px', background:'#FEE2E2', color:'#B24020', border:'none', borderRadius:5, cursor:'pointer' }}><Trash2 size={12}/></button>
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={g.id+'-det'} style={{ borderBottom:'1px solid #F3F4F6' }}>
                            <td colSpan={9} style={{ padding:'0 12px 12px 32px', background:'#F0FDF4' }}>
                              <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
                                <div style={{ flex:1 }}>
                                  {lineas.length === 0
                                    ? <div style={{ fontSize:13, color:'#6B7280', padding:'8px 0' }}>Sin detalle — edita para agregar</div>
                                    : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                                        <thead>
                                          <tr>{['Producto','Categoría','Cant.','Precio unit.','Subtotal'].map(h => (
                                            <th key={h} style={{ padding:'5px 8px', textAlign:'left', fontSize:10, color:'#6B7280', fontWeight:700, textTransform:'uppercase' }}>{h}</th>
                                          ))}</tr>
                                        </thead>
                                        <tbody>
                                          {lineas.map(l => (
                                            <tr key={l.id}>
                                              <td style={{ padding:'4px 8px', color:'#374151' }}>{l.descripcion}</td>
                                              <td style={{ padding:'4px 8px', color:'#6B7280' }}>{l.categoria||'—'}</td>
                                              <td style={{ padding:'4px 8px', color:'#374151' }}>{l.cantidad}</td>
                                              <td style={{ padding:'4px 8px', color:'#374151' }}>{fmt(l.precio_unit)}</td>
                                              <td style={{ padding:'4px 8px', fontWeight:700, color:'#057642' }}>{fmt(l.subtotal)}</td>
                                            </tr>
                                          ))}
                                          <tr style={{ borderTop:'1px dashed #BBF7D0' }}>
                                            <td colSpan={4} style={{ padding:'6px 8px', fontWeight:700, textAlign:'right' }}>Total detalle:</td>
                                            <td style={{ padding:'6px 8px', fontWeight:800, color:cuadra?'#057642':'#B24020' }}>{fmt(sumaD)}</td>
                                          </tr>
                                        </tbody>
                                      </table>
                                  }
                                </div>
                                {g.ticket_url && (
                                  <div style={{ flexShrink:0, width:180, background:'white', border:'1.5px solid #BBF7D0', borderRadius:10, padding:8, textAlign:'center' }}>
                                    <div style={{ fontSize:10, fontWeight:800, color:'#065F46', textTransform:'uppercase', marginBottom:6, letterSpacing:'.06em' }}>🖼️ Ticket</div>
                                    <ImagenPrivada bucket="tickets-gastos" valor={g.ticket_url} alt="Ticket" style={{ width:'100%', maxHeight:240, objectFit:'contain', borderRadius:6, cursor:'pointer' }} onClick={url => window.open(url,'_blank','noopener,noreferrer')} />
                                    <EnlacePrivado bucket="tickets-gastos" valor={g.ticket_url} style={{ display:'block', marginTop:5, fontSize:10, color:'#0A66C2' }}>Ver completo ↗</EnlacePrivado>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })
                })}
              </tbody>
              <tfoot>
                <tr style={{ background:'#1A3C5E' }}>
                  <td colSpan={5} style={{ padding:'10px 12px', color:'white', fontWeight:800, fontSize:12 }}>
                    TOTAL SEMANA — {semSel.label}
                  </td>
                  <td style={{ padding:'10px 12px', textAlign:'right', color:'#E8A020', fontWeight:900, fontSize:15, fontFamily:'monospace' }}>{fmt(totalFiltrado)}</td>
                  <td style={{ padding:'10px 12px', textAlign:'right', color:'#E8A020', fontWeight:900, fontSize:15, fontFamily:'monospace' }}>{fmt(totalFiltrado)}</td>
                  <td colSpan={2}/>
                </tr>
              </tfoot>
            </table>
          )
        })()}
      </div>

      {modal && (
        <TicketModal
          gasto={modal === 'nuevo' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); setDetalle({}); cargar() }}
        />
      )}

      {showCargaGrupo && (
        <ModalCargaGrupo
          onClose={() => setShowCargaGrupo(false)}
          onSaved={() => { setShowCargaGrupo(false); cargar() }}
        />
      )}

      {showProveedores && <DrawerProveedores onClose={() => setShowProveedores(false)} />}
    </div>
  )
}
