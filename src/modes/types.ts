/**
 * The contract between the engine (src/game/game.ts) and the game modes (src/modes/<id>/).
 *
 * A mode is picked on the main menu. The engine creates a session and runs it as one or more
 * runs: each run is a countdown, a race on the Malibu track with the player's kart (and the
 * rival's, depending on the setup) and an end: the player completes the laps, or the mode ends
 * the run itself. The session says what the HUD shows, what happens each step, and what the end
 * looks like: a results card, or an intermission followed by another run (pass the phone).
 *
 * Modes own everything in their folder and nothing outside it. They may read every kart state
 * and adjust the player's or the rival's (a boost raises the speed, a hit spins the heading),
 * add objects to the scene in create() and remove them in dispose(), and keep their bests in
 * localStorage through src/game/storage.ts. They never touch the DOM: the HUD and the cards are
 * described through ModeHud and ModeFinish.
 */
import type * as THREE from 'three';
import type { KartInput, KartState, Track } from '../shared/types';
import type { Race } from '../game/race';
import type { GameAudio } from '../audio/audio';

export type ModeId = 'race' | 'cup' | 'ghost' | 'rush' | 'tide' | 'hotseat';

export interface ModeInfo {
  id: ModeId;
  /** Card title, two words at most. */
  name: string;
  /** One line under the title: what you do and how it ends. Keep it under 60 characters. */
  tagline: string;
  /** One emoji for the card. */
  icon: string;
}

/** Who drives the rival kart during a run. */
export type RivalRole =
  /** Vix races, driven by the AI, and collides with the player. */
  | 'ai'
  /** The kart is placed by the session each frame (ModeSession.ghost) and drawn translucent; no collisions. */
  | 'ghost'
  /** The kart is hidden. */
  | 'none';

export interface RunSetup {
  /** Laps in this run. UNLIMITED_LAPS (src/game/race.ts) for runs the mode ends itself. */
  laps: number;
  rival: RivalRole;
}

/** What the HUD shows this frame. Every field is optional; the default is position / timer / lap. */
export interface ModeHud {
  /** Replace the three pills, left to right. */
  left?: string;
  center?: string;
  right?: string;
  /** A short line under the pills (a pickup, a warning, a bonus). Empty or undefined hides it. */
  status?: string;
  /** Label of the action button on the right edge; undefined hides the button. */
  action?: string;
}

export type ModeFinish =
  | {
      kind: 'results';
      headline: string;
      /** Colours the headline: true pink (a win), false lavender (a loss), null neutral. */
      won: boolean | null;
      /** Label / value rows on the card, e.g. ['Best lap', '0:56.80']. */
      rows: [string, string][];
      /** Label of the primary button, which starts a fresh session of the mode. Default 'Race again'. */
      again?: string;
    }
  | {
      kind: 'intermission';
      headline: string;
      lines: string[];
      /** Label of the button that starts the next run of the same session. */
      button: string;
    };

export interface ModeContext {
  track: Track;
  /** Add mode objects here in create(); remove them in dispose(). */
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  audio: GameAudio;
}

export interface ModeSession {
  /** Before run `run` (1-based) starts: how to set up the race. */
  setup(run: number): RunSetup;
  /** The race for run `run` is on the grid; the countdown starts now. */
  startRun(race: Race, run: number): void;
  /** One fixed step while racing, after the karts moved and the progress was updated. */
  step(race: Race, input: KartInput, dt: number): void;
  /** True ends the run now (a run also ends when the player completes the laps). */
  isOver(race: Race): boolean;
  hud(race: Race): ModeHud;
  /** Every frame of a run: countdown, racing and the coast after the finish. */
  render(race: Race, dt: number, elapsed: number): void;
  /** The action button or key was pressed (once per press). */
  action?(race: Race): void;
  /** For rival 'ghost': the ghost kart's state this frame, or null to hide it. */
  ghost?(race: Race): KartState | null;
  /** The run ended and the kart coasted for a moment: what to show. Called once per run. */
  finish(race: Race): ModeFinish;
  /** The session is over (back to the menu, or a fresh session): remove scene objects, stop sounds. */
  dispose(): void;
}

export interface GameMode {
  info: ModeInfo;
  create(ctx: ModeContext): ModeSession;
}
