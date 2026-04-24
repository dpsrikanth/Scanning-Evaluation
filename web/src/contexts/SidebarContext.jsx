import { createContext, useContext, useState, useEffect } from 'react';

const SidebarContext = createContext(null);
const STORAGE_KEY = 'scaneval_sidebar_collapsed';

export function SidebarProvider({ children }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === '1') return true;
      if (stored === '0') return false;
      /* No stored preference: hide drawer on small screens, show on wide */
      return window.matchMedia('(max-width: 768px)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* */
    }
  }, [collapsed]);

  const toggle = () => setCollapsed((c) => !c);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    return { collapsed: false, setCollapsed: () => {}, toggle: () => {} };
  }
  return ctx;
}
