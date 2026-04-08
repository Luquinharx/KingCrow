
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './components/Dashboard';
import Login from './components/pages/Login';
import DashboardUser from './components/pages/DashboardUser';
import Estatisticas from './components/pages/Estatisticas';
import EstatisticasTS from './components/pages/EstatisticasTS';
import Cassino from './components/pages/Cassino';
import Perfil from './components/pages/Perfil';
import GerenciarUsuarios from './components/pages/GerenciarUsuarios';
import Home from './components/pages/Home';
import Navbar from './components/Navbar';

// Layout agora só fornece o Navbar, o background/altura é controlado por cada página para total liberdade
const PublicLayout = ({ children }: { children: React.ReactNode }) => (
  <>
    <Navbar />
    {children}
  </>
);

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/estatisticas" element={<PublicLayout><Estatisticas /></PublicLayout>} />
          <Route path="/dashboard-ts" element={<PublicLayout><EstatisticasTS /></PublicLayout>} />
          <Route path="/dashboard-loot" element={<PublicLayout><Dashboard /></PublicLayout>} />
          <Route path="/dashboard" element={<PublicLayout><DashboardUser /></PublicLayout>} />
          <Route path="/login" element={<Login />} />

          {/* Protected Routes */}
            <Route path="/cassino" element={<ProtectedRoute><PublicLayout><Cassino /></PublicLayout></ProtectedRoute>} />
            <Route path="/power-roleta" element={<Navigate to="/cassino" replace />} />
            <Route path="/roleta" element={<Navigate to="/cassino" replace />} />
          <Route path="/perfil" element={<ProtectedRoute><PublicLayout><Perfil /></PublicLayout></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><PublicLayout><GerenciarUsuarios /></PublicLayout></ProtectedRoute>} />
          
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}


export default App;
