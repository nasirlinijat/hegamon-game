import { describe, it, expect } from 'vitest';
import { rollDie, rollDice, rollDiceBalanced, rollDiceForMode } from '../src/engine/dice';

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

describe('rollDiceBalanced', () => {
  it('returns the median of 3 draws per die', () => {
    // Draws per die: [0.0→1, 0.99→6, 0.5→4] → sorted [1,4,6] → median = 4.
    // Two dice consume 6 calls total from the repeating sequence.
    const rng = seqRng([0.0, 0.99, 0.5]);
    expect(rollDiceBalanced(2, rng)).toEqual([4, 4]);
  });

  it('a lone extreme roll is washed out by two mid values', () => {
    // Draws: [0.0→1, 0.5→4, 0.5→4] → sorted [1,4,4] → median = 4 (not 1).
    const rng = seqRng([0.0, 0.5, 0.5]);
    const [die] = rollDiceBalanced(1, rng);
    expect(die).toBe(4);
  });

  it('produces fewer extreme values (1 or 6) than uniform random over the same sequence', () => {
    // Build a shared RNG sequence and compare extreme-value counts.
    // With median-of-3, P(result=1) ≈ (1/6)³ ≈ 0.5%; with uniform P(result=1) = 16.7%.
    const seq = Array.from({ length: 600 }, (_, i) => (i % 6) / 6 + 0.001);
    let randomExtremes = 0;
    let balancedExtremes = 0;
    const N = 200;
    for (let j = 0; j < N; j++) {
      const rv = rollDice(1, seqRng(seq))[0]!;
      if (rv === 1 || rv === 6) randomExtremes++;
      const bv = rollDiceBalanced(1, seqRng(seq))[0]!;
      if (bv === 1 || bv === 6) balancedExtremes++;
    }
    expect(balancedExtremes).toBeLessThan(randomExtremes);
  });
});

describe('rollDiceForMode', () => {
  it('random mode matches rollDice with the same rng sequence', () => {
    const seq = [3 / 6, 0, 5 / 6];
    expect(rollDiceForMode(3, seqRng(seq), 'random')).toEqual(rollDice(3, seqRng(seq)));
  });

  it('balanced mode matches rollDiceBalanced with the same rng sequence', () => {
    const seq = [0.0, 0.99, 0.5];
    expect(rollDiceForMode(2, seqRng(seq), 'balanced')).toEqual(rollDiceBalanced(2, seqRng(seq)));
  });
});
