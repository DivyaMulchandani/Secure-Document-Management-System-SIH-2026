import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';

import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Cases } from './pages/Cases';
import { CaseDetail } from './pages/CaseDetail';
import { Evidence } from './pages/Evidence';
import { Forensics } from './pages/Forensics';
import { Court } from './pages/Court';
import { Organizations } from './pages/Organizations';
import { Users } from './pages/Users';
import { Delegations } from './pages/Delegations';
import { Search } from './pages/Search';
import { Audit } from './pages/Audit';
import { Tickets } from './pages/Tickets';
import { AdminHierarchy } from './pages/AdminHierarchy';

const ProtectedRoute: React.FC<{ children: React.ReactNode; requiredPermission?: string }> = ({
  children,
  requiredPermission,
}) => {
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-muted-text font-mono text-xs">
        <div className="space-y-2 text-center">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <div>Authenticating Justice Credentials...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <Layout>
        <div className="p-12 max-w-md mx-auto text-center glass-card border border-danger/30">
          <div className="text-danger font-bold text-base mb-2 font-mono">Access Denied (403 Forbidden)</div>
          <p className="text-xs text-muted-text">
            Your assigned role ({user.roleName}) lacks the required operational permission:{' '}
            <span className="font-mono text-accent">{requiredPermission}</span>.
          </p>
        </div>
      </Layout>
    );
  }

  return <Layout>{children}</Layout>;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication */}
          <Route path="/login" element={<Login />} />

          {/* Protected Justice Workspaces */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cases"
            element={
              <ProtectedRoute requiredPermission="CASE_READ">
                <Cases />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cases/:id"
            element={
              <ProtectedRoute requiredPermission="CASE_READ">
                <CaseDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/evidence"
            element={
              <ProtectedRoute requiredPermission="EVIDENCE_READ">
                <Evidence />
              </ProtectedRoute>
            }
          />
          <Route
            path="/forensics"
            element={
              <ProtectedRoute>
                <Forensics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/court"
            element={
              <ProtectedRoute>
                <Court />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations"
            element={
              <ProtectedRoute>
                <Organizations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin-hierarchy"
            element={
              <ProtectedRoute>
                <AdminHierarchy />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute>
                <Users />
              </ProtectedRoute>
            }
          />
          <Route
            path="/delegations"
            element={
              <ProtectedRoute>
                <Delegations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/search"
            element={
              <ProtectedRoute>
                <Search />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <ProtectedRoute requiredPermission="AUDIT_READ">
                <Audit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tickets"
            element={
              <ProtectedRoute>
                <Tickets />
              </ProtectedRoute>
            }
          />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;

