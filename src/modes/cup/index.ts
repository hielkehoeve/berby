/**
 * Glam Cup: the three-lap race against Vix with item boxes and four power-ups (Lipstick Rocket,
 * Kiss Missile, Glitter Bomb, Heart Shield). The engine drives both karts; this session runs
 * the item simulation (cup.ts) on top, draws it (visuals.ts) and turns its events into sounds
 * and HUD lines. Feel constants: tuning.ts.
 */
import type { GameMode, ModeHud, ModeSession } from '../types';
import type { Sfx } from '../../audio/audio';
import { formatLapTime } from '../../ui/format';
import { createCupState, resetCupState, stepCup, useItem, type CupEvent, type Side } from './cup';
import { ITEMS, type ItemKind } from './items';
import { CUP_TUNING } from './tuning';
import { createCupVisuals } from './visuals';

export const CUP_MODE: GameMode = {
  info: {
    id: 'cup',
    name: 'Glam Cup',
    icon: '💄',
    tagline: 'Race Vix with power-ups: rockets, glitter bombs, shields.',
  },
  create(ctx) {
    const state = createCupState(ctx.track);
    const visuals = createCupVisuals(ctx.scene, state);
    const hud: ModeHud = { status: undefined, action: undefined };
    let statusUntil = -1;
    let statusRank = 0;

    const say = (text: string, rank: number, time: number) => {
      // A hit line (rank 3) is not hidden by a pickup or a use within its time.
      if (time < statusUntil && statusRank === 3 && rank < 3) return;
      hud.status = text;
      statusUntil = time + CUP_TUNING.statusSeconds;
      statusRank = rank;
    };
    const play = (name: Sfx, who: Side) => ctx.audio.sfx(name, who === 'player' ? 1 : 0.85);

    const handle = (e: CupEvent, time: number) => {
      switch (e.kind) {
        case 'pickup':
          if (e.who === 'player') {
            play('pickup', e.who);
            say(`${ITEMS[e.item].name}!`, 1, time);
          }
          break;
        case 'use':
          play(USE_SFX[e.item], e.who);
          say(e.who === 'player' ? USE_LINES.player[e.item] : USE_LINES.rival[e.item], 2, time);
          break;
        case 'fizzle':
          if (e.who === 'player') say('Missile fizzled', 2, time);
          break;
        case 'spin':
          play('hit', e.who);
          say(e.who === 'player' ? 'Spun out!' : 'Vix spun out!', 3, time);
          break;
        case 'shieldBreak':
          play('warn', e.who);
          say(e.who === 'player' ? 'Shield broke!' : "Vix's shield broke!", 3, time);
          break;
      }
    };

    const session: ModeSession = {
      setup: () => ({ laps: ctx.track.definition.laps, rival: 'ai' }),
      startRun() {
        resetCupState(state);
        hud.status = undefined;
        hud.action = undefined;
        statusUntil = -1;
        statusRank = 0;
      },
      step(race, _input, dt) {
        stepCup(state, race, dt);
        for (const e of state.events) handle(e, race.time);
      },
      action(race) {
        // step() already handled this step's events; only the use's own events are new.
        state.events.length = 0;
        if (!useItem(state, race, 'player')) return;
        for (const e of state.events) handle(e, race.time);
        state.events.length = 0;
      },
      isOver: () => false,
      hud(race) {
        const held = state.player.held;
        hud.action = held === null ? undefined : USE_LABELS[held];
        if (race.time >= statusUntil) hud.status = undefined;
        return hud;
      },
      render(race, _dt, elapsed) {
        visuals.update(state, race, elapsed);
      },
      finish(race) {
        const won = race.winner === 'player';
        const best = race.bestLap();
        return {
          kind: 'results',
          headline: won ? 'You won!' : 'Vix won',
          won,
          rows: [
            ['Total time', formatLapTime(race.totalTime())],
            ['Best lap', best === null ? '--' : formatLapTime(best)],
            ['Items used', String(state.player.itemsUsed)],
            ['Hits landed', String(state.player.hitsLanded)],
          ],
        };
      },
      dispose() {
        visuals.dispose();
      },
    };
    return session;
  },
};

const USE_LABELS: Record<ItemKind, string> = {
  rocket: `USE ${ITEMS.rocket.emoji}`,
  missile: `USE ${ITEMS.missile.emoji}`,
  bomb: `USE ${ITEMS.bomb.emoji}`,
  shield: `USE ${ITEMS.shield.emoji}`,
};

const USE_SFX: Record<ItemKind, Sfx> = { rocket: 'boost', missile: 'tick', bomb: 'tick', shield: 'bonus' };

const USE_LINES: Record<Side, Record<ItemKind, string>> = {
  player: { rocket: 'Boost!', missile: 'Missile away!', bomb: 'Bomb dropped', shield: 'Shield up' },
  rival: {
    rocket: 'Vix boosted!',
    missile: 'Vix fired a missile!',
    bomb: 'Vix dropped a bomb!',
    shield: 'Vix shielded',
  },
};
