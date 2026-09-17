import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, urlFirmada } from '../lib/supabase'

const OCR_FN = '/.netlify/functions/extraer-documento'

// ─── Docs requeridos por tipo de persona ─────────────────────────────────────
const DOCS_POR_TIPO = {
  INQUILINO: [
    { id: 'INE_FRENTE',             label: 'INE — frente',                    hint: 'Foto clara, vigente, sin recortes' },
    { id: 'INE_REVERSO',            label: 'INE — reverso',                   hint: 'Mismo documento, lado posterior' },
    { id: 'COMPROBANTE_INGRESOS_1', label: 'Comprobante de ingresos (mes 1)', hint: 'Estado de cuenta o recibo de nómina' },
    { id: 'COMPROBANTE_INGRESOS_2', label: 'Comprobante de ingresos (mes 2)', hint: 'Estado de cuenta o recibo de nómina' },
    { id: 'COMPROBANTE_INGRESOS_3', label: 'Comprobante de ingresos (mes 3)', hint: 'Estado de cuenta o recibo de nómina' },
    { id: 'SOLICITUD_FIRMADA',      label: 'Solicitud de arrendamiento firmada', hint: 'Con tu firma autógrafa' },
  ],
  OBLIGADO_SOLIDARIO: [
    { id: 'INE_FRENTE',             label: 'INE — frente',                    hint: 'Del obligado solidario' },
    { id: 'INE_REVERSO',            label: 'INE — reverso',                   hint: 'Del obligado solidario' },
    { id: 'COMPROBANTE_INGRESOS_1', label: 'Comprobante de ingresos (mes 1)', hint: 'Estado de cuenta o recibo de nómina' },
    { id: 'COMPROBANTE_INGRESOS_2', label: 'Comprobante de ingresos (mes 2)', hint: 'Estado de cuenta o recibo de nómina' },
    { id: 'COMPROBANTE_INGRESOS_3', label: 'Comprobante de ingresos (mes 3)', hint: 'Estado de cuenta o recibo de nómina' },
    { id: 'COMPROBANTE_DOMICILIO',  label: 'Comprobante de domicilio',        hint: 'Recibo de agua, luz o teléfono (máx 3 meses)' },
    { id: 'SOLICITUD_FIRMADA',      label: 'Solicitud firmada',               hint: 'Con firma del obligado solidario' },
  ],
  FIADOR: [
    { id: 'INE_FRENTE',             label: 'INE — frente',                    hint: 'Del fiador' },
    { id: 'INE_REVERSO',            label: 'INE — reverso',                   hint: 'Del fiador' },
    { id: 'COMPROBANTE_INGRESOS_1', label: 'Comprobante de ingresos (mes 1)', hint: 'Estado de cuenta o recibo de nómina' },
    { id: 'COMPROBANTE_INGRESOS_2', label: 'Comprobante de ingresos (mes 2)', hint: 'Estado de cuenta o recibo de nómina' },
    { id: 'COMPROBANTE_INGRESOS_3', label: 'Comprobante de ingresos (mes 3)', hint: 'Estado de cuenta o recibo de nómina' },
    { id: 'COMPROBANTE_DOMICILIO',  label: 'Comprobante de domicilio',        hint: 'Del fiador (máx 3 meses)' },
    { id: 'ESCRITURA_INMUEBLE',     label: 'Escritura — inmueble en garantía', hint: 'Inmueble que ofrece como garantía, con datos registrales' },
    { id: 'SOLICITUD_FIRMADA',      label: 'Solicitud firmada',               hint: 'Con firma del fiador' },
  ],
}

const ROL = {
  INQUILINO:          { label: 'Inquilino',          color: '#0A66C2', bg: '#EFF6FF', borde: '#BFDBFE', icon: '👤' },
  OBLIGADO_SOLIDARIO: { label: 'Obligado Solidario', color: '#166534', bg: '#F0FDF4', borde: '#86EFAC', icon: '🤲' },
  FIADOR:             { label: 'Fiador',             color: '#92400E', bg: '#FEF3C7', borde: '#FCD34D', icon: '🤝' },
}

const CAMPOS_GENERALES = [
  { k: 'nombre_completo',  l: 'Nombre completo',      t: 'text',  req: true,  full: true },
  { k: 'fecha_nacimiento', l: 'Fecha de nacimiento',  t: 'date',  req: false },
  { k: 'curp',             l: 'CURP',                 t: 'text',  req: false, up: true },
  { k: 'rfc',              l: 'RFC',                  t: 'text',  req: false, up: true },
  { k: 'email',            l: 'Correo electrónico',   t: 'email', req: true,  full: true },
  { k: 'cel',              l: 'Celular',              t: 'tel',   req: false },
  { k: 'calle',            l: 'Calle y número',       t: 'text',  req: false, full: true },
  { k: 'colonia',          l: 'Colonia',              t: 'text',  req: false },
  { k: 'municipio',        l: 'Municipio',            t: 'text',  req: false },
  { k: 'estado_domicilio', l: 'Estado',               t: 'text',  req: false },
  { k: 'cp',               l: 'C.P.',                 t: 'text',  req: false },
]

const CAMPOS_ECONOMICOS = [
  { k: 'empresa',          l: 'Empresa / Empleador',  t: 'text'   },
  { k: 'puesto',           l: 'Puesto',               t: 'text'   },
  { k: 'ingreso_mensual',  l: 'Ingreso mensual ($)',  t: 'number' },
]

const CAMPOS_FIADOR_GARANTIA = [
  { k: 'garantia_calle',    l: 'Calle del inmueble en garantía', t: 'text', full: true },
  { k: 'garantia_colonia',  l: 'Colonia',              t: 'text' },
  { k: 'garantia_municipio',l: 'Municipio',            t: 'text' },
  { k: 'garantia_estado',   l: 'Estado',               t: 'text' },
  { k: 'escritura_no',      l: 'No. escritura',        t: 'text', sec: 'Escritura' },
  { k: 'escritura_notario', l: 'Notario',              t: 'text' },
  { k: 'escritura_fecha',   l: 'Fecha de escritura',   t: 'date' },
]

// ─── Subcomponente: fila de documento ────────────────────────────────────────
function DocFila({ doc, docDb, personaId, onSubido }) {
  const ref = useRef()
  const [subiendo, setSubiendo] = useState(false)
  const estado = docDb?.estado || 'PENDIENTE'

  const COLOR = {
    PENDIENTE: { bg: 'white',   borde: '#E5E7EB', icono: '⬜' },
    SUBIDO:    { bg: '#EFF6FF', borde: '#BFDBFE', icono: '📎' },
    APROBADO:  { bg: '#F0FDF4', borde: '#86EFAC', icono: '✅' },
    RECHAZADO: { bg: '#FEF2F2', borde: '#FCA5A5', icono: '❌' },
  }[estado] || { bg: 'white', borde: '#E5E7EB', icono: '⬜' }

  const subir = async (archivo) => {
    setSubiendo(true)
    try {
      const ext  = archivo.name.split('.').pop()
      const path = `prospectos/${personaId}/${doc.id}.${ext}`
      const { error: upErr } = await supabase.storage.from('prospecto-docs').upload(path, archivo, { upsert: true })
      if (upErr) throw upErr
      // storage_path guarda la RUTA. El bucket es privado; quien la muestre firma.
      const { error: dbErr } = await supabase.from('prospecto_documentos').update({
        storage_path: path, nombre_archivo: archivo.name,
        mime_type: archivo.type, tamano_bytes: archivo.size,
        estado: 'SUBIDO', subido_at: new Date().toISOString(),
      }).eq('id', docDb.id)
      if (dbErr) throw dbErr
      onSubido(docDb.id, archivo.name)
    } catch (err) { alert('Error al subir: ' + err.message) }
    finally { setSubiendo(false) }
  }

  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 14px', borderRadius:10, border:`1.5px solid ${COLOR.borde}`, background:COLOR.bg, marginBottom:8 }}>
      <span style={{ fontSize:18, flexShrink:0, marginTop:1 }}>{COLOR.icono}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:700 }}>{doc.label}</div>
        <div style={{ fontSize:11, color:'#6B7280' }}>{doc.hint}</div>
        {docDb?.nombre_archivo && (
          <div style={{ fontSize:11, color:'#0A66C2', fontWeight:600, marginTop:2 }}>
            {docDb.nombre_archivo}
          </div>
        )}
        {estado === 'RECHAZADO' && docDb?.nota_rechazo && (
          <div style={{ fontSize:11, color:'#B24020', fontWeight:600, marginTop:3 }}>
            ↳ Motivo: {docDb.nota_rechazo}
          </div>
        )}
      </div>
      {estado !== 'APROBADO' && (
        <>
          <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic"
            style={{ display:'none' }} onChange={e => e.target.files[0] && subir(e.target.files[0])} />
          <button onClick={() => ref.current.click()} disabled={subiendo}
            style={{ padding:'6px 12px', borderRadius:8, border:'none', cursor: subiendo ? 'wait' : 'pointer',
              background: subiendo ? '#E5E7EB' : '#0A66C2', color: subiendo ? '#9CA3AF' : 'white',
              fontSize:11, fontWeight:700, whiteSpace:'nowrap', flexShrink:0 }}>
            {subiendo ? 'Subiendo…' : estado === 'RECHAZADO' ? '↻ Resubir' : estado === 'SUBIDO' ? '↻ Cambiar' : '📤 Subir'}
          </button>
        </>
      )}
    </div>
  )
}

// ─── Subcomponente: formulario de una persona ────────────────────────────────
function FormPersona({ persona: p, docs, onActualizado }) {
  const [form, setForm]         = useState({ ...p })
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado]   = useState(false)
  const [docsState, setDocsState] = useState(docs)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrMsg, setOcrMsg]         = useState(null)
  const ocrFileRef = useRef()
  const rol = ROL[p.tipo] || ROL.INQUILINO
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleOcrFile = async (file, tipo_doc) => {
    setOcrLoading(true); setOcrMsg(null)
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload  = () => res(r.result.split(',')[1])
        r.onerror = rej
        r.readAsDataURL(file)
      })
      const resp = await fetch(OCR_FN, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image_base64: b64, media_type: file.type, tipo_doc }),
      })
      const json = await resp.json()
      if (!resp.ok || !json.datos) throw new Error(json.error || 'Sin datos')
      const d = json.datos
      const upd = {}
      if (d.nombre_completo) upd.nombre_completo = d.nombre_completo
      if (d.fecha_nacimiento) upd.fecha_nacimiento = d.fecha_nacimiento
      if (d.curp)            upd.curp = d.curp.toUpperCase()
      if (d.rfc)             upd.rfc  = d.rfc.toUpperCase()
      // Dirección INE → campo calle (calle + no_ext)
      const calleParts = [d.calle || d.domicilio_ine, d.no_ext].filter(Boolean)
      if (calleParts.length) upd.calle = calleParts.join(' ')
      if (d.colonia_ine || d.colonia) upd.colonia = d.colonia_ine || d.colonia
      if (d.municipio_ine || d.municipio) upd.municipio = d.municipio_ine || d.municipio
      if (d.estado_ine || d.estado) upd.estado_domicilio = d.estado_ine || d.estado
      if (d.cp_ine || d.cp) upd.cp = d.cp_ine || d.cp
      // Comprobante domicilio → también dirección
      if (d.nombre_titular) {
        if (d.calle) upd.calle = [d.calle, d.no_ext].filter(Boolean).join(' ')
        if (d.colonia) upd.colonia = d.colonia
        if (d.municipio) upd.municipio = d.municipio
        if (d.estado) upd.estado_domicilio = d.estado
        if (d.cp) upd.cp = d.cp
      }
      // Comprobante ingresos
      if (d.empresa_patron || d.nombre_titular) upd.empresa = d.empresa_patron || d.empresa || ''
      if (d.puesto) upd.puesto = d.puesto
      if (d.ingreso_mensual_neto) upd.ingreso_mensual = String(d.ingreso_mensual_neto)
      setForm(prev => ({ ...prev, ...upd }))
      const campos = Object.keys(upd).length
      setOcrMsg({ ok: true, txt: `✓ ${campos} campo${campos !== 1 ? 's' : ''} importados` })
    } catch (e) {
      setOcrMsg({ ok: false, txt: e.message })
    } finally { setOcrLoading(false) }
  }

  const [errores, setErrores] = useState({})

  const validar = () => {
    const e = {}
    if (!form.nombre_completo?.trim()) e.nombre_completo = 'Requerido'
    if (!form.email?.includes('@'))    e.email = 'Correo inválido'
    if (form.curp && !/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(form.curp))
      e.curp = 'CURP inválido (18 caracteres)'
    if (form.rfc && !/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/.test(form.rfc))
      e.rfc = 'RFC inválido (12-13 caracteres)'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  const guardar = async () => {
    if (!validar()) return
    setGuardando(true)
    try {
      const { error } = await supabase.from('prospecto_personas').update({ ...form, updated_at: new Date().toISOString() }).eq('id', p.id)
      if (error) throw error
      setGuardado(true)
      setTimeout(() => setGuardado(false), 3000)
      onActualizado(p.id, form)
    } catch (err) { alert('Error al guardar: ' + err.message) }
    finally { setGuardando(false) }
  }

  const docSubido = (docId, nombre) => {
    setDocsState(prev => prev.map(d => d.id === docId ? { ...d, estado:'SUBIDO', nombre_archivo: nombre } : d))
  }

  const docsPersona    = (DOCS_POR_TIPO[p.tipo] || [])
  const totalReq       = docsPersona.length
  const subidosOk      = docsPersona.filter(d => {
    const db = docsState.find(x => x.tipo_doc === d.id)
    return db && db.estado !== 'PENDIENTE' && db.estado !== 'RECHAZADO'
  }).length
  const pct = totalReq ? Math.round((subidosOk / totalReq) * 100) : 0

  const necesitaEconomicos = p.tipo === 'FIADOR' || p.tipo === 'OBLIGADO_SOLIDARIO'

  return (
    <div style={{ border:`2px solid ${rol.borde}`, borderRadius:14, overflow:'hidden', marginBottom:20 }}>

      {/* Header del rol */}
      <div style={{ background: rol.bg, padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:24 }}>{rol.icon}</span>
          <div>
            <div style={{ fontSize:10, fontWeight:800, letterSpacing:1, textTransform:'uppercase', color: rol.color }}>
              {rol.label}
            </div>
            <div style={{ fontSize:15, fontWeight:800 }}>{form.nombre_completo || 'Sin nombre'}</div>
          </div>
        </div>
        {/* Mini progreso docs */}
        <div style={{ textAlign:'right', minWidth:80 }}>
          <div style={{ fontSize:18, fontWeight:800, color: pct===100 ? '#057642' : rol.color }}>{pct}%</div>
          <div style={{ fontSize:10, color:'#6B7280' }}>{subidosOk}/{totalReq} docs</div>
        </div>
      </div>

      <div style={{ padding:'18px 18px 20px' }}>

        {/* ── Panel OCR — Importar desde INE ── */}
        <div style={{ background:'#EFF6FF', border:'2px solid #BFDBFE', borderRadius:10, padding:'12px 14px', marginBottom:18 }}>
          <div style={{ fontSize:10, fontWeight:800, color:'#0A66C2', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>
            📲 Importar datos desde INE
          </div>
          <div style={{ fontSize:11, color:'#475569', marginBottom:10 }}>
            Toma foto de la credencial — los datos se llenan automáticamente
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom: ocrMsg ? 8 : 0 }}>
            {[
              ['INE_FRENTE',            '📸 INE Frente'],
              ['INE_REVERSO',           '📸 INE Reverso'],
              ['COMPROBANTE_DOMICILIO', '🏠 Comp. domicilio'],
              ['COMPROBANTE_INGRESOS_1','💰 Comp. ingresos'],
            ].map(([tipo, label]) => (
              <button
                key={tipo}
                disabled={ocrLoading}
                onClick={() => { ocrFileRef.current._tipo = tipo; ocrFileRef.current.click() }}
                style={{
                  padding:'9px 6px', borderRadius:8, border:'1.5px solid #BFDBFE',
                  background:'white', fontSize:12, fontWeight:700, cursor: ocrLoading ? 'wait' : 'pointer',
                  color:'#1E40AF', opacity: ocrLoading ? 0.6 : 1,
                }}
              >{ocrLoading ? '⏳ Procesando…' : label}</button>
            ))}
          </div>
          {/* Input oculto — capture=environment activa cámara trasera en móvil */}
          <input
            ref={ocrFileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display:'none' }}
            onChange={e => {
              const f = e.target.files[0]
              if (f) handleOcrFile(f, ocrFileRef.current._tipo)
              e.target.value = ''
            }}
          />
          {ocrMsg && (
            <div style={{ fontSize:11, fontWeight:700, padding:'6px 10px', borderRadius:6,
              color: ocrMsg.ok ? '#057642' : '#B24020',
              background: ocrMsg.ok ? '#D1FAE5' : '#FEE2E2' }}>
              {ocrMsg.txt}
            </div>
          )}
        </div>

        {/* Datos personales */}
        <div style={{ fontSize:11, fontWeight:800, letterSpacing:0.8, textTransform:'uppercase', color: rol.color, marginBottom:10 }}>
          Datos personales
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:16 }}>
          {CAMPOS_GENERALES.map(c => (
            <div key={c.k} style={{ gridColumn: c.full ? '1/-1' : 'auto' }}>
              <label style={lbl}>{c.l}{c.req && <span style={{ color:'#B24020' }}> *</span>}</label>
              <input type={c.t} value={form[c.k] || ''} style={{ ...inp, borderColor: errores[c.k] ? '#B24020' : '#E5E7EB' }}
                onChange={e => { set(c.k, c.up ? e.target.value.toUpperCase() : e.target.value); setErrores(prev => ({ ...prev, [c.k]: null })) }} />
              {errores[c.k] && <div style={{ fontSize:11, color:'#B24020', marginTop:3 }}>⚠ {errores[c.k]}</div>}
            </div>
          ))}
        </div>

        {/* Datos económicos (fiador y obligado solidario) */}
        {necesitaEconomicos && (
          <>
            <div style={{ fontSize:11, fontWeight:800, letterSpacing:0.8, textTransform:'uppercase', color: rol.color, marginBottom:10, paddingTop:12, borderTop:`1px solid ${rol.borde}` }}>
              Datos económicos
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:16 }}>
              {CAMPOS_ECONOMICOS.map(c => (
                <div key={c.k}>
                  <label style={lbl}>{c.l}</label>
                  <input type={c.t} value={form[c.k] || ''} style={inp} onChange={e => set(c.k, e.target.value)} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Datos fiador: inmueble en garantía + escritura */}
        {p.tipo === 'FIADOR' && (
          <>
            <div style={{ fontSize:11, fontWeight:800, letterSpacing:0.8, textTransform:'uppercase', color:'#92400E', marginBottom:10, paddingTop:12, borderTop:'1px solid #FCD34D' }}>
              Inmueble en garantía y escritura
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:16 }}>
              {CAMPOS_FIADOR_GARANTIA.map(c => (
                <div key={c.k} style={{ gridColumn: c.full ? '1/-1' : 'auto' }}>
                  {c.sec && <div style={{ fontSize:10, fontWeight:800, color:'#92400E', gridColumn:'1/-1', marginBottom:4, marginTop:8 }}>{c.sec}</div>}
                  <label style={lbl}>{c.l}</label>
                  <input type={c.t} value={form[c.k] || ''} style={inp} onChange={e => set(c.k, e.target.value)} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Botón guardar datos */}
        <button onClick={guardar} disabled={guardando}
          style={{ padding:'8px 18px', borderRadius:8, border:'none', cursor: guardando ? 'wait' : 'pointer',
            background: guardado ? '#057642' : rol.color, color:'white', fontSize:12, fontWeight:700, marginBottom:20 }}>
          {guardando ? 'Guardando…' : guardado ? '✓ Datos guardados' : 'Guardar datos'}
        </button>

        {/* Documentos */}
        <div style={{ fontSize:11, fontWeight:800, letterSpacing:0.8, textTransform:'uppercase', color: rol.color, marginBottom:10, paddingTop:12, borderTop:`1px solid ${rol.borde}` }}>
          Documentos — {rol.label}
        </div>
        {docsPersona.map(doc => {
          const docDb = docsState.find(d => d.tipo_doc === doc.id && d.persona_id === p.id)
          return <DocFila key={doc.id} doc={doc} docDb={docDb} personaId={p.id} onSubido={docSubido} />
        })}

      </div>
    </div>
  )
}

// ─── Pantalla de error ────────────────────────────────────────────────────────
function PantallaError({ msg }) {
  return (
    <div style={{ minHeight:'100vh', background:'#F8FAFC', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'white', borderRadius:16, padding:'40px 28px', maxWidth:400, width:'100%', textAlign:'center', boxShadow:'0 8px 32px #0001' }}>
        <div style={{ fontSize:40, marginBottom:14 }}>⚠️</div>
        <h2 style={{ fontSize:18, fontWeight:800, margin:'0 0 10px' }}>Link inválido o expirado</h2>
        <p style={{ fontSize:13, color:'#6B7280', lineHeight:1.6 }}>{msg}</p>
        <p style={{ fontSize:12, color:'#9CA3AF', marginTop:14 }}>Comunícate con el administrador para obtener un nuevo enlace.</p>
      </div>
    </div>
  )
}

// ─── Pantalla completado ─────────────────────────────────────────────────────
function PantallaCompletado({ nombre, negocio }) {
  return (
    <div style={{ minHeight:'100vh', background:'#F0FDF4', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'white', borderRadius:16, padding:'40px 28px', maxWidth:420, width:'100%', textAlign:'center', boxShadow:'0 8px 32px #0001' }}>
        <div style={{ width:72, height:72, borderRadius:'50%', background:'#F0FDF4', border:'3px solid #86EFAC', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', fontSize:32 }}>✅</div>
        <h2 style={{ fontSize:21, fontWeight:800, margin:'0 0 10px' }}>¡Expediente enviado!</h2>
        <p style={{ fontSize:14, color:'#6B7280', lineHeight:1.6, margin:'0 0 20px' }}>
          Hola <strong>{nombre}</strong>, tu documentación fue recibida correctamente.
          El administrador la revisará y te notificará en los próximos días.
        </p>
        {negocio && (
          <div style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 16px', fontSize:13, color:'#374151' }}>
            <span style={{ color:'#6B7280' }}>Local / Negocio: </span>
            <strong>{negocio}</strong>
          </div>
        )}
        <p style={{ fontSize:12, color:'#9CA3AF', marginTop:20 }}>Tiempo estimado de investigación: 1 a 2 semanas.</p>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function PortalProspecto() {
  const { token } = useParams()
  const [estado, setEstado]       = useState('cargando')
  const [errorMsg, setErrorMsg]   = useState('')
  const [data, setData]           = useState(null)
  const [personas, setPersonas]   = useState([])
  const [docs, setDocs]           = useState([])
  const [diasRestantes, setDiasRestantes] = useState(null)

  useEffect(() => {
    const cargar = async () => {
      try {
        const res  = await fetch(`/.netlify/functions/portal-prospecto?token=${token}`)
        const json = await res.json()
        if (!res.ok) { setErrorMsg(json.error || 'Error al validar el enlace'); setEstado('error'); return }
        setData(json)
        setPersonas(json.personas || [])
        setDocs(json.docs || [])
        const dias = Math.ceil((new Date(json.link_expira) - new Date()) / 86400000)
        setDiasRestantes(dias)
        setEstado('listo')
      } catch { setErrorMsg('Sin conexión. Verifica tu internet e intenta de nuevo.'); setEstado('error') }
    }
    if (token) cargar()
  }, [token])

  const actualizarPersona = (id, nuevosDatos) => {
    setPersonas(prev => prev.map(p => p.id === id ? { ...p, ...nuevosDatos } : p))
  }

  // Calcular progreso global
  const totalDocs   = personas.reduce((s, p) => s + (DOCS_POR_TIPO[p.tipo] || []).length, 0)
  const subidosDocs = docs.filter(d => d.estado !== 'PENDIENTE' && d.estado !== 'RECHAZADO').length
  const pctGlobal   = totalDocs ? Math.round((subidosDocs / totalDocs) * 100) : 0
  const todoListo   = pctGlobal === 100
  const inquilino   = personas.find(p => p.tipo === 'INQUILINO')

  if (estado === 'cargando') return (
    <div style={{ minHeight:'100vh', background:'#F8FAFC', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', color:'#6B7280' }}>
        <div style={{ fontSize:36, marginBottom:12 }}>⏳</div>
        <p style={{ fontSize:14 }}>Validando tu enlace…</p>
      </div>
    </div>
  )
  if (estado === 'error')   return <PantallaError msg={errorMsg} />
  if (estado === 'enviado') return <PantallaCompletado nombre={inquilino?.nombre_completo} negocio={data?.nombre_negocio} />

  return (
    <div style={{ minHeight:'100vh', background:'#F8FAFC', fontFamily:'system-ui,-apple-system,sans-serif' }}>

      {/* Header */}
      <div style={{ background:'#1A3C5E', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:15, fontWeight:800, color:'white' }}>Petra — Portal de Documentación</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)' }}>Proceso de arrendamiento</div>
        </div>
        {diasRestantes !== null && (
          <div style={{ fontSize:11, fontWeight:700, color: diasRestantes <= 2 ? '#FCA5A5' : 'rgba(255,255,255,0.65)', textAlign:'right' }}>
            Enlace válido<br />{diasRestantes} día{diasRestantes !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      <div style={{ maxWidth:640, margin:'0 auto', padding:'24px 16px 64px' }}>

        {/* Bienvenida */}
        <div style={{ background:'white', borderRadius:14, padding:'20px 20px 16px', marginBottom:20, boxShadow:'0 2px 10px #0001' }}>
          <h1 style={{ fontSize:19, fontWeight:800, margin:'0 0 6px' }}>
            Hola{inquilino?.nombre_completo ? `, ${inquilino.nombre_completo.split(' ')[0]}` : ''} 👋
          </h1>
          <p style={{ fontSize:13, color:'#6B7280', margin:'0 0 16px', lineHeight:1.55 }}>
            El administrador te pide completar el expediente de arrendamiento.
            <strong> Tú mismo subes los documentos de todos los integrantes</strong> — los tuyos
            y los de tu {personas.some(p => p.tipo === 'FIADOR') ? 'fiador' : 'obligado solidario'}.
          </p>

          {/* Barra de progreso global */}
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, fontWeight:700, marginBottom:6 }}>
            <span>Progreso del expediente</span>
            <span style={{ color: todoListo ? '#057642' : '#0A66C2' }}>{pctGlobal}%</span>
          </div>
          <div style={{ height:10, background:'#E5E7EB', borderRadius:99, overflow:'hidden', marginBottom:6 }}>
            <div style={{ height:'100%', width:`${pctGlobal}%`, background: todoListo ? '#057642' : '#0A66C2', borderRadius:99, transition:'width 0.4s ease' }} />
          </div>
          <div style={{ fontSize:11, color:'#6B7280' }}>{subidosDocs} de {totalDocs} documentos enviados</div>
        </div>

        {/* Aviso de formato */}
        <div style={{ background:'#FFFBEB', border:'1px solid #FCD34D', borderRadius:10, padding:'10px 14px', marginBottom:20, fontSize:12, color:'#92400E' }}>
          <strong>Formatos aceptados:</strong> PDF, JPG, PNG o HEIC · máx 10 MB por archivo.<br />
          Asegúrate de que todos los documentos sean legibles y estén completos.
        </div>

        {/* Sección por persona */}
        {personas.map(p => (
          <FormPersona
            key={p.id}
            persona={p}
            docs={docs.filter(d => d.persona_id === p.id)}
            onActualizado={actualizarPersona}
          />
        ))}

        {/* Botón finalizar */}
        {todoListo ? (
          <button onClick={() => setEstado('enviado')}
            style={{ width:'100%', padding:14, borderRadius:10, border:'none', cursor:'pointer',
              background:'#057642', color:'white', fontSize:15, fontWeight:800 }}>
            ✓ Confirmar envío del expediente completo
          </button>
        ) : (
          <div style={{ textAlign:'center', fontSize:12, color:'#9CA3AF', padding:'8px 0' }}>
            Sube todos los documentos para poder confirmar el envío.
          </div>
        )}

        <div style={{ textAlign:'center', fontSize:11, color:'#C4C9D0', marginTop:20, lineHeight:1.6 }}>
          Tu información es confidencial y solo será usada para el proceso de arrendamiento.<br />
          Petra — Inmueble Resource Planning · RANNIX Consulting
        </div>
      </div>
    </div>
  )
}

const lbl = { fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4 }
const inp = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1.5px solid #E5E7EB', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }
