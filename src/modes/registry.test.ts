import { describe, expect, it } from 'vitest';
import { MODES, modeById } from './registry';

describe('mode registry', () => {
  it('has six modes with unique ids and complete cards', () => {
    expect(MODES).toHaveLength(6);
    const ids = MODES.map((m) => m.info.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { info } of MODES) {
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.name.split(' ').length).toBeLessThanOrEqual(2);
      expect(info.tagline.length).toBeGreaterThan(0);
      expect(info.tagline.length).toBeLessThanOrEqual(60);
      expect(info.icon.length).toBeGreaterThan(0);
    }
  });

  it('looks modes up by id and rejects unknown ids', () => {
    expect(modeById('race').info.name).toBe('Race Vix');
    expect(() => modeById('nope' as never)).toThrow();
  });
});
