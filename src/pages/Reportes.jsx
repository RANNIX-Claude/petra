import { useModuleAudit } from '../hooks/useAudit'
import { useMemo, useState } from 'react'
import { BarChart2, DollarSign, Users, FileText, Printer, Download, Lock } from 'lucide-react'
import KPICard from '../components/ui/KPICard'
import { usePRP } from '../hooks/usePRP'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

function fmt(n) { return '$' + (parseFloat(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 }) }

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// ── Catálogo de reportes: cada uno trae su propio `cargar()` que consulta la
// vista/tabla real correspondiente. Los que no tienen un origen de datos real
// todavía (CFDI/fiscales, Avance de Proyectos) se marcan `disponible:false`
// con el motivo — no vuelven a mostrar filas de ejemplo.
const REPORTES_CAT = [
  {
    categoria: 'Financieros',
    reportes: [
      {
        nombre: 'Estado de Cuenta por Arrendatario', desc: 'Cargos pendientes y parciales de toda la cartera',
        cargar: async () => {
          const { data } = await supabase.from('prp_cartera').select('*')
            .in('estado', ['PENDIENTE', 'PARCIAL']).order('arrendatario_nombre')
          const filas = (data ?? []).map(c => [
            c.arrendatario_nombre || '—', c.locales_display || '—', c.concepto || '—',
            `${MESES[(c.periodo_mes || 1) - 1]} ${c.periodo_anio}`, fmt(c.importe), fmt(c.saldo), c.estado,
          ])
          return {
            columnas: ['Arrendatario', 'Local', 'Concepto', 'Período', 'Importe', 'Saldo', 'Estado'], filas,
            totalLabel: 'Saldo total pendiente', totalValor: fmt((data ?? []).reduce((s, c) => s + (parseFloat(c.saldo) || 0), 0)),
          }
        },
      },
      {
        nombre: 'Cobranza Mensual', desc: 'Cargos, pagos y saldos del mes en curso',
        cargar: async () => {
          const hoy = new Date()
          const mes = hoy.getMonth() + 1, anio = hoy.getFullYear()
          const { data } = await supabase.from('prp_ingresos').select('*').eq('mes', mes).eq('anio', anio).order('fecha')
          const filas = (data ?? []).map(i => [i.arrendatario_nombre || '—', i.locales_display || '—', i.tipo || '—', (i.fecha || '').slice(0, 10), fmt(i.importe)])
          return {
            columnas: ['Arrendatario', 'Local', 'Tipo', 'Fecha', 'Importe'], filas,
            totalLabel: `Total cobrado ${MESES[mes - 1]} ${anio}`, totalValor: fmt((data ?? []).reduce((s, i) => s + (parseFloat(i.importe) || 0), 0)),
          }
        },
      },
      {
        nombre: 'Flujo de Efectivo Proyectado', desc: 'Renta contratada vs. cobrado real, mes a mes',
        cargar: async () => {
          const anio = new Date().getFullYear()
          const [{ data: contratos }, { data: ingresos }] = await Promise.all([
            supabase.from('prp_contratos').select('renta_mensual').eq('estatus', 'VIGENTE'),
            supabase.from('prp_ingresos').select('mes, anio, importe').eq('anio', anio),
          ])
          const rentaVigente = (contratos ?? []).reduce((s, c) => s + (parseFloat(c.renta_mensual) || 0), 0)
          const porMes = Array(12).fill(0)
          for (const i of ingresos ?? []) { const m = parseInt(i.mes); if (m >= 1 && m <= 12) porMes[m - 1] += parseFloat(i.importe) || 0 }
          const filas = MESES.map((m, i) => [m, fmt(rentaVigente), fmt(porMes[i]), fmt(porMes[i] - rentaVigente)])
          return {
            columnas: ['Mes', 'Renta contratada (proyectado)', 'Cobrado real', 'Diferencia'], filas,
            totalLabel: 'Renta mensual contratada actual', totalValor: fmt(rentaVigente),
          }
        },
      },
      {
        nombre: 'Cartera Vencida', desc: 'Arrendatarios con cargos ya vencidos',
        cargar: async () => {
          const hoy = new Date().toISOString().slice(0, 10)
          const { data } = await supabase.from('prp_cartera').select('*')
            .in('estado', ['PENDIENTE', 'PARCIAL']).lt('fecha_vencimiento', hoy).order('fecha_vencimiento')
          const filas = (data ?? []).map(c => [c.arrendatario_nombre || '—', c.locales_display || '—', c.concepto || '—', (c.fecha_vencimiento || '').slice(0, 10), fmt(c.saldo)])
          return {
            columnas: ['Arrendatario', 'Local', 'Concepto', 'Venció', 'Saldo'], filas,
            totalLabel: 'Total vencido', totalValor: fmt((data ?? []).reduce((s, c) => s + (parseFloat(c.saldo) || 0), 0)),
          }
        },
      },
    ]
  },
  {
    categoria: 'Operativos',
    reportes: [
      {
        nombre: 'Ocupación por Inmueble', desc: 'Unidades ocupadas vs. total, por inmueble',
        cargar: async () => {
          const { data } = await supabase.from('prp_inmuebles').select('*').order('nombre')
          const filas = (data ?? []).map(i => {
            const tot = parseInt(i.unidades_total) || 0, ocu = parseInt(i.unidades_ocupadas) || 0
            return [i.nombre, tot, ocu, tot > 0 ? `${Math.round((ocu / tot) * 100)}%` : '—']
          })
          return { columnas: ['Inmueble', 'Total unidades', 'Ocupadas', '% Ocupación'], filas }
        },
      },
      {
        nombre: 'Vencimiento de Contratos', desc: 'Contratos vigentes que vencen en los próximos 90 días',
        cargar: async () => {
          const hoy = new Date(), en90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
          const { data } = await supabase.from('prp_contratos').select('*')
            .eq('estatus', 'VIGENTE').gte('fecha_fin', hoy.toISOString().slice(0, 10)).lte('fecha_fin', en90.toISOString().slice(0, 10))
            .order('fecha_fin')
          const filas = (data ?? []).map(c => [c.arrendatario_nombre || '—', c.locales_display || '—', (c.fecha_fin || '').slice(0, 10), c.dias_restantes ?? '—'])
          return { columnas: ['Arrendatario', 'Local', 'Vence', 'Días restantes'], filas }
        },
      },
      {
        nombre: 'Órdenes de Trabajo', desc: 'OT abiertas o en proceso, por prioridad',
        cargar: async () => {
          const { data } = await supabase.from('ordenes_trabajo').select('*').neq('estado', 'CERRADA').order('fecha_apertura', { ascending: false })
          const filas = (data ?? []).map(o => [o.tipo || '—', o.inmueble || '—', o.area || '—', o.prioridad || '—', o.estado || '—', o.asignado || '—', (o.fecha_apertura || '').slice(0, 10)])
          return { columnas: ['Tipo', 'Inmueble', 'Área', 'Prioridad', 'Estado', 'Asignado', 'Apertura'], filas }
        },
      },
      {
        nombre: 'Avance de Proyectos', desc: 'Progreso físico y presupuestal de obras en curso',
        disponible: false, motivo: 'El módulo de Proyectos todavía no está conectado a datos reales.',
      },
    ]
  },
  {
    categoria: 'Fiscales',
    reportes: [
      { nombre: 'CFDI Emitidos', desc: 'Facturas emitidas con UUID, complemento de pago y status SAT',
        disponible: false, motivo: 'Falta conectar la facturación electrónica (CFDI/timbrado) a este modelo de datos.' },
      { nombre: 'Retenciones ISR / IVA', desc: 'Resumen de retenciones por arrendatario y período',
        disponible: false, motivo: 'Depende de la facturación electrónica, todavía no conectada.' },
      { nombre: 'Declaración Anual Arrendamiento', desc: 'Ingresos acumulados por inmueble para declaración fiscal',
        disponible: false, motivo: 'Depende de la facturación electrónica, todavía no conectada.' },
    ]
  },
  {
    categoria: 'RH y Nómina',
    reportes: [
      {
        nombre: 'Nómina Quincenal', desc: 'Percepciones, deducciones y neto del período más reciente',
        cargar: async () => {
          const { data: periodo } = await supabase.from('nomina_periodos').select('*').order('fecha_fin', { ascending: false }).limit(1).maybeSingle()
          if (!periodo) return { columnas: ['Empleado'], filas: [], vacio: 'No hay períodos de nómina calculados todavía' }
          const { data } = await supabase.from('prp_prenomina').select('*').eq('periodo_id', periodo.id).order('nombre_completo')
          const filas = (data ?? []).map(r => [r.nombre_completo, fmt(r.salario_periodo), fmt(r.total_deducciones), fmt(r.neto_pagar)])
          return {
            columnas: ['Empleado', 'Percepciones', 'Deducciones', 'Neto'], filas,
            totalLabel: `Neto total — ${periodo.folio || periodo.descripcion || ''}`, totalValor: fmt((data ?? []).reduce((s, r) => s + (parseFloat(r.neto_pagar) || 0), 0)),
          }
        },
      },
      {
        nombre: 'Incidencias y Asistencia', desc: 'Faltas, retardos y demás incidencias de los últimos 30 días',
        cargar: async () => {
          const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          const [{ data: incs }, { data: emps }] = await Promise.all([
            supabase.from('rh_incidencias').select('*').gte('fecha', hace30).order('fecha', { ascending: false }),
            supabase.from('prp_empleados').select('id, nombre_completo'),
          ])
          const nombrePorId = Object.fromEntries((emps ?? []).map(e => [e.id, e.nombre_completo]))
          const filas = (incs ?? []).map(i => [nombrePorId[i.empleado_id] || '—', i.tipo || '—', (i.fecha || '').slice(0, 10), i.afecta_nomina ? 'Sí' : 'No', i.descripcion || '—'])
          return { columnas: ['Empleado', 'Tipo', 'Fecha', 'Afecta nómina', 'Descripción'], filas }
        },
      },
    ]
  },
]

function generarReportePDF(nombre, categoria, { columnas, filas, totalLabel, totalValor, vacio }) {
  const win = window.open('', '_blank')
  const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })
  const filasHtml = filas.length
    ? filas.map(f => `<tr>${f.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${columnas.length}" style="text-align:center;color:#999;padding:20px">${vacio || 'Sin registros'}</td></tr>`
  const totalHtml = totalLabel
    ? `<tr><td colspan="${Math.max(columnas.length - 1, 1)}" style="font-weight:700;text-align:right;padding-top:14px">${totalLabel}</td><td style="font-weight:800;padding-top:14px">${totalValor}</td></tr>`
    : ''
  win.document.write(`<!DOCTYPE html><html><head>
  <title>${nombre}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:40px;max-width:900px;margin:0 auto;color:#1a1a1a}
    h1{color:#0A66C2;font-size:22px;margin-bottom:4px}
    .meta{font-size:12px;color:#666;margin-bottom:32px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#0A66C2;color:white;padding:9px 10px;text-align:left;font-size:11px;white-space:nowrap}
    td{padding:8px 10px;border-bottom:1px solid #E5E7EB}
    tr:nth-child(even) td{background:#F9FAFB}
    .footer{margin-top:48px;font-size:11px;color:#999;border-top:1px solid #E5E7EB;padding-top:12px;display:flex;justify-content:space-between}
  </style>
  </head><body>
  <h1>${nombre}</h1>
  <div class="meta">Categoría: ${categoria} &nbsp;·&nbsp; Generado el ${fecha} &nbsp;·&nbsp; Petra — Inmueble Resource Planning</div>
  <table>
    <tr>${columnas.map(c => `<th>${c}</th>`).join('')}</tr>
    ${filasHtml}
    ${totalHtml}
  </table>
  <div class="footer"><span>Petra · RANNIX Consulting 2026</span><span>${nombre}</span></div>
  </body></html>`)
  win.document.close()
  win.print()
}

export default function Reportes() {
  useModuleAudit('REPORTES')
  const [tab, setTab] = useState('dashboard')
  const [year, setYear] = useState('2026')
  const [generando, setGenerando] = useState(null)

  // Todo el Dashboard Ejecutivo sale de estas tres vistas — nada de números
  // fijos: si no hay datos para el año elegido, los paneles simplemente
  // muestran cero/vacío en vez de una cifra inventada.
  const { data: ingresosData }  = usePRP('prp_ingresos')
  const { data: contratosData } = usePRP('prp_contratos')
  const { data: inmueblesData } = usePRP('prp_inmuebles')

  const ingresos   = ingresosData ?? []
  const contratos  = contratosData ?? []
  const inmuebles  = inmueblesData ?? []

  const ingresosDelAnio = useMemo(
    () => ingresos.filter(i => String(i.anio) === year),
    [ingresos, year]
  )

  const ingresosAcumulados = useMemo(
    () => ingresosDelAnio.reduce((a, b) => a + (parseFloat(b.importe) || 0), 0),
    [ingresosDelAnio]
  )

  const cobranzaMensual = useMemo(() => {
    const porMes = Array(12).fill(0)
    for (const i of ingresosDelAnio) {
      const m = parseInt(i.mes)
      if (m >= 1 && m <= 12) porMes[m - 1] += parseFloat(i.importe) || 0
    }
    return porMes
  }, [ingresosDelAnio])
  const maxCobranza = Math.max(1, ...cobranzaMensual)

  const totalUnidades = inmuebles.reduce((a, b) => a + (parseInt(b.unidades_total) || 0), 0)
  const totalOcupadas = inmuebles.reduce((a, b) => a + (parseInt(b.unidades_ocupadas) || 0), 0)
  const ocupacionPromedio = totalUnidades > 0 ? Math.round((totalOcupadas / totalUnidades) * 100) : 0

  const arrendatariosActivos = useMemo(
    () => new Set(contratos.filter(c => c.estatus === 'VIGENTE').map(c => c.arrendatario_id)).size,
    [contratos]
  )

  // No hay tabla de CFDI/timbrado conectada a este modelo todavía (la que
  // existe vive en un esquema `prp` legacy sin relación a estos contratos):
  // el proxy real disponible es el número de ingresos del año con folio de
  // factura capturado.
  const facturasDelAnio = useMemo(
    () => ingresosDelAnio.filter(i => (i.factura || '').trim() !== '').length,
    [ingresosDelAnio]
  )

  const topArrendatarios = useMemo(() => {
    const porArrendatario = {}
    for (const i of ingresosDelAnio) {
      const nombre = i.arrendatario_nombre || 'Sin nombre'
      porArrendatario[nombre] = (porArrendatario[nombre] || 0) + (parseFloat(i.importe) || 0)
    }
    return Object.entries(porArrendatario).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [ingresosDelAnio])
  const maxTop = Math.max(1, ...topArrendatarios.map(([, v]) => v))

  const fmtK = n => n > 0 ? `$${(n / 1000).toFixed(0)}K` : '$0'

  const generar = async (r, cat) => {
    setGenerando(r.nombre)
    try {
      const datos = await r.cargar()
      generarReportePDF(r.nombre, cat, datos)
    } catch (e) {
      toast.error('No se pudo generar el reporte: ' + e.message)
    } finally {
      setGenerando(null)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1280px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 4px' }}>Reportes y BI</h1>
          <p style={{ fontSize: '13px', color: 'var(--color-text-light)', margin: 0 }}>Inteligencia de negocio e informes gerenciales</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: '9px 14px', border: '1.5px solid #E5E7EB', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white' }}>
            {['2024', '2025', '2026'].map(y => <option key={y}>{y}</option>)}
          </select>
          <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <Printer size={14} /> Imprimir dashboard
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
        <KPICard title={`Ingresos ${year}`} value={fmtK(ingresosAcumulados)} icon={DollarSign} color="var(--color-success)" />
        <KPICard title="Ocupación Actual" value={`${ocupacionPromedio}%`} icon={BarChart2} color="var(--color-primary)" />
        <KPICard title="Arrendatarios Activos" value={String(arrendatariosActivos)} icon={Users} color="var(--color-secondary)" />
        <KPICard title="Facturas Registradas" value={String(facturasDelAnio)} icon={FileText} color="var(--color-warning)" />
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '2px solid #E5E7EB' }}>
        {[['dashboard', 'Dashboard Ejecutivo'], ['catalogo', 'Catálogo de Reportes']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
            color: tab === id ? 'var(--color-primary)' : 'var(--color-text-light)',
            borderBottom: tab === id ? '2px solid var(--color-primary)' : '2px solid transparent',
            marginBottom: '-2px',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #E5E7EB', padding: '20px' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>Cobranza Mensual {year}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '140px' }}>
              {MESES.map((mes, i) => {
                const val = cobranzaMensual[i]
                const h = val ? Math.round((val / maxCobranza) * 120) : 0
                return (
                  <div key={mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-light)', fontWeight: 600 }}>{val ? `$${(val/1000).toFixed(0)}K` : ''}</div>
                    <div style={{ width: '100%', height: `${h}px`, background: val ? 'var(--color-primary)' : '#F3F4F6', borderRadius: '4px 4px 0 0', minHeight: '4px', cursor: val ? 'pointer' : 'default', transition: 'opacity 0.15s' }}
                      title={val ? `${mes}: ${fmt(val)}` : ''}
                      onMouseEnter={e => { if (val) e.currentTarget.style.opacity = '0.75' }}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'} />
                    <div style={{ fontSize: '10px', color: 'var(--color-text-light)' }}>{mes}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #E5E7EB', padding: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>Ocupación por Inmueble</div>
              {/* No hay historial de ocupación por mes en la base — esta es la
                  ocupación real y actual de cada inmueble, no una tendencia. */}
              {inmuebles.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--color-text-light)', textAlign: 'center', padding: '20px 0' }}>Sin inmuebles registrados</div>
              ) : inmuebles.map(inm => {
                const tot = parseInt(inm.unidades_total) || 0
                const ocu = parseInt(inm.unidades_ocupadas) || 0
                const pct = tot > 0 ? Math.round((ocu / tot) * 100) : 0
                return (
                  <div key={inm.id} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                      <span>{inm.nombre}</span><span style={{ fontWeight: 700 }}>{pct}% ({ocu}/{tot})</span>
                    </div>
                    <div style={{ height: '6px', background: '#F3F4F6', borderRadius: '4px' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--color-primary)', borderRadius: '4px' }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #E5E7EB', padding: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '16px' }}>Top Arrendatarios por Ingreso {year}</div>
              {topArrendatarios.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--color-text-light)', textAlign: 'center', padding: '20px 0' }}>Sin ingresos registrados en {year}</div>
              ) : topArrendatarios.map(([nombre, monto], i) => (
                <div key={nombre} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--color-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '3px' }}>{nombre}</div>
                    <div style={{ height: '5px', background: '#F3F4F6', borderRadius: '4px' }}>
                      <div style={{ height: '100%', width: `${(monto / maxTop) * 100}%`, background: 'var(--color-secondary)', borderRadius: '4px' }} />
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-success)' }}>{fmtK(monto)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'catalogo' && (
        <div style={{ display: 'grid', gap: '20px' }}>
          {REPORTES_CAT.map(cat => (
            <div key={cat.categoria}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '3px', height: '18px', background: 'var(--color-primary)', borderRadius: '2px' }} />
                {cat.categoria}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px' }}>
                {cat.reportes.map(r => (
                  <div key={r.nombre} style={{ background: 'white', borderRadius: '8px', border: '1px solid #E5E7EB', padding: '14px', opacity: r.disponible === false ? 0.65 : 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>{r.nombre}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-light)', marginBottom: '12px' }}>{r.desc}</div>
                    {r.disponible === false ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--color-text-light)' }}>
                        <Lock size={12} /> {r.motivo}
                      </div>
                    ) : (
                      <button onClick={() => generar(r, cat.categoria)} disabled={generando === r.nombre} style={{
                        display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 600,
                        cursor: generando === r.nombre ? 'default' : 'pointer', border: '1.5px solid #EFF6FF', background: '#EFF6FF', color: 'var(--color-primary)',
                        opacity: generando === r.nombre ? 0.6 : 1,
                      }}>
                        <Download size={11} />{generando === r.nombre ? 'Generando…' : 'Generar reporte'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
