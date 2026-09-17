import { useState } from 'react'
import { Search, BarChart3, Lightbulb } from 'lucide-react'
import { chatAnalitico } from '../../lib/claude'

export default function AgenteAnalitico({ dataSummary = {} }) {
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState(null)
  const [loading, setLoading] = useState(false)

  const ask = async (e) => {
    e.preventDefault()
    if (!query.trim() || loading) return
    setLoading(true)
    try {
      const { content } = await chatAnalitico([{ role: 'user', content: query }], dataSummary)
      setResponse(content)
    } catch {
      setResponse('Error al consultar el Agente Analitico. Por favor intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const suggestions = ['Ocupacion actual?', 'Contratos por vencer este mes?', 'Cartera vencida total?']

  return (
    <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--shadow-sm)', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <BarChart3 size={20} color="var(--color-primary)" />
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>Agente Analitico Petra</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-light)' }}>Data Warehouse - Metricas - Tendencias</div>
        </div>
      </div>

      <form onSubmit={ask} style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Pregunta sobre metricas, tendencias o KPIs..."
            style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1px solid var(--color-neutral)', borderRadius: 'var(--border-radius)', fontSize: '13px', outline: 'none', fontFamily: 'var(--font-primary)', boxSizing: 'border-box' }}
          />
        </div>
        <button type="submit" disabled={loading || !query.trim()} style={{
          padding: '10px 18px', background: 'var(--color-primary)', color: 'white', border: 'none',
          borderRadius: 'var(--border-radius)', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
          opacity: (!query.trim() || loading) ? 0.5 : 1,
        }}>
          {loading ? 'Analizando...' : 'Analizar'}
        </button>
      </form>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: response ? '16px' : 0 }}>
        {suggestions.map(s => (
          <button key={s} onClick={() => setQuery(s)} style={{
            padding: '4px 12px', background: 'var(--color-primary-light)', color: 'var(--color-primary)',
            border: '1px solid var(--color-primary)', borderRadius: '20px', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-primary)',
          }}>{s}</button>
        ))}
      </div>

      {response && (
        <div style={{ background: 'var(--color-primary-light)', borderRadius: 'var(--border-radius)', padding: '16px', borderLeft: '4px solid var(--color-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <Lightbulb size={16} color="var(--color-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>{response}</div>
          </div>
        </div>
      )}
    </div>
  )
}
