import { useModuleAudit, logAudit } from '../hooks/useAudit'
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Search, Plus, AlertTriangle, CheckCircle, Clock, TrendingUp,
  UserCheck, Download, X, ChevronRight, Briefcase, FileText,
  UserPlus, Link, Calendar, Phone, Mail, ArrowRight, RefreshCw,
  Upload, Filter, MoreVertical, ChevronDown, Edit2, Save,
  DollarSign, Send, Eye, ChevronUp, Printer, AlertCircle,
  LayoutGrid, LayoutList, MapPin, Award, Trash2
} from 'lucide-react'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { usePRP } from '../hooks/usePRP'
import { supabase, supabaseParking } from '../lib/supabase'
import ImportadorDocumento from '../components/ui/ImportadorDocumento'
import ConsultaChecadas from '../components/ui/ConsultaChecadas'
import toast from 'react-hot-toast'

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt$(n) { return '$' + (parseFloat(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 }) }

const AVATAR_COLORS = ['#0A66C2', '#057642', '#E8A020', '#B24020', '#6B21A8', '#0F766E', '#9D174D', '#92400E']
function Avatar({ nombre, foto, size = 36 }) {
  if (foto) return <img src={foto} alt={nombre} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  const initials = (nombre || 'NN').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase()
  const color = AVATAR_COLORS[(nombre || '').charCodeAt(0) % AVATAR_COLORS.length]
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.33 + 'px', fontWeight: 700, color, flexShrink: 0, border: `1.5px solid ${color}44` }}>
      {initials}
    </div>
  )
}

function SemaforoContrato({ valor, fechaFin }) {
  const MAP = { VENCIDO: ['var(--color-danger)', 'Vencido'], CRITICO: ['var(--color-danger)', 'Crítico'], ALERTA: ['var(--color-warning)', 'Alerta'], OK: ['var(--color-success)', ''], INDETERMINADO: ['#6B7280', 'Indefinido'] }
  const [color, label] = MAP[valor] || ['#6B7280', valor]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color, fontWeight: 600 }}>
        {valor === 'INDETERMINADO' ? 'Indefinido' : (fechaFin ?? label)}
      </span>
    </div>
  )
}

const TIPOS_DOC = ['INE', 'CURP', 'NSS', 'Comprobante domicilio', 'Foto', 'Contrato', 'Acta nacimiento', 'RFC', 'Carta no antecedentes']
const TIPOS_CONTRATO = [
  { id: 'TEMPORAL_3SEM', label: 'Temporal 3 semanas' },
  { id: 'TEMPORAL_30D',  label: 'Temporal 30 días' },
  { id: 'PRUEBA_90',     label: 'Prueba 90 días' },
  { id: 'INDEFINIDO',    label: 'Tiempo indefinido' },
]
const ETAPAS_CANDIDATO = ['NUEVO', 'DOCUMENTOS', 'ENTREVISTA', 'OFERTA', 'ACEPTADO', 'RECHAZADO']
const ETAPA_COLOR = { NUEVO: '#6B7280', DOCUMENTOS: '#E8A020', ENTREVISTA: '#0A66C2', OFERTA: '#8B5CF6', ACEPTADO: '#057642', RECHAZADO: '#B24020' }
const MOTIVOS_RECHAZO = ['No cumple perfil', 'No pasó entrevista', 'Documentos incompletos', 'No se presentó', 'Salario no acordado', 'Ya no está disponible', 'Otro']

/* ── Componentes reutilizables de formulario (nivel módulo para evitar remounts) ── */
function FieldWrapper({ label, children, span }) {
  return (
    <div style={span ? { gridColumn: '1 / -1' } : {}}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</label>
      {children}
    </div>
  )
}
function NominaInput({ value, onChange }) {
  return (
    <input type="number" step="0.01" min="0"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      style={{ width:72, padding:'4px 6px', border:'1px solid #E5E7EB', borderRadius:5, fontSize:12, textAlign:'right' }} />
  )
}

// ── Modal Nuevo Empleado ────────────────────────────────────────────────────
function NuevoEmpleadoModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    nombre: '', apellido_pat: '', apellido_mat: '',
    sexo: 'M', rfc: '', curp: '', nss: '',
    fecha_nacimiento: '', fecha_ingreso: new Date().toISOString().split('T')[0],
    puesto: '', area: '', departamento: '',
    salario_diario: '', email: '', celular: '',
    tipo_contrato: 'TEMPORAL_3SEM', fecha_fin_contrato: '',
    horario_trabajo: '', dia_descanso: '', forma_pago: 'TRANSFERENCIA',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const semanas3 = () => {
    const d = new Date(form.fecha_ingreso || Date.now())
    d.setDate(d.getDate() + 21)
    set('fecha_fin_contrato', d.toISOString().split('T')[0])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre || !form.apellido_pat || !form.salario_diario) return toast.error('Nombre, apellido y salario son obligatorios')
    setSaving(true)
    const { data: res, error } = await supabase.rpc('crear_empleado', {
      p_nombre: form.nombre, p_apellido_pat: form.apellido_pat,
      p_apellido_mat: form.apellido_mat || '',
      p_sexo: form.sexo, p_rfc: form.rfc || null, p_curp: form.curp || null,
      p_nss: form.nss || null, p_fecha_nacimiento: form.fecha_nacimiento || null,
      p_fecha_ingreso: form.fecha_ingreso, p_puesto: form.puesto || null,
      p_area: form.area || null, p_departamento: form.departamento || null,
      p_salario_diario: parseFloat(form.salario_diario) || null,
      p_email: form.email || null, p_celular: form.celular || null,
      p_tipo_contrato: form.tipo_contrato || null,
      p_fecha_fin_contrato: form.fecha_fin_contrato || null,
      p_horario_trabajo: form.horario_trabajo || null,
      p_dia_descanso: form.dia_descanso || null,
      p_forma_pago: form.forma_pago || 'TRANSFERENCIA',
    })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Empleado registrado')
    onCreated(); onClose()
  }

  const inp = (k, rest = {}) => (
    <input value={form[k]} onChange={e => set(k, e.target.value)}
      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #E5E7EB', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', ...rest.style }}
      {...rest} />
  )
  const F = FieldWrapper

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 14, width: 680, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserPlus size={18} color="var(--color-primary)" /> Nuevo Empleado
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <F label="Nombre(s)" ><input required value={form.nombre} onChange={e => set('nombre',e.target.value)} style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box' }} /></F>
          <F label="Apellido Paterno"><input required value={form.apellido_pat} onChange={e => set('apellido_pat',e.target.value)} style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box' }} /></F>
          <F label="Apellido Materno">{inp('apellido_mat')}</F>
          <F label="Sexo">
            <select value={form.sexo} onChange={e => set('sexo',e.target.value)} style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,background:'white' }}>
              <option value="M">Masculino</option><option value="F">Femenino</option>
            </select>
          </F>
          <F label="Fecha nacimiento">{inp('fecha_nacimiento', { type:'date' })}</F>
          <F label="Fecha ingreso">{inp('fecha_ingreso', { type:'date' })}</F>
          <F label="Puesto">{inp('puesto')}</F>
          <F label="Área">{inp('area')}</F>
          <F label="Departamento">{inp('departamento')}</F>
          <F label="Salario diario ($)"><input required type="number" step="0.01" value={form.salario_diario} onChange={e => set('salario_diario',e.target.value)} style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box' }} /></F>
          <F label="RFC">{inp('rfc', { placeholder:'AAA######XXX', style: { fontFamily:'monospace', textTransform:'uppercase' }})}</F>
          <F label="CURP">{inp('curp', { placeholder:'AAAA######XXXXXXXXXX', style: { fontFamily:'monospace', textTransform:'uppercase' }})}</F>
          <F label="NSS (IMSS)">{inp('nss', { placeholder:'Número de Seguridad Social' })}</F>
          <F label="Email">{inp('email', { type:'email' })}</F>
          <F label="Celular">{inp('celular')}</F>
          <F label="Horario de trabajo" span>
            <input value={form.horario_trabajo} onChange={e => set('horario_trabajo', e.target.value)}
              placeholder="Ej: Lunes a Sábado 8-16 hrs"
              style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box' }} />
          </F>
          <F label="Día de descanso">
            <select value={form.dia_descanso} onChange={e => set('dia_descanso', e.target.value)}
              style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,background:'white' }}>
              <option value="">— Seleccionar —</option>
              {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo','Sin descanso','-'].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </F>
          <F label="Forma de pago">
            <select value={form.forma_pago} onChange={e => set('forma_pago', e.target.value)}
              style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,background:'white' }}>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="EFECTIVO">Efectivo</option>
              <option value="MIXTO">Mixto (Transfer + Efectivo)</option>
            </select>
          </F>
          <div style={{ gridColumn: '1 / -1', background: '#F0F7FF', borderRadius: 8, padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
            <F label="Tipo de Contrato">
              <select value={form.tipo_contrato} onChange={e => set('tipo_contrato',e.target.value)} style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,background:'white' }}>
                {TIPOS_CONTRATO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </F>
            <F label="Vencimiento contrato">{inp('fecha_fin_contrato', { type:'date' })}</F>
            <button type="button" onClick={semanas3} style={{ padding:'8px 12px',border:'1.5px solid #7B5EA7',borderRadius:7,fontSize:12,fontWeight:600,color:'#7B5EA7',background:'white',cursor:'pointer' }}>
              +3 semanas
            </button>
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex:1,padding:10,border:'1.5px solid #E5E7EB',borderRadius:8,background:'white',cursor:'pointer',fontWeight:600,fontSize:13 }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ flex:2,padding:10,border:'none',borderRadius:8,background:'var(--color-primary)',color:'white',cursor:'pointer',fontWeight:700,fontSize:14,opacity:saving?.7:1 }}>
              {saving ? 'Registrando…' : 'Registrar empleado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal Renovar Contrato ──────────────────────────────────────────────────
function RenovarContratoModal({ empleado, onClose, onSaved }) {
  const hoy = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({ tipo_contrato: 'TEMPORAL_3SEM', fecha_inicio: hoy, fecha_fin: '', salario_diario: empleado.salario_diario || '' })
  const [saving, setSaving] = useState(false)

  const semanas3 = () => {
    const d = new Date(form.fecha_inicio || Date.now())
    d.setDate(d.getDate() + 21)
    setForm(p => ({ ...p, fecha_fin: d.toISOString().split('T')[0] }))
  }

  const guardar = async () => {
    if (!form.fecha_inicio || !form.tipo_contrato) return toast.error('Tipo y fecha inicio son obligatorios')
    setSaving(true)
    await supabase.from('rh_contratos').update({ activo: false }).eq('empleado_id', empleado.id).eq('activo', true)
    const { error } = await supabase.from('rh_contratos').insert({
      empleado_id: empleado.id,
      tipo_contrato: form.tipo_contrato,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin || null,
      salario_diario: parseFloat(form.salario_diario) || null,
      activo: true,
    })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Contrato renovado')
    onSaved(); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 12, width: 480, maxWidth: '95vw', padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Renovar Contrato — {empleado.nombre_completo}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {[['Tipo de contrato', <select value={form.tipo_contrato} onChange={e => setForm(p => ({...p, tipo_contrato:e.target.value}))} style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,background:'white' }}>{TIPOS_CONTRATO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>],
             ['Fecha inicio', <input type="date" value={form.fecha_inicio} onChange={e => setForm(p=>({...p,fecha_inicio:e.target.value}))} style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box' }} />],
             ['Vencimiento', <div style={{ display:'flex',gap:8 }}><input type="date" value={form.fecha_fin} onChange={e => setForm(p=>({...p,fecha_fin:e.target.value}))} style={{ flex:1,padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box' }} /><button onClick={semanas3} style={{ padding:'8px 10px',border:'1.5px solid #7B5EA7',borderRadius:7,fontSize:12,fontWeight:600,color:'#7B5EA7',background:'white',cursor:'pointer',whiteSpace:'nowrap' }}>+3 sem</button></div>],
             ['Salario diario ($)', <input type="number" step="0.01" value={form.salario_diario} onChange={e => setForm(p=>({...p,salario_diario:e.target.value}))} style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box' }} />]
          ].map(([lbl, ctrl]) => (
            <div key={lbl}>
              <label style={{ fontSize:11,fontWeight:700,color:'var(--color-text-light)',display:'block',marginBottom:4,textTransform:'uppercase' }}>{lbl}</label>
              {ctrl}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex:1,padding:10,border:'1.5px solid #E5E7EB',borderRadius:8,background:'white',cursor:'pointer',fontWeight:600 }}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ flex:2,padding:10,border:'none',borderRadius:8,background:'var(--color-primary)',color:'white',cursor:'pointer',fontWeight:700 }}>
            {saving ? 'Guardando…' : 'Renovar contrato'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Editar Empleado ───────────────────────────────────────────────────
const DIAS_DESCANSO = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo','Sin descanso','-']
const ESTADOS_CIVILES = ['Soltero(a)','Casado(a)','Unión libre','Divorciado(a)','Viudo(a)']
const ESCOLARIDADES = ['Primaria','Secundaria','Preparatoria','Técnico','Licenciatura','Posgrado']
const TIPOS_JORNADA = ['Jornada completa','Media jornada','Jornada reducida','Turno nocturno','Fin de semana']
const TIPOS_CONTRATACION = ['Por tiempo determinado','Indeterminado','Por obra']
const BANCOS = [
  'BBVA','Banorte','Santander','Banamex','HSBC','Scotiabank','Inbursa',
  'Azteca','BanCoppel','Afirme','BanBajío','Banregio','Nu','Klar','Otro',
]

// Encabezado de sección dentro del formulario de dos columnas.
function Seccion({ titulo }) {
  return (
    <div style={{ gridColumn:'1 / -1', marginTop:6, paddingBottom:4, borderBottom:'1.5px solid #E5E7EB' }}>
      <span style={{ fontSize:11, fontWeight:800, color:'var(--color-primary)', textTransform:'uppercase', letterSpacing:'.06em' }}>
        {titulo}
      </span>
    </div>
  )
}

// Campos que el formulario administra. Se listan aparte para poder cargarlos
// y guardarlos sin repetir la lista tres veces.
const CAMPOS_EMPLEADO = [
  'nombre','apellido_pat','apellido_mat','sexo','rfc','curp','nss',
  'fecha_nacimiento','estado_civil','nacionalidad','lugar_nacimiento','escolaridad',
  'fecha_ingreso','puesto','area','departamento','centro_trabajo','supervisor',
  'tipo_jornada','tipo_contratacion',
  'hora_entrada_prog','hora_salida_prog','cruza_medianoche',
  'salario_diario','forma_pago','bono','forma_pago_bono','banco','cuenta_clabe',
  'email','celular','telefono_fijo',
  'calle','numero_ext','numero_int','colonia','municipio','estado_domicilio',
  'codigo_postal','referencias_domicilio','direccion',
  'contacto_emergencia_nombre','contacto_emergencia_telefono','contacto_emergencia_parentesco',
  'horario_trabajo','dia_descanso','notas',
]

const CAMPOS_MAYUSCULA = ['nombre','apellido_pat','apellido_mat','rfc','curp']
const CAMPOS_FECHA     = ['fecha_nacimiento','fecha_ingreso']

function EditarEmpleadoModal({ emp, onClose, onSaved }) {
  const vacio = Object.fromEntries(CAMPOS_EMPLEADO.map(k => [k, '']))
  const [form, setForm] = useState({ ...vacio, sexo: 'M', forma_pago: 'TRANSFERENCIA', forma_pago_bono: 'TRANSFERENCIA', tipo_contratacion: 'Indeterminado' })
  const [cargando, setCargando] = useState(true)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Se lee de rh_empleados y NO de la fila de prp_empleados que llega en `emp`:
  // la vista no expone fecha_nacimiento, direccion, banco ni cuenta_clabe, así
  // que partir de ella dejaba esos campos vacíos y el guardado los borraba.
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const { data, error } = await supabase
        .from('rh_empleados').select('*').eq('id', emp.id).maybeSingle()
      if (cancelado) return
      if (error) {
        toast.error('No se pudieron cargar los datos: ' + error.message)
        setCargando(false)
        return
      }
      const fila = data ?? {}
      setForm({
        ...vacio,
        ...Object.fromEntries(
          CAMPOS_EMPLEADO.map(k => [k, fila[k] == null ? '' : String(fila[k])])
        ),
        sexo:       fila.sexo       || 'M',
        forma_pago: fila.forma_pago || 'TRANSFERENCIA',
        // Postgres regresa TIME como "07:00:00"; el input type="time" quiere "07:00".
        hora_entrada_prog: fila.hora_entrada_prog ? String(fila.hora_entrada_prog).slice(0, 5) : '',
        hora_salida_prog:  fila.hora_salida_prog  ? String(fila.hora_salida_prog).slice(0, 5)  : '',
        cruza_medianoche:  fila.cruza_medianoche ? 'true' : 'false',
      })
      setCargando(false)
    })()
    return () => { cancelado = true }
  }, [emp.id])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre || !form.apellido_pat) return toast.error('Nombre y apellido son obligatorios')
    if (form.cuenta_clabe && !/^\d{18}$/.test(form.cuenta_clabe.replace(/\s/g, '')))
      return toast.error('La CLABE debe tener 18 dígitos')
    setSaving(true)

    const payload = Object.fromEntries(CAMPOS_EMPLEADO.map(k => {
      const v = (form[k] ?? '').toString().trim()
      if (CAMPOS_MAYUSCULA.includes(k)) return [k, v.toUpperCase() || null]
      if (CAMPOS_FECHA.includes(k))     return [k, v || null]
      return [k, v || null]
    }))
    payload.salario_diario = parseFloat(form.salario_diario) || null
    payload.forma_pago     = form.forma_pago || 'TRANSFERENCIA'
    payload.sexo           = form.sexo
    payload.cuenta_clabe   = form.cuenta_clabe ? form.cuenta_clabe.replace(/\s/g, '') : null
    // Booleano real: el mapeo genérico de arriba lo dejaría como el string
    // "false" (truthy), que se guardaría como si estuviera marcado.
    payload.cruza_medianoche  = form.cruza_medianoche === 'true'
    payload.hora_entrada_prog = form.hora_entrada_prog || null
    payload.hora_salida_prog  = form.hora_salida_prog || null

    const { error } = await supabase
      .from('rh_empleados')
      .update(payload)
      .eq('id', emp.id)
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Empleado actualizado')
    onSaved()
    onClose()
  }

  const inp = (k, extra = {}) => (
    <input value={form[k]} onChange={e => set(k, e.target.value)}
      style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box' }}
      {...extra} />
  )
  const sel = (k, opts) => (
    <select value={form[k]} onChange={e => set(k, e.target.value)}
      style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,background:'white' }}>
      {opts}
    </select>
  )
  const F = FieldWrapper

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }} onClick={onClose}>
      <div style={{ background:'white',borderRadius:14,width:700,maxWidth:'96vw',maxHeight:'92vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,.25)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding:'18px 24px',borderBottom:'1px solid #E5E7EB',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,background:'white',zIndex:1 }}>
          <h2 style={{ margin:0,fontSize:17,fontWeight:700,display:'flex',alignItems:'center',gap:8 }}>
            <Edit2 size={17} color="var(--color-primary)" /> Modificar Empleado — {emp.nombre_completo}
          </h2>
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer' }}><X size={20} /></button>
        </div>

        {cargando ? (
          <div style={{ padding:'40px 24px',textAlign:'center',color:'var(--color-text-light)',fontSize:13 }}>
            Cargando datos del empleado…
          </div>
        ) : (
        <form onSubmit={handleSubmit} style={{ padding:'20px 24px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:14 }}>
          {/* Rellena los campos del formulario, no guarda: así se revisa antes
              de dar Guardar cambios. */}
          <div style={{ gridColumn:'1 / -1' }}>
            <ImportadorDocumento
              etiquetaAplicar="Rellenar formulario"
              onAplicar={cambios => {
                setForm(f => ({ ...f, ...cambios }))
                toast.success(`${Object.keys(cambios).length} campos rellenados — revisa y guarda`)
              }}
            />
          </div>

          {/* ── Datos personales ── */}
          <Seccion titulo="Datos personales" />
          <F label="Nombre(s)"><input required value={form.nombre} onChange={e => set('nombre',e.target.value)} style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box' }} /></F>
          <F label="Apellido Paterno"><input required value={form.apellido_pat} onChange={e => set('apellido_pat',e.target.value)} style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box' }} /></F>
          <F label="Apellido Materno">{inp('apellido_mat')}</F>
          <F label="Sexo">{sel('sexo', [<option key="M" value="M">Masculino</option>, <option key="F" value="F">Femenino</option>])}</F>
          <F label="Fecha nacimiento">{inp('fecha_nacimiento', { type:'date' })}</F>
          <F label="Lugar de nacimiento">{inp('lugar_nacimiento', { placeholder:'Ciudad, Estado' })}</F>
          <F label="Estado civil">
            {sel('estado_civil', [
              <option key="" value="">— Seleccionar —</option>,
              ...ESTADOS_CIVILES.map(v => <option key={v} value={v}>{v}</option>),
            ])}
          </F>
          <F label="Nacionalidad">{inp('nacionalidad', { placeholder:'Mexicana' })}</F>
          <F label="Escolaridad">
            {sel('escolaridad', [
              <option key="" value="">— Seleccionar —</option>,
              ...ESCOLARIDADES.map(v => <option key={v} value={v}>{v}</option>),
            ])}
          </F>
          <F label="RFC">{inp('rfc', { placeholder:'RFC', style:{ fontFamily:'monospace',textTransform:'uppercase' } })}</F>
          <F label="CURP">{inp('curp', { placeholder:'CURP', style:{ fontFamily:'monospace',textTransform:'uppercase' } })}</F>
          <F label="NSS (IMSS)">{inp('nss')}</F>

          {/* ── Datos laborales ── */}
          <Seccion titulo="Datos laborales" />
          <F label="Fecha ingreso">{inp('fecha_ingreso', { type:'date' })}</F>
          <F label="Puesto">{inp('puesto')}</F>
          <F label="Área">{inp('area')}</F>
          <F label="Departamento">{inp('departamento')}</F>
          <F label="Centro de trabajo">{inp('centro_trabajo', { placeholder:'Ej: Plaza IWOL' })}</F>
          <F label="Supervisor">{inp('supervisor', { placeholder:'Nombre del jefe directo' })}</F>
          <F label="Tipo de jornada">
            {sel('tipo_jornada', [
              <option key="" value="">— Seleccionar —</option>,
              ...TIPOS_JORNADA.map(v => <option key={v} value={v}>{v}</option>),
            ])}
          </F>
          <F label="Tipo de contratación">
            {sel('tipo_contratacion', [
              <option key="" value="">— Seleccionar —</option>,
              ...TIPOS_CONTRATACION.map(v => <option key={v} value={v}>{v}</option>),
            ])}
          </F>
          <F label="Horario de trabajo" span>
            <input value={form.horario_trabajo} onChange={e => set('horario_trabajo', e.target.value)}
              placeholder="Ej: Lunes a Sábado 8-16 hrs"
              style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box' }} />
          </F>
          <F label="Día de descanso">
            {sel('dia_descanso', [
              <option key="" value="">— Seleccionar —</option>,
              ...DIAS_DESCANSO.map(d => <option key={d} value={d}>{d}</option>),
            ])}
          </F>
          <F label="Hora entrada programada">
            <input type="time" value={form.hora_entrada_prog} onChange={e => set('hora_entrada_prog', e.target.value)}
              style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box' }} />
          </F>
          <F label="Hora salida programada">
            <input type="time" value={form.hora_salida_prog} onChange={e => set('hora_salida_prog', e.target.value)}
              style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box' }} />
          </F>
          <F label="Turno cruza medianoche">
            <label style={{ display:'flex',alignItems:'center',gap:8,padding:'8px 0',fontSize:13,cursor:'pointer' }}>
              <input type="checkbox" checked={form.cruza_medianoche === 'true'}
                onChange={e => set('cruza_medianoche', e.target.checked ? 'true' : 'false')} />
              Sale al día siguiente (ej. turno de 24h)
            </label>
          </F>

          {/* ── Compensación y pago ── */}
          <Seccion titulo="Compensación y pago" />
          <F label="Salario diario ($)">
            <input required type="number" step="0.01" value={form.salario_diario}
              onChange={e => set('salario_diario', e.target.value)}
              style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box' }} />
          </F>
          <F label="Forma de pago">
            {sel('forma_pago', [
              <option key="T" value="TRANSFERENCIA">Transferencia</option>,
              <option key="E" value="EFECTIVO">Efectivo</option>,
              <option key="M" value="MIXTO">Mixto (Transfer + Efectivo)</option>,
            ])}
          </F>
          <F label="Bono ($)">
            <input type="number" step="0.01" value={form.bono} onChange={e => set('bono', e.target.value)}
              placeholder="0.00"
              style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box' }} />
          </F>
          <F label="Forma de pago del bono">
            {sel('forma_pago_bono', [
              <option key="T" value="TRANSFERENCIA">Transferencia</option>,
              <option key="E" value="EFECTIVO">Efectivo</option>,
            ])}
          </F>
          <F label="Banco">
            {sel('banco', [
              <option key="" value="">— Seleccionar —</option>,
              ...BANCOS.map(b => <option key={b} value={b}>{b}</option>),
            ])}
          </F>
          <F label="CLABE interbancaria">
            {inp('cuenta_clabe', { placeholder:'18 dígitos', maxLength:18, inputMode:'numeric', style:{ fontFamily:'monospace' } })}
          </F>

          {/* ── Contacto ── */}
          <Seccion titulo="Contacto" />
          <F label="Email">{inp('email', { type:'email' })}</F>
          <F label="Celular">{inp('celular')}</F>
          <F label="Teléfono fijo">{inp('telefono_fijo')}</F>
          <F label="Contacto de emergencia">{inp('contacto_emergencia_nombre', { placeholder:'Nombre completo' })}</F>
          <F label="Teléfono de emergencia">{inp('contacto_emergencia_telefono')}</F>
          <F label="Parentesco">{inp('contacto_emergencia_parentesco', { placeholder:'Ej: Esposa, Madre' })}</F>

          {/* ── Domicilio ── */}
          <Seccion titulo="Domicilio" />
          <F label="Calle" span>{inp('calle')}</F>
          <F label="Número exterior">{inp('numero_ext')}</F>
          <F label="Número interior">{inp('numero_int')}</F>
          <F label="Colonia">{inp('colonia')}</F>
          <F label="Código postal">{inp('codigo_postal', { maxLength:5, inputMode:'numeric' })}</F>
          <F label="Municipio / Alcaldía">{inp('municipio')}</F>
          <F label="Estado">{inp('estado_domicilio')}</F>
          <F label="Referencias" span>
            {inp('referencias_domicilio', { placeholder:'Entre calles, color de casa, etc.' })}
          </F>
          <F label="Domicilio en una línea (captura anterior)" span>
            {inp('direccion', { placeholder:'Se conserva de la captura previa' })}
          </F>

          {/* ── Notas ── */}
          <Seccion titulo="Notas" />
          <F label="Notas" span>
            <textarea value={form.notas} onChange={e => set('notas', e.target.value)} rows={2}
              style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box',resize:'vertical' }} />
          </F>

          {/* Botones */}
          <div style={{ gridColumn:'1 / -1',display:'flex',gap:10,paddingTop:4 }}>
            <button type="button" onClick={onClose}
              style={{ flex:1,padding:10,border:'1.5px solid #E5E7EB',borderRadius:8,background:'white',cursor:'pointer',fontWeight:600,fontSize:13 }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              style={{ flex:2,padding:10,border:'none',borderRadius:8,background:'var(--color-primary)',color:'white',cursor:'pointer',fontWeight:700,fontSize:14,opacity:saving?.7:1 }}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}

// ── Avatar con upload (modal detalle) ────────────────────────────────────────
function AvatarUploadSmall({ nombre, foto, uploading, inputRef, onChange }) {
  const [hovered, setHovered] = useState(false)
  const showOverlay = hovered || uploading
  return (
    <div style={{ position: 'relative', cursor: 'pointer', flexShrink: 0, width: 44, height: 44 }}
      onClick={() => inputRef.current?.click()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Cambiar foto">
      <Avatar nombre={nombre} foto={foto} size={44} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: showOverlay ? 1 : 0, transition: 'opacity .18s', pointerEvents: 'none' }}>
        {uploading
          ? <div style={{ width: 14, height: 14, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          : <Upload size={13} color="white" />}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={onChange} />
    </div>
  )
}

// ── Detalle de empleado ─────────────────────────────────────────────────────
function DetalleEmpleado({ emp, onClose, onRefresh }) {
  const [subModal, setSubModal] = useState(null) // 'renovar' | 'editar'
  const [fotoUrl, setFotoUrl] = useState(emp.foto_url)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const fotoInputRef = useRef(null)

  const handleFotoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFoto(true)
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      const path = `${emp.id}_${Date.now()}.${ext}`
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { toast.error('Sin sesión activa'); return }
      const base = import.meta.env.VITE_SUPABASE_URL
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(`${base}/storage/v1/object/avatars/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': file.type },
        body: file,
      })
      if (!res.ok) { const t = await res.text(); toast.error('Error foto: ' + t); return }
      const url = `${base}/storage/v1/object/public/avatars/${path}`
      await supabase.from('rh_empleados').update({ foto_url: url }).eq('id', emp.id)
      setFotoUrl(url)
      toast.success('Foto actualizada')
      onRefresh()
    } catch (err) {
      toast.error('Error: ' + err.message)
    } finally {
      setUploadingFoto(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 12, width: 560, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', top: 0, background: 'white' }}>
          {/* Avatar clickeable para cambiar foto */}
          <AvatarUploadSmall nombre={emp.nombre_completo} foto={fotoUrl} uploading={uploadingFoto} inputRef={fotoInputRef} onChange={handleFotoChange} />
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{emp.nombre_completo}</h2>
            <div style={{ fontSize: 12, color: 'var(--color-text-light)' }}>{emp.puesto} · {emp.numero_empleado}</div>
          </div>
          <SemaforoContrato valor={emp.semaforo_contrato} fechaFin={emp.contrato_fin} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 8 }}><X size={20} /></button>
        </div>

        <div style={{ padding: '18px 22px' }}>
          <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
            {[
              ['Departamento', emp.departamento ?? emp.area],
              ['Fecha ingreso', emp.fecha_ingreso],
              ['Antigüedad', emp.dias_antiguedad != null ? Math.floor(emp.dias_antiguedad / 365) + ' años, ' + (Math.floor(emp.dias_antiguedad / 30) % 12) + ' meses' : null],
              ['Salario mensual', emp.salario_mensual ? fmt$(emp.salario_mensual) : null],
              ['Salario diario', emp.salario_diario ? fmt$(emp.salario_diario) : null],
              ['Horario', emp.horario_trabajo],
              ['Día de descanso', emp.dia_descanso],
              ['Forma de pago', emp.forma_pago === 'TRANSFERENCIA' ? 'Transferencia' : emp.forma_pago === 'EFECTIVO' ? 'Efectivo' : emp.forma_pago === 'MIXTO' ? 'Mixto' : emp.forma_pago],
              ['Email', emp.email], ['Celular', emp.celular],
              ['RFC', emp.rfc], ['CURP', emp.curp], ['NSS', emp.nss],
              ['Tipo contrato', emp.tipo_contrato_nombre],
              ['Vencimiento contrato', emp.contrato_fin ?? 'Tiempo indeterminado'],
            ].filter(([,v]) => v).map(([label, val]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, borderBottom: '1px solid #F3F4F6', paddingBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-light)', fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 13, fontFamily: ['RFC','CURP','NSS'].includes(label) ? 'monospace' : 'inherit' }}>{val}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setSubModal('editar')}
              style={{ padding: '7px 12px', background: '#FFF7ED', border: '1.5px solid #E8A020', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#92400E', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Edit2 size={13} /> Modificar
            </button>
            <button onClick={() => setSubModal('renovar')}
              style={{ padding: '7px 12px', background: '#F5F3FF', border: '1.5px solid #7B5EA7', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#7B5EA7', display: 'flex', alignItems: 'center', gap: 5 }}>
              <RefreshCw size={13} /> Renovar Contrato
            </button>
          </div>
        </div>
      </div>
      {subModal === 'renovar' && (
        <RenovarContratoModal empleado={emp} onClose={() => setSubModal(null)} onSaved={() => { onRefresh(); setSubModal(null) }} />
      )}
      {subModal === 'editar' && (
        <EditarEmpleadoModal emp={emp} onClose={() => setSubModal(null)} onSaved={onRefresh} />
      )}
    </div>
  )
}


// Documentos que cuentan para el porcentaje de expediente completo.
// FOTO y CONSTANCIA_MEDICA quedan fuera a proposito: se archivan si existen,
// pero no bloquean la completitud del expediente.
const DOCS_OBLIGATORIOS = ['CONTRATO','INE','CURP','NSS','COMPROBANTE_DOM','ACTA_NAC','RFC']

// Mismo medidor que el encabezado del expediente, en tamaño de tarjeta.
function MedidorExpediente({ docs = [], size = 46 }) {
  const presentes = DOCS_OBLIGATORIOS.filter(t => docs.some(d => d.tipo === t)).length
  const pct = Math.round(presentes / DOCS_OBLIGATORIOS.length * 100)
  const color = pct === 100 ? '#057642' : pct >= 60 ? '#F59E0B' : '#B24020'
  const r = size / 2 - 4, circ = 2 * Math.PI * r
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E5E7EB" strokeWidth="4" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={circ - (pct/100)*circ}
          strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} />
        <text x={size/2} y={size/2 + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill={color}>{pct}%</text>
      </svg>
      <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>
        Expediente<br />{presentes}/{DOCS_OBLIGATORIOS.length} docs
      </div>
    </div>
  )
}

// ── Tab Empleados ───────────────────────────────────────────────────────────
function TabEmpleados({ onNuevo }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filtroArea, setFiltroArea] = useState('Todos')
  const [vistaGrid, setVistaGrid] = useState(true)
  const [sortCol, setSortCol] = useState('nombre_completo')
  const [sortDir, setSortDir] = useState('asc')
  // Documentos de todos los empleados, en una consulta, para el medidor de
  // cada tarjeta sin pedirlos uno por uno.
  const [docsPorEmpleado, setDocsPorEmpleado] = useState({})
  useEffect(() => {
    supabase.from('rh_expediente_documentos').select('empleado_id,tipo').then(({ data }) => {
      const m = {}
      for (const d of data ?? []) (m[d.empleado_id] ||= []).push(d)
      setDocsPorEmpleado(m)
    })
  }, [])
  const [selected, setSelected] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const { data, loading } = usePRP('prp_empleados', { order: { col: sortCol, dir: sortDir }, refreshKey })

  const toggleSort = (col) => {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const lista = data ?? []
  const activos = lista.filter(e => e.estado_id === 'ACTIVO')
  const areas = ['Todos', ...new Set(activos.map(e => e.area).filter(Boolean))]

  const filtrados = activos.filter(e => {
    const q = search.toLowerCase()
    return (!q || [e.nombre_completo, e.numero_empleado, e.puesto].some(v => (v||'').toLowerCase().includes(q)))
      && (filtroArea === 'Todos' || e.area === filtroArea)
  })

  const nomina = activos.reduce((s, e) => s + (parseFloat(e.salario_mensual) || 0), 0)
  const alertas = activos.filter(e => ['VENCIDO','CRITICO','ALERTA'].includes(e.semaforo_contrato)).length
  const indefinidos = activos.filter(e => e.semaforo_contrato === 'INDETERMINADO').length

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
        {[[activos.length, 'Activos', '#7B5EA7', Users], [fmt$(nomina), 'Nómina Mensual', '#057642', TrendingUp], [alertas, 'Alertas Contrato', '#F59E0B', AlertTriangle], [indefinidos, 'Tiempo Indefinido', '#5A4080', UserCheck]].map(([v, t, c, Icon]) => (
          <div key={t} style={{ background: 'white', borderRadius: 10, border: '1px solid #E5E7EB', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{t}</span>
              <Icon size={16} color={c} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empleado, # o puesto..."
            style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {areas.slice(0, 7).map(a => (
            <button key={a} onClick={() => setFiltroArea(a)}
              style={{ padding: '7px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid', borderColor: filtroArea===a ? '#7B5EA7' : '#E5E7EB', background: filtroArea===a ? '#7B5EA7' : 'white', color: filtroArea===a ? 'white' : 'var(--color-text-light)' }}>
              {a}
            </button>
          ))}
        </div>
        {/* Toggle vista */}
        <div style={{ display: 'flex', border: '1.5px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => setVistaGrid(true)} title="Vista tarjetas"
            style={{ padding: '7px 11px', background: vistaGrid ? '#7B5EA7' : 'white', color: vistaGrid ? 'white' : '#6B7280', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <LayoutGrid size={16} />
          </button>
          <button onClick={() => setVistaGrid(false)} title="Vista tabla"
            style={{ padding: '7px 11px', background: !vistaGrid ? '#7B5EA7' : 'white', color: !vistaGrid ? 'white' : '#6B7280', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <LayoutList size={16} />
          </button>
        </div>
        <button onClick={onNuevo} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#7B5EA7', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={14} /> Nuevo
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF' }}>Cargando…</div>
      ) : vistaGrid ? (
        /* ── Vista Grid tipo LinkedIn ── */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {filtrados.map(e => {
            const ini = (e.nombre_completo || 'NN').split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase()
            const colores = ['#0A66C2','#057642','#E8A020','#B24020','#6B21A8','#0F766E']
            const col = colores[(e.nombre_completo||'').charCodeAt(0) % colores.length]
            const antAnios = e.fecha_ingreso ? Math.floor((new Date()-new Date(e.fecha_ingreso+'T12:00:00'))/(1000*60*60*24*365)) : null
            return (
              <div key={e.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 4px rgba(0,0,0,.06)', transition: 'box-shadow .15s' }}
                onMouseEnter={ev => ev.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,.12)'}
                onMouseLeave={ev => ev.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,.06)'}>
                {/* Banner */}
                <div style={{ height: 56, background: `linear-gradient(135deg, #5A4080 0%, #7B5EA7 100%)`, position: 'relative', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 6, right: 8 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(255,255,255,0.22)', color: 'white', padding: '2px 8px', borderRadius: 10, letterSpacing: '.5px', textTransform: 'uppercase' }}>Expediente</span>
                  </div>
                  <div style={{ position: 'absolute', bottom: -28, left: '50%', transform: 'translateX(-50%)' }}>
                    {e.foto_url
                      ? <img src={e.foto_url} alt={e.nombre_completo} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '3px solid white', boxShadow: '0 2px 8px rgba(0,0,0,.2)' }} />
                      : <div style={{ width: 56, height: 56, borderRadius: '50%', background: col+'20', border: '3px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: col, boxShadow: '0 2px 8px rgba(0,0,0,.2)' }}>{ini}</div>
                    }
                  </div>
                </div>
                {/* Info */}
                <div style={{ padding: '36px 16px 14px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', lineHeight: 1.3 }}>{e.nombre_completo}</div>
                  <div style={{ fontSize: 12, color: '#7B5EA7', fontWeight: 600 }}>{e.puesto || '—'}</div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>{e.area || e.departamento || '—'}</div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 700, background: e.estado_id==='ACTIVO' ? '#dcfce7' : '#fee2e2', color: e.estado_id==='ACTIVO' ? '#166534' : '#991b1b' }}>{e.estado_id}</span>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: '#F3F4F6', color: '#374151', fontWeight: 600 }}>{e.numero_empleado}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 10, paddingTop: 10, borderTop: '1px solid #F3F4F6' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#111827' }}>{e.salario_mensual ? '$'+Math.round(e.salario_mensual/1000)+'K' : '—'}</div>
                      <div style={{ fontSize: 10, color: '#9CA3AF' }}>Mensual</div>
                    </div>
                    {antAnios != null && <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#111827' }}>{antAnios}a</div>
                      <div style={{ fontSize: 10, color: '#9CA3AF' }}>Antigüedad</div>
                    </div>}
                    <MedidorExpediente docs={docsPorEmpleado[e.id]} />
                  </div>
                </div>
                {/* Acciones */}
                <div style={{ borderTop: '1px solid #F3F4F6' }}>
                  <button onClick={() => navigate(`/rh/empleado/${e.id}`)}
                    style={{ width: '100%', padding: '9px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#7B5EA7', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <FileText size={13} /> Expediente
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  {[
                    { col: 'nombre_completo', label: 'Empleado' },
                    { col: 'numero_empleado', label: '# Emp' },
                    { col: 'puesto', label: 'Puesto / Área' },
                    { col: null, label: 'Horario' },
                    { col: null, label: 'Descanso' },
                    { col: null, label: 'Forma Pago' },
                    { col: 'salario_mensual', label: 'Salario Mensual' },
                    { col: null, label: 'Salario Semanal' },
                    { col: null, label: 'Tipo Contrato' },
                    { col: null, label: 'Vencimiento' },
                    { col: 'estado_id', label: 'Estado' },
                    { col: null, label: '' }
                  ].map(h => (
                    <th key={h.label} onClick={() => h.col && toggleSort(h.col)}
                      style={{
                        padding: '11px 14px',
                        textAlign: 'left',
                        fontWeight: 600,
                        fontSize: 11,
                        color: 'var(--color-text-light)',
                        whiteSpace: 'nowrap',
                        textTransform: 'uppercase',
                        letterSpacing: '.5px',
                        cursor: h.col ? 'pointer' : 'default',
                        background: sortCol === h.col ? '#E5E7EB' : 'transparent',
                        transition: 'background .15s'
                      }}>
                      {h.label}{h.col && (sortCol === h.col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map(e => (
                  <tr key={e.id} style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }}
                    onMouseEnter={ev => ev.currentTarget.style.background = '#F9FAFB'}
                    onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                    onClick={() => setSelected(e)}>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar nombre={e.nombre_completo} foto={e.foto_url} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{e.nombre_completo}</div>
                          {e.nss && <div style={{ fontSize: 11, color: 'var(--color-text-light)', fontFamily: 'monospace' }}>NSS: {e.nss}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#7B5EA7' }}>{e.numero_empleado}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontWeight: 500 }}>{e.puesto}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>{e.area ?? '—'}</div>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-light)' }} title={e.horario_trabajo}>
                      {e.horario_trabajo ?? '—'}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12 }}>
                      {e.dia_descanso ?? '—'}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, fontWeight: 600,
                        background: e.forma_pago === 'TRANSFERENCIA' ? '#EFF6FF' : e.forma_pago === 'EFECTIVO' ? '#F0FDF4' : '#FFFBEB',
                        color: e.forma_pago === 'TRANSFERENCIA' ? '#1D4ED8' : e.forma_pago === 'EFECTIVO' ? '#166534' : '#92400E' }}>
                        {e.forma_pago === 'TRANSFERENCIA' ? '🏦 Transfer' : e.forma_pago === 'EFECTIVO' ? '💵 Efectivo' : e.forma_pago === 'MIXTO' ? '↕ Mixto' : e.forma_pago ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{e.salario_mensual ? fmt$(e.salario_mensual) : '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>{e.salario_diario ? fmt$(e.salario_diario) + '/día' : ''}</div>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{e.salario_mensual ? fmt$(Math.round(e.salario_mensual / 4.33)) : '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>aprox./semana</div>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: 12, padding: '3px 8px', background: '#F3F4F6', borderRadius: 12 }}>{e.tipo_contrato_nombre ?? '—'}</span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <SemaforoContrato valor={e.semaforo_contrato} fechaFin={e.contrato_fin} />
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: e.estado_id==='ACTIVO' ? '#dcfce7' : '#fee2e2', color: e.estado_id==='ACTIVO' ? '#166534' : '#991b1b' }}>{e.estado_id}</span>
                    </td>
                    <td style={{ padding: '11px 14px' }} onClick={ev => ev.stopPropagation()}>
                      <button onClick={() => navigate(`/rh/empleado/${e.id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#7B5EA7', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'white', whiteSpace: 'nowrap' }}>
                        <FileText size={12} /> Expediente
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <DetalleEmpleado emp={selected} onClose={() => setSelected(null)} onRefresh={() => setRefreshKey(k => k+1)} />
      )}
    </div>
  )
}

// ── Modal nueva vacante ─────────────────────────────────────────────────────
function NuevaVacanteModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ titulo: '', area: '', num_plazas: 1, descripcion: '', perfil_requerido: '', salario_min: '', salario_max: '', tipo_contrato: 'TEMPORAL_3SEM', fecha_cierre: '' })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const guardar = async () => {
    if (!form.titulo) return toast.error('El título es obligatorio')
    setSaving(true)
    const { error } = await supabase.from('rh_vacantes').insert({
      titulo: form.titulo, area: form.area || null, num_plazas: +form.num_plazas || 1,
      descripcion: form.descripcion || null, perfil_requerido: form.perfil_requerido || null,
      salario_min: form.salario_min ? +form.salario_min : null,
      salario_max: form.salario_max ? +form.salario_max : null,
      tipo_contrato: form.tipo_contrato, fecha_cierre: form.fecha_cierre || null, status: 'ABIERTA',
    })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Vacante publicada')
    onSaved(); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 14, width: 560, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Nueva Vacante</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[['Puesto / Título', 'titulo', 'text', '1 / -1'], ['Área', 'area', 'text', null], ['# Plazas', 'num_plazas', 'number', null]].map(([l, k, t, span]) => (
            <div key={k} style={span ? { gridColumn: span } : {}}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>{l}</label>
              <input type={t} value={form[k]} onChange={set(k)} style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #E5E7EB', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          ))}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Descripción del puesto</label>
            <textarea value={form.descripcion} onChange={set('descripcion')} rows={3}
              style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #E5E7EB', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Perfil requerido</label>
            <textarea value={form.perfil_requerido} onChange={set('perfil_requerido')} rows={2} placeholder="Experiencia, estudios, habilidades..."
              style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #E5E7EB', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
          {[['Salario mínimo ($)', 'salario_min', 'number'], ['Salario máximo ($)', 'salario_max', 'number']].map(([l, k, t]) => (
            <div key={k}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>{l}</label>
              <input type={t} value={form[k]} onChange={set(k)} style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #E5E7EB', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          ))}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Tipo contrato</label>
            <select value={form.tipo_contrato} onChange={set('tipo_contrato')} style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #E5E7EB', borderRadius: 7, fontSize: 13, background: 'white' }}>
              {TIPOS_CONTRATO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Fecha cierre</label>
            <input type="date" value={form.fecha_cierre} onChange={set('fecha_cierre')} style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #E5E7EB', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ flex:1,padding:10,border:'1.5px solid #E5E7EB',borderRadius:8,background:'white',cursor:'pointer',fontWeight:600 }}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ flex:2,padding:10,border:'none',borderRadius:8,background:'#7B5EA7',color:'white',cursor:'pointer',fontWeight:700 }}>
            {saving ? 'Guardando…' : 'Publicar vacante'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tarjeta candidato con pipeline ─────────────────────────────────────────
function TarjetaCandidato({ c, vacantes, onRefresh }) {
  const [expanded, setExpanded] = useState(false)
  const [etapa, setEtapa] = useState(c.etapa)
  const [showRechazo, setShowRechazo] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [fechaEntrevista, setFechaEntrevista] = useState('')
  const [saving, setSaving] = useState(false)

  const linkCandidato = `${window.location.origin}/candidato/${c.token_docs}`

  const copiarLink = () => {
    navigator.clipboard.writeText(linkCandidato)
    toast.success('Link copiado al portapapeles')
  }

  const moverEtapa = async (nueva) => {
    if (nueva === 'RECHAZADO') { setShowRechazo(true); return }
    setSaving(true)
    const upd = { etapa: nueva }
    if (nueva === 'ACEPTADO') upd.fecha_respuesta = new Date().toISOString().split('T')[0]
    if (nueva === 'ENTREVISTA' && fechaEntrevista) upd.fecha_entrevista = fechaEntrevista
    await supabase.from('rh_candidatos').update(upd).eq('id', c.id)
    setEtapa(nueva)
    setSaving(false)
    toast.success('Etapa actualizada')
    onRefresh()
  }

  const rechazar = async () => {
    if (!motivoRechazo) return toast.error('Indica el motivo')
    setSaving(true)
    await supabase.from('rh_candidatos').update({ etapa: 'RECHAZADO', motivo_rechazo: motivoRechazo, fecha_respuesta: new Date().toISOString().split('T')[0] }).eq('id', c.id)
    setSaving(false)
    setShowRechazo(false)
    toast('Candidato rechazado')
    onRefresh()
  }

  const color = ETAPA_COLOR[etapa] || '#6B7280'

  return (
    <div style={{ background: 'white', border: `1.5px solid ${color}44`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <Avatar nombre={`${c.nombre} ${c.apellidos || ''}`} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{c.nombre} {c.apellidos}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>{c.vacante_puesto || 'Candidato general'} · {c.fecha_aplicacion}</div>
        </div>
        <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: color + '18', color, flexShrink: 0 }}>{etapa}</span>
        <ChevronDown size={16} style={{ color: '#9CA3AF', transform: expanded ? 'rotate(180deg)' : 'none', transition: '.2s' }} />
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #F3F4F6', padding: '14px', background: '#FAFAFA' }}>
          {/* Datos de contacto */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
            {c.email && <a href={`mailto:${c.email}`} style={{ display:'flex',gap:5,alignItems:'center',fontSize:12,color:'#7B5EA7',textDecoration:'none' }}><Mail size={13} />{c.email}</a>}
            {c.telefono && <a href={`tel:${c.telefono}`} style={{ display:'flex',gap:5,alignItems:'center',fontSize:12,color:'#7B5EA7',textDecoration:'none' }}><Phone size={13} />{c.telefono}</a>}
          </div>

          {/* Link para docs */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, background: '#F5F3FF', borderRadius: 8, padding: '8px 12px' }}>
            <Link size={14} color="#7B5EA7" />
            <span style={{ flex:1, fontSize:11, color:'#5A4080', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{linkCandidato}</span>
            <button onClick={copiarLink} style={{ padding:'4px 10px',border:'none',borderRadius:5,background:'#7B5EA7',color:'white',fontSize:11,fontWeight:700,cursor:'pointer',flexShrink:0 }}>Copiar</button>
          </div>

          {/* Pipeline de etapas */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {ETAPAS_CANDIDATO.filter(e => e !== etapa).map(e => (
              <button key={e} onClick={() => moverEtapa(e)} disabled={saving}
                style={{ padding: '5px 10px', border: `1.5px solid ${ETAPA_COLOR[e]}44`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: ETAPA_COLOR[e] + '12', color: ETAPA_COLOR[e] }}>
                → {e}
              </button>
            ))}
          </div>

          {/* Fecha entrevista si aplica */}
          {etapa === 'ENTREVISTA' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <Calendar size={14} />
              <input type="datetime-local" value={fechaEntrevista} onChange={e => setFechaEntrevista(e.target.value)}
                style={{ padding: '5px 10px', border: '1.5px solid #E5E7EB', borderRadius: 6, fontSize: 12 }} />
              <button onClick={() => moverEtapa('ENTREVISTA')} style={{ padding:'5px 10px',border:'none',borderRadius:6,background:'#7B5EA7',color:'white',fontSize:11,fontWeight:700,cursor:'pointer' }}>Guardar fecha</button>
            </div>
          )}

          {/* Motivo rechazo */}
          {c.motivo_rechazo && (
            <div style={{ fontSize: 12, color: '#B24020', background: '#FFF1F0', borderRadius: 6, padding: '6px 10px' }}>
              Rechazado: {c.motivo_rechazo}
            </div>
          )}
        </div>
      )}

      {/* Mini modal rechazo */}
      {showRechazo && (
        <div style={{ padding: '14px', borderTop: '1px solid #FEE2E2', background: '#FFF9F9' }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#B24020' }}>Motivo de rechazo</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {MOTIVOS_RECHAZO.map(m => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="radio" name={`rechazo-${c.id}`} value={m} onChange={e => setMotivoRechazo(e.target.value)} />
                {m}
              </label>
            ))}
            {motivoRechazo === 'Otro' && (
              <input placeholder="Especifica el motivo..." value={motivoRechazo === 'Otro' ? '' : motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)}
                style={{ padding: '7px 10px', border: '1.5px solid #E5E7EB', borderRadius: 6, fontSize: 13 }} />
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setShowRechazo(false)} style={{ flex:1,padding:8,border:'1.5px solid #E5E7EB',borderRadius:6,background:'white',cursor:'pointer',fontSize:12,fontWeight:600 }}>Cancelar</button>
            <button onClick={rechazar} disabled={saving} style={{ flex:1,padding:8,border:'none',borderRadius:6,background:'#B24020',color:'white',cursor:'pointer',fontSize:12,fontWeight:700 }}>Confirmar rechazo</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab Reclutamiento ────────────────────────────────────────────────────────
function TabReclutamiento() {
  const [showNuevaVacante, setShowNuevaVacante] = useState(false)
  const [showNuevoCandidato, setShowNuevoCandidato] = useState(false)
  const [vacSeleccionada, setVacSeleccionada] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey(k => k+1)
  const { data: vacantes, loading: vLoad } = usePRP('prp_vacantes', { order: { col: 'fecha_apertura', asc: false }, refreshKey })
  const { data: candidatos, loading: cLoad } = usePRP('prp_candidatos', { order: { col: 'created_at', asc: false }, refreshKey })
  const [formCand, setFormCand] = useState({ nombre: '', apellidos: '', email: '', telefono: '', vacante_id: '' })
  const [savingCand, setSavingCand] = useState(false)

  const lista_v = vacantes ?? []
  const lista_c = candidatos ?? []

  const agregarCandidato = async () => {
    if (!formCand.nombre) return toast.error('El nombre es obligatorio')
    setSavingCand(true)
    const { error } = await supabase.from('rh_candidatos').insert({
      nombre: formCand.nombre, apellidos: formCand.apellidos || null,
      email: formCand.email || null, telefono: formCand.telefono || null,
      vacante_id: formCand.vacante_id || null, etapa: 'NUEVO',
    })
    setSavingCand(false)
    if (error) return toast.error(error.message)
    toast.success('Candidato agregado — link generado')
    setShowNuevoCandidato(false)
    setFormCand({ nombre: '', apellidos: '', email: '', telefono: '', vacante_id: '' })
    refresh()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
      {/* Columna vacantes */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Vacantes Abiertas <span style={{ color: '#7B5EA7' }}>({lista_v.filter(v=>v.status==='ABIERTA').length})</span></h3>
          <button onClick={() => setShowNuevaVacante(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: '#7B5EA7', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={12} /> Vacante
          </button>
        </div>

        {lista_v.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 13 }}>Sin vacantes abiertas</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lista_v.map(v => (
              <div key={v.id} onClick={() => setVacSeleccionada(vacSeleccionada?.id === v.id ? null : v)}
                style={{ background: 'white', border: `1.5px solid ${vacSeleccionada?.id===v.id ? '#7B5EA7' : '#E5E7EB'}`, borderRadius: 10, padding: 14, cursor: 'pointer', transition: '.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{v.titulo}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 2 }}>{v.area || '—'} · {v.num_plazas} plaza{v.num_plazas > 1 ? 's' : ''}</div>
                  </div>
                  <span style={{ fontSize: 11, background: v.status==='ABIERTA'?'#dcfce7':'#F3F4F6', color: v.status==='ABIERTA'?'#166534':'#6B7280', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>{v.status}</span>
                </div>
                {(v.salario_min || v.salario_max) && (
                  <div style={{ fontSize: 12, color: '#057642', fontWeight: 600, marginTop: 6 }}>
                    {v.salario_min ? fmt$(v.salario_min) : ''} – {v.salario_max ? fmt$(v.salario_max) : ''}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>{TIPOS_CONTRATO.find(t=>t.id===v.tipo_contrato)?.label || v.tipo_contrato}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#7B5EA7' }}>{v.candidatos_activos || 0} candidatos</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Columna candidatos */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
            {vacSeleccionada ? `Candidatos — ${vacSeleccionada.titulo}` : 'Todos los candidatos'}
            <span style={{ color: '#7B5EA7', marginLeft: 6 }}>({lista_c.filter(c => !vacSeleccionada || c.vacante_id===vacSeleccionada.id).length})</span>
          </h3>
          <button onClick={() => setShowNuevoCandidato(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: '#057642', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <UserPlus size={12} /> Candidato
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cLoad ? <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Cargando…</div>
          : lista_c.filter(c => !vacSeleccionada || c.vacante_id === vacSeleccionada.id).length === 0
          ? <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 13 }}>Sin candidatos registrados</div>
          : lista_c.filter(c => !vacSeleccionada || c.vacante_id === vacSeleccionada.id).map(c => (
            <TarjetaCandidato key={c.id} c={c} vacantes={lista_v} onRefresh={refresh} />
          ))}
        </div>
      </div>

      {/* Modales */}
      {showNuevaVacante && <NuevaVacanteModal onClose={() => setShowNuevaVacante(false)} onSaved={refresh} />}

      {showNuevoCandidato && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowNuevoCandidato(false)}>
          <div style={{ background: 'white', borderRadius: 12, width: 440, padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Nuevo Candidato</h3>
              <button onClick={() => setShowNuevoCandidato(false)} style={{ background:'none',border:'none',cursor:'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[['Nombre(s)','nombre','text','1/-1'],['Apellidos','apellidos','text','1/-1'],['Email','email','email',null],['Teléfono','telefono','text',null]].map(([l,k,t,span]) => (
                <div key={k} style={span ? { gridColumn: span } : {}}>
                  <label style={{ fontSize:11,fontWeight:700,color:'var(--color-text-light)',display:'block',marginBottom:4,textTransform:'uppercase' }}>{l}</label>
                  <input type={t} value={formCand[k]} onChange={e => setFormCand(p=>({...p,[k]:e.target.value}))} style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,boxSizing:'border-box' }} />
                </div>
              ))}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize:11,fontWeight:700,color:'var(--color-text-light)',display:'block',marginBottom:4,textTransform:'uppercase' }}>Vacante</label>
                <select value={formCand.vacante_id} onChange={e => setFormCand(p=>({...p,vacante_id:e.target.value}))} style={{ width:'100%',padding:'8px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:13,background:'white' }}>
                  <option value="">Sin vacante específica</option>
                  {lista_v.map(v => <option key={v.id} value={v.id}>{v.titulo}</option>)}
                </select>
              </div>
            </div>
            <div style={{ background: '#F5F3FF', borderRadius: 8, padding: 12, marginTop: 14, fontSize: 12, color: '#7B5EA7' }}>
              Al guardar se generará automáticamente un link único para que el candidato suba sus documentos.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setShowNuevoCandidato(false)} style={{ flex:1,padding:10,border:'1.5px solid #E5E7EB',borderRadius:8,background:'white',cursor:'pointer',fontWeight:600 }}>Cancelar</button>
              <button onClick={agregarCandidato} disabled={savingCand} style={{ flex:2,padding:10,border:'none',borderRadius:8,background:'#057642',color:'white',cursor:'pointer',fontWeight:700 }}>
                {savingCand ? 'Guardando…' : 'Agregar y generar link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Import asistencia de checador ──────────────────────────────────────────
function ImportChecadorModal({ empleados, onClose, onImported }) {
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState([])
  const [importando, setImportando] = useState(false)
  const fileRef = useRef()

  // Cada renglón del checador es un MARCAJE, no un día. Antes se consolidaba
  // aquí mismo y las checadas intermedias —la salida a comer, el regreso— se
  // perdían. Ahora se guardan todas en rh_checadas y el día lo arma la base.
  const esHora = v => /^\d{1,2}:\d{2}/.test((v || '').trim())
  const hhmm   = v => { const [h, m] = v.trim().split(':'); return `${h.padStart(2,'0')}:${m.slice(0,2)}` }

  // Reloj checador crudo (ej. "ID. Nombre Depart. Tiempo IDdispositivo"):
  // fecha y hora vienen JUNTAS en una sola columna separadas por varios
  // espacios, y el orden de columnas no es el mismo que ZKTeco/BioTime
  // (aquí "Depart." va antes que la fecha, no después). Sin columna de
  // estatus, así que se infiere después alternando por orden cronológico.
  // Se busca la columna con esta forma sin importar en qué posición caiga,
  // en vez de asumir un orden fijo de columnas.
  const RE_FECHA_HORA_JUNTAS = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}:\d{2})$/
  // Variante sin ningún separador de columna real (todo quedó como una sola
  // cadena, p.ej. al pegar texto que perdió los tabs).
  const RE_MARCAJE_SIN_COLUMNAS = /^(\d+)\s+(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}:\d{2})\s+\d+\s*$/

  const parsear = (texto) => {
    const lineas = texto.trim().split('\n').filter(l => l.trim())
    const eventos = []
    const sinEstatus = []

    lineas.forEach(linea => {
      const cols = linea.split(/[,\t;]/).map(c => c.trim().replace(/"/g, ''))

      // Reloj: alguna columna trae "AAAA-MM-DD  HH:MM:SS" junta (sin importar
      // qué haya en las demás columnas ni en qué orden vengan).
      if (cols.length >= 2) {
        const idxFechaHora = cols.findIndex(c => RE_FECHA_HORA_JUNTAS.test(c))
        if (idxFechaHora >= 0 && !isNaN(parseInt(cols[0]))) {
          const [, fecha, hora] = cols[idxFechaHora].match(RE_FECHA_HORA_JUNTAS)
          const nombre = (cols[1] || '').trim().split(/\s+/)[0]
          if (nombre) sinEstatus.push({ numero: cols[0].trim(), nombre, fecha, hora: hhmm(hora) })
          return
        }
      }

      if (cols.length < 4) {
        const m = linea.trim().match(RE_MARCAJE_SIN_COLUMNAS)
        if (m) {
          const [, numero, nombreDepto, fecha, hora] = m
          sinEstatus.push({ numero, nombre: nombreDepto.trim().split(/\s+/)[0], fecha, hora: hhmm(hora) })
        }
        return
      }
      const [col0, col1, col2, col3, col4] = cols

      // Encabezado
      if (isNaN(parseInt(col0)) && !col0.toLowerCase().includes('e0')) return

      const numero = col0.toString().trim()
      const nombre = col1 || ''
      const fecha  = (col2 || '').replace(/\//g, '-')
      if (!fecha || !esHora(col3)) return

      // Formato de dos horarios: EmpCode,Nombre,Fecha,HoraEntrada,HoraSalida
      if (esHora(col4)) {
        eventos.push({ numero, nombre, fecha, hora: hhmm(col3), operacion: 'ENTRADA' })
        eventos.push({ numero, nombre, fecha, hora: hhmm(col4), operacion: 'SALIDA' })
        return
      }
      // Formato de marcaje: No,Nombre,Fecha,Hora,Status (0=entrada, 1=salida)
      const st = (col4 || '').trim().toLowerCase()
      const operacion = ['1','out','salida','check out','o','s'].includes(st) ? 'SALIDA' : 'ENTRADA'
      eventos.push({ numero, nombre, fecha, hora: hhmm(col3), operacion })
    })

    // Los marcajes crudos no traen estatus: se alternan ENTRADA/SALIDA por
    // EMPLEADO (cronológico completo, cruzando días), no por empleado+día.
    // Agrupar por día rompía los turnos de 24h que ponchan una sola vez
    // (entra 7:00 un día, sale 7:00 al siguiente): cada marcaje quedaba
    // como "el primero de su día" y todos salían ENTRADA, nunca SALIDA.
    const porEmpleado = {}
    sinEstatus.forEach(ev => { (porEmpleado[ev.numero] ||= []).push(ev) })
    Object.values(porEmpleado).forEach(grupo => {
      grupo.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
      grupo.forEach((ev, i) => eventos.push({ ...ev, operacion: i % 2 === 0 ? 'ENTRADA' : 'SALIDA' }))
    })

    return eventos.map(ev => {
      const primerNombre = (ev.nombre || '').toLowerCase().split(' ')[0]
      const emp = empleados.find(e => e.numero_empleado === ev.numero
        || (primerNombre && (e.nombre_completo || '').toLowerCase().includes(primerNombre)))
      return {
        empleado_id: emp?.id || null,
        numero_empleado_ext: ev.numero,
        operacion: ev.operacion,
        fecha_hora: `${ev.fecha} ${ev.hora}:00`,
        origen: 'ZKTeco_CSV',
        _fecha: ev.fecha,
        _hora: ev.hora,
        _nombre: ev.nombre,
        _nombre_match: emp?.nombre_completo,
      }
    })
  }

  // Vista previa por día: lo que verá el usuario, aunque se guarde por marcaje.
  const resumirDias = (evs) => {
    const porDia = {}
    evs.forEach(e => {
      const k = `${e.numero_empleado_ext}_${e._fecha}`
      if (!porDia[k]) porDia[k] = { ...e, entradas: [], salidas: [] }
      ;(e.operacion === 'ENTRADA' ? porDia[k].entradas : porDia[k].salidas).push(e._hora)
    })
    return Object.values(porDia).map(r => {
      const entrada = [...r.entradas].sort()[0] || null
      const salida  = [...r.salidas].sort().slice(-1)[0] || null
      const min = (entrada && salida)
        ? (() => { const [h1,m1] = entrada.split(':').map(Number), [h2,m2] = salida.split(':').map(Number)
                   return (h2*60+m2) - (h1*60+m1) })()
        : null
      return { ...r, entrada, salida, minutos: min, marcajes: r.entradas.length + r.salidas.length }
    }).sort((a, b) => (a._fecha + a.numero_empleado_ext).localeCompare(b._fecha + b.numero_empleado_ext))
  }

  const onFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target.result
      setCsv(text)
      setPreview(parsear(text))
    }
    reader.readAsText(file, 'utf-8')
  }

  const onTextChange = (e) => {
    setCsv(e.target.value)
    setPreview(parsear(e.target.value))
  }

  // Corrección antes de guardar. Dos cosas fallan seguido en un archivo de
  // checador: renglones que no se quieren (otra quincena, un visitante) y
  // gente que el aparato identifica con un número que no está en el catálogo.
  const [excluidos, setExcluidos] = useState({})   // clave empleado+fecha -> true
  const [asignados, setAsignados] = useState({})   // numero del checador -> empleado_id

  const claveDia = r => `${r.numero_empleado_ext}_${r._fecha}`

  // Se aplica lo asignado a mano antes de agrupar, para que el resumen del día
  // ya muestre el nombre corregido.
  const conAsignacion = useMemo(() => preview.map(e => ({
    ...e,
    empleado_id: asignados[e.numero_empleado_ext] ?? e.empleado_id,
    _nombre_match: asignados[e.numero_empleado_ext]
      ? empleados.find(x => x.id === asignados[e.numero_empleado_ext])?.nombre_completo
      : e._nombre_match,
  })), [preview, asignados, empleados])

  const dias = useMemo(() => resumirDias(conAsignacion), [conAsignacion])
  const diasIncluidos = dias.filter(d => !excluidos[claveDia(d)])
  const aImportar = conAsignacion.filter(e => !excluidos[`${e.numero_empleado_ext}_${e._fecha}`])
  const sinEmpleado = aImportar.filter(e => !e.empleado_id).length

  const importar = async () => {
    if (!aImportar.length) return toast.error('No queda ningún marcaje por importar')
    setImportando(true)
    // Se descartan los campos auxiliares del preview (los que empiezan con _).
    const rows = aImportar.map(e => ({
      empleado_id: e.empleado_id, numero_empleado_ext: e.numero_empleado_ext,
      operacion: e.operacion, fecha_hora: e.fecha_hora, origen: e.origen,
    }))
    // ignoreDuplicates: volver a cargar el mismo archivo no duplica marcajes.
    const { error } = await supabase.from('rh_checadas')
      .upsert(rows, { onConflict: 'empleado_id,fecha_hora,operacion', ignoreDuplicates: true })
    setImportando(false)
    if (error) return toast.error(error.message)
    toast.success(`${rows.length} marcajes importados · ${diasIncluidos.length} días`)
    onImported()
    onClose()
  }

  // Reimportar un archivo corregido del checador no sirve de nada si los
  // marcajes viejos (mal leídos, duplicados por un archivo repetido) se
  // quedan mezclados con los nuevos. Esto limpia los últimos 7 días para
  // volver a cargar limpio.
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const desdeUltimaSemana = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const eliminarUltimaSemana = async () => {
    setBorrando(true)
    const { error, count } = await supabase.from('rh_checadas')
      .delete({ count: 'exact' }).gte('fecha_hora', desdeUltimaSemana)
    setBorrando(false)
    setConfirmarBorrado(false)
    if (error) return toast.error(error.message)
    toast.success(`${count ?? 0} marcaje(s) eliminados desde el ${desdeUltimaSemana}`)
    onImported()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 14, width: 720, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Importar desde Checador</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-light)' }}>Compatible con ZKTeco, BioTime, y formato genérico CSV/TXT</p>
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer' }}><X size={18} /></button>
        </div>

        {/* Formato esperado */}
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12 }}>
          <strong>Formatos aceptados:</strong><br />
          <code style={{ fontSize:11, display:'block', marginTop:4, color:'#374151' }}>
            No.,Nombre,Fecha,Hora,Status — (Status: 0=Entrada, 1=Salida)<br />
            EmpCode,Nombre,Fecha,HoraEntrada,HoraSalida — (formato de 2 columnas horario)<br />
            ID Nombre Depto AAAA-MM-DD HH:MM:SS IDdispositivo — (reloj, sin comas; entrada/salida se infiere por orden)
          </code>
        </div>

        {/* Limpiar antes de reimportar un archivo corregido */}
        <div style={{ marginBottom: 14 }}>
          {!confirmarBorrado ? (
            <button onClick={() => setConfirmarBorrado(true)}
              style={{ display:'flex',alignItems:'center',gap:6,padding:'7px 12px',border:'1px solid #FECACA',borderRadius:8,fontSize:12,fontWeight:600,color:'#B91C1C',background:'#FFF5F5',cursor:'pointer' }}>
              <Trash2 size={13} /> Eliminar marcajes de la última semana
            </button>
          ) : (
            <div style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8 }}>
              <AlertCircle size={15} color="#B91C1C" style={{ flexShrink:0 }} />
              <span style={{ fontSize:12, color:'#991B1B', flex:1 }}>
                Borra todos los marcajes desde el {desdeUltimaSemana}, de cualquier empleado. No se puede deshacer.
              </span>
              <button onClick={() => setConfirmarBorrado(false)} disabled={borrando}
                style={{ padding:'6px 12px',background:'white',border:'1px solid #FECACA',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer',color:'#6B7280' }}>
                Cancelar
              </button>
              <button onClick={eliminarUltimaSemana} disabled={borrando}
                style={{ padding:'6px 12px',background:'#B91C1C',border:'none',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer',color:'white',opacity:borrando?0.7:1 }}>
                {borrando ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <button onClick={() => fileRef.current.click()} style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 14px',border:'1.5px solid #7B5EA7',borderRadius:8,fontSize:13,fontWeight:600,color:'#7B5EA7',background:'white',cursor:'pointer' }}>
            <Upload size={14} /> Abrir archivo
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt,.dat" style={{ display:'none' }} onChange={onFileChange} />
          <span style={{ fontSize:12,color:'#9CA3AF',alignSelf:'center' }}>o pega el contenido aquí:</span>
        </div>

        <textarea value={csv} onChange={onTextChange} rows={6} placeholder="Pega el contenido del reporte del checador..."
          style={{ width:'100%',padding:'10px 12px',border:'1.5px solid #E5E7EB',borderRadius:8,fontSize:12,fontFamily:'monospace',boxSizing:'border-box',marginBottom:14,resize:'vertical' }} />

        {preview.length > 0 && (
          <div>
            <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700 }}>
              Vista previa — {aImportar.length} marcajes en {diasIncluidos.length} días
              {aImportar.length !== preview.length && (
                <span style={{ fontWeight: 500, color: '#9CA3AF' }}> · {preview.length - aImportar.length} excluidos</span>
              )}
            </h4>
            <p style={{ margin: '0 0 10px', fontSize: 11, color: '#9CA3AF' }}>
              Quita el día que no quieras importar, o asigna el trabajador cuando el checador
              use un número que no está en el catálogo.
            </p>
            {sinEmpleado > 0 && (
              <div style={{ marginBottom: 10, padding: '8px 11px', borderRadius: 7, background: '#FEF3C7', border: '1px solid #FDE68A', fontSize: 11.5, color: '#92400E' }}>
                {sinEmpleado} marcaje{sinEmpleado === 1 ? '' : 's'} sin trabajador asignado. Se guardan igual —
                para no perderlos— pero no cuentan en la asistencia hasta que se les asigne alguien.
              </div>
            )}
            <div style={{ overflowX: 'auto', maxHeight: 260, border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'auto' }}>
              <table style={{ width:'100%',borderCollapse:'collapse',fontSize:12 }}>
                <thead style={{ background:'#F9FAFB',position:'sticky',top:0 }}>
                  <tr>{['# Ext','Empleado','Fecha','Entrada','Salida','Horas','Marcajes',''].map((h,i) => <th key={i} style={{ padding:'8px 10px',textAlign:'left',fontWeight:600,fontSize:11,color:'var(--color-text-light)',whiteSpace:'nowrap' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {dias.map((r, i) => {
                    const fuera = excluidos[claveDia(r)]
                    return (
                    <tr key={i} style={{ borderTop:'1px solid #F3F4F6', opacity: fuera ? .4 : 1, textDecoration: fuera ? 'line-through' : 'none' }}>
                      <td style={{ padding:'7px 10px',fontFamily:'monospace',color:'#7B5EA7' }}>{r.numero_empleado_ext}</td>
                      <td style={{ padding:'5px 10px' }}>
                        {r._nombre_match || (
                          <select value={asignados[r.numero_empleado_ext] ?? ''}
                            onChange={e => setAsignados(a => ({ ...a, [r.numero_empleado_ext]: e.target.value || undefined }))}
                            title={`El checador reportó "${r._nombre}"`}
                            style={{ padding:'4px 6px',border:'1.5px solid #FCA5A5',borderRadius:6,fontSize:11,maxWidth:190,background:'white' }}>
                            <option value="">Sin asignar: {r._nombre || r.numero_empleado_ext}</option>
                            {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre_completo}</option>)}
                          </select>
                        )}
                      </td>
                      <td style={{ padding:'7px 10px',fontFamily:'monospace' }}>{r._fecha}</td>
                      <td style={{ padding:'7px 10px',fontFamily:'monospace' }}>{r.entrada || '—'}</td>
                      <td style={{ padding:'7px 10px',fontFamily:'monospace' }}>{r.salida || '—'}</td>
                      <td style={{ padding:'7px 10px' }}>{r.minutos ? (r.minutos/60).toFixed(1)+'h' : '—'}</td>
                      <td style={{ padding:'7px 10px',textAlign:'center',fontWeight:700,color:'#6B7280' }}>{r.marcajes}</td>
                      <td style={{ padding:'5px 8px',textAlign:'center' }}>
                        <button onClick={() => setExcluidos(x => ({ ...x, [claveDia(r)]: !fuera }))}
                          title={fuera ? 'Volver a incluir este día' : 'No importar este día'}
                          style={{ border:'none',background:'none',cursor:'pointer',color: fuera ? '#059669' : '#9CA3AF',display:'inline-flex',padding:2 }}>
                          {fuera ? <RefreshCw size={13} /> : <X size={14} />}
                        </button>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ margin:'8px 0 0',fontSize:11,color:'#9CA3AF' }}>
              Se guardan los {preview.length} marcajes individuales; el estado del día (presente, retardo, falta) lo calcula la base.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex:1,padding:10,border:'1.5px solid #E5E7EB',borderRadius:8,background:'white',cursor:'pointer',fontWeight:600 }}>Cancelar</button>
          <button onClick={importar} disabled={!aImportar.length || importando}
            style={{ flex:2,padding:10,border:'none',borderRadius:8,background: aImportar.length?'#7B5EA7':'#9CA3AF',color:'white',cursor:'pointer',fontWeight:700 }}>
            {importando ? 'Importando…' : `Importar ${aImportar.length} marcajes`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tab Horarios de Guardia (rol semanal Humberto/Demetrio) ─────────────────
// El gerente de la plaza captura aquí quién cubre cada día de guardia de
// 24h — sabe con anticipación los turnos de la semana, así que esto NO se
// deriva del cruce con IwolPark (ese cruce solo sirve como apoyo visual en
// Asistencia): esta pantalla es la fuente que el gerente alimenta a mano.
const DIAS_ES_GUARDIA = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']

function TabHorariosGuardia() {
  const lunesDe = iso => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10) }
  const [inicio, setInicio] = useState(() => lunesDe(new Date().toISOString().slice(0, 10)))
  const [guardias, setGuardias] = useState([])
  const [asignaciones, setAsignaciones] = useState({})   // fecha -> empleado_id ('' = sin asignar)
  const [loading, setLoading] = useState(true)
  const [guardandoFecha, setGuardandoFecha] = useState(null)

  const dias = useMemo(() => {
    const d0 = new Date(inicio + 'T12:00:00')
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(d0); d.setDate(d.getDate() + i)
      return d.toISOString().slice(0, 10)
    })
  }, [inicio])

  const cargar = useCallback(async () => {
    setLoading(true)
    const [{ data: emps }, { data: turnos }] = await Promise.all([
      supabase.from('rh_empleados').select('id, nombre, apellido_pat').eq('cruza_medianoche', true).eq('estado_id', 'ACTIVO').order('nombre'),
      supabase.from('rh_turnos_guardia').select('fecha, empleado_id').gte('fecha', dias[0]).lte('fecha', dias[6]),
    ])
    setGuardias(emps ?? [])
    setAsignaciones(Object.fromEntries((turnos ?? []).map(t => [t.fecha, t.empleado_id])))
    setLoading(false)
  }, [dias])

  useEffect(() => { cargar() }, [cargar])

  // Se guarda al momento de elegir, renglón por renglón — el gerente va
  // llenando la semana y cada cambio queda capturado de una vez.
  const asignar = async (fecha, empleadoId) => {
    setAsignaciones(a => ({ ...a, [fecha]: empleadoId }))
    setGuardandoFecha(fecha)
    const { error } = empleadoId
      ? await supabase.from('rh_turnos_guardia').upsert({ fecha, empleado_id: empleadoId }, { onConflict: 'fecha' })
      : await supabase.from('rh_turnos_guardia').delete().eq('fecha', fecha)
    setGuardandoFecha(null)
    if (error) return toast.error(error.message)
  }

  const cambiarSemana = delta => {
    const d = new Date(inicio + 'T12:00:00'); d.setDate(d.getDate() + delta * 7)
    setInicio(d.toISOString().slice(0, 10))
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18, flexWrap:'wrap', gap:10 }}>
        <div>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>Rol de guardia — turnos de 24h</h3>
          <p style={{ margin:'4px 0 0', fontSize:12.5, color:'var(--color-text-light)' }}>
            Quién cubre cada día. Esto lo captura el gerente de la plaza con anticipación; el cruce con IwolPark en Asistencia es solo un apoyo para validar, no reemplaza esto.
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => cambiarSemana(-1)} style={{ padding:'7px 10px', border:'1.5px solid #E5E7EB', borderRadius:7, background:'white', cursor:'pointer' }}>‹</button>
          <input type="date" value={inicio} onChange={e => setInicio(lunesDe(e.target.value))}
            style={{ padding:'7px 10px', border:'1.5px solid #E5E7EB', borderRadius:7, fontSize:13 }} />
          <button onClick={() => cambiarSemana(1)} style={{ padding:'7px 10px', border:'1.5px solid #E5E7EB', borderRadius:7, background:'white', cursor:'pointer' }}>›</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#9CA3AF' }}>Cargando…</div>
      ) : guardias.length === 0 ? (
        <div style={{ padding:'14px 16px', background:'#FEF3C7', border:'1px solid #FDE68A', borderRadius:8, fontSize:12.5, color:'#92400E' }}>
          No hay empleados marcados con "Turno cruza medianoche" — actívalo en su expediente (RH → Empleados → Editar → Datos laborales) para que aparezcan aquí.
        </div>
      ) : (
        <div style={{ background:'white', borderRadius:10, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          {dias.map((f, i) => {
            const d = new Date(f + 'T12:00:00')
            return (
              <div key={f} style={{ display:'grid', gridTemplateColumns:'160px 1fr 24px', gap:14, alignItems:'center', padding:'12px 16px', borderTop: i>0 ? '1px solid #F3F4F6' : 'none' }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:13.5 }}>{DIAS_ES_GUARDIA[d.getDay()]}</div>
                  <div style={{ color:'#9CA3AF', fontFamily:'monospace', fontSize:11 }}>{f}</div>
                </div>
                <select value={asignaciones[f] || ''} onChange={e => asignar(f, e.target.value)}
                  style={{ padding:'8px 10px', border:'1.5px solid #E5E7EB', borderRadius:7, fontSize:13, background:'white', maxWidth:320 }}>
                  <option value="">— Sin asignar —</option>
                  {guardias.map(g => <option key={g.id} value={g.id}>{g.nombre} {g.apellido_pat}</option>)}
                </select>
                <div style={{ width:16, fontSize:10, color:'#9CA3AF' }}>{guardandoFecha === f && '…'}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tab Asistencia ──────────────────────────────────────────────────────────
function TabAsistencia() {
  const hoy = new Date().toISOString().split('T')[0]
  const [fecha, setFecha] = useState(() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().split('T')[0] })
  const [showImport, setShowImport] = useState(false)
  const [showConsulta, setShowConsulta] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const { data: asistencia, loading } = usePRP('prp_asistencia', { filters: [['fecha','eq',fecha]], order: { col: 'nombre_completo' }, refreshKey })
  const { data: empleados } = usePRP('prp_empleados', { order: { col: 'apellido_pat' } })
  const { data: guardiaDia } = usePRP('prp_turnos_guardia', { filters: [['fecha','eq',fecha]], refreshKey })

  // Respaldo de IwolPark: quién operó la caseta como cajero ese día, según el
  // sistema de estacionamiento (proyecto Supabase separado). El reloj
  // biométrico no siempre marca bien los turnos de 24h, así que esto sirve
  // para validar si la asistencia real corresponde a quien entró.
  const [casetaParking, setCasetaParking] = useState({})   // nombre en minúsculas -> { entrada, salida }
  useEffect(() => {
    if (!supabaseParking) { setCasetaParking({}); return }
    let cancelado = false
    supabaseParking.from('tickets')
      .select('cajero_entrada, cajero_salida, hora_entrada_at, hora_salida_at')
      .eq('fecha_op', fecha)
      .then(({ data }) => {
        if (cancelado) return
        const acc = {}
        for (const t of data ?? []) {
          if (t.cajero_entrada) {
            const k = t.cajero_entrada.toLowerCase()
            acc[k] = acc[k] || {}
            if (!acc[k].entrada || t.hora_entrada_at < acc[k].entrada) acc[k].entrada = t.hora_entrada_at
          }
          if (t.cajero_salida) {
            const k = t.cajero_salida.toLowerCase()
            acc[k] = acc[k] || {}
            if (t.hora_salida_at && (!acc[k].salida || t.hora_salida_at > acc[k].salida)) acc[k].salida = t.hora_salida_at
          }
        }
        setCasetaParking(acc)
      })
    return () => { cancelado = true }
  }, [fecha])

  const horaLocal = iso => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', hour12:false }) : null
  const casetaDe = nombreCompleto => {
    const primerNombre = (nombreCompleto || '').toLowerCase().split(' ')[0]
    return casetaParking[primerNombre] || null
  }

  const lista = asistencia ?? []
  const presentes = lista.filter(a => a.estado === 'PRESENTE').length
  const retardos  = lista.filter(a => a.estado === 'RETARDO').length
  const faltas    = lista.filter(a => a.estado === 'FALTA').length
  const totalHoras = lista.reduce((s, a) => s + (parseFloat(a.horas_trabajadas)||0), 0)

  const COLORES_ESTADO = { PRESENTE: ['#dcfce7','#166534'], RETARDO: ['#fef3c7','#92400e'], FALTA: ['#fee2e2','#991b1b'], VACACIONES: ['#dbeafe','#1d4ed8'], INCAPACIDAD: ['#F3F4F6','#6B7280'], SIN_MARCAJE: ['#EFF6FF','#1D4ED8'] }

  const guardiaHoy = (guardiaDia ?? [])[0] || null
  // Si el guardia programado no tiene renglón de asistencia (el reloj no lo
  // marcó), se agrega uno vacío para que igual se vea junto al respaldo de
  // IwolPark — si no, desaparecería de la tabla por completo.
  const listaConGuardia = useMemo(() => {
    if (!guardiaHoy) return lista
    const primerNombre = guardiaHoy.nombre_completo.split(' ')[0].toLowerCase()
    if (lista.some(a => (a.nombre_completo || '').toLowerCase().includes(primerNombre))) return lista
    return [...lista, {
      id: `guardia-${guardiaHoy.id}`, nombre_completo: guardiaHoy.nombre_completo, numero_empleado: guardiaHoy.numero_empleado,
      puesto: 'Guardia (programado)', hora_entrada: null, hora_salida: null, horas_trabajadas: null, minutos_retardo: 0, estado: 'SIN_MARCAJE',
    }]
  }, [lista, guardiaHoy])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Fecha:</label>
          <input type="date" value={fecha} max={hoy} onChange={e => setFecha(e.target.value)}
            style={{ padding: '8px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 13 }} />
        </div>
        <button onClick={() => setShowConsulta(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#374151', background: 'white', cursor: 'pointer' }}>
          <Search size={14} /> Consultar marcajes
        </button>
        <button onClick={() => setShowImport(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1.5px solid #7B5EA7', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#7B5EA7', background: 'white', cursor: 'pointer' }}>
          <Upload size={14} /> Importar desde Checador
        </button>
      </div>

      {guardiaHoy && (
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, padding:'8px 14px', background:'#F5F3FF', border:'1px solid #DDD6FE', borderRadius:8, fontSize:12.5, color:'#5A4080' }}>
          <UserCheck size={14} /> Guardia programada para el {fecha}: <strong>{guardiaHoy.nombre_completo}</strong>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {[[presentes,'Presentes','#057642',CheckCircle],[retardos,'Retardos','#F59E0B',Clock],[faltas,'Faltas','#B24020',AlertTriangle],[totalHoras.toFixed(1)+'h','Horas Totales','#7B5EA7',TrendingUp]].map(([v,t,c,Icon]) => (
          <div key={t} style={{ background:'white',borderRadius:10,border:'1px solid #E5E7EB',padding:'14px 16px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4 }}>
              <span style={{ fontSize:11,fontWeight:600,color:'var(--color-text-light)',textTransform:'uppercase' }}>{t}</span>
              <Icon size={15} color={c} />
            </div>
            <div style={{ fontSize:22,fontWeight:700,color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF' }}>Cargando…</div>
      ) : listaConGuardia.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF', background: 'white', borderRadius: 10, border: '1px solid #E5E7EB' }}>
          <Upload size={36} style={{ display:'block',margin:'0 auto 12px',opacity:.3 }} />
          <p style={{ margin:0,fontWeight:600 }}>Sin registros para {fecha}</p>
          <p style={{ margin:'6px 0 0',fontSize:12 }}>Importa el reporte del checador ZKTeco o registra manualmente</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
              <thead>
                <tr style={{ background:'#F9FAFB',borderBottom:'1px solid #E5E7EB' }}>
                  {['Empleado','# Emp','Puesto','Entrada','Salida','Horas','Retardo','Estado','Caseta (IwolPark)'].map(h => (
                    <th key={h} style={{ padding:'11px 14px',textAlign:'left',fontWeight:600,fontSize:11,color:'var(--color-text-light)',whiteSpace:'nowrap',textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listaConGuardia.map(a => {
                  const [bg, fg] = COLORES_ESTADO[a.estado] || ['#F3F4F6','#6B7280']
                  const caseta = casetaDe(a.nombre_completo)
                  return (
                    <tr key={a.id} style={{ borderBottom:'1px solid #F3F4F6' }}>
                      <td style={{ padding:'11px 14px',fontWeight:500 }}>{a.nombre_completo}</td>
                      <td style={{ padding:'11px 14px',fontFamily:'monospace',fontSize:12,color:'#7B5EA7' }}>{a.numero_empleado}</td>
                      <td style={{ padding:'11px 14px',fontSize:12,color:'var(--color-text-light)' }}>{a.puesto}</td>
                      <td style={{ padding:'11px 14px',fontFamily:'monospace',fontSize:12 }}>{a.hora_entrada ? String(a.hora_entrada).slice(0,5) : '—'}</td>
                      <td style={{ padding:'11px 14px',fontFamily:'monospace',fontSize:12 }}>{a.hora_salida ? String(a.hora_salida).slice(0,5) : '—'}</td>
                      <td style={{ padding:'11px 14px',fontWeight:600 }}>{a.horas_trabajadas ? parseFloat(a.horas_trabajadas).toFixed(1)+'h' : '—'}</td>
                      <td style={{ padding:'11px 14px',color:a.minutos_retardo>0?'#F59E0B':'var(--color-text-light)',fontWeight:a.minutos_retardo>0?700:400 }}>
                        {a.minutos_retardo > 0 ? `+${a.minutos_retardo} min` : '—'}
                      </td>
                      <td style={{ padding:'11px 14px' }}>
                        <span style={{ padding:'3px 10px',borderRadius:12,fontSize:11,fontWeight:700,background:bg,color:fg }}>{a.estado === 'SIN_MARCAJE' ? 'SIN MARCAJE' : a.estado}</span>
                      </td>
                      <td style={{ padding:'11px 14px',fontSize:11.5 }}>
                        {caseta
                          ? <span style={{ color:'#166534',fontWeight:600 }} title="Operó la caseta según IwolPark — respaldo, no reemplaza el checador">
                              {horaLocal(caseta.entrada) || '?'}–{horaLocal(caseta.salida) || '?'}
                            </span>
                          : <span style={{ color:'#D1D5DB' }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showImport && (
        <ImportChecadorModal empleados={empleados ?? []} onClose={() => setShowImport(false)} onImported={() => { setRefreshKey(k=>k+1); setShowImport(false) }} />
      )}
      {showConsulta && (
        <ConsultaChecadas empleados={empleados ?? []} onClose={() => setShowConsulta(false)} />
      )}
    </div>
  )
}

// ── Modal: Crear Período de Nómina ─────────────────────────────────────────
function NuevoPeriodoModal({ onClose, onCreated }) {
  const hoy = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    periodicidad: 'QUINCENAL',
    fecha_inicio: '',
    fecha_fin: '',
    fecha_pago: '',
    tipo_nomina: 'O',
    descripcion: '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Auto-calcular fecha_fin según periodicidad
  useEffect(() => {
    if (!form.fecha_inicio) return
    const d = new Date(form.fecha_inicio + 'T12:00:00')
    if (form.periodicidad === 'SEMANAL')    d.setDate(d.getDate() + 6)
    if (form.periodicidad === 'QUINCENAL')  d.setDate(d.getDate() + 14)
    if (form.periodicidad === 'MENSUAL')    { d.setMonth(d.getMonth() + 1); d.setDate(d.getDate() - 1) }
    set('fecha_fin', d.toISOString().split('T')[0])
    // Fecha pago: 3 días hábiles después del fin
    const p = new Date(d); p.setDate(p.getDate() + 3)
    set('fecha_pago', p.toISOString().split('T')[0])
  }, [form.fecha_inicio, form.periodicidad])

  const guardar = async () => {
    if (!form.fecha_inicio || !form.fecha_fin || !form.fecha_pago) { toast.error('Completa todas las fechas'); return }
    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('crear_periodo_nomina', {
        p_periodicidad: form.periodicidad,
        p_fecha_inicio: form.fecha_inicio,
        p_fecha_fin:    form.fecha_fin,
        p_fecha_pago:   form.fecha_pago,
        p_tipo_nomina:  form.tipo_nomina,
        p_descripcion:  form.descripcion || null,
      })
      if (error) throw error
      logAudit({ modulo: 'Nómina', accion: 'CREAR_PERIODO', descripcion: `Período ${form.periodicidad} ${form.fecha_inicio}` })
      toast.success('Período creado')
      onCreated(data)
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center' }}>
      <div style={{ background:'white',borderRadius:14,padding:28,width:480,boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
          <h3 style={{ margin:0,fontSize:17,fontWeight:700 }}>Nuevo Período de Nómina</h3>
          <button onClick={onClose} style={{ border:'none',background:'none',cursor:'pointer',padding:4 }}><X size={18} /></button>
        </div>
        <div style={{ display:'grid',gap:14 }}>
          <div>
            <label style={{ fontSize:12,fontWeight:600,color:'var(--color-text-light)',display:'block',marginBottom:5 }}>Periodicidad</label>
            <select value={form.periodicidad} onChange={e => set('periodicidad', e.target.value)}
              style={{ width:'100%',padding:'9px 12px',border:'1.5px solid #E5E7EB',borderRadius:8,fontSize:14 }}>
              <option value="SEMANAL">Semanal (7 días)</option>
              <option value="QUINCENAL">Quincenal (15 días)</option>
              <option value="MENSUAL">Mensual</option>
            </select>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
            <div>
              <label style={{ fontSize:12,fontWeight:600,color:'var(--color-text-light)',display:'block',marginBottom:5 }}>Fecha inicio</label>
              <input type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)}
                style={{ width:'100%',padding:'9px 12px',border:'1.5px solid #E5E7EB',borderRadius:8,fontSize:14,boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:12,fontWeight:600,color:'var(--color-text-light)',display:'block',marginBottom:5 }}>Fecha fin</label>
              <input type="date" value={form.fecha_fin} onChange={e => set('fecha_fin', e.target.value)}
                style={{ width:'100%',padding:'9px 12px',border:'1.5px solid #E5E7EB',borderRadius:8,fontSize:14,boxSizing:'border-box' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize:12,fontWeight:600,color:'var(--color-text-light)',display:'block',marginBottom:5 }}>Fecha de pago</label>
            <input type="date" value={form.fecha_pago} onChange={e => set('fecha_pago', e.target.value)}
              style={{ width:'100%',padding:'9px 12px',border:'1.5px solid #E5E7EB',borderRadius:8,fontSize:14,boxSizing:'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize:12,fontWeight:600,color:'var(--color-text-light)',display:'block',marginBottom:5 }}>Tipo</label>
            <select value={form.tipo_nomina} onChange={e => set('tipo_nomina', e.target.value)}
              style={{ width:'100%',padding:'9px 12px',border:'1.5px solid #E5E7EB',borderRadius:8,fontSize:14 }}>
              <option value="O">Ordinaria</option>
              <option value="E">Extraordinaria</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize:12,fontWeight:600,color:'var(--color-text-light)',display:'block',marginBottom:5 }}>Descripción (opcional)</label>
            <input value={form.descripcion} onChange={e => set('descripcion', e.target.value)} placeholder="Ej: Primera quincena agosto 2026"
              style={{ width:'100%',padding:'9px 12px',border:'1.5px solid #E5E7EB',borderRadius:8,fontSize:14,boxSizing:'border-box' }} />
          </div>
        </div>
        <div style={{ display:'flex',gap:10,marginTop:22,justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'9px 18px',border:'1.5px solid #E5E7EB',borderRadius:8,fontSize:14,fontWeight:600,cursor:'pointer',background:'white' }}>Cancelar</button>
          <button onClick={guardar} disabled={saving}
            style={{ padding:'9px 22px',background:'#7B5EA7',color:'white',border:'none',borderRadius:8,fontSize:14,fontWeight:700,cursor:'pointer',opacity:saving?.6:1 }}>
            {saving ? 'Creando…' : 'Crear período'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Pre-nómina (detalle de empleados) ────────────────────────────────
function PreNominaModal({ periodo, onClose, onRecalcular }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const { data: renglones, loading } = usePRP('prp_prenomina', {
    filters: [['periodo_id', 'eq', periodo.id]],
    order: { col: 'nombre_completo' },
    refreshKey,
  })
  const [calculando, setCalculando] = useState(false)
  const [autorizando, setAutorizando] = useState(false)
  const [expandido, setExpandido] = useState(null)

  const lista = renglones ?? []
  const totalNeto = lista.reduce((s, r) => s + parseFloat(r.neto_pagar || 0), 0)
  const totalPerc = lista.reduce((s, r) => s + parseFloat(r.salario_periodo || 0), 0)
  const totalDed  = lista.reduce((s, r) => s + parseFloat(r.total_deducciones || 0), 0)

  const recalcular = async () => {
    setCalculando(true)
    try {
      const { data, error } = await supabase.rpc('calcular_nomina_periodo', { p_periodo_id: periodo.id })
      if (error) throw error
      const res = typeof data === 'string' ? JSON.parse(data) : data
      toast.success(`✅ ${res.empleados} empleados calculados — Neto: $${parseFloat(res.total_neto).toLocaleString('es-MX')}`)
      setRefreshKey(k => k + 1)
      onRecalcular()
    } catch (e) { toast.error('Error al calcular: ' + e.message) }
    finally { setCalculando(false) }
  }

  const autorizar = async () => {
    setAutorizando(true)
    try {
      const { error } = await supabase.rpc('autorizar_periodo_nomina', { p_periodo_id: periodo.id })
      if (error) throw error
      logAudit({ modulo: 'Nómina', accion: 'AUTORIZAR_PERIODO', descripcion: `Período ${periodo.folio} autorizado` })
      toast.success('Nómina autorizada — lista para timbrar')
      onRecalcular()
      onClose()
    } catch (e) { toast.error(e.message) }
    finally { setAutorizando(false) }
  }

  const exportarCSV = () => {
    const headers = ['Empleado','RFC','NSS','Banco','CLABE','Días trabajados','Salario período','IMSS','ISR','Neto']
    const rows = lista.map(r => [
      r.nombre_completo, r.rfc || '', r.nss || '',
      r.banco || '', r.cuenta_clabe || '',
      r.dias_trabajados, r.salario_periodo,
      r.imss_obrero, r.isr_a_retener, r.neto_pagar,
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `prenomina_${periodo.folio}.csv`; a.click()
  }

  const CHIP = { PENDIENTE: ['#F3F4F6','#374151'], TIMBRADO: ['#DCFCE7','#166534'], ERROR: ['#FEE2E2','#991B1B'] }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:1000,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'24px 16px',overflowY:'auto' }}>
      <div style={{ background:'white',borderRadius:14,width:'100%',maxWidth:900,boxShadow:'0 20px 60px rgba(0,0,0,.25)' }}>
        {/* Header */}
        <div style={{ padding:'20px 24px',borderBottom:'1px solid #E5E7EB',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <div>
            <h3 style={{ margin:0,fontSize:17,fontWeight:700 }}>{periodo.folio}</h3>
            <p style={{ margin:'3px 0 0',fontSize:12,color:'var(--color-text-light)' }}>
              {periodo.fecha_inicio} → {periodo.fecha_fin} · Pago: {periodo.fecha_pago}
            </p>
          </div>
          <div style={{ display:'flex',gap:8,alignItems:'center' }}>
            {periodo.estado === 'BORRADOR' && (
              <button onClick={recalcular} disabled={calculando}
                style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 14px',border:'1.5px solid #7B5EA7',borderRadius:8,fontSize:13,fontWeight:600,color:'#7B5EA7',background:'white',cursor:'pointer' }}>
                <RefreshCw size={13} className={calculando ? 'spin' : ''} /> {calculando ? 'Calculando…' : 'Calcular'}
              </button>
            )}
            {periodo.estado === 'CALCULADA' && (
              <button onClick={recalcular} disabled={calculando}
                style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 14px',border:'1.5px solid #6B7280',borderRadius:8,fontSize:13,fontWeight:600,color:'#6B7280',background:'white',cursor:'pointer' }}>
                <RefreshCw size={13} /> Recalcular
              </button>
            )}
            {lista.length > 0 && (
              <button onClick={exportarCSV}
                style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 14px',border:'1.5px solid #057642',borderRadius:8,fontSize:13,fontWeight:600,color:'#057642',background:'white',cursor:'pointer' }}>
                <Download size={13} /> CSV Finanzas
              </button>
            )}
            {periodo.estado === 'CALCULADA' && lista.length > 0 && (
              <button onClick={autorizar} disabled={autorizando}
                style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 16px',background:'#057642',color:'white',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer' }}>
                <CheckCircle size={14} /> {autorizando ? 'Autorizando…' : 'Autorizar Nómina'}
              </button>
            )}
            <button onClick={onClose} style={{ border:'none',background:'none',cursor:'pointer',padding:4 }}><X size={18} /></button>
          </div>
        </div>

        {/* Totales */}
        {lista.length > 0 && (
          <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:0,borderBottom:'1px solid #E5E7EB' }}>
            {[
              ['Empleados',    lista.length,                  '#7B5EA7'],
              ['Percepciones', '$'+totalPerc.toLocaleString('es-MX',{minimumFractionDigits:2}), '#374151'],
              ['Deducciones',  '$'+totalDed.toLocaleString('es-MX',{minimumFractionDigits:2}),  '#B24020'],
              ['Neto a pagar', '$'+totalNeto.toLocaleString('es-MX',{minimumFractionDigits:2}), '#057642'],
            ].map(([t,v,c]) => (
              <div key={t} style={{ padding:'14px 20px',borderRight:'1px solid #E5E7EB' }}>
                <div style={{ fontSize:11,fontWeight:600,color:'var(--color-text-light)',textTransform:'uppercase',marginBottom:3 }}>{t}</div>
                <div style={{ fontSize:18,fontWeight:800,color:c }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabla */}
        <div style={{ padding: '0 0 16px' }}>
          {loading ? (
            <div style={{ textAlign:'center',padding:48,color:'#9CA3AF' }}>Calculando…</div>
          ) : lista.length === 0 ? (
            <div style={{ textAlign:'center',padding:48,color:'#9CA3AF' }}>
              <DollarSign size={36} style={{ display:'block',margin:'0 auto 12px',opacity:.3 }} />
              <p style={{ margin:0,fontWeight:600 }}>Sin cálculo todavía</p>
              <p style={{ margin:'6px 0 0',fontSize:12 }}>Haz clic en "Calcular" para generar la pre-nómina</p>
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
                <thead>
                  <tr style={{ background:'#F9FAFB',borderBottom:'1px solid #E5E7EB' }}>
                    {['','Empleado','RFC','Días trab.','Percepción','IMSS','ISR','Subsidio','Neto','CFDI'].map(h => (
                      <th key={h} style={{ padding:'10px 14px',textAlign:'left',fontWeight:600,fontSize:11,color:'var(--color-text-light)',whiteSpace:'nowrap',textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lista.map(r => {
                    const [chipBg, chipFg] = CHIP[r.estatus_cfdi] || CHIP.PENDIENTE
                    const isOpen = expandido === r.id
                    return [
                      <tr key={r.id} style={{ borderBottom: isOpen ? 'none' : '1px solid #F3F4F6', cursor:'pointer' }} onClick={() => setExpandido(isOpen ? null : r.id)}>
                        <td style={{ padding:'10px 8px 10px 14px', color:'#6B7280' }}>
                          {isOpen ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                        </td>
                        <td style={{ padding:'10px 14px',fontWeight:600 }}>{r.nombre_completo}</td>
                        <td style={{ padding:'10px 14px',fontFamily:'monospace',fontSize:11,color:'#6B7280' }}>{r.rfc || '—'}</td>
                        <td style={{ padding:'10px 14px',textAlign:'right' }}>{parseFloat(r.dias_trabajados||0).toFixed(1)}</td>
                        <td style={{ padding:'10px 14px',textAlign:'right',color:'#057642',fontWeight:600 }}>${parseFloat(r.salario_periodo||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                        <td style={{ padding:'10px 14px',textAlign:'right',color:'#B24020' }}>${parseFloat(r.imss_obrero||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                        <td style={{ padding:'10px 14px',textAlign:'right',color:'#B24020' }}>${parseFloat(r.isr_a_retener||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                        <td style={{ padding:'10px 14px',textAlign:'right',color:'#7B5EA7' }}>{parseFloat(r.subsidio_empleo||0) > 0 ? '$'+parseFloat(r.subsidio_empleo).toLocaleString('es-MX',{minimumFractionDigits:2}) : '—'}</td>
                        <td style={{ padding:'10px 14px',textAlign:'right',fontWeight:800,fontSize:14 }}>${parseFloat(r.neto_pagar||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                        <td style={{ padding:'10px 14px' }}>
                          <span style={{ padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:700,background:chipBg,color:chipFg }}>{r.estatus_cfdi}</span>
                        </td>
                      </tr>,
                      isOpen && (
                        <tr key={r.id+'_exp'} style={{ borderBottom:'1px solid #F3F4F6',background:'#F9FAFB' }}>
                          <td colSpan={10} style={{ padding:'10px 48px 16px' }}>
                            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,fontSize:12 }}>
                              <div>
                                <span style={{ color:'var(--color-text-light)' }}>Días del período:</span> <strong>{r.dias_periodo}</strong><br/>
                                <span style={{ color:'var(--color-text-light)' }}>Días trabajados:</span> <strong>{r.dias_trabajados}</strong><br/>
                                <span style={{ color:'var(--color-text-light)' }}>Faltas:</span> <strong style={{ color: parseFloat(r.dias_falta)>0?'#B24020':'inherit' }}>{r.dias_falta}</strong><br/>
                                <span style={{ color:'var(--color-text-light)' }}>Salario diario:</span> <strong>${parseFloat(r.salario_diario||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</strong>
                              </div>
                              <div>
                                <span style={{ color:'var(--color-text-light)' }}>Base ISR mensual:</span> <strong>${parseFloat(r.isr_base_mensual||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</strong><br/>
                                <span style={{ color:'var(--color-text-light)' }}>Banco:</span> <strong>{r.banco || '—'}</strong><br/>
                                <span style={{ color:'var(--color-text-light)' }}>CLABE:</span> <strong style={{ fontFamily:'monospace' }}>{r.cuenta_clabe || '—'}</strong>
                              </div>
                            </div>
                            {r.uuid_cfdi && (
                              <div style={{ marginTop:8,padding:'6px 10px',background:'#DCFCE7',borderRadius:6,fontSize:11,fontFamily:'monospace',color:'#166534' }}>
                                UUID: {r.uuid_cfdi}
                              </div>
                            )}
                            {r.error_timbrado && (
                              <div style={{ marginTop:8,padding:'6px 10px',background:'#FEE2E2',borderRadius:6,fontSize:11,color:'#991B1B' }}>
                                Error: {r.error_timbrado}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    ]
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tab Nómina ──────────────────────────────────────────────────────────────
function TabNomina() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [showNuevo, setShowNuevo] = useState(false)
  const [periodoDetalle, setPeriodoDetalle] = useState(null)

  const { data: periodos, loading } = usePRP('nomina_periodos', {
    order: { col: 'created_at', asc: false },
    refreshKey,
  })

  const lista = periodos ?? []

  const ESTADO_CHIP = {
    BORRADOR:   ['#F3F4F6','#374151'],
    CALCULADA:  ['#FEF3C7','#92400E'],
    AUTORIZADA: ['#DBEAFE','#1D4ED8'],
    TIMBRADA:   ['#DCFCE7','#166534'],
    CANCELADA:  ['#FEE2E2','#991B1B'],
  }

  const ESTADO_ICON = {
    BORRADOR:   <FileText size={14} color="#6B7280" />,
    CALCULADA:  <Eye size={14} color="#92400E" />,
    AUTORIZADA: <CheckCircle size={14} color="#1D4ED8" />,
    TIMBRADA:   <Send size={14} color="#166534" />,
    CANCELADA:  <X size={14} color="#991B1B" />,
  }

  const totalPendiente = lista
    .filter(p => p.estado === 'AUTORIZADA')
    .reduce((s, p) => s + parseFloat(p.total_neto || 0), 0)

  return (
    <div>
      {/* KPIs superiores */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:22 }}>
        {[
          [lista.length, 'Períodos totales', '#7B5EA7', FileText],
          [lista.filter(p=>p.estado==='BORRADOR').length, 'En borrador', '#6B7280', Clock],
          [lista.filter(p=>p.estado==='AUTORIZADA').length, 'Por timbrar', '#E8A020', AlertTriangle],
          ['$'+totalPendiente.toLocaleString('es-MX',{minimumFractionDigits:0}), 'Neto pendiente', '#057642', DollarSign],
        ].map(([v,t,c,Icon]) => (
          <div key={t} style={{ background:'white',borderRadius:10,border:'1px solid #E5E7EB',padding:'14px 16px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4 }}>
              <span style={{ fontSize:11,fontWeight:600,color:'var(--color-text-light)',textTransform:'uppercase' }}>{t}</span>
              <Icon size={15} color={c} />
            </div>
            <div style={{ fontSize:22,fontWeight:700,color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Barra de acciones */}
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}>
        <h3 style={{ margin:0,fontSize:15,fontWeight:700 }}>Períodos de nómina</h3>
        <button onClick={() => setShowNuevo(true)}
          style={{ display:'flex',alignItems:'center',gap:7,padding:'9px 16px',background:'#7B5EA7',color:'white',border:'none',borderRadius:9,fontSize:13,fontWeight:700,cursor:'pointer' }}>
          <Plus size={14} /> Nuevo Período
        </button>
      </div>

      {/* Lista de períodos */}
      {loading ? (
        <div style={{ textAlign:'center',padding:60,color:'#9CA3AF' }}>Cargando…</div>
      ) : lista.length === 0 ? (
        <div style={{ textAlign:'center',padding:60,background:'white',borderRadius:10,border:'1px solid #E5E7EB' }}>
          <DollarSign size={36} style={{ display:'block',margin:'0 auto 12px',opacity:.3 }} />
          <p style={{ margin:0,fontWeight:600 }}>Sin períodos de nómina</p>
          <p style={{ margin:'6px 0 0',fontSize:12,color:'var(--color-text-light)' }}>Crea el primer período para empezar</p>
        </div>
      ) : (
        <div style={{ background:'white',borderRadius:10,border:'1px solid #E5E7EB',overflow:'hidden' }}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
            <thead>
              <tr style={{ background:'#F9FAFB',borderBottom:'1px solid #E5E7EB' }}>
                {['Folio','Tipo','Período','Fecha pago','Empleados','Percepciones','Deducciones','Neto','Estado',''].map(h => (
                  <th key={h} style={{ padding:'11px 14px',textAlign:'left',fontWeight:600,fontSize:11,color:'var(--color-text-light)',whiteSpace:'nowrap',textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map(p => {
                const [chipBg, chipFg] = ESTADO_CHIP[p.estado] || ESTADO_CHIP.BORRADOR
                return (
                  <tr key={p.id} style={{ borderBottom:'1px solid #F3F4F6', cursor:'pointer' }}
                    onClick={() => setPeriodoDetalle(p)}
                    onMouseEnter={e => e.currentTarget.style.background='#F9FAFB'}
                    onMouseLeave={e => e.currentTarget.style.background='white'}>
                    <td style={{ padding:'12px 14px',fontWeight:700,fontFamily:'monospace',color:'#7B5EA7' }}>{p.folio}</td>
                    <td style={{ padding:'12px 14px',fontSize:12 }}>
                      <span style={{ padding:'2px 8px',borderRadius:9,background:'#F5F3FF',color:'#5A4080',fontSize:11,fontWeight:600 }}>
                        {p.periodicidad === 'QUINCENAL' ? 'Quincenal' : p.periodicidad === 'SEMANAL' ? 'Semanal' : 'Mensual'}
                      </span>
                    </td>
                    <td style={{ padding:'12px 14px',fontSize:12,color:'var(--color-text-light)',whiteSpace:'nowrap' }}>
                      {p.fecha_inicio} → {p.fecha_fin}
                    </td>
                    <td style={{ padding:'12px 14px',fontWeight:600,whiteSpace:'nowrap' }}>{p.fecha_pago}</td>
                    <td style={{ padding:'12px 14px',textAlign:'right',fontWeight:p.total_empleados>0?700:400,color:p.total_empleados>0?'#374151':'#9CA3AF' }}>
                      {p.total_empleados || '—'}
                    </td>
                    <td style={{ padding:'12px 14px',textAlign:'right',color:'#057642',fontWeight:600 }}>
                      {p.total_percepciones > 0 ? '$'+parseFloat(p.total_percepciones).toLocaleString('es-MX',{minimumFractionDigits:2}) : '—'}
                    </td>
                    <td style={{ padding:'12px 14px',textAlign:'right',color:'#B24020' }}>
                      {p.total_deducciones > 0 ? '$'+parseFloat(p.total_deducciones).toLocaleString('es-MX',{minimumFractionDigits:2}) : '—'}
                    </td>
                    <td style={{ padding:'12px 14px',textAlign:'right',fontWeight:800 }}>
                      {p.total_neto > 0 ? '$'+parseFloat(p.total_neto).toLocaleString('es-MX',{minimumFractionDigits:2}) : '—'}
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <div style={{ display:'flex',alignItems:'center',gap:5 }}>
                        {ESTADO_ICON[p.estado]}
                        <span style={{ padding:'3px 9px',borderRadius:10,fontSize:11,fontWeight:700,background:chipBg,color:chipFg }}>{p.estado}</span>
                      </div>
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <button onClick={e => { e.stopPropagation(); setPeriodoDetalle(p) }}
                        style={{ display:'flex',alignItems:'center',gap:4,padding:'5px 10px',border:'1.5px solid #E5E7EB',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',background:'white',color:'#374151' }}>
                        <Eye size={12} /> Ver
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Aviso timbrado pendiente */}
      {lista.some(p => p.estado === 'AUTORIZADA') && (
        <div style={{ marginTop:16,padding:'14px 18px',background:'#F5F3FF',borderRadius:9,border:'1px solid #DDD6FE',display:'flex',alignItems:'center',gap:10 }}>
          <Send size={16} color="#5A4080" />
          <div>
            <span style={{ fontSize:13,fontWeight:700,color:'#5A4080' }}>Nómina lista para timbrar</span>
            <span style={{ fontSize:12,color:'#3B82F6',marginLeft:8 }}>
              Configura las credenciales FEL® en Netlify (FEL_USUARIO, FEL_PASSWORD, FEL_PFX_B64, FEL_PFX_PASS) para activar el timbrado automático.
            </span>
          </div>
        </div>
      )}

      {showNuevo && (
        <NuevoPeriodoModal
          onClose={() => setShowNuevo(false)}
          onCreated={() => { setShowNuevo(false); setRefreshKey(k => k+1) }}
        />
      )}

      {periodoDetalle && (
        <PreNominaModal
          periodo={periodoDetalle}
          onClose={() => setPeriodoDetalle(null)}
          onRecalcular={() => setRefreshKey(k => k+1)}
        />
      )}
    </div>
  )
}

// ── Helpers semanas ─────────────────────────────────────────────────────────
function getLunes(d) {
  const dt = new Date(d)
  const day = dt.getDay() // 0=dom
  const diff = (day === 0 ? -6 : 1 - day)
  dt.setDate(dt.getDate() + diff)
  return dt
}
function fmtDate(d) {
  // Usa fecha LOCAL (no UTC) para evitar el desfase de zona horaria
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(d, n) { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt }

function generarSemanas(n = 12) {
  const semanas = []
  let lunes = getLunes(new Date())
  for (let i = 0; i < n; i++) {
    const domingo = addDays(lunes, 6)
    semanas.push({ lunes: fmtDate(lunes), domingo: fmtDate(domingo) })
    lunes = addDays(lunes, -7)
  }
  return semanas
}

// ── Helpers asistencia semanal ──────────────────────────────────────────────
// La semana del reporte va de lunes a domingo, igual que isodow en Postgres.
const DIAS_ABREV = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']   // índice = isodow - 1
const ISO_POR_DIA = { lunes:1, martes:2, miercoles:3, jueves:4, viernes:5, sabado:6, domingo:7 }

// dia_descanso se captura como texto ('Sábado', 'Domingo', '-'). Se normaliza
// quitando acentos para no depender de cómo se escribió.
function isoDelDia(txt) {
  const k = (txt || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return ISO_POR_DIA[k] ?? null
}
const soloHora = t => (t ? String(t).slice(0, 5) : null)

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
function labelSemana(lunes, domingo) {
  const l = new Date(lunes + 'T12:00:00')
  const d = new Date(domingo + 'T12:00:00')
  return `${l.getDate()} al ${d.getDate()} de ${MESES_ES[d.getMonth()]} ${d.getFullYear()}`
}

// ── Modal: Nueva Incidencia ──────────────────────────────────────────────────
function NuevaIncidenciaModal({ empleados, onClose, onSaved }) {
  const hoy = fmtDate(new Date())
  const [form, setForm] = useState({ empleado_id: '', fecha: hoy, tipo: 'INASISTENCIA', descripcion: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const TIPOS = [
    { id: 'INASISTENCIA',      label: 'Inasistencia',           afecta: true  },
    { id: 'RETARDO',           label: 'Retardo',                afecta: false },
    { id: 'PERMISO_SIN_GOCE', label: 'Permiso sin goce',       afecta: true  },
    { id: 'PERMISO_CON_GOCE', label: 'Permiso con goce',       afecta: false },
    { id: 'VACACIONES',        label: 'Vacaciones',             afecta: false },
    { id: 'INCAPACIDAD',       label: 'Incapacidad',            afecta: false },
  ]

  const guardar = async () => {
    if (!form.empleado_id || !form.fecha || !form.tipo) return toast.error('Empleado, fecha y tipo son obligatorios')
    const tipo = TIPOS.find(t => t.id === form.tipo)
    // Calcular lunes de la semana
    const lunes = fmtDate(getLunes(form.fecha))
    setSaving(true)
    const { error } = await supabase.from('rh_incidencias').insert({
      empleado_id: form.empleado_id,
      fecha: form.fecha,
      tipo: form.tipo,
      descripcion: form.descripcion || null,
      afecta_nomina: tipo?.afecta ?? true,
      semana_inicio: lunes,
      created_by: 'USUARIO',
    })
    setSaving(false)
    if (error) {
      if (error.code === '23505') return toast.error('Ya existe esa incidencia para este empleado y fecha')
      return toast.error(error.message)
    }
    toast.success('Incidencia registrada')
    onSaved()
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }} onClick={onClose}>
      <div style={{ background:'white',borderRadius:14,width:480,maxWidth:'95vw',padding:24,boxShadow:'0 20px 60px rgba(0,0,0,.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
          <h3 style={{ margin:0,fontSize:16,fontWeight:700,display:'flex',alignItems:'center',gap:8 }}>
            <AlertCircle size={18} color="var(--color-warning)" /> Nueva Incidencia
          </h3>
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ display:'grid',gap:14 }}>
          <div>
            <label style={{ fontSize:11,fontWeight:700,color:'var(--color-text-light)',display:'block',marginBottom:4,textTransform:'uppercase' }}>Empleado</label>
            <select value={form.empleado_id} onChange={e => set('empleado_id', e.target.value)}
              style={{ width:'100%',padding:'9px 12px',border:'1.5px solid #E5E7EB',borderRadius:8,fontSize:13,background:'white' }}>
              <option value="">Seleccionar empleado…</option>
              {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre_completo}</option>)}
            </select>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
            <div>
              <label style={{ fontSize:11,fontWeight:700,color:'var(--color-text-light)',display:'block',marginBottom:4,textTransform:'uppercase' }}>Fecha</label>
              <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)}
                style={{ width:'100%',padding:'9px 12px',border:'1.5px solid #E5E7EB',borderRadius:8,fontSize:13,boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:11,fontWeight:700,color:'var(--color-text-light)',display:'block',marginBottom:4,textTransform:'uppercase' }}>Tipo</label>
              <select value={form.tipo} onChange={e => set('tipo', e.target.value)}
                style={{ width:'100%',padding:'9px 12px',border:'1.5px solid #E5E7EB',borderRadius:8,fontSize:13,background:'white' }}>
                {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize:11,fontWeight:700,color:'var(--color-text-light)',display:'block',marginBottom:4,textTransform:'uppercase' }}>Descripción (opcional)</label>
            <input value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
              placeholder="Ej: Faltó sin avisar"
              style={{ width:'100%',padding:'9px 12px',border:'1.5px solid #E5E7EB',borderRadius:8,fontSize:13,boxSizing:'border-box' }} />
          </div>
          {TIPOS.find(t => t.id === form.tipo)?.afecta && (
            <div style={{ background:'#FEF3C7',borderRadius:8,padding:'10px 12px',fontSize:12,color:'#92400E',display:'flex',alignItems:'center',gap:6 }}>
              <AlertTriangle size={14} /> Esta incidencia descuenta del salario en nómina
            </div>
          )}
        </div>
        <div style={{ display:'flex',gap:10,marginTop:20 }}>
          <button onClick={onClose} style={{ flex:1,padding:10,border:'1.5px solid #E5E7EB',borderRadius:8,background:'white',cursor:'pointer',fontWeight:600 }}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ flex:2,padding:10,border:'none',borderRadius:8,background:'var(--color-warning)',color:'white',cursor:'pointer',fontWeight:700,opacity:saving?.6:1 }}>
            {saving ? 'Guardando…' : 'Registrar incidencia'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tab Incidencias ──────────────────────────────────────────────────────────
function TabIncidencias() {
  const SEMANAS = generarSemanas(16)
  const [semanaIdx, setSemanaIdx] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const { data: empleados } = usePRP('prp_empleados', { order: { col: 'apellido_pat' } })
  const { data: incidencias, loading } = usePRP('prp_incidencias', {
    filters: [['semana_inicio', 'eq', SEMANAS[semanaIdx].lunes]],
    order: { col: 'fecha' },
    refreshKey,
  })

  const semana = SEMANAS[semanaIdx]
  const lista = incidencias ?? []
  const total_inasistencias = lista.filter(i => i.afecta_nomina).length

  const TIPO_COLOR = {
    INASISTENCIA:      ['#FEE2E2','#991B1B'],
    RETARDO:           ['#FEF3C7','#92400E'],
    PERMISO_SIN_GOCE: ['#FEE2E2','#92400E'],
    PERMISO_CON_GOCE: ['#DBEAFE','#1D4ED8'],
    VACACIONES:        ['#D1FAE5','#065F46'],
    INCAPACIDAD:       ['#F3F4F6','#374151'],
  }
  const TIPO_LABEL = {
    INASISTENCIA:      'Inasistencia',
    RETARDO:           'Retardo',
    PERMISO_SIN_GOCE: 'Permiso s/goce',
    PERMISO_CON_GOCE: 'Permiso c/goce',
    VACACIONES:        'Vacaciones',
    INCAPACIDAD:       'Incapacidad',
  }

  const eliminar = async (id) => {
    const { error } = await supabase.from('rh_incidencias').delete().eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Incidencia eliminada')
    setRefreshKey(k => k+1)
  }

  return (
    <div>
      {/* Selector de semana */}
      <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:20,flexWrap:'wrap' }}>
        <div style={{ display:'flex',alignItems:'center',gap:8,background:'white',borderRadius:8,border:'1.5px solid #E5E7EB',padding:'4px 4px 4px 12px' }}>
          <Calendar size={14} color="var(--color-primary)" />
          <span style={{ fontSize:13,fontWeight:600 }}>Semana:</span>
          <select value={semanaIdx} onChange={e => setSemanaIdx(+e.target.value)}
            style={{ border:'none',background:'transparent',fontSize:13,fontWeight:600,color:'var(--color-primary)',cursor:'pointer',padding:'6px 8px',outline:'none' }}>
            {SEMANAS.map((s, i) => (
              <option key={s.lunes} value={i}>{labelSemana(s.lunes, s.domingo)}</option>
            ))}
          </select>
        </div>
        <div style={{ fontSize:12,color:'var(--color-text-light)' }}>
          {semana.lunes} → {semana.domingo}
        </div>
        <div style={{ marginLeft:'auto' }}>
          <button onClick={() => setShowModal(true)}
            style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 14px',background:'var(--color-warning)',color:'white',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer' }}>
            <Plus size={14} /> Nueva Incidencia
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20 }}>
        {[
          [lista.length, 'Total incidencias', '#6B7280'],
          [total_inasistencias, 'Afectan nómina', '#B24020'],
          [lista.filter(i=>!i.afecta_nomina).length, 'Sin descuento', '#057642'],
        ].map(([v,t,c]) => (
          <div key={t} style={{ background:'white',borderRadius:10,border:'1px solid #E5E7EB',padding:'14px 16px' }}>
            <div style={{ fontSize:11,fontWeight:600,color:'var(--color-text-light)',textTransform:'uppercase',marginBottom:4 }}>{t}</div>
            <div style={{ fontSize:24,fontWeight:700,color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center',padding:60,color:'#9CA3AF' }}>Cargando…</div>
      ) : lista.length === 0 ? (
        <div style={{ textAlign:'center',padding:60,background:'white',borderRadius:10,border:'1px solid #E5E7EB' }}>
          <CheckCircle size={36} color="#057642" style={{ display:'block',margin:'0 auto 12px',opacity:.4 }} />
          <p style={{ margin:0,fontWeight:600,color:'#374151' }}>Sin incidencias esta semana</p>
          <p style={{ margin:'6px 0 0',fontSize:12,color:'#9CA3AF' }}>Registra inasistencias o incidencias con el botón de arriba</p>
        </div>
      ) : (
        <div style={{ background:'white',borderRadius:10,border:'1px solid #E5E7EB',overflow:'hidden' }}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
            <thead>
              <tr style={{ background:'#F9FAFB',borderBottom:'1px solid #E5E7EB' }}>
                {['Fecha','Empleado','Puesto','Tipo','Descripción','Descuenta',''].map(h => (
                  <th key={h} style={{ padding:'11px 14px',textAlign:'left',fontWeight:600,fontSize:11,color:'var(--color-text-light)',whiteSpace:'nowrap',textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map(inc => {
                const [bg, fg] = TIPO_COLOR[inc.tipo] || ['#F3F4F6','#374151']
                return (
                  <tr key={inc.id} style={{ borderBottom:'1px solid #F3F4F6' }}>
                    <td style={{ padding:'11px 14px',fontFamily:'monospace',fontSize:12 }}>{inc.fecha}</td>
                    <td style={{ padding:'11px 14px',fontWeight:600 }}>{inc.nombre_completo}</td>
                    <td style={{ padding:'11px 14px',fontSize:12,color:'var(--color-text-light)' }}>{inc.puesto}</td>
                    <td style={{ padding:'11px 14px' }}>
                      <span style={{ padding:'3px 9px',borderRadius:10,fontSize:11,fontWeight:700,background:bg,color:fg }}>
                        {TIPO_LABEL[inc.tipo] || inc.tipo}
                      </span>
                    </td>
                    <td style={{ padding:'11px 14px',fontSize:12,color:'var(--color-text-light)' }}>{inc.descripcion || '—'}</td>
                    <td style={{ padding:'11px 14px' }}>
                      {inc.afecta_nomina
                        ? <span style={{ color:'#991B1B',fontWeight:700,fontSize:12 }}>Sí</span>
                        : <span style={{ color:'#057642',fontSize:12 }}>No</span>}
                    </td>
                    <td style={{ padding:'11px 14px' }}>
                      <button onClick={() => eliminar(inc.id)}
                        style={{ padding:'3px 8px',border:'1.5px solid #FEE2E2',borderRadius:6,background:'white',color:'#B24020',cursor:'pointer',fontSize:11,fontWeight:600 }}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <NuevaIncidenciaModal
          empleados={(empleados ?? []).filter(e => e.estado_id === 'ACTIVO')}
          onClose={() => setShowModal(false)}
          onSaved={() => { setRefreshKey(k => k+1); setShowModal(false) }}
        />
      )}
    </div>
  )
}

// ── Tab Nómina Semanal IWOL ─────────────────────────────────────────────────
function TabNominaIWOL() {
  const SEMANAS = generarSemanas(16)
  const [semanaIdx, setSemanaIdx] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const { data: empleados } = usePRP('prp_empleados', { order: { col: 'nombre_completo' } })
  const { data: incidencias } = usePRP('prp_incidencias', {
    filters: [['semana_inicio', 'eq', SEMANAS[semanaIdx].lunes]],
    refreshKey,
  })
  // Entradas y salidas de la semana, un renglón por empleado y día.
  const { data: asistencia } = usePRP('prp_asistencia_semana', {
    filters: [['semana_inicio', 'eq', SEMANAS[semanaIdx].lunes]],
    refreshKey,
  })
  // Ajustes manuales: { [empleadoId]: { complemento, vacaciones, prima_vac, dia_festivo, transferencia } }
  const [ajustes, setAjustes] = useState({})
  const semana = SEMANAS[semanaIdx]

  const activos = (empleados ?? []).filter(e => e.estado_id === 'ACTIVO')
  const incs = incidencias ?? []
  const marcajes = asistencia ?? []

  // Calcular renglones
  const renglones = activos.map((emp, idx) => {
    const faltas = incs.filter(i => i.empleado_id === emp.id && i.afecta_nomina).length

    // Asistencia de lunes a domingo. El día de descanso no se pinta: no se
    // espera marcaje ese día y ponerlo en blanco se leería como una falta.
    const descanso = isoDelDia(emp.dia_descanso)
    const delEmpleado = marcajes.filter(m => m.empleado_id === emp.id)
    const asistenciaSemana = [1, 2, 3, 4, 5, 6, 7]
      .filter(d => d !== descanso)
      .map(d => {
        const m = delEmpleado.find(x => x.dia_semana === d)
        return { dia: d, abrev: DIAS_ABREV[d - 1], entrada: soloHora(m?.entrada), salida: soloHora(m?.salida) }
      })
    const asistenciaTexto = asistenciaSemana
      .map(a => `${a.abrev} ${a.entrada ? a.entrada + '–' + (a.salida || '?') : '—'}`)
      .join('\n')
    const salDia = parseFloat(emp.salario_diario) || 0
    const percepcion = Math.round(salDia * 7 * 100) / 100
    const descuento = Math.round(salDia * faltas * 100) / 100
    const aj = ajustes[emp.id] || {}
    const complemento   = parseFloat(aj.complemento  || 0)
    const vacaciones    = parseFloat(aj.vacaciones    || 0)
    const prima_vac     = parseFloat(aj.prima_vac     || 0)
    const dia_festivo   = parseFloat(aj.dia_festivo   || 0)
    // El bono es un dato del empleado (recurrente); se puede ajustar por
    // semana desde el panel de nómina igual que los demás conceptos.
    const bono          = parseFloat(aj.bono !== undefined ? aj.bono : (emp.bono || 0))
    const totalPerc     = percepcion - descuento + complemento + vacaciones + prima_vac + dia_festivo + bono
    // Sueldo y bono pueden pagarse por vías distintas (p.ej. sueldo en
    // efectivo y bono en transferencia), así que el default se arma sumando
    // cada parte según su propia forma de pago, no todo el total en bloque.
    const formaPagoBono = emp.forma_pago_bono || emp.forma_pago || 'TRANSFERENCIA'
    const defaultTransfer =
      (emp.forma_pago === 'EFECTIVO' ? 0 : (totalPerc - bono)) +
      (formaPagoBono === 'EFECTIVO' ? 0 : bono)
    const transferencia = parseFloat(aj.transferencia !== undefined ? aj.transferencia : defaultTransfer)
    const efectivo      = Math.round((totalPerc - transferencia) * 100) / 100
    return {
      no: idx + 1,
      empleado_id: emp.id,
      emp,                       // se necesita completo para el recibo (RFC, CURP, ingreso)
      nombre: emp.nombre_completo,
      horario: emp.horario_trabajo || '—',
      descanso: emp.dia_descanso || '—',
      asistencia: asistenciaSemana,
      asistencia_texto: asistenciaTexto,
      faltas,
      percepcion,
      descuento,
      complemento,
      vacaciones,
      prima_vac,
      dia_festivo,
      bono,
      total_percepciones: totalPerc,
      transferencia,
      efectivo,
      forma_pago: emp.forma_pago || 'TRANSFERENCIA',
      forma_pago_bono: formaPagoBono,
    }
  })

  const totales = {
    percepcion:         renglones.reduce((s, r) => s + r.percepcion, 0),
    total_percepciones: renglones.reduce((s, r) => s + r.total_percepciones, 0),
    // Suma el split real de cada empleado (sueldo y bono pueden ir por vías
    // distintas), no un todo-o-nada según una sola forma de pago.
    transferencia:      renglones.reduce((s, r) => s + r.transferencia, 0),
    efectivo:           renglones.reduce((s, r) => s + r.efectivo, 0),
  }

  const setAj = (empId, k, v) => setAjustes(prev => ({
    ...prev,
    [empId]: { ...(prev[empId] || {}), [k]: v },
  }))

  // ── Recibo de nómina individual ───────────────────────────────────────────
  // El formato del cliente lleva una FECHA DE PAGO que no siempre es el
  // domingo, así que se pide una vez arriba y aplica a todos los recibos.
  const [fechaPago, setFechaPago] = useState(semana.domingo)
  useEffect(() => { setFechaPago(semana.domingo) }, [semana.domingo])

  // Los mismos datos alimentan el Word y la impresión, para que no discrepen.
  const datosRecibo = (r, semanaISO) => {
    return {
      empleado: r.emp,
      semana: { lunes: semana.lunes, domingo: semana.domingo, numero: semanaISO(semana.lunes) },
      nomina: {
        dias_trabajados: 7 - r.faltas,
        faltas: r.faltas,
        // Percepción del formato: el sueldo de la semana más los conceptos
        // que se le sumaron. El descuento por faltas va del lado de deducción.
        percepcion:  r.percepcion + r.complemento + r.vacaciones + r.prima_vac + r.dia_festivo,
        bono:        r.bono,
        deducciones: r.descuento,
        neto:        r.total_percepciones,
        fecha_pago:  fechaPago,
      },
    }
  }

  const generarRecibo = async (r) => {
    // Carga diferida: docx pesa ~380 KB y solo hace falta al pedir un recibo.
    const { descargarRecibo, semanaISO } = await import('../lib/reciboNomina')
    try {
      const nombre = await descargarRecibo(datosRecibo(r, semanaISO))
      toast.success(nombre)
      logAudit({ modulo: 'Nómina', accion: 'RECIBO', descripcion: `${r.nombre} — semana ${semana.lunes}` })
    } catch (e) {
      toast.error('No se pudo generar el recibo: ' + e.message)
    }
  }

  const imprimirReciboDe = async (r) => {
    const { imprimirRecibo, semanaISO } = await import('../lib/reciboNomina')
    try {
      imprimirRecibo(datosRecibo(r, semanaISO))
      logAudit({ modulo: 'Nómina', accion: 'RECIBO_IMPRESO', descripcion: `${r.nombre} — semana ${semana.lunes}` })
    } catch (e) {
      toast.error(e.message)
    }
  }

  const generarTodos = async () => {
    for (const r of renglones) await generarRecibo(r)
  }

  const exportarExcel = async () => {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Petra — RANNIX Consulting'
    const sheetName = labelSemana(semana.lunes, semana.domingo).substring(0, 31)
    const ws = wb.addWorksheet(sheetName)

    // Formato monetario idéntico al archivo original
    const MONEY = '_-"$"* #,##0.00_-;\\-"$"* #,##0.00_-;_-"$"* "-"??_-;_-@_-'

    // Anchos de columna. Los del archivo original, más la de asistencia que se
    // insertó en quinto lugar (columna E), junto al horario y el descanso.
    const COL_W = [4, 34.88, 21.33, 17.44, 20, 12.88, 17.88, 26.55, 14, 18.44, 21.44, 22.33, 21.33, 14.88]
    COL_W.forEach((w, i) => { ws.getColumn(i + 1).width = w })
    const COL_ASIST = 4          // índice 0-based de la columna de asistencia
    const COL_DINERO = 6         // de aquí en adelante, formato moneda

    // Borde fino para todas las celdas de datos
    const thinBorder = {
      top:    { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left:   { style: 'thin', color: { argb: 'FF000000' } },
      right:  { style: 'thin', color: { argb: 'FF000000' } },
    }

    // ── Fila 1: vacía ──────────────────────────────────────────────────

    // ── Fila 2: título fusionado A2:M2 ─────────────────────────────────
    ws.mergeCells('A2:N2')
    const titulo = `NÓMINA PLAZA IWOL DEL ${labelSemana(semana.lunes, semana.domingo).toUpperCase()}`
    const tCell = ws.getCell('A2')
    tCell.value = titulo
    tCell.font  = { bold: true, size: 12, name: 'Calibri' }
    tCell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(2).height = 22

    // ── Fila 3: vacía ──────────────────────────────────────────────────

    // ── Fila 4: encabezados ────────────────────────────────────────────
    const HDRS = [
      'No.', 'NOMBRE DEL TRABAJADOR', 'HORARIO', 'DESCANSO',
      'ASISTENCIA LUN-DOM (ENTRADA-SALIDA)', 'FALTAS',
      'PERCEPCIÓN', 'COMPLEMENTO DE PAGO DE NOMINA', 'VACACIONES',
      'PRIMA VACACIONAL', 'DIA FESTIVO', 'TOTAL PERCEPCIONES', 'TRANFERENCIA', 'EFECTIVO',
    ]
    const hRow = ws.getRow(4)
    hRow.height = 30
    HDRS.forEach((h, i) => {
      const c = hRow.getCell(i + 1)
      c.value = h
      c.font  = { bold: true, size: 10, name: 'Calibri' }
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      c.border = thinBorder
      // Fondo gris claro en encabezados (toque visual)
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
    })

    // ── Filas 5+: empleados ────────────────────────────────────────────
    renglones.forEach((r, idx) => {
      const rowNum = 5 + idx
      const row = ws.getRow(rowNum)
      // La celda de asistencia lleva un renglón por día; se le da altura para
      // que se vean los seis o siete sin tener que ampliar la fila a mano.
      row.height = Math.max(18, 12 * (r.asistencia.length || 1))
      // Alternar fondo blanco / azul muy claro
      const bg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFEBF3FB'

      const vals = [
        r.no,
        r.nombre,
        r.horario,
        r.descanso,
        r.asistencia_texto || '—',
        r.faltas,
        r.percepcion,
        r.complemento  || null,
        r.vacaciones   || null,
        r.prima_vac    || null,
        r.dia_festivo  || null,
        r.total_percepciones,
        r.transferencia || null,
        r.efectivo      || null,
      ]
      vals.forEach((v, i) => {
        const c = row.getCell(i + 1)
        c.value = v === 0 && i >= COL_DINERO ? 0 : (v || null)  // mantener 0 en columnas dinero
        c.border = thinBorder
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        // Alineación
        c.alignment = {
          horizontal: [0, 3, 5].includes(i) ? 'center'
            : i >= COL_DINERO ? 'right' : 'left',
          vertical: i === COL_ASIST ? 'top' : 'middle',
          wrapText: i === 2 || i === COL_ASIST,   // horario y asistencia son multilínea
        }
        if (i >= COL_DINERO) c.numFmt = MONEY
      })
    })

    // ── Fila totales ───────────────────────────────────────────────────
    const totRowNum = 5 + renglones.length
    const totRow = ws.getRow(totRowNum)
    totRow.height = 18
    ;[null, null, null, null, null, 'TOTALES:',
      totales.percepcion, null, null, null, null,
      totales.total_percepciones, totales.transferencia, totales.efectivo,
    ].forEach((v, i) => {
      const c = totRow.getCell(i + 1)
      c.value = v
      c.border = thinBorder
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
      c.font = { bold: true, size: 10, name: 'Calibri' }
      c.alignment = {
        horizontal: i >= 5 ? 'right' : 'center',
        vertical: 'middle',
      }
      if (i >= COL_DINERO) c.numFmt = MONEY
    })

    // ── Generar y descargar ────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `Nomina_IWOL_${semana.lunes}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Excel generado correctamente')
  }

  const INP = NominaInput

  return (
    <div>
      {/* Selector semana + acciones */}
      <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:20,flexWrap:'wrap' }}>
        <div style={{ display:'flex',alignItems:'center',gap:8,background:'white',borderRadius:8,border:'1.5px solid #E5E7EB',padding:'4px 4px 4px 12px' }}>
          <Calendar size={14} color="var(--color-primary)" />
          <span style={{ fontSize:13,fontWeight:600 }}>Semana:</span>
          <select value={semanaIdx} onChange={e => { setSemanaIdx(+e.target.value); setAjustes({}) }}
            style={{ border:'none',background:'transparent',fontSize:13,fontWeight:600,color:'var(--color-primary)',cursor:'pointer',padding:'6px 8px',outline:'none' }}>
            {SEMANAS.map((s, i) => (
              <option key={s.lunes} value={i}>{labelSemana(s.lunes, s.domingo)}</option>
            ))}
          </select>
        </div>
        <span style={{ fontSize:12,color:'var(--color-text-light)' }}>{semana.lunes} al {semana.domingo}</span>
        <div style={{ display:'flex',alignItems:'center',gap:8,background:'white',borderRadius:8,border:'1.5px solid #E5E7EB',padding:'4px 10px' }}>
          <span style={{ fontSize:12,fontWeight:600,color:'#6B7280' }}>Fecha de pago:</span>
          <input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)}
            style={{ border:'none',background:'transparent',fontSize:12.5,fontWeight:600,color:'var(--color-primary)',outline:'none',padding:'4px 0' }} />
        </div>
        <div style={{ marginLeft:'auto',display:'flex',gap:8 }}>
          <button onClick={generarTodos}
            style={{ display:'flex',alignItems:'center',gap:5,padding:'8px 12px',border:'1.5px solid #5A4080',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',background:'white',color:'#5A4080' }}>
            <FileText size={13} /> Recibos de todos
          </button>
          <button onClick={() => setRefreshKey(k => k+1)}
            style={{ display:'flex',alignItems:'center',gap:5,padding:'8px 12px',border:'1.5px solid #E5E7EB',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',background:'white' }}>
            <RefreshCw size={13} /> Actualizar
          </button>
          <button onClick={exportarExcel}
            style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 14px',background:'#057642',color:'white',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer' }}>
            <Download size={14} /> Exportar Excel
          </button>
          <button onClick={() => window.print()}
            style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 14px',background:'#5A4080',color:'white',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer' }}>
            <Printer size={14} /> Imprimir PDF
          </button>
        </div>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #nomina-iwol-print, #nomina-iwol-print * { visibility: visible; }
          #nomina-iwol-print {
            position: absolute; left: 0; top: 0; width: 100%;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }

          /* Oficio landscape: 355mm × 216mm — caben las 13 columnas */
          @page {
            size: 355mm 216mm landscape;
            margin: 6mm 8mm;
          }

          /* Tabla compacta para impresión */
          #nomina-iwol-print table { font-size: 9px !important; width: 100% !important; table-layout: fixed; }
          #nomina-iwol-print thead th { padding: 5px 4px !important; font-size: 8px !important; white-space: normal !important; }
          #nomina-iwol-print tbody td { padding: 5px 4px !important; font-size: 9px !important; }

          /* Anchos fijos por columna. El horario cede espacio a la asistencia,
             que necesita ancho para los siete renglones de entrada-salida. */
          #nomina-iwol-print table colgroup { display: table-column-group; }
          #nomina-iwol-print th:nth-child(1),  #nomina-iwol-print td:nth-child(1)  { width: 14px;  } /* No */
          #nomina-iwol-print th:nth-child(2),  #nomina-iwol-print td:nth-child(2)  { width: 50px;  } /* Nombre */
          #nomina-iwol-print th:nth-child(3),  #nomina-iwol-print td:nth-child(3)  { width: 40px;  } /* Horario */
          #nomina-iwol-print th:nth-child(4),  #nomina-iwol-print td:nth-child(4)  { width: 18px;  } /* Descanso */
          #nomina-iwol-print th:nth-child(5),  #nomina-iwol-print td:nth-child(5)  { display: none !important; } /* Asistencia: oculta en impresión */
          #nomina-iwol-print th:nth-child(6),  #nomina-iwol-print td:nth-child(6)  { width: 16px;  } /* Faltas */
          #nomina-iwol-print th:nth-child(7),  #nomina-iwol-print td:nth-child(7)  { width: 28px;  } /* Percepción */
          #nomina-iwol-print th:nth-child(8),  #nomina-iwol-print td:nth-child(8)  { width: 26px;  } /* Complem. */
          #nomina-iwol-print th:nth-child(9),  #nomina-iwol-print td:nth-child(9)  { width: 22px;  } /* Vacaciones */
          #nomina-iwol-print th:nth-child(10), #nomina-iwol-print td:nth-child(10) { width: 22px;  } /* Prima Vac */
          #nomina-iwol-print th:nth-child(11), #nomina-iwol-print td:nth-child(11) { width: 22px;  } /* Día Festivo */
          #nomina-iwol-print th:nth-child(12), #nomina-iwol-print td:nth-child(12) { width: 30px;  } /* Total Perc */
          #nomina-iwol-print th:nth-child(13), #nomina-iwol-print td:nth-child(13) { width: 28px;  } /* Transferencia */
          #nomina-iwol-print th:nth-child(14), #nomina-iwol-print td:nth-child(14) { width: 24px;  } /* Efectivo */

          /* La celda de asistencia se aprieta: es una rejilla de 7 renglones */
          #nomina-iwol-print td:nth-child(5) div { font-size: 7px !important; line-height: 1.25 !important; }

          /* Inputs → valor de texto */
          #nomina-iwol-print input { display: none !important; }
          #nomina-iwol-print .print-val { display: inline !important; }

          /* Colores forzados */
          #nomina-iwol-print thead tr,
          #nomina-iwol-print .print-total-row {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        .print-val { display: none; }
      `}</style>

      {/* Totales rápidos */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20 }}>
        {[
          [activos.length, 'Empleados', '#7B5EA7'],
          [incs.filter(i => i.afecta_nomina).length, 'Inasistencias', '#B24020'],
          ['$'+totales.total_percepciones.toLocaleString('es-MX',{minimumFractionDigits:2}), 'Total a pagar', '#057642'],
          ['$'+totales.transferencia.toLocaleString('es-MX',{minimumFractionDigits:2}), 'Transferencia', '#7B5EA7'],
        ].map(([v,t,c]) => (
          <div key={t} style={{ background:'white',borderRadius:10,border:'1px solid #E5E7EB',padding:'14px 16px' }}>
            <div style={{ fontSize:11,fontWeight:600,color:'var(--color-text-light)',textTransform:'uppercase',marginBottom:4 }}>{t}</div>
            <div style={{ fontSize:20,fontWeight:700,color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Tabla nómina */}
      <div id="nomina-iwol-print" style={{ background:'white',borderRadius:10,border:'1px solid #E5E7EB',overflow:'hidden' }}>
        {/* Encabezado solo visible en impresión */}
        <div className="print-val" style={{ padding:'10px 14px 6px', borderBottom:'2px solid #5A4080' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:'#5A4080' }}>INMOBILIARIA IWOL — Nómina Semanal</div>
              <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>
                Semana: {semana.lunes} al {semana.domingo}
              </div>
            </div>
            <div style={{ textAlign:'right', fontSize:11, color:'#6B7280' }}>
              <div>RANNIX Consulting</div>
              <div>Generado: {new Date().toLocaleDateString('es-MX')}</div>
            </div>
          </div>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:12 }}>
            <thead>
              <tr style={{ background:'#5A4080',color:'white' }}>
                {['No.','Nombre del Trabajador','Horario','Descanso','Asistencia Lun–Dom','Faltas','Percepción','Complem.','Vacaciones','Prima Vac.','Día Festivo','Total Perc.','Transferencia','Efectivo'].map(h => (
                  <th key={h} style={{ padding:'10px 12px',textAlign:'left',fontWeight:600,fontSize:11,whiteSpace:'nowrap' }}>{h}</th>
                ))}
                <th className="no-print" style={{ padding:'10px 12px',textAlign:'center',fontWeight:600,fontSize:11 }}>Recibo</th>
              </tr>
            </thead>
            <tbody>
              {renglones.map((r, i) => (
                <tr key={r.empleado_id} style={{ borderBottom:'1px solid #F3F4F6',background:i%2===0?'white':'#FAFAFA' }}>
                  <td style={{ padding:'10px 12px',color:'#9CA3AF',fontSize:11 }}>{r.no}</td>
                  <td style={{ padding:'10px 12px',fontWeight:600 }}>{r.nombre}</td>
                  <td style={{ padding:'10px 12px',fontSize:11,color:'#6B7280',maxWidth:180 }}>{r.horario}</td>
                  <td style={{ padding:'10px 12px',fontSize:11 }}>{r.descanso}</td>
                  <td style={{ padding:'6px 10px' }}>
                    <div style={{ display:'grid',gridTemplateColumns:'auto 1fr',gap:'1px 6px',fontSize:10.5,fontVariantNumeric:'tabular-nums',lineHeight:1.4 }}>
                      {r.asistencia.map(a => (
                        <Fragment key={a.dia}>
                          <span style={{ fontWeight:700,color:'#9CA3AF' }}>{a.abrev}</span>
                          <span style={{ color: a.entrada ? '#374151' : '#D1D5DB' }}>
                            {a.entrada ? `${a.entrada}–${a.salida || '?'}` : '—'}
                          </span>
                        </Fragment>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding:'10px 12px',textAlign:'center',fontWeight:700,color:r.faltas>0?'#B24020':'#374151' }}>{r.faltas}</td>
                  <td style={{ padding:'10px 12px',textAlign:'right',fontWeight:600,color:'#374151' }}>${r.percepcion.toLocaleString('es-MX')}</td>
                  <td style={{ padding:'8px 10px', textAlign:'right' }}>
                    <INP value={ajustes[r.empleado_id]?.complemento} onChange={v => setAj(r.empleado_id,'complemento',v)} />
                    <span className="print-val" style={{ fontSize:12, color:'#374151' }}>{ajustes[r.empleado_id]?.complemento ? '$'+parseFloat(ajustes[r.empleado_id].complemento).toLocaleString('es-MX',{minimumFractionDigits:2}) : '—'}</span>
                  </td>
                  <td style={{ padding:'8px 10px', textAlign:'right' }}>
                    <INP value={ajustes[r.empleado_id]?.vacaciones} onChange={v => setAj(r.empleado_id,'vacaciones',v)} />
                    <span className="print-val" style={{ fontSize:12, color:'#374151' }}>{ajustes[r.empleado_id]?.vacaciones ? '$'+parseFloat(ajustes[r.empleado_id].vacaciones).toLocaleString('es-MX',{minimumFractionDigits:2}) : '—'}</span>
                  </td>
                  <td style={{ padding:'8px 10px', textAlign:'right' }}>
                    <INP value={ajustes[r.empleado_id]?.prima_vac} onChange={v => setAj(r.empleado_id,'prima_vac',v)} />
                    <span className="print-val" style={{ fontSize:12, color:'#374151' }}>{ajustes[r.empleado_id]?.prima_vac ? '$'+parseFloat(ajustes[r.empleado_id].prima_vac).toLocaleString('es-MX',{minimumFractionDigits:2}) : '—'}</span>
                  </td>
                  <td style={{ padding:'8px 10px', textAlign:'right' }}>
                    <INP value={ajustes[r.empleado_id]?.dia_festivo} onChange={v => setAj(r.empleado_id,'dia_festivo',v)} />
                    <span className="print-val" style={{ fontSize:12, color:'#374151' }}>{ajustes[r.empleado_id]?.dia_festivo ? '$'+parseFloat(ajustes[r.empleado_id].dia_festivo).toLocaleString('es-MX',{minimumFractionDigits:2}) : '—'}</span>
                  </td>
                  <td style={{ padding:'10px 12px',textAlign:'right',fontWeight:700,color:'#057642' }}>${r.total_percepciones.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                  <td style={{ padding:'10px 12px',textAlign:'right',color:'#1D4ED8',fontWeight:600 }}>
                    {r.transferencia ? '$'+r.transferencia.toLocaleString('es-MX',{minimumFractionDigits:2}) : '—'}
                  </td>
                  <td style={{ padding:'10px 12px',textAlign:'right',color:'#166534',fontWeight:600 }}>
                    {r.efectivo ? '$'+r.efectivo.toLocaleString('es-MX',{minimumFractionDigits:2}) : '—'}
                  </td>
                  <td className="no-print" style={{ padding:'8px 10px',textAlign:'center' }}>
                    {/* Word para archivar o corregir; impresora para el caso de
                        cada semana: imprimir, firmar y entregar. */}
                    <div style={{ display:'inline-flex',border:'1.5px solid #E5E7EB',borderRadius:7,overflow:'hidden' }}>
                      <button onClick={() => generarRecibo(r)} title={`Recibo de ${r.nombre} en Word`}
                        style={{ display:'inline-flex',alignItems:'center',gap:4,padding:'5px 9px',border:'none',background:'white',cursor:'pointer',fontSize:11,fontWeight:600,color:'#5A4080',whiteSpace:'nowrap' }}>
                        <FileText size={12} /> Recibo
                      </button>
                      <button onClick={() => imprimirReciboDe(r)} title={`Imprimir el recibo de ${r.nombre}`}
                        style={{ display:'inline-flex',alignItems:'center',padding:'5px 8px',border:'none',borderLeft:'1.5px solid #E5E7EB',background:'white',cursor:'pointer',color:'#6B7280' }}>
                        <Printer size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {/* Totales */}
              <tr className="print-total-row" style={{ background:'#5A4080',color:'white',fontWeight:700 }}>
                <td colSpan={5} style={{ padding:'10px 12px' }}></td>
                <td style={{ padding:'10px 12px',textAlign:'center' }}>TOTALES:</td>
                <td style={{ padding:'10px 12px',textAlign:'right' }}>${totales.percepcion.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                <td colSpan={4}></td>
                <td style={{ padding:'10px 12px',textAlign:'right' }}>${totales.total_percepciones.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                <td style={{ padding:'10px 12px',textAlign:'right' }}>${totales.transferencia.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                <td style={{ padding:'10px 12px',textAlign:'right' }}>${totales.efectivo.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                <td className="no-print"></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ padding:'10px 14px',fontSize:11,color:'#9CA3AF',borderTop:'1px solid #F3F4F6' }}>
          Asistencia: primera entrada y última salida de cada día, del checador · el día de descanso no se muestra · «—» es día sin marcaje<br />
          Complemento, Vacaciones, Prima Vacacional y Día Festivo son ajustes manuales · Transferencia editable (el resto va en Efectivo)
        </div>
      </div>
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────────────────
export default function RH() {
  useModuleAudit('RH')
  const TABS = ['Empleados', 'Reclutamiento', 'Asistencia', 'Horarios de Guardia', 'Incidencias', 'Nómina', 'Nómina IWOL']
  const [tab, setTab] = useState('Empleados')
  const [showNuevo, setShowNuevo] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div style={{ padding: 24, minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={28} color="#7B5EA7" /> Recursos Humanos
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-light)' }}>Reclutamiento · Expediente · Asistencia · Nómina</p>
        </div>
        {tab === 'Empleados' && (
          <button onClick={() => setShowNuevo(true)} style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 18px',background:'#7B5EA7',color:'white',border:'none',borderRadius:9,fontSize:14,fontWeight:700,cursor:'pointer',boxShadow:'0 2px 8px rgba(123,94,167,.3)' }}>
            <Plus size={16} /> Nuevo Empleado
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #E5E7EB', marginBottom: 22 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, borderBottom: `2.5px solid ${tab===t ? '#7B5EA7' : 'transparent'}`, color: tab===t ? '#7B5EA7' : 'var(--color-text-light)', transition: '.15s' }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Empleados'     && <TabEmpleados onNuevo={() => setShowNuevo(true)} />}
      {tab === 'Reclutamiento' && <TabReclutamiento />}
      {tab === 'Asistencia'    && <TabAsistencia />}
      {tab === 'Horarios de Guardia' && <TabHorariosGuardia />}
      {tab === 'Incidencias'   && <TabIncidencias />}
      {tab === 'Nómina'        && <TabNomina />}
      {tab === 'Nómina IWOL'   && <TabNominaIWOL />}

      {showNuevo && (
        <NuevoEmpleadoModal onClose={() => setShowNuevo(false)} onCreated={() => setRefreshKey(k => k+1)} />
      )}
    </div>
  )
}
