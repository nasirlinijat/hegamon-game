import { useState } from 'react';
import { startingArmiesForMap } from '../engine/state';
import { DEFAULT_CONFIG, type GameConfig } from '../engine/modes';
import { getMap } from '../engine/map-registry';
import { PLAYER_IDS, PLAYER_COLORS } from './App';
import { Avatar } from './Avatar';
import {
  CC, SectionLabel, Divider,
  GameConfigPanel, useConfigState, buildConfig,
} from './GameConfigPanel';

interface Props { onStart: (config: GameConfig) => void; }

// Shared panel card style
const panel: React.CSSProperties = {
  background: 'linear-gradient(160deg, #0C1528 0%, #091320 100%)',
  border: '1px solid rgba(196,146,42,0.16)',
  borderRadius: 16,
  padding: '30px 34px',
  boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 24px 60px rgba(0,0,0,0.72)',
};

function CompassRose() {
  return (
    <svg aria-hidden style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.08, pointerEvents: 'none', zIndex: 0 }}
      width={170} height={170} viewBox="-85 -85 170 170">
      <circle r={73} fill="none" stroke={CC.gold} strokeWidth={0.6} />
      <circle r={49} fill="none" stroke={CC.gold} strokeWidth={0.6} />
      <circle r={25} fill="none" stroke={CC.gold} strokeWidth={0.5} />
      {[0, 90].map(deg => { const r = deg*Math.PI/180, [cx,cy]=[Math.cos(r),Math.sin(r)]; return <line key={deg} x1={-cx*80} y1={-cy*80} x2={cx*80} y2={cy*80} stroke={CC.gold} strokeWidth={0.55}/>; })}
      {[45, 135].map(deg => { const r = deg*Math.PI/180, [cx,cy]=[Math.cos(r),Math.sin(r)]; return <line key={deg} x1={-cx*60} y1={-cy*60} x2={cx*60} y2={cy*60} stroke={CC.gold} strokeWidth={0.35}/>; })}
      {[22.5,67.5,112.5,157.5,202.5,247.5,292.5,337.5].map(deg => { const r=deg*Math.PI/180,[cx,cy]=[Math.cos(r),Math.sin(r)]; return <line key={deg} x1={cx*49} y1={cy*49} x2={cx*73} y2={cy*73} stroke={CC.gold} strokeWidth={0.28}/>; })}
    </svg>
  );
}

export function SetupScreen({ onStart }: Props) {
  const [cs, setCs]          = useConfigState();
  const [opponents, setOpps] = useState(DEFAULT_CONFIG.numOpponents);

  const total          = opponents + 1;
  const startingArmies = startingArmiesForMap(total, getMap(cs.mapId).allTerritoryIds.length);
  const roster         = PLAYER_IDS.slice(0, total);

  function handleStart() {
    const config = buildConfig(cs, opponents);
    // Teams validity: must match player count exactly
    const effectiveTeams = cs.teams === 'off' || (cs.teams === '2v2' && total === 4) || (cs.teams === '3v3' && total === 6)
      ? cs.teams : 'off';
    onStart({ ...config, teams: effectiveTeams });
  }

  return (
    <>
      <style>{`
        .setup-mode-tile:hover:not([disabled]) { border-color:rgba(196,146,42,0.4)!important; background:rgba(196,146,42,0.08)!important; }
        .setup-seg:hover:not([disabled])       { color:#C8D4E0!important; border-color:rgba(255,255,255,0.16)!important; }
        .setup-num:hover:not(.num-active)      { border-color:rgba(196,146,42,0.5)!important; color:#C4922A!important; }
        .setup-map:not(.map-active):hover      { border-color:rgba(196,146,42,0.4)!important; background:rgba(196,146,42,0.07)!important; }
        .setup-launch:hover  { filter:brightness(1.12)!important; box-shadow:0 0 48px rgba(196,146,42,0.5),0 10px 32px rgba(0,0,0,0.55)!important; }
        .setup-launch:active { filter:brightness(0.94)!important; }
        @media (max-width:780px) { .setup-columns { flex-direction:column!important; } .setup-left-panel { width:100%!important; flex-shrink:1!important; } }
      `}</style>

      <div style={{ position:'absolute', inset:0, zIndex:20, display:'flex', alignItems:'flex-start', justifyContent:'center', background:'radial-gradient(ellipse at 50% 28%, #0D1829 0%, #060C14 100%)', overflow:'auto', padding:'24px 20px' }}>
        <div className="setup-columns" style={{ display:'flex', gap:20, width:'100%', maxWidth:980, alignItems:'flex-start' }}>

          {/* LEFT — identity + commanders + players */}
          <div className="setup-left-panel" style={{ ...panel, width:390, flexShrink:0 }}>
            {/* Header */}
            <div style={{ position:'relative', textAlign:'center', paddingBottom:26, marginBottom:22 }}>
              <CompassRose />
              <div style={{ position:'relative', zIndex:1 }}>
                <div style={{ fontSize:9, letterSpacing:5, color:CC.gold, fontWeight:700, textTransform:'uppercase', marginBottom:9 }}>World Conquest</div>
                <div style={{ fontSize:58, fontWeight:900, letterSpacing:12, color:CC.text, fontFamily:"Georgia,'Times New Roman',serif", lineHeight:1, textShadow:'0 0 50px rgba(196,146,42,0.18)' }}>RISK</div>
                <div style={{ fontSize:11, color:CC.textDim, marginTop:10, letterSpacing:0.4 }}>Command your forces. Conquer the world.</div>
              </div>
              <div style={{ position:'absolute', bottom:0, left:'50%', transform:'translateX(-50%)', width:200, height:1, background:'linear-gradient(90deg,transparent,rgba(196,146,42,0.42) 30%,rgba(196,146,42,0.42) 70%,transparent)' }} />
            </div>

            {/* Opponents */}
            <SectionLabel>Opponents</SectionLabel>
            <div style={{ display:'flex', gap:8, marginBottom:20 }}>
              {[1,2,3,4,5].map(n => {
                const active = n === opponents;
                return (
                  <button key={n} className={`setup-num${active?' num-active':''}`} onClick={() => setOpps(n)} style={{
                    flex:1, height:44, borderRadius:8, cursor:'pointer', fontSize:17, fontWeight:800,
                    background: active ? 'rgba(196,146,42,0.16)' : 'rgba(255,255,255,0.04)',
                    color: active ? CC.goldBrt : CC.textMuted,
                    border:`1.5px solid ${active ? 'rgba(196,146,42,0.62)' : CC.borderDim}`,
                    transition:'all .12s',
                  }}>{n}</button>
                );
              })}
            </div>

            <Divider mb={18} />

            {/* Players roster */}
            <div style={{ fontSize:9, color:CC.textMuted, letterSpacing:1.5, fontWeight:700, textTransform:'uppercase', marginBottom:10 }}>
              Players ({total}) · {startingArmies} armies each
            </div>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              {roster.map((id, i) => (
                <div key={id} style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <Avatar playerId={id} size={24} color={PLAYER_COLORS[id]!} />
                  <span style={{ fontSize:11, fontWeight:i===0?700:400, color:i===0?CC.text:CC.textDim }}>
                    {id}{i===0?' (you)':''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — config panel + launch */}
          <div style={{ ...panel, flex:1, minWidth:340, display:'flex', flexDirection:'column' }}>
            <GameConfigPanel cs={cs} setCs={setCs} numPlayers={total} />

            <Divider mt={18} mb={18} />

            <button className="setup-launch" onClick={handleStart} style={{
              width:'100%',
              background:'linear-gradient(135deg,#8B6214 0%,#C4922A 38%,#E8B84B 68%,#C4922A 100%)',
              color:'#FFF8EC', border:'none', borderRadius:11, padding:'14px 0',
              fontSize:13, fontWeight:800, letterSpacing:3, cursor:'pointer', textTransform:'uppercase',
              boxShadow:'0 4px 28px rgba(196,146,42,0.30),0 8px 32px rgba(0,0,0,0.4)',
              transition:'filter .15s, box-shadow .15s',
            }}>
              Launch Campaign →
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
