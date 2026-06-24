import { useEffect, useState } from 'react';

interface Viewport { width: number; height: number; isMobile: boolean; isPortrait: boolean; }

function measure(): Viewport {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { width: w, height: h, isMobile: Math.min(w, h) <= 760, isPortrait: h > w };
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
