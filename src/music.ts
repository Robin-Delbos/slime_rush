/**
 * Musique de fond, entièrement synthétisée (aucun fichier audio) : trois boucles écrites en notes dans ce fichier,
 * jouées par l'API Web Audio. La partie « données » (les notes) est pure et testée ; `MusicPlayer` les joue.
 *
 * - menu : calme et lumineuse (Do majeur, 84 pulsations par minute) ;
 * - game : entraînante (La mineur, 132) ;
 * - boss : plus sombre et plus rapide (Mi mineur, 152), quand un boss est là ;
 * - chest : entraînante, un air de chasse au trésor (Sol majeur, 126), pendant l'ouverture des coffres.
 */

export type TrackName = 'menu' | 'game' | 'boss' | 'chest';
export type Voice = 'pad' | 'bass' | 'lead' | 'arp' | 'kick' | 'hat';

export interface NoteEvent {
  /** Début, en pulsations depuis le début de la boucle. */
  beat: number;
  /** Durée, en pulsations. */
  duration: number;
  /** Note MIDI (69 = La 440 Hz). Sans importance pour la grosse caisse et le charleston. */
  midi: number;
  voice: Voice;
  /** Volume de 0 à 1, avant le volume général de la musique. */
  volume: number;
}

export interface Track {
  name: TrackName;
  /** Pulsations par minute. */
  bpm: number;
  /** Longueur de la boucle, en pulsations. */
  beats: number;
  events: NoteEvent[];
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

const BAR = 4;
const major = (root: number): number[] => [root, root + 4, root + 7];
const minor = (root: number): number[] => [root, root + 3, root + 7];

function note(events: NoteEvent[], voice: Voice, beat: number, duration: number, midi: number, volume: number): void {
  events.push({ beat, duration, midi, voice, volume });
}

/** Menu : une progression de huit mesures (Do, Sol, La mineur, Fa...), nappes douces et mélodie chantante. */
function menuTrack(): Track {
  const events: NoteEvent[] = [];
  // [fondamentale grave, accord (milieu)]
  const bars: { root: number; chord: number[] }[] = [
    { root: 36, chord: major(60) },
    { root: 43, chord: major(55) },
    { root: 45, chord: minor(57) },
    { root: 41, chord: major(53) },
    { root: 36, chord: major(60) },
    { root: 43, chord: major(55) },
    { root: 41, chord: major(53) },
    { root: 43, chord: major(55) },
  ];
  // Mélodie : [pulsation dans la mesure, note, durée] pour chaque mesure.
  const melody: [number, number, number][][] = [
    [[0, 76, 1.5], [1.5, 79, 0.5], [2, 81, 1], [3, 79, 1]],
    [[0, 74, 1.5], [1.5, 76, 0.5], [2, 79, 2]],
    [[0, 72, 1], [1, 76, 1], [2, 81, 1.5], [3.5, 79, 0.5]],
    [[0, 77, 2], [2, 76, 1], [3, 72, 1]],
    [[0, 79, 1.5], [1.5, 81, 0.5], [2, 84, 1], [3, 81, 1]],
    [[0, 83, 1.5], [1.5, 81, 0.5], [2, 79, 2]],
    [[0, 77, 1], [1, 81, 1], [2, 84, 1.5], [3.5, 81, 0.5]],
    [[0, 83, 1], [1, 79, 1], [2, 74, 2]],
  ];
  bars.forEach(({ root, chord }, i) => {
    const start = i * BAR;
    for (const midi of chord) note(events, 'pad', start, BAR, midi, 0.5);
    note(events, 'bass', start, 1.8, root, 0.6);
    note(events, 'bass', start + 2, 1.8, root, 0.45);
    for (const [beat, midi, duration] of melody[i]) note(events, 'lead', start + beat, duration * 0.95, midi, 0.55);
  });
  return { name: 'menu', bpm: 84, beats: bars.length * BAR, events };
}

/** Partie : La mineur, Fa, Do, Sol ; basse en croches, grosse caisse à chaque temps, arpèges et charleston. */
function gameTrack(): Track {
  const events: NoteEvent[] = [];
  const progression: { root: number; chord: number[] }[] = [
    { root: 45, chord: minor(57) },
    { root: 41, chord: major(53) },
    { root: 48, chord: major(60) },
    { root: 43, chord: major(55) },
  ];
  const bars = [...progression, ...progression];
  bars.forEach(({ root, chord }, i) => {
    const start = i * BAR;
    for (let e = 0; e < 8; e++) note(events, 'bass', start + e * 0.5, 0.42, e % 4 === 2 ? root + 12 : root, 0.5);
    for (let b = 0; b < 4; b++) note(events, 'kick', start + b, 0.3, 36, 0.8);
    for (let b = 0; b < 4; b++) note(events, 'hat', start + b + 0.5, 0.1, 0, 0.3);
    // Arpège en croches sur les notes de l'accord, une octave plus haut.
    const arp = [0, 1, 2, 1, 0, 1, 2, 1];
    arp.forEach((degree, e) => note(events, 'arp', start + e * 0.5, 0.3, chord[degree] + 12, 0.22));
    // Une petite phrase aiguë une mesure sur deux.
    if (i % 2 === 0) {
      note(events, 'lead', start, 1, chord[0] + 24, 0.4);
      note(events, 'lead', start + 1.5, 0.5, chord[2] + 24, 0.4);
      note(events, 'lead', start + 2, 1, chord[1] + 24, 0.4);
      note(events, 'lead', start + 3, 1, chord[2] + 24, 0.35);
    }
  });
  return { name: 'game', bpm: 132, beats: bars.length * BAR, events };
}

/** Boss : Mi mineur, Fa, Ré ; plus rapide, basse nerveuse, charleston en doubles croches, grosse caisse appuyée. */
function bossTrack(): Track {
  const events: NoteEvent[] = [];
  const bars: { root: number; chord: number[] }[] = [
    { root: 40, chord: minor(52) },
    { root: 40, chord: minor(52) },
    { root: 41, chord: major(53) },
    { root: 38, chord: minor(50) },
    { root: 40, chord: minor(52) },
    { root: 40, chord: minor(52) },
    { root: 41, chord: major(53) },
    { root: 43, chord: major(55) },
  ];
  bars.forEach(({ root, chord }, i) => {
    const start = i * BAR;
    for (let e = 0; e < 8; e++) note(events, 'bass', start + e * 0.5, 0.4, e % 2 === 1 ? root + 12 : root, 0.55);
    for (let b = 0; b < 4; b++) note(events, 'kick', start + b, 0.3, 36, 0.9);
    note(events, 'kick', start + 3.5, 0.2, 36, 0.55);
    for (let s = 0; s < 8; s++) note(events, 'hat', start + s * 0.5 + 0.25, 0.06, 0, 0.22);
    for (let s = 0; s < 16; s++) note(events, 'arp', start + s * 0.25, 0.2, chord[[0, 2, 1, 2][s % 4]] + 24, 0.16);
    note(events, 'lead', start, 0.75, chord[0] + 24, 0.4);
    note(events, 'lead', start + 2, 0.75, chord[1] + 24, 0.4);
  });
  return { name: 'boss', bpm: 152, beats: bars.length * BAR, events };
}

/**
 * Coffres : Sol majeur, Do, Ré, Mi mineur ; un air de chasse au trésor, joyeux et sautillant : basse « oom-pah » qui
 * saute de la fondamentale à la quinte, accords frappés à contretemps, charleston sur chaque croche, mélodie courte
 * et syncopée. Pas de nappes (contrairement au menu) : tout est rythmé.
 */
function chestTrack(): Track {
  const events: NoteEvent[] = [];
  const bars: { root: number; chord: number[] }[] = [
    { root: 43, chord: [55, 59, 62] }, // Sol
    { root: 48, chord: [55, 60, 64] }, // Do
    { root: 50, chord: [57, 62, 66] }, // Ré
    { root: 50, chord: [57, 62, 66] }, // Ré
    { root: 40, chord: [55, 59, 64] }, // Mi mineur
    { root: 48, chord: [55, 60, 64] }, // Do
    { root: 50, chord: [57, 62, 66] }, // Ré
    { root: 50, chord: [57, 62, 66] }, // Ré, qui ramène au Sol
  ];
  // Mélodie : [pulsation dans la mesure, note, durée] pour chaque mesure.
  const melody: [number, number, number][][] = [
    [[0, 79, 0.5], [0.5, 83, 0.5], [1, 86, 1], [2, 83, 0.5], [2.5, 86, 0.5], [3, 88, 1]],
    [[0, 88, 0.5], [0.5, 84, 0.5], [1, 79, 1], [2, 84, 1], [3, 83, 0.5], [3.5, 81, 0.5]],
    [[0, 81, 0.5], [0.5, 86, 0.5], [1, 86, 1], [2, 81, 0.5], [2.5, 86, 0.5], [3, 90, 1]],
    [[0, 88, 0.5], [0.5, 86, 0.5], [1, 83, 1], [2, 81, 1], [3, 78, 0.5], [3.5, 81, 0.5]],
    [[0, 83, 0.5], [0.5, 88, 0.5], [1, 91, 1], [2, 88, 0.5], [2.5, 83, 0.5], [3, 88, 1]],
    [[0, 84, 0.5], [0.5, 88, 0.5], [1, 91, 1], [2, 88, 1], [3, 84, 0.5], [3.5, 79, 0.5]],
    [[0, 86, 0.5], [0.5, 90, 0.5], [1, 93, 1], [2, 90, 0.5], [2.5, 86, 0.5], [3, 81, 1]],
    [[0, 83, 0.5], [0.5, 86, 0.5], [1, 90, 1], [2, 86, 0.5], [2.5, 83, 0.5], [3, 79, 1]],
  ];
  bars.forEach(({ root, chord }, i) => {
    const start = i * BAR;
    // Oom-pah : fondamentale, quinte, fondamentale, quinte.
    for (let b = 0; b < 4; b++) note(events, 'bass', start + b, 0.45, b % 2 === 0 ? root : root + 7, 0.55);
    // Grosse caisse sur les temps 1 et 3, avec une relance avant la mesure suivante toutes les quatre mesures.
    note(events, 'kick', start, 0.3, 36, 0.8);
    note(events, 'kick', start + 2, 0.3, 36, 0.8);
    if (i % 4 === 3) note(events, 'kick', start + 3.5, 0.2, 36, 0.55);
    // Charleston sur chaque croche, plus appuyé sur les temps 2 et 4.
    for (let e = 0; e < 8; e++) note(events, 'hat', start + e * 0.5, 0.1, 0, e % 4 === 2 ? 0.4 : 0.25);
    // Accords frappés à contretemps.
    for (let b = 0; b < 4; b++) for (const midi of chord) note(events, 'arp', start + b + 0.5, 0.25, midi, 0.16);
    for (const [beat, midi, duration] of melody[i]) note(events, 'lead', start + beat, duration * 0.8, midi, 0.42);
  });
  return { name: 'chest', bpm: 126, beats: bars.length * BAR, events };
}

export const TRACKS: Record<TrackName, Track> = {
  menu: menuTrack(),
  game: gameTrack(),
  boss: bossTrack(),
  chest: chestTrack(),
};

/**
 * Notes qui commencent entre les pulsations `from` (incluse) et `to` (exclue), la boucle se répétant sans fin.
 * Les `beat` renvoyés sont absolus (depuis le démarrage de la musique), triés dans l'ordre.
 */
export function eventsInRange(track: Track, from: number, to: number): NoteEvent[] {
  const result: NoteEvent[] = [];
  if (to <= from) return result;
  const firstLoop = Math.floor(from / track.beats);
  const lastLoop = Math.floor((to - 1e-9) / track.beats);
  for (let loop = firstLoop; loop <= lastLoop; loop++) {
    const offset = loop * track.beats;
    for (const event of track.events) {
      const beat = event.beat + offset;
      if (beat >= from && beat < to) result.push({ ...event, beat });
    }
  }
  return result.sort((a, b) => a.beat - b.beat);
}

/** Durée d'une boucle, en secondes. */
export function loopSeconds(track: Track): number {
  return (track.beats * 60) / track.bpm;
}

/** Ce dont le lecteur a besoin du système audio. */
export interface AudioHandle {
  ctx: AudioContext;
  /** Où brancher la musique (le gain général du jeu). */
  out: AudioNode;
}

/** Volume général de la musique : bien en dessous des bruitages. */
export const MUSIC_VOLUME = 0.3;
/** La musique est atténuée (en pause, pendant un choix de niveau) à cette part de son volume. */
export const DUCK_RATIO = 0.35;
const FADE = 0.9;
/** On programme les notes avec cette avance (secondes) : assez pour ne pas hoqueter si l'écran est lent. */
const LOOKAHEAD = 0.35;

interface Playing {
  name: TrackName;
  track: Track;
  gain: GainNode;
  /** Instant (horloge audio) de la pulsation 0. */
  start: number;
  /** Pulsation jusqu'à laquelle les notes sont déjà programmées. */
  scheduled: number;
}

/**
 * Joue les boucles avec Web Audio. Le système audio n'existe qu'après un geste de l'utilisateur : on peut donc
 * demander une piste avant, elle démarre dès que `resume()` est appelé une fois l'audio disponible.
 */
export class MusicPlayer {
  private desired: TrackName | null = null;
  private playing: Playing | null = null;
  private bus: GainNode | null = null;
  private muted = false;
  private ducked = false;
  private timer = 0;
  private noise: AudioBuffer | null = null;

  constructor(private audio: () => AudioHandle | null) {}

  /** Piste en cours de lecture (ou null). */
  get current(): TrackName | null {
    return this.playing?.name ?? null;
  }

  /** Piste demandée, jouée ou en attente du premier geste. */
  get wanted(): TrackName | null {
    return this.desired;
  }

  /** Demande une piste (null : silence). Sans effet si c'est déjà celle qui joue : pas de redémarrage. */
  setTrack(name: TrackName | null): void {
    this.desired = name;
    this.sync();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
  }

  /** Atténue la musique (écran de pause ou de choix). */
  setDuck(ducked: boolean): void {
    this.ducked = ducked;
    this.applyVolume();
  }

  /** À appeler quand l'audio vient de devenir disponible (premier geste de l'utilisateur). */
  resume(): void {
    this.sync();
  }

  private volume(): number {
    return this.muted ? 0 : MUSIC_VOLUME * (this.ducked ? DUCK_RATIO : 1);
  }

  private applyVolume(): void {
    const audio = this.audio();
    if (!audio || !this.bus) return;
    this.bus.gain.setTargetAtTime(this.volume(), audio.ctx.currentTime, 0.08);
  }

  /** Met la lecture en accord avec la piste demandée : fondu enchaîné si elle change. */
  private sync(): void {
    const audio = this.audio();
    if (!audio) return;
    const { ctx } = audio;
    if (!this.bus) {
      this.bus = ctx.createGain();
      this.bus.gain.value = this.volume();
      this.bus.connect(audio.out);
    }
    if (this.playing?.name === this.desired) return;

    const old = this.playing;
    if (old) {
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, FADE / 3);
      setTimeout(() => old.gain.disconnect(), FADE * 3000);
    }
    this.playing = null;
    if (!this.desired) {
      clearInterval(this.timer);
      this.timer = 0;
      return;
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, ctx.currentTime, FADE / 3);
    gain.connect(this.bus);
    this.playing = { name: this.desired, track: TRACKS[this.desired], gain, start: ctx.currentTime + 0.08, scheduled: 0 };
    if (!this.timer) this.timer = setInterval(() => this.tick(), 50);
    this.tick();
  }

  /** Programme les notes des prochaines fractions de seconde. */
  private tick(): void {
    const audio = this.audio();
    const playing = this.playing;
    if (!audio || !playing || audio.ctx.state !== 'running') return;
    const { ctx } = audio;
    const beatSeconds = 60 / playing.track.bpm;
    const target = (ctx.currentTime + LOOKAHEAD - playing.start) / beatSeconds;
    // Après un long arrêt (onglet en arrière-plan), on repart du présent plutôt que de rattraper des notes.
    if (target - playing.scheduled > 8) playing.scheduled = target - 1;
    for (const event of eventsInRange(playing.track, playing.scheduled, target)) {
      this.play(ctx, playing.gain, event, playing.start + event.beat * beatSeconds, event.duration * beatSeconds);
    }
    playing.scheduled = Math.max(playing.scheduled, target);
  }

  private play(ctx: AudioContext, dest: AudioNode, event: NoteEvent, time: number, seconds: number): void {
    const hz = midiToHz(event.midi);
    switch (event.voice) {
      case 'pad':
        // Nappe : attaque et relâchement lents.
        this.tone(ctx, dest, 'triangle', hz, time, seconds, event.volume * 0.18, Math.min(0.6, seconds / 3), 0.7);
        break;
      case 'bass':
        this.tone(ctx, dest, 'triangle', hz, time, seconds, event.volume * 0.5, 0.01, 0.08);
        break;
      case 'lead':
        this.tone(ctx, dest, 'square', hz, time, seconds, event.volume * 0.1, 0.015, 0.12);
        break;
      case 'arp':
        this.tone(ctx, dest, 'square', hz, time, seconds, event.volume * 0.1, 0.005, 0.08);
        break;
      case 'kick': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(130, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
        gain.gain.setValueAtTime(event.volume * 0.7, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
        osc.connect(gain).connect(dest);
        osc.start(time);
        osc.stop(time + 0.2);
        break;
      }
      case 'hat':
        this.hat(ctx, dest, time, event.volume * 0.25);
        break;
    }
  }

  private tone(ctx: AudioContext, dest: AudioNode, type: OscillatorType, hz: number, time: number, seconds: number, volume: number, attack: number, release: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), time + attack);
    gain.gain.setValueAtTime(Math.max(0.0002, volume), time + Math.max(attack, seconds));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(attack, seconds) + release);
    osc.connect(gain).connect(dest);
    osc.start(time);
    osc.stop(time + Math.max(attack, seconds) + release + 0.02);
  }

  /** Charleston : un court bruit filtré passe-haut. */
  private hat(ctx: AudioContext, dest: AudioNode, time: number, volume: number): void {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = this.noise;
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    source.connect(filter).connect(gain).connect(dest);
    source.start(time);
    source.stop(time + 0.08);
  }
}
