/**
 * The game: the main menu, the mode sessions and their runs (countdown → racing → finished),
 * and the glue between the engine, input, UI, audio, sim, graphics and mode modules.
 */
import * as THREE from 'three';
import type { KartInput } from '../shared/types';
import { PALETTE } from '../shared/palette';
import { buildTrack } from '../sim/track';
import { rivalInput } from '../sim/rival';
import { PLAYER_TUNING } from '../sim/tuning';
import { MALIBU } from '../tracks/malibu';
import { buildWorld } from '../graphics/world';
import { createKartView } from '../graphics/kart-mesh';
import { createChaseCamera, kartOcclusion, snapChaseCamera, updateChaseCamera } from '../graphics/camera';
import { createRenderer } from '../engine/renderer';
import { createLoop } from '../engine/loop';
import { createControls } from '../input/controls';
import { createUi } from '../ui';
import { createAudio } from '../audio/audio';
import { createRace, withLaps, type Race } from './race';
import { enterLandscapeFullscreen } from './fullscreen';
import { MODES, modeById } from '../modes/registry';
import type { GameMode, ModeContext, ModeFinish, ModeId, ModeSession, RunSetup } from '../modes/types';

export type Phase = 'menu' | 'countdown' | 'racing' | 'finished';

/** Seconds the karts sit frozen while 3-2-1 plays. */
export const COUNTDOWN_SECONDS = 3;
/** How long the GO banner stays up once the race starts. */
const GO_BANNER_SECONDS = 0.9;
/** Pause between the end of a run and the results card. */
const RESULTS_DELAY_SECONDS = 1.4;
/** Speed that counts as "full revs" for the engine sound, m/s: the kart's own top speed. */
const ENGINE_TOP_SPEED = PLAYER_TUNING.topSpeed;
/** How far a ghost kart fades (1 = the full fade of GHOST in kart-mesh.ts). */
const GHOST_AMOUNT = 0.7;

export interface Game {
  start(): void;
  readonly phase: Phase;
}

export function createGame(container: HTMLElement): Game {
  // --- Rendering ---
  const gfx = createRenderer(container);
  const scene = new THREE.Scene();
  const track = buildTrack(MALIBU);
  const world = buildWorld(track);
  scene.add(world.group);
  scene.background = world.background ?? new THREE.Color(PALETTE.cream);
  if (world.fog) scene.fog = world.fog;

  const playerView = createKartView('player');
  const rivalView = createKartView('rival');
  scene.add(playerView.object, rivalView.object);

  const camera = createChaseCamera(gfx.aspect());
  gfx.onResize((w, h) => {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });

  // --- Audio, UI, input ---
  const audio = createAudio();
  const ui = createUi(container, {
    modes: MODES.map((m) => m.info),
    onPick(id) {
      audio.unlock();
      void enterLandscapeFullscreen();
      startMode(id);
    },
    onPrimary() {
      audio.unlock();
      primaryAction();
    },
    onMenu() {
      audio.unlock();
      goToMenu();
    },
    onToggleMute: () => ui.setMuted(audio.toggleMuted()),
  });
  ui.setMuted(audio.isMuted());
  const controls = createControls({
    surface: ui.hud.element,
    brakeButton: ui.hud.brakeButton,
    brakeZone: ui.hud.brakeZone,
    actionButton: ui.hud.actionButton,
  });

  // --- State ---
  let phase: Phase = 'menu';
  let mode: GameMode = MODES[0];
  let session: ModeSession | null = null;
  /** 1-based run within the session (a hot-seat session has one run per player). */
  let run = 0;
  let setup: RunSetup = { laps: track.definition.laps, rival: 'ai' };
  let race: Race = createRace(track);
  /** Race time at which the current run ended. */
  let finishedAt = 0;
  /** What the results card shows, and so what its primary button does. */
  let pending: ModeFinish | null = null;
  const ctx: ModeContext = { track, scene, camera, audio };

  // Compile the translucent variant of the kart shader now, so the first time Vix tailgates and
  // fades there is no hitch mid-race. A long dt on the way back snaps the materials to opaque.
  rivalView.setGhost(1);
  rivalView.update(race.rival, 0.2);
  gfx.renderer.compile(scene, camera);
  rivalView.setGhost(0);
  rivalView.update(race.rival, 5);
  let countdownTime = 0;
  let countdownShown = -1;
  let resultsShown = false;
  let lastPressSeen = -Infinity;
  // Scripted-playtest controls (dev builds only, see installDevHook below).
  const dev = { autopilot: false, override: null as KartInput | null };
  let fpsFrames = 0;
  let fpsTime = 0;
  let fps = 0;

  /** The player's input for this step: autopilot or an override in dev, otherwise the controls. */
  function playerInput(dt: number): KartInput {
    if (dev.autopilot) {
      return rivalInput(race.player, track, { rivalProgress: 0, playerProgress: 0, player: race.rival }, dt);
    }
    return dev.override ?? controls.getInput();
  }

  const hudState = () => ({
    position: race.playerPosition(),
    lap: race.playerProgress.lap,
    laps: race.track.definition.laps,
    time: race.time,
    touch: controls.getTouchState(),
  });

  /** Pick a mode from the menu (or race it again): a fresh session, then its first run. */
  function startMode(id: ModeId) {
    disposeSession();
    mode = modeById(id);
    session = mode.create(ctx);
    run = 0;
    beginRun();
  }

  /** The next run of the current session: a new race on the grid and the countdown. */
  function beginRun() {
    if (!session) return;
    run += 1;
    setup = session.setup(run);
    race = createRace(withLaps(track, setup.laps), { rival: setup.rival === 'ai' });
    session.startRun(race, run);
    phase = 'countdown';
    countdownTime = 0;
    countdownShown = -1;
    resultsShown = false;
    pending = null;
    ui.menu.hide();
    ui.results.hide();
    ui.countdown.hide();
    ui.hud.show();
    ui.hud.revealHints();
    ui.hud.update(hudState(), session.hud(race));
    audio.engine.start();
    playerView.update(race.player, 0);
    rivalView.setGhost(setup.rival === 'ghost' ? GHOST_AMOUNT : 0);
    rivalView.object.visible = setup.rival === 'ai';
    rivalView.update(race.rival, 0);
    // Straight to the grid view; otherwise the camera swoops over from the menu orbit or the finish.
    snapChaseCamera(camera, race.player);
  }

  function primaryAction() {
    if (pending?.kind === 'intermission') beginRun();
    else startMode(mode.info.id);
  }

  function goToMenu() {
    disposeSession();
    phase = 'menu';
    pending = null;
    audio.engine.stop();
    ui.hud.hide();
    ui.results.hide();
    ui.countdown.hide();
    race = createRace(track);
    rivalView.setGhost(0);
    rivalView.object.visible = true;
    playerView.update(race.player, 0);
    rivalView.update(race.rival, 0);
    ui.menu.show();
  }

  function disposeSession() {
    session?.dispose();
    session = null;
  }

  function startRacing() {
    phase = 'racing';
    ui.countdown.show('GO');
    ui.hud.revealHints();
    audio.goTone();
    // Presses during the countdown do not fire on the first step.
    controls.consumeAction();
  }

  function finishRun() {
    phase = 'finished';
    finishedAt = race.time;
    audio.engine.stop();
  }

  function showFinish() {
    if (!session) return;
    resultsShown = true;
    pending = session.finish(race);
    ui.hud.hide();
    if (pending.kind === 'results') {
      audio.resultsSting(pending.won !== false);
      ui.results.show({
        headline: pending.headline,
        tone: pending.won === null ? 'neutral' : pending.won ? 'win' : 'lose',
        rows: pending.rows,
        primary: pending.again ?? 'Race again',
        menu: true,
      });
    } else {
      audio.sfx('bonus');
      ui.results.show({
        headline: pending.headline,
        tone: 'neutral',
        rows: [],
        lines: pending.lines,
        primary: pending.button,
        menu: true,
      });
    }
  }

  // --- Fixed-step simulation ---
  function fixedStep(dt: number) {
    switch (phase) {
      case 'menu':
        break;
      case 'countdown': {
        countdownTime += dt;
        const n = Math.floor(countdownTime);
        if (n !== countdownShown && n < COUNTDOWN_SECONDS) {
          countdownShown = n;
          const value = COUNTDOWN_SECONDS - n;
          ui.countdown.show(String(value));
          audio.countdownBeep(value);
        }
        if (countdownTime >= COUNTDOWN_SECONDS) startRacing();
        break;
      }
      case 'racing': {
        if (!session) break;
        const input = playerInput(dt);
        race.step(input, dt);
        session.step(race, input, dt);
        if (controls.consumeAction()) session.action?.(race);
        if (race.time > GO_BANNER_SECONDS) ui.countdown.hide();
        if (race.finished || session.isOver(race)) finishRun();
        break;
      }
      case 'finished':
        race.coast(dt);
        if (!resultsShown && race.time - finishedAt >= RESULTS_DELAY_SECONDS) showFinish();
        break;
    }
  }

  // --- Per-frame rendering ---
  function render(dt: number, elapsed: number) {
    fpsFrames++;
    fpsTime += dt;
    if (fpsTime >= 1) {
      fps = fpsFrames / fpsTime;
      fpsFrames = 0;
      fpsTime = 0;
    }
    playerView.update(race.player, dt);

    if (phase === 'menu') {
      orbitCamera(elapsed);
      rivalView.update(race.rival, dt);
    } else {
      updateChaseCamera(camera, race.player, dt);
      if (setup.rival === 'ai') {
        rivalView.update(race.rival, dt);
        // A tailgating Vix would otherwise hide the player from the chase camera.
        rivalView.setGhost(kartOcclusion(camera, race.player, race.rival));
      } else if (setup.rival === 'ghost') {
        const ghost = session?.ghost?.(race) ?? null;
        rivalView.object.visible = ghost !== null;
        if (ghost) rivalView.update(ghost, dt);
      }
      session?.render(race, dt, elapsed);
    }

    world.update(dt, elapsed, race.player.position);

    if (phase !== 'menu') {
      const press = controls.lastPressTime();
      if (press !== lastPressSeen) {
        lastPressSeen = press;
        ui.hud.revealHints();
      }
      ui.hud.update(hudState(), session?.hud(race));
      audio.engine.set(Math.abs(race.player.speed) / ENGINE_TOP_SPEED, race.player.onRoad);
    }

    gfx.renderer.render(scene, camera);
  }

  /** A slow orbit around the grid behind the main menu. */
  function orbitCamera(elapsed: number) {
    const target = race.player.position;
    const angle = race.player.heading + Math.PI + elapsed * 0.18;
    const radius = 11;
    camera.position.set(target.x - Math.sin(angle) * radius, 3.2, target.z - Math.cos(angle) * radius);
    camera.lookAt(target.x, 0.8, target.z);
  }

  const loop = createLoop(
    {
      fixedStep,
      render,
      onPause: () => audio.suspend(),
      onResume: () => audio.resume(),
    },
    { step: 1 / 60, maxSteps: 5 },
  );

  /**
   * window.__berby lets a scripted playtest (.claude/skills/berby-playtest) start any mode, drive
   * the player with the rival AI or a fixed input, press the action button, and read the race
   * state and frame rate.
   */
  function installDevHook() {
    const hook = {
      get phase() {
        return phase;
      },
      /** Start a mode without the fullscreen request. */
      play(id: ModeId = 'race') {
        audio.unlock();
        startMode(id);
      },
      /** The primary button of the results card (race again / next run). */
      primary: primaryAction,
      menu: goToMenu,
      autopilot(on: boolean) {
        dev.autopilot = on;
      },
      input(value: Partial<KartInput> | null) {
        dev.override = value
          ? { steer: value.steer ?? 0, throttle: value.throttle ?? (value.brake ? 0 : 1), brake: value.brake ?? 0 }
          : null;
      },
      /** Press the mode action (use an item) on the next step. */
      action() {
        ui.hud.actionButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
      },
      state: () => ({
        phase,
        mode: mode.info.id,
        run,
        time: race.time,
        lap: race.playerProgress.lap,
        position: race.playerPosition(),
        playerSpeed: race.player.speed,
        playerOnRoad: race.player.onRoad,
        rivalLap: race.rivalProgress.lap,
        winner: race.winner,
        fps,
        /** What the mode shows on the HUD right now. */
        hud: session?.hud(race) ?? null,
        /** What the results card shows once the run ended (null before). */
        finish: pending,
        /** How much Vix is blocking the camera's view of the player right now (0..1). */
        occlusion: kartOcclusion(camera, race.player, race.rival),
        // World positions, to check which object the camera follows and where each view sits.
        positions: {
          player: { ...race.player.position },
          rival: { ...race.rival.position },
          playerView: { x: playerView.object.position.x, z: playerView.object.position.z },
          rivalView: { x: rivalView.object.position.x, z: rivalView.object.position.z },
          camera: { x: camera.position.x, z: camera.position.z },
        },
      }),
    };
    (window as unknown as { __berby: typeof hook }).__berby = hook;
  }
  if (import.meta.env.DEV) installDevHook();

  return {
    get phase() {
      return phase;
    },
    start() {
      ui.menu.show();
      loop.start();
    },
  };
}
