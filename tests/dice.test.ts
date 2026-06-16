import { describe, it, expect } from 'vitest';
import { rollDie, rollDice } from '../src/engine/dice';

// A deterministic rng sequence.
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i++ % values.length];
    return v ?? 0;
  };
}

describe('dice', () => {
  it('rollDie produces values 1–6 inclusive', () => {
    // Cover all 6 faces by feeding 0.0, 0.167, 0.333, 0.5, 0.667, 0.833
    const rng = seqRng([0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]);
    const results = Array.from({ length: 6 }, () => rollDie(rng));
    expect(results).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('rollDice returns n unsorted raw rolls', () => {
    // Feed values that will produce [4, 1, 6] — NOT sorted.
    const rng = seqRng([3 / 6, 0, 5 / 6]);
    expect(rollDice(3, rng)).toEqual([4, 1, 6]);
  });
});
