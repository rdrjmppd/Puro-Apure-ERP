import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { BrandProvider } from './context/BrandContext';
import { BrandLogoModal } from './components/BrandLogoModal';
import { AuthGuard } from './components/AuthGuard';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';

export function AppContent() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.pathname) {
      return window.location.pathname;
    }
    return '/';
  });

  useEffect(() => {
    const handleLocationChange = () => {
      if (typeof window !== 'undefined') {
        setCurrentPath(window.location.pathname);
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const navigateTo = useCallback((path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, []);

  if (currentPath === '/login') {
    return <Login onNavigateToDashboard={() => navigateTo('/')} />;
  }

  // Any other route is protected by AuthGuard
  return (
    <AuthGuard redirectToLogin={() => navigateTo('/login')}>
      <Dashboard />
    </AuthGuard>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrandProvider>
        <AuthProvider>
          <AppContent />
          <BrandLogoModal />
        </AuthProvider>
      </BrandProvider>
    </ThemeProvider>
  );
}
