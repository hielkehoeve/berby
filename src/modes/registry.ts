/** Every game mode, in menu order. Each mode lives in its own folder. */
import type { GameMode, ModeId } from './types';
import { RACE_MODE } from './race';
import { CUP_MODE } from './cup';
import { GHOST_MODE } from './ghost';
import { RUSH_MODE } from './rush';
import { TIDE_MODE } from './tide';
import { HOTSEAT_MODE } from './hotseat';

export const MODES: readonly GameMode[] = [RACE_MODE, CUP_MODE, GHOST_MODE, RUSH_MODE, TIDE_MODE, HOTSEAT_MODE];

export function modeById(id: ModeId): GameMode {
  const mode = MODES.find((m) => m.info.id === id);
  if (!mode) throw new Error(`Unknown mode: ${id}`);
  return mode;
}
