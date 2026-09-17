import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AppProvider, useApp } from './context/AppContext'
import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import Footer from './components/layout/Footer'
import AgenteOperativo from './components/agents/AgenteOperativo.jsx'
import LoadingSpinner from './components/ui/LoadingSpinner'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inmuebles from './pages/Inmuebles.jsx'
import Contratos from './pages/Contratos.jsx'
import Renovaciones from './pages/Renovaciones.jsx'
import Cobranza from './pages/Cobranza.jsx'
import Arrendatarios from './pages/Arrendatarios.jsx'
import Mantenimiento from './pages/Mantenimiento.jsx'
import Proyectos from './pages/Proyectos.jsx'
import Proveedores from './pages/Proveedores.jsx'
import Productos from './pages/Productos.jsx'
import RH from './pages/RH.jsx'
import ExpedienteEmpleado from './pages/ExpedienteEmpleado.jsx'
import ExpedienteContrato from './pages/ExpedienteContrato.jsx'
import Estacionamiento from './pages/Estacionamiento.jsx'
import Prospectos from './pages/Prospectos.jsx'
import Reportes from './pages/Reportes.jsx'
import Configuracion from './pages/Configuracion.jsx'
import GastosOperativos from './pages/GastosOperativos.jsx'
import Conciliacion from './pages/Conciliacion.jsx'
import Agua from './pages/Agua.jsx'
import Vending from './pages/Vending.jsx'
import EDR from './pages/EDR.jsx'
import ResumenSemanal from './pages/ResumenSemanal.jsx'
import Bitacora from './pages/Bitacora.jsx'
import Utilidades from './pages/Utilidades.jsx'
import Validacion from './pages/Validacion.jsx'
import Calculos from './pages/Calculos.jsx'
import PortalProspecto from './pages/PortalProspecto.jsx'
import MapaLocales from './pages/MapaLocales.jsx'
import Ingresos from './pages/Ingresos.jsx'
import Despachos from './pages/Despachos.jsx'
import RestauranteGastos from './pages/RestauranteGastos.jsx'
import './styles/theme.css'

// Roles externos sin aplicación propia. El inquilino usa el rol `locatario` (uno por
// contrato, ve su expediente en /contratos/:id); el portal de arrendatario se retiró el
// 2026-09-13 (migración 20260913120000). `prospecto` entra por /portal/prospecto/:token.
const ROLES_SIN_APP = ['arrendatario', 'prospecto']

function SinAcceso({ rol }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-primary-dark)', padding: '24px' }}>
      <div style={{ background: 'white', borderRadius: '12px', padding: '32px', maxWidth: '440px', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: '18px' }}>Tu cuenta no tiene acceso a esta aplicación</h2>
        <p style={{ margin: 0, color: '#6B7280', fontSize: '14px' }}>
          El rol <strong>{rol}</strong> ya no tiene portal. Si eres inquilino de la plaza, pide a la
          administración que vincule tu cuenta a tu contrato.
        </p>
      </div>
    </div>
  )
}

function AppLayout() {
  const { user, perfil, loading, sidebarOpen } = useApp()
  const location = useLocation()

  // Rutas públicas — sin layout admin (portal de prospecto)
  if (location.pathname.startsWith('/portal/')) {
    return (
      <Routes>
        <Route path="/portal/prospecto/:token" element={<PortalProspecto />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-primary-dark)' }}>
      <div style={{ color: 'white', textAlign: 'center' }}>
        <LoadingSpinner label="Iniciando Petra..." />
      </div>
    </div>
  )

  if (!user) return <Login />

  // Rol externo sin aplicación → pantalla informativa, nunca el admin
  if (perfil && ROLES_SIN_APP.includes(perfil.rol_id)) {
    return <SinAcceso rol={perfil.rol_id} />
  }

  // Rol restaurante → solo puede ver su módulo
  if (perfil?.rol_id === 'restaurante') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-background)' }}>
        <Header />
        <Sidebar />
        <main style={{
          marginLeft: sidebarOpen ? '220px' : '60px',
          marginTop: 'var(--header-height)',
          minHeight: 'calc(100vh - var(--header-height) - 48px)',
          transition: 'margin-left 0.2s ease',
        }}>
          <Routes>
            <Route path="/restaurante/gastos" element={<RestauranteGastos />} />
            <Route path="*" element={<Navigate to="/restaurante/gastos" replace />} />
          </Routes>
        </main>
        <Toaster position="top-right" />
      </div>
    )
  }

  // Rol corporativo → solo Dashboard (EDR), Contratos, Resumen Semanal,
  // RH/Nómina y Reportes; el resto redirige al dashboard.
  if (perfil?.rol_id === 'corporativo') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-background)' }}>
        <Header />
        <Sidebar />
        <main style={{
          marginLeft: sidebarOpen ? '220px' : '60px',
          marginTop: 'var(--header-height)',
          minHeight: 'calc(100vh - var(--header-height) - 48px)',
          transition: 'margin-left 0.2s ease',
        }}>
          <Routes>
            <Route path="/edr" element={<EDR />} />
            <Route path="/contratos" element={<Contratos />} />
            <Route path="/contratos/:id" element={<ExpedienteContrato />} />
            <Route path="/resumen-semanal" element={<ResumenSemanal />} />
            <Route path="/rh" element={<RH />} />
            <Route path="/rh/empleado/:id" element={<ExpedienteEmpleado />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="*" element={<Navigate to="/edr" replace />} />
          </Routes>
        </main>
        <Toaster position="top-right" />
      </div>
    )
  }

  // Rol locatario → solo el expediente de SU propio contrato. Si su perfil no
  // trae contrato_id (falta vincularlo en irp_usuarios), no hay a dónde
  // mandarlo: se avisa en vez de redirigir a una ruta vacía.
  if (perfil?.rol_id === 'locatario') {
    if (!perfil.contrato_id) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-light)', fontSize: 14 }}>
            Tu cuenta todavía no está vinculada a ningún contrato.<br />Pide a un administrador que la vincule.
          </p>
        </div>
      )
    }
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-background)' }}>
        <Header />
        <Sidebar />
        <main style={{
          marginLeft: sidebarOpen ? '220px' : '60px',
          marginTop: 'var(--header-height)',
          minHeight: 'calc(100vh - var(--header-height) - 48px)',
          transition: 'margin-left 0.2s ease',
        }}>
          <Routes>
            <Route path="/contratos/:id" element={<ExpedienteContrato />} />
            <Route path="*" element={<Navigate to={`/contratos/${perfil.contrato_id}`} replace />} />
          </Routes>
        </main>
        <Toaster position="top-right" />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background)' }}>
      <Header />
      <Sidebar />
      <main style={{
        marginLeft: sidebarOpen ? '220px' : '60px',
        marginTop: 'var(--header-height)',
        minHeight: 'calc(100vh - var(--header-height) - 48px)',
        transition: 'margin-left 0.2s ease',
      }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inmuebles" element={<Inmuebles />} />
          <Route path="/contratos" element={<Contratos />} />
          <Route path="/contratos/:id" element={<ExpedienteContrato />} />
          <Route path="/renovaciones" element={<Renovaciones />} />
          <Route path="/cobranza" element={<Cobranza />} />
          <Route path="/arrendatarios" element={<Arrendatarios />} />
          <Route path="/mantenimiento" element={<Mantenimiento />} />
          <Route path="/proyectos" element={<Proyectos />} />
          <Route path="/proveedores" element={<Proveedores />} />
          <Route path="/productos" element={<Productos />} />
          <Route path="/rh" element={<RH />} />
          <Route path="/rh/empleado/:id" element={<ExpedienteEmpleado />} />
          <Route path="/estacionamiento" element={<Estacionamiento />} />
          <Route path="/prospectos" element={<Prospectos />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/gastos-operativos" element={<GastosOperativos />} />
          <Route path="/conciliacion" element={<Conciliacion />} />
          <Route path="/agua" element={<Agua />} />
          <Route path="/vending" element={<Vending />} />
          <Route path="/edr" element={<EDR />} />
          <Route path="/resumen-semanal" element={<ResumenSemanal />} />
          <Route path="/bitacora" element={<Bitacora />} />
          <Route path="/utilidades" element={<Utilidades />} />
          <Route path="/validacion" element={<Validacion />} />
          <Route path="/calculos" element={<Calculos />} />
          <Route path="/mapa-locales" element={<MapaLocales />} />
          <Route path="/ingresos" element={<Ingresos />} />
          <Route path="/despachos" element={<Despachos />} />
          <Route path="/restaurante/gastos" element={<RestauranteGastos />} />
          <Route path="/config" element={<Configuracion />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Footer />
      </main>
      <AgenteOperativo />
      <Toaster position="top-right" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppLayout />
      </AppProvider>
    </BrowserRouter>
  )
}
