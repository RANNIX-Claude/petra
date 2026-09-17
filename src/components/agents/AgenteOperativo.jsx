import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Bot } from 'lucide-react'
import { chatOperativo } from '../../lib/claude'

export default function AgenteOperativo() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '¡Hola! Soy el Agente Operativo de Petra. ¿En qué puedo ayudarte con la administración de tus inmuebles?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setLoading(true)
    try {
      const reply = await chatOperativo(next.slice(1))
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch (e) {
      console.error('[AgenteOperativo]', e)
      setMessages([...next, { role: 'assistant', content: 'Error al conectar. Verifica la configuración de la función.' }])
    }
    setLoading(false)
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 200,
          width: '56px', height: '56px', borderRadius: '50%',
          background: 'var(--color-primary)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(10,102,194,0.4)',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(10,102,194,0.5)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(10,102,194,0.4)' }}
      >
        {open ? <X size={22} color="white" /> : <MessageCircle size={22} color="white" />}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: '92px', right: '24px', zIndex: 199,
          width: '380px', height: '520px', background: 'white',
          borderRadius: '14px', boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          border: '1px solid #E5E7EB',
        }}>
          {/* Header */}
          <div style={{ background: 'var(--color-primary)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Bot size={20} color="white" />
            <div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: '14px' }}>Agente Operativo</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>Petra — RANNIX Consulting</div>
            </div>
          </div>

          {/* Mensajes */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%', padding: '10px 14px', borderRadius: '12px',
                  fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap',
                  background: m.role === 'user' ? 'var(--color-primary)' : '#F3F4F6',
                  color: m.role === 'user' ? 'white' : 'var(--color-text)',
                  borderBottomRightRadius: m.role === 'user' ? '4px' : '12px',
                  borderBottomLeftRadius: m.role === 'assistant' ? '4px' : '12px',
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', gap: '4px', padding: '10px 14px', background: '#F3F4F6', borderRadius: '12px', width: 'fit-content' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-text-light)',
                    animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s`,
                  }} />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: '8px' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Escribe tu consulta..."
              style={{
                flex: 1, padding: '9px 12px', border: '1.5px solid #E5E7EB',
                borderRadius: '8px', fontSize: '13px', outline: 'none',
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              style={{
                padding: '9px 14px', background: input.trim() && !loading ? 'var(--color-primary)' : '#E5E7EB',
                border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.15s',
              }}
            >
              <Send size={15} color={input.trim() && !loading ? 'white' : '#9CA3AF'} />
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }`}</style>
    </>
  )
}
