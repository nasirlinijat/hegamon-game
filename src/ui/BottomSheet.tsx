import { useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

export function BottomSheet({ open, onClose, children, title }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 30,
        background: 'rgba(2,6,14,0.6)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      <style>{`@keyframes bsSlideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }`}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(8,14,26,0.99)',
          border: '1px solid rgba(196,146,42,0.18)',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
          maxHeight: '80dvh', overflowY: 'auto',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.7)',
          animation: 'bsSlideUp .22s ease-out',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
        </div>
        {title && (
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 2.5,
            color: '#C4922A', padding: '0 20px 12px',
            textTransform: 'uppercase',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>{title}</div>
        )}
        <div style={{ padding: '16px 20px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
