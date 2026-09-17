import { useState } from 'react'
import { Building2, Menu, X, Bell, LogOut, User } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { signOut } from '../../lib/auth'

export default function Header() {
  const { user, sidebarOpen, setSidebarOpen } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleSignOut = async () => { await signOut(); setMenuOpen(false) }

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
      height: 'var(--header-height)',
      background: 'var(--header-bg)',
      color: 'var(--header-text)',
      display: 'flex', alignItems: 'center', padding: '0 1rem',
      boxShadow: 'var(--shadow-md)',
    }}>
      {/* Franja decorativa superior */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
        background: 'linear-gradient(90deg, #E8A020 0%, #0A66C2 50%, #1A3C5E 100%)'
      }} />

      <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
        background: 'none', border: 'none', color: 'white', cursor: 'pointer',
        padding: '8px', borderRadius: '6px', marginRight: '12px',
        display: 'flex', alignItems: 'center',
      }}>
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Logo + Nombre */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
        <div style={{
          background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '6px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Building2 size={22} color="white" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '-0.3px' }}>Petra</span>
            <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: 'rgba(232,160,32,0.25)', color: '#E8A020', letterSpacing: '0.02em' }}>
              {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v0.03'}
            </span>
            {import.meta.env.VITE_AMBIENTE === 'QA' && (
              <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 7px', borderRadius: '4px', background: '#7C3AED', color: 'white', letterSpacing: '0.05em' }}>QA</span>
            )}
          </div>
          <div style={{ fontSize: '10px', opacity: 0.8, lineHeight: 1 }}>Inmueble Resource Planning</div>
        </div>
      </div>

      {/* Acciones derecha */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button style={{
          background: 'none', border: 'none', color: 'white', cursor: 'pointer',
          padding: '8px', borderRadius: '6px', display: 'flex', alignItems: 'center',
        }}>
          <Bell size={18} />
        </button>

        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(!menuOpen)} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white',
            cursor: 'pointer', padding: '6px 12px', borderRadius: '6px',
            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px',
          }}>
            <User size={16} />
            <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email?.split('@')[0] ?? 'Usuario'}
            </span>
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '110%', background: 'white',
              borderRadius: '6px', boxShadow: 'var(--shadow-md)', minWidth: '160px',
              overflow: 'hidden', zIndex: 100,
            }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-neutral)', fontSize: '12px', color: 'var(--color-text-light)' }}>
                {user?.email}
              </div>
              <button onClick={handleSignOut} style={{
                width: '100%', padding: '10px 14px', background: 'none', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                fontSize: '14px', color: 'var(--color-danger)', textAlign: 'left',
              }}>
                <LogOut size={14} /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
