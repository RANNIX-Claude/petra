import { useModuleAudit } from '../hooks/useAudit'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  DollarSign, Search, CheckCircle, Clock, AlertTriangle, TrendingUp,
  Plus, X, Upload, Image, FileText, AlertCircle, CreditCard, ChevronDown, CalendarPlus
} from 'lucide-react'
import KPICard from '../components/ui/KPICard'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import NuevoCargoModal from '../components/ui/NuevoCargoModal'
import { usePRP } from '../hooks/usePRP'
import { supabase } from '../lib/supabase'

const MES_NOMBRES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function fmt(n) { return '$' + (parseFloat(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 }) }

const CONCEPTO_META = {
  RENTA:        { label: 'Renta',        color: 'var(--color-primary)' },
  SANCION:      { label: 'Sanción',      color: 'var(--color-danger)' },
  MANTENIMIENTO:{ label: 'Mant.',        color: '#6B7280' },
  AGUA:         { label: 'Agua',         color: '#0891B2' },
  OTRO:         { label: 'Otro',         color: '#9CA3AF' },
}

const ESTADO_COLOR = {
  PENDIENTE: 'var(--color-warning)',
  PARCIAL:   '#7C3AED',
  PAGADO:    'var(--color-success)',
  CANCELADO: '#9CA3AF',
}

function ConceptoBadge({ tipo }) {
  const m = CONCEPTO_META[tipo] || CONCEPTO_META.OTRO
  return (
    <span style={{ fontSize: '10px', fontWeight: 700, color: m.color, background: m.color + '18', padding: '2px 7px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  )
}

function EstadoBadge({ estado }) {
  const color = ESTADO_COLOR[estado] || 'var(--color-warning)'
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, color, background: color + '20', padding: '3px 10px', borderRadius: '20px' }}>
      {estado}
    </span>
  )
}

// ── Modal: Registrar Ingreso ─────────────────────────────────────────────────
const OCR_FN = '/.netlify/functions/extraer-documento'

const MESES_C = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const TIPO_CLR = { RENTA: '#057642', SANCION: '#B24020', AGUA: '#0284C7', OTRO: '#6B7280' }

function RegistrarIngresoModal({ contratos, onClose, onSaved }) {
  const compRef = useRef()
  const [form, setForm] = useState({
    contrato_id: '',
    fecha: new Date().toISOString().split('T')[0],
    importe_total: '',
    forma_pago: 'TRANSFERENCIA',
    referencia_banco: '',
    nota: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const [comprobanteFile, setComprobanteFile] = useState(null)
  const [comprobantePreview, setComprobantePreview] = useState(null)
  const [leyendoOCR, setLeyendoOCR] = useState(false)
  const [ocrData, setOcrData] = useState(null)   // datos crudos del OCR para panel de validación
  const [ocrMsg, setOcrMsg] = useState(null)
  const [cargos, setCargos] = useState([])
  const [dist, setDist] = useState({})            // { cargo_id: importe_string }
  const [loadingCargos, setLoadingCargos] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  // Totales distribución
  const importeTotal = parseFloat(form.importe_total) || 0
  const totalDist = Object.values(dist).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const saldoLibre = importeTotal - totalDist

  // Cargar cargos pendientes al cambiar contrato
  useEffect(() => {
    if (!form.contrato_id) { setCargos([]); setDist({}); return }
    setLoadingCargos(true)
    supabase.from('cargos_programados')
      .select('id, tipo, mes, anio, importe_cargo, saldo, estado')
      .eq('contrato_id', form.contrato_id)
      .in('estado', ['PENDIENTE', 'PARCIAL'])
      .order('anio').order('mes').order('tipo')
      .then(({ data }) => {
        setCargos(data || [])
        const d = {}
        ;(data || []).forEach(c => { d[c.id] = '' })
        setDist(d)
        setLoadingCargos(false)
      })
  }, [form.contrato_id])

  const adjuntarYOCR = async (file) => {
    if (!file) return
    setComprobanteFile(file)
    setComprobantePreview(URL.createObjectURL(file))
    setLeyendoOCR(true)
    setOcrData(null)
    setOcrMsg({ ok: null, txt: 'Leyendo comprobante con IA…' })
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file)
      })
      const resp = await fetch(OCR_FN, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image_base64: b64, media_type: file.type, tipo_doc: 'COMPROBANTE_PAGO' }),
      })
      const j = await resp.json()
      if (!resp.ok || !j.datos) throw new Error(j.error || 'Sin datos')
      const d = j.datos
      const formaMap = { transferencia: 'TRANSFERENCIA', spei: 'TRANSFERENCIA', deposito: 'DEPOSITO', 'depósito': 'DEPOSITO', efectivo: 'EFECTIVO', cheque: 'CHEQUE' }
      setForm(f => ({
        ...f,
        fecha:            d.fecha_pago || d.fecha || f.fecha,
        importe_total:    d.monto ? String(d.monto) : f.importe_total,   // ← auto-rellena monto
        referencia_banco: d.referencia || d.folio || d.numero_operacion || f.referencia_banco,
        forma_pago:       formaMap[(d.forma_pago || '').toLowerCase()] || f.forma_pago,
        nota:             [d.concepto, d.banco ? `Desde: ${d.banco}` : ''].filter(Boolean).join(' · ') || f.nota,
      }))
      setOcrData(d)
      setOcrMsg({ ok: true, txt: 'Datos extraídos — verifica y corrige si es necesario' })
    } catch {
      setOcrMsg({ ok: false, txt: 'No se pudo leer el comprobante — llena manualmente' })
    } finally { setLeyendoOCR(false) }
  }

  const guardar = async (e) => {
    e.preventDefault()
    if (!form.contrato_id) { setErr('Selecciona un contrato'); return }
    if (!form.importe_total || parseFloat(form.importe_total) <= 0) { setErr('El monto debe ser mayor a 0'); return }
    if (saldoLibre < -0.01) { setErr(`La distribución (${fmt(totalDist)}) excede el monto recibido`); return }
    setSaving(true); setErr(null)
    try {
      const [fAnio, fMes] = form.fecha.split('-').map(Number)
      const tiposPrincipales = cargos.filter(c => parseFloat(dist[c.id]) > 0).map(c => c.tipo)
      const { data: ing, error } = await supabase.from('ingresos').insert({
        contrato_id:      form.contrato_id,
        fecha:            form.fecha,
        mes:              fMes,
        anio:             fAnio,
        importe:          parseFloat(form.importe_total),
        importe_total:    parseFloat(form.importe_total),
        forma_pago:       form.forma_pago,
        referencia_banco: form.referencia_banco || null,
        nota:             form.nota || null,
        tipo:             tiposPrincipales[0] || 'RENTA',
        tipo_concepto:    tiposPrincipales[0] || 'RENTA',
        origen:           form.forma_pago === 'EFECTIVO' ? 'EFECTIVO' : 'TRANSFERENCIA',
      }).select('id').single()
      if (error) throw error

      // Aplicaciones de pago
      const aplicaciones = Object.entries(dist)
        .filter(([, v]) => parseFloat(v) > 0)
        .map(([cargo_id, v]) => ({ cargo_id, ingreso_id: ing.id, importe_aplicado: parseFloat(v) }))
      if (aplicaciones.length > 0) {
        const { error: apErr } = await supabase.from('aplicaciones_pago')
          .upsert(aplicaciones, { onConflict: 'cargo_id,ingreso_id' })
        if (apErr) throw new Error('Ingreso guardado pero error al aplicar cargos: ' + apErr.message)
      }

      // Upload comprobante
      if (comprobanteFile && ing?.id) {
        const ext = comprobanteFile.name.split('.').pop() || 'jpg'
        const path = `comprobantes/${ing.id}/comp.${ext}`
        const { error: upErr } = await supabase.storage.from('facturas-cfdi').upload(path, comprobanteFile, { upsert: true })
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('facturas-cfdi').getPublicUrl(path)
          await supabase.from('ingresos').update({ comprobante_url: urlData.publicUrl }).eq('id', ing.id)
        }
      }
      onSaved()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const inp = { width: '100%', padding: '9px 12px', border: '1.5px solid #E5E7EB', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }
  const lbl = { display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '620px', maxHeight: '94vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-light)', fontWeight: 700, textTransform: 'uppercase' }}>Nuevo Ingreso</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--color-primary)', marginTop: '2px' }}>Registrar Depósito</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}><X size={20} /></button>
        </div>

        <div style={{ overflowY: 'auto', padding: '18px 22px' }}>
          <form onSubmit={guardar}>
            {err && <div style={{ padding: '6px 10px', background: '#FEE2E2', color: 'var(--color-danger)', borderRadius: '6px', fontSize: '12px', marginBottom: '10px' }}>{err}</div>}

            {/* ── Comprobante primero — OCR llena los campos ── */}
            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>1. Comprobante de pago (OCR automático)</label>
              {!comprobanteFile ? (
                <button type="button" onClick={() => compRef.current?.click()} disabled={leyendoOCR}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px', background: '#EFF6FF', border: '2px dashed #0A66C2', borderRadius: '10px', fontSize: '13px', color: '#0A66C2', cursor: 'pointer', fontWeight: 700, width: '100%', justifyContent: 'center' }}>
                  <Image size={16} /> {leyendoOCR ? 'Leyendo con IA…' : 'Adjuntar ficha o transferencia — IA extrae los datos'}
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', background: '#F0FDF4', borderRadius: 8, border: '1.5px solid #BBF7D0' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#15803D', flex: 1 }}>✓ {comprobanteFile.name}</span>
                  <button type="button" onClick={() => { setComprobanteFile(null); setComprobantePreview(null); setOcrMsg(null); setOcrData(null) }}
                    style={{ fontSize: '11px', color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✕ Quitar</button>
                </div>
              )}
              <input ref={compRef} type="file" accept="image/*,application/pdf" capture="environment" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) adjuntarYOCR(f); e.target.value = '' }} />
            </div>

            {/* Panel de validación OCR */}
            {ocrMsg && (
              <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: 8, fontSize: 12,
                border: `1px solid ${ocrMsg.ok === true ? '#BBF7D0' : ocrMsg.ok === false ? '#FECACA' : '#FDE68A'}`,
                background: ocrMsg.ok === true ? '#F0FDF4' : ocrMsg.ok === false ? '#FEF2F2' : '#FFFBEB' }}>
                <div style={{ fontWeight: 700, color: ocrMsg.ok === true ? '#057642' : ocrMsg.ok === false ? '#B24020' : '#92400E', marginBottom: ocrData ? '8px' : 0 }}>
                  {ocrMsg.ok === true ? '✓' : ocrMsg.ok === false ? '✗' : '⟳'} {ocrMsg.txt}
                </div>
                {ocrData && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                    {[
                      ['Banco origen', ocrData.banco],
                      ['No. cuenta / CLABE', ocrData.cuenta || ocrData.clabe],
                      ['Monto en imagen', ocrData.monto ? fmt(ocrData.monto) : null],
                      ['Fecha', ocrData.fecha_pago || ocrData.fecha],
                      ['Referencia', ocrData.referencia || ocrData.folio || ocrData.numero_operacion],
                      ['Concepto', ocrData.concepto],
                    ].filter(([, v]) => v).map(([k, v]) => (
                      <div key={k}>
                        <span style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700 }}>{k}</span>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#111827' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {comprobantePreview && (
              <div style={{ marginBottom: '12px' }}>
                <img src={comprobantePreview} alt="Comprobante" style={{ width: '100%', maxHeight: '160px', objectFit: 'contain', borderRadius: '10px', border: '1.5px solid #E5E7EB', background: '#F9FAFB' }} />
              </div>
            )}

            <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '14px', marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', marginBottom: '10px' }}>2. Datos del depósito</div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={lbl}>Contrato *</label>
              <select value={form.contrato_id} onChange={e => set('contrato_id', e.target.value)} style={inp} required>
                <option value="">— Selecciona contrato —</option>
                {(contratos || []).map(c => (
                  <option key={c.id} value={c.id}>{c.folio} · {c.arrendatario_nombre} · {c.locales_display || c.locales_referencia}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={lbl}>Fecha del depósito *</label>
                <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} style={inp} required />
              </div>
              <div>
                <label style={lbl}>
                  Monto total *
                  {ocrData?.monto && Math.abs(parseFloat(form.importe_total) - ocrData.monto) > 1 && (
                    <span style={{ marginLeft: 6, color: '#D97706', fontSize: '10px' }}>⚠ imagen: {fmt(ocrData.monto)}</span>
                  )}
                </label>
                <input type="number" value={form.importe_total} onChange={e => set('importe_total', e.target.value)} placeholder="37234.00" style={{ ...inp, fontWeight: 800, fontSize: '15px', borderColor: ocrData?.monto && Math.abs(parseFloat(form.importe_total) - ocrData.monto) > 1 ? '#F59E0B' : '#E5E7EB' }} step="0.01" required />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={lbl}>Forma de pago</label>
                <select value={form.forma_pago} onChange={e => set('forma_pago', e.target.value)} style={inp}>
                  {['TRANSFERENCIA','DEPOSITO','EFECTIVO','CHEQUE'].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Ref. / Clave rastreo</label>
                <input type="text" value={form.referencia_banco} onChange={e => set('referencia_banco', e.target.value)} placeholder="TRF20260901…" style={inp} />
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>Notas</label>
              <input type="text" value={form.nota} onChange={e => set('nota', e.target.value)} placeholder="Cubre Ago+Sep 2026, etc." style={inp} />
            </div>

            {/* ── Distribución del pago ── */}
            {form.contrato_id && (
              <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '14px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase' }}>3. Distribución del pago</div>
                  {importeTotal > 0 && (
                    <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 10px', borderRadius: 20,
                      color: saldoLibre < -0.01 ? '#B24020' : saldoLibre > 0.01 ? '#92400E' : '#057642',
                      background: saldoLibre < -0.01 ? '#FEE2E2' : saldoLibre > 0.01 ? '#FEF3C7' : '#D1FAE5' }}>
                      {saldoLibre < -0.01 ? `Excede ${fmt(Math.abs(saldoLibre))}` : saldoLibre > 0.01 ? `Libre: ${fmt(saldoLibre)}` : '✓ Cuadrado'}
                    </span>
                  )}
                </div>
                {loadingCargos ? (
                  <div style={{ fontSize: '13px', color: '#9CA3AF', textAlign: 'center', padding: '10px' }}>Cargando adeudos…</div>
                ) : cargos.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#6B7280', padding: '10px 14px', background: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                    Sin cargos pendientes para este contrato
                  </div>
                ) : (
                  <div style={{ border: '1px solid #E5E7EB', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 110px', gap: '8px', padding: '7px 12px', background: '#F3F4F6', fontSize: '10px', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>
                      <span>Concepto</span><span>Período</span><span style={{ textAlign: 'right' }}>Saldo</span><span style={{ textAlign: 'right' }}>Aplicar $</span>
                    </div>
                    {cargos.map((c, i) => {
                      const aplicando = parseFloat(dist[c.id]) || 0
                      const activo = aplicando > 0
                      return (
                        <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 110px', gap: '8px', padding: '8px 12px', alignItems: 'center', borderTop: i > 0 ? '1px solid #F3F4F6' : 'none', background: activo ? '#F0FDF4' : 'white' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                            onClick={() => setDist(d => ({ ...d, [c.id]: activo ? '' : String(Math.min(c.saldo, Math.max(0, importeTotal - totalDist + aplicando))) }))}>
                            <span style={{ color: activo ? '#057642' : '#D1D5DB', fontSize: '16px', lineHeight: 1 }}>{activo ? '●' : '○'}</span>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: TIPO_CLR[c.tipo] || '#374151' }}>{c.tipo}</div>
                              <div style={{ fontSize: '10px', color: '#9CA3AF' }}>{c.estado}</div>
                            </div>
                          </div>
                          <span style={{ fontSize: '12px', color: '#6B7280' }}>{MESES_C[c.mes]}/{String(c.anio).slice(2)}</span>
                          <span style={{ fontSize: '13px', fontWeight: 600, textAlign: 'right', color: '#374151' }}>{fmt(c.saldo)}</span>
                          <input type="number" min="0" max={c.saldo} step="0.01" value={dist[c.id] ?? ''} placeholder="0.00"
                            onChange={e => setDist(d => ({ ...d, [c.id]: e.target.value }))}
                            style={{ ...inp, padding: '5px 8px', textAlign: 'right', border: `1.5px solid ${activo ? '#86EFAC' : '#E5E7EB'}`, background: activo ? '#F0FDF4' : 'white' }} />
                        </div>
                      )
                    })}
                    {importeTotal > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 110px', gap: '8px', padding: '8px 12px', borderTop: '2px solid #E5E7EB', background: '#F9FAFB' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, gridColumn: '1/3', color: '#374151' }}>Total recibido</span>
                        <span style={{ fontSize: '13px', fontWeight: 800, textAlign: 'right', color: '#374151' }}>{fmt(importeTotal)}</span>
                        <span style={{ fontSize: '13px', fontWeight: 800, textAlign: 'right', color: saldoLibre < -0.01 ? '#B24020' : '#057642' }}>{fmt(totalDist)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <button type="submit" disabled={saving}
              style={{ width: '100%', padding: '13px', background: saving ? '#9CA3AF' : 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '14px', cursor: saving ? 'default' : 'pointer' }}>
              {saving ? 'Guardando…' : '✓ Confirmar Pago'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Aplicar Ingreso ───────────────────────────────────────────────────
function AplicarIngresoModal({ ingreso, onClose, onSaved }) {
  const [cargos, setCargos] = useState([])
  const [loading, setLoading] = useState(true)
  const [distribuciones, setDistribuciones] = useState({}) // cargo_id -> importe_aplicado
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    async function cargar() {
      setLoading(true)
      const { data } = await supabase
        .from('prp_cartera')
        .select('*')
        .eq('contrato_id', ingreso.contrato_id)
        .in('estado', ['PENDIENTE', 'PARCIAL'])
        .order('fecha_vencimiento', { ascending: true })
      setCargos(data || [])
      setLoading(false)
    }
    cargar()
  }, [ingreso.contrato_id])

  const totalDisponible = parseFloat(ingreso.importe_total || ingreso.importe) || 0
  const totalAplicado = Object.values(distribuciones).reduce((a, v) => a + (parseFloat(v) || 0), 0)
  const restante = totalDisponible - totalAplicado

  const setDist = (cargoId, val) => {
    setDistribuciones(d => ({ ...d, [cargoId]: val }))
  }

  const confirmar = async () => {
    const rows = Object.entries(distribuciones)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([cargo_id, importe_aplicado]) => ({
        ingreso_id: ingreso.id,
        cargo_id,
        importe_aplicado: parseFloat(importe_aplicado),
      }))
    if (rows.length === 0) { setErr('Ingresa al menos un importe a aplicar'); return }
    setSaving(true); setErr(null)
    try {
      const { error } = await supabase.from('aplicaciones_pago').upsert(rows, { onConflict: 'ingreso_id,cargo_id' })
      if (error) throw error
      onSaved()
    } catch (e) { setErr(e.message); setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '680px', maxHeight: '94vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

        <div style={{ padding: '16px 22px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-light)', fontWeight: 700, textTransform: 'uppercase' }}>Aplicar Depósito</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--color-primary)', marginTop: '2px' }}>
              {ingreso.arrendatario_nombre || ingreso.propietario || 'Arrendatario'}
            </div>
            <div style={{ fontSize: '13px', color: '#374151', marginTop: '2px' }}>
              Depósito: <strong>{fmt(totalDisponible)}</strong> · {ingreso.fecha}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}><X size={20} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {loading
            ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-light)' }}>Cargando cargos…</div>
            : cargos.length === 0
            ? <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF', fontSize: '14px' }}>No hay cargos pendientes para este contrato.</div>
            : (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', marginBottom: '12px' }}>
                  Cargos pendientes — selecciona montos a aplicar
                </div>
                {cargos.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid #F3F4F6' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <ConceptoBadge tipo={c.concepto} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>{c.descripcion || `${c.concepto} ${MES_NOMBRES[c.periodo_mes] || ''} ${c.periodo_anio || ''}`}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
                        Vence: {c.fecha_vencimiento} · Saldo: <strong style={{ color: 'var(--color-danger)' }}>{fmt(c.saldo)}</strong>
                      </div>
                    </div>
                    <div style={{ width: '130px' }}>
                      <input
                        type="number"
                        value={distribuciones[c.id] || ''}
                        onChange={e => setDist(c.id, e.target.value)}
                        placeholder={String(parseFloat(c.saldo).toFixed(2))}
                        max={parseFloat(c.saldo)}
                        step="0.01"
                        style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #E5E7EB', borderRadius: '8px', fontSize: '13px', fontWeight: 700, textAlign: 'right', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid #E5E7EB', background: '#F9FAFB', borderRadius: '0 0 16px 16px' }}>
          {err && <div style={{ padding: '6px 10px', background: '#FEE2E2', color: 'var(--color-danger)', borderRadius: '6px', fontSize: '12px', marginBottom: '10px' }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase' }}>Aplicado</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-success)' }}>{fmt(totalAplicado)}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase' }}>Restante</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: restante < 0 ? 'var(--color-danger)' : 'var(--color-warning)' }}>{fmt(restante)}</div>
              </div>
            </div>
            <button onClick={confirmar} disabled={saving || totalAplicado <= 0}
              style={{ padding: '11px 24px', background: saving || totalAplicado <= 0 ? '#9CA3AF' : 'var(--color-success)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '14px', cursor: saving || totalAplicado <= 0 ? 'default' : 'pointer' }}>
              {saving ? 'Guardando…' : 'Confirmar Aplicación'}
            </button>
          </div>
          {restante < 0 && (
            <div style={{ fontSize: '11px', color: 'var(--color-danger)', fontWeight: 700 }}>
              El total aplicado supera el monto del depósito.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Fila de cargo en tabla Cartera ───────────────────────────────────────────
function CargoRow({ c }) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const vencida = c.estado !== 'PAGADO' && c.estado !== 'CANCELADO' && new Date(c.fecha_vencimiento) < hoy
  const pct = c.importe > 0 ? Math.min(100, (parseFloat(c.total_aplicado) / parseFloat(c.importe)) * 100) : 0

  return (
    <tr style={{ borderBottom: '1px solid #F3F4F6' }}
      onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <td style={{ padding: '12px 16px' }}>
        <ConceptoBadge tipo={c.concepto} />
        {c.generado_auto && <span style={{ marginLeft: '4px', fontSize: '9px', color: '#9CA3AF', fontWeight: 600 }}>AUTO</span>}
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{c.descripcion || `${c.concepto} ${MES_NOMBRES[c.periodo_mes] || ''} ${c.periodo_anio || ''}`}</div>
        <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{c.contrato_folio}</div>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>{c.arrendatario_nombre}</div>
        <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{c.locales_display || c.locales_referencia}</div>
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
        <div style={{ fontWeight: 700 }}>{fmt(c.importe)}</div>
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
        <div style={{ fontWeight: 700, color: 'var(--color-success)' }}>{fmt(c.total_aplicado)}</div>
        {c.estado === 'PARCIAL' && (
          <div style={{ marginTop: '4px', height: '4px', background: '#E5E7EB', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#7C3AED', borderRadius: '4px' }} />
          </div>
        )}
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'right', color: parseFloat(c.saldo) > 0 ? 'var(--color-danger)' : '#9CA3AF', fontWeight: parseFloat(c.saldo) > 0 ? 700 : 400 }}>
        {fmt(c.saldo)}
      </td>
      <td style={{ padding: '12px 16px', fontSize: '12px', color: vencida ? 'var(--color-danger)' : '#6B7280', fontWeight: vencida ? 700 : 400 }}>
        {c.fecha_vencimiento}
        {vencida && <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-danger)' }}>VENCIDA</div>}
      </td>
      <td style={{ padding: '12px 16px' }}>
        <EstadoBadge estado={c.estado} />
      </td>
    </tr>
  )
}

// ── Fila de ingreso en tabla Ingresos ────────────────────────────────────────
function IngresoRow({ ing, onAplicar }) {
  const sinAplicar = !ing.tiene_aplicacion

  return (
    <tr style={{ borderBottom: '1px solid #F3F4F6' }}
      onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: '12px', color: '#374151' }}>{ing.fecha}</div>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>{ing.propietario || ing.arrendatario_nombre || '—'}</div>
        <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
          {ing.forma_pago}
          {ing.referencia_banco ? ` · ${ing.referencia_banco}` : ''}
        </div>
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
        <div style={{ fontWeight: 800, fontSize: '14px' }}>{fmt(ing.importe_total || ing.importe)}</div>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: '11px', color: '#6B7280' }}>{ing.nota || '—'}</div>
      </td>
      <td style={{ padding: '12px 16px' }}>
        {sinAplicar
          ? <button onClick={() => onAplicar(ing)}
              style={{ padding: '7px 14px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
              Aplicar
            </button>
          : <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-success)', background: '#D1FAE5', padding: '3px 10px', borderRadius: '20px' }}>Aplicado</span>
        }
      </td>
    </tr>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function Cobranza() {
  useModuleAudit('COBRANZA')
  const [tab, setTab] = useState('cartera')
  const [search, setSearch] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const [filtroConcepto, setFiltroConcepto] = useState('Todos')
  const [mesFiltro, setMesFiltro] = useState(new Date().getMonth() + 1)
  const [anioFiltro, setAnioFiltro] = useState(new Date().getFullYear())
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalIngreso, setModalIngreso] = useState(false)
  const [modalCargo, setModalCargo] = useState(false)
  const [modalAplicar, setModalAplicar] = useState(null) // ingreso seleccionado
  const [ingresosRaw, setIngresosRaw] = useState([])
  const [loadingIng, setLoadingIng] = useState(false)
  const [contratos, setContratos] = useState([])

  const onSaved = () => {
    setRefreshKey(k => k + 1)
    setModalIngreso(false)
    setModalAplicar(null)
  }

  // Cargos de cartera
  const { data: cartera, loading: loadingCartera } = usePRP('prp_cartera', {
    order: { col: 'fecha_vencimiento', asc: true },
    refreshKey,
  })

  // Contratos activos para selector
  useEffect(() => {
    supabase.from('prp_contratos').select('id, folio, arrendatario_nombre, locales_display, locales_referencia')
      .then(({ data }) => setContratos(data || []))
  }, [])

  // Ingresos con flag de si tienen aplicación
  useEffect(() => {
    async function fetchIngresos() {
      setLoadingIng(true)
      const { data: ings } = await supabase
        .from('ingresos')
        .select('id, fecha, importe, importe_total, forma_pago, referencia_banco, nota, propietario, id_contrato, contrato_id, created_at')
        .order('fecha', { ascending: false })
        .limit(200)

      if (!ings) { setLoadingIng(false); return }

      const ids = ings.map(i => i.id)
      const { data: apps } = await supabase
        .from('aplicaciones_pago')
        .select('ingreso_id')
        .in('ingreso_id', ids)

      const conApp = new Set((apps || []).map(a => a.ingreso_id))
      setIngresosRaw(ings.map(i => ({ ...i, tiene_aplicacion: conApp.has(i.id) })))
      setLoadingIng(false)
    }
    fetchIngresos()
  }, [refreshKey])

  const lista = cartera || []
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)

  // KPIs
  const carteraVencida = lista.filter(c => c.estado !== 'PAGADO' && c.estado !== 'CANCELADO' && new Date(c.fecha_vencimiento) < hoy)
  const carteraVencidaSum = carteraVencida.reduce((a, c) => a + (parseFloat(c.saldo) || 0), 0)

  const inicioMes = new Date(anioFiltro, mesFiltro === 0 ? 0 : mesFiltro - 1, 1)
  const finMes    = new Date(anioFiltro, mesFiltro === 0 ? 12 : mesFiltro, 0, 23, 59, 59)
  const pagadoMes = lista
    .filter(c => c.estado === 'PAGADO' && new Date(c.fecha_vencimiento) >= inicioMes && new Date(c.fecha_vencimiento) <= finMes)
    .reduce((a, c) => a + (parseFloat(c.total_aplicado) || 0), 0)

  const porCobrar = lista
    .filter(c => c.estado === 'PENDIENTE' && new Date(c.fecha_vencimiento) >= hoy)
    .reduce((a, c) => a + (parseFloat(c.saldo) || 0), 0)

  const ingresosLibres = ingresosRaw.filter(i => !i.tiene_aplicacion).length

  // Filtros cartera
  const pasaFiltrosBase = c => {
    const q = search.toLowerCase()
    const matchQ = !q || (c.arrendatario_nombre || '').toLowerCase().includes(q)
      || (c.descripcion || '').toLowerCase().includes(q)
      || (c.contrato_folio || '').toLowerCase().includes(q)
    const matchEst = filtroEstado === 'Todos' || c.estado === filtroEstado
      || (filtroEstado === 'VENCIDA' && c.estado !== 'PAGADO' && c.estado !== 'CANCELADO' && new Date(c.fecha_vencimiento) < hoy)
    const matchMes = mesFiltro === 0 ? c.periodo_anio === anioFiltro : (c.periodo_mes === mesFiltro && c.periodo_anio === anioFiltro)
    return matchQ && matchEst && matchMes
  }

  const carteraFiltrada = lista.filter(c =>
    pasaFiltrosBase(c) && (filtroConcepto === 'Todos' || c.concepto === filtroConcepto))

  // Cuántos cargos hay de cada concepto con los demás filtros ya aplicados.
  // Va en la etiqueta de cada opción: así se ve que en agosto sí hay una
  // sanción sin tener que seleccionarla para descubrir que no hay nada.
  const conteoPorConcepto = lista.reduce((acc, c) => {
    if (pasaFiltrosBase(c)) acc[c.concepto] = (acc[c.concepto] || 0) + 1
    return acc
  }, {})

  return (
    <div style={{ padding: '24px', maxWidth: '1280px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 4px' }}>Cobranza y Conciliación</h1>
          <p style={{ fontSize: '13px', color: 'var(--color-text-light)', margin: 0 }}>{lista.length} cargos en cartera</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setModalCargo(true)} title="Registrar un cargo por cobrar"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)', borderRadius: '8px', padding: '10px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
            <CalendarPlus size={15} /> Agregar cobro
          </button>
          <button onClick={() => setModalIngreso(true)} title="Registrar un pago recibido"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={15} /> Ingreso
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <KPICard title="Cartera Vencida" value={`$${(carteraVencidaSum / 1000).toFixed(0)}K`} icon={AlertTriangle} color="var(--color-danger)" />
        <KPICard title={mesFiltro === 0 ? `Pagado ${anioFiltro}` : `Pagado ${MES_NOMBRES[mesFiltro]}`} value={`$${(pagadoMes / 1000).toFixed(0)}K`} icon={CheckCircle} color="var(--color-success)" />
        <KPICard title="Por Cobrar" value={`$${(porCobrar / 1000).toFixed(0)}K`} icon={Clock} color="var(--color-warning)" />
        <KPICard title="Ingresos sin Aplicar" value={ingresosLibres} icon={DollarSign} color="var(--color-secondary)" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: '8px', padding: '3px', gap: '2px', marginBottom: '16px', width: 'fit-content' }}>
        {[{ key: 'cartera', label: 'Cartera' }, { key: 'ingresos', label: 'Ingresos' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '7px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none',
            background: tab === t.key ? 'white' : 'transparent',
            color: tab === t.key ? 'var(--color-primary)' : '#6B7280',
            boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Tab Cartera ── */}
      {tab === 'cartera' && (
        <>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar arrendatario, cargo, contrato…"
                style={{ width: '100%', padding: '9px 12px 9px 36px', border: '1.5px solid #E5E7EB', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>

            <select
              value={anioFiltro}
              onChange={e => setAnioFiltro(Number(e.target.value))}
              style={{ padding: '9px 12px', border: '1.5px solid #E5E7EB', borderRadius: '8px', fontSize: '13px', minWidth: '90px' }}>
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <select
              value={mesFiltro}
              onChange={e => setMesFiltro(Number(e.target.value))}
              style={{ padding: '9px 12px', border: '1.5px solid #E5E7EB', borderRadius: '8px', fontSize: '13px', minWidth: '110px' }}>
              <option value={0}>Todos</option>
              {MES_NOMBRES.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>

            <select value={filtroConcepto} onChange={e => setFiltroConcepto(e.target.value)}
              title="Tipo de cargo"
              style={{
                padding: '9px 12px', border: '1.5px solid', borderRadius: '8px', fontSize: '13px', minWidth: '150px',
                borderColor: filtroConcepto === 'Todos' ? '#E5E7EB' : 'var(--color-primary)',
                color: filtroConcepto === 'Todos' ? 'inherit' : 'var(--color-primary)',
                fontWeight: filtroConcepto === 'Todos' ? 400 : 700,
                background: 'white',
              }}>
              <option value="Todos">Todos los conceptos</option>
              {Object.entries(CONCEPTO_META).map(([clave, m]) => (
                <option key={clave} value={clave}>
                  {m.label === 'Mant.' ? 'Mantenimiento' : m.label} ({conteoPorConcepto[clave] || 0})
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { key: 'Todos', label: 'Todos' },
                { key: 'PENDIENTE', label: 'Pendientes' },
                { key: 'VENCIDA', label: 'Vencidas' },
                { key: 'PARCIAL', label: 'Parciales' },
                { key: 'PAGADO', label: 'Pagados' },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setFiltroEstado(key)} style={{
                  padding: '8px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: '1.5px solid',
                  borderColor: filtroEstado === key ? 'var(--color-primary)' : '#E5E7EB',
                  background: filtroEstado === key ? 'var(--color-primary)' : 'white',
                  color: filtroEstado === key ? 'white' : 'var(--color-text-light)',
                }}>{label}</button>
              ))}
            </div>
          </div>

          {/* Qué se está viendo. Con filtros puestos, el total de lo filtrado
              es la respuesta que se busca: cuánto suman las sanciones de agosto. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px', fontSize: '12.5px', color: 'var(--color-text-light)', flexWrap: 'wrap' }}>
            <span><strong style={{ color: '#374151' }}>{carteraFiltrada.length}</strong> de {lista.length} cargos</span>
            <span>Cargo <strong style={{ color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
              ${carteraFiltrada.reduce((a, c) => a + (parseFloat(c.importe) || 0), 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </strong></span>
            <span>Saldo <strong style={{ color: 'var(--color-danger)', fontVariantNumeric: 'tabular-nums' }}>
              ${carteraFiltrada.reduce((a, c) => a + (parseFloat(c.saldo) || 0), 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </strong></span>
            {(filtroConcepto !== 'Todos' || filtroEstado !== 'Todos' || mesFiltro !== 0 || search) && (
              <button onClick={() => { setFiltroConcepto('Todos'); setFiltroEstado('Todos'); setMesFiltro(0); setSearch('') }}
                style={{ marginLeft: 'auto', border: 'none', background: 'none', color: 'var(--color-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                Limpiar filtros
              </button>
            )}
          </div>

          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            {loadingCartera
              ? <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><LoadingSpinner /></div>
              : carteraFiltrada.length === 0
              ? <EmptyState title="Sin cargos" description="No hay cargos que coincidan con los filtros." />
              : <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB' }}>
                        {['Concepto','Descripción','Arrendatario','Cargo','Aplicado','Saldo','Vencimiento','Estado'].map((h, i) => (
                          <th key={h} style={{ padding: '11px 16px', textAlign: i >= 3 && i <= 5 ? 'right' : 'left', fontWeight: 600, fontSize: '11px', color: 'var(--color-text-light)', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {carteraFiltrada.map(c => <CargoRow key={c.id} c={c} />)}
                    </tbody>
                  </table>
                </div>
            }
          </div>
        </>
      )}

      {/* ── Tab Ingresos ── */}
      {tab === 'ingresos' && (
        <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          {loadingIng
            ? <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><LoadingSpinner /></div>
            : ingresosRaw.length === 0
            ? <EmptyState title="Sin ingresos" description="Registra el primer depósito con el botón + Ingreso." />
            : <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB' }}>
                      {['Fecha','Arrendatario','Monto','Nota','Acción'].map(h => (
                        <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: 'var(--color-text-light)', borderBottom: '1px solid #E5E7EB', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ingresosRaw.map(i => <IngresoRow key={i.id} ing={i} onAplicar={setModalAplicar} />)}
                  </tbody>
                </table>
              </div>
          }
        </div>
      )}

      {/* Modales */}
      {modalIngreso && (
        <RegistrarIngresoModal contratos={contratos} onClose={() => setModalIngreso(false)} onSaved={onSaved} />
      )}
      {modalAplicar && (
        <AplicarIngresoModal ingreso={modalAplicar} onClose={() => setModalAplicar(null)} onSaved={onSaved} />
      )}

      {modalCargo && (
        <NuevoCargoModal onClose={() => setModalCargo(false)} onSaved={onSaved} />
      )}
    </div>
  )
}
