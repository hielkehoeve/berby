/** Glam Cup: a race against Vix with item boxes and power-ups. STUB: the agent building the mode replaces this file. */
import type { GameMode, ModeSession } from '../types';
import { createRaceSession } from '../race';

export const CUP_MODE: GameMode = {
  info: {
    id: 'cup',
    name: 'Glam Cup',
    icon: '💄',
    tagline: 'Race Vix with power-ups: rockets, glitter bombs, shields.',
  },
  create(ctx) {
    const base = createRaceSession(ctx.track.definition.laps);
    const session: ModeSession = {
      ...base,
      hud: () => ({ status: 'Stub: items coming', action: 'USE' }),
      action() {
        ctx.audio.sfx('boost');
      },
    };
    return session;
  },
};
