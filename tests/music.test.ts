import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DUCK_RATIO, MUSIC_VOLUME, MusicPlayer, TRACKS, eventsInRange, loopSeconds, midiToHz, type AudioHandle, type TrackName, type Voice } from '../src/music';

const NAMES: TrackName[] = ['menu', 'game', 'boss', 'chest'];

describe('Musique : les notes', () => {
  it('convertit les notes MIDI en fréquences', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(81)).toBeCloseTo(880);
    expect(midiToHz(57)).toBeCloseTo(220);
    expect(midiToHz(60)).toBeCloseTo(261.63, 1);
  });

  it('a une piste pour le menu, la partie, les boss et l’ouverture des coffres', () => {
    expect(Object.keys(TRACKS).sort()).toEqual([...NAMES].sort());
    for (const name of NAMES) expect(TRACKS[name].name).toBe(name);
  });

  it('accélère du calme du menu à la tension du boss', () => {
    expect(TRACKS.menu.bpm).toBeLessThan(TRACKS.game.bpm);
    expect(TRACKS.game.bpm).toBeLessThan(TRACKS.boss.bpm);
    // La musique des coffres est entre les deux : mystérieuse, sans la nervosité de la partie.
    expect(TRACKS.chest.bpm).toBeGreaterThan(TRACKS.menu.bpm);
    expect(TRACKS.chest.bpm).toBeLessThan(TRACKS.game.bpm);
  });

  it('boucle sur un nombre entier de mesures, assez longues pour ne pas lasser', () => {
    for (const name of NAMES) {
      const track = TRACKS[name];
      expect(track.beats % 4, name).toBe(0);
      expect(loopSeconds(track), name).toBeGreaterThan(10);
      expect(loopSeconds(track), name).toBeLessThan(40);
    }
  });

  it('ne contient que des notes valides, dans la boucle', () => {
    for (const name of NAMES) {
      const track = TRACKS[name];
      expect(track.events.length, name).toBeGreaterThan(20);
      for (const e of track.events) {
        const label = `${name} ${e.voice} @${e.beat}`;
        expect(e.beat, label).toBeGreaterThanOrEqual(0);
        expect(e.beat, label).toBeLessThan(track.beats);
        expect(e.duration, label).toBeGreaterThan(0);
        expect(e.volume, label).toBeGreaterThan(0);
        expect(e.volume, label).toBeLessThanOrEqual(1);
        expect(Number.isFinite(midiToHz(e.midi)), label).toBe(true);
        if (e.voice !== 'kick' && e.voice !== 'hat') {
          expect(e.midi, label).toBeGreaterThanOrEqual(24);
          expect(e.midi, label).toBeLessThanOrEqual(110);
        }
      }
    }
  });

  it('calme le menu (sans percussions) et rythme la partie et les boss', () => {
    const voices = (name: TrackName) => new Set<Voice>(TRACKS[name].events.map((e) => e.voice));
    expect(voices('menu')).toEqual(new Set(['pad', 'bass', 'lead']));
    for (const name of ['game', 'boss'] as const) {
      for (const voice of ['bass', 'kick', 'hat', 'arp', 'lead'] as const) expect(voices(name).has(voice), `${name} : ${voice}`).toBe(true);
    }
  });

  it('donne aux coffres une musique à part, entraînante : basse oom-pah, accords à contretemps, charleston, sans nappes', () => {
    const chest = TRACKS.chest.events;
    const voices = new Set<Voice>(chest.map((e) => e.voice));
    expect(voices).toEqual(new Set(['bass', 'kick', 'hat', 'arp', 'lead']));
    // Pas de nappes douces comme au menu.
    expect(voices.has('pad')).toBe(false);
    // Grosse caisse sur les temps 1 et 3 de chaque mesure (plus une relance avant la mesure suivante).
    const kicks = chest.filter((e) => e.voice === 'kick').map((e) => e.beat);
    for (let bar = 0; bar < TRACKS.chest.beats / 4; bar++) {
      expect(kicks, `mesure ${bar}`).toContain(bar * 4);
      expect(kicks, `mesure ${bar}`).toContain(bar * 4 + 2);
    }
    // Un charleston sur chaque croche.
    expect(chest.filter((e) => e.voice === 'hat').length).toBe(TRACKS.chest.beats * 2);
    // Les accords sont frappés à contretemps : jamais sur un temps franc.
    for (const e of chest.filter((n) => n.voice === 'arp')) expect(e.beat % 1, `accord @${e.beat}`).toBe(0.5);
    // Une mélodie différente de celles du menu et de la partie.
    const melody = (name: TrackName) => TRACKS[name].events.filter((e) => e.voice === 'lead').map((e) => e.midi).join();
    expect(melody('chest')).not.toBe(melody('menu'));
    expect(melody('chest')).not.toBe(melody('game'));
  });

  it('rend les coffres plus vifs que le menu, sans égaler la partie, et en majeur', () => {
    expect(TRACKS.chest.bpm).toBeGreaterThanOrEqual(120);
    // Mélodie et accords restent dans la gamme de Sol majeur (degrés 0, 2, 4, 5, 7, 9, 11 au-dessus du Sol) : pas de fausse note.
    const scale = new Set([0, 2, 4, 5, 7, 9, 11]);
    for (const e of TRACKS.chest.events.filter((n) => n.voice === 'lead' || n.voice === 'arp')) {
      expect(scale.has((e.midi - 7 + 120) % 12), `note ${e.midi}`).toBe(true);
    }
  });

  it('place la grosse caisse à chaque temps de la partie', () => {
    const kicks = TRACKS.game.events.filter((e) => e.voice === 'kick').map((e) => e.beat);
    expect(kicks).toEqual(Array.from({ length: TRACKS.game.beats }, (_, i) => i));
  });
});

describe('Musique : programmation des notes', () => {
  const track = TRACKS.game;

  it('renvoie exactement les notes de la boucle sur une boucle entière', () => {
    expect(eventsInRange(track, 0, track.beats)).toHaveLength(track.events.length);
  });

  it('renvoie des notes triées, aux pulsations demandées', () => {
    const events = eventsInRange(track, 3.2, 11.7);
    for (const e of events) {
      expect(e.beat).toBeGreaterThanOrEqual(3.2);
      expect(e.beat).toBeLessThan(11.7);
    }
    const beats = events.map((e) => e.beat);
    expect([...beats].sort((a, b) => a - b)).toEqual(beats);
  });

  it('enchaîne les boucles sans trou ni doublon à la jonction', () => {
    const across = eventsInRange(track, track.beats - 2, track.beats + 2);
    expect(across.some((e) => e.beat >= track.beats)).toBe(true);
    expect(across.some((e) => e.beat < track.beats)).toBe(true);
    // Les notes de la seconde boucle portent des pulsations absolues, décalées d'une boucle.
    const first = eventsInRange(track, 0, 2);
    const second = across.filter((e) => e.beat >= track.beats);
    expect(second.map((e) => e.beat - track.beats)).toEqual(first.map((e) => e.beat));
  });

  it('couvre tout sans rien perdre quand on avance par petits pas', () => {
    const total = track.beats * 3;
    let count = 0;
    let from = 0;
    let step = 0.37;
    while (from < total) {
      const to = Math.min(total, from + step);
      count += eventsInRange(track, from, to).length;
      from = to;
      step = step === 0.37 ? 1.13 : 0.37;
    }
    expect(count).toBe(track.events.length * 3);
  });

  it('ne renvoie rien pour une fenêtre vide ou à l’envers', () => {
    expect(eventsInRange(track, 5, 5)).toEqual([]);
    expect(eventsInRange(track, 9, 3)).toEqual([]);
  });
});

/** Faux système audio : enregistre ce que le lecteur crée et programme. */
function fakeAudio() {
  const log = { oscillators: 0, gains: 0, starts: [] as number[], targets: [] as { value: number; time: number }[] };
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {},
    setTargetAtTime(value: number, time: number) {
      log.targets.push({ value, time });
    },
  });
  const node = (): Record<string, unknown> => {
    const n: Record<string, unknown> = {
      gain: param(),
      frequency: param(),
      type: '',
      buffer: null,
      connect: (next: unknown) => next,
      disconnect() {},
      start(time: number) {
        log.starts.push(time);
      },
      stop() {},
    };
    return n;
  };
  const ctx = {
    currentTime: 0,
    state: 'running' as string,
    sampleRate: 8000,
    createGain: () => {
      log.gains++;
      return node();
    },
    createOscillator: () => {
      log.oscillators++;
      return node();
    },
    createBiquadFilter: node,
    createBufferSource: node,
    createBuffer: () => ({ getChannelData: () => new Float32Array(8000) }),
  };
  const handle = { ctx, out: node() } as unknown as AudioHandle;
  return { ctx, handle, log };
}

describe('Musique : le lecteur', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('retient la piste demandée tant que l’audio n’est pas disponible, puis la lance au premier geste', () => {
    const { handle, log } = fakeAudio();
    let available = false;
    const player = new MusicPlayer(() => (available ? handle : null));
    player.setTrack('menu');
    expect(player.wanted).toBe('menu');
    expect(player.current).toBeNull();
    expect(log.oscillators).toBe(0);
    available = true;
    player.resume();
    expect(player.current).toBe('menu');
    expect(log.oscillators).toBeGreaterThan(0);
  });

  it('programme les notes un peu à l’avance, puis continue à mesure que le temps passe', () => {
    const { ctx, handle, log } = fakeAudio();
    const player = new MusicPlayer(() => handle);
    player.setTrack('game');
    const first = log.oscillators;
    expect(first).toBeGreaterThan(0);
    // Rien n'est programmé trop loin devant (moins d'une demi-seconde d'avance).
    expect(Math.max(...log.starts)).toBeLessThan(0.6);
    for (let t = 0; t < 4; t += 0.05) {
      ctx.currentTime = t;
      vi.advanceTimersByTime(50);
    }
    expect(log.oscillators).toBeGreaterThan(first * 3);
    expect(Math.max(...log.starts)).toBeLessThan(4.6);
    // Les notes ne sont jamais programmées dans le passé.
    expect(Math.min(...log.starts)).toBeGreaterThanOrEqual(0);
  });

  it('ne programme rien tant que l’horloge audio est suspendue', () => {
    const { ctx, handle, log } = fakeAudio();
    ctx.state = 'suspended';
    const player = new MusicPlayer(() => handle);
    player.setTrack('menu');
    ctx.currentTime = 3;
    vi.advanceTimersByTime(500);
    expect(log.oscillators).toBe(0);
    ctx.state = 'running';
    vi.advanceTimersByTime(100);
    expect(log.oscillators).toBeGreaterThan(0);
  });

  it('ne redémarre pas une piste déjà en cours, mais change de piste en fondu', () => {
    const { handle, log } = fakeAudio();
    const player = new MusicPlayer(() => handle);
    player.setTrack('menu');
    const scheduled = log.oscillators;
    const startsBefore = log.starts.length;
    player.setTrack('menu');
    player.setTrack('menu');
    // Redemander la même piste ne programme rien de plus : pas de redémarrage.
    expect(log.oscillators).toBe(scheduled);
    expect(log.starts.length).toBe(startsBefore);
    expect(log.targets.some((t) => t.value === 0)).toBe(false);
    player.setTrack('game');
    expect(player.current).toBe('game');
    // La nouvelle piste démarre, et l'ancienne s'éteint en douceur (jamais coupée net).
    expect(log.oscillators).toBeGreaterThan(scheduled);
    expect(log.targets.some((t) => t.value === 0)).toBe(true);
    player.setTrack('boss');
    expect(player.current).toBe('boss');
  });

  it('passe du menu à la musique des coffres, puis revient au menu, en fondu', () => {
    const { handle, log } = fakeAudio();
    const player = new MusicPlayer(() => handle);
    player.setTrack('menu');
    player.setTrack('chest');
    expect(player.current).toBe('chest');
    expect(log.targets.some((t) => t.value === 0)).toBe(true);
    player.setTrack('menu');
    expect(player.current).toBe('menu');
  });

  it('s’arrête quand on demande le silence', () => {
    const { handle } = fakeAudio();
    const player = new MusicPlayer(() => handle);
    player.setTrack('game');
    player.setTrack(null);
    expect(player.current).toBeNull();
    expect(player.wanted).toBeNull();
  });

  it('suit le réglage du son : coupée, atténuée, puis rendue', () => {
    const { handle, log } = fakeAudio();
    const player = new MusicPlayer(() => handle);
    player.setTrack('menu');
    const last = () => log.targets[log.targets.length - 1].value;
    player.setMuted(true);
    expect(last()).toBe(0);
    player.setMuted(false);
    expect(last()).toBeCloseTo(MUSIC_VOLUME);
    player.setDuck(true);
    expect(last()).toBeCloseTo(MUSIC_VOLUME * DUCK_RATIO);
    player.setDuck(false);
    expect(last()).toBeCloseTo(MUSIC_VOLUME);
  });

  it('reste plus discrète que les bruitages', () => {
    expect(MUSIC_VOLUME).toBeLessThan(0.5);
    expect(DUCK_RATIO).toBeLessThan(1);
  });
});
