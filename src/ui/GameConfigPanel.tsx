/**
 * Shared game configuration panel used by both SetupScreen (single-player) and
 * LobbyScreen (multiplayer). Manages mode, board, and all rules settings.
 * Opponents count and AI difficulty are handled by the parent, as they differ
 * between single-player (fixed) and multiplayer (determined by seats/bots).
 */
import { useState } from 'react';
import {
  MODES, DEFAULT_CONFIG,
  type GameConfig, type CardBonusMode,
  type PlacementMode, type DiceMode, type GameMode, type TeamsMode, type MapId,
} from '../engine/modes';
import { MAP_OPTIONS, getMap } from '../engine/map-registry';
import { MapThumbnail } from './MapThumbnail';

// ── Design tokens (shared) ─────────────────────────────────────────────────────
export const CC = {
  gold:      '#C4922A',
  goldBrt:   '#E8B84B',
  goldFaint: 'rgba(196,146,42,0.10)',
  text:      '#EBF0FA',
  textDim:   '#7A92AE',
  textMuted: '#3D5068',
  borderDim: 'rgba(255,255,255,0.06)',
  crimson:   '#C0392B',
  violet:    '#7C3AED',
  amber:     '#B45309',
} as const;

const CARD_BONUS_HINT: Record<CardBonusMode, string> = {
  none:        'Trading a set gives no armies.',
  fixed:       'Fixed by set type — 3 infantry=4, 3 cavalry=6, 3 artillery=8, one-of-each=10.',
  progressive: 'Escalating each trade-in: 4, 6, 8, 10, 12, 15, then +5.',
  nuclear:     'Steeper escalation: 8, 10, 12, 15, 20, 25, then +5.',
};

const MODE_ICON: Record<GameMode, string> = {
  world: '⚔', capitals: '♛', missions: '◎', domination: '◉', turnlimit: '⌛',
  twoplayer: '⚡', zombies: '☣', assassin: '✦', blizzards: '❄', portals: '⊕',
};

// ── Shared sub-components ──────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, letterSpacing: 2.5, color: CC.gold, fontWeight: 700,
      textTransform: 'uppercase', marginBottom: 11,
      paddingLeft: 9, borderLeft: `2px solid ${CC.gold}`, lineHeight: 1,
    }}>{children}</div>
  );
}

export function Divider({ mt = 0, mb = 20 }: { mt?: number; mb?: number }) {
  return (
    <div style={{
      height: 1, marginTop: mt, marginBottom: mb,
      background: 'linear-gradient(90deg, transparent, rgba(196,146,42,0.15) 30%, rgba(196,146,42,0.15) 70%, transparent)',
    }} />
  );
}

export function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 11, color: CC.textDim, minWidth: 86, flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{children}</div>
    </div>
  );
}

export function segStyle(active: boolean, accentColor?: string, disabled = false): React.CSSProperties {
  const accent = accentColor ?? CC.gold;
  let activeBg = 'rgba(196,146,42,0.13)';
  let activeText: string = CC.goldBrt;
  if (accent === CC.crimson) { activeBg = 'rgba(192,57,43,0.16)'; activeText = '#e07070'; }
  else if (accent === CC.violet) { activeBg = 'rgba(124,58,237,0.16)'; activeText = '#a78bfa'; }
  else if (accent === CC.amber) { activeBg = 'rgba(180,83,9,0.18)'; activeText = '#fbbf24'; }
  return {
    padding: '5px 10px', borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 11, fontWeight: 600,
    background: active ? activeBg : 'rgba(255,255,255,0.04)',
    color: active ? activeText : CC.textDim,
    border: `1px solid ${active ? accent : CC.borderDim}`,
    opacity: disabled ? 0.4 : 1,
    transition: 'all .1s',
  };
}

function ModeIconTile({ meta, selected, onClick }: {
  meta: { id: GameMode; label: string; blurb: string; implemented: boolean };
  selected: boolean;
  onClick: () => void;
}) {
  const disabled = !meta.implemented;
  return (
    <button
      className="setup-mode-tile"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? `${meta.label} (coming soon)` : meta.blurb}
      aria-label={meta.label}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 4, padding: '8px 3px',
        border: `1px solid ${selected ? 'rgba(196,146,42,0.58)' : CC.borderDim}`,
        borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
        background: selected ? CC.goldFaint : 'rgba(255,255,255,0.025)',
        opacity: disabled ? 0.35 : 1,
        transition: 'border-color .12s, background .12s', minWidth: 0,
      }}
    >
      <span style={{ fontSize: 17, lineHeight: 1, color: selected ? CC.goldBrt : CC.textMuted }}>
        {MODE_ICON[meta.id]}
      </span>
      <span style={{
        fontSize: 7.5, fontWeight: 700, textAlign: 'center', lineHeight: 1.25,
        color: selected ? CC.gold : CC.textDim,
        wordBreak: 'break-word', overflowWrap: 'break-word', display: 'block', width: '100%',
      }}>{meta.label}</span>
    </button>
  );
}

// ── Hook: manage config state ──────────────────────────────────────────────────

export interface ConfigState {
  mode: GameMode;
  cardBonus: CardBonusMode;
  placement: PlacementMode;
  fogOfWar: boolean;
  dice: DiceMode;
  teams: TeamsMode;
  mapId: MapId;
  turnTimer: number;
  threshold: number;   // domination %
  turnLimit: number;   // turnlimit rounds
}

export function useConfigState(initial?: Partial<ConfigState>): [ConfigState, React.Dispatch<React.SetStateAction<ConfigState>>] {
  return useState<ConfigState>({
    mode:      initial?.mode      ?? DEFAULT_CONFIG.mode,
    cardBonus: initial?.cardBonus ?? DEFAULT_CONFIG.cardBonus,
    placement: initial?.placement ?? DEFAULT_CONFIG.placement,
    fogOfWar:  initial?.fogOfWar  ?? DEFAULT_CONFIG.fogOfWar,
    dice:      initial?.dice      ?? DEFAULT_CONFIG.dice,
    teams:     initial?.teams     ?? DEFAULT_CONFIG.teams,
    mapId:     initial?.mapId     ?? (DEFAULT_CONFIG.mapId ?? 'classic'),
    turnTimer: initial?.turnTimer ?? (DEFAULT_CONFIG.turnTimer ?? 0),
    threshold: initial?.threshold ?? 0.70,
    turnLimit: initial?.turnLimit ?? 15,
  });
}

/** Build a GameConfig from ConfigState + SP-specific fields. */
export function buildConfig(
  cs: ConfigState,
  numOpponents: number,
  aiDifficulty: GameConfig['aiDifficulty'] = 'normal',
): GameConfig {
  return {
    mode: cs.mode,
    numOpponents,
    aiDifficulty,
    cardBonus: cs.cardBonus,
    placement: cs.placement,
    fogOfWar: cs.fogOfWar,
    dice: cs.dice,
    teams: cs.teams,
    mapId: cs.mapId,
    turnTimer: cs.turnTimer,
    ...(cs.mode === 'domination' ? { dominationThreshold: cs.threshold } : {}),
    ...(cs.mode === 'turnlimit'  ? { turnLimit: cs.turnLimit } : {}),
  };
}

// ── Main panel component ───────────────────────────────────────────────────────

interface GameConfigPanelProps {
  cs: ConfigState;
  setCs: React.Dispatch<React.SetStateAction<ConfigState>>;
  /** Total player count (humans + bots) used to gate Teams options. */
  numPlayers: number;
}

/**
 * Renders the Theater (board), Game Mode, and Rules sections.
 * Embedded in the right panel of SetupScreen and the create/waiting views of LobbyScreen.
 */
export function GameConfigPanel({ cs, setCs, numPlayers }: GameConfigPanelProps) {
  const set = <K extends keyof ConfigState>(k: K, v: ConfigState[K]) =>
    setCs(prev => ({ ...prev, [k]: v }));

  const selectedMode = MODES.find(m => m.id === cs.mode);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* ── Game Mode ──────────────────────────────────────── */}
      <SectionLabel>Game Mode</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 10 }}>
        {MODES.map(m => (
          <ModeIconTile
            key={m.id} meta={m}
            selected={cs.mode === m.id}
            onClick={() => m.implemented && set('mode', m.id)}
          />
        ))}
      </div>

      {selectedMode && (
        <div style={{
          padding: '9px 13px', borderRadius: 8, marginBottom: 14,
          background: CC.goldFaint, border: '1px solid rgba(196,146,42,0.18)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: CC.text, marginBottom: 2 }}>
            {selectedMode.label}
          </div>
          <div style={{ fontSize: 10.5, color: CC.textDim, lineHeight: 1.5 }}>
            {selectedMode.blurb}
          </div>
        </div>
      )}

      {cs.mode === 'domination' && (
        <div style={{ marginBottom: 14 }}>
          <SectionLabel>Territory threshold · {Math.round(cs.threshold * 100)}%</SectionLabel>
          <input type="range" min={50} max={90} step={5}
            value={Math.round(cs.threshold * 100)}
            onChange={e => set('threshold', Number(e.target.value) / 100)}
            style={{ width: '100%', accentColor: CC.gold }} />
        </div>
      )}
      {cs.mode === 'turnlimit' && (
        <div style={{ marginBottom: 14 }}>
          <SectionLabel>Round limit · {cs.turnLimit} rounds</SectionLabel>
          <input type="range" min={5} max={40} step={5}
            value={cs.turnLimit}
            onChange={e => set('turnLimit', Number(e.target.value))}
            style={{ width: '100%', accentColor: CC.gold }} />
        </div>
      )}

      <Divider mt={4} mb={18} />

      {/* ── Theater ────────────────────────────────────────── */}
      <SectionLabel>Theater</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 20 }}>
        {MAP_OPTIONS.map(m => {
          const board = getMap(m.id);
          const territories = board.allTerritoryIds.length;
          const continents = Object.keys(board.continents).length;
          const selected = cs.mapId === m.id;
          return (
            <button
              key={m.id}
              className={`setup-map${selected ? ' map-active' : ''}`}
              onClick={() => set('mapId', m.id)}
              style={{
                display: 'flex', flexDirection: 'column', textAlign: 'left',
                padding: 0, borderRadius: 10, cursor: 'pointer', overflow: 'hidden',
                border: `1.5px solid ${selected ? 'rgba(196,146,42,0.6)' : CC.borderDim}`,
                background: selected ? CC.goldFaint : 'rgba(255,255,255,0.025)',
                transition: 'border-color .12s, background .12s', position: 'relative',
              }}
            >
              <div style={{ width: '100%', flexShrink: 0 }}>
                <MapThumbnail mapId={m.id} width={200} />
              </div>
              <div style={{
                position: 'absolute', top: 8, right: 8,
                width: 12, height: 12, borderRadius: '50%',
                border: `1.5px solid ${selected ? CC.gold : 'rgba(255,255,255,0.25)'}`,
                background: selected ? CC.gold : 'transparent', transition: 'all .12s',
              }} />
              <div style={{ padding: '9px 11px 11px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: selected ? CC.goldBrt : CC.text, marginBottom: 2 }}>
                  {m.name}
                </div>
                <div style={{ fontSize: 9.5, color: selected ? CC.gold : CC.textDim, marginBottom: 3 }}>
                  {territories} territories · {continents} continents
                </div>
                <div style={{ fontSize: 9.5, color: CC.textMuted, lineHeight: 1.4 }}>{m.blurb}</div>
              </div>
            </button>
          );
        })}
      </div>

      <Divider mb={18} />

      {/* ── Rules ──────────────────────────────────────────── */}
      <SectionLabel>Rules</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 4 }}>
        <SettingsRow label="Card Bonus">
          {(['none', 'fixed', 'progressive', 'nuclear'] as CardBonusMode[]).map(opt => (
            <button key={opt}
              className={`setup-seg${cs.cardBonus === opt ? ' seg-active' : ''}`}
              onClick={() => set('cardBonus', opt)}
              title={CARD_BONUS_HINT[opt]}
              style={segStyle(cs.cardBonus === opt)}>
              {opt === 'none' ? 'None' : opt === 'fixed' ? 'Fixed' : opt === 'progressive' ? 'Progressive' : 'Nuclear'}
            </button>
          ))}
        </SettingsRow>
        <SettingsRow label="Placement">
          {(['step', 'batch'] as PlacementMode[]).map(opt => (
            <button key={opt}
              className={`setup-seg${cs.placement === opt ? ' seg-active' : ''}`}
              onClick={() => set('placement', opt)}
              style={segStyle(cs.placement === opt)}>
              {opt === 'step' ? 'One-by-one' : 'Batch'}
            </button>
          ))}
        </SettingsRow>
        <SettingsRow label="Fog of War">
          {([false, true] as const).map(v => (
            <button key={String(v)}
              className={`setup-seg${cs.fogOfWar === v ? ' seg-active' : ''}`}
              onClick={() => set('fogOfWar', v)}
              style={segStyle(cs.fogOfWar === v)}>
              {v ? 'On' : 'Off'}
            </button>
          ))}
        </SettingsRow>
        <SettingsRow label="Dice">
          {(['random', 'balanced'] as DiceMode[]).map(opt => (
            <button key={opt}
              className={`setup-seg${cs.dice === opt ? ' seg-active' : ''}`}
              onClick={() => set('dice', opt)}
              style={segStyle(cs.dice === opt)}>
              {opt === 'random' ? 'Random' : 'Balanced'}
            </button>
          ))}
        </SettingsRow>
        <SettingsRow label="Teams">
          {(['off', '2v2', '3v3'] as TeamsMode[]).map(opt => {
            const ok = opt === 'off'
              || (opt === '2v2' && numPlayers === 4)
              || (opt === '3v3' && numPlayers === 6);
            return (
              <button key={opt} disabled={!ok}
                className={`setup-seg${cs.teams === opt ? ' seg-active' : ''}`}
                onClick={() => ok && set('teams', opt)}
                title={!ok ? `Requires ${opt === '2v2' ? '4 players' : '6 players'}` : ''}
                style={segStyle(cs.teams === opt, CC.violet, !ok)}>
                {opt === 'off' ? 'Off' : opt.toUpperCase()}
              </button>
            );
          })}
        </SettingsRow>
        <SettingsRow label="Turn Timer">
          {([0, 30, 60, 90, 120] as const).map(v => (
            <button key={v}
              className={`setup-seg${cs.turnTimer === v ? ' seg-active' : ''}`}
              onClick={() => set('turnTimer', v)}
              style={segStyle(cs.turnTimer === v, CC.amber)}>
              {v === 0 ? 'Off' : `${v}s`}
            </button>
          ))}
        </SettingsRow>
      </div>
    </div>
  );
}
