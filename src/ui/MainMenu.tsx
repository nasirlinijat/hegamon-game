const C = {
  gold:    '#C4922A',
  goldBrt: '#E8B84B',
  text:    '#EBF0FA',
  textDim: '#7A92AE',
} as const;

interface Props {
  onSinglePlayer: () => void;
  onMultiplayer:  () => void;
}

export function MainMenu({ onSinglePlayer, onMultiplayer }: Props) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 28%, #0D1829 0%, #060C14 100%)',
    }}>
      <div style={{
        background: 'linear-gradient(160deg, #0C1528 0%, #091320 100%)',
        border: '1px solid rgba(196,146,42,0.18)',
        borderRadius: 18,
        padding: 'clamp(28px, 6vw, 52px) clamp(20px, 8vw, 64px)',
        textAlign: 'center',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 32px 80px rgba(0,0,0,0.75)',
        width: 'min(360px, 92vw)',
      }}>
        {/* Compass rose */}
        <svg aria-hidden style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', opacity: 0.06, pointerEvents: 'none' }}
          width={220} height={220} viewBox="-110 -110 220 220">
          <circle r={96} fill="none" stroke={C.gold} strokeWidth={0.6}/>
          <circle r={64} fill="none" stroke={C.gold} strokeWidth={0.6}/>
          <circle r={32} fill="none" stroke={C.gold} strokeWidth={0.5}/>
          {[0,90].map(deg=>{ const r=deg*Math.PI/180,cx=Math.cos(r),cy=Math.sin(r); return <line key={deg} x1={-cx*106} y1={-cy*106} x2={cx*106} y2={cy*106} stroke={C.gold} strokeWidth={0.55}/>; })}
          {[45,135].map(deg=>{ const r=deg*Math.PI/180,cx=Math.cos(r),cy=Math.sin(r); return <line key={deg} x1={-cx*76} y1={-cy*76} x2={cx*76} y2={cy*76} stroke={C.gold} strokeWidth={0.35}/>; })}
        </svg>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 9, letterSpacing: 5, color: C.gold, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>
            World Conquest
          </div>
          <div style={{
            fontSize: 'clamp(30px, 10vw, 46px)', fontWeight: 900, letterSpacing: 'clamp(2px, 1.5vw, 6px)', color: C.text,
            fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1,
            textShadow: '0 0 50px rgba(196,146,42,0.18)', marginBottom: 10,
          }}>
            HEGEMON
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 48, letterSpacing: 0.5 }}>
            Command your forces. Conquer the world.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <MenuBtn label="Single Player" sub="vs AI opponents" primary onClick={onSinglePlayer} />
            <MenuBtn label="Multiplayer" sub="play online with friends" onClick={onMultiplayer} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuBtn({ label, sub, primary, onClick }: { label: string; sub: string; primary?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: primary
          ? 'linear-gradient(135deg, #8B6214 0%, #C4922A 40%, #E8B84B 70%, #C4922A 100%)'
          : 'rgba(255,255,255,0.04)',
        color: primary ? '#FFF8EC' : C.text,
        border: `1px solid ${primary ? 'rgba(196,146,42,0.5)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 12, padding: '16px 0', cursor: 'pointer',
        boxShadow: primary ? '0 4px 24px rgba(196,146,42,0.28)' : 'none',
        transition: 'filter .15s',
        width: '100%',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = 'none'; }}
    >
      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 3 }}>{sub}</div>
    </button>
  );
}
