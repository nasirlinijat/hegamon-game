import { type DiceMode } from './modes';

export type Rng = () => number; // returns a value in [0, 1)

export function rollDie(rng: Rng): number {
  return Math.floor(rng() * 6) + 1;
}

/** Returns n unsorted raw die rolls (uniform random). */
export function rollDice(n: number, rng: Rng): number[] {
  return Array.from({ length: n }, () => rollDie(rng));
}

/**
 * Balanced die: returns the median of 3 independent draws, reducing variance.
 * Extreme values (1, 6) become far less likely; the expected value stays 3.5.
 * High-advantage attacks win more reliably; low-advantage attacks fail more reliably.
 */
export function rollDieBalanced(rng: Rng): number {
  const a = rollDie(rng);
  const b = rollDie(rng);
  const c = rollDie(rng);
  const sorted = [a, b, c].sort((x, y) => x - y);
  return sorted[1]!; // median
}

/** Returns n balanced die rolls (each die is the median of 3 draws). */
export function rollDiceBalanced(n: number, rng: Rng): number[] {
  return Array.from({ length: n }, () => rollDieBalanced(rng));
}

/** Dispatch to the appropriate roll function based on config. */
export function rollDiceForMode(n: number, rng: Rng, mode: DiceMode): number[] {
  return mode === 'balanced' ? rollDiceBalanced(n, rng) : rollDice(n, rng);
}
