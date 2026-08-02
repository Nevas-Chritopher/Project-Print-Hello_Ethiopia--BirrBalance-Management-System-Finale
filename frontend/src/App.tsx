import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { normalizeRole, useApp } from './context/AppContext';
import { Sidebar, TopNav } from './components/layout/HeaderSidebar';
import Login from './pages/auth/Login';
import ManagerPortal from './pages/manager/ManagerPortal';
import CafePortal from './pages/cafe/CafePortal';
import EmployeePortal from './pages/employee/EmployeePortal';
import WaiterPanel from './pages/waiter/WaiterPanel';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, AlertTriangle, Menu, LogOut } from 'lucide-react';

// Wrapper for Protected Routes with Role Checks.
// Reads auth from context (not localStorage) so it re-renders on login,
// logout, and session expiry instead of showing stale pages.
const ProtectedRoute = ({ children, allowedRole }: { children: React.ReactNode; allowedRole?: string }) => {
  const { token, user } = useApp();
  const role = normalizeRole(user?.role ?? localStorage.getItem("role"));
  const normalizedAllowedRole = normalizeRole(allowedRole);

  if (!token) return <Navigate to="/login" replace />;
  if (normalizedAllowedRole && role !== normalizedAllowedRole) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// Global Main Layout Wrapper
function Layout() {
  const { user } = useApp();
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);

  return (
    <div className="flex h-screen bg-page overflow-hidden transition-colors duration-200">
      {/* Sidenav (Desktop & Mobile) */}
      {user?.role !== 'waiter' && (
        <Sidebar
          mobileOpen={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Mobile Floating Menu Button for Employee, Manager, and Cafe */}
        {user && (user.role === 'employee' || user.role === 'manager' || user.role === 'cafe') && (
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden fixed top-4 left-4 z-30 p-2.5 rounded-xl bg-card text-text-primary shadow-md border border-border-default hover:bg-card-hover transition-all focus:outline-none min-h-[44px] min-w-[44px]"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Top Header navbar (Hidden for employees, managers, and cafe) */}
        {user?.role !== 'employee' && user?.role !== 'manager' && user?.role !== 'cafe' && (
          <TopNav onMenuClick={() => setMobileSidebarOpen(true)} />
        )}

        {/* Dynamic page container */}
        <main className={`flex-1 overflow-y-auto bg-page no-scrollbar focus:outline-none ${(user?.role === 'employee' || user?.role === 'manager' || user?.role === 'cafe') ? 'pt-16 md:pt-0' : ''}`}>
          <Routes>
            <Route path="/manager/*" element={<ProtectedRoute allowedRole="manager"><ManagerPortal /></ProtectedRoute>} />
            <Route path="/cafe/*" element={<ProtectedRoute allowedRole="cafe"><CafePortal /></ProtectedRoute>} />
            <Route path="/employee/*" element={<ProtectedRoute allowedRole="employee"><EmployeePortal /></ProtectedRoute>} />
            <Route path="/waiter" element={<ProtectedRoute allowedRole="waiter"><WaiterPanel /></ProtectedRoute>} />
            <Route path="/waiter/panel" element={<ProtectedRoute allowedRole="waiter"><WaiterPanel /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

// 404 Catch-All Page Component
function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useApp();

  const goHome = () => {
    if (!user) {
      navigate('/login');
      return;
    }
    const path = 
      user.role === 'manager' ? '/manager/dashboard' :
      user.role === 'cafe' ? '/cafe/dashboard' :
      user.role === 'employee' ? '/employee/dashboard' :
      '/waiter/panel';
    navigate(path);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center text-xs space-y-4 font-sans animate-fadeIn">
      <div className="w-16 h-16 rounded-full bg-red-50 text-danger flex items-center justify-center shadow-md">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <div>
        <h2 className="text-lg font-black text-primary tracking-tight">404 - Page Not Found</h2>
        <p className="text-subtle-text mt-1 max-w-xs">The screen or directory path you are looking for does not exist or has been relocated.</p>
      </div>
      <button
        onClick={goHome}
        className="px-5 py-3 bg-primary hover:bg-secondary text-white font-bold rounded-xl shadow transition-all min-h-[44px]"
      >
        Return to Portal Dashboard
      </button>
    </div>
  );
}

export default function App() {
  const { token, user } = useApp();
  const role = normalizeRole(user?.role ?? localStorage.getItem("role"));

  return (
    <>
      <Routes>
        {/* Root redirector */}
        <Route
          path="/"
          element={
            token && role ? (
              <Navigate
                to={
                  role === 'manager' ? '/manager/dashboard' :
                  role === 'cafe' ? '/cafe/dashboard' :
                  role === 'employee' ? '/employee/dashboard' :
                  role === 'waiter' ? '/waiter/panel' : '/login'
                }
                replace
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Login Screen */}
        <Route path="/login" element={<Login />} />

        {/* Authorized Layout Wrap */}
        <Route path="/*" element={<Layout />} />
      </Routes>
      <LogoutModal />
    </>
  );
}

function LogoutModal() {
  const { showLogoutModal, setShowLogoutModal, logout } = useApp();
  const navigate = useNavigate();

  if (!showLogoutModal) return null;

  const handleConfirm = () => {
    logout();
    setShowLogoutModal(false);
    navigate('/login?loggedOut=true');
  };

  const handleCancel = () => {
    setShowLogoutModal(false);
  };

  return (
    <div className="logout-overlay z-[9999]" onClick={handleCancel}>
      <div 
        className="logout-card w-full max-w-sm p-6 text-center space-y-4 animate-scaleIn m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Red circular logout icon */}
        <div className="mx-auto w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/30 text-red-600 flex items-center justify-center shadow-sm">
          <LogOut className="w-5 h-5 stroke-[2.5]" />
        </div>

        {/* Title & Subtitle */}
        <div className="space-y-1.5">
          <h3 className="text-base font-black text-text-primary tracking-tight">
            Log Out?
          </h3>
          <p className="text-xs text-text-subtle leading-relaxed">
            Are you sure you want to log out of your session? Any unsaved changes will be lost.
          </p>
        </div>

        {/* Side-by-side buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            id="logout-cancel-btn"
            onClick={handleCancel}
            className="py-3 bg-transparent hover:bg-card-hover text-text-secondary text-xs font-bold rounded-xl border border-border-default transition-all min-h-[44px] cursor-pointer"
          >
            Cancel
          </button>
          <button
            id="logout-confirm-btn"
            onClick={handleConfirm}
            className="py-3 bg-danger hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow transition-all min-h-[44px] cursor-pointer"
          >
            Yes, Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
