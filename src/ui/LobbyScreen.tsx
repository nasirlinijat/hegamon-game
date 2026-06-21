import { useEffect, useRef, useState } from 'react';
import { type GameConfig } from '../engine/modes';
import { type PlayerId } from '../engine/state';
import * as net from './net';
import { type LobbyState, type SeatInfo } from './net';
import { CC, SectionLabel, GameConfigPanel, useConfigState, buildConfig } from './GameConfigPanel';

interface Props {
  onGameReady: (params: {
    config: GameConfig;
    mySeat: PlayerId;
    seatToken: string;
    code: string;
    playerColors: Record<string, string>;
    playerNames: Record<string, string>;
    wireState: object;
  }) => void;
  onBack: () => void;
}

type View = 'choose' | 'create' | 'join' | 'waiting';

export function LobbyScreen({ onGameReady, onBack }: Props) {
  const [view, setView]         = useState<View>('choose');
  const [name, setName]         = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [roomSize, setRoomSize] = useState(2);
  const [lobby, setLobby]       = useState<LobbyState | null>(null);
  const [mySeat, setMySeat]     = useState<PlayerId | null>(null);
  const [myToken, setMyToken]   = useState('');
  const [error, setError]       = useState('');

  // Game config state — host configures before creating the room
  const [cs, setCs] = useConfigState();

  const mySeatRef  = useRef(mySeat);
  mySeatRef.current = mySeat;
  const myTokenRef = useRef(myToken);
  myTokenRef.current = myToken;
  const lobbyRef   = useRef(lobby);
  lobbyRef.current = lobby;

  useEffect(() => {
    net.onRoomCreated(data => {
      setMySeat(data.mySeat); setMyToken(data.myToken);
      setLobby(data); setView('waiting'); setError('');
    });
    net.onRoomJoined(data => {
      setMySeat(data.mySeat); setMyToken(data.myToken);
      setLobby(data); setView('waiting'); setError('');
    });
    net.onLobbyState(data => { setLobby(data); });
    net.onGameStarted(data => {
      const seat = (data.mySeat ?? mySeatRef.current) as PlayerId | null;
      if (!seat) return;
      onGameReady({
        config: data.config,
        mySeat: seat,
        seatToken: myTokenRef.current,
        code: lobbyRef.current?.code ?? '',
        playerColors: data.playerColors,
        playerNames: data.playerNames,
        wireState: data.state,
      });
    });
    net.onMySeat(data => {
      setMySeat(data.mySeat);
      mySeatRef.current = data.mySeat;
    });
    net.onNetError(data => { setError(data.message); });
    return () => { net.offAll(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCreate() {
    if (!name.trim()) { setError('Enter your name.'); return; }
    const config = buildConfig(cs, roomSize - 1);
    net.createRoom(config, roomSize, name.trim());
  }

  function handleJoin() {
    if (!name.trim())        { setError('Enter your name.'); return; }
    if (joinCode.length < 6) { setError('Enter the 6-character room code.'); return; }
    net.joinRoom(joinCode, name.trim());
  }

  const isHost      = lobby !== null && mySeat === lobby.hostSeat;
  const numPlayers  = lobby?.seats.length ?? roomSize;

  // ── Choose ───────────────────────────────────────────────────────────────
  if (view === 'choose') return (
    <Screen onBack={onBack} title="Multiplayer">
      <div style={{ display:'flex', flexDirection:'column', gap:14, marginTop:8 }}>
        <BigBtn label="Create a Room" sub="host a game, share the code" primary onClick={() => setView('create')} />
        <BigBtn label="Join a Room"   sub="enter a code to join friends"       onClick={() => setView('join')} />
      </div>
      {error && <Err>{error}</Err>}
    </Screen>
  );

  // ── Join ─────────────────────────────────────────────────────────────────
  if (view === 'join') return (
    <Screen onBack={() => setView('choose')} title="Join Room" wide={false}>
      <Field label="Your name" value={name} onChange={setName} placeholder="Enter your name" />
      <Field label="Room code" value={joinCode} onChange={v => setJoinCode(v.toUpperCase())} placeholder="XXXXXX" mono />
      {error && <Err>{error}</Err>}
      <GoldBtn onClick={handleJoin}>Join →</GoldBtn>
    </Screen>
  );

  // ── Create ───────────────────────────────────────────────────────────────
  if (view === 'create') return (
    <Screen onBack={() => setView('choose')} title="Create Room" wide>
      <div style={{ display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap' }}>
        {/* Left: name + room size */}
        <div style={{ minWidth:200, flex:'0 0 200px' }}>
          <Field label="Your name" value={name} onChange={setName} placeholder="Enter your name" />
          <div style={{ marginBottom:18 }}>
            <Label>Room size</Label>
            <div style={{ display:'flex', gap:7 }}>
              {[2,3,4,5,6].map(n => (
                <button key={n} onClick={() => setRoomSize(n)} style={{
                  width:38, height:38, borderRadius:8, cursor:'pointer',
                  fontSize:16, fontWeight:800,
                  background: roomSize===n ? 'rgba(196,146,42,0.16)' : 'rgba(255,255,255,0.04)',
                  color: roomSize===n ? CC.goldBrt : CC.textMuted,
                  border:`1.5px solid ${roomSize===n ? 'rgba(196,146,42,0.62)' : 'rgba(255,255,255,0.07)'}`,
                  transition:'all .12s',
                }}>{n}</button>
              ))}
            </div>
            <div style={{ fontSize:10, color:CC.textMuted, marginTop:6 }}>
              You can add bots to fill empty seats in the lobby.
            </div>
          </div>
          {error && <Err>{error}</Err>}
          <GoldBtn onClick={handleCreate}>Create Room →</GoldBtn>
        </div>

        {/* Divider */}
        <div style={{ width:1, background:'rgba(255,255,255,0.07)', alignSelf:'stretch', flexShrink:0 }} />

        {/* Right: game config */}
        <div style={{ flex:1, minWidth:320 }}>
          <GameConfigPanel cs={cs} setCs={setCs} numPlayers={roomSize} />
        </div>
      </div>
    </Screen>
  );

  // ── Waiting lobby ────────────────────────────────────────────────────────
  if (!lobby) return <Screen onBack={onBack} title="Loading…"><div /></Screen>;

  return (
    <Screen onBack={onBack} title="Lobby" wide>
      <div style={{ display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap' }}>

        {/* Left: room code + seats */}
        <div style={{ minWidth:200, flex:'0 0 220px' }}>
          {/* Room code */}
          <div style={{
            background:'rgba(196,146,42,0.1)', border:'1px solid rgba(196,146,42,0.25)',
            borderRadius:10, padding:'12px 16px', marginBottom:20,
          }}>
            <div style={{ fontSize:9, color:CC.gold, letterSpacing:2, fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>
              Room Code
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:26, fontWeight:900, letterSpacing:5, color:CC.goldBrt, fontFamily:'monospace' }}>
                {lobby.code}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(lobby.code)}
                style={{ fontSize:10, color:CC.textDim, background:'rgba(255,255,255,0.06)', border:`1px solid rgba(255,255,255,0.08)`, borderRadius:6, padding:'5px 10px', cursor:'pointer' }}
              >Copy</button>
            </div>
          </div>

          <SectionLabel>Seats ({lobby.seats.length} / {lobby.size})</SectionLabel>
          <div style={{ display:'flex', flexDirection:'column', gap:7, marginBottom:16 }}>
            {lobby.seats.map((seat: SeatInfo) => (
              <SeatRow key={seat.id} seat={seat} isMe={seat.id===mySeat} isHost={isHost} />
            ))}
            {Array.from({ length: lobby.size - lobby.seats.length }).map((_, i) => (
              <div key={`empty-${i}`} style={{
                padding:'8px 11px', borderRadius:8,
                border:'1px dashed rgba(255,255,255,0.1)',
                fontSize:11, color:CC.textMuted, fontStyle:'italic',
              }}>Empty seat</div>
            ))}
          </div>

          {isHost && lobby.seats.length < lobby.size && (
            <button onClick={() => net.addBot()} style={{
              width:'100%', background:'rgba(255,255,255,0.04)',
              border:`1px solid rgba(255,255,255,0.1)`, borderRadius:8,
              padding:'8px 0', fontSize:11, fontWeight:700, color:CC.textDim,
              cursor:'pointer', marginBottom:16,
            }}>+ Add Bot</button>
          )}

          {error && <Err>{error}</Err>}

          {isHost ? (
            <GoldBtn onClick={() => net.startGame()}>Launch Campaign →</GoldBtn>
          ) : (
            <div style={{ textAlign:'center', fontSize:12, color:CC.textMuted, marginTop:8 }}>
              Waiting for host to start…
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width:1, background:'rgba(255,255,255,0.07)', alignSelf:'stretch', flexShrink:0 }} />

        {/* Right: game config (host editable, others read-only) */}
        <div style={{ flex:1, minWidth:320 }}>
          {isHost ? (
            <GameConfigPanel cs={cs} setCs={setCs} numPlayers={numPlayers} />
          ) : (
            <ConfigReadonly lobby={lobby} />
          )}
        </div>

      </div>
    </Screen>
  );
}

// ── Config read-only view for non-host joiners ────────────────────────────────

function ConfigReadonly({ lobby }: { lobby: LobbyState }) {
  const c = lobby.config;
  const rows: [string, string][] = [
    ['Mode',       c.mode.charAt(0).toUpperCase() + c.mode.slice(1)],
    ['Card Bonus', c.cardBonus],
    ['Placement',  c.placement === 'step' ? 'One-by-one' : 'Batch'],
    ['Fog of War', c.fogOfWar ? 'On' : 'Off'],
    ['Dice',       c.dice],
    ['Turn Timer', c.turnTimer ? `${c.turnTimer}s` : 'Off'],
  ];
  return (
    <div>
      <SectionLabel>Game Settings</SectionLabel>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:11, color:CC.textDim }}>{label}</span>
            <span style={{ fontSize:11, fontWeight:700, color:CC.text }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Screen({ children, title, onBack, wide }: { children: React.ReactNode; title: string; onBack: () => void; wide?: boolean }) {
  return (
    <div style={{
      position:'absolute', inset:0, zIndex:20,
      display:'flex', alignItems:'center', justifyContent:'center',
      background:'radial-gradient(ellipse at 50% 28%, #0D1829 0%, #060C14 100%)',
      overflow:'auto', padding:'24px 16px',
    }}>
      <div style={{
        background:'linear-gradient(160deg, #0C1528 0%, #091320 100%)',
        border:'1px solid rgba(196,146,42,0.16)',
        borderRadius:16, padding:'32px 36px',
        width: wide ? 860 : 460, maxWidth:'100%',
        boxShadow:'0 0 0 1px rgba(255,255,255,0.04), 0 28px 70px rgba(0,0,0,0.72)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
          <button onClick={onBack} style={{ background:'none', border:'none', color:CC.textDim, cursor:'pointer', fontSize:18, padding:0, lineHeight:1 }}>←</button>
          <div style={{ fontSize:10, letterSpacing:2.5, color:CC.gold, fontWeight:700, textTransform:'uppercase' }}>{title}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, mono }: { label:string; value:string; onChange:(v:string)=>void; placeholder?:string; mono?:boolean }) {
  return (
    <div style={{ marginBottom:18 }}>
      <Label>{label}</Label>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{
          width:'100%', boxSizing:'border-box',
          background:'rgba(255,255,255,0.04)', border:`1px solid rgba(255,255,255,0.1)`,
          borderRadius:8, padding:'10px 12px', color:CC.text,
          fontSize:mono?18:13, fontFamily:mono?'monospace':'inherit',
          letterSpacing:mono?4:0, outline:'none',
        }} />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize:9, color:CC.gold, letterSpacing:2, fontWeight:700, textTransform:'uppercase', marginBottom:8 }}>{children}</div>;
}

function Err({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize:12, color:'#e07070', marginBottom:12, padding:'8px 12px', background:'rgba(192,57,43,0.1)', borderRadius:7 }}>{children}</div>;
}

function GoldBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width:'100%',
      background:'linear-gradient(135deg,#8B6214 0%,#C4922A 40%,#E8B84B 70%,#C4922A 100%)',
      color:'#FFF8EC', border:'none', borderRadius:11, padding:'14px 0',
      fontSize:13, fontWeight:800, letterSpacing:3, cursor:'pointer', textTransform:'uppercase',
      boxShadow:'0 4px 24px rgba(196,146,42,0.28)',
    }}>{children}</button>
  );
}

function BigBtn({ label, sub, primary, onClick }: { label:string; sub:string; primary?:boolean; onClick:()=>void }) {
  return (
    <button onClick={onClick} style={{
      background: primary ? 'linear-gradient(135deg,#8B6214 0%,#C4922A 40%,#E8B84B 70%,#C4922A 100%)' : 'rgba(255,255,255,0.04)',
      color: primary ? '#FFF8EC' : CC.text,
      border:`1px solid ${primary ? 'rgba(196,146,42,0.5)' : 'rgba(255,255,255,0.1)'}`,
      borderRadius:12, padding:'16px 0', cursor:'pointer', width:'100%',
    }}>
      <div style={{ fontSize:14, fontWeight:800 }}>{label}</div>
      <div style={{ fontSize:11, opacity:0.7, marginTop:3 }}>{sub}</div>
    </button>
  );
}

function SeatRow({ seat, isMe, isHost }: { seat:SeatInfo; isMe:boolean; isHost:boolean }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:9,
      padding:'8px 11px', borderRadius:8,
      background: isMe ? 'rgba(196,146,42,0.06)' : 'rgba(255,255,255,0.025)',
      border:`1px solid ${isMe ? 'rgba(196,146,42,0.35)' : 'rgba(255,255,255,0.07)'}`,
    }}>
      <div style={{ width:10, height:10, borderRadius:'50%', background:seat.color, flexShrink:0 }} />
      <span style={{ flex:1, fontSize:12, color:CC.text, fontWeight:isMe?700:400 }}>
        {seat.name}{isMe?' (you)':''}{seat.kind==='bot'?' 🤖':''}
      </span>
      <span style={{ fontSize:10, color:seat.connected?'#4a9e5c':CC.textDim }}>
        {seat.kind==='bot' ? 'AI' : seat.connected ? 'online' : 'offline'}
      </span>
      {isHost && seat.kind==='bot' && (
        <button onClick={() => net.removeBot(seat.id as PlayerId)}
          style={{ background:'none', border:'none', color:'#c0392b', cursor:'pointer', fontSize:12, padding:'0 4px' }}>✕</button>
      )}
    </div>
  );
}
