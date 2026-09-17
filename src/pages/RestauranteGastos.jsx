import { useState, useEffect, useCallback, useRef } from 'react'
import { UtensilsCrossed, X, Search, Trash2, ChevronDown, ChevronRight, FileSpreadsheet, Loader2, Images } from 'lucide-react'
import { supabase, urlFirmada, llamarFuncion } from '../lib/supabase'
import { useModuleAudit, logAudit } from '../hooks/useAudit'
import toast from 'react-hot-toast'
import ExcelJS from 'exceljs'
import { ImagenPrivada } from '../components/ui/ArchivoPrivado'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt  = (n) => '$' + (parseFloat(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
const fmt2 = (n) => n != null ? '$' + (parseFloat(n)||0).toLocaleString('es-MX',{minimumFractionDigits:2}) : '—'

const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const GRUPOS_RESTAURANTE = [
  'Ingredientes y alimentos', 'Bebidas', 'Abarrotes', 'Carnes y mariscos',
  'Frutas y verduras', 'Lácteos y derivados', 'Limpieza e higiene', 'Utensilios y equipo',
  'Gas y combustible', 'Empaque y desechables', 'Nómina / Personal', 'Servicios externos',
  'Mantenimiento', 'Papelería y oficina', 'Otros',
]

const GRUPO_COLOR = {
  'Ingredientes y alimentos': '#059669', 'Bebidas': '#0284C7', 'Abarrotes': '#D97706',
  'Carnes y mariscos': '#DC2626', 'Frutas y verduras': '#16a34a', 'Lácteos y derivados': '#7C3AED',
  'Limpieza e higiene': '#0A66C2', 'Utensilios y equipo': '#9333EA',
  'Gas y combustible': '#EA580C', 'Empaque y desechables': '#0891B2',
  'Nómina / Personal': '#4F46E5', 'Servicios externos': '#8B5CF6',
  'Mantenimiento': '#E8A020', 'Papelería y oficina': '#6B7280', 'Otros': '#9CA3AF',
}

const SUPPORTED_IMG = ['image/jpeg','image/png','image/gif','image/webp']

async function fileToB64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target.result
      // PDFs: devolver base64 directo sin conversión canvas
      if (file.type === 'application/pdf') {
        resolve({ b64: dataUrl.split(',')[1], mtype: 'application/pdf', preview: null })
        return
      }
      if (!SUPPORTED_IMG.includes(file.type)) {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
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
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image_base64: b64, media_type: mtype }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}

// ─── Semanas Lun→Dom (restaurante) ───────────────────────────────────────────
function getSemanasLunDom(n = 26) {
  const semanas = []
  const hoy = new Date()
  const dow  = hoy.getDay() // 0=Dom … 6=Sáb
  // Días desde el lunes más reciente: lun=0, mar=1 … dom=6
  const diasDesLun = dow === 0 ? 6 : dow - 1
  const lun0 = new Date(hoy)
  lun0.setDate(hoy.getDate() - diasDesLun)
  lun0.setHours(0,0,0,0)
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const toISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  for (let i = 0; i < n; i++) {
    const ini = new Date(lun0); ini.setDate(lun0.getDate() - i*7)
    const fin = new Date(ini);  fin.setDate(ini.getDate() + 6) // domingo
    semanas.push({
      ini: toISO(ini), fin: toISO(fin),
      label: `Lun ${ini.getDate()} ${MESES[ini.getMonth()]} — Dom ${fin.getDate()} ${MESES[fin.getMonth()]} ${fin.getFullYear()}`,
    })
  }
  return semanas
}

const SEMANAS_DOM_SAB = [
  { ini: 'TODOS', fin: 'TODOS', label: 'Todos los registros' },
  ...getSemanasLunDom(),
]

// ─── Export Excel semanal (formato con totales por día) ─────────────────────
async function exportarReporteSemanal(gastos, semLabel) {
  const porFecha = {}
  gastos.forEach(g => { if (!porFecha[g.fecha]) porFecha[g.fecha] = []; porFecha[g.fecha].push(g) })
  const fechas = Object.keys(porFecha).sort()
  if (!fechas.length) { toast.error('Sin datos para exportar'); return }

  const MESES_L = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
  const d1 = new Date(fechas[0]+'T12:00:00')
  const d2 = new Date(fechas[fechas.length-1]+'T12:00:00')
  const tituloSem = `SEMANA DEL ${d1.getDate()} AL ${d2.getDate()} DE ${MESES_L[d2.getMonth()]} DE ${d2.getFullYear()}`

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Petra — RANNIX Consulting'
  const ws = wb.addWorksheet('Semana')

  // Anchos de columna
  ws.columns = [
    { key:'n',       width: 5  },
    { key:'fecha',   width: 14 },
    { key:'prov',    width: 30 },
    { key:'fac',     width: 28 },
    { key:'conc',    width: 34 },
    { key:'total',   width: 14 },
    { key:'totalDia',width: 16 },
  ]

  const GREEN_DARK  = 'FF2F75B5'   // azul exacto #2F75B5 (RGB 47,117,181)
  const GREEN_LIGHT = 'FFC6EFCE'   // verde claro subtotales
  const WHITE       = 'FFFFFFFF'
  const numFmt      = '"$"#,##0.00'
  const dateFmt     = 'DD/MM/YYYY'
  const borderHair  = { top:{style:'hair',color:{argb:'FFD1D5DB'}}, bottom:{style:'hair',color:{argb:'FFD1D5DB'}} }

  // ── Fila 1: Nombre restaurante ──────────────────────────────────────────────
  const r1 = ws.addRow(['¡Anda Tú!'])
  ws.mergeCells('A1:G1')
  const c1 = r1.getCell(1)
  c1.font      = { name:'Calibri', bold:true, size:14, color:{argb:'FF1A3C5E'} }
  c1.alignment = { horizontal:'center', vertical:'middle' }
  r1.height    = 24

  // ── Fila 2: Semana (verde oscuro) ───────────────────────────────────────────
  const r2 = ws.addRow([tituloSem])
  ws.mergeCells('A2:G2')
  const c2 = r2.getCell(1)
  c2.font      = { name:'Calibri', bold:true, size:12, color:{argb:WHITE} }
  c2.fill      = { type:'pattern', pattern:'solid', fgColor:{argb:GREEN_DARK} }
  c2.alignment = { horizontal:'center', vertical:'middle' }
  r2.height    = 20

  // ── Fila 3: Headers (verde oscuro, texto blanco) ────────────────────────────
  const hdrs = ['#','FECHA','PROVEEDOR','FACTURA','CONCEPTO','Total $','TOTAL POR DÍA $']
  const r3 = ws.addRow(hdrs)
  r3.eachCell(cell => {
    cell.font      = { name:'Calibri', bold:true, size:10, color:{argb:WHITE} }
    cell.fill      = { type:'pattern', pattern:'solid', fgColor:{argb:GREEN_DARK} }
    cell.alignment = { horizontal:'center', vertical:'middle' }
    cell.border    = { bottom:{style:'thin',color:{argb:WHITE}} }
  })
  r3.height = 18
  // AutoFilter en headers
  ws.autoFilter = { from:'A3', to:'G3' }

  // ── Filas de datos ──────────────────────────────────────────────────────────
  let grand = 0, rowNum = 1

  fechas.forEach(f => {
    const items = porFecha[f]
    const dayTotal = items.reduce((s,g) => s+(parseFloat(g.total)||0), 0)
    grand += dayTotal

    items.forEach((g, idx) => {
      const isLast = idx === items.length - 1
      const bgArgb = idx%2===0 ? WHITE : 'FFF2F2F2'

      // Convertir fecha YYYY-MM-DD → Date object para formato DD/MM/YYYY
      const fechaDate = new Date(g.fecha + 'T12:00:00')

      const row = ws.addRow([
        rowNum++,
        fechaDate,
        g.proveedor || '—',
        g.folio || '',
        g.descripcion || g.grupo_gasto || '',
        parseFloat(g.total) || 0,
        isLast ? dayTotal : null,
      ])
      row.height = 15

      // # (número de fila)
      const cN = row.getCell(1)
      cN.font={name:'Calibri',size:9}; cN.alignment={horizontal:'center',vertical:'middle'}
      cN.fill={type:'pattern',pattern:'solid',fgColor:{argb:bgArgb}}; cN.border=borderHair

      // FECHA
      const cF = row.getCell(2)
      cF.numFmt=dateFmt; cF.font={name:'Calibri',size:9}; cF.alignment={horizontal:'center',vertical:'middle'}
      cF.fill={type:'pattern',pattern:'solid',fgColor:{argb:bgArgb}}; cF.border=borderHair

      // PROVEEDOR
      const cP = row.getCell(3)
      cP.font={name:'Calibri',bold:true,size:9}; cP.alignment={horizontal:'left',vertical:'middle'}
      cP.fill={type:'pattern',pattern:'solid',fgColor:{argb:bgArgb}}; cP.border=borderHair

      // FACTURA
      const cFac = row.getCell(4)
      cFac.font={name:'Calibri',size:8,color:{argb:'FF6B7280'}}; cFac.alignment={horizontal:'left',vertical:'middle'}
      cFac.fill={type:'pattern',pattern:'solid',fgColor:{argb:bgArgb}}; cFac.border=borderHair

      // CONCEPTO
      const cC = row.getCell(5)
      cC.font={name:'Calibri',size:9}; cC.alignment={horizontal:'left',vertical:'middle'}
      cC.fill={type:'pattern',pattern:'solid',fgColor:{argb:bgArgb}}; cC.border=borderHair

      // Total $
      const cT = row.getCell(6)
      cT.numFmt=numFmt; cT.font={name:'Calibri',size:9}
      cT.alignment={horizontal:'right',vertical:'middle'}
      cT.fill={type:'pattern',pattern:'solid',fgColor:{argb:bgArgb}}; cT.border=borderHair

      // TOTAL POR DÍA
      const cD = row.getCell(7)
      if (isLast) {
        cD.numFmt=numFmt
        cD.font={name:'Calibri',bold:true,size:10,color:{argb:'FF15803D'}}
        cD.fill={type:'pattern',pattern:'solid',fgColor:{argb:GREEN_LIGHT}}
        cD.alignment={horizontal:'right',vertical:'middle'}
        cD.border={...borderHair,right:{style:'medium',color:{argb:'FF15803D'}}}
      } else {
        cD.fill={type:'pattern',pattern:'solid',fgColor:{argb:bgArgb}}; cD.border=borderHair
      }
    })
  })

  // ── Fila total semana ───────────────────────────────────────────────────────
  const rT = ws.addRow([null, null, null, null, null, grand, grand])
  rT.height = 20
  ;[1,2,3,4,5].forEach(c => {
    const cell = rT.getCell(c)
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:GREEN_LIGHT}}
    cell.border=borderHair
  })
  ;[6,7].forEach(c => {
    const cell = rT.getCell(c)
    cell.numFmt=numFmt
    cell.font={name:'Calibri',bold:true,size:12,color:{argb:'FF15803D'}}
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:GREEN_LIGHT}}
    cell.alignment={horizontal:'right',vertical:'middle'}
    cell.border=borderHair
  })

  // ── Generar y descargar ─────────────────────────────────────────────────────
  const buf  = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `restaurante_${tituloSem.replace(/\s+/g,'_')}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
  toast.success('Reporte Excel generado')
}

function exportarExcel(gastos) {
  const rows = [
    ['Fecha','Proveedor','RFC','Folio','Grupo','Descripción','Subtotal','IVA','Total','Factura'],
    ...gastos.map(g => [
      g.fecha, g.proveedor||'—', g.rfc||'', g.folio||'',
      g.grupo_gasto||'', g.descripcion||'',
      g.subtotal??'', g.iva??'', g.total??'',
      g.tiene_factura?'Sí':'No',
    ])
  ]
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `restaurante_gastos_${hoyISO()}.csv`; a.click()
  URL.revokeObjectURL(url)
  toast.success('Exportado a CSV')
}

// ─── TicketCard para carga masiva ─────────────────────────────────────────────
function TicketCard({ t, idx, setForm, quitar }) {
  const [showLineas, setShowLineas] = useState(false)
  const ocr = t.ocr || {}
  const prv = ocr.proveedor || {}
  const tkt = ocr.ticket   || {}
  const lineas = ocr.lineas || []
  const ok = t.estado === 'listo' || t.estado === 'error_guardar'

  const parseProvNombre = (val) => {
    if (!val) return ''
    if (typeof val === 'object') return val.nombre_comercial || ''
    if (typeof val === 'string' && val.startsWith('{')) {
      try { return JSON.parse(val)?.nombre_comercial || val } catch { return val }
    }
    return val
  }

  return (
    <div style={{ border:'1.5px solid #E5E7EB', borderRadius:10, marginBottom:14, overflow:'hidden', background: t.estado==='guardado'?'#F0FDF4':'white' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#F9FAFB', borderBottom:'1px solid #E5E7EB' }}>
        <div style={{ flexShrink:0, width:52, height:52, borderRadius:7, overflow:'hidden', background:'#F3F4F6', border:'1px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {t.preview ? <img src={t.preview} alt="ticket" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : <Loader2 size={18} color="#9CA3AF" style={{ animation:'spin 1s linear infinite' }} />}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            #{idx+1} {prv.nombre_comercial || parseProvNombre(t.form?.proveedor_nombre) || t.file.name}
          </div>
          {prv.rfc && <div style={{ fontSize:10, color:'#6B7280' }}>RFC: {prv.rfc}</div>}
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
          {t.estado==='leyendo'   && <span style={{ fontSize:10, background:'#EFF6FF', color:'#0A66C2', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>Leyendo…</span>}
          {t.estado==='ocrizando' && <span style={{ fontSize:10, background:'#FFF7ED', color:'#C2410C', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>⏳ IA…</span>}
          {t.estado==='listo'     && <span style={{ fontSize:10, background:'#ECFDF5', color:'#057642', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>✓ Listo</span>}
          {t.estado==='guardado'  && <span style={{ fontSize:10, background:'#DCFCE7', color:'#15803D', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>✅ Guardado</span>}
          {(t.estado==='error'||t.estado==='error_guardar') && <span style={{ fontSize:10, background:'#FEF2F2', color:'#B24020', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>❌ Error</span>}
          <button onClick={() => quitar(t.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:14 }}>✕</button>
        </div>
      </div>

      {ok && (
        <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>
          {/* Proveedor */}
          <div style={{ background:'#F5F3FF', borderRadius:7, padding:'8px 10px' }}>
            <div style={{ fontSize:10, fontWeight:800, color:'#7B5EA7', textTransform:'uppercase', marginBottom:6 }}>🏪 Proveedor</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 10px' }}>
              {[['Nombre comercial','proveedor_nombre','Nombre visible en ticket'],['RFC','proveedor_rfc',''],['Razón social','proveedor_razon_social',''],['Sucursal','proveedor_sucursal','Ej: Suc. Centro']].map(([lbl,key,ph]) => (
                <div key={key}>
                  <label style={{ fontSize:10, fontWeight:700, color:'#6B7280' }}>{lbl}</label>
                  <input value={t.form[key]||''} onChange={e => setForm(t.id,key,e.target.value)} placeholder={ph}
                    style={{ width:'100%', padding:'4px 7px', border:'1.5px solid #DDD6FE', borderRadius:5, fontSize:12, boxSizing:'border-box' }} />
                </div>
              ))}
            </div>
          </div>

          {/* Ticket financiero */}
          <div style={{ background:'#FFFBEB', borderRadius:7, padding:'8px 10px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <div style={{ fontSize:10, fontWeight:800, color:'#92400E', textTransform:'uppercase' }}>🧾 Ticket</div>
              {tkt.validacion && (
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:tkt.validacion==='ok'?'#DCFCE7':'#FEF3C7', color:tkt.validacion==='ok'?'#15803D':'#92400E' }}>
                  {tkt.validacion==='ok'?'✔ Totales OK':`⚠ ${tkt.validacion}`}
                </span>
              )}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'4px 10px', marginBottom:8 }}>
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:'#6B7280' }}>Fecha</label>
                <input type="date" value={t.form.fecha||''} onChange={e => setForm(t.id,'fecha',e.target.value)}
                  style={{ width:'100%', padding:'4px 7px', border:'1.5px solid #FDE68A', borderRadius:5, fontSize:12, boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize:10, fontWeight:700, color:'#6B7280' }}>Folio</label>
                <input value={t.form.folio||''} onChange={e => setForm(t.id,'folio',e.target.value)}
                  style={{ width:'100%', padding:'4px 7px', border:'1.5px solid #FDE68A', borderRadius:5, fontSize:12, boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize:10, fontWeight:800, color:'#92400E' }}>TOTAL $</label>
                <input type="number" value={t.form.ticket_total||''} onChange={e => setForm(t.id,'ticket_total',e.target.value)}
                  style={{ width:'100%', padding:'4px 7px', border:'2px solid #F59E0B', borderRadius:5, fontSize:13, fontWeight:800, boxSizing:'border-box', color:'#92400E' }} />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'4px 10px' }}>
              {[['Subtotal','subtotal'],['IVA','iva_monto'],['IEPS','ieps_monto']].map(([lbl,key]) => (
                <div key={key}>
                  <label style={{ fontSize:10, fontWeight:700, color:'#6B7280' }}>{lbl}</label>
                  <input type="number" value={t.form[key]||''} onChange={e => setForm(t.id,key,e.target.value)}
                    style={{ width:'100%', padding:'4px 7px', border:'1.5px solid #FDE68A', borderRadius:5, fontSize:12, boxSizing:'border-box' }} />
                </div>
              ))}
            </div>
          </div>

          {/* Artículos */}
          {lineas.length > 0 && (
            <div style={{ border:'1px solid #E5E7EB', borderRadius:7, overflow:'hidden' }}>
              <button onClick={() => setShowLineas(v=>!v)}
                style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 10px', background:'#F9FAFB', border:'none', cursor:'pointer', fontSize:11, fontWeight:700, color:'#374151' }}>
                <span>📦 {lineas.length} artículo{lineas.length!==1?'s':''}</span>
                {showLineas ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
              </button>
              {showLineas && (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                    <thead>
                      <tr style={{ background:'#F3F4F6' }}>
                        {['SKU','Descripción','Cant.','P/U','Subtotal','Imp.'].map((h,i) => (
                          <th key={h} style={{ padding:'5px 7px', textAlign:i>1?'right':'left', fontSize:9, fontWeight:700, color:'#6B7280', textTransform:'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lineas.map((l,li) => (
                        <tr key={li} style={{ borderTop:'1px solid #F3F4F6', background:li%2===0?'white':'#FAFAFA' }}>
                          <td style={{ padding:'4px 7px', color:'#9CA3AF', fontFamily:'monospace', fontSize:10 }}>{l.sku||'—'}</td>
                          <td style={{ padding:'4px 7px', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.descripcion}</td>
                          <td style={{ padding:'4px 7px', textAlign:'right' }}>{l.cantidad}</td>
                          <td style={{ padding:'4px 7px', textAlign:'right', fontFamily:'monospace' }}>{fmt2(l.precio_unit)}</td>
                          <td style={{ padding:'4px 7px', textAlign:'right', fontFamily:'monospace', fontWeight:700 }}>{fmt2(l.subtotal_linea ?? (l.cantidad*(l.precio_unit||0)))}</td>
                          <td style={{ padding:'4px 7px', textAlign:'right' }}>
                            {l.tasa_impuesto ? <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:3, background:'#DBEAFE', color:'#1D4ED8' }}>{l.tasa_impuesto}</span> : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Datos del gasto */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:'6px 10px' }}>
            <div>
              <label style={{ fontSize:10, fontWeight:700, color:'#374151' }}>Descripción / Concepto</label>
              <input value={t.form.descripcion||''} onChange={e => setForm(t.id,'descripcion',e.target.value)} placeholder="Opcional"
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

// ─── Modal captura manual ─────────────────────────────────────────────────────
function ModalTicketIndividual({ onClose, onSaved }) {
  const hoy = hoyISO()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    fecha: hoy, proveedor: '', razon_social: '', rfc: '', folio: '',
    subtotal: '', iva: '', total: '', grupo_gasto: 'Otros', descripcion: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Calcular total automático si subtotal + iva cambian
  const calcTotal = (sub, iv) => {
    const s = parseFloat(sub) || 0
    const i = parseFloat(iv) || 0
    if (s > 0) set('total', (s + i).toFixed(2))
  }

  const guardar = async () => {
    if (!form.proveedor) { toast.error('Ingresa el nombre del proveedor'); return }
    if (!form.total)     { toast.error('Ingresa el total'); return }
    setSaving(true)
    try {
      const dt = new Date(form.fecha + 'T12:00:00')
      const { error } = await supabase.from('restaurante_gastos').insert({
        fecha: form.fecha,
        mes: dt.getMonth() + 1,
        anio: dt.getFullYear(),
        proveedor: form.proveedor || null,
        razon_social: form.razon_social || null,
        rfc: form.rfc || null,
        folio: form.folio || null,
        subtotal: form.subtotal ? parseFloat(form.subtotal) : null,
        iva: form.iva ? parseFloat(form.iva) : null,
        total: parseFloat(form.total),
        grupo_gasto: form.grupo_gasto,
        descripcion: form.descripcion || null,
      })
      if (error) throw error
      toast.success('Gasto guardado')
      onSaved()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const inp = { border:'1px solid #D1D5DB', borderRadius:7, padding:'8px 10px', fontSize:13, width:'100%', outline:'none', boxSizing:'border-box' }
  const lbl = { fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:3 }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.5)' }}>
      <div style={{ background:'white', borderRadius:14, width:'min(540px,96vw)', boxShadow:'0 25px 60px rgba(0,0,0,0.25)', display:'flex', flexDirection:'column', maxHeight:'90vh', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'18px 22px', borderBottom:'1px solid #E5E7EB', background:'#EFF6FF' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:15, color:'#1D4ED8' }}>📋 Ticket Individual</div>
            <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>Captura manual de gasto de restaurante</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF' }}><X size={20}/></button>
        </div>

        {/* Cuerpo */}
        <div style={{ overflowY:'auto', padding:'20px 22px', display:'flex', flexDirection:'column', gap:14 }}>
          {/* Fecha */}
          <div>
            <label style={lbl}>Fecha *</label>
            <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} style={inp} />
          </div>

          {/* Proveedor */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={lbl}>Proveedor / Nombre comercial *</label>
              <input value={form.proveedor} onChange={e => set('proveedor', e.target.value)} placeholder="Ej. Costco" style={inp} />
            </div>
            <div>
              <label style={lbl}>Razón social</label>
              <input value={form.razon_social} onChange={e => set('razon_social', e.target.value)} placeholder="Ej. Costco de México S.A." style={inp} />
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={lbl}>RFC</label>
              <input value={form.rfc} onChange={e => set('rfc', e.target.value.toUpperCase())} placeholder="Ej. CME910715UB9" style={inp} />
            </div>
            <div>
              <label style={lbl}>Folio / Factura</label>
              <input value={form.folio} onChange={e => set('folio', e.target.value)} placeholder="Ej. A-001234" style={inp} />
            </div>
          </div>

          {/* Montos */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <div>
              <label style={lbl}>Subtotal</label>
              <input type="number" step="0.01" value={form.subtotal}
                onChange={e => { set('subtotal', e.target.value); calcTotal(e.target.value, form.iva) }}
                placeholder="0.00" style={inp} />
            </div>
            <div>
              <label style={lbl}>IVA</label>
              <input type="number" step="0.01" value={form.iva}
                onChange={e => { set('iva', e.target.value); calcTotal(form.subtotal, e.target.value) }}
                placeholder="0.00" style={inp} />
            </div>
            <div>
              <label style={lbl}>Total *</label>
              <input type="number" step="0.01" value={form.total}
                onChange={e => set('total', e.target.value)}
                placeholder="0.00" style={{ ...inp, fontWeight:700, borderColor:'#0A66C2' }} />
            </div>
          </div>

          {/* Grupo */}
          <div>
            <label style={lbl}>Grupo / Categoría</label>
            <select value={form.grupo_gasto} onChange={e => set('grupo_gasto', e.target.value)} style={inp}>
              {GRUPOS_RESTAURANTE.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {/* Descripción */}
          <div>
            <label style={lbl}>Descripción / Concepto</label>
            <input value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
              placeholder="Ej. Compra semanal ingredientes" style={inp} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop:'1px solid #E5E7EB', padding:'14px 22px', display:'flex', justifyContent:'flex-end', gap:10, background:'#F9FAFB' }}>
          <button onClick={onClose} style={{ padding:'9px 18px', background:'#F3F4F6', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>Cancelar</button>
          <button onClick={guardar} disabled={saving}
            style={{ padding:'9px 20px', background:saving?'#9CA3AF':'#0A66C2', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:800, cursor:saving?'not-allowed':'pointer' }}>
            {saving ? 'Guardando…' : 'Guardar gasto'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal carga masiva ───────────────────────────────────────────────────────
function ModalCargaMasiva({ onClose, onSaved }) {
  const hoy = hoyISO()
  const [tickets, setTickets] = useState([])
  const [saving, setSaving]   = useState(false)
  const fileRef = useRef()

  const setTicket = (id, patch) => setTickets(prev => prev.map(t => t.id===id ? { ...t, ...patch } : t))
  const setForm   = (id, field, val) => setTickets(prev => prev.map(t => t.id===id ? { ...t, form:{ ...t.form,[field]:val } } : t))
  const quitar    = (id) => setTickets(prev => prev.filter(t => t.id!==id))

  const formDeOcr = (ocr) => {
    const prv = ocr?.proveedor || {}
    const tkt = ocr?.ticket   || {}
    const parseProvNombre = (val) => {
      if (!val) return ''
      if (typeof val === 'object') return val.nombre_comercial || ''
      if (typeof val === 'string' && val.startsWith('{')) { try { return JSON.parse(val)?.nombre_comercial || val } catch { return val } }
      return val
    }
    return {
      fecha: tkt.fecha || ocr?.fecha || hoy,
      folio: tkt.folio || '',
      grupo_gasto: '',
      descripcion: '',
      proveedor_nombre: parseProvNombre(prv.nombre_comercial || prv || ocr?.proveedor_str) || '',
      proveedor_rfc: prv.rfc || '',
      proveedor_razon_social: prv.razon_social || '',
      proveedor_sucursal: prv.nombre_sucursal || '',
      ticket_total: tkt.total != null ? String(tkt.total) : (ocr?.total != null ? String(ocr.total) : ''),
      subtotal: tkt.subtotal || '', iva_monto: tkt.iva_monto || '', ieps_monto: tkt.ieps_monto || '',
    }
  }

  const agregarArchivos = async (files) => {
    const nuevos = Array.from(files).map(f => ({
      id: `${Date.now()}-${Math.random()}`, file: f,
      preview: null, b64: null, mtype: null, estado: 'leyendo', ocr: null,
      form: { fecha:hoy, folio:'', grupo_gasto:'', descripcion:'', proveedor_nombre:'', proveedor_rfc:'', proveedor_razon_social:'', proveedor_sucursal:'', ticket_total:'', subtotal:'', iva_monto:'', ieps_monto:'' },
    }))
    setTickets(prev => [...prev, ...nuevos])
    for (const ticket of nuevos) {
      try {
        const img = await fileToB64(ticket.file)
        if (!img) { setTicket(ticket.id, { estado:'error', errorMsg:'No se pudo leer la imagen' }); continue }
        setTicket(ticket.id, { b64:img.b64, mtype:img.mtype, preview:img.preview, estado:'ocrizando' })
        const ocr = await ocrizarTicket(img.b64, img.mtype)
        if (typeof ocr.proveedor === 'string') ocr.proveedor_str = ocr.proveedor
        setTicket(ticket.id, { ocr, form: formDeOcr(ocr), estado:'listo' })
      } catch (err) {
        setTicket(ticket.id, { estado:'error', errorMsg: err.message })
      }
    }
  }

  const guardarTodos = async () => {
    const pendientes = tickets.filter(t => t.estado==='listo' || t.estado==='error_guardar')
    setSaving(true)
    for (const t of pendientes) {
      try {
        const fecha = t.form.fecha || hoy
        const dt = new Date(fecha + 'T12:00:00')
        // Subir imagen via Netlify Function (service_role key server-side)
        let ticket_url = null
        if (t.b64 && t.mtype) {
          const ext  = t.mtype === 'application/pdf' ? 'pdf' : (t.mtype.split('/')[1] || 'jpg')
          const filePath = `restaurante/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
          try {
            const upResp = await llamarFuncion('subir-comprobante', { bucket: 'tickets-gastos', path: filePath, file_base64: t.b64, mime_type: t.mtype })
            if (upResp.ok) {
              const upData = await upResp.json()
              ticket_url = upData.url || null
            } else {
              const upData = await upResp.json().catch(() => ({}))
              toast.error(`Error al subir imagen: ${upData.error || upResp.status}`)
            }
          } catch (e) {
            toast.error(`Error al subir imagen: ${e.message}`)
          }
        }
        // Insertar gasto
        const { data: inserted, error: gErr } = await supabase.from('restaurante_gastos').insert({
          fecha, mes: dt.getMonth()+1, anio: dt.getFullYear(),
          proveedor: t.form.proveedor_nombre || null,
          razon_social: t.form.proveedor_razon_social || null,
          rfc: t.form.proveedor_rfc || null,
          folio: t.form.folio || null,
          subtotal: t.form.subtotal ? parseFloat(t.form.subtotal) : null,
          iva: t.form.iva_monto ? parseFloat(t.form.iva_monto) : null,
          total: t.form.ticket_total ? parseFloat(t.form.ticket_total) : null,
          ticket_url,
          grupo_gasto: t.form.grupo_gasto,
          descripcion: t.form.descripcion || null,
        }).select('id').single()
        if (gErr) throw gErr
        // Insertar detalle
        const lineas = t.ocr?.lineas || []
        if (lineas.length && inserted?.id) {
          await supabase.from('restaurante_gasto_detalle').insert(
            lineas.map(l => ({
              gasto_id: inserted.id,
              sku: l.sku || null, descripcion: l.descripcion || null,
              cantidad: l.cantidad ?? null, precio_unit: l.precio_unit ?? null,
              subtotal_linea: l.subtotal_linea ?? null, tasa_impuesto: l.tasa_impuesto || null,
            }))
          )
        }
        setTicket(t.id, { estado:'guardado' })
      } catch (err) {
        setTicket(t.id, { estado:'error_guardar', errorMsg: err.message })
      }
    }
    setSaving(false)
    const guardados = tickets.filter(t => t.estado==='guardado').length + pendientes.filter(t=>t.estado==='listo').length
    toast.success(`${guardados} ticket(s) guardados`)
    onSaved()
  }

  const listos    = tickets.filter(t => t.estado==='listo' || t.estado==='error_guardar')
  const guardados = tickets.filter(t => t.estado==='guardado')

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'flex-start', justifyContent:'center', background:'rgba(0,0,0,0.5)', padding:'20px 0', overflowY:'auto' }}>
      <div style={{ background:'white', borderRadius:14, width:'min(760px,96vw)', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 25px 60px rgba(0,0,0,0.25)' }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'18px 22px', borderBottom:'1px solid #E5E7EB', background:'#F0FDF4', borderRadius:'14px 14px 0 0' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:16, color:'#15803D' }}>🍽️ Importar Tickets — Restaurante</div>
            <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>Carga masiva con OCR · IA extrae datos automáticamente</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF' }}><X size={20}/></button>
        </div>

        {/* Drop zone */}
        <div
          onDrop={e => { e.preventDefault(); agregarArchivos(e.dataTransfer.files) }}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          style={{ margin:'16px 22px 0', border:'2px dashed #86EFAC', borderRadius:10, padding:'22px', textAlign:'center', cursor:'pointer', background:'#F0FDF4' }}>
          <Images size={28} color="#16a34a" style={{ margin:'0 auto 8px' }} />
          <div style={{ fontSize:13, fontWeight:700, color:'#15803D' }}>Arrastra imágenes de tickets o haz clic</div>
          <div style={{ fontSize:11, color:'#6B7280', marginTop:4 }}>JPG, PNG, WebP — puedes seleccionar múltiples</div>
          <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" style={{ display:'none' }} onChange={e => agregarArchivos(e.target.files)} />
        </div>

        {/* Lista de tickets */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px 22px' }}>
          {tickets.length === 0 && (
            <div style={{ textAlign:'center', color:'#9CA3AF', padding:'30px 0', fontSize:13 }}>Sin tickets cargados</div>
          )}
          {tickets.map((t, idx) => (
            <TicketCard key={t.id} t={t} idx={idx} setForm={setForm} quitar={quitar} />
          ))}
        </div>

        {/* Footer */}
        {tickets.length > 0 && (
          <div style={{ borderTop:'1px solid #E5E7EB', padding:'14px 22px', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#F9FAFB' }}>
            <div style={{ fontSize:12, color:'#6B7280' }}>
              {listos.length} listo(s) · {guardados.length} guardado(s) · {tickets.length} total
            </div>
            <button onClick={guardarTodos} disabled={saving || listos.length===0}
              style={{ padding:'10px 24px', background:saving||listos.length===0?'#9CA3AF':'#15803D', color:'white', border:'none', borderRadius:9, fontWeight:800, fontSize:14, cursor:saving||listos.length===0?'not-allowed':'pointer' }}>
              {saving ? 'Guardando…' : `Guardar ${listos.length} ticket(s)`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function RestauranteGastos() {
  useModuleAudit('RESTAURANTE')
  const [gastos, setGastos]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [semSel, setSemSel]         = useState(SEMANAS_DOM_SAB[0]) // default: todos
  const [fechaIni, setFechaIni]     = useState('')
  const [fechaFin, setFechaFin]     = useState('')
  const [proveedorFil, setProveedorFil] = useState('')
  const [modal, setModal]           = useState(null)
  const [detalle, setDetalle]       = useState(null)
  const [lightbox, setLightbox]     = useState(null)
  const [subiendoTicket, setSubiendoTicket] = useState(null)
  const [artIds, setArtIds]         = useState(null) // IDs de gastos que tienen el artículo buscado

  // El lightbox pinta la URL directo, así que hay que firmarla antes de abrirlo.
  const abrirLightbox = async (valor) => {
    const url = await urlFirmada('tickets-gastos', valor)
    if (url) setLightbox(url)
    else toast.error('No se pudo abrir el ticket')
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('restaurante_gastos').select('*').order('fecha', { ascending: false })
    if (fechaIni) q = q.gte('fecha', fechaIni)
    if (fechaFin) q = q.lte('fecha', fechaFin)
    q = q.limit(2000)
    const { data, error } = await q
    if (error) toast.error(error.message)
    setGastos(data || [])
    setLoading(false)
  }, [fechaIni, fechaFin])

  // Búsqueda en artículos (restaurante_gasto_detalle)
  const buscarArticulo = useCallback(async (term) => {
    if (!term.trim()) { setArtIds(null); return }
    const { data } = await supabase.from('restaurante_gasto_detalle')
      .select('gasto_id')
      .ilike('descripcion', `%${term}%`)
    setArtIds(data ? data.map(d => d.gasto_id) : [])
  }, [])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { buscarArticulo(search) }, [search, buscarArticulo])

  const abrirDetalle = async (g) => {
    setDetalle({ gasto: g, lineas: [] })
    const { data } = await supabase.from('restaurante_gasto_detalle').select('*').eq('gasto_id', g.id).order('created_at')
    setDetalle({ gasto: g, lineas: data || [] })
  }

  const eliminar = async (g) => {
    if (!window.confirm(`¿Eliminar gasto de ${g.proveedor || 'proveedor'} por ${fmt(g.total)}?`)) return
    const { error } = await supabase.from('restaurante_gastos').delete().eq('id', g.id)
    if (error) toast.error(error.message)
    else {
      logAudit({ modulo: 'RESTAURANTE', accion: 'ELIMINAR', entidad: 'gasto', entidad_id: g.id, descripcion: `Gasto eliminado: ${g.proveedor || ''} $${g.total}` })
      toast.success('Gasto eliminado'); cargar()
    }
  }

  const subirTicketRetro = async (gastoId, file) => {
    if (!file) return
    setSubiendoTicket(gastoId)
    try {
      const img = await fileToB64(file)
      if (!img) { toast.error('No se pudo leer el archivo'); return }
      const ext  = img.mtype === 'application/pdf' ? 'pdf' : (img.mtype.split('/')[1] || 'jpg')
      const filePath = `restaurante/${gastoId}-retro-${Date.now()}.${ext}`
      const upResp = await llamarFuncion('subir-comprobante', { bucket: 'tickets-gastos', path: filePath, file_base64: img.b64, mime_type: img.mtype })
      if (!upResp.ok) { const e = await upResp.json().catch(() => ({})); toast.error(`Error al subir: ${e.error || upResp.status}`); return }
      const { url: ticket_url } = await upResp.json()
      await supabase.from('restaurante_gastos').update({ ticket_url }).eq('id', gastoId)
      logAudit({ modulo: 'RESTAURANTE', accion: 'SUBIR_DOCUMENTO', entidad: 'gasto', entidad_id: gastoId, descripcion: 'Ticket retro adjuntado' })
      toast.success('Ticket adjuntado')
      abrirLightbox(ticket_url)   // abrir lightbox inmediatamente
      cargar()
    } finally { setSubiendoTicket(null) }
  }

  // Proveedores únicos para el filtro
  const proveedores = [...new Set(gastos.map(g => g.proveedor).filter(Boolean))].sort()

  const filtrados = gastos.filter(g => {
    const q = search.toLowerCase()
    // Filtro proveedor dropdown
    if (proveedorFil && g.proveedor !== proveedorFil) return false
    // Búsqueda texto: proveedor, folio, descripción o artículo (via artIds)
    if (q) {
      const matchTexto = (g.proveedor||'').toLowerCase().includes(q)
        || (g.descripcion||'').toLowerCase().includes(q)
        || (g.folio||'').toLowerCase().includes(q)
        || (g.rfc||'').toLowerCase().includes(q)
      const matchArt = artIds !== null && artIds.includes(g.id)
      if (!matchTexto && !matchArt) return false
    }
    return true
  })

  const totalFiltrado = filtrados.reduce((a,g) => a + (parseFloat(g.total)||0), 0)

  // Agrupar por fecha para la vista de tabla
  const porFecha = {}
  filtrados.forEach(g => { if (!porFecha[g.fecha]) porFecha[g.fecha] = []; porFecha[g.fecha].push(g) })
  const fechasOrdenadas = Object.keys(porFecha).sort()

  const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  const MESES_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const labelFecha = (iso) => {
    const d = new Date(iso+'T12:00:00')
    return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES_L[d.getMonth()]}`
  }

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:'#F8FAFC' }}>
      {/* Header */}
      <div style={{ padding:'14px 24px 12px', borderBottom:'1px solid #E5E7EB', background:'white' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
          <div>
            <div style={{ fontWeight:900, fontSize:18, color:'#1A3C5E', display:'flex', alignItems:'center', gap:8 }}>
              <UtensilsCrossed size={18} color="#15803D"/> Restaurante — Gastos
            </div>
            <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>Corte semanal · Lunes → Domingo · OCR con IA</div>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <button onClick={() => exportarReporteSemanal(filtrados, semSel.label).catch(e => toast.error('Error al generar Excel'))}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'#15803D', color:'white', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer' }}>
              <FileSpreadsheet size={14}/> Reporte Semanal
            </button>
            <button onClick={() => setModal('individual')}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'#0A66C2', color:'white', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer' }}>
              <FileSpreadsheet size={14}/> Ticket individual
            </button>
            <button onClick={() => setModal('masivo')}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'#1A3C5E', color:'white', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer' }}>
              <Images size={14}/> Carga masiva
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap', alignItems:'center' }}>
          {/* Rango fecha */}
          <input type="date" value={fechaIni} onChange={e => setFechaIni(e.target.value)}
            title="Fecha desde"
            style={{ padding:'7px 10px', border:'1.5px solid #D1D5DB', borderRadius:7, fontSize:12, outline:'none', color: fechaIni ? '#1A3C5E':'#9CA3AF' }} />
          <span style={{ fontSize:11, color:'#9CA3AF' }}>—</span>
          <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
            title="Fecha hasta"
            style={{ padding:'7px 10px', border:'1.5px solid #D1D5DB', borderRadius:7, fontSize:12, outline:'none', color: fechaFin ? '#1A3C5E':'#9CA3AF' }} />
          {(fechaIni || fechaFin) && (
            <button onClick={() => { setFechaIni(''); setFechaFin('') }}
              style={{ padding:'5px 9px', background:'#FEE2E2', color:'#DC2626', border:'none', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer' }}>✕ Limpiar</button>
          )}

          {/* Proveedor */}
          <select value={proveedorFil} onChange={e => setProveedorFil(e.target.value)}
            style={{ padding:'7px 10px', border:'1.5px solid #D1D5DB', borderRadius:7, fontSize:12, outline:'none', maxWidth:200, color: proveedorFil?'#1A3C5E':'#9CA3AF' }}>
            <option value="">Todos los proveedores</option>
            {proveedores.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          {/* Búsqueda texto + artículos */}
          <div style={{ position:'relative' }}>
            <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar proveedor, folio, artículo…"
              style={{ paddingLeft:28, padding:'7px 10px 7px 28px', border:'1.5px solid #E5E7EB', borderRadius:7, fontSize:12, width:220, outline:'none', boxSizing:'border-box' }} />
          </div>
          {search && artIds !== null && (
            <span style={{ fontSize:11, color:'#0A66C2', fontWeight:700 }}>
              {artIds.length} gasto(s) con ese artículo
            </span>
          )}

          <div style={{ marginLeft:'auto', fontSize:13, fontWeight:800, color:'#15803D', fontFamily:'monospace' }}>
            TOTAL: {fmt(totalFiltrado)} · {filtrados.length} registros
          </div>
        </div>
      </div>

      {/* Tabla agrupada por día */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:'#9CA3AF', fontSize:14 }}>Cargando…</div>
        ) : filtrados.length === 0 ? (
          <div style={{ textAlign:'center', padding:60, color:'#9CA3AF' }}>
            <UtensilsCrossed size={40} style={{ margin:'0 auto 12px', opacity:0.3 }} />
            <div style={{ fontSize:14, fontWeight:600 }}>Sin gastos en el período seleccionado</div>
            <div style={{ fontSize:12, marginTop:4 }}>Usa "Ticket individual" o "Carga masiva" para agregar gastos</div>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead style={{ position:'sticky', top:0, zIndex:10 }}>
              <tr style={{ background:'#F9FAFB', borderBottom:'2px solid #E5E7EB' }}>
                {['Fecha','Proveedor','Factura / Folio','Concepto / Grupo','Total','TOTAL DÍA','Ticket',''].map((h,i) => (
                  <th key={h+i} style={{ padding:'9px 10px', textAlign:i>=4?'right':i===6?'center':'left', fontSize:10, fontWeight:700, color:'#6B7280', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fechasOrdenadas.map(fecha => {
                const items = porFecha[fecha]
                const dayTotal = items.reduce((s,g) => s+(parseFloat(g.total)||0), 0)
                return items.map((g, idx) => (
                  <>
                    <tr key={g.id} onClick={() => abrirDetalle(detalle?.gasto?.id===g.id ? null : g)}
                      style={{ borderBottom:'1px solid #F3F4F6', background: detalle?.gasto?.id===g.id ? '#F0FDF4' : idx%2===0 ? 'white' : '#FAFAFA', cursor:'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F0FDF4'}
                      onMouseLeave={e => e.currentTarget.style.background=detalle?.gasto?.id===g.id?'#F0FDF4':idx%2===0?'white':'#FAFAFA'}>
                      {/* Fecha — solo en la primera fila del día */}
                      <td style={{ padding:'7px 10px', color:'#374151', fontWeight: idx===0?700:400, fontSize:idx===0?12:11, whiteSpace:'nowrap', borderLeft: idx===0?'3px solid #15803D':'3px solid transparent' }}>
                        {idx===0 ? labelFecha(fecha) : ''}
                      </td>
                      <td style={{ padding:'7px 10px', fontWeight:600, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.proveedor||'—'}</td>
                      <td style={{ padding:'7px 10px', color:'#6B7280', fontFamily:'monospace', fontSize:11, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.folio||'—'}</td>
                      <td style={{ padding:'7px 10px', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {g.grupo_gasto && <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:8, background:(GRUPO_COLOR[g.grupo_gasto]||'#6B7280')+'18', color:GRUPO_COLOR[g.grupo_gasto]||'#6B7280' }}>{g.grupo_gasto}</span>}
                        {g.descripcion && <span style={{ fontSize:11, color:'#6B7280', marginLeft:4 }}>{g.descripcion}</span>}
                      </td>
                      <td style={{ padding:'7px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#0A66C2' }}>{fmt(g.total)}</td>
                      {/* Total del día — solo en la última fila del día */}
                      <td style={{ padding:'7px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:900, fontSize:13, color: idx===items.length-1?'#15803D':'transparent', background: idx===items.length-1?'#F0FDF4':'transparent', borderRight: idx===items.length-1?'3px solid #15803D':'none', whiteSpace:'nowrap' }}>
                        {idx===items.length-1 ? fmt(dayTotal) : ''}
                      </td>
                      <td style={{ padding:'7px 10px', textAlign:'center' }} onClick={e => e.stopPropagation()}>
                        {g.ticket_url
                          ? <button onClick={() => setLightbox(g.ticket_url)}
                              title="Ver ticket"
                              style={{ background:'#0A66C2', border:'none', borderRadius:6, padding:'5px 10px', cursor:'pointer', color:'white', fontSize:12, fontWeight:700, display:'inline-flex', alignItems:'center', gap:4 }}>
                              🖼️ <span style={{ fontSize:10 }}>Ver</span>
                            </button>
                          : (() => {
                              const inputId = `tk-${g.id}`
                              return (
                                <>
                                  <label htmlFor={inputId}
                                    title="Adjuntar imagen del ticket"
                                    style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'4px 8px', background:'#F3F4F6', border:'1.5px dashed #D1D5DB', borderRadius:6, cursor: subiendoTicket===g.id ? 'default':'pointer', fontSize:10, color: subiendoTicket===g.id ? '#9CA3AF':'#6B7280', fontWeight:600 }}>
                                    {subiendoTicket===g.id ? '⏳' : '📎'} {subiendoTicket===g.id ? '…' : 'Foto'}
                                  </label>
                                  <input id={inputId} type="file" accept="image/*,application/pdf" capture="environment"
                                    style={{ display:'none' }} disabled={subiendoTicket===g.id}
                                    onChange={e => { const f=e.target.files?.[0]; if(f) subirTicketRetro(g.id,f); e.target.value='' }} />
                                </>
                              )
                            })()
                        }
                      </td>
                      <td style={{ padding:'7px 6px', textAlign:'right' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => eliminar(g)} style={{ background:'#FEF2F2', border:'none', borderRadius:5, padding:'4px 6px', cursor:'pointer', color:'#B24020' }}><Trash2 size={12}/></button>
                      </td>
                    </tr>
                    {/* Detalle expandido */}
                    {detalle?.gasto?.id === g.id && (
                      <tr key={`det-${g.id}`}>
                        <td colSpan={8} style={{ padding:'12px 16px', background:'#F0FDF4', borderBottom:'2px solid #86EFAC' }}>
                          <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:11, fontWeight:800, color:'#15803D', marginBottom:8 }}>DETALLE DEL GASTO</div>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'4px 16px', fontSize:11, marginBottom:10 }}>
                                <div><span style={{ color:'#9CA3AF' }}>Proveedor: </span><strong>{g.proveedor||'—'}</strong></div>
                                <div><span style={{ color:'#9CA3AF' }}>RFC: </span><span style={{ fontFamily:'monospace' }}>{g.rfc||'—'}</span></div>
                                <div><span style={{ color:'#9CA3AF' }}>Razón social: </span>{g.razon_social||'—'}</div>
                                <div><span style={{ color:'#9CA3AF' }}>Subtotal: </span><span style={{ fontFamily:'monospace' }}>{g.subtotal!=null?fmt(g.subtotal):'—'}</span></div>
                                <div><span style={{ color:'#9CA3AF' }}>IVA: </span><span style={{ fontFamily:'monospace' }}>{g.iva!=null?fmt(g.iva):'—'}</span></div>
                                <div><span style={{ color:'#9CA3AF' }}>Total: </span><strong style={{ fontFamily:'monospace', color:'#15803D' }}>{fmt(g.total)}</strong></div>
                              </div>
                              {detalle.lineas.length > 0 && (
                                <div style={{ overflowX:'auto' }}>
                                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                                    <thead>
                                      <tr style={{ background:'#DCFCE7' }}>
                                        {['SKU','Descripción','Cant.','P/U','Subtotal','Imp.'].map((h,hx) => (
                                          <th key={h} style={{ padding:'5px 8px', textAlign:hx>1?'right':'left', fontSize:10, fontWeight:700, color:'#15803D' }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {detalle.lineas.map((l,li) => (
                                        <tr key={li} style={{ borderTop:'1px solid #BBF7D0', background:li%2===0?'white':'#F0FDF4' }}>
                                          <td style={{ padding:'4px 8px', fontFamily:'monospace', fontSize:10, color:'#9CA3AF' }}>{l.sku||'—'}</td>
                                          <td style={{ padding:'4px 8px', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.descripcion}</td>
                                          <td style={{ padding:'4px 8px', textAlign:'right' }}>{l.cantidad}</td>
                                          <td style={{ padding:'4px 8px', textAlign:'right', fontFamily:'monospace' }}>{fmt2(l.precio_unit)}</td>
                                          <td style={{ padding:'4px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:700 }}>{fmt2(l.subtotal_linea)}</td>
                                          <td style={{ padding:'4px 8px', textAlign:'right' }}>
                                            {l.tasa_impuesto?<span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:3, background:'#DBEAFE', color:'#1D4ED8' }}>{l.tasa_impuesto}</span>:'—'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {detalle.lineas.length===0 && <div style={{ fontSize:11, color:'#9CA3AF', fontStyle:'italic' }}>Sin detalle de artículos</div>}
                            </div>
                            {g.ticket_url && (
                              <div style={{ flexShrink:0, width:150, background:'white', border:'1.5px solid #BBF7D0', borderRadius:10, padding:8 }}>
                                <div style={{ fontSize:10, fontWeight:700, color:'#15803D', marginBottom:4 }}>🖼️ Ticket</div>
                                {(g.ticket_url.toLowerCase().includes('.pdf'))
                                  ? <div onClick={() => abrirLightbox(g.ticket_url)} style={{ cursor:'pointer', textAlign:'center', padding:'16px 0', fontSize:32 }}>📄<div style={{ fontSize:10, color:'#6B7280', marginTop:4 }}>Documento PDF</div></div>
                                  : <ImagenPrivada bucket="tickets-gastos" valor={g.ticket_url} alt="ticket" style={{ width:'100%', maxHeight:200, objectFit:'contain', cursor:'pointer', borderRadius:6 }} onClick={url => setLightbox(url)} />
                                }
                                <button onClick={() => abrirLightbox(g.ticket_url)} style={{ width:'100%', marginTop:4, padding:'3px 0', background:'#EFF6FF', border:'none', borderRadius:4, fontSize:10, color:'#0A66C2', cursor:'pointer', fontWeight:700 }}>🔍 Ampliar</button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'#1A3C5E' }}>
                <td colSpan={4} style={{ padding:'10px 12px', color:'white', fontWeight:800, fontSize:12, textTransform:'uppercase' }}>
                  {semSel.ini === 'TODOS' ? 'TOTAL GENERAL — Todos los registros' : `TOTAL SEMANA — ${semSel.label}`}
                </td>
                <td style={{ padding:'10px', textAlign:'right', color:'#E8A020', fontWeight:900, fontSize:15, fontFamily:'monospace' }}>{fmt(totalFiltrado)}</td>
                <td style={{ padding:'10px', textAlign:'right', color:'#E8A020', fontWeight:900, fontSize:15, fontFamily:'monospace' }}>{fmt(totalFiltrado)}</td>
                <td colSpan={2}/>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Modales */}
      {modal === 'individual' && (
        <ModalTicketIndividual onClose={() => setModal(null)} onSaved={() => { setModal(null); cargar() }} />
      )}
      {modal === 'masivo' && (
        <ModalCargaMasiva onClose={() => setModal(null)} onSaved={() => { setModal(null); cargar() }} />
      )}

      {/* Lightbox — visualización inline, sin descarga */}
      {lightbox && (() => {
        const esPDF = lightbox.toLowerCase().includes('.pdf') || lightbox.includes('application/pdf')
        return (
          <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,0.95)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}
            onClick={e => { if (e.target === e.currentTarget) setLightbox(null) }}>
            {esPDF ? (
              <iframe src={lightbox} title="Ticket PDF"
                style={{ width:'92vw', height:'92vh', border:'none', borderRadius:10, background:'white' }} />
            ) : (
              <img src={lightbox} alt="ticket"
                style={{ maxWidth:'94vw', maxHeight:'94vh', objectFit:'contain', borderRadius:10, boxShadow:'0 12px 60px rgba(0,0,0,0.7)', display:'block' }} />
            )}
            <button onClick={() => setLightbox(null)}
              style={{ position:'absolute', top:14, right:14, background:'rgba(255,255,255,0.18)', border:'none', borderRadius:'50%', width:40, height:40, cursor:'pointer', color:'white', fontSize:20, fontWeight:700, lineHeight:'40px' }}>
              ✕
            </button>
          </div>
        )
      })()}
    </div>
  )
}
