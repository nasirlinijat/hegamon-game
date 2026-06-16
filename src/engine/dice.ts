export type Rng = () => number; // returns a value in [0, 1)

export function rollDie(rng: Rng): number {
  return Math.floor(rng() * 6) + 1;
}

/** Returns n unsorted raw die rolls. */
export function rollDice(n: number, rng: Rng): number[] {
  return Array.from({ length: n }, () => rollDie(rng));
}
