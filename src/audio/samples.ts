/**
 * Sample playback for later (music, UI blips) on top of Howler. Howler is loaded lazily the
 * first time a sample is registered, so the synthesized-only MVP ships without it.
 */
import type { Howl } from 'howler';

type HowlerModule = typeof import('howler');

export interface SamplePlayer {
  register(name: string, urls: string[], options?: { loop?: boolean; volume?: number }): void;
  play(name: string): void;
  stop(name: string): void;
  setMuted(muted: boolean): void;
}

export function createSamplePlayer(): SamplePlayer {
  const howls = new Map<string, Howl>();
  const pending = new Map<string, { urls: string[]; options?: { loop?: boolean; volume?: number } }>();
  let mod: HowlerModule | null = null;
  let loading: Promise<HowlerModule> | null = null;
  let muted = false;

  const load = () => {
    loading ??= import('howler').then((m) => {
      mod = m;
      m.Howler.mute(muted);
      for (const [name, { urls, options }] of pending) {
        howls.set(name, new m.Howl({ src: urls, loop: options?.loop ?? false, volume: options?.volume ?? 1 }));
      }
      pending.clear();
      return m;
    });
    return loading;
  };

  return {
    register(name, urls, options) {
      if (mod) {
        howls.set(name, new mod.Howl({ src: urls, loop: options?.loop ?? false, volume: options?.volume ?? 1 }));
      } else {
        pending.set(name, { urls, options });
        void load();
      }
    },
    play(name) {
      howls.get(name)?.play();
    },
    stop(name) {
      howls.get(name)?.stop();
    },
    setMuted(m) {
      muted = m;
      mod?.Howler.mute(m);
    },
  };
}
