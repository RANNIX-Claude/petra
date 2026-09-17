import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useModuleAudit, logAudit } from '../hooks/useAudit'
import { Plus, Search, X, Save, DollarSign, AlertCircle, Calendar, Pencil, Trash2, Image, CheckCircle2, Circle, Eye, FileText, Paperclip, Target, CalendarCheck, History, ExternalLink, ZoomIn, Layers, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { usePRP } from '../hooks/usePRP'
import { supabase, llamarFuncion, urlFirmada } from '../lib/supabase'

// estatus_operacion vive en la tabla; prp_contratos no lo expone todavía.
function useOperacion() {
  const [mapa, setMapa] = useState({})
  useEffect(() => {
    supabase.from('contratos').select('id, estatus_operacion').then(({ data }) => {
      setMapa(Object.fromEntries((data ?? []).map(x => [x.id, x.estatus_operacion])))
    })
  }, [])
  return mapa
}
import KPICard from '../components/ui/KPICard'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import { EnlacePrivado } from '../components/ui/ArchivoPrivado'
import NuevoCargoModal from '../components/ui/NuevoCargoModal'
import { useApp } from '../context/AppContext'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const TIPO_COLOR = { RENTA: 'var(--color-success)', SANCION: 'var(--color-danger)', AGUA: '#0284C7', OTRO: '#6B7280', MIXTO: '#7C3AED' }

// Clasificación del ingreso: a qué se aplicó el depósito. La deduce la base a
// partir de la distribución (un concepto = ese concepto, dos o más = MIXTO) y
// el usuario la puede sobrescribir. Es un dato distinto de `tipo`, que se dejó
// intacto porque EDR y ResumenSemanal reparten el dinero con él.
const CLASIFICACIONES = ['RENTA','SANCION','AGUA','OTRO','MIXTO']
// Los ingresos viejos sin distribución no tienen clasificación: se muestra su
// `tipo` para no dejar la columna en blanco.
const clasifDe = r => r.clasificacion || r.tipo

// El concepto del cargo y la clasificación del ingreso no son el mismo juego de
// valores: MANTENIMIENTO existe como cargo pero la clasificación cierra en cinco.
const clasifDeConcepto = c => (['RENTA','SANCION','AGUA'].includes(c) ? c : 'OTRO')

/** Misma regla que fn_clasificacion_desde_aplicaciones en la base. */
function clasificacionAutomatica(conceptos) {
  const unicos = [...new Set(conceptos.map(clasifDeConcepto))]
  if (unicos.length === 0) return null
  return unicos.length === 1 ? unicos[0] : 'MIXTO'
}

// Cada ingreso debe corresponder a un depósito, transferencia o entrega de
// efectivo real: VALIDADO es el que ya se cotejó contra el banco. OBSERVADO
// existe porque "revisado y no cuadra" no es lo mismo que "nadie lo ha visto".
const VALIDACION = {
  POR_VALIDAR: { label: 'Por validar', bg: '#FEF3C7', color: '#92400E' },
  VALIDADO:    { label: 'Validado',    bg: '#DCFCE7', color: '#166534' },
  OBSERVADO:   { label: 'Observado',   bg: '#FEE2E2', color: '#991B1B' },
}
const VALIDACION_DEFAULT = 'POR_VALIDAR'

/**
 * Cuadre del depósito contra lo que se repartió en la cartera.
 *
 * Tres situaciones, y las tres importan de forma distinta:
 *   - se aplicó de más  → hay cargos marcados como pagados sin dinero detrás
 *   - falta por aplicar → hay dinero cobrado que ningún cargo está saldando
 *   - cuadra            → el depósito está completamente repartido
 *
 * El descuadre va en rojo y con signo de admiración porque es lo que hay que
 * ver de un vistazo sin abrir renglón por renglón.
 */
function IconoCuadre({ d }) {
  if (!d) return (
    <span title="El depósito está repartido por completo"
      style={{ display:'inline-flex', color:'#A7D9BF' }}>
      <CheckCircle2 size={14} />
    </span>
  )
  const sobra = d.problema === 'SOBRE_APLICADO'
  const dif = Math.abs(parseFloat(d.diferencia) || 0)
  return (
    <span title={sobra
      ? `Se aplicaron ${fmt(dif)} de más: el depósito es de ${fmt(d.importe)} y se repartieron ${fmt(d.total_aplicado)}`
      : `Faltan ${fmt(dif)} por aplicar: el depósito es de ${fmt(d.importe)} y solo se repartieron ${fmt(d.total_aplicado)}`}
      style={{
        display:'inline-flex', alignItems:'center', gap:'3px', padding:'2px 7px', borderRadius:'10px',
        fontSize:'10.5px', fontWeight:700, fontVariantNumeric:'tabular-nums',
        background: sobra ? '#FEE2E2' : '#FEF3C7',
        color: sobra ? '#B24020' : '#92400E',
      }}>
      <AlertTriangle size={11} /> {sobra ? '+' : '−'}{fmt(dif)}
    </span>
  )
}

function BadgeValidacion({ estatus, size = 11 }) {
  const m = VALIDACION[estatus] || VALIDACION[VALIDACION_DEFAULT]
  return (
    <span style={{ display:'inline-block', fontSize:`${size}px`, fontWeight:600, padding:'2px 8px', borderRadius:'10px', background:m.bg, color:m.color, whiteSpace:'nowrap' }}>
      {m.label}
    </span>
  )
}

// ── Visor del comprobante ───────────────────────────────────────────────────
// No se usa el componente ImagenPrivada a propósito: ese componente pinta lo mismo
// mientras firma que cuando la firma falla, y para quien valida no es lo mismo
// "espérate" que "el archivo ya no está". Aquí se separan los dos casos, y
// además hay que resolver el PDF, que un <img> no sabe pintar.
const esPDF = v => /\.pdf(\?|$)/i.test(v || '')

function VisorComprobante({ valor, onAmpliar }) {
  const [url, setUrl] = useState(null)
  const [estado, setEstado] = useState('cargando') // cargando | listo | sin_archivo | ilegible

  useEffect(() => {
    if (!valor) { setEstado('sin_archivo'); return }
    let cancelado = false
    setEstado('cargando'); setUrl(null)
    urlFirmada('facturas-cfdi', valor).then(u => {
      if (cancelado) return
      if (u) { setUrl(u); setEstado('listo') } else { setEstado('sin_archivo') }
    })
    return () => { cancelado = true }
  }, [valor])

  const caja = (contenido, borde = '#E5E7EB', fondo = '#F9FAFB') => (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'8px',
      minHeight:'220px', padding:'24px', borderRadius:'10px', border:`1px solid ${borde}`, background:fondo, textAlign:'center' }}>
      {contenido}
    </div>
  )

  if (estado === 'cargando') {
    return caja(<>
      <LoadingSpinner />
      <span style={{ fontSize:'12px', color:'#6B7280' }}>Abriendo el comprobante…</span>
    </>)
  }

  if (estado === 'sin_archivo') {
    return caja(<>
      <AlertCircle size={20} style={{ color:'var(--color-danger)' }} />
      <span style={{ fontSize:'12px', fontWeight:700, color:'var(--color-danger)' }}>No se pudo abrir el archivo</span>
      <span style={{ fontSize:'11px', color:'#6B7280' }}>
        El ingreso tiene comprobante registrado, pero ya no está en el almacenamiento
        o tu usuario no tiene permiso de verlo. Vuelve a adjuntarlo desde Editar.
      </span>
    </>, '#FECACA', '#FEF2F2')
  }

  if (estado === 'ilegible') {
    return caja(<>
      <AlertCircle size={20} style={{ color:'#D97706' }} />
      <span style={{ fontSize:'12px', fontWeight:700, color:'#92400E' }}>El archivo no se puede mostrar</span>
      <span style={{ fontSize:'11px', color:'#6B7280' }}>Se descargó, pero no es una imagen válida.</span>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize:'11px', fontWeight:700, color:'var(--color-primary)' }}>Abrir en otra pestaña</a>
    </>, '#FDE68A', '#FFFBEB')
  }

  const accion = (children, onClick, href) => href
    ? <a href={href} target="_blank" rel="noopener noreferrer" style={ACCION_VISOR}>{children}</a>
    : <button type="button" onClick={onClick} style={{ ...ACCION_VISOR, border:'none', cursor:'pointer' }}>{children}</button>

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'8px', minHeight:0 }}>
      <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
        {!esPDF(valor) && accion(<><ZoomIn size={12} /> Ampliar</>, () => onAmpliar?.(url))}
        {accion(<><ExternalLink size={12} /> Abrir en otra pestaña</>, null, url)}
      </div>
      {esPDF(valor)
        // Un PDF no se pinta con <img>: se incrusta el visor del navegador, que
        // además trae su propio zoom y paginado.
        ? <iframe src={url} title="Comprobante en PDF"
            style={{ width:'100%', height:'62vh', border:'1px solid #E5E7EB', borderRadius:'10px', background:'#F9FAFB' }} />
        : <div style={{ overflow:'auto', maxHeight:'62vh', borderRadius:'10px', border:'1px solid #E5E7EB', background:'#F9FAFB' }}>
            <img src={url} alt="Comprobante de pago" onError={() => setEstado('ilegible')}
              onClick={() => onAmpliar?.(url)}
              title="Clic para ampliar"
              style={{ display:'block', width:'100%', height:'auto', cursor:'zoom-in' }} />
          </div>
      }
    </div>
  )
}

const ACCION_VISOR = {
  display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'11px', fontWeight:700,
  color:'var(--color-primary)', background:'#EFF6FF', padding:'4px 9px', borderRadius:'8px', textDecoration:'none',
}

function fmt(n) { return n != null ? '$' + parseFloat(n).toLocaleString('es-MX', { minimumFractionDigits: 0 }) : '—' }
function fmtK(n) { return '$' + ((n || 0) / 1000).toFixed(1) + 'K' }

// `fecha` llega como ISO; se compara por texto para no depender de la zona horaria
// del navegador, que es lo que ya se usa al pintarla en la tabla.
function mesDeFechaPago(r) { return r.fecha ? r.fecha.slice(0, 7) : null }

const BLANK = {
  fecha: new Date().toISOString().slice(0,10),
  contrato_id: '',
  tipo: 'RENTA',
  mes: new Date().getMonth() + 1,
  anio: new Date().getFullYear(),
  factura: '',
  importe: '',
  origen: 'TRANSFERENCIA BBVA',
  concepto_origen: '',
  nota: '',
  estatus_validacion: VALIDACION_DEFAULT,
  clasificacion: '',
}

// contratoFijo: precarga el contrato cuando se abre desde el expediente de un
// contrato específico (no hace falta buscarlo). cargoObjetivo: el cargo/cobro
// puntual que se está por pagar — precarga el importe con su saldo y, en
// cuanto cargan los cargos pendientes, lo deja ya aplicado.
export function IngresoModal({ ingreso = null, onClose, onSaved, contratoFijo = null, cargoObjetivo = null }) {
  const [form, setForm] = useState(ingreso ? {
    fecha:           ingreso.fecha ? ingreso.fecha.slice(0,10) : new Date().toISOString().slice(0,10),
    contrato_id:     ingreso.contrato_id || '',
    tipo:            ingreso.tipo || 'RENTA',
    mes:             ingreso.mes || new Date().getMonth() + 1,
    anio:            ingreso.anio || new Date().getFullYear(),
    factura:         ingreso.factura || '',
    importe:         ingreso.importe != null ? String(ingreso.importe) : '',
    origen:          ingreso.origen || 'TRANSFERENCIA BBVA',
    concepto_origen: ingreso.concepto_origen || '',
    nota:            ingreso.nota || '',
    estatus_validacion: ingreso.estatus_validacion || VALIDACION_DEFAULT,
    // '' = automática (la deduce la distribución). Solo se precarga un valor si
    // el usuario ya la había fijado a mano; si no, el combo queda en automática
    // aunque la fila traiga clasificación deducida.
    clasificacion:   ingreso.clasificacion_manual ? (ingreso.clasificacion || '') : '',
  } : {
    ...BLANK,
    contrato_id: contratoFijo || '',
    importe: cargoObjetivo ? String(parseFloat(cargoObjetivo.saldo ?? cargoObjetivo.monto_total ?? 0) || '') : '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [contratos, setContratos] = useState([])
  const [cargos, setCargos] = useState([])
  const [dist, setDist] = useState({})
  const [loadingCargos, setLoadingCargos] = useState(false)
  const [modalNuevoCargo, setModalNuevoCargo] = useState(false)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const [borrando, setBorrando] = useState(false)
  // Borrar el ingreso desde aquí mismo es una operación delicada (afecta
  // cartera y aplicaciones ya cuadradas): solo super_admin / admin_inmobiliaria
  // lo ven, y solo aplica editando uno ya existente (no al registrar uno nuevo).
  const { perfil, user } = useApp()
  const rolId = perfil?.rol_id || user?.user_metadata?.rol_id
  const puedeEliminar = !!ingreso && ['super_admin', 'admin_inmobiliaria'].includes(rolId)
  const [contratoSearch, setContratoSearch] = useState('')
  const [contratoOpen, setContratoOpen] = useState(false)
  const [compFile, setCompFile] = useState(null)
  const [compPreview, setCompPreview] = useState(ingreso?.comprobante_url || null)
  const fileRef = useRef()
  // Aplicaciones que este ingreso ya tenía guardadas. Se necesitan para saber
  // cuáles hay que BORRAR al guardar: si solo se hace upsert, las que el usuario
  // quitó de la distribución se quedan vivas y el pago acaba aplicado por más
  // de lo que valió.
  const [aplicacionesPrevias, setAplicacionesPrevias] = useState([])
  // Si el usuario ya movió el combo a mano, adjuntar un comprobante no lo pisa.
  const estatusTocado = useRef(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Totales de distribución
  const totalDist = Object.values(dist).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const importeTotal = parseFloat(form.importe) || 0
  const saldoLibre = importeTotal - totalDist
  const excede = saldoLibre < -0.01

  // El `saldo` de prp_cartera ya descuenta lo que este ingreso tiene aplicado.
  // Al editar hay que devolvérselo, o el cargo que este pago dejó en cero
  // aparecería con saldo 0 y tope 0 para su propio importe.
  const previoDeCargo = Object.fromEntries(aplicacionesPrevias.map(a => [a.cargo_id, parseFloat(a.importe_aplicado) || 0]))
  const disponibleDe = c => (parseFloat(c.saldo) || 0) + (previoDeCargo[c.id] || 0)

  useEffect(() => {
    supabase.from('prp_contratos')
      .select('id, folio, arrendatario_nombre, locales_display, renta_mensual, dia_pago')
      .order('locales_display', { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        // Ordenar: primero los que tienen local, luego el resto por nombre
        const sorted = (data || []).sort((a, b) => {
          if (a.locales_display && !b.locales_display) return -1
          if (!a.locales_display && b.locales_display) return 1
          return (a.locales_display || a.arrendatario_nombre || '').localeCompare(b.locales_display || b.arrendatario_nombre || '')
        })
        setContratos(sorted)
      })
  }, [])

  // Cargos pendientes del contrato + lo que este ingreso ya tenía aplicado.
  // Se extrae de un efecto a una función aparte para poder volver a llamarla
  // cuando se agrega un cobro nuevo (botón "+ Agregar cobro"), sin depender
  // de un cambio de contrato para refrescar la lista.
  const cargarCargos = useCallback(async () => {
    if (!form.contrato_id) { setCargos([]); setDist({}); setAplicacionesPrevias([]); return }
    setLoadingCargos(true)

    // 1. Distribución ya guardada de este ingreso.
    let previas = []
    if (ingreso?.id) {
      const { data, error } = await supabase.from('aplicaciones_pago')
        .select('cargo_id, importe_aplicado').eq('ingreso_id', ingreso.id)
      if (error) toast.error('No se pudo leer la distribución guardada: ' + error.message)
      previas = data ?? []
    }
    const previoDe = Object.fromEntries(previas.map(a => [a.cargo_id, String(a.importe_aplicado)]))

    // 2. Cargos que siguen debiendo algo.
    const { data: pendientes, error: errCargos } = await supabase.from('prp_cartera')
      .select('id, concepto, periodo_mes, periodo_anio, importe, saldo, estado')
      .eq('contrato_id', form.contrato_id)
      .in('estado', ['PENDIENTE', 'PARCIAL'])
    if (errCargos) toast.error('No se pudieron leer los cargos: ' + errCargos.message)
    let lista = pendientes ?? []

    // 3. Un cargo que este mismo ingreso dejó en PAGADO ya no sale como
    //    pendiente. Hay que traerlo igual o al guardar desaparecería su
    //    aplicación sin que el usuario lo pidiera.
    const faltantes = previas.map(a => a.cargo_id).filter(id => !lista.some(c => c.id === id))
    if (faltantes.length) {
      const { data: extra } = await supabase.from('prp_cartera')
        .select('id, concepto, periodo_mes, periodo_anio, importe, saldo, estado')
        .in('id', faltantes)
      lista = [...lista, ...(extra ?? [])]
    }

    lista.sort((a, b) =>
      (a.periodo_anio - b.periodo_anio) || (a.periodo_mes - b.periodo_mes)
      || (a.concepto || '').localeCompare(b.concepto || ''))

    setAplicacionesPrevias(previas)
    setCargos(lista)
    // Conserva lo que el usuario ya venía tecleando en la distribución (por si
    // este refresco lo dispara un cobro nuevo agregado a medio llenado), y solo
    // para cargos que no tenía tocados cae al valor guardado o vacío. El cargo
    // puntual con el que se abrió el modal (cargoObjetivo) se deja ya aplicado
    // la primera vez, para no obligar a marcarlo a mano.
    setDist(prevDist => Object.fromEntries(lista.map(c => {
      if (prevDist[c.id] !== undefined) return [c.id, prevDist[c.id]]
      if (previoDe[c.id] !== undefined) return [c.id, previoDe[c.id]]
      if (cargoObjetivo && c.id === cargoObjetivo.id) {
        const disponible = parseFloat(c.saldo) || 0
        return [c.id, String(Math.min(disponible, parseFloat(form.importe) || disponible))]
      }
      return [c.id, '']
    })))
    setLoadingCargos(false)
  }, [form.contrato_id, ingreso?.id])

  useEffect(() => { cargarCargos() }, [cargarCargos])

  const [leyendoOCR, setLeyendoOCR] = useState(false)
  const [ocrData, setOcrData] = useState(null)
  const [ocrMsg, setOcrMsg] = useState(null)

  const adjuntarYOCR = async (file) => {
    if (!file) return
    setCompFile(file)
    setCompPreview(URL.createObjectURL(file))
    // Adjuntar el comprobante es justo el acto de respaldar el depósito, así que
    // el estatus salta solo a VALIDADO. Si el usuario ya movió el combo a mano,
    // manda su decisión: no se le pisa.
    if (!estatusTocado.current) setForm(f => ({ ...f, estatus_validacion: 'VALIDADO' }))
    setLeyendoOCR(true)
    setOcrData(null)
    setOcrMsg({ ok: null, txt: 'Leyendo comprobante con IA…' })
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file)
      })
      const resp = await fetch('/.netlify/functions/extraer-documento', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image_base64: b64, media_type: file.type, tipo_doc: 'COMPROBANTE_PAGO' }),
      })
      const j = await resp.json()
      if (!resp.ok || !j.datos) throw new Error(j.error || 'Sin datos')
      const d = j.datos
      const formaMap = { transferencia: 'TRANSFERENCIA BBVA', spei: 'TRANSFERENCIA BBVA', deposito: 'DEPOSITO', 'depósito': 'DEPOSITO', efectivo: 'EFECTIVO', cheque: 'CHEQUE' }
      setForm(f => ({
        ...f,
        fecha:           d.fecha_pago || d.fecha || f.fecha,
        importe:         d.monto ? String(d.monto) : f.importe,
        referencia_banco: d.referencia || d.folio || d.numero_operacion || f.referencia_banco,
        origen:          formaMap[(d.forma_pago || '').toLowerCase()] || f.origen,
        concepto_origen: [d.concepto, d.banco ? `Desde: ${d.banco}` : ''].filter(Boolean).join(' · ') || f.concepto_origen,
      }))
      setOcrData(d)
      setOcrMsg({ ok: true, txt: 'Datos extraídos — verifica y corrige si es necesario' })
    } catch {
      setOcrMsg({ ok: false, txt: 'No se pudo leer el comprobante — llena manualmente' })
    } finally { setLeyendoOCR(false) }
  }

  const guardar = async () => {
    if (!form.contrato_id) { setErr('Selecciona el contrato'); return }
    if (!form.importe || parseFloat(form.importe) <= 0) { setErr('El importe debe ser mayor a 0'); return }
    if (excede) {
      setErr(`La distribución se pasa por ${fmt(Math.abs(saldoLibre))}: estás aplicando ${fmt(totalDist)} de un depósito de ${fmt(importeTotal)}. Baja algún importe o quita un cargo.`)
      return
    }
    setSaving(true); setErr(null)
    const [fAnio, fMes] = form.fecha ? form.fecha.split('-').map(Number) : [form.anio, form.mes]
    // Tipo principal = el concepto con mayor distribución, o el seleccionado
    const tiposPrincipales = cargos.filter(c => parseFloat(dist[c.id]) > 0).map(c => c.concepto)
    const tipoPrincipal = tiposPrincipales[0] || form.tipo

    // Clasificación: si el usuario eligió una, esa manda y queda marcada como
    // manual para que ningún recálculo posterior la pise. Si dejó "automática",
    // se deduce de la distribución que se está guardando —el trigger de la base
    // hará lo mismo al escribir las aplicaciones, pero así la fila queda
    // correcta también cuando la distribución no cambió en esta edición.
    const manual = !!form.clasificacion
    const clasifAuto = clasificacionAutomatica(tiposPrincipales)
    const clasificacion = manual
      ? form.clasificacion
      : (clasifAuto ?? (ingreso?.clasificacion_manual ? null : ingreso?.clasificacion ?? null))

    // La firma de quién validó solo tiene sentido mientras el ingreso esté en
    // VALIDADO: al salir de ese estatus se limpia para no dejar un sello viejo
    // colgado de una revisión que ya no aplica.
    const validado = form.estatus_validacion === 'VALIDADO'
    const yaEstabaValidado = ingreso?.estatus_validacion === 'VALIDADO'
    let validadoPor = null, validadoEn = null
    if (validado) {
      if (yaEstabaValidado && ingreso?.validado_por) {
        validadoPor = ingreso.validado_por
        validadoEn = ingreso.validado_en
      } else {
        const { data: sesion } = await supabase.auth.getUser()
        validadoPor = sesion?.user?.email || sesion?.user?.id || 'SISTEMA'
        validadoEn = new Date().toISOString()
      }
    }

    const payload = {
      fecha:           form.fecha || null,
      contrato_id:     form.contrato_id || null,
      tipo:            tipoPrincipal,
      mes:             fMes || parseInt(form.mes),
      anio:            fAnio || parseInt(form.anio),
      factura:         form.factura || null,
      importe:         parseFloat(form.importe),
      origen:          form.origen || null,
      concepto_origen: form.concepto_origen || null,
      nota:            form.nota || null,
      estatus_validacion: form.estatus_validacion || VALIDACION_DEFAULT,
      validado_por:       validadoPor,
      validado_en:        validadoEn,
      clasificacion:        clasificacion,
      clasificacion_manual: manual,
    }
    let error, data
    if (ingreso) {
      ;({ error } = await supabase.from('ingresos').update(payload).eq('id', ingreso.id))
      data = ingreso
    } else {
      ;({ error, data } = await supabase.from('ingresos').insert(payload).select('id').single())
    }
    if (error) { setSaving(false); setErr(error.message); return }

    // La distribución que se guarda REEMPLAZA a la anterior, no se suma a ella.
    const ingresoId = ingreso?.id || data?.id
    const aplicaciones = Object.entries(dist)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([cargo_id, v]) => ({ cargo_id, ingreso_id: ingresoId, importe_aplicado: parseFloat(v) }))
    const cargosQueQuedan = new Set(aplicaciones.map(a => a.cargo_id))
    const cargosABorrar = aplicacionesPrevias.map(a => a.cargo_id).filter(id => !cargosQueQuedan.has(id))

    // Primero se borra y luego se inserta: el guardián de la base compara la
    // suma contra el importe del depósito en cada sentencia, y al revés la
    // suma intermedia incluiría las filas viejas y rebotaría el guardado.
    if (cargosABorrar.length > 0) {
      const { error: delErr } = await supabase.from('aplicaciones_pago')
        .delete().eq('ingreso_id', ingresoId).in('cargo_id', cargosABorrar)
      if (delErr) { setSaving(false); setErr('No se pudieron quitar las aplicaciones anteriores: ' + delErr.message); return }
    }
    if (aplicaciones.length > 0) {
      const { error: apErr } = await supabase.from('aplicaciones_pago').upsert(aplicaciones, { onConflict: 'cargo_id,ingreso_id' })
      if (apErr) { setSaving(false); setErr('Ingreso guardado pero error al aplicar cargos: ' + apErr.message); return }
    }

    // Upload comprobante via Netlify Function (usa service_role key server-side)
    if (compFile && ingresoId) {
      try {
        const b64 = await new Promise((res, rej) => {
          const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(compFile)
        })
        const ext = compFile.name.split('.').pop() || 'jpg'
        const filePath = `comprobantes/${ingresoId}/comp.${ext}`
        const resp = await llamarFuncion('subir-comprobante', { bucket: 'facturas-cfdi', path: filePath, file_base64: b64, mime_type: compFile.type || 'image/jpeg', ingreso_id: ingresoId })
        if (!resp.ok) {
          const j = await resp.json().catch(() => ({}))
          toast.error('Error al subir comprobante: ' + (j.error || resp.status))
        }
      } catch (e) {
        toast.error('Error al subir comprobante: ' + e.message)
      }
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  const eliminarIngreso = async () => {
    if (!ingreso?.id) return
    setBorrando(true)
    const { error } = await supabase.from('ingresos').delete().eq('id', ingreso.id)
    setBorrando(false)
    if (error) { toast.error(error.message); return }
    toast.success('Ingreso eliminado')
    onSaved()
    onClose()
  }

  const inp = (k, type='text', placeholder='') => (
    <input type={type} value={form[k]} placeholder={placeholder}
      onChange={e => set(k, e.target.value)}
      style={{ width:'100%', padding:'8px 10px', border:'1px solid #D1D5DB', borderRadius:'6px', fontSize:'13px', boxSizing:'border-box' }} />
  )

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}
      onClick={onClose}>
      <div style={{ background:'white', borderRadius:'14px', width:'100%', maxWidth:'560px', maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ padding:'18px 22px', background:'var(--color-primary)', color:'white', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:700, fontSize:'15px' }}>{ingreso ? 'Editar Ingreso' : 'Registrar Ingreso'}</div>
          <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
            {puedeEliminar && (
              <button onClick={() => setConfirmarBorrado(true)} title="Eliminar este ingreso"
                style={{ background:'none', border:'none', cursor:'pointer', color:'white', opacity:0.85, display:'flex', alignItems:'center', padding:'4px' }}>
                <Trash2 size={16} />
              </button>
            )}
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'white', display:'flex', alignItems:'center', padding:'4px' }}><X size={18} /></button>
          </div>
        </div>

        {confirmarBorrado && (
          <div style={{ padding:'12px 22px', background:'#FEF2F2', borderBottom:'1px solid #FECACA', display:'flex', alignItems:'center', gap:'10px' }}>
            <AlertCircle size={16} color="var(--color-danger)" style={{ flexShrink:0 }} />
            <span style={{ fontSize:'12.5px', color:'#991B1B', flex:1 }}>
              Esto borra el ingreso y su distribución aplicada a la cartera. No se puede deshacer.
            </span>
            <button onClick={() => setConfirmarBorrado(false)} disabled={borrando}
              style={{ padding:'6px 12px', background:'white', border:'1px solid #FECACA', borderRadius:'6px', fontSize:'12px', fontWeight:600, cursor:'pointer', color:'#6B7280' }}>
              Cancelar
            </button>
            <button onClick={eliminarIngreso} disabled={borrando}
              style={{ padding:'6px 12px', background:'var(--color-danger)', border:'none', borderRadius:'6px', fontSize:'12px', fontWeight:700, cursor:'pointer', color:'white', opacity: borrando ? 0.7 : 1 }}>
              {borrando ? 'Eliminando…' : 'Sí, eliminar'}
            </button>
          </div>
        )}

        <div style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>

          {/* ── 1. Comprobante con OCR ── */}
          <div style={{ marginBottom:'14px' }}>
            <label style={{ fontSize:'11px', fontWeight:700, color:'var(--color-text-light)', textTransform:'uppercase', display:'block', marginBottom:'6px' }}>1. Comprobante de pago (OCR automático)</label>
            <input type="file" ref={fileRef} accept="image/*,application/pdf" capture="environment" style={{ display:'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) adjuntarYOCR(f); e.target.value = '' }} />
            {!compFile ? (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={leyendoOCR}
                style={{ display:'flex', alignItems:'center', gap:'8px', padding:'12px', background:'#EFF6FF', border:'2px dashed #0A66C2', borderRadius:'10px', fontSize:'13px', color:'#0A66C2', cursor:'pointer', fontWeight:700, width:'100%', justifyContent:'center' }}>
                <Image size={16} /> {leyendoOCR ? 'Leyendo con IA…' : 'Adjuntar ficha o transferencia — IA extrae los datos'}
              </button>
            ) : (
              <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 12px', background:'#F0FDF4', borderRadius:'8px', border:'1.5px solid #BBF7D0' }}>
                <span style={{ fontSize:'12px', fontWeight:700, color:'#15803D', flex:1 }}>✓ {compFile.name}</span>
                <button type="button" onClick={() => { setCompFile(null); setCompPreview(null); setOcrMsg(null); setOcrData(null) }}
                  style={{ fontSize:'11px', color:'var(--color-danger)', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>✕ Quitar</button>
              </div>
            )}
          </div>

          {/* Panel validación OCR */}
          {ocrMsg && (
            <div style={{ marginBottom:'12px', padding:'10px 12px', borderRadius:'8px', fontSize:'12px',
              border:`1px solid ${ocrMsg.ok === true ? '#BBF7D0' : ocrMsg.ok === false ? '#FECACA' : '#FDE68A'}`,
              background: ocrMsg.ok === true ? '#F0FDF4' : ocrMsg.ok === false ? '#FEF2F2' : '#FFFBEB' }}>
              <div style={{ fontWeight:700, color: ocrMsg.ok === true ? '#057642' : ocrMsg.ok === false ? '#B24020' : '#92400E', marginBottom: ocrData ? '8px' : 0 }}>
                {ocrMsg.ok === true ? '✓' : ocrMsg.ok === false ? '✗' : '⟳'} {ocrMsg.txt}
              </div>
              {ocrData && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 16px' }}>
                  {[
                    ['Banco origen', ocrData.banco],
                    ['No. cuenta / CLABE', ocrData.cuenta || ocrData.clabe],
                    ['Monto en imagen', ocrData.monto ? fmt(ocrData.monto) : null],
                    ['Fecha', ocrData.fecha_pago || ocrData.fecha],
                    ['Referencia', ocrData.referencia || ocrData.folio || ocrData.numero_operacion],
                    ['Concepto', ocrData.concepto],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}>
                      <span style={{ fontSize:'10px', color:'#6B7280', textTransform:'uppercase', fontWeight:700 }}>{k}</span>
                      <div style={{ fontSize:'12px', fontWeight:600, color:'#111827' }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {compPreview && (
            <div style={{ marginBottom:'12px' }}>
              <img src={compPreview} alt="comprobante" style={{ width:'100%', maxHeight:'140px', objectFit:'contain', borderRadius:'8px', border:'1px solid #E5E7EB', background:'#F9FAFB' }} />
            </div>
          )}

          <div style={{ borderTop:'1px solid #F3F4F6', paddingTop:'12px', marginBottom:'12px' }}>
            <span style={{ fontSize:'11px', fontWeight:700, color:'var(--color-text-light)', textTransform:'uppercase' }}>2. Datos del depósito</span>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 18px' }}>

            {/* Contrato — buscador filtrable */}
            <div style={{ gridColumn:'1/-1', position:'relative' }}>
              <label style={{ fontSize:'11px', fontWeight:700, color:'var(--color-text-light)', textTransform:'uppercase' }}>Contrato *</label>
              {(() => {
                const sel = contratos.find(c => c.id === form.contrato_id)
                const q = contratoSearch.toLowerCase()
                const filtrados = contratos.filter(c => {
                  if (!q) return true
                  return (c.locales_display || '').toLowerCase().includes(q)
                    || (c.arrendatario_nombre || '').toLowerCase().includes(q)
                    || (c.folio || '').toLowerCase().includes(q)
                })
                const label = c => {
                  const loc = c.locales_display ? `${c.locales_display} — ` : ''
                  return `${loc}${c.arrendatario_nombre || ''}${c.folio ? ` (${c.folio})` : ''}`
                }
                return (
                  <div style={{ marginTop:'4px' }}>
                    <input
                      value={contratoSearch || (sel ? label(sel) : '')}
                      onFocus={() => { setContratoSearch(''); setContratoOpen(true) }}
                      onBlur={() => setTimeout(() => setContratoOpen(false), 180)}
                      onChange={e => { setContratoSearch(e.target.value); setContratoOpen(true); if (!e.target.value) set('contrato_id', '') }}
                      placeholder="Buscar por local (L14) o nombre..."
                      style={{ width:'100%', padding:'8px 10px', border:'1px solid #D1D5DB', borderRadius:'6px', fontSize:'13px', boxSizing:'border-box' }}
                    />
                    {contratoOpen && (
                      <div style={{ position:'absolute', zIndex:300, top:'100%', left:0, right:0, background:'white', border:'1px solid #D1D5DB', borderRadius:'8px', maxHeight:'220px', overflowY:'auto', boxShadow:'0 4px 16px rgba(0,0,0,0.13)', marginTop:'2px' }}>
                        {filtrados.length === 0
                          ? <div style={{ padding:'10px 14px', fontSize:'12px', color:'#9CA3AF' }}>Sin coincidencias</div>
                          : filtrados.map(c => (
                            <div key={c.id}
                              onMouseDown={() => { set('contrato_id', c.id); setContratoSearch(''); setContratoOpen(false) }}
                              style={{ padding:'9px 14px', fontSize:'13px', cursor:'pointer', borderBottom:'1px solid #F3F4F6',
                                background: c.id === form.contrato_id ? '#EFF6FF' : 'white',
                                color: c.id === form.contrato_id ? '#0A66C2' : '#111827' }}
                              onMouseEnter={e => { if (c.id !== form.contrato_id) e.currentTarget.style.background='#F9FAFB' }}
                              onMouseLeave={e => { if (c.id !== form.contrato_id) e.currentTarget.style.background='white' }}>
                              {c.locales_display && (
                                <span style={{ fontWeight:700, color:'#0A66C2', marginRight:'6px' }}>{c.locales_display}</span>
                              )}
                              {c.arrendatario_nombre}
                              {c.folio && <span style={{ fontSize:'11px', color:'#9CA3AF', marginLeft:'6px' }}>({c.folio})</span>}
                            </div>
                          ))
                        }
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Importe recibido */}
            <div>
              <label style={{ fontSize:'11px', fontWeight:700, color:'var(--color-text-light)', textTransform:'uppercase' }}>
                Importe recibido *
                {ocrData?.monto && Math.abs(parseFloat(form.importe) - ocrData.monto) > 1 && (
                  <span style={{ marginLeft:6, color:'#D97706', fontSize:'10px' }}>⚠ imagen: {fmt(ocrData.monto)}</span>
                )}
              </label>
              <div style={{ marginTop:'4px' }}>{inp('importe','number','0.00')}</div>
            </div>

            {/* Fecha */}
            <div>
              <label style={{ fontSize:'11px', fontWeight:700, color:'var(--color-text-light)', textTransform:'uppercase' }}>Fecha pago</label>
              <div style={{ marginTop:'4px' }}>{inp('fecha','date')}</div>
            </div>

            {/* Factura */}
            <div>
              <label style={{ fontSize:'11px', fontWeight:700, color:'var(--color-text-light)', textTransform:'uppercase' }}>No. Factura</label>
              <div style={{ marginTop:'4px' }}>{inp('factura','text','2195')}</div>
            </div>

            {/* Origen */}
            <div>
              <label style={{ fontSize:'11px', fontWeight:700, color:'var(--color-text-light)', textTransform:'uppercase' }}>Origen</label>
              <select value={form.origen} onChange={e => set('origen', e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:'1px solid #D1D5DB', borderRadius:'6px', fontSize:'13px', marginTop:'4px' }}>
                <option>TRANSFERENCIA BBVA</option>
                <option>EFECTIVO</option>
                <option>CHEQUE</option>
                <option>OTRO</option>
              </select>
            </div>

            {/* Concepto */}
            <div>
              <label style={{ fontSize:'11px', fontWeight:700, color:'var(--color-text-light)', textTransform:'uppercase' }}>Concepto origen</label>
              <div style={{ marginTop:'4px' }}>{inp('concepto_origen','text','RENTA JUL26')}</div>
            </div>

            {/* Validación contra el banco */}
            <div>
              <label style={{ fontSize:'11px', fontWeight:700, color:'var(--color-text-light)', textTransform:'uppercase' }}>Validación del pago</label>
              <select value={form.estatus_validacion}
                onChange={e => { estatusTocado.current = true; set('estatus_validacion', e.target.value) }}
                title="VALIDADO = el depósito, la transferencia o la entrega de efectivo ya se verificó contra el banco"
                style={{ width:'100%', padding:'8px 10px', borderRadius:'6px', fontSize:'13px', marginTop:'4px',
                  border:'1.5px solid', borderColor: VALIDACION[form.estatus_validacion]?.color || '#D1D5DB',
                  background: VALIDACION[form.estatus_validacion]?.bg || 'white',
                  color: VALIDACION[form.estatus_validacion]?.color || 'inherit', fontWeight:700 }}>
                {Object.entries(VALIDACION).map(([clave, m]) => (
                  <option key={clave} value={clave}>{m.label}</option>
                ))}
              </select>
              {form.estatus_validacion === 'VALIDADO' && ingreso?.validado_por && ingreso?.estatus_validacion === 'VALIDADO' && (
                <div style={{ fontSize:'10px', color:'var(--color-text-light)', marginTop:'3px' }}>
                  Validó {ingreso.validado_por}{ingreso.validado_en ? ` · ${ingreso.validado_en.slice(0,10)}` : ''}
                </div>
              )}
            </div>

            {/* Clasificación del ingreso */}
            <div>
              <label style={{ fontSize:'11px', fontWeight:700, color:'var(--color-text-light)', textTransform:'uppercase' }}>Clasificación</label>
              {(() => {
                const auto = clasificacionAutomatica(cargos.filter(c => parseFloat(dist[c.id]) > 0).map(c => c.concepto))
                const efectiva = form.clasificacion || auto
                return (
                  <>
                    <select value={form.clasificacion} onChange={e => set('clasificacion', e.target.value)}
                      title="Automática = se deduce de la distribución del pago. Si eliges un valor, se respeta aunque la distribución cambie."
                      style={{ width:'100%', padding:'8px 10px', borderRadius:'6px', fontSize:'13px', marginTop:'4px',
                        border:'1.5px solid', borderColor: efectiva ? (TIPO_COLOR[efectiva] || '#D1D5DB') : '#D1D5DB',
                        background: efectiva ? (TIPO_COLOR[efectiva] || '#6B7280') + '14' : 'white',
                        color: efectiva ? (TIPO_COLOR[efectiva] || 'inherit') : 'inherit',
                        fontWeight: form.clasificacion ? 700 : 400 }}>
                      <option value="">Automática{auto ? ` — ${auto}` : ''}</option>
                      {CLASIFICACIONES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div style={{ fontSize:'10px', color:'var(--color-text-light)', marginTop:'3px' }}>
                      {form.clasificacion
                        ? 'Elegida a mano: no se recalcula sola.'
                        : auto
                          ? 'Sale de la distribución del pago.'
                          : 'Sin distribución todavía — se calculará al aplicar el pago a algún cargo.'}
                    </div>
                  </>
                )
              })()}
            </div>

            {/* ─── Distribución del pago ─── */}
            {form.contrato_id && (
              <div style={{ gridColumn:'1/-1', marginTop:'4px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px', gap:'8px' }}>
                  <label style={{ fontSize:'11px', fontWeight:700, color:'var(--color-text-light)', textTransform:'uppercase' }}>
                    Distribución del pago (cargos pendientes)
                  </label>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    {importeTotal > 0 && (
                      <span style={{ fontSize:'12px', fontWeight:600, color: excede ? 'var(--color-danger)' : saldoLibre > 0.01 ? '#D97706' : 'var(--color-success)' }}>
                        {excede ? `Se pasa por ${fmt(Math.abs(saldoLibre))}` : saldoLibre > 0.01 ? `Libre: ${fmt(saldoLibre)}` : '✓ Cuadrado'}
                      </span>
                    )}
                    <button type="button" onClick={() => setModalNuevoCargo(true)}
                      title="Agregar un cargo que falte en la lista (p. ej. una sanción) para poder aplicarle este pago"
                      style={{ display:'flex', alignItems:'center', gap:'4px', padding:'4px 10px', border:'1px solid var(--color-primary)', borderRadius:'6px', background:'white', color:'var(--color-primary)', fontSize:'11px', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                      <Plus size={13} /> Agregar cobro
                    </button>
                  </div>
                </div>

                {loadingCargos ? (
                  <div style={{ fontSize:'13px', color:'#6B7280', padding:'10px 0' }}>Cargando cargos...</div>
                ) : cargos.length === 0 ? (
                  <div style={{ fontSize:'13px', color:'#6B7280', padding:'10px 12px', background:'#F9FAFB', borderRadius:'8px', border:'1px solid #E5E7EB' }}>
                    Sin cargos pendientes para este contrato
                  </div>
                ) : (
                  <div style={{ border:'1px solid #E5E7EB', borderRadius:'8px', overflow:'hidden' }}>
                    {/* Header */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 110px 110px', gap:'8px', padding:'7px 12px', background:'#F3F4F6', fontSize:'11px', fontWeight:700, color:'#6B7280', textTransform:'uppercase' }}>
                      <span>Concepto</span><span>Período</span><span style={{ textAlign:'right' }}>Saldo</span><span style={{ textAlign:'right' }}>Aplicar</span>
                    </div>
                    {cargos.map((c, i) => {
                      const aplicando = parseFloat(dist[c.id]) || 0
                      const activo = aplicando > 0
                      const disponible = disponibleDe(c)
                      return (
                        <div key={c.id} style={{ display:'grid', gridTemplateColumns:'1fr 80px 110px 110px', gap:'8px', padding:'8px 12px', alignItems:'center', borderTop: i > 0 ? '1px solid #F3F4F6' : 'none', background: activo ? '#F0FDF4' : 'white', transition:'background 0.15s' }}>
                          {/* Concepto con palomita */}
                          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                            <span onClick={() => setDist(d => ({ ...d, [c.id]: activo ? '' : String(Math.min(disponible, Math.max(0, importeTotal - totalDist + aplicando))) }))}
                              style={{ cursor:'pointer', color: activo ? 'var(--color-success)' : '#D1D5DB', flexShrink:0 }}>
                              {activo ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                            </span>
                            <div>
                              <div style={{ fontSize:'13px', fontWeight:600, color: TIPO_COLOR[c.concepto] || '#374151' }}>{c.concepto}</div>
                              <div style={{ fontSize:'10px', color:'#9CA3AF' }}>{c.estado}</div>
                            </div>
                          </div>
                          {/* Periodo */}
                          <span style={{ fontSize:'12px', color:'#6B7280' }}>{MESES[c.periodo_mes]}/{c.periodo_anio}</span>
                          {/* Saldo */}
                          <span style={{ fontSize:'13px', fontWeight:600, color:'#374151', textAlign:'right' }}>{fmt(disponible)}</span>
                          {/* Input importe a aplicar */}
                          <input
                            type="number" min="0" max={disponible} step="0.01"
                            value={dist[c.id] ?? ''}
                            placeholder="0.00"
                            onChange={e => setDist(d => ({ ...d, [c.id]: e.target.value }))}
                            style={{ width:'100%', padding:'5px 8px', border:`1px solid ${activo ? 'var(--color-success)' : '#D1D5DB'}`, borderRadius:'6px', fontSize:'13px', textAlign:'right', boxSizing:'border-box', background: activo ? '#F0FDF4' : 'white' }}
                          />
                        </div>
                      )
                    })}
                    {/* Totales */}
                    {importeTotal > 0 && (
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 110px 110px', gap:'8px', padding:'8px 12px', borderTop:'2px solid #E5E7EB', background:'#F9FAFB' }}>
                        <span style={{ fontSize:'12px', fontWeight:700, color:'#374151', gridColumn:'1/3' }}>Total recibido</span>
                        <span style={{ fontSize:'13px', fontWeight:700, color:'#374151', textAlign:'right' }}>{fmt(importeTotal)}</span>
                        <span style={{ fontSize:'13px', fontWeight:700, color: saldoLibre < -0.01 ? 'var(--color-danger)' : 'var(--color-success)', textAlign:'right' }}>{fmt(totalDist)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Un depósito no puede aplicarse por más de lo que vale: se dice
                    aquí mismo, mientras se distribuye, y no hasta el guardado. */}
                {excede && (
                  <div style={{ marginTop:'8px', padding:'8px 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:'8px', fontSize:'12px', color:'var(--color-danger)', display:'flex', gap:'7px', alignItems:'center' }}>
                    <AlertCircle size={14} style={{ flexShrink:0 }} />
                    <span>Estás aplicando <strong>{fmt(totalDist)}</strong> de un depósito de <strong>{fmt(importeTotal)}</strong>: se pasa por <strong>{fmt(Math.abs(saldoLibre))}</strong>. No se puede guardar así.</span>
                  </div>
                )}
              </div>
            )}

            {/* Nota */}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={{ fontSize:'11px', fontWeight:700, color:'var(--color-text-light)', textTransform:'uppercase' }}>Nota</label>
              <textarea value={form.nota} onChange={e => set('nota', e.target.value)} rows={2}
                style={{ width:'100%', padding:'8px 10px', border:'1px solid #D1D5DB', borderRadius:'6px', fontSize:'13px', boxSizing:'border-box', resize:'vertical', marginTop:'4px' }} />
            </div>
          </div>

          {err && <div style={{ marginTop:'12px', padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:'8px', fontSize:'13px', color:'var(--color-danger)', display:'flex', gap:'8px', alignItems:'center' }}><AlertCircle size={14} />{err}</div>}
        </div>

        <div style={{ padding:'14px 22px', borderTop:'1px solid #E5E7EB', display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'9px 18px', background:'#F3F4F6', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>Cancelar</button>
          <button onClick={guardar} disabled={saving || excede}
            title={excede ? `La distribución se pasa por ${fmt(Math.abs(saldoLibre))} del importe recibido` : undefined}
            style={{ display:'flex', alignItems:'center', gap:'6px', padding:'9px 20px', background:'var(--color-primary)', color:'white', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:700, cursor: excede ? 'not-allowed' : 'pointer', opacity:(saving || excede) ? 0.6 : 1 }}>
            <Save size={14} /> {saving ? 'Guardando...' : ingreso ? 'Guardar cambios' : 'Registrar ingreso'}
          </button>
        </div>
      </div>

      {modalNuevoCargo && (
        // Aislado del onClick={onClose} del backdrop de este modal: sin esto,
        // un click en el fondo de "Agregar cobro" burbujea y también cerraría
        // "Editar Ingreso" por estar anidado dentro de su mismo div.
        <div onClick={e => e.stopPropagation()}>
          <NuevoCargoModal
            contratoFijo={contratos.find(c => c.id === form.contrato_id) || null}
            onClose={() => setModalNuevoCargo(false)}
            onSaved={cargarCargos}
          />
        </div>
      )}
    </div>
  )
}

export default function Ingresos() {
  useModuleAudit('INGRESOS')
  const [search, setSearch] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('Todos')
  const [filtroValidacion, setFiltroValidacion] = useState('Todos')
  const [filtroMes, setFiltroMes] = useState(new Date().getMonth() + 1)
  const [filtroAnio, setFiltroAnio] = useState(new Date().getFullYear())
  const [filtroModo, setFiltroModo] = useState('periodo') // 'periodo' | 'fecha_pago'
  const [modalData, setModalData] = useState(null)
  const [verDetalle, setVerDetalle] = useState(null)
  const [detalleAplicaciones, setDetalleAplicaciones] = useState([])
  const [confirmDel, setConfirmDel] = useState(null)
  // URL firmada del comprobante que se está viendo a pantalla completa.
  const [zoomComprobante, setZoomComprobante] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const { data, loading } = usePRP('prp_ingresos', { refreshKey })
  const lista = data ?? []

  // Descuadres entre el depósito y lo que se repartió. Se traen aparte porque
  // prp_ingresos no sabe de aplicaciones: la vista los calcula comparando el
  // importe con la suma de aplicaciones_pago.
  const { data: dataDescuadres } = usePRP('prp_ingresos_descuadrados', { refreshKey })
  const descuadres = useMemo(() => {
    const m = {}
    for (const d of dataDescuadres ?? []) m[d.ingreso_id] = d
    return m
  }, [dataDescuadres])

  // Lo proyectado sale de los contratos, no de los ingresos: son fuentes distintas.
  const { data: dataContratos } = usePRP('prp_contratos', { select: 'id, estatus, renta_mensual, fecha_inicio, fecha_fin' })
  const operacion = useOperacion()
  const contratos = dataContratos ?? []

  const periodoYYYYMM = `${filtroAnio}-${String(filtroMes).padStart(2, '0')}`
  const periodoIdx = filtroAnio * 12 + filtroMes

  const enPeriodo = r => filtroModo === 'fecha_pago'
    ? mesDeFechaPago(r) === periodoYYYYMM
    : r.mes === filtroMes && r.anio === filtroAnio

  const filtrados = useMemo(() => {
    const q = search.toLowerCase()
    return lista
      .filter(r => {
        const matchQ = !q
          || (r.id_contrato || '').toLowerCase().includes(q)
          || (r.propietario || '').toLowerCase().includes(q)
          || (r.local_id || '').toLowerCase().includes(q)
          || (r.arrendatario_nombre || '').toLowerCase().includes(q)
          || (r.locales_display || '').toLowerCase().includes(q)
          || (r.factura || '').toLowerCase().includes(q)
        const matchT = filtroTipo === 'Todos' || clasifDe(r) === filtroTipo
        const matchV = filtroValidacion === 'Todos'
          || (r.estatus_validacion || VALIDACION_DEFAULT) === filtroValidacion
        return matchQ && matchT && matchV && enPeriodo(r)
      })
      .sort((a, b) => {
        // Orden default: por local (locales_display), luego por fecha
        const la = a.locales_display || 'ZZZ'
        const lb = b.locales_display || 'ZZZ'
        if (la !== lb) return la.localeCompare(lb, 'es', { numeric: true })
        return (a.fecha || '').localeCompare(b.fecha || '')
      })
  }, [lista, search, filtroTipo, filtroValidacion, filtroMes, filtroAnio, filtroModo])

  // Cuántos ingresos hay en cada estatus con el resto de filtros ya puestos: la
  // cuenta va en la etiqueta de la opción, para ver que faltan 12 por validar
  // sin tener que seleccionar el filtro para descubrirlo.
  const conteoValidacion = useMemo(() => {
    const q = search.toLowerCase()
    return lista.reduce((acc, r) => {
      const matchQ = !q
        || (r.arrendatario_nombre || '').toLowerCase().includes(q)
        || (r.locales_display || '').toLowerCase().includes(q)
        || (r.factura || '').toLowerCase().includes(q)
      const matchT = filtroTipo === 'Todos' || clasifDe(r) === filtroTipo
      if (matchQ && matchT && enPeriodo(r)) {
        const k = r.estatus_validacion || VALIDACION_DEFAULT
        acc[k] = (acc[k] || 0) + 1
      }
      return acc
    }, {})
  }, [lista, search, filtroTipo, filtroMes, filtroAnio, filtroModo])

  const soloImportes = filtrados.filter(r => r.es_principal && r.importe != null)
  const totalMes = soloImportes.reduce((a, b) => a + (parseFloat(b.importe) || 0), 0)

  // Las tarjetas resumen el período completo: el filtro de tipo y la búsqueda solo
  // recortan la tabla, para que los totales no cambien al explorar.
  const delPeriodo = useMemo(
    () => lista.filter(r => r.importe != null && enPeriodo(r)),
    [lista, filtroMes, filtroAnio, filtroModo],
  )
  const suma = arr => arr.reduce((a, b) => a + (parseFloat(b.importe) || 0), 0)
  const totalRenta = suma(delPeriodo.filter(r => r.tipo === 'RENTA'))
  const totalSanciones = suma(delPeriodo.filter(r => r.tipo === 'SANCION'))

  // Por cobrar: la renta de los locales EN OPERACIÓN. No se usa `estatus` ni la
  // fecha de fin — hay contratos vencidos que siguen ocupando y pagando, y su
  // renta se cobra igual. El estatus de operación se captura en el contrato.
  const contratosOcupados = contratos.filter(c => operacion[c.id] !== 'DESOCUPADO' && operacion[c.id])
  const totalProyectado = contratosOcupados.reduce((a, c) => a + (parseFloat(c.renta_mensual) || 0), 0)
  const ocupadosSinContrato = contratosOcupados.filter(c => {
    const fin = (c.fecha_fin || '').slice(0, 10)
    return fin && fin < new Date().toISOString().slice(0, 10)
  }).length

  // Recibido vs. correspondido: `fecha` es cuándo se pagó, `mes`/`anio` a qué renta
  // corresponde. Siempre se parte de la fecha de pago, aunque el toggle esté en período.
  const rentasRecibidas = lista.filter(r => r.tipo === 'RENTA' && r.importe != null && mesDeFechaPago(r) === periodoYYYYMM)
  const rentaDelMesEnTurno = rentasRecibidas.filter(r => r.anio * 12 + r.mes === periodoIdx)
  const rentaDeMesesAnteriores = rentasRecibidas.filter(r => r.anio * 12 + r.mes < periodoIdx)

  const eliminar = async (r) => {
    const { error } = await supabase.from('ingresos').delete().eq('id', r.id)
    if (error) { toast.error(error.message); return }
    logAudit({ modulo: 'INGRESOS', accion: 'ELIMINAR', entidad: 'ingreso', entidad_id: r.id, descripcion: `Ingreso eliminado: ${r.arrendatario_nombre || ''} $${r.importe}` })
    toast.success('Ingreso eliminado')
    setConfirmDel(null)
    setRefreshKey(k => k+1)
  }

  const ANIOS = [2025, 2026, 2027]

  return (
    <div style={{ padding:'24px', maxWidth:'1300px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontSize:'22px', fontWeight:700, margin:'0 0 4px' }}>Ingresos</h1>
          <p style={{ fontSize:'13px', color:'var(--color-text-light)', margin:0 }}>
            {filtroModo === 'fecha_pago' ? 'Fecha de pago' : 'Período de renta'}: {MESES[filtroMes]} {filtroAnio} · {filtrados.filter(r => r.es_principal).length} contratos con pago
          </p>
        </div>
        <button onClick={() => setModalData('nuevo')} style={{
          display:'flex', alignItems:'center', gap:'8px',
          background:'var(--color-primary)', color:'white', border:'none',
          borderRadius:'8px', padding:'10px 20px', fontSize:'14px', fontWeight:600, cursor:'pointer',
        }}>
          <Plus size={16} /> Registrar Ingreso
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'14px', marginBottom:'24px' }}>
        <KPICard title="Por cobrar (locales ocupados)"
          value={fmtK(totalProyectado)}
          subtitle={`${contratosOcupados.length} en operación${ocupadosSinContrato ? ` · ${ocupadosSinContrato} sin contrato vigente` : ''}`}
          icon={Target} color="var(--color-primary)" />
        <KPICard title="Rentas cobradas"
          value={fmtK(totalRenta)}
          subtitle={`${delPeriodo.filter(r => r.tipo === 'RENTA').length} pagos de renta`}
          icon={DollarSign} color="var(--color-success)" />
        <KPICard title="Sanciones"
          value={fmtK(totalSanciones)}
          subtitle={`${delPeriodo.filter(r => r.tipo === 'SANCION').length} sanciones por mora`}
          icon={AlertCircle} color="var(--color-danger)" />
        <KPICard title="Del mes en turno"
          value={fmtK(suma(rentaDelMesEnTurno))}
          subtitle={`${rentaDelMesEnTurno.length} pagos recibidos en ${MESES[filtroMes]} por ${MESES[filtroMes]}`}
          icon={CalendarCheck} color="var(--color-success)" />
        <KPICard title="De meses anteriores"
          value={fmtK(suma(rentaDeMesesAnteriores))}
          subtitle={`${rentaDeMesesAnteriores.length} pagos recibidos en ${MESES[filtroMes]} por meses atrasados`}
          icon={History} color="var(--color-warning)" />
        <KPICard title="Registros"
          value={delPeriodo.length}
          subtitle={`Ingresos de todo tipo en el ${filtroModo === 'fecha_pago' ? 'mes de pago' : 'período de renta'}`}
          icon={Calendar} color="var(--color-secondary)" />
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:'10px', marginBottom:'16px', flexWrap:'wrap', alignItems:'center' }}>

        {/* Toggle Fecha pago / Período renta */}
        <div style={{ display:'flex', background:'#F3F4F6', borderRadius:'8px', padding:'3px', gap:'2px' }}>
          {[
            { key:'periodo',    label:'Período de renta' },
            { key:'fecha_pago', label:'Fecha de pago'    },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setFiltroModo(key)} style={{
              padding:'5px 11px', borderRadius:'6px', fontSize:'12px', fontWeight:700,
              border:'none', cursor:'pointer',
              background: filtroModo === key ? 'white' : 'transparent',
              color:      filtroModo === key ? 'var(--color-primary)' : '#6B7280',
              boxShadow:  filtroModo === key ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
              transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {/* Mes/Año */}
        <select value={filtroMes} onChange={e => setFiltroMes(parseInt(e.target.value))}
          style={{ padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontSize:'13px' }}>
          {MESES.slice(1).map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={filtroAnio} onChange={e => setFiltroAnio(parseInt(e.target.value))}
          style={{ padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontSize:'13px' }}>
          {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        {/* Clasificación */}
        {['Todos', ...CLASIFICACIONES].map(t => (
          <button key={t} onClick={() => setFiltroTipo(t)} style={{
            padding:'7px 12px', borderRadius:'6px', fontSize:'12px', fontWeight:600, cursor:'pointer', border:'1.5px solid',
            borderColor: filtroTipo === t ? (TIPO_COLOR[t] || 'var(--color-primary)') : '#E5E7EB',
            background: filtroTipo === t ? (TIPO_COLOR[t] || 'var(--color-primary)') + '18' : 'white',
            color: filtroTipo === t ? (TIPO_COLOR[t] || 'var(--color-primary)') : 'var(--color-text-light)',
          }}>{t}</button>
        ))}

        {/* Validación contra el banco */}
        <select value={filtroValidacion} onChange={e => setFiltroValidacion(e.target.value)}
          title="Estatus de validación contra el banco"
          style={{
            padding:'8px 12px', borderRadius:'8px', fontSize:'13px', border:'1.5px solid',
            borderColor: filtroValidacion === 'Todos' ? '#E5E7EB' : (VALIDACION[filtroValidacion]?.color || 'var(--color-primary)'),
            background:  filtroValidacion === 'Todos' ? 'white' : (VALIDACION[filtroValidacion]?.bg || 'white'),
            color:       filtroValidacion === 'Todos' ? 'inherit' : (VALIDACION[filtroValidacion]?.color || 'inherit'),
            fontWeight:  filtroValidacion === 'Todos' ? 400 : 700,
          }}>
          <option value="Todos">Validación: todos</option>
          {Object.entries(VALIDACION).map(([clave, m]) => (
            <option key={clave} value={clave}>{m.label} ({conteoValidacion[clave] || 0})</option>
          ))}
        </select>

        {/* Búsqueda */}
        <div style={{ position:'relative', flex:1, minWidth:'200px' }}>
          <Search size={14} style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', color:'#9CA3AF' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por local, propietario, factura..."
            style={{ width:'100%', padding:'8px 10px 8px 32px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontSize:'13px', boxSizing:'border-box' }} />
        </div>
      </div>

      {/* Tabla */}
      <div style={{ background:'white', borderRadius:'10px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
        {loading
          ? <div style={{ display:'flex', justifyContent:'center', padding:'60px' }}><LoadingSpinner /></div>
          : filtrados.length === 0
            ? <EmptyState title="Sin ingresos" subtitle="Registra el primer ingreso del período" />
            : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'#F9FAFB' }}>
                      {['Fecha pago','Período','Contrato','Clasificación','Docs','Cuadre','Validación','Esperado','Cobrado','Nota'].map(h => (
                        <th key={h} style={{ padding:'10px 14px', fontSize:'11px', fontWeight:700, color:'var(--color-text-light)', textAlign: (h === 'Esperado' || h === 'Cobrado') ? 'right' : 'left', textTransform:'uppercase', letterSpacing:'0.04em', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                      <th style={{ padding:'10px 14px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map(r => (
                      <tr key={r.id} style={{ borderTop:'1px solid #F3F4F6' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding:'10px 14px', fontSize:'12px', whiteSpace:'nowrap' }}>{r.fecha ? r.fecha.slice(0,10) : '—'}</td>
                        <td style={{ padding:'10px 14px', fontSize:'12px', whiteSpace:'nowrap' }}>
                          <span style={{ fontWeight:600, color: r.mes === filtroMes && r.anio === filtroAnio ? '#057642' : '#6B7280' }}>
                            {MESES[r.mes]}/{r.anio}
                          </span>
                        </td>
                        <td style={{ padding:'10px 14px', fontSize:'12px', minWidth:'180px' }}>
                          {r.folio || r.arrendatario_nombre ? (
                            <>
                              {r.locales_display && r.locales_display !== '—' && (
                                <span style={{ display:'inline-block', fontSize:'11px', fontWeight:700, color:'#0A66C2', background:'#EFF6FF', padding:'1px 7px', borderRadius:'8px', marginBottom:'3px' }}>{r.locales_display}</span>
                              )}
                              <div style={{ fontWeight:600, color:'#111827', fontSize:'12px', lineHeight:'1.3' }}>{r.arrendatario_nombre || r.propietario || '—'}</div>
                              {r.folio && r.folio !== '—' && <div style={{ fontSize:'10px', color:'#9CA3AF', fontFamily:'monospace' }}>{r.folio}</div>}
                            </>
                          ) : (
                            <span style={{ fontSize:'11px', color:'#D97706', background:'#FEF3C7', padding:'2px 8px', borderRadius:'8px', fontWeight:600, cursor:'pointer' }}
                              onClick={e => { e.stopPropagation(); setModalData(r) }}>Sin contrato — Editar</span>
                          )}
                        </td>
                        <td style={{ padding:'10px 14px' }}>
                          {(() => {
                            const cl = clasifDe(r)
                            const mixto = cl === 'MIXTO'
                            return (
                              <span
                                title={mixto
                                  ? 'El depósito se repartió entre dos o más conceptos — abre el detalle para ver la distribución'
                                  : r.clasificacion_manual ? 'Clasificación elegida a mano' : undefined}
                                style={{ display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'11px', fontWeight:600, padding:'2px 8px', borderRadius:'10px', background: (TIPO_COLOR[cl] || '#6B7280') + '18', color: TIPO_COLOR[cl] || '#6B7280' }}>
                                {mixto && <Layers size={11} />}{cl}
                              </span>
                            )
                          })()}
                        </td>
                        {/* Docs: factura + comprobante */}
                        <td style={{ padding:'10px 14px', whiteSpace:'nowrap' }}>
                          <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                            {r.factura
                              ? <span title={`Factura: ${r.factura}`} style={{ display:'inline-flex', alignItems:'center', gap:'3px', fontSize:'11px', fontWeight:600, color:'#0A66C2', background:'#EFF6FF', padding:'2px 7px', borderRadius:'10px' }}>
                                  <FileText size={11} /> {r.factura}
                                </span>
                              : <span style={{ fontSize:'11px', color:'#D1D5DB' }} title="Sin factura"><FileText size={13} /></span>
                            }
                            {r.comprobante_url
                              ? <EnlacePrivado bucket="facturas-cfdi" valor={r.comprobante_url} title="Ver comprobante"
                                  style={{ display:'inline-flex', alignItems:'center', color:'#057642', background:'#D1FAE5', padding:'3px 6px', borderRadius:'8px' }}>
                                  <Paperclip size={12} />
                                </EnlacePrivado>
                              : <span style={{ fontSize:'11px', color:'#D1D5DB' }} title="Sin comprobante"><Paperclip size={13} /></span>
                            }
                          </div>
                        </td>
                        {/* Cuadre: el depósito contra lo que se repartió en la cartera */}
                        <td style={{ padding:'10px 14px', textAlign:'center' }}>
                          <IconoCuadre d={descuadres[r.id]} />
                        </td>
                        <td style={{ padding:'10px 14px', whiteSpace:'nowrap' }}
                          title={r.validado_por ? `Validó ${r.validado_por}${r.validado_en ? ` el ${r.validado_en.slice(0,10)}` : ''}` : undefined}>
                          <BadgeValidacion estatus={r.estatus_validacion} />
                        </td>
                        <td style={{ padding:'10px 14px', textAlign:'right', fontWeight:600, fontSize:'12px', color: r.renta_mensual ? '#374151' : '#D1D5DB' }}>
                          {r.renta_mensual ? fmt(r.renta_mensual) : '—'}
                        </td>
                        <td style={{ padding:'10px 14px', textAlign:'right', fontWeight:700, fontSize:'13px', color: r.importe ? 'var(--color-success)' : '#9CA3AF' }}>
                          {fmt(r.importe)}
                        </td>
                        <td style={{ padding:'10px 14px', fontSize:'11px', color:'var(--color-text-light)', maxWidth:'180px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.nota || ''}</td>
                        <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>
                          <button onClick={e => { e.stopPropagation(); setVerDetalle(r) }} title="Ver detalle"
                            style={{ marginRight:'4px', padding:'5px 7px', background:'#EFF6FF', color:'#0A66C2', border:'none', borderRadius:'6px', cursor:'pointer', display:'inline-flex', alignItems:'center' }}><Eye size={13} /></button>
                          <button onClick={e => { e.stopPropagation(); setConfirmDel(r) }} title="Eliminar"
                            style={{ padding:'5px 7px', background:'#FEF2F2', color:'#B91C1C', border:'none', borderRadius:'6px', cursor:'pointer', display:'inline-flex', alignItems:'center' }}><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop:'2px solid #E5E7EB', background:'#F9FAFB' }}>
                      <td colSpan={6} style={{ padding:'10px 14px', fontSize:'12px', fontWeight:700, textAlign:'right' }}>TOTAL {MESES[filtroMes].toUpperCase()} {filtroAnio}</td>
                      <td style={{ padding:'10px 14px', textAlign:'right', fontWeight:600, fontSize:'13px', color:'#6B7280' }}>
                        {fmt(soloImportes.reduce((a, b) => a + (parseFloat(b.renta_mensual) || 0), 0))}
                      </td>
                      <td style={{ padding:'10px 14px', textAlign:'right', fontWeight:800, fontSize:'14px', color:'var(--color-primary)' }}>{fmt(totalMes)}</td>
                      <td /><td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
      </div>

      {modalData && (
        <IngresoModal
          ingreso={modalData === 'nuevo' ? null : modalData}
          onClose={() => setModalData(null)}
          onSaved={() => { setRefreshKey(k => k+1); setModalData(null) }}
        />
      )}

      {/* Modal Ver Detalle — visual completo */}
      {verDetalle && (() => {
        // Cargar aplicaciones al abrir
        if (verDetalle.id && detalleAplicaciones._ingresoId !== verDetalle.id) {
          supabase.from('aplicaciones_pago')
            .select('importe_aplicado, cargo:cargo_id(concepto, periodo_mes, periodo_anio)')
            .eq('ingreso_id', verDetalle.id)
            .then(({ data }) => setDetalleAplicaciones(Object.assign(data || [], { _ingresoId: verDetalle.id })))
        }
        // El comprobante manda el ancho: con él, el modal se abre a dos columnas
        // (≈620 px de datos + ≈620 px de comprobante, que es lo mínimo para leer
        // la referencia de una transferencia sin ampliar). Sin comprobante se
        // queda angosto: ensancharlo de gancho solo dejaría medio modal vacío.
        const tieneComprobante = !!verDetalle.comprobante_url
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}
            onClick={() => { setVerDetalle(null); setDetalleAplicaciones([]) }}>
            <div style={{ background:'white', borderRadius:'14px', width: tieneComprobante ? '96vw' : '90vw', maxWidth: tieneComprobante ? '1280px' : '720px', maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden' }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div style={{ padding:'14px 20px', background:'var(--color-primary)', color:'white', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:'14px' }}>Ingreso registrado</div>
                  <div style={{ fontSize:'11px', opacity:0.85 }}>
                    {verDetalle.locales_display ? `${verDetalle.locales_display} · ` : ''}{verDetalle.arrendatario_nombre || verDetalle.folio || ''}
                  </div>
                </div>
                <button onClick={() => { setVerDetalle(null); setDetalleAplicaciones([]) }} style={{ background:'none', border:'none', cursor:'pointer', color:'white' }}><X size={18} /></button>
              </div>

              <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'grid',
                gridTemplateColumns: tieneComprobante ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr',
                gap:'18px', alignItems:'start' }}>

                {/* Columna de datos */}
                <div style={{ minWidth:0 }}>

                {/* ── BLOQUE 1: Local + Importe + Fecha ── */}
                <div style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap:'10px', alignItems:'center', padding:'14px 16px', background:'#F0FDF4', borderRadius:'12px', border:'1px solid #BBF7D0', marginBottom:'14px' }}>
                  {/* Local badge */}
                  <div style={{ textAlign:'center' }}>
                    {verDetalle.locales_display && (
                      <span style={{ display:'block', fontSize:'13px', fontWeight:800, color:'#0A66C2', background:'#EFF6FF', padding:'4px 10px', borderRadius:'10px' }}>{verDetalle.locales_display}</span>
                    )}
                    {(() => {
                      const cl = clasifDe(verDetalle)
                      return (
                        <span title={verDetalle.clasificacion_manual ? 'Clasificación elegida a mano' : 'Clasificación deducida de la distribución'}
                          style={{ fontSize:'11px', fontWeight:600, padding:'2px 8px', borderRadius:'8px', background: (TIPO_COLOR[cl]||'#6B7280')+'18', color: TIPO_COLOR[cl]||'#6B7280', marginTop:'4px', display:'inline-flex', alignItems:'center', gap:'4px' }}>
                          {cl === 'MIXTO' && <Layers size={11} />}{cl}
                        </span>
                      )
                    })()}
                  </div>
                  {/* Importe */}
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:'11px', fontWeight:700, color:'#6B7280', textTransform:'uppercase' }}>Importe</div>
                    <div style={{ fontSize:'28px', fontWeight:800, color:'var(--color-success)', lineHeight:1.1 }}>{fmt(verDetalle.importe)}</div>
                    <div style={{ fontSize:'11px', color:'#6B7280' }}>{MESES[verDetalle.mes]} {verDetalle.anio}</div>
                  </div>
                  {/* Fecha */}
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:'10px', fontWeight:700, color:'#9CA3AF', textTransform:'uppercase' }}>Fecha pago</div>
                    <div style={{ fontSize:'13px', fontWeight:700, color:'#111827' }}>{verDetalle.fecha?.slice(0,10)}</div>
                    {verDetalle.origen && <div style={{ fontSize:'10px', color:'#6B7280', marginTop:'2px' }}>{verDetalle.origen}</div>}
                    <div style={{ marginTop:'5px' }}><BadgeValidacion estatus={verDetalle.estatus_validacion} /></div>
                    {verDetalle.estatus_validacion === 'VALIDADO' && verDetalle.validado_por && (
                      <div style={{ fontSize:'10px', color:'#6B7280', marginTop:'3px' }}>
                        {verDetalle.validado_por}
                        {verDetalle.validado_en && <><br />{verDetalle.validado_en.slice(0,10)}</>}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── BLOQUE 2: Distribución aplicada ── */}
                {detalleAplicaciones.length > 0 && (
                  <div style={{ marginBottom:'14px' }}>
                    <div style={{ fontSize:'11px', fontWeight:700, color:'#6B7280', textTransform:'uppercase', marginBottom:'6px' }}>Distribución del depósito</div>
                    <div style={{ border:'1px solid #E5E7EB', borderRadius:'8px', overflow:'hidden' }}>
                      {detalleAplicaciones.map((a, i) => (
                        <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', borderTop: i > 0 ? '1px solid #F3F4F6' : 'none', background:'white' }}>
                          <div>
                            <span style={{ fontSize:'12px', fontWeight:700, color: TIPO_COLOR[a.cargo?.concepto] || '#374151' }}>{a.cargo?.concepto || '—'}</span>
                            {a.cargo?.periodo_mes && <span style={{ fontSize:'10px', color:'#9CA3AF', marginLeft:'6px' }}>{MESES[a.cargo.periodo_mes]}/{a.cargo.periodo_anio}</span>}
                          </div>
                          <span style={{ fontSize:'13px', fontWeight:700, color:'var(--color-success)' }}>{fmt(a.importe_aplicado)}</span>
                        </div>
                      ))}
                      {(() => {
                        const aplicado = detalleAplicaciones.reduce((s, a) => s + (parseFloat(a.importe_aplicado) || 0), 0)
                        const dif = aplicado - (parseFloat(verDetalle.importe) || 0)
                        const descuadra = Math.abs(dif) > 0.01
                        return (
                          <>
                            <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 12px', borderTop:'2px solid #E5E7EB', background:'#F9FAFB' }}>
                              <span style={{ fontSize:'12px', fontWeight:700, color:'#374151' }}>Total aplicado</span>
                              <span style={{ fontSize:'13px', fontWeight:800, color: descuadra ? 'var(--color-danger)' : 'var(--color-primary)' }}>
                                {fmt(aplicado)}
                              </span>
                            </div>
                            {/* La distribución tiene que sumar exactamente el depósito. Si no
                                cuadra, hay cargos dados por pagados con dinero que no entró
                                (o dinero recibido sin asignar): se dice aquí, no se calla. */}
                            {descuadra && (
                              <div style={{ display:'flex', gap:'7px', alignItems:'center', padding:'8px 12px', background:'#FEF2F2', borderTop:'1px solid #FECACA', fontSize:'12px', color:'var(--color-danger)' }}>
                                <AlertCircle size={14} style={{ flexShrink:0 }} />
                                <span>
                                  No cuadra con el depósito de <strong>{fmt(verDetalle.importe)}</strong>:{' '}
                                  {dif > 0 ? <>se aplicaron <strong>{fmt(dif)}</strong> de más</> : <>faltan <strong>{fmt(Math.abs(dif))}</strong> por aplicar</>}.
                                </span>
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                )}

                {/* Sin comprobante no hay evidencia que mirar, y este modal es
                    justo donde se decide si el pago se valida. Se dice aquí. */}
                {!tieneComprobante && (
                  <div style={{ marginBottom:'14px', padding:'12px 14px', borderRadius:'10px',
                    border:`1.5px dashed ${verDetalle.estatus_validacion === 'VALIDADO' ? '#D1D5DB' : '#FDE68A'}`,
                    background: verDetalle.estatus_validacion === 'VALIDADO' ? '#F9FAFB' : '#FFFBEB',
                    display:'flex', gap:'8px', alignItems:'flex-start' }}>
                    <Paperclip size={14} style={{ flexShrink:0, marginTop:'2px', color: verDetalle.estatus_validacion === 'VALIDADO' ? '#9CA3AF' : '#D97706' }} />
                    <div style={{ fontSize:'12px', color: verDetalle.estatus_validacion === 'VALIDADO' ? '#6B7280' : '#92400E' }}>
                      <div style={{ fontWeight:700, marginBottom:'2px' }}>Sin comprobante adjunto</div>
                      {(verDetalle.estatus_validacion || VALIDACION_DEFAULT) === 'POR_VALIDAR'
                        ? <>Este ingreso está <strong>por validar</strong> y no tiene con qué: pide la ficha
                            o la captura de la transferencia y adjúntala desde <strong>Editar</strong> antes de darlo por validado.</>
                        : 'Puedes adjuntarlo desde Editar.'}
                    </div>
                  </div>
                )}

                {/* ── BLOQUE 4: Otros datos ── */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 16px' }}>
                  {[
                    ['Factura', verDetalle.factura],
                    ['Concepto', verDetalle.concepto_origen],
                    ['Folio contrato', verDetalle.folio],
                  ].filter(([,v]) => v).map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize:'10px', fontWeight:700, color:'#9CA3AF', textTransform:'uppercase' }}>{k}</div>
                      <div style={{ fontSize:'12px', fontWeight:600, color:'#111827' }}>{v}</div>
                    </div>
                  ))}
                </div>

                {verDetalle.nota && (
                  <div style={{ marginTop:'12px', padding:'10px 14px', background:'#FFFBEB', borderRadius:'8px', border:'1px solid #FDE68A', fontSize:'13px', color:'#92400E' }}>
                    <span style={{ fontWeight:700 }}>Nota: </span>{verDetalle.nota}
                  </div>
                )}
                </div>

                {/* Columna del comprobante — la evidencia queda al costado de los
                    datos, a la vista mientras se decide si el pago se valida. */}
                {tieneComprobante && (
                  <div style={{ minWidth:0, position:'sticky', top:0 }}>
                    <div style={{ fontSize:'11px', fontWeight:700, color:'#6B7280', textTransform:'uppercase', marginBottom:'6px', display:'flex', alignItems:'center', gap:'5px' }}>
                      <Paperclip size={11} /> Comprobante
                    </div>
                    <VisorComprobante valor={verDetalle.comprobante_url} onAmpliar={u => setZoomComprobante(u)} />
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding:'12px 20px', borderTop:'1px solid #E5E7EB', display:'flex', gap:'8px', justifyContent:'flex-end', flexShrink:0 }}>
                <button onClick={() => { setVerDetalle(null); setDetalleAplicaciones([]); setModalData(verDetalle) }}
                  style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 16px', background:'#F3F4F6', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
                  <Pencil size={13} /> Editar
                </button>
                <button onClick={() => { setVerDetalle(null); setDetalleAplicaciones([]) }}
                  style={{ padding:'8px 18px', background:'var(--color-primary)', color:'white', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )
      })()}
      {/* Comprobante a pantalla completa: la letra chica de una transferencia no
          se lee en el panel. Se pinta al tamaño natural y se puede desplazar. */}
      {zoomComprobante && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:400, overflow:'auto', padding:'24px' }}
          onClick={() => setZoomComprobante(null)}>
          <div style={{ position:'fixed', top:'14px', right:'18px', display:'flex', gap:'8px', zIndex:401 }}>
            <a href={zoomComprobante} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              style={{ ...ACCION_VISOR, background:'rgba(255,255,255,0.92)' }}>
              <ExternalLink size={12} /> Abrir en otra pestaña
            </a>
            <button type="button" onClick={() => setZoomComprobante(null)}
              style={{ ...ACCION_VISOR, background:'rgba(255,255,255,0.92)', border:'none', cursor:'pointer' }}>
              <X size={12} /> Cerrar
            </button>
          </div>
          <img src={zoomComprobante} alt="Comprobante de pago ampliado" onClick={e => e.stopPropagation()}
            style={{ display:'block', margin:'40px auto 0', maxWidth:'none', background:'white', borderRadius:'8px' }} />
        </div>
      )}

      {confirmDel && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }} onClick={() => setConfirmDel(null)}>
          <div style={{ background:'white', borderRadius:'14px', padding:'28px', maxWidth:'400px', width:'100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight:700, fontSize:'16px', marginBottom:'8px' }}>¿Eliminar ingreso?</div>
            <div style={{ fontSize:'13px', color:'var(--color-text-light)', marginBottom:'20px' }}>
              {confirmDel.local_id} · {MESES[confirmDel.mes]} {confirmDel.anio} · {fmt(confirmDel.importe)}
            </div>
            <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
              <button onClick={() => setConfirmDel(null)} style={{ padding:'9px 18px', background:'#F3F4F6', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>Cancelar</button>
              <button onClick={() => eliminar(confirmDel)} style={{ padding:'9px 18px', background:'#B91C1C', color:'white', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:700, cursor:'pointer' }}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
