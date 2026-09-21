import { useState, useEffect } from 'react';

const STORAGE_KEY = 'ff14_view_mode_override';

export function useIsMobile() {
  // 'auto' | 'mobile' | 'pc'
  const [overrideMode, setOverrideMode] = useState<'auto' | 'mobile' | 'pc'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'mobile' || saved === 'pc') return saved;
    }
    return 'auto';
  });

  const [isMobileWidth, setIsMobileWidth] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileWidth(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleOverride = (mode: 'auto' | 'mobile' | 'pc') => {
    setOverrideMode(mode);
    if (mode === 'auto') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, mode);
    }
  };

  const isMobile = overrideMode === 'mobile' ? true : overrideMode === 'pc' ? false : isMobileWidth;

  return { isMobile, overrideMode, toggleOverride };
}
