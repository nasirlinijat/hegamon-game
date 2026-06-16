import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs a trivial test green', () => {
    expect(1 + 1).toBe(2);
  });
});
