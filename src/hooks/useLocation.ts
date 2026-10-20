import { useState, useEffect } from 'react';

/**
 * Hook para monitoreo en tiempo real de la ruta y contexto de pantalla en el cliente
 */
export function useLocation() {
  const [pathname, setPathname] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  useEffect(() => {
    const handleLocationChange = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  return { pathname };
}
