export type SoundName =
  | 'shoot'
  | 'hit'
  | 'kill'
  | 'gem'
  | 'coin'
  | 'levelup'
  | 'hurt'
  | 'gameover'
  | 'click'
  | 'buy'
  | 'deny'
  | 'ready'
  | 'special'
  | 'boss'
  | 'legend'
  | 'chest';

/** Délai minimal (s) entre deux déclenchements d'un même son, pour éviter la cacophonie. */
const MIN_INTERVAL: Partial<Record<SoundName, number>> = {
  shoot: 0.07,
  hit: 0.06,
  kill: 0.05,
  gem: 0.04,
  coin: 0.05,
  hurt: 0.3,
};

/**
 * Bruitages synthétisés avec l'API Web Audio : aucun fichier son à charger.
 * Le contexte audio n'est créé qu'après un geste de l'utilisateur (exigence des navigateurs).
 */
export class Sfx {
  muted = false;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastPlayed = new Map<SoundName, number>();
  /** Les gemmes ramassées à la chaîne montent en hauteur de note. */
  private gemCombo = 0;
  private lastGem = 0;

  /** À appeler depuis un clic ou un appui tactile. */
  unlock(): void {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      // Pas d'audio disponible : le jeu reste muet.
      this.ctx = null;
    }
  }

  play(name: SoundName): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < (MIN_INTERVAL[name] ?? 0)) return;
    this.lastPlayed.set(name, now);

    switch (name) {
      case 'shoot':
        this.tone('square', 560, 280, 0.07, 0.035);
        break;
      case 'hit':
        this.tone('triangle', 240, 130, 0.06, 0.09);
        break;
      case 'kill':
        this.tone('sine', 520, 110, 0.13, 0.16);
        break;
      case 'gem': {
        this.gemCombo = now - this.lastGem < 0.5 ? Math.min(this.gemCombo + 1, 14) : 0;
        this.lastGem = now;
        const freq = 660 * 2 ** (this.gemCombo / 12);
        this.tone('sine', freq, freq * 1.5, 0.09, 0.1);
        break;
      }
      case 'coin':
        this.tone('square', 988, 988, 0.05, 0.05);
        this.tone('square', 1319, 1319, 0.12, 0.05, 0.05);
        break;
      case 'levelup':
        [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.16, 0.14, i * 0.08));
        break;
      case 'hurt':
        this.tone('sawtooth', 170, 60, 0.18, 0.13);
        break;
      case 'gameover':
        [392, 330, 262, 196].forEach((f, i) => this.tone('triangle', f, f * 0.97, 0.28, 0.15, i * 0.2));
        break;
      case 'click':
        this.tone('sine', 640, 760, 0.05, 0.08);
        break;
      case 'buy':
        [784, 988, 1319].forEach((f, i) => this.tone('square', f, f, 0.1, 0.06, i * 0.06));
        break;
      case 'deny':
        this.tone('square', 160, 120, 0.14, 0.07);
        break;
      case 'ready':
        this.tone('triangle', 880, 880, 0.1, 0.12);
        this.tone('triangle', 1319, 1319, 0.22, 0.12, 0.1);
        break;
      case 'boss':
        // Cor d'alarme grave, deux fois.
        this.tone('sawtooth', 130, 82, 0.55, 0.22);
        this.tone('square', 196, 110, 0.5, 0.08, 0.04);
        this.tone('sawtooth', 130, 82, 0.55, 0.22, 0.6);
        break;
      case 'chest':
        // Craquement du couvercle, puis scintillement.
        this.tone('sawtooth', 180, 90, 0.18, 0.12);
        [784, 988, 1319, 1568].forEach((f, i) => this.tone('triangle', f, f, 0.16, 0.1, 0.2 + i * 0.07));
        break;
      case 'legend':
        // Fanfare ascendante suivie de scintillements.
        [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.13, i * 0.09));
        [2093, 2637, 3136].forEach((f, i) => this.tone('sine', f, f * 1.02, 0.35, 0.06, 0.7 + i * 0.12));
        break;
      case 'special':
        // Explosion : grave qui s'effondre + claquement aigu.
        this.tone('sine', 220, 35, 0.55, 0.4);
        this.tone('sawtooth', 900, 60, 0.25, 0.12);
        break;
    }
  }

  /** Note simple : glissement de `from` à `to` Hz avec une enveloppe qui s'éteint. */
  private tone(type: OscillatorType, from: number, to: number, duration: number, volume: number, delay = 0): void {
    const ctx = this.ctx!;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(this.master!);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}
