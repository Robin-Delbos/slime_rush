import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../src/input';

type Handler = (event: Record<string, unknown>) => void;

/** Un faux écran tactile : enregistre les écouteurs et laisse le test envoyer des événements de pointeur. */
function setup() {
  const handlers = new Map<string, Handler[]>();
  const captured = new Set<number>();
  const surface = {
    addEventListener: (type: string, fn: Handler) => void handlers.set(type, [...(handlers.get(type) ?? []), fn]),
    setPointerCapture: (id: number) => void captured.add(id),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => void captured.delete(id),
  };
  const hidden = { value: true };
  const base = {
    style: { left: '', top: '' },
    classList: {
      add: (name: string) => void (name === 'hidden' && (hidden.value = true)),
      remove: (name: string) => void (name === 'hidden' && (hidden.value = false)),
    },
  };
  const knob = { style: { transform: '' } };
  const input = new Input(surface as unknown as HTMLElement, base as unknown as HTMLElement, knob as unknown as HTMLElement);
  const taps: { x: number; y: number }[] = [];
  input.onTap = (x, y) => taps.push({ x, y });

  const fire = (type: string, pointerId: number, x: number, y: number) => {
    for (const fn of handlers.get(type) ?? []) fn({ pointerId, clientX: x, clientY: y });
  };
  return {
    input,
    taps,
    stickShown: () => !hidden.value,
    down: (id: number, x: number, y: number) => fire('pointerdown', id, x, y),
    move: (id: number, x: number, y: number) => fire('pointermove', id, x, y),
    up: (id: number, x: number, y: number) => fire('pointerup', id, x, y),
    cancel: (id: number) => fire('pointercancel', id, 0, 0),
  };
}

let clock = 0;

beforeEach(() => {
  clock = 1000;
  vi.stubGlobal('window', { addEventListener: () => {} });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('un seul doigt (comportement d’origine)', () => {
  it('glisser déplace le héros, sans déclencher de tap', () => {
    const t = setup();
    t.down(1, 100, 300);
    expect(t.stickShown()).toBe(true);
    clock += 400;
    t.move(1, 150, 300);
    expect(t.input.vector.x).toBeCloseTo(1);
    t.up(1, 150, 300);
    expect(t.taps).toEqual([]);
    expect(t.input.vector).toEqual({ x: 0, y: 0 });
    expect(t.stickShown()).toBe(false);
  });

  it('un appui bref et immobile est un tap', () => {
    const t = setup();
    t.down(1, 200, 250);
    clock += 100;
    t.up(1, 200, 250);
    expect(t.taps).toEqual([{ x: 200, y: 250 }]);
  });

  it('un appui long, ou qui a glissé, n’est pas un tap', () => {
    const t = setup();
    t.down(1, 200, 250);
    clock += 300;
    t.up(1, 200, 250);
    t.down(2, 200, 250);
    clock += 100;
    t.move(2, 240, 250);
    t.up(2, 240, 250);
    expect(t.taps).toEqual([]);
  });
});

describe('deux mains : un doigt déplace, l’autre frappe', () => {
  it('un deuxième doigt posé brièvement fait un tap à l’endroit touché, sans interrompre le déplacement', () => {
    const t = setup();
    t.down(1, 100, 300);
    clock += 200;
    t.move(1, 160, 300);
    const before = t.input.vector;
    expect(before.x).toBeCloseTo(1);

    clock += 300;
    t.down(2, 600, 150);
    clock += 80;
    t.up(2, 600, 150);

    expect(t.taps).toEqual([{ x: 600, y: 150 }]);
    // Le premier doigt est toujours le joystick, et rien n'a bougé de son côté.
    expect(t.input.vector).toEqual(before);
    expect(t.stickShown()).toBe(true);
    // Et il continue de piloter après le tap.
    clock += 100;
    t.move(1, 100, 250);
    expect(t.input.vector.x).toBeCloseTo(0);
    expect(t.input.vector.y).toBeCloseTo(1);
  });

  it('le deuxième doigt ne déplace jamais le joystick, même en glissant', () => {
    const t = setup();
    t.down(1, 100, 300);
    t.move(1, 150, 300);
    const before = t.input.vector;
    t.down(2, 500, 200);
    t.move(2, 560, 100);
    t.move(2, 300, 50);
    expect(t.input.vector).toEqual(before);
  });

  it('un deuxième doigt qui reste posé (appui long) ou qui glisse ne fait pas de tap', () => {
    const t = setup();
    t.down(1, 100, 300);
    t.move(1, 150, 300);
    t.down(2, 500, 200);
    clock += 400;
    t.up(2, 500, 200);
    t.down(3, 500, 200);
    clock += 80;
    t.move(3, 540, 200);
    t.up(3, 540, 200);
    expect(t.taps).toEqual([]);
  });

  it('plusieurs appuis brefs d’un deuxième doigt font autant de taps', () => {
    const t = setup();
    t.down(1, 100, 300);
    t.move(1, 150, 300);
    for (const [id, x] of [[2, 500], [3, 520], [4, 540]] as const) {
      t.down(id, x, 200);
      clock += 60;
      t.up(id, x, 200);
    }
    expect(t.taps.map((p) => p.x)).toEqual([500, 520, 540]);
  });

  it('deux doigts posés en même temps : un tap chacun, sans toucher au joystick', () => {
    const t = setup();
    t.down(1, 100, 300);
    t.move(1, 150, 300);
    t.down(2, 400, 200);
    t.down(3, 600, 200);
    clock += 70;
    t.up(3, 600, 200);
    t.up(2, 400, 200);
    expect(t.taps.map((p) => p.x)).toEqual([600, 400]);
    expect(t.stickShown()).toBe(true);
  });

  it('si le premier doigt se lève avant, le deuxième ne reprend pas le joystick mais peut encore taper', () => {
    const t = setup();
    t.down(1, 100, 300);
    clock += 300;
    t.move(1, 150, 300);
    t.down(2, 500, 200);
    clock += 100;
    t.up(1, 150, 300);
    expect(t.input.vector).toEqual({ x: 0, y: 0 });
    // Le héros s'arrête (plus de doigt pour le déplacer), et le deuxième doigt, bref, tape quand même.
    clock += 50;
    t.up(2, 500, 200);
    expect(t.taps).toEqual([{ x: 500, y: 200 }]);
    expect(t.input.vector).toEqual({ x: 0, y: 0 });
  });

  it('le premier doigt, levé après un long déplacement, ne déclenche pas de tap même si un deuxième est passé', () => {
    const t = setup();
    t.down(1, 100, 300);
    t.down(2, 500, 200);
    clock += 60;
    t.up(2, 500, 200);
    clock += 600;
    t.up(1, 100, 300);
    expect(t.taps).toEqual([{ x: 500, y: 200 }]);
  });

  it('un appui annulé par le système (pointercancel) ne fait pas de tap', () => {
    const t = setup();
    t.down(1, 100, 300);
    t.down(2, 500, 200);
    t.cancel(2);
    clock += 50;
    t.up(2, 500, 200);
    expect(t.taps).toEqual([]);
    expect(t.stickShown()).toBe(true);
  });

  it('un écran qui passe par-dessus le jeu (pause) relâche aussi les doigts supplémentaires', () => {
    const t = setup();
    t.down(1, 100, 300);
    t.down(2, 500, 200);
    t.input.release();
    clock += 50;
    t.up(2, 500, 200);
    expect(t.taps).toEqual([]);
    expect(t.input.vector).toEqual({ x: 0, y: 0 });
  });

  it('après avoir tout relâché, un nouveau doigt redevient le joystick', () => {
    const t = setup();
    t.down(1, 100, 300);
    t.down(2, 500, 200);
    clock += 50;
    t.up(2, 500, 200);
    t.up(1, 100, 300);
    t.down(3, 300, 300);
    clock += 400;
    t.move(3, 350, 300);
    expect(t.input.vector.x).toBeCloseTo(1);
  });
});
