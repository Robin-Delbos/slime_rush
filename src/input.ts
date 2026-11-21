const JOYSTICK_RADIUS = 50;
/** Un appui plus court et plus immobile que ces seuils compte comme un "tap", pas comme un déplacement. */
const TAP_MAX_MS = 250;
const TAP_MAX_TRAVEL = 12;

/**
 * Entrées unifiées : clavier (ZQSD / WASD / flèches) et joystick flottant
 * (doigt ou clic maintenu n'importe où sur la zone de jeu).
 *
 * Jeu à deux mains sur mobile : le premier doigt posé déplace le héros ; tant qu'il reste posé, chaque autre doigt ne déplace
 * rien, mais un appui bref de sa part est un « tap » (attaque spéciale à l'endroit touché).
 */
export class Input {
  private keys = new Set<string>();
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private stickX = 0;
  private stickY = 0;
  private downTime = 0;
  /** Plus grand écart (px) entre le point d'appui et le doigt pendant l'appui en cours. */
  private travel = 0;
  /** Doigts posés en plus du premier : ils ne servent qu'à taper. */
  private extra = new Map<number, { x: number; y: number; time: number; travel: number }>();

  /** Appui bref sans glisser sur la zone de jeu (coordonnées écran). */
  onTap?: (clientX: number, clientY: number) => void;
  /** Touche d'action du clavier (barre d'espace). */
  onAction?: () => void;
  /** Touche de pause du clavier (Échap ou P). */
  onPause?: () => void;

  constructor(
    private surface: HTMLElement,
    private base: HTMLElement,
    private knob: HTMLElement,
  ) {
    window.addEventListener('keydown', (e) => {
      // La saisie dans un champ de texte (code de sauvegarde) ne pilote pas le jeu.
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      this.keys.add(e.code);
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        this.onAction?.();
      }
      if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) this.onPause?.();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.release();
    });

    surface.addEventListener('pointerdown', (e) => {
      if (this.pointerId !== null) {
        // Un autre doigt pendant que le premier déplace le héros : il ne touche pas au joystick, on suit son appui pour un éventuel tap.
        if (e.pointerId !== this.pointerId) this.extra.set(e.pointerId, { x: e.clientX, y: e.clientY, time: performance.now(), travel: 0 });
        return;
      }
      this.pointerId = e.pointerId;
      surface.setPointerCapture(e.pointerId);
      this.originX = e.clientX;
      this.originY = e.clientY;
      this.downTime = performance.now();
      this.travel = 0;
      base.style.left = `${e.clientX}px`;
      base.style.top = `${e.clientY}px`;
      base.classList.remove('hidden');
      this.moveStick(e.clientX, e.clientY);
    });
    surface.addEventListener('pointermove', (e) => {
      const extra = this.extra.get(e.pointerId);
      if (extra) extra.travel = Math.max(extra.travel, Math.hypot(e.clientX - extra.x, e.clientY - extra.y));
      else if (e.pointerId === this.pointerId) this.moveStick(e.clientX, e.clientY);
    });
    surface.addEventListener('pointerup', (e) => {
      const extra = this.extra.get(e.pointerId);
      if (extra) {
        this.extra.delete(e.pointerId);
        if (performance.now() - extra.time < TAP_MAX_MS && extra.travel < TAP_MAX_TRAVEL) this.onTap?.(e.clientX, e.clientY);
        return;
      }
      if (e.pointerId !== this.pointerId) return;
      const tap = performance.now() - this.downTime < TAP_MAX_MS && this.travel < TAP_MAX_TRAVEL;
      this.releaseStick();
      if (tap) this.onTap?.(e.clientX, e.clientY);
    });
    surface.addEventListener('pointercancel', (e) => {
      this.extra.delete(e.pointerId);
      if (e.pointerId === this.pointerId) this.releaseStick();
    });
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Direction voulue, longueur <= 1. `y` positif = vers le haut de l'écran. */
  get vector(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    // `code` désigne la touche physique : KeyW/KeyA correspondent à Z/Q en AZERTY.
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (x !== 0 || y !== 0) {
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    }
    return { x: this.stickX, y: this.stickY };
  }

  /** Relâche tout : le joystick et les doigts supplémentaires (utilisé quand un écran passe par-dessus le jeu). */
  release(): void {
    this.extra.clear();
    this.releaseStick();
  }

  /** Relâche le joystick seul : un doigt supplémentaire encore posé garde son tap possible. */
  private releaseStick(): void {
    if (this.pointerId !== null && this.surface.hasPointerCapture(this.pointerId)) {
      this.surface.releasePointerCapture(this.pointerId);
    }
    this.pointerId = null;
    this.stickX = 0;
    this.stickY = 0;
    this.base.classList.add('hidden');
  }

  private moveStick(clientX: number, clientY: number): void {
    let dx = clientX - this.originX;
    let dy = clientY - this.originY;
    const len = Math.hypot(dx, dy);
    this.travel = Math.max(this.travel, len);
    if (len > JOYSTICK_RADIUS) {
      dx = (dx / len) * JOYSTICK_RADIUS;
      dy = (dy / len) * JOYSTICK_RADIUS;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.stickX = dx / JOYSTICK_RADIUS;
    this.stickY = -dy / JOYSTICK_RADIUS;
  }
}
