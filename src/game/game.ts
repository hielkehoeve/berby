/**
 * The game: state machine (title → countdown → racing → finished) and the glue between the
 * engine, input, UI, audio, sim and graphics modules.
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
import { createRace, type Race } from './race';
import { enterLandscapeFullscreen } from './fullscreen';

export type Phase = 'title' | 'countdown' | 'racing' | 'finished';

/** Seconds the karts sit frozen while 3-2-1 plays. */
export const COUNTDOWN_SECONDS = 3;
/** How long the GO banner stays up once the race starts. */
const GO_BANNER_SECONDS = 0.9;
/** Pause between crossing the line and the results card. */
const RESULTS_DELAY_SECONDS = 1.4;
/** Speed that counts as "full revs" for the engine sound, m/s: the kart's own top speed. */
const ENGINE_TOP_SPEED = PLAYER_TUNING.topSpeed;

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
  const onPlay = () => {
    audio.unlock();
    void enterLandscapeFullscreen();
    beginCountdown();
  };
  const onRaceAgain = () => {
    audio.unlock();
    beginCountdown();
  };
  const ui = createUi(container, {
    onPlay,
    onRaceAgain,
    onToggleMute: () => ui.setMuted(audio.toggleMuted()),
  });
  ui.setMuted(audio.isMuted());
  const controls = createControls({
    surface: ui.hud.element,
    brakeButton: ui.hud.brakeButton,
    brakeZone: ui.hud.brakeZone,
  });

  // --- State ---
  let phase: Phase = 'title';
  let race: Race = createRace(track);

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
    laps: track.definition.laps,
    time: race.time,
    touch: controls.getTouchState(),
  });

  function beginCountdown() {
    race = createRace(track);
    phase = 'countdown';
    countdownTime = 0;
    countdownShown = -1;
    resultsShown = false;
    ui.title.hide();
    ui.results.hide();
    ui.countdown.hide();
    ui.hud.show();
    ui.hud.revealHints();
    ui.hud.update(hudState());
    audio.engine.start();
    playerView.update(race.player, 0);
    rivalView.update(race.rival, 0);
    // Straight to the grid view; otherwise the camera swoops over from the title orbit or the finish.
    snapChaseCamera(camera, race.player);
  }

  function startRacing() {
    phase = 'racing';
    ui.countdown.show('GO');
    ui.hud.revealHints();
    audio.goTone();
  }

  function finishRace() {
    phase = 'finished';
    audio.engine.stop();
    audio.resultsSting(race.winner === 'player');
  }

  function showResults() {
    resultsShown = true;
    ui.hud.hide();
    ui.results.show({
      won: race.winner === 'player',
      totalTime: race.totalTime(),
      bestLap: race.bestLap(),
    });
  }

  // --- Fixed-step simulation ---
  function fixedStep(dt: number) {
    switch (phase) {
      case 'title':
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
      case 'racing':
        race.step(playerInput(dt), dt);
        if (race.time > GO_BANNER_SECONDS) ui.countdown.hide();
        if (race.finished) finishRace();
        break;
      case 'finished':
        race.coast(dt);
        if (!resultsShown && race.time - race.totalTime() >= RESULTS_DELAY_SECONDS) showResults();
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
    rivalView.update(race.rival, dt);

    if (phase === 'title') {
      orbitCamera(elapsed);
      rivalView.setGhost(0);
    } else {
      updateChaseCamera(camera, race.player, dt);
      // A tailgating Vix would otherwise hide the player from the chase camera.
      rivalView.setGhost(kartOcclusion(camera, race.player, race.rival));
    }

    world.update(dt, elapsed, race.player.position);

    if (phase === 'countdown' || phase === 'racing' || phase === 'finished') {
      const press = controls.lastPressTime();
      if (press !== lastPressSeen) {
        lastPressSeen = press;
        ui.hud.revealHints();
      }
      ui.hud.update(hudState());
      audio.engine.set(Math.abs(race.player.speed) / ENGINE_TOP_SPEED, race.player.onRoad);
    }

    gfx.renderer.render(scene, camera);
  }

  /** A slow orbit around the grid behind the title screen. */
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
   * window.__berby lets a scripted playtest (.claude/skills/berby-playtest) start races, drive
   * the player with the rival AI or a fixed input, and read the race state and frame rate.
   */
  function installDevHook() {
    const hook = {
      get phase() {
        return phase;
      },
      play: onPlay,
      raceAgain: onRaceAgain,
      autopilot(on: boolean) {
        dev.autopilot = on;
      },
      input(value: Partial<KartInput> | null) {
        dev.override = value
          ? { steer: value.steer ?? 0, throttle: value.throttle ?? (value.brake ? 0 : 1), brake: value.brake ?? 0 }
          : null;
      },
      state: () => ({
        phase,
        time: race.time,
        lap: race.playerProgress.lap,
        position: race.playerPosition(),
        playerSpeed: race.player.speed,
        playerOnRoad: race.player.onRoad,
        rivalLap: race.rivalProgress.lap,
        winner: race.winner,
        fps,
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
      ui.title.show();
      loop.start();
    },
  };
}
