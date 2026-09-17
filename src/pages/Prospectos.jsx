import { useState, useEffect, useCallback } from 'react'
import { supabase, urlFirmada } from '../lib/supabase'
import { useModuleAudit, logAudit } from '../hooks/useAudit'
import NuevoContratoModal from '../components/ui/NuevoContratoModal'
import ModalSolicitudPersona from '../components/ui/ModalSolicitudPersona'

// ─── Constantes ─────────────────────────────────────────────────────────────
const ETAPAS = [
  { id: 'CONTACTO',       label: 'Contacto',       color: '#6B7280' },
  { id: 'CANDIDATO',      label: 'Candidato',       color: '#0A66C2' },
  { id: 'DOCS_PENDIENTES',label: 'Docs pendientes', color: '#F59E0B' },
  { id: 'DOCS_COMPLETOS', label: 'Docs completos',  color: '#8B5CF6' },
  { id: 'INVESTIGACION',  label: 'Investigación',   color: '#E8A020' },
  { id: 'APROBADO',       label: 'Aprobado',        color: '#057642' },
  { id: 'RECHAZADO',      label: 'Rechazado',       color: '#B24020' },
  { id: 'CONTRATO',       label: 'Contrato',        color: '#1A3C5E' },
  { id: 'CANCELADO',      label: 'Cancelado',       color: '#6B7280' },
]

// Etapas que se ocultan del listado activo por default
const ETAPAS_INACTIVAS = ['CANCELADO', 'CONTRATO']

const TIPOS_PERSONA = {
  INQUILINO:         'Inquilino / Arrendatario',
  OBLIGADO_SOLIDARIO:'Obligado Solidario',
  FIADOR:            'Fiador',
}

const LABEL_DOC = {
  INE_FRENTE:               'INE (frente)',
  INE_REVERSO:              'INE (reverso)',
  PASAPORTE:                'Pasaporte',
  COMPROBANTE_INGRESOS_1:   'Comprobante ingresos (mes 1)',
  COMPROBANTE_INGRESOS_2:   'Comprobante ingresos (mes 2)',
  COMPROBANTE_INGRESOS_3:   'Comprobante ingresos (mes 3)',
  COMPROBANTE_DOMICILIO:    'Comprobante de domicilio',
  ESCRITURA_INMUEBLE:       'Escritura inmueble en garantía',
  SOLICITUD_FIRMADA:        'Solicitud de arrendamiento firmada',
}

const ESTADO_DOC_COLOR = {
  PENDIENTE:  { bg: '#FEF3C7', text: '#92400E' },
  SUBIDO:     { bg: '#DBEAFE', text: '#1E40AF' },
  APROBADO:   { bg: '#D1FAE5', text: '#065F46' },
  RECHAZADO:  { bg: '#FEE2E2', text: '#991B1B' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const etapaInfo = (id) => ETAPAS.find(e => e.id === id) || ETAPAS[0]

const Badge = ({ etapa }) => {
  const info = etapaInfo(etapa)
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
      background: info.color + '22', color: info.color, border: `1px solid ${info.color}44`
    }}>{info.label}</span>
  )
}

// ─── Modal: Nuevo Prospecto ──────────────────────────────────────────────────
function ModalNuevoProspecto({ onClose, onSaved }) {
  const [form, setForm] = useState({
    nombre_negocio: '', renta_propuesta: '', notas: '',
    // primera persona (inquilino)
    persona_nombre: '', persona_email: '', persona_cel: '',
  })
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const guardar = async () => {
    if (!form.persona_nombre || !form.persona_email) {
      alert('Nombre y email del inquilino son obligatorios')
      return
    }
    setLoading(true)
    try {
      const { data: pros, error: e1 } = await supabase
        .from('prospectos')
        .insert({ nombre_negocio: form.nombre_negocio, renta_propuesta: form.renta_propuesta || null, notas: form.notas })
        .select().single()
      if (e1) throw e1

      const { error: e2 } = await supabase.from('prospecto_personas').insert({
        prospecto_id: pros.id,
        tipo: 'INQUILINO',
        nombre_completo: form.persona_nombre,
        email: form.persona_email,
        cel: form.persona_cel,
      })
      if (e2) throw e2

      onSaved()
      onClose()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'#0006', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'white', borderRadius:12, width:500, padding:28, boxShadow:'0 20px 60px #0003' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h3 style={{ margin:0, fontSize:17, fontWeight:700 }}>Nuevo Prospecto</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#9CA3AF' }}>×</button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Nombre / Giro del negocio</label>
            <input value={form.nombre_negocio} onChange={e => set('nombre_negocio', e.target.value)}
              style={inputStyle} placeholder="Ej: Farmacia del Ahorro, Locutorio, etc." />
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Renta propuesta ($)</label>
            <input type="number" value={form.renta_propuesta} onChange={e => set('renta_propuesta', e.target.value)}
              style={inputStyle} placeholder="0.00" />
          </div>

          <div style={{ borderTop:'1px solid #E5E7EB', paddingTop:12, marginTop:4 }}>
            <p style={{ fontSize:12, fontWeight:700, color:'#0A66C2', margin:'0 0 10px' }}>DATOS DEL INQUILINO PRINCIPAL</p>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <input value={form.persona_nombre} onChange={e => set('persona_nombre', e.target.value)}
                style={inputStyle} placeholder="Nombre completo *" />
              <input type="email" value={form.persona_email} onChange={e => set('persona_email', e.target.value)}
                style={inputStyle} placeholder="Correo electrónico *" />
              <input value={form.persona_cel} onChange={e => set('persona_cel', e.target.value)}
                style={inputStyle} placeholder="Celular" />
            </div>
          </div>

          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Notas</label>
            <textarea value={form.notas} onChange={e => set('notas', e.target.value)}
              style={{ ...inputStyle, height:70, resize:'vertical' }} placeholder="Observaciones iniciales..." />
          </div>
        </div>

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:20 }}>
          <button onClick={onClose} style={btnSecundario}>Cancelar</button>
          <button onClick={guardar} disabled={loading} style={btnPrimario}>
            {loading ? 'Guardando...' : 'Crear Prospecto'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Panel de detalle del prospecto ──────────────────────────────────────────
async function extraerDatosDoc(url, tipo_doc) {
  const resp = await fetch('/.netlify/functions/extraer-documento', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, tipo_doc }),
  })
  const json = await resp.json()
  if (!resp.ok || !json.ok) throw new Error(json.error || 'Error de extracción')
  return json.datos
}

// Mapa de campos extraídos → columnas de prospecto_personas
const MAPA_CAMPOS = {
  nombre_completo:    'nombre_completo',
  curp:               'curp',
  rfc:                'rfc',
  calle:              'calle',
  no_ext:             'no_ext',
  no_int:             'no_int',
  colonia:            'colonia',
  municipio:          'municipio',
  estado:             'estado_domicilio',
  cp:                 'cp',
  // desde comprobante domicilio
  colonia_ine:        'colonia',
  municipio_ine:      'municipio',
  estado_ine:         'estado_domicilio',
  cp_ine:             'cp',
  // desde ingresos
  empresa_patron:     'empresa',
  puesto:             'puesto',
  ingreso_mensual_neto: 'ingreso_mensual',
  // desde escritura (fiador)
  ubicacion_inmueble: 'garantia_calle',
  colonia_escritura:  'garantia_colonia',
  municipio_escritura:'garantia_municipio',
  estado_escritura:   'garantia_estado',
  numero_escritura:   'escritura_no',
  notario:            'escritura_notario',
  fecha_escritura:    'escritura_fecha',
}

function PanelDetalle({ prospecto, onClose, onRefresh, onMagicLink }) {
  const [personas, setPersonas] = useState([])
  const [docs, setDocs] = useState([])
  const [tab, setTab] = useState('personas')
  const [modalPersona, setModalPersona] = useState(false)
  const [enviandoLink, setEnviandoLink] = useState(null)
  const [modalDespacho, setModalDespacho] = useState(false)
  const [modalContrato, setModalContrato] = useState(false)
  const [extrayendo, setExtrayendo] = useState(null)    // doc.id
  const [extractResult, setExtractResult] = useState(null) // { personaId, datos, docId }
  const [modalSolicitud, setModalSolicitud] = useState(null) // persona object

  const cargar = useCallback(async () => {
    const { data: p } = await supabase.from('prospecto_personas')
      .select('*').eq('prospecto_id', prospecto.id).order('tipo')
    setPersonas(p || [])

    if (p?.length) {
      const ids = p.map(x => x.id)
      const { data: d } = await supabase.from('prospecto_documentos')
        .select('*').in('persona_id', ids).order('tipo_doc')
      setDocs(d || [])
    }
  }, [prospecto.id])

  useEffect(() => { cargar() }, [cargar])

  const avanzarEtapa = async (nueva) => {
    await supabase.from('prospectos').update({ etapa: nueva, updated_at: new Date().toISOString() }).eq('id', prospecto.id)
    await supabase.from('prospecto_historial').insert({ prospecto_id: prospecto.id, etapa_anterior: prospecto.etapa, etapa_nueva: nueva })
    onRefresh()
  }

  const aprobarDoc = async (docId) => {
    await supabase.from('prospecto_documentos').update({ estado: 'APROBADO', revisado_at: new Date().toISOString() }).eq('id', docId)
    cargar()
  }

  const rechazarDoc = async (docId) => {
    const nota = prompt('Motivo del rechazo:')
    if (!nota) return
    await supabase.from('prospecto_documentos').update({ estado: 'RECHAZADO', nota_rechazo: nota, revisado_at: new Date().toISOString() }).eq('id', docId)
    cargar()
  }

  const enviarMagicLink = async (persona) => {
    setEnviandoLink(persona.id)
    try {
      const { data: link, error } = await supabase.from('prospecto_magic_links').insert({
        persona_id: persona.id,
        email_destino: persona.email,
      }).select().single()
      if (error) throw error
      const url = `${import.meta.env.VITE_APP_URL}/portal/prospecto/${link.token}`
      onMagicLink({ url, persona })
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setEnviandoLink(null)
    }
  }

  const docsPersona = (personaId) => docs.filter(d => d.persona_id === personaId)

  const handleExtraer = async (doc) => {
    if (!doc.storage_path) return
    setExtrayendo(doc.id)
    try {
      const url = await urlFirmada('prospecto-docs', doc.storage_path)
      if (!url) throw new Error('No se pudo acceder al archivo')
      const datos = await extraerDatosDoc(url, doc.tipo_doc)
      setExtractResult({ personaId: doc.persona_id, datos, docId: doc.id, tipo_doc: doc.tipo_doc })
    } catch (err) {
      alert('Error al extraer: ' + err.message)
    } finally {
      setExtrayendo(null)
    }
  }

  const handleAplicarDatos = async (personaId, camposSeleccionados) => {
    const payload = {}
    Object.entries(camposSeleccionados).forEach(([campo, valor]) => {
      const col = MAPA_CAMPOS[campo] || campo
      if (valor !== null && valor !== undefined && valor !== '') payload[col] = String(valor)
    })
    if (Object.keys(payload).length === 0) { setExtractResult(null); return }
    await supabase.from('prospecto_personas').update(payload).eq('id', personaId)
    setExtractResult(null)
    cargar()
  }

  const etapaSig = () => {
    const idx = ETAPAS.findIndex(e => e.id === prospecto.etapa)
    return idx < ETAPAS.length - 2 ? ETAPAS[idx + 1] : null
  }
  const siguiente = etapaSig()

  return (
    <div style={{ position:'fixed', inset:0, background:'#0006', zIndex:1000, display:'flex', justifyContent:'flex-end' }}>
      <div style={{ background:'white', width:700, height:'100%', overflow:'auto', boxShadow:'-4px 0 30px #0002' }}>
        {/* Header */}
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:12, color:'#6B7280', fontWeight:600, marginBottom:4 }}>
              {prospecto.folio || `PROS-${prospecto.id.substr(0,8)}`}
            </div>
            <h2 style={{ margin:'0 0 6px', fontSize:20, fontWeight:800 }}>{prospecto.nombre_negocio || 'Sin nombre'}</h2>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <Badge etapa={prospecto.etapa} />
              {prospecto.renta_propuesta && (
                <span style={{ fontSize:13, color:'#057642', fontWeight:700 }}>
                  ${Number(prospecto.renta_propuesta).toLocaleString('es-MX')} / mes
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#9CA3AF' }}>×</button>
        </div>

        {/* Pipeline visual */}
        <div style={{ padding:'12px 24px', background:'#F8FAFC', borderBottom:'1px solid #E5E7EB', display:'flex', gap:4, flexWrap:'wrap' }}>
          {ETAPAS.filter(e => e.id !== 'RECHAZADO').map((e, i) => {
            const activa = e.id === prospecto.etapa
            const pasada = ETAPAS.findIndex(x => x.id === prospecto.etapa) > i
            return (
              <div key={e.id} style={{ display:'flex', alignItems:'center', gap:4 }}>
                <div style={{
                  padding:'4px 10px', borderRadius:99, fontSize:11, fontWeight:700,
                  background: activa ? e.color : pasada ? e.color + '33' : '#F3F4F6',
                  color: activa ? 'white' : pasada ? e.color : '#9CA3AF',
                }}>{e.label}</div>
                {i < ETAPAS.filter(e => e.id !== 'RECHAZADO').length - 1 && (
                  <span style={{ color:'#D1D5DB', fontSize:10 }}>›</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'2px solid #E5E7EB', padding:'0 24px' }}>
          {[['personas','Personas'], ['documentos','Documentos'], ['notas','Historial']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              background:'none', border:'none', padding:'12px 16px', fontSize:13, fontWeight:700, cursor:'pointer',
              color: tab === id ? '#0A66C2' : '#6B7280',
              borderBottom: tab === id ? '2px solid #0A66C2' : '2px solid transparent',
              marginBottom: -2,
            }}>{label}</button>
          ))}
        </div>

        <div style={{ padding:24 }}>
          {/* ── TAB: Personas ── */}
          {tab === 'personas' && (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
                <h4 style={{ margin:0, fontSize:15, fontWeight:700 }}>Personas del expediente</h4>
                <button onClick={() => setModalPersona(true)} style={btnPrimario}>+ Agregar persona</button>
              </div>
              {personas.length === 0 && <p style={{ color:'#9CA3AF', textAlign:'center', marginTop:40 }}>Sin personas registradas</p>}
              {personas.map(p => {
                const dsp = docsPersona(p.id)
                const aprobados = dsp.filter(d => d.estado === 'APROBADO').length
                const subidos   = dsp.filter(d => d.estado === 'SUBIDO').length
                const pendientes= dsp.filter(d => d.estado === 'PENDIENTE').length
                const pct = dsp.length ? Math.round((aprobados / dsp.length) * 100) : 0
                return (
                  <div key={p.id} style={{ border:'1px solid #E5E7EB', borderRadius:10, padding:16, marginBottom:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:700, color:'#0A66C2', marginBottom:2 }}>
                          {TIPOS_PERSONA[p.tipo]}
                        </div>
                        <div style={{ fontSize:15, fontWeight:700 }}>{p.nombre_completo || '(sin nombre)'}</div>
                        <div style={{ fontSize:12, color:'#6B7280' }}>{p.email} {p.cel ? `· ${p.cel}` : ''}</div>
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        <button
                          onClick={() => setModalSolicitud(p)}
                          style={{ ...btnPrimario, fontSize:11, padding:'5px 12px', background:'#7C3AED' }}>
                          📋 Solicitud
                        </button>
                        <button
                          onClick={() => enviarMagicLink(p)}
                          disabled={!p.email || enviandoLink === p.id}
                          style={{ ...btnPrimario, fontSize:11, padding:'5px 12px' }}>
                          {enviandoLink === p.id ? 'Enviando...' : '📧 Enviar link'}
                        </button>
                      </div>
                    </div>
                    {/* Barra de progreso docs */}
                    <div style={{ marginTop:12 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#6B7280', marginBottom:4 }}>
                        <span>Documentos: {aprobados}/{dsp.length} aprobados</span>
                        <span>{pct}%</span>
                      </div>
                      <div style={{ height:6, background:'#E5E7EB', borderRadius:99, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background: pct === 100 ? '#057642' : '#0A66C2', borderRadius:99 }} />
                      </div>
                      <div style={{ display:'flex', gap:8, marginTop:6, fontSize:11 }}>
                        {pendientes > 0 && <span style={{ color:'#F59E0B', fontWeight:600 }}>⏳ {pendientes} pendientes</span>}
                        {subidos   > 0 && <span style={{ color:'#0A66C2', fontWeight:600 }}>📎 {subidos} por revisar</span>}
                        {aprobados > 0 && <span style={{ color:'#057642', fontWeight:600 }}>✓ {aprobados} aprobados</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── TAB: Documentos ── */}
          {tab === 'documentos' && (
            <div>
              <h4 style={{ margin:'0 0 16px', fontSize:15, fontWeight:700 }}>Revisión de documentos</h4>
              {personas.map(p => (
                <div key={p.id} style={{ marginBottom:24 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:'#0A66C2', marginBottom:8, textTransform:'uppercase', letterSpacing:0.5 }}>
                    {TIPOS_PERSONA[p.tipo]} — {p.nombre_completo || p.email}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {docsPersona(p.id).map(doc => {
                      const col = ESTADO_DOC_COLOR[doc.estado] || ESTADO_DOC_COLOR.PENDIENTE
                      return (
                        <div key={doc.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', borderRadius:8, border:'1px solid #E5E7EB' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <span style={{ fontSize:16 }}>
                              {doc.estado === 'APROBADO' ? '✅' : doc.estado === 'RECHAZADO' ? '❌' : doc.estado === 'SUBIDO' ? '📎' : '⬜'}
                            </span>
                            <div>
                              <div style={{ fontSize:13, fontWeight:600 }}>{LABEL_DOC[doc.tipo_doc]}</div>
                              {doc.nota_rechazo && <div style={{ fontSize:11, color:'#B24020' }}>↳ {doc.nota_rechazo}</div>}
                              {doc.nombre_archivo && <div style={{ fontSize:11, color:'#6B7280' }}>{doc.nombre_archivo}</div>}
                            </div>
                          </div>
                          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                            <span style={{ padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:700, background: col.bg, color: col.text }}>
                              {doc.estado}
                            </span>
                            {doc.estado === 'SUBIDO' && (
                              <>
                                <button onClick={() => aprobarDoc(doc.id)} style={{ ...btnMini, background:'#D1FAE5', color:'#065F46' }}>✓ Aprobar</button>
                                <button onClick={() => rechazarDoc(doc.id)} style={{ ...btnMini, background:'#FEE2E2', color:'#991B1B' }}>✗ Rechazar</button>
                              </>
                            )}
                            {doc.storage_path && (
                              <>
                                <button
                                  onClick={async () => {
                                    const url = await urlFirmada('prospecto-docs', doc.storage_path)
                                    if (url) window.open(url, '_blank', 'noopener')
                                    else alert('No se pudo abrir el documento')
                                  }}
                                  style={{ ...btnMini, background:'#EFF6FF', color:'#0A66C2' }}>Ver</button>
                                {doc.mime_type?.startsWith('image/') && (
                                  <button
                                    onClick={() => handleExtraer(doc)}
                                    disabled={extrayendo === doc.id}
                                    title="Extraer datos con IA"
                                    style={{ ...btnMini, background: extrayendo === doc.id ? '#F3F4F6' : '#F5F3FF', color: extrayendo === doc.id ? '#9CA3AF' : '#7C3AED', whiteSpace:'nowrap' }}>
                                    {extrayendo === doc.id ? '⏳ Extrayendo...' : '✦ Extraer datos'}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── TAB: Historial ── */}
          {tab === 'notas' && (
            <div>
              <h4 style={{ margin:'0 0 16px', fontSize:15, fontWeight:700 }}>Historial de etapas</h4>
              <HistorialProspecto prospectoId={prospecto.id} />
              {prospecto.notas && (
                <div style={{ marginTop:16, padding:12, background:'#F8FAFC', borderRadius:8, border:'1px solid #E5E7EB' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', marginBottom:4 }}>NOTAS</div>
                  <p style={{ margin:0, fontSize:13 }}>{prospecto.notas}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — acciones de etapa */}
        <div style={{ borderTop:'1px solid #E5E7EB', padding:'16px 24px', display:'flex', gap:8, justifyContent:'space-between', flexWrap:'wrap' }}>
          <div style={{ display:'flex', gap:8 }}>
            {prospecto.etapa === 'RECHAZADO' ? (
              <button onClick={() => avanzarEtapa('CONTACTO')} style={{ ...btnSecundario, color:'#0A66C2', borderColor:'#BFDBFE' }}>
                ↺ Reactivar prospecto
              </button>
            ) : (
              <button onClick={() => { const m = prompt('Motivo del rechazo (requerido):'); if (m) avanzarEtapa('RECHAZADO') }}
                style={{ ...btnSecundario, color:'#B24020', borderColor:'#FECACA' }}>
                Rechazar
              </button>
            )}
            {/* Botón Enviar a Despacho — disponible desde APROBADO */}
            {['APROBADO', 'INVESTIGACION', 'DOCS_COMPLETOS'].includes(prospecto.etapa) && (
              <button onClick={() => setModalDespacho(true)}
                style={{ ...btnSecundario, color:'#7C3AED', borderColor:'#DDD6FE', display:'flex', alignItems:'center', gap:6 }}>
                ⚖ Enviar a despacho
              </button>
            )}
            {/* Indicador si ya tiene despacho asignado */}
            {prospecto.ruta_elaboracion === 'DESPACHO' && (
              <span style={{ padding:'6px 12px', background:'#F5F3FF', color:'#7C3AED', borderRadius:8, fontSize:12, fontWeight:700 }}>
                ⚖ Ruta: Despacho
              </span>
            )}
          </div>
          {/* CTA especial cuando el candidato es APROBADO → abre modal inline */}
          {prospecto.etapa === 'APROBADO' && (
            <button
              onClick={() => setModalContrato(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', background: '#057642', color: 'white',
                border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14,
                cursor: 'pointer', boxShadow: '0 2px 8px rgba(5,118,66,0.3)',
              }}>
              📋 Crear Contrato →
            </button>
          )}
          {siguiente && prospecto.etapa !== 'RECHAZADO' && prospecto.etapa !== 'APROBADO' && (
            <button onClick={() => avanzarEtapa(siguiente.id)} style={btnPrimario}>
              Avanzar a {siguiente.label} →
            </button>
          )}
        </div>
      </div>

      {modalPersona && (
        <ModalAgregarPersona prospectoId={prospecto.id} onClose={() => setModalPersona(false)} onSaved={cargar} />
      )}
      {modalDespacho && (
        <ModalEnviarDespacho
          prospecto={prospecto}
          personas={personas}
          docs={docs}
          onClose={() => setModalDespacho(false)}
          onDone={() => { setModalDespacho(false); onRefresh() }}
        />
      )}
      {modalSolicitud && (
        <ModalSolicitudPersona
          persona={modalSolicitud}
          onClose={() => setModalSolicitud(null)}
          onSaved={() => { setModalSolicitud(null); cargar() }}
        />
      )}
      {extractResult && (
        <ModalDatosExtraidos
          resultado={extractResult}
          personas={personas}
          onAplicar={handleAplicarDatos}
          onClose={() => setExtractResult(null)}
        />
      )}
      {modalContrato && (
        <NuevoContratoModal
          fromProspecto={{ nombre: prospecto.nombre_negocio || '', renta: prospecto.renta_propuesta || '' }}
          onClose={() => setModalContrato(false)}
          onCreated={async () => {
            await avanzarEtapa('CONTRATO')
            setModalContrato(false)
            onRefresh()
          }}
        />
      )}
    </div>
  )
}

// ─── Modal: Agregar Persona ──────────────────────────────────────────────────
function ModalAgregarPersona({ prospectoId, onClose, onSaved }) {
  const [tipo, setTipo] = useState('FIADOR')
  const [form, setForm] = useState({ nombre_completo:'', email:'', cel:'', rfc:'', curp:'' })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const guardar = async () => {
    if (!form.nombre_completo || !form.email) { alert('Nombre y email obligatorios'); return }
    setLoading(true)
    try {
      const { error } = await supabase.from('prospecto_personas').insert({ prospecto_id: prospectoId, tipo, ...form })
      if (error) throw error
      onSaved(); onClose()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'#0005', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'white', borderRadius:12, width:420, padding:24 }}>
        <h3 style={{ margin:'0 0 16px', fontSize:16, fontWeight:700 }}>Agregar Persona</h3>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div>
            <label style={labelStyle}>Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)} style={inputStyle}>
              {Object.entries(TIPOS_PERSONA).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <input style={inputStyle} placeholder="Nombre completo *" value={form.nombre_completo} onChange={e => set('nombre_completo', e.target.value)} />
          <input style={inputStyle} placeholder="Email *" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
          <input style={inputStyle} placeholder="Celular" value={form.cel} onChange={e => set('cel', e.target.value)} />
          <input style={inputStyle} placeholder="RFC" value={form.rfc} onChange={e => set('rfc', e.target.value)} />
          <input style={inputStyle} placeholder="CURP" value={form.curp} onChange={e => set('curp', e.target.value)} />
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
          <button onClick={onClose} style={btnSecundario}>Cancelar</button>
          <button onClick={guardar} disabled={loading} style={btnPrimario}>{loading ? 'Guardando...' : 'Agregar'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Datos Extraídos por IA ───────────────────────────────────────────
const LABEL_CAMPO = {
  nombre_completo:'Nombre completo', curp:'CURP', rfc:'RFC',
  calle:'Calle', no_ext:'No. exterior', no_int:'No. interior',
  colonia:'Colonia', colonia_ine:'Colonia (INE)', municipio:'Municipio', municipio_ine:'Municipio (INE)',
  estado:'Estado', estado_ine:'Estado (INE)', cp:'CP', cp_ine:'CP (INE)',
  empresa_patron:'Empresa / Patrón', puesto:'Puesto',
  ingreso_mensual_neto:'Ingreso mensual neto',
  ubicacion_inmueble:'Domicilio inmueble garantía',
  numero_escritura:'No. escritura', notario:'Notario', fecha_escritura:'Fecha escritura',
  tipo_documento:'Tipo de documento', periodo:'Periodo', vigencia:'Vigencia INE',
  nombre_titular:'Nombre titular', tipo_servicio:'Tipo servicio',
  propietario:'Propietario', superficie_m2:'Superficie m²',
}

function ModalDatosExtraidos({ resultado, personas, onAplicar, onClose }) {
  const { personaId, datos, tipo_doc } = resultado
  const persona = personas.find(p => p.id === personaId)

  // Filtrar solo campos con valor
  const camposConValor = Object.entries(datos).filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object')

  const [seleccionados, setSeleccionados] = useState(() => {
    const init = {}
    camposConValor.forEach(([k]) => { init[k] = true })
    return init
  })

  const toggle = (k) => setSeleccionados(s => ({ ...s, [k]: !s[k] }))

  const camposAplicar = Object.fromEntries(
    camposConValor.filter(([k]) => seleccionados[k])
  )

  const TIPO_LABEL_DOC = {
    INE_FRENTE:'INE (frente)', INE_REVERSO:'INE (reverso)',
    COMPROBANTE_DOMICILIO:'Comprobante de domicilio',
    COMPROBANTE_INGRESOS_1:'Comprobante ingresos',
    ESCRITURA_INMUEBLE:'Escritura inmueble',
    DEFAULT:'Documento',
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'#0008', zIndex:1400, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:14, width:'100%', maxWidth:560, maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 60px #0004' }}>

        <div style={{ padding:'20px 24px', borderBottom:'1px solid #E5E7EB' }}>
          <div style={{ fontSize:11, color:'#7C3AED', fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>
            ✦ Extracción con IA — {TIPO_LABEL_DOC[tipo_doc] || tipo_doc}
          </div>
          <h3 style={{ margin:'4px 0 0', fontSize:17, fontWeight:800, color:'var(--color-primary)' }}>
            Datos detectados · {persona?.nombre_completo || 'Persona'}
          </h3>
          <p style={{ margin:'4px 0 0', fontSize:12, color:'#6B7280' }}>
            Selecciona los campos que deseas aplicar al expediente. Revisa antes de confirmar.
          </p>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
          {camposConValor.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px', color:'#9CA3AF' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
              <p>No se pudieron extraer datos legibles de este documento.</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                <button onClick={() => { const s={}; camposConValor.forEach(([k])=>{s[k]=true}); setSeleccionados(s) }}
                  style={{ ...btnMini, background:'#EFF6FF', color:'#0A66C2' }}>Seleccionar todo</button>
                <button onClick={() => setSeleccionados({})}
                  style={{ ...btnMini, background:'#F3F4F6', color:'#6B7280' }}>Limpiar</button>
              </div>
              {camposConValor.map(([campo, valor]) => (
                <label key={campo} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px', borderRadius:8, border:`1.5px solid ${seleccionados[campo] ? '#7C3AED' : '#E5E7EB'}`, background: seleccionados[campo] ? '#F5F3FF' : 'white', cursor:'pointer', transition:'all 0.15s' }}>
                  <input type="checkbox" checked={!!seleccionados[campo]} onChange={() => toggle(campo)}
                    style={{ marginTop:2, accentColor:'#7C3AED' }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', marginBottom:2 }}>
                      {LABEL_CAMPO[campo] || campo}
                    </div>
                    <div style={{ fontSize:14, fontWeight:600, color:'#111827' }}>{String(valor)}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding:'16px 24px', borderTop:'1px solid #E5E7EB', display:'flex', gap:8 }}>
          <button
            onClick={() => onAplicar(personaId, camposAplicar)}
            disabled={Object.keys(camposAplicar).length === 0}
            style={{ flex:1, padding:'11px', background: Object.keys(camposAplicar).length === 0 ? '#E5E7EB' : '#7C3AED', color: Object.keys(camposAplicar).length === 0 ? '#9CA3AF' : 'white', border:'none', borderRadius:8, fontWeight:700, fontSize:14, cursor: Object.keys(camposAplicar).length > 0 ? 'pointer' : 'default' }}>
            Aplicar {Object.keys(camposAplicar).length} campo{Object.keys(camposAplicar).length !== 1 ? 's' : ''}
          </button>
          <button onClick={onClose} style={{ padding:'11px 16px', background:'#F3F4F6', border:'none', borderRadius:8, fontWeight:600, fontSize:13, cursor:'pointer' }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Generador Formato de Investigación PDF ──────────────────────────────────
function generarFormatoInvestigacion(prospecto, personas, docs, despacho) {
  const fecha = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' })

  const LABEL_DOC = {
    INE_FRENTE:'INE (frente)', INE_REVERSO:'INE (reverso)', PASAPORTE:'Pasaporte',
    COMPROBANTE_INGRESOS_1:'Comprobante ingresos mes 1', COMPROBANTE_INGRESOS_2:'Comprobante ingresos mes 2',
    COMPROBANTE_INGRESOS_3:'Comprobante ingresos mes 3', COMPROBANTE_DOMICILIO:'Comprobante de domicilio',
    ESCRITURA_INMUEBLE:'Escritura inmueble en garantía', SOLICITUD_FIRMADA:'Solicitud firmada',
  }
  const TIPO_LABEL = { INQUILINO:'Arrendatario / Inquilino', OBLIGADO_SOLIDARIO:'Obligado Solidario', FIADOR:'Fiador / Aval' }

  const seccionPersona = (p) => {
    const dp = docs.filter(d => d.persona_id === p.id)
    const docsHtml = dp.map(d => `
      <tr>
        <td style="padding:5px 8px;border:1px solid #ddd;font-size:12px">${LABEL_DOC[d.tipo_doc] || d.tipo_doc}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;font-size:12px;text-align:center">
          <span style="color:${d.estado==='APROBADO'?'#057642':d.estado==='SUBIDO'?'#0A66C2':'#B45309'};font-weight:700">${d.estado}</span>
        </td>
      </tr>`).join('')

    return `
      <div style="margin-bottom:24px;page-break-inside:avoid">
        <div style="background:#0A66C2;color:white;padding:8px 14px;border-radius:6px 6px 0 0;font-weight:700;font-size:13px">
          ${TIPO_LABEL[p.tipo] || p.tipo} — ${p.nombre_completo || p.email}
        </div>
        <div style="border:1px solid #0A66C2;border-top:none;border-radius:0 0 6px 6px;padding:14px">
          <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
            <tr><td style="padding:4px 0;font-size:12px;width:140px;color:#666;font-weight:600">Nombre completo</td><td style="font-size:13px">${p.nombre_completo||'—'}</td>
                <td style="padding:4px 0;font-size:12px;width:140px;color:#666;font-weight:600">RFC</td><td style="font-size:13px">${p.rfc||'—'}</td></tr>
            <tr><td style="padding:4px 0;font-size:12px;color:#666;font-weight:600">CURP</td><td style="font-size:13px">${p.curp||'—'}</td>
                <td style="padding:4px 0;font-size:12px;color:#666;font-weight:600">Correo</td><td style="font-size:13px">${p.email||'—'}</td></tr>
            <tr><td style="padding:4px 0;font-size:12px;color:#666;font-weight:600">Celular</td><td style="font-size:13px">${p.cel||'—'}</td>
                <td style="padding:4px 0;font-size:12px;color:#666;font-weight:600">Empresa / Puesto</td><td style="font-size:13px">${p.empresa?`${p.empresa} · ${p.puesto||''}`:p.puesto||'—'}</td></tr>
            <tr><td style="padding:4px 0;font-size:12px;color:#666;font-weight:600">Ingreso mensual</td><td style="font-size:13px">${p.ingreso_mensual?`$${Number(p.ingreso_mensual).toLocaleString('es-MX')}`:'—'}</td>
                <td style="padding:4px 0;font-size:12px;color:#666;font-weight:600">Domicilio</td><td style="font-size:13px">${[p.calle,p.no_ext?`#${p.no_ext}`:'',p.colonia,p.municipio,p.estado_domicilio,p.cp?`CP ${p.cp}`:''].filter(Boolean).join(', ')||'—'}</td></tr>
            ${p.tipo==='FIADOR'||p.tipo==='OBLIGADO_SOLIDARIO'?`
            <tr><td style="padding:4px 0;font-size:12px;color:#666;font-weight:600">Garantía / Inmueble</td><td colspan="3" style="font-size:13px">${[p.garantia_calle,p.garantia_colonia,p.garantia_municipio,p.garantia_estado].filter(Boolean).join(', ')||'—'}</td></tr>
            <tr><td style="padding:4px 0;font-size:12px;color:#666;font-weight:600">Escritura</td><td colspan="3" style="font-size:13px">${p.escritura_no?`No. ${p.escritura_no}, Notario ${p.escritura_notario||'—'}, ${p.escritura_fecha||''}`:' —'}</td></tr>
            `:''}
          </table>
          ${dp.length?`
          <div style="font-size:11px;font-weight:700;color:#666;margin-bottom:6px;text-transform:uppercase">Documentos</div>
          <table style="width:100%;border-collapse:collapse">
            <tr style="background:#F3F4F6"><th style="padding:5px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Documento</th><th style="padding:5px 8px;border:1px solid #ddd;font-size:11px">Estado</th></tr>
            ${docsHtml}
          </table>`:''}
        </div>
      </div>`
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Formato de Investigación — ${prospecto.nombre_negocio}</title>
  <style>
    * { font-family: Arial, Helvetica, sans-serif; box-sizing: border-box; }
    body { margin: 0; padding: 24px; color: #111; }
    @media print { body { padding: 12px; } @page { margin: 1.5cm; } }
  </style>
  </head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:14px;border-bottom:3px solid #0A66C2">
    <div>
      <div style="font-size:11px;font-weight:700;color:#0A66C2;text-transform:uppercase;letter-spacing:1px">Inmobiliaria Alcedines del Norte · Plaza IWOL</div>
      <h1 style="margin:4px 0;font-size:22px;color:#1A3C5E">FORMATO DE INVESTIGACIÓN</h1>
      <div style="font-size:13px;color:#374151">Expediente de arrendamiento — ${prospecto.nombre_negocio || 'Sin nombre'}</div>
    </div>
    <div style="text-align:right;font-size:12px;color:#6B7280">
      <div>Fecha: <strong>${fecha}</strong></div>
      <div>Folio: <strong>PROS-${prospecto.id?.substr(0,8)}</strong></div>
      ${prospecto.renta_propuesta?`<div>Renta propuesta: <strong>$${Number(prospecto.renta_propuesta).toLocaleString('es-MX')}/mes</strong></div>`:''}
    </div>
  </div>

  ${despacho?`
  <div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;padding:12px 16px;margin-bottom:20px">
    <div style="font-size:11px;font-weight:700;color:#7C3AED;text-transform:uppercase;margin-bottom:4px">Dirigido al Despacho Jurídico</div>
    <div style="font-size:15px;font-weight:700">${despacho.nombre}</div>
    ${despacho.titular?`<div style="font-size:13px;color:#374151">Attn: ${despacho.titular}</div>`:''}
    ${despacho.email?`<div style="font-size:12px;color:#6B7280">${despacho.email}</div>`:''}
  </div>`:''}

  <div style="margin-bottom:20px">
    ${personas.map(p => seccionPersona(p)).join('')}
  </div>

  <div style="margin-top:40px;border-top:1px solid #E5E7EB;padding-top:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px">
    <div style="text-align:center">
      <div style="border-top:1px solid #374151;padding-top:8px;font-size:12px;color:#374151">Administrador de la Plaza</div>
    </div>
    <div style="text-align:center">
      <div style="border-top:1px solid #374151;padding-top:8px;font-size:12px;color:#374151">Arrendatario</div>
    </div>
    <div style="text-align:center">
      <div style="border-top:1px solid #374151;padding-top:8px;font-size:12px;color:#374151">Fiador / Aval</div>
    </div>
  </div>

  <div style="margin-top:24px;font-size:10px;color:#9CA3AF;text-align:center">
    Documento generado por Petra — RANNIX Consulting · ${new Date().toISOString()}
  </div>
  </body></html>`

  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 500)
}

// ─── Modal: Enviar a Despacho ─────────────────────────────────────────────────
function ModalEnviarDespacho({ prospecto, personas, docs, onClose, onDone }) {
  const [despachos, setDespachos] = useState([])
  const [despachoId, setDespachoId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('cat_despachos').select('*').eq('activo', true).order('nombre')
      .then(({ data }) => setDespachos(data || []))
  }, [])

  const despachoSel = despachos.find(d => d.id === despachoId)

  const handleConfirmar = async () => {
    if (!despachoId) { alert('Selecciona un despacho'); return }
    setSaving(true)
    await supabase.from('prospectos').update({
      despacho_id: despachoId,
      ruta_elaboracion: 'DESPACHO',
      updated_at: new Date().toISOString(),
    }).eq('id', prospecto.id)
    generarFormatoInvestigacion(prospecto, personas, docs, despachoSel)
    setSaving(false)
    onDone()
    onClose()
  }

  const handleSoloFormato = () => {
    generarFormatoInvestigacion(prospecto, personas, docs, despachoSel)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'#0006', zIndex:1300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:14, width:'100%', maxWidth:500, padding:28, boxShadow:'0 20px 60px #0003' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:11, color:'#7C3AED', fontWeight:700, textTransform:'uppercase' }}>Ruta Despacho Jurídico</div>
            <h3 style={{ margin:'2px 0 0', fontSize:17, fontWeight:800 }}>Enviar expediente al despacho</h3>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#9CA3AF' }}>×</button>
        </div>

        <div style={{ background:'#F5F3FF', borderRadius:10, border:'1px solid #DDD6FE', padding:'12px 16px', marginBottom:20, fontSize:13, color:'#5B21B6' }}>
          El despacho elaborará el contrato. El administrador generará los pagarés en Petra una vez firmado.
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase' }}>
            Seleccionar despacho *
          </label>
          {despachos.length === 0 ? (
            <div style={{ padding:'12px', background:'#FEF3C7', borderRadius:8, fontSize:13, color:'#92400E' }}>
              No hay despachos registrados. <a href="/despachos" style={{ color:'#0A66C2', fontWeight:700 }}>Registrar despacho →</a>
            </div>
          ) : (
            <select value={despachoId} onChange={e => setDespachoId(e.target.value)}
              style={{ width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, outline:'none' }}>
              <option value="">— Seleccionar despacho —</option>
              {despachos.map(d => (
                <option key={d.id} value={d.id}>{d.nombre}{d.titular ? ` (${d.titular})` : ''}</option>
              ))}
            </select>
          )}
        </div>

        {despachoSel && (
          <div style={{ background:'#F9FAFB', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#374151', marginBottom:16 }}>
            {despachoSel.email && <div>✉ {despachoSel.email}</div>}
            {despachoSel.telefono && <div>📞 {despachoSel.telefono}</div>}
            {despachoSel.domicilio && <div>📍 {despachoSel.domicilio}</div>}
          </div>
        )}

        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:6, textTransform:'uppercase' }}>
            Formato de investigación
          </div>
          <div style={{ fontSize:12, color:'#6B7280', marginBottom:8 }}>
            Se generará un PDF con todos los datos del inquilino y aval/fiador para entregar al despacho.
            {personas.length === 0 && <span style={{ color:'#B45309', fontWeight:600 }}> ⚠ Sin personas en el expediente.</span>}
          </div>
          <button onClick={handleSoloFormato}
            style={{ padding:'7px 14px', background:'#F3F4F6', border:'1px solid #D1D5DB', borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer', color:'#374151' }}>
            Vista previa del formato →
          </button>
        </div>

        <div style={{ display:'flex', gap:8, paddingTop:16, borderTop:'1px solid #E5E7EB' }}>
          <button onClick={handleConfirmar} disabled={saving || !despachoId}
            style={{ flex:1, padding:'11px', background: !despachoId ? '#E5E7EB' : '#7C3AED', color: !despachoId ? '#9CA3AF' : 'white', border:'none', borderRadius:8, fontWeight:700, fontSize:14, cursor: despachoId ? 'pointer' : 'default' }}>
            {saving ? 'Guardando...' : 'Confirmar y generar formato'}
          </button>
          <button onClick={onClose} style={{ padding:'11px 16px', background:'#F3F4F6', border:'none', borderRadius:8, fontWeight:600, fontSize:13, cursor:'pointer' }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Historial de etapas ─────────────────────────────────────────────────────
function HistorialProspecto({ prospectoId }) {
  const [items, setItems] = useState([])
  useEffect(() => {
    supabase.from('prospecto_historial')
      .select('*').eq('prospecto_id', prospectoId).order('created_at', { ascending: false })
      .then(({ data }) => setItems(data || []))
  }, [prospectoId])

  if (!items.length) return <p style={{ color:'#9CA3AF', fontSize:13 }}>Sin cambios de etapa registrados.</p>

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {items.map(h => (
        <div key={h.id} style={{ display:'flex', gap:10, fontSize:12 }}>
          <span style={{ color:'#9CA3AF', whiteSpace:'nowrap' }}>{new Date(h.created_at).toLocaleDateString('es-MX')}</span>
          <span>
            {h.etapa_anterior && <><Badge etapa={h.etapa_anterior} /> → </>}
            <Badge etapa={h.etapa_nueva} />
          </span>
          {h.nota && <span style={{ color:'#6B7280' }}>— {h.nota}</span>}
        </div>
      ))}
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────
// ─── Modal: Compartir link (WhatsApp + Email + Copiar) ───────────────────────
function ModalCompartirLink({ link, onClose }) {
  const { url, persona } = link
  const [copiado, setCopiado] = useState(false)

  const nombre   = persona.nombre_completo || 'Estimado(a)'
  const primerNombre = nombre.split(' ')[0]

  const mensajeBase = `Hola ${primerNombre}, te envío el enlace para que subas tu documentación del proceso de arrendamiento. Tienes 7 días para completarla:\n${url}`

  const copiar = () => {
    navigator.clipboard.writeText(url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  const abrirWhatsApp = () => {
    const tel = (persona.cel || '').replace(/\D/g, '')
    const num = tel.startsWith('52') ? tel : `52${tel}`
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(mensajeBase)}`, '_blank')
  }

  const abrirEmail = () => {
    const asunto = 'Expediente de arrendamiento — sube tus documentos'
    const cuerpo = `${mensajeBase}\n\nEste enlace expira en 7 días.\nCualquier duda, comunícate con el administrador.`
    window.open(`mailto:${persona.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`, '_blank')
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'#0006', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:16, width:'100%', maxWidth:440, padding:28, boxShadow:'0 20px 60px #0003' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:800 }}>Enviar enlace al prospecto</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#9CA3AF' }}>×</button>
        </div>

        <div style={{ background:'#F8FAFC', borderRadius:10, padding:12, marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', marginBottom:4 }}>DESTINATARIO</div>
          <div style={{ fontWeight:700 }}>{persona.nombre_completo || '—'}</div>
          <div style={{ fontSize:12, color:'#6B7280' }}>
            {persona.email && <span>✉ {persona.email}</span>}
            {persona.email && persona.cel && <span> · </span>}
            {persona.cel && <span>📱 {persona.cel}</span>}
          </div>
        </div>

        <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', marginBottom:8 }}>ENVIAR POR</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
          {/* WhatsApp */}
          <button onClick={abrirWhatsApp} disabled={!persona.cel}
            style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:10, border:'none',
              cursor: persona.cel ? 'pointer' : 'not-allowed',
              background: persona.cel ? '#25D366' : '#E5E7EB', color: persona.cel ? 'white' : '#9CA3AF',
              fontSize:14, fontWeight:700, textAlign:'left' }}>
            <span style={{ fontSize:22 }}>💬</span>
            <div>
              <div>Enviar por WhatsApp</div>
              {!persona.cel && <div style={{ fontSize:11, fontWeight:400, opacity:0.8 }}>Sin número de celular registrado</div>}
            </div>
          </button>

          {/* Email */}
          <button onClick={abrirEmail} disabled={!persona.email}
            style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:10, border:'none',
              cursor: persona.email ? 'pointer' : 'not-allowed',
              background: persona.email ? '#0A66C2' : '#E5E7EB', color: persona.email ? 'white' : '#9CA3AF',
              fontSize:14, fontWeight:700, textAlign:'left' }}>
            <span style={{ fontSize:22 }}>✉️</span>
            <div>
              <div>Enviar por correo electrónico</div>
              {persona.email && <div style={{ fontSize:11, fontWeight:400, opacity:0.8 }}>{persona.email}</div>}
            </div>
          </button>
        </div>

        {/* Copiar link */}
        <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', marginBottom:6 }}>O COPIAR ENLACE</div>
        <div style={{ display:'flex', gap:8 }}>
          <input readOnly value={url}
            style={{ flex:1, padding:'8px 10px', borderRadius:8, border:'1.5px solid #E5E7EB', fontSize:11, color:'#6B7280', fontFamily:'monospace', background:'#F8FAFC', outline:'none' }} />
          <button onClick={copiar}
            style={{ padding:'8px 14px', borderRadius:8, border:'none', cursor:'pointer',
              background: copiado ? '#057642' : '#374151', color:'white', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}>
            {copiado ? '✓ Copiado' : 'Copiar'}
          </button>
        </div>

        <div style={{ fontSize:11, color:'#9CA3AF', marginTop:14, textAlign:'center' }}>
          El enlace expira en 7 días · El prospecto sube sus docs y los de su fiador/aval
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Editar Prospecto (etapa + notas) ─────────────────────────────────
function ModalEditarProspecto({ prospecto, onClose, onSaved }) {
  const [etapa, setEtapa]   = useState(prospecto._cancelar ? 'CANCELADO' : prospecto.etapa)
  const [notas, setNotas]   = useState(prospecto.notas || '')
  const [renta, setRenta]   = useState(prospecto.renta_propuesta || '')
  const [loading, setLoading] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(!!prospecto._cancelar)

  const guardar = async () => {
    if (etapa === 'CANCELADO' && !confirmCancel) {
      setConfirmCancel(true)
      return
    }
    setLoading(true)
    try {
      const prev = prospecto.etapa
      await supabase.from('prospectos').update({
        etapa,
        notas,
        renta_propuesta: renta || null,
        updated_at: new Date().toISOString(),
      }).eq('id', prospecto.id)
      if (prev !== etapa) {
        await supabase.from('prospecto_historial').insert({
          prospecto_id: prospecto.id,
          etapa_anterior: prev,
          etapa_nueva: etapa,
          nota: `Cambio manual desde edición`,
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'#0006', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:14, width:'100%', maxWidth:460, padding:28, boxShadow:'0 20px 60px #0003' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:11, color:'#0A66C2', fontWeight:700, textTransform:'uppercase' }}>Editar Prospecto</div>
            <h3 style={{ margin:'2px 0 0', fontSize:16, fontWeight:800 }}>{prospecto.nombre_negocio || 'Sin nombre'}</h3>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#9CA3AF' }}>×</button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={labelStyle}>Etapa</label>
            <select value={etapa} onChange={e => { setEtapa(e.target.value); setConfirmCancel(false) }}
              style={{ ...inputStyle, fontWeight:600 }}>
              {ETAPAS.map(e => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Renta propuesta ($)</label>
            <input type="number" value={renta} onChange={e => setRenta(e.target.value)}
              style={inputStyle} placeholder="0.00" />
          </div>
          <div>
            <label style={labelStyle}>Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              style={{ ...inputStyle, height:80, resize:'vertical' }} placeholder="Observaciones..." />
          </div>

          {confirmCancel && (
            <div style={{ background:'#FEE2E2', border:'1px solid #FECACA', borderRadius:8, padding:'12px 14px', fontSize:13, color:'#991B1B', fontWeight:600 }}>
              ⚠ ¿Confirmas cancelar este prospecto? No aparecerá en la lista activa. Puedes recuperarlo cambiando la etapa.
            </div>
          )}
        </div>

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:20 }}>
          <button onClick={onClose} style={btnSecundario}>Cancelar</button>
          <button onClick={guardar} disabled={loading}
            style={{ ...btnPrimario, background: confirmCancel ? '#B24020' : '#0A66C2' }}>
            {loading ? 'Guardando...' : confirmCancel ? '⚠ Confirmar cancelación' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Prospectos() {
  useModuleAudit('PROSPECTOS')
  const [prospectos, setProspectos] = useState([])
  const [loading, setLoading]       = useState(true)
  const [filtroEtapa, setFiltroEtapa] = useState('ALL')
  const [busqueda, setBusqueda]     = useState('')
  const [seleccionado, setSeleccionado] = useState(null)
  const [modalNuevo, setModalNuevo] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalLink, setModalLink]   = useState(null)
  const [modalEditar, setModalEditar] = useState(null)
  const [mostrarInactivos, setMostrarInactivos] = useState(false)
  const [confirmEliminar, setConfirmEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('prospectos')
      .select('*').order('created_at', { ascending: false })
    setProspectos(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar, refreshKey])

  const refresh = () => setRefreshKey(k => k + 1)

  const filtrados = prospectos.filter(p => {
    const matchEtapa = filtroEtapa === 'ALL' || p.etapa === filtroEtapa
    const matchBusq  = !busqueda || p.nombre_negocio?.toLowerCase().includes(busqueda.toLowerCase())
    const matchActivo = mostrarInactivos || !ETAPAS_INACTIVAS.includes(p.etapa)
    return matchEtapa && matchBusq && matchActivo
  })

  // KPIs
  const kpis = ETAPAS.reduce((acc, e) => {
    acc[e.id] = prospectos.filter(p => p.etapa === e.id).length
    return acc
  }, {})

  return (
    <div style={{ padding:24, fontFamily:'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ margin:0, fontSize:24, fontWeight:800 }}>Prospectos / CRM</h1>
          <p style={{ margin:'4px 0 0', fontSize:13, color:'#6B7280' }}>
            Pipeline de arrendamiento — {prospectos.length} prospectos
          </p>
        </div>
        <button onClick={() => setModalNuevo(true)} style={btnPrimario}>+ Nuevo Prospecto</button>
      </div>

      {/* KPIs por etapa */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {ETAPAS.map(e => (
          <div key={e.id} onClick={() => setFiltroEtapa(filtroEtapa === e.id ? 'ALL' : e.id)}
            style={{ padding:'8px 14px', borderRadius:8, cursor:'pointer', border:`2px solid`, userSelect:'none',
              borderColor: filtroEtapa === e.id ? e.color : '#E5E7EB',
              background: filtroEtapa === e.id ? e.color + '15' : 'white',
            }}>
            <div style={{ fontSize:18, fontWeight:800, color: e.color }}>{kpis[e.id] || 0}</div>
            <div style={{ fontSize:10, color:'#6B7280', fontWeight:600 }}>{e.label}</div>
          </div>
        ))}
      </div>

      {/* Buscador + toggle inactivos */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        <input
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="🔍 Buscar por nombre / giro..."
          style={{ ...inputStyle, maxWidth:340 }}
        />
        <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:12, color:'#6B7280', fontWeight:600, userSelect:'none' }}>
          <input type="checkbox" checked={mostrarInactivos} onChange={e => setMostrarInactivos(e.target.checked)}
            style={{ accentColor:'#6B7280' }} />
          Mostrar cancelados / contratados
        </label>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#9CA3AF' }}>Cargando...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'#9CA3AF' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🏢</div>
          <p>Sin prospectos{filtroEtapa !== 'ALL' ? ' en esta etapa' : ''}.</p>
          <button onClick={() => setModalNuevo(true)} style={btnPrimario}>+ Crear el primero</button>
        </div>
      ) : (
        <div style={{ border:'1px solid #E5E7EB', borderRadius:10, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#F8FAFC' }}>
                {['Folio','Negocio / Local','Renta propuesta','Etapa','Fecha contacto','Acciones'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#374151', borderBottom:'1px solid #E5E7EB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < filtrados.length-1 ? '1px solid #E5E7EB' : 'none', cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  <td style={{ padding:'10px 14px', color:'#6B7280', fontFamily:'monospace', fontSize:11 }}>
                    {`PROS-${p.id.substr(0,8)}`}
                  </td>
                  <td style={{ padding:'10px 14px', fontWeight:600 }}>{p.nombre_negocio || '—'}</td>
                  <td style={{ padding:'10px 14px', color:'#057642', fontWeight:700 }}>
                    {p.renta_propuesta ? `$${Number(p.renta_propuesta).toLocaleString('es-MX')}` : '—'}
                  </td>
                  <td style={{ padding:'10px 14px' }}><Badge etapa={p.etapa} /></td>
                  <td style={{ padding:'10px 14px', color:'#6B7280' }}>
                    {new Date(p.fecha_contacto).toLocaleDateString('es-MX')}
                  </td>
                  <td style={{ padding:'8px 14px' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      <button onClick={e => { e.stopPropagation(); setSeleccionado(p) }}
                        style={{ ...btnMini, background:'#EFF6FF', color:'#0A66C2' }}>Ver</button>
                      <button onClick={e => { e.stopPropagation(); setModalEditar(p) }}
                        style={{ ...btnMini, background:'#F3F4F6', color:'#374151' }}>Editar</button>
                      {!ETAPAS_INACTIVAS.includes(p.etapa) && (
                        <button onClick={e => { e.stopPropagation(); setModalEditar({ ...p, _cancelar: true }) }}
                          style={{ ...btnMini, background:'#FEE2E2', color:'#B24020' }}>Cancelar</button>
                      )}
                      <button onClick={e => { e.stopPropagation(); setConfirmEliminar(p) }}
                        title="Eliminar permanentemente"
                        style={{ ...btnMini, background:'#1F2937', color:'white', minWidth:28, padding:'0 7px' }}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modales */}
      {modalNuevo && (
        <ModalNuevoProspecto onClose={() => setModalNuevo(false)} onSaved={refresh} />
      )}
      {seleccionado && (
        <PanelDetalle
          prospecto={prospectos.find(p => p.id === seleccionado.id) || seleccionado}
          onClose={() => setSeleccionado(null)}
          onRefresh={refresh}
          onMagicLink={setModalLink}
        />
      )}
      {modalLink && (
        <ModalCompartirLink link={modalLink} onClose={() => setModalLink(null)} />
      )}
      {modalEditar && (
        <ModalEditarProspecto
          prospecto={modalEditar}
          onClose={() => setModalEditar(null)}
          onSaved={refresh}
        />
      )}

      {/* Modal confirmación eliminar prospecto */}
      {confirmEliminar && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'white', borderRadius:14, padding:28, maxWidth:400, width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
              <div style={{ width:40, height:40, borderRadius:'50%', background:'#1F2937', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>🗑</div>
              <div>
                <div style={{ fontWeight:700, fontSize:16 }}>Eliminar prospecto</div>
                <div style={{ fontSize:12, color:'#6B7280' }}>PROS-{confirmEliminar.id.substr(0,8)}</div>
              </div>
            </div>
            <p style={{ fontSize:13, margin:'0 0 8px', lineHeight:1.5 }}>
              ¿Confirmas eliminar a <strong>{confirmEliminar.nombre_negocio}</strong>?
            </p>
            <p style={{ fontSize:12, color:'#B24020', margin:'0 0 24px', background:'#FFF5F5', padding:'10px 14px', borderRadius:8, border:'1px solid #FECACA' }}>
              Acción irreversible. Se eliminará el registro permanentemente.
            </p>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setConfirmEliminar(null)} disabled={eliminando}
                style={{ padding:'9px 20px', border:'1px solid #E5E7EB', borderRadius:8, background:'white', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                Cancelar
              </button>
              <button disabled={eliminando} onClick={async () => {
                setEliminando(true)
                await supabase.from('prospectos').delete().eq('id', confirmEliminar.id)
                logAudit({ modulo: 'PROSPECTOS', accion: 'ELIMINAR', entidad: 'prospecto', entidad_id: confirmEliminar.id, descripcion: `Prospecto eliminado: ${confirmEliminar.nombre || ''}` })
                setEliminando(false)
                setConfirmEliminar(null)
                refresh()
              }}
                style={{ padding:'9px 20px', border:'none', borderRadius:8, background:'#1F2937', color:'white', cursor: eliminando ? 'not-allowed' : 'pointer', fontSize:13, fontWeight:600, opacity: eliminando ? 0.7 : 1 }}>
                {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Estilos base ────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1.5px solid #E5E7EB', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
}
const labelStyle = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }
const btnPrimario = {
  padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: '#0A66C2', color: 'white', fontSize: 13, fontWeight: 700,
}
const btnSecundario = {
  padding: '8px 18px', borderRadius: 8, border: '1.5px solid #E5E7EB',
  cursor: 'pointer', background: 'white', color: '#374151', fontSize: 13, fontWeight: 600,
}
const btnMini = {
  padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontSize: 11, fontWeight: 700,
}
