import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { type TerritoryId } from '../engine/map';
import type { GameState } from '../engine/state';
import { usePlayer } from './PlayerContext';
import { darken, lighten } from './colors';
import { MAP_W, MAP_H } from './map-geometry';
import { getMapRender } from './map-render';
import { CONTINENT_TINT } from './territory-shapes';

interface Props {
  state: GameState;
  selected: TerritoryId | null;
  validTargets: Set<TerritoryId>;
  hoverTargets: Set<TerritoryId>;
  hovered: TerritoryId | null;
  onTerritoryClick: (id: TerritoryId) => void;
  onHover: (id: TerritoryId | null) => void;
  /** When true, paint every continent in its Map-Key colour so the regions are visible at a glance. */
  showBonusContinents: boolean;
}

const NEUTRAL_COLOR = '#4a5568';
// Continent tints are keyed by classic continent ids; widen to a string lookup so the active
// board's continent ids resolve with a neutral fallback for any not in the classic palette.
const TINT = CONTINENT_TINT as Record<string, string>;
const LAND_BASE_COLOR = '#356a8c';
const LAND_BASE_STROKE = '#23c6d8';
const TERRITORY_BORDER = 'rgba(3,9,20,0.92)';   // bold dark outline separating neighbouring territories

const COIN_GRAD_ID = (owner: string) => `coin-${owner.replace(/\s/g, '-')}`;

// Vertical offset at rest. Margins are now baked into the projection (build-map.mjs
// fitExtent padding) so the map sits centred with ocean on all sides — no extra offset needed.
const TOP_PAD = 0;

// Clamp pan so the scaled map always covers the viewBox.
// At scale=1 the y is locked to TOP_PAD (ocean buffer above); at higher scales the user can pan freely.
function clampX(x: number, s: number) { return Math.min(0, Math.max(MAP_W * (1 - s), x)); }
function clampY(y: number, s: number) { return Math.min(TOP_PAD, Math.max(MAP_H * (1 - s) + TOP_PAD, y)); }

export const Board = memo(function Board({
  state, selected, validTargets, hoverTargets, hovered, onTerritoryClick, onHover,
  showBonusContinents,
}: Props) {
  const { myId, playerColors } = usePlayer();

  // Geometry + connectors for the board being played (classic or imperial), selected by map id.
  const { TERRITORY_PATH, TERRITORY_CENTROID, LAND_PATH, ALL_IDS, GAP_CONNECTORS, WRAP_STUBS } =
    getMapRender(state.map.id);

  const ownerColor = (id: TerritoryId) => {
    const owner = state.owner[id];
    return owner ? (playerColors[owner] ?? NEUTRAL_COLOR) : NEUTRAL_COLOR;
  };
  // Each territory is filled by its CONTINENT colour (classic board look); ownership is read from
  // the owner-coloured border + the army token, not the fill.
  const territoryTint = (id: TerritoryId): string =>
    TINT[state.map.territories[id]?.continent ?? ''] ?? NEUTRAL_COLOR;

  // Capital Conquest: set of territory ids that are capitals (one per player).
  const capitalSet = state.capitals ? new Set(Object.values(state.capitals) as TerritoryId[]) : null;

  // Fog of War: line of sight = territories the human owns plus every territory adjacent to one
  // they own (neighbours see each other). Everything outside that set is fogged — owner colour
  // AND strength are hidden under an animated fog bank, so what lies beyond is unpredictable.
  const fogActive = state.config.fogOfWar === true;
  const visibleSet = useMemo<Set<TerritoryId> | null>(() => {
    if (!fogActive) return null;
    const vis = new Set<TerritoryId>();
    for (const id of ALL_IDS) {
      if (state.owner[id] === myId) {
        vis.add(id);
        for (const n of state.map.adjacency[id] ?? []) vis.add(n);
      }
    }
    return vis;
  }, [fogActive, state.owner]);
  const isFogged = (id: TerritoryId): boolean => visibleSet !== null && !visibleSet.has(id);
  const FOG_FILL = '#101924'; // dark base under the fog bank — hides owner colour entirely

  // Continent overlay: paint every continent's territories in its Map-Key colour so the regions
  // are obvious at a glance (fully opaque, exact legend colours).
  const continentOverlay = showBonusContinents ? Object.values(state.map.continents) : [];

  // ── Pan / zoom state ─────────────────────────────────────────────────────
  const [vp, setVp] = useState({ x: 0, y: TOP_PAD, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const svgRef   = useRef<SVGSVGElement>(null);
  const dragRef  = useRef<{ mx: number; my: number; tx: number; ty: number } | null>(null);
  const didMoveRef = useRef(false);

  // Non-passive wheel listener — required so e.preventDefault() actually works.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / rect.width  * MAP_W;
      const cy = (e.clientY - rect.top)  / rect.height * MAP_H;
      // Cap per-event delta so fast swipes can't jump too far, then apply a gentle exponent.
      // ~6-7% zoom per mouse-wheel tick; trackpad events are tiny so they compound smoothly.
      const cappedDelta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100);
      const factor = Math.pow(0.9993, cappedDelta);
      setVp(prev => {
        const s = Math.max(1, Math.min(8, prev.scale * factor));
        const r = s / prev.scale;
        return {
          scale: s,
          x: clampX(cx - (cx - prev.x) * r, s),
          y: clampY(cy - (cy - prev.y) * r, s),
        };
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const isOffset = vp.scale !== 1 || vp.x !== 0 || vp.y !== TOP_PAD;

  // Army-coin scaling (all boards). Coins counter-scale with zoom so they hold a constant on-screen
  // size — zoom into a cluster and the territories spread apart while the coins stay put, instead of
  // ballooning. The denser imperial board also uses a smaller base so its many tiny territories
  // don't overlap; the classic board keeps its full base size at default zoom.
  const coinBase = state.map.id === 'imperial' ? 0.62 : 1;
  const coinK = coinBase / Math.max(1, vp.scale);

  // Line overlays (sea-route connectors, portals, dateline stubs) are drawn in map space, so they
  // balloon as you zoom in. Counter-scale their stroke/dash/dot sizes by 1/zoom to hold a constant
  // on-screen thickness.
  const invScale = 1 / Math.max(1, vp.scale);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        style={{
          width: '100%', height: '100%', display: 'block',
          cursor: dragging ? 'grabbing' : 'grab',
        }}
        onMouseDown={e => {
          if (e.button !== 0) return;
          didMoveRef.current = false;
          dragRef.current = { mx: e.clientX, my: e.clientY, tx: vp.x, ty: vp.y };
          setDragging(true);
        }}
        onMouseMove={e => {
          if (!dragRef.current) return;
          const { mx, my, tx, ty } = dragRef.current;
          const dx = e.clientX - mx;
          const dy = e.clientY - my;
          if (!didMoveRef.current && Math.abs(dx) + Math.abs(dy) > 4)
            didMoveRef.current = true;
          if (!didMoveRef.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          setVp(prev => ({
            ...prev,
            x: clampX(tx + dx / rect.width  * MAP_W, prev.scale),
            y: clampY(ty + dy / rect.height * MAP_H, prev.scale),
          }));
        }}
        onMouseUp={() => { dragRef.current = null; setDragging(false); }}
        onMouseLeave={() => { dragRef.current = null; setDragging(false); }}
      >
        <defs>
          {/* Ocean gradient — deep blue for contrast against the vibrant continents */}
          <radialGradient id="ocean-grad" cx="50%" cy="44%" r="80%">
            <stop offset="0%"   stopColor="#1f5680" />
            <stop offset="100%" stopColor="#07203a" />
          </radialGradient>

          {/* Graticule dot grid */}
          <pattern id="graticule" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="0.7" fill="#ffffff" opacity="0.05" />
          </pattern>

          {/* Cyan coastline glow — kept cheap (single blur pass, no saturate amplification) */}
          <filter id="coast-glow" x="-3%" y="-3%" width="106%" height="106%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Selection / target glow */}
          <filter id="glow-sel" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feColorMatrix in="blur" type="matrix"
              values="1 0.8 0 0 0.3  0.8 0.6 0 0 0.1  0 0 0 0 0  0 0 0 1 0" result="gold" />
            <feMerge><feMergeNode in="gold" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-target" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Per-player coin gradients */}
          {Object.entries(playerColors).map(([pid, base]) => (
            <radialGradient key={pid} id={COIN_GRAD_ID(pid)} cx="35%" cy="30%" r="65%">
              <stop offset="0%"   stopColor={lighten(base, 0.45)} stopOpacity="1" />
              <stop offset="60%"  stopColor={base}                stopOpacity="1" />
              <stop offset="100%" stopColor={darken(base, 0.30)}  stopOpacity="1" />
            </radialGradient>
          ))}
          <radialGradient id="coin-neutral" cx="35%" cy="30%" r="65%">
            <stop offset="0%"   stopColor={lighten(NEUTRAL_COLOR, 0.45)} />
            <stop offset="60%"  stopColor={NEUTRAL_COLOR} />
            <stop offset="100%" stopColor={darken(NEUTRAL_COLOR, 0.30)} />
          </radialGradient>

          {/* Fog-of-war cloud textures — fractal noise tinted to a cold blue-grey haze.
              Two layers with different frequencies/seeds drift past each other for a rolling bank. */}
          <filter id="fog-cloud-a" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.013" numOctaves="2" seed="7" result="n" />
            <feColorMatrix in="n" type="matrix"
              values="0 0 0 0 0.40
                      0 0 0 0 0.48
                      0 0 0 0 0.58
                      0 0 0 0.85 0" />
          </filter>
          <filter id="fog-cloud-b" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="1" seed="23" result="n" />
            <feColorMatrix in="n" type="matrix"
              values="0 0 0 0 0.55
                      0 0 0 0 0.62
                      0 0 0 0 0.70
                      0 0 0 0.65 0" />
          </filter>
        </defs>

        <style>{`
          @keyframes dashMove { to { stroke-dashoffset: -14; } }
          .target-dash { animation: dashMove 0.65s linear infinite; }
          @media (prefers-reduced-motion: reduce) { .target-dash { animation: none !important; } }
        `}</style>

        {/* Ocean fills the full viewBox — outside the pan/zoom group */}
        <rect width={MAP_W} height={MAP_H} fill="url(#ocean-grad)" />
        <rect width={MAP_W} height={MAP_H} fill="url(#graticule)" />

        {/* ── Pan / zoom group — everything map-related lives here ─────────── */}
        <g transform={`translate(${vp.x},${vp.y}) scale(${vp.scale})`}>
          {/*
            land-clip must be INSIDE this group so its coordinate system
            matches the (untransformed) map paths that reference it.
          */}
          <defs>
            <clipPath id="land-clip">
              <path d={LAND_PATH} />
            </clipPath>
            {/* Fog clip = union of all currently-fogged territory shapes (recomputed each render). */}
            {fogActive && (
              <clipPath id="fog-clip">
                {ALL_IDS.filter(isFogged).map((id) => (
                  <path key={`fogclip-${id}`} d={TERRITORY_PATH[id]} />
                ))}
              </clipPath>
            )}
          </defs>

          {/* Coastline glow */}
          <path
            d={LAND_PATH}
            fill={LAND_BASE_COLOR}
            fillOpacity={0.92}
            stroke={LAND_BASE_STROKE}
            strokeWidth={1.4}
            opacity={0.9}
            style={{ pointerEvents: 'none' }}
          />
          <path
            d={LAND_PATH}
            fill="none"
            stroke="#00e5ff"
            strokeWidth={2.5}
            opacity={0.55}
            filter="url(#coast-glow)"
            style={{ pointerEvents: 'none' }}
          />

          {/* Underpaint closes tiny gaps. Owner colour during play; continent colour only in the
              continent-reference view. */}
          <g clipPath="url(#land-clip)" style={{ pointerEvents: 'none' }}>
            {ALL_IDS.map((id) => {
              const fill = showBonusContinents ? territoryTint(id) : (isFogged(id) ? FOG_FILL : ownerColor(id));
              return (
                <path
                  key={`underpaint-${id}`}
                  d={TERRITORY_PATH[id]}
                  fill={fill}
                  stroke={fill}
                  strokeWidth={1.4}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              );
            })}
          </g>

          {/* Territory fills — OWNER colour during play; CONTINENT colour only in the continent view. */}
          {ALL_IDS.map((id) => {
            const owner = state.owner[id];
            const fogged = isFogged(id);

            const isSelected    = id === selected;
            const isTarget      = validTargets.has(id);
            const isHoverTarget = hoverTargets.has(id);
            const isHovered     = id === hovered;

            const baseFill = showBonusContinents ? territoryTint(id) : (owner ? ownerColor(id) : NEUTRAL_COLOR);
            let fill = (!showBonusContinents && fogged) ? FOG_FILL : baseFill;
            if (!fogged && (isHovered || isHoverTarget)) fill = lighten(fill, 0.14);
            if (!fogged && isSelected)                   fill = lighten(fill, 0.20);

            let stroke = 'none';
            let strokeWidth = 0.8;
            let dash: string | undefined;
            let pulse = false;
            let filter: string | undefined;

            if (isSelected)        { stroke = '#ffd23f'; strokeWidth = 3; filter = 'url(#glow-sel)'; }
            else if (isTarget)     { stroke = '#ff7b1a'; strokeWidth = 2.4; dash = '6 4'; pulse = true; filter = 'url(#glow-target)'; }
            else if (isHoverTarget){ stroke = '#ffb060'; strokeWidth = 2; dash = '4 4'; }

            return (
              <path
                key={id}
                d={TERRITORY_PATH[id]}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                fillOpacity={1}
                clipPath="url(#land-clip)"
                {...(dash   ? { strokeDasharray: dash } : {})}
                {...(filter ? { filter }                : {})}
                className={pulse ? 'target-dash' : undefined}
                style={{ cursor: 'pointer', transition: 'fill .12s' }}
                onClick={() => { if (!didMoveRef.current) onTerritoryClick(id); }}
                onMouseEnter={() => { if (!dragRef.current) onHover(id); }}
                onMouseLeave={() => { if (!dragRef.current) onHover(null); }}
              >
                <title>{state.map.territories[id]?.name ?? id}</title>
              </path>
            );
          })}

          {/* Blizzard ice overlay — semi-transparent blue tint on frozen territories. */}
          {state.frozenTerritories && ALL_IDS.filter((id) => state.frozenTerritories![id]).map((id) => (
            <path
              key={`ice-${id}`}
              d={TERRITORY_PATH[id]}
              fill="rgba(147,210,255,0.38)"
              stroke="#a8d8ff"
              strokeWidth={1.4}
              strokeLinejoin="round"
              clipPath="url(#land-clip)"
              style={{ pointerEvents: 'none' }}
            />
          ))}

          {/* Each territory's dark outline — separates neighbouring territories. Skip selected/target
              so their gold/orange highlight stays crisp. */}
          <g clipPath="url(#land-clip)" style={{ pointerEvents: 'none' }}>
            {ALL_IDS.map((id) => {
              if (id === selected || validTargets.has(id) || hoverTargets.has(id)) return null;
              return (
                <path
                  key={`border-${id}`}
                  d={TERRITORY_PATH[id]}
                  fill="none"
                  stroke={TERRITORY_BORDER}
                  strokeWidth={1.8}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              );
            })}
          </g>

          {/* Fog-of-war bank — drifting cloud layers clipped to the union of fogged territories.
              A near-opaque dark base hides ownership; two tinted noise layers drift across it. */}
          {fogActive && !showBonusContinents && (
            <g clipPath="url(#fog-clip)" style={{ pointerEvents: 'none' }}>
              <rect x={-60} y={-60} width={MAP_W + 120} height={MAP_H + 120} fill={FOG_FILL} opacity={0.97} />
              <rect x={-60} y={-60} width={MAP_W + 120} height={MAP_H + 120}
                filter="url(#fog-cloud-a)" opacity={0.6}>
                <animateTransform attributeName="transform" type="translate"
                  values="0 0; 26 -14; 0 0" dur="70s" repeatCount="indefinite" />
              </rect>
              <rect x={-60} y={-60} width={MAP_W + 120} height={MAP_H + 120}
                filter="url(#fog-cloud-b)" opacity={0.45}>
                <animateTransform attributeName="transform" type="translate"
                  values="0 0; -32 18; 0 0" dur="95s" repeatCount="indefinite" />
              </rect>
            </g>
          )}

          {/* Connectors — beaded dotted bridge across the gap between adjacent shapes that don't
              touch (sea routes). Spans nearest edge points so it never crosses other land. Touching
              neighbours need none; the dateline wrap uses the edge stubs below. */}
          {!showBonusContinents && GAP_CONNECTORS.map((c, i) => {
            let d: string;
            if (c.c) {
              const mx = (c.x1 + c.x2) / 2, my = (c.y1 + c.y2) / 2;
              const dx = c.x2 - c.x1, dy = c.y2 - c.y1, len = Math.hypot(dx, dy) || 1;
              const cx = mx + (-dy / len) * c.c, cy = my + (dx / len) * c.c;
              d = `M${c.x1} ${c.y1} Q${cx} ${cy} ${c.x2} ${c.y2}`;
            } else {
              d = `M${c.x1} ${c.y1} L${c.x2} ${c.y2}`;
            }
            return (
              <g key={`adj-${i}`} style={{ pointerEvents: 'none' }}>
                <path
                  d={d}
                  fill="none"
                  stroke="#eef5fc" strokeWidth={3.4 * invScale} strokeDasharray={`${0.5 * invScale} ${8 * invScale}`}
                  strokeLinecap="round" opacity={0.92}
                />
                {/* White connection dots where the route meets each territory */}
                <circle cx={c.x1} cy={c.y1} r={4 * invScale} fill="#ffffff" stroke="rgba(6,14,26,0.55)" strokeWidth={invScale} />
                <circle cx={c.x2} cy={c.y2} r={4 * invScale} fill="#ffffff" stroke="rgba(6,14,26,0.55)" strokeWidth={invScale} />
              </g>
            );
          })}

          {/* Portal pairs — glowing wormhole lines between non-adjacent territories. */}
          {state.portals && state.portals.map(([a, b], i) => {
            const pa = TERRITORY_CENTROID[a];
            const pb = TERRITORY_CENTROID[b];
            if (!pa || !pb) return null;
            return (
              <g key={`portal-${i}`} style={{ pointerEvents: 'none' }}>
                <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                  stroke="#a855f7" strokeWidth={5 * invScale} opacity={0.28} strokeLinecap="round" />
                <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                  stroke="#e879f9" strokeWidth={1.6 * invScale} strokeDasharray={`${5 * invScale} ${7 * invScale}`} opacity={0.88} strokeLinecap="round" />
                <circle cx={pa.x} cy={pa.y} r={5 * invScale} fill="#e879f9" stroke="rgba(6,14,26,0.6)" strokeWidth={1.2 * invScale} />
                <circle cx={pb.x} cy={pb.y} r={5 * invScale} fill="#e879f9" stroke="rgba(6,14,26,0.6)" strokeWidth={1.2 * invScale} />
              </g>
            );
          })}

          {/* Dateline stubs (Alaska ↔ Kamchatka) — also hidden in the continent-colour view. */}
          {!showBonusContinents && WRAP_STUBS.map((s) => {
            const p = TERRITORY_CENTROID[s.from];
            if (!p) return null;
            return (
              <g key={s.from}>
                <line
                  x1={p.x} y1={p.y} x2={s.toEdge} y2={p.y}
                  stroke="#4a90c8" strokeWidth={1.2 * invScale} strokeDasharray={`${5 * invScale} ${5 * invScale}`} opacity={0.6}
                />
                <circle cx={p.x} cy={p.y} r={3 * invScale} fill="#c8e0f0" opacity={0.75} />
                <text
                  x={s.toEdge < MAP_W / 2 ? s.toEdge + 5 : s.toEdge - 5}
                  y={p.y + 4}
                  fill="#6ab0e0" fontSize={13 * invScale}
                  textAnchor={s.toEdge < MAP_W / 2 ? 'start' : 'end'}
                  style={{ pointerEvents: 'none' }}
                >{s.label}</text>
              </g>
            );
          })}

          {/* Territory name labels — hidden in the zoomed-out overview (where 42 names are just
              clutter); they fade in once you zoom in, and are counter-scaled to a constant size. */}
          {vp.scale >= 1.7 && ALL_IDS.map((id) => {
            const cen = TERRITORY_CENTROID[id] ?? { x: 0, y: 0 };
            const { x, y } = cen;
            const name = state.map.territories[id]?.name ?? id;
            const short = name.length > 13 ? name.slice(0, 12) + '…' : name;
            const k = 1 / vp.scale; // counter-scale so text stays a constant on-screen size
            // Sit the name above the centroid, but never beyond the territory's interior clearance
            // (its inscribed-circle radius) so small territories keep their label on-shape.
            const labelOff = Math.min(16, ((cen as { r?: number }).r ?? Infinity) * 0.7);
            return (
              <text
                key={`label-${id}`}
                x={x} y={y - labelOff}
                textAnchor="middle" dominantBaseline="central"
                fontSize={9 * k} fontWeight={700}
                fill="#e8f0f8"
                fontFamily="system-ui, sans-serif"
                opacity={Math.min(1, (vp.scale - 1.7) / 0.5)}
                style={{
                  pointerEvents: 'none',
                  paintOrder: 'stroke',
                  stroke: 'rgba(6,12,24,0.9)',
                  strokeWidth: 2.4 * k,
                  strokeLinejoin: 'round',
                  letterSpacing: 0.3 * k,
                }}
              >{short}</text>
            );
          })}

          {/* Continent labels — name + a coin showing the +N bonus, centred on each continent. */}
          {continentOverlay.map((c) => {
            const tint = TINT[c.id] ?? NEUTRAL_COLOR;
            const pts = c.territories.map((t) => TERRITORY_CENTROID[t]).filter(Boolean) as { x: number; y: number }[];
            const cx = pts.reduce((s, p) => s + p.x, 0) / Math.max(1, pts.length);
            const cy = pts.reduce((s, p) => s + p.y, 0) / Math.max(1, pts.length);
            return (
              <g key={`bonus-badge-${c.id}`} style={{ pointerEvents: 'none' }}>
                {/* Continent name above the bonus coin */}
                <text x={cx} y={cy - 28} textAnchor="middle" dominantBaseline="central"
                  fontSize={13} fontWeight={800} fill="#f3f6fb"
                  fontFamily="system-ui, sans-serif"
                  style={{ paintOrder: 'stroke', stroke: 'rgba(6,12,24,0.9)', strokeWidth: 3.4, letterSpacing: 0.6 }}>
                  {c.name}
                </text>
                <circle cx={cx + 1} cy={cy + 2} r={18} fill="rgba(0,0,0,0.4)" />
                <circle cx={cx} cy={cy} r={18} fill="rgba(8,14,24,0.9)" stroke={tint} strokeWidth={2.6} />
                <text x={cx} y={cy + 0.5} textAnchor="middle" dominantBaseline="central"
                  fontSize={16} fontWeight={800} fill="#7ed98b"
                  fontFamily="system-ui, sans-serif"
                  style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 2 }}>
                  +{c.bonus}
                </text>
              </g>
            );
          })}

          {/* Flat army tokens — solid owner-coloured disc, thin white ring, crisp number (modern
              Classic look). Hidden while the continent-colour view is on. */}
          {!showBonusContinents && ALL_IDS.map((id) => {
            const { x, y } = TERRITORY_CENTROID[id] ?? { x: 0, y: 0 };
            const owner = state.owner[id];
            const armies = state.armies[id] ?? 0;
            const fogged = isFogged(id);
            const r = armies >= 100 ? 13 : armies >= 10 ? 11.5 : 10.5;
            // Fogged tokens are neutral discs — no owner colour, so ownership stays unpredictable.
            const coinColor = fogged ? NEUTRAL_COLOR : (owner ? (playerColors[owner] ?? NEUTRAL_COLOR) : NEUTRAL_COLOR);
            const isCapital = !fogged && (capitalSet?.has(id) ?? false);

            return (
              // Coin geometry is drawn relative to the centroid origin and scaled by coinK, so the
              // imperial board can shrink/counter-scale coins without re-deriving every coordinate.
              <g key={`coin-${id}`} style={{ pointerEvents: 'none' }}
                transform={`translate(${x},${y}) scale(${coinK})`}>
                <circle cx={0} cy={1.5} r={r} fill="rgba(0,0,0,0.38)" />
                {isCapital && (
                  <circle cx={0} cy={0} r={r + 3} fill="none"
                    stroke="#ffd700" strokeWidth={1.8} strokeDasharray="3 2" opacity={0.95}
                  />
                )}
                <circle cx={0} cy={0} r={r} fill={coinColor} stroke="#f4f8fc" strokeWidth={1.7} />
                <circle cx={0} cy={0} r={r - 1.6} fill="none" stroke={darken(coinColor, 0.4)} strokeWidth={0.9} strokeOpacity={0.6} />
                <text
                  x={0} y={0.5}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={fogged ? 11 : (armies >= 100 ? 9 : armies >= 10 ? 10.5 : 11.5)}
                  fontWeight={800}
                  fill="#ffffff"
                  fontFamily="system-ui, sans-serif"
                  style={{
                    paintOrder: 'stroke',
                    stroke: 'rgba(0,0,0,0.45)',
                    strokeWidth: 1.4,
                  }}
                >{fogged ? '?' : armies}</text>
              </g>
            );
          })}
          {/* Capital star labels — gold ★ above the coin, only in Capitals mode (hidden under fog) */}
          {!showBonusContinents && capitalSet && ALL_IDS.map((id) => {
            if (!capitalSet.has(id) || isFogged(id)) return null;
            const { x, y } = TERRITORY_CENTROID[id] ?? { x: 0, y: 0 };
            return (
              <text key={`cap-${id}`} x={x} y={y - 26 * coinK}
                textAnchor="middle" dominantBaseline="central"
                fontSize={11 * coinK} style={{
                  pointerEvents: 'none',
                  paintOrder: 'stroke',
                  stroke: 'rgba(0,0,0,0.75)',
                  strokeWidth: 2,
                }}
                fill="#ffd700"
              >★</text>
            );
          })}
        </g>
      </svg>

      {/* Reset view button — appears when the user has panned/zoomed */}
      {isOffset && (
        <button
          onClick={() => setVp({ x: 0, y: TOP_PAD, scale: 1 })}
          title="Reset map view (double-click)"
          style={{
            position: 'absolute',
            top: 14, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(8,16,32,0.90)',
            color: '#8a9ab0',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 11, fontWeight: 600,
            cursor: 'pointer',
            zIndex: 5,
            letterSpacing: 0.3,
          }}
        >⌖ Reset View</button>
      )}
    </div>
  );
});
