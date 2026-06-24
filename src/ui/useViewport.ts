import { useEffect, useState } from 'react';

interface Viewport { width: number; height: number; isMobile: boolean; isPortrait: boolean; }

function measure(): Viewport {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // A touch device (phone/tablet) reports a coarse primary pointer; a desktop reports fine.
  // Only the short-dimension test (which catches phones held in landscape) is gated on touch,
  // so a wide-but-short desktop window keeps the desktop layout instead of falling back to mobile.
  const coarse = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const isMobile = w <= 760 || (coarse && Math.min(w, h) <= 760);
  return { width: w, height: h, isMobile, isPortrait: h > w };
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(measure);
  useEffect(() => {
    let raf: number;
    const update = () => setVp(measure());
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return vp;
}
