// =============================================================================
// BeKord Frontend — Application Entry Point
// =============================================================================
// UPDATED: 2025-12-19
// CHANGES: Added React Router setup for proper navigation
//          - /login  -> LoginCard (authentication)
//          - /register -> RegisterCard (new account)
//          - /chat   -> ChatPage (main chat interface)
//          - /dm     -> DmPage (direct messages)
//          - /       -> Redirects to /login or /chat based on auth state
// =============================================================================

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';

// -----------------------------------------------------------------------------
// Page Components
// -----------------------------------------------------------------------------
import LoginCard from './components/LoginCard';
import RegisterCard from './components/RegisterCard';
import VerifyCard from './components/VerifyCard';
import ChatPage from './components/ChatPage';
import DmPage from './components/DmPage';

// -----------------------------------------------------------------------------
// Auth Check Helper
// Returns true if user has a valid access token stored
// -----------------------------------------------------------------------------
function isAuthenticated() {
  const token = localStorage.getItem('accessToken');
  return !!token;
}

// -----------------------------------------------------------------------------
// Protected Route Wrapper
// Redirects to /login if not authenticated
// -----------------------------------------------------------------------------
function ProtectedRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

// -----------------------------------------------------------------------------
// Public Route Wrapper  
// Redirects to /chat if already authenticated
// -----------------------------------------------------------------------------
function PublicRoute({ children }) {
  if (isAuthenticated()) {
    return <Navigate to="/chat" replace />;
  }
  return children;
}

// -----------------------------------------------------------------------------
// App Router Configuration
// -----------------------------------------------------------------------------
function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes - redirect to /chat if already logged in */}
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <LoginCard />
            </PublicRoute>
          } 
        />
        <Route 
          path="/register" 
          element={
            <PublicRoute>
              <RegisterCard />
            </PublicRoute>
          } 
        />
        <Route path="/verify" element={<VerifyCard />} />

        {/* Protected routes - require authentication */}
        <Route 
          path="/chat" 
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/dm" 
          element={
            <ProtectedRoute>
              <DmPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/dm/:recipientId" 
          element={
            <ProtectedRoute>
              <DmPage />
            </ProtectedRoute>
          } 
        />

        {/* Root redirect - go to /chat if logged in, /login if not */}
        <Route 
          path="/" 
          element={
            isAuthenticated() ? <Navigate to="/chat" replace /> : <Navigate to="/login" replace />
          } 
        />

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

// -----------------------------------------------------------------------------
// Render Application
// -----------------------------------------------------------------------------
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>
);
