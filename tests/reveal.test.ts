import { describe, expect, it } from 'vitest';
import { REVEAL_TIMING, RevealFlow } from '../src/reveal';

/** Joue un coffre jusqu'à ce que sa carte soit prête (ou, pour un coffre unique, jusqu'à la fin). */
const playChest = (flow: RevealFlow) => {
  expect(flow.openNow()).toBe(true);
  expect(flow.showCard()).toBe(true);
  expect(flow.makeReady()).toBe(true);
};

describe('Ouverture des coffres en plein écran : déroulé', () => {
  it('commence par la tension du premier coffre', () => {
    const flow = new RevealFlow(3);
    expect(flow.phase).toBe('tension');
    expect(flow.index).toBe(0);
    expect(flow.counter).toBe('1 / 3');
    expect(flow.isLast).toBe(false);
  });

  it('suit les étapes dans l’ordre : tension, éclat, carte, carte prête', () => {
    const flow = new RevealFlow(3);
    expect(flow.openNow()).toBe(true);
    expect(flow.phase).toBe('burst');
    expect(flow.showCard()).toBe(true);
    expect(flow.phase).toBe('card');
    expect(flow.makeReady()).toBe(true);
    expect(flow.phase).toBe('card-ready');
  });

  it('ignore les étapes jouées dans le désordre ou deux fois', () => {
    const flow = new RevealFlow(2);
    expect(flow.showCard()).toBe(false);
    expect(flow.makeReady()).toBe(false);
    expect(flow.advance()).toBeNull();
    expect(flow.finish()).toBe(false);
    flow.openNow();
    // Un second toucher (ou le délai automatique qui arrive après) ne rouvre rien.
    expect(flow.openNow()).toBe(false);
    expect(flow.phase).toBe('burst');
    expect(flow.advance()).toBeNull();
    flow.showCard();
    // On ne passe pas la carte avant qu'elle ait été assez regardée.
    expect(flow.advance()).toBeNull();
    expect(flow.phase).toBe('card');
  });

  it('enchaîne les coffres un par un avec un compteur, puis le récapitulatif', () => {
    const flow = new RevealFlow(3);
    const counters: string[] = [];
    for (let i = 0; i < 3; i++) {
      counters.push(flow.counter);
      playChest(flow);
      expect(flow.phase).toBe('card-ready');
      const next = flow.advance();
      expect(next).toBe(i < 2 ? 'chest' : 'recap');
      expect(flow.phase).toBe(i < 2 ? 'tension' : 'recap');
    }
    expect(counters).toEqual(['1 / 3', '2 / 3', '3 / 3']);
    expect(flow.finish()).toBe(true);
    expect(flow.phase).toBe('end');
    expect(flow.advance()).toBeNull();
  });

  it('sait quel est le dernier coffre', () => {
    const flow = new RevealFlow(2);
    expect(flow.isLast).toBe(false);
    playChest(flow);
    flow.advance();
    expect(flow.isLast).toBe(true);
  });

  it('pour un coffre unique : pas de compteur, pas de récapitulatif, les boutons de fin viennent tout de suite', () => {
    const flow = new RevealFlow(1);
    expect(flow.counter).toBe('');
    expect(flow.isLast).toBe(true);
    flow.openNow();
    flow.showCard();
    expect(flow.makeReady()).toBe(true);
    expect(flow.phase).toBe('end');
    expect(flow.advance()).toBeNull();
  });

  it('un toucher pendant la tension ouvre le coffre sans attendre le délai', () => {
    const flow = new RevealFlow(2);
    expect(flow.phase).toBe('tension');
    expect(flow.openNow()).toBe(true);
    expect(flow.phase).toBe('burst');
  });

  it('a des durées raisonnables : une tension qui monte, un éclat bref, une carte qu’on admire', () => {
    expect(REVEAL_TIMING.tension).toBeGreaterThanOrEqual(800);
    expect(REVEAL_TIMING.tension).toBeLessThanOrEqual(2000);
    expect(REVEAL_TIMING.burst).toBeLessThan(REVEAL_TIMING.tension);
    // Le coffre touche le sol avant l'éclat, avec assez de temps pour un vrai grondement (environ une seconde).
    expect(REVEAL_TIMING.impact).toBeGreaterThan(200);
    expect(REVEAL_TIMING.tension - REVEAL_TIMING.impact).toBeGreaterThanOrEqual(900);
    expect(REVEAL_TIMING.admire).toBeGreaterThanOrEqual(500);
    // Trois coffres se déroulent en moins d'une dizaine de secondes, même sans toucher.
    const total = 3 * (REVEAL_TIMING.tension + REVEAL_TIMING.burst + REVEAL_TIMING.admire);
    expect(total).toBeLessThan(10000);
  });
});
