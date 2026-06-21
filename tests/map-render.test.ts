import { describe, it, expect } from 'vitest';
import { getMapRender } from '../src/ui/map-render';
import { IMPERIAL_MAP } from '../src/engine/imperial-map';
import { ALL_TERRITORY_IDS } from '../src/engine/map';

describe('map-render bundles', () => {
  it('classic bundle has 42 territories and dateline wrap stubs', () => {
    const r = getMapRender('classic');
    expect(r.ALL_IDS.length).toBe(ALL_TERRITORY_IDS.length);
    expect(r.WRAP_STUBS.length).toBe(2);
    expect(r.MAP_W).toBe(1280);
    expect(r.MAP_H).toBe(720);
  });

  it('imperial bundle has 79 territories and a path for each', () => {
    const r = getMapRender('imperial');
    expect(r.ALL_IDS.length).toBe(IMPERIAL_MAP.allTerritoryIds.length);
    for (const id of IMPERIAL_MAP.allTerritoryIds) {
      expect(r.TERRITORY_PATH[id]).toBeTruthy();
      expect(r.TERRITORY_CENTROID[id]).toBeTruthy();
    }
  });

  it('imperial connectors stay within the map and are short sea-routes', () => {
    const r = getMapRender('imperial');
    expect(r.GAP_CONNECTORS.length).toBeGreaterThan(0);
    for (const c of r.GAP_CONNECTORS) {
      for (const v of [c.x1, c.x2]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1280); }
      for (const v of [c.y1, c.y2]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(720); }
      // A connector spanning a huge distance signals a projection/geometry bug.
      const len = Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
      expect(len).toBeLessThan(220);
    }
  });

  it('unknown map id falls back to the classic bundle', () => {
    expect(getMapRender('nope').ALL_IDS.length).toBe(ALL_TERRITORY_IDS.length);
  });
});
