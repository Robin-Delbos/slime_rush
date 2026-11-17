import type { ChestPrices } from './chests';
import type { StorageLike } from './meta';

/**
 * Mode dev : choisir son niveau et son temps de survie avant de lancer une partie, pour tester vite
 * (boss, niveau 100, fins de partie...). Il n'existe que dans la version de développement (`npm run dev`) :
 * `game.ts` ne charge ce module que si `import.meta.env.DEV` est vrai, et il disparaît donc de la version publiée.
 */

export interface DevSettings {
  /** Quand c'est actif, chaque partie démarre avec le niveau et le temps ci-dessous. */
  enabled: boolean;
  level: number;
  /** Temps de survie de départ, en minutes. */
  minutes: number;
  /** Donne au héros les améliorations d'un joueur de ce niveau (au hasard parmi celles proposées). */
  upgrades: boolean;
  /** Coffres à 1 pièce (et 2 pour le lot de trois), pour les tester sans farmer. Indépendant du reste du mode dev. */
  cheapChests: boolean;
}

/** Prix des coffres en mode dev. */
export const DEV_CHEST_PRICES: ChestPrices = { single: 1, bundle: 2 };

export const DEV_KEY = 'slime-rush.dev';
export const DEV_LIMITS = {
  level: { min: 1, max: 150 },
  minutes: { min: 0, max: 60 },
};

export function defaultDevSettings(): DevSettings {
  return { enabled: false, level: 1, minutes: 0, upgrades: true, cheapChests: false };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Reconstruit des réglages valides à partir de données quelconques (stockage, champs de saisie). */
export function sanitizeDevSettings(raw: unknown): DevSettings {
  const settings = defaultDevSettings();
  if (typeof raw !== 'object' || raw === null) return settings;
  const data = raw as Partial<Record<keyof DevSettings, unknown>>;
  if (typeof data.enabled === 'boolean') settings.enabled = data.enabled;
  if (typeof data.upgrades === 'boolean') settings.upgrades = data.upgrades;
  if (typeof data.cheapChests === 'boolean') settings.cheapChests = data.cheapChests;
  const level = Number(data.level);
  if (data.level !== '' && data.level !== null && Number.isFinite(level)) {
    settings.level = clamp(Math.floor(level), DEV_LIMITS.level.min, DEV_LIMITS.level.max);
  }
  const minutes = Number(data.minutes);
  if (data.minutes !== '' && data.minutes !== null && Number.isFinite(minutes)) {
    // Au demi-pas près : les champs avancent par 0,5 minute.
    settings.minutes = clamp(Math.round(minutes * 2) / 2, DEV_LIMITS.minutes.min, DEV_LIMITS.minutes.max);
  }
  return settings;
}

export function loadDevSettings(storage: StorageLike | null): DevSettings {
  try {
    const raw = storage?.getItem(DEV_KEY);
    return raw ? sanitizeDevSettings(JSON.parse(raw)) : defaultDevSettings();
  } catch {
    return defaultDevSettings();
  }
}

export function persistDevSettings(storage: StorageLike | null, settings: DevSettings): void {
  try {
    storage?.setItem(DEV_KEY, JSON.stringify(settings));
  } catch {
    // Stockage refusé : les réglages ne seront simplement pas conservés.
  }
}

/** Réglages de départ à passer à la simulation, ou null si le mode dev est inactif (ou ne change rien). */
export function devRunSetup(settings: DevSettings): { startLevel: number; startTime: number; autoUpgrades: boolean } | null {
  if (!settings.enabled) return null;
  return { startLevel: settings.level, startTime: settings.minutes * 60, autoUpgrades: settings.upgrades };
}

/** Prix des coffres imposés par le mode dev, ou null pour les prix normaux. */
export function devChestPrices(settings: DevSettings): ChestPrices | null {
  return settings.cheapChests ? DEV_CHEST_PRICES : null;
}

/** Texte court du bouton : « 🛠 Dev », ou le résumé des réglages quand le mode est actif. */
export function devSummary(settings: DevSettings): string {
  if (!settings.enabled) return settings.cheapChests ? '🛠 Dev · coffres 1' : '🛠 Dev';
  const total = Math.round(settings.minutes * 60);
  const time = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  return `🛠 Niv ${settings.level} · ${time}`;
}

/** Réglages rapides pour les cas de test les plus fréquents. */
export const DEV_PRESETS: { label: string; level: number; minutes: number }[] = [
  { label: 'Niv 25 · 5 min', level: 25, minutes: 5 },
  { label: 'Boss ×4 · 8 min', level: 60, minutes: 8 },
  { label: 'Niv 99 · 10 min', level: 99, minutes: 10 },
];

const STYLE = `
.dev-root { position: fixed; z-index: 60; top: calc(8px + env(safe-area-inset-top)); left: 8px; font: 600 13px/1.3 system-ui, sans-serif; color: #fff; }
.dev-tab { padding: 4px 10px; border: 2px solid #fff; border-radius: 14px; background: rgba(20, 30, 60, 0.85); color: #fff; font: inherit; cursor: pointer; }
.dev-tab.active { background: #b8760f; }
.dev-card { margin-top: 6px; width: 230px; padding: 10px; border: 2px solid #fff; border-radius: 12px; background: rgba(20, 30, 60, 0.94); display: flex; flex-direction: column; gap: 8px; }
.dev-card.hidden, .dev-root.hidden { display: none; }
.dev-card label { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dev-card input[type='number'] { width: 80px; padding: 3px 6px; border-radius: 6px; border: 1px solid #fff; background: #0f1630; color: #fff; font: inherit; }
.dev-presets { display: flex; flex-wrap: wrap; gap: 5px; }
.dev-presets button { padding: 3px 8px; border: 1px solid #fff; border-radius: 10px; background: #2c3f7a; color: #fff; font: inherit; cursor: pointer; }
.dev-note { margin: 0; font-size: 11px; font-weight: 500; opacity: 0.8; }
`;

function field(label: string, input: HTMLInputElement): HTMLLabelElement {
  const row = document.createElement('label');
  row.append(document.createTextNode(label), input);
  return row;
}

function numberInput(min: number, max: number, step: number): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  return input;
}

/** Panneau du mode dev, posé dans un coin du menu. */
export class DevTools {
  settings: DevSettings;

  private root = document.createElement('div');
  private tab = document.createElement('button');
  private card = document.createElement('div');
  private enabled = document.createElement('input');
  private level = numberInput(DEV_LIMITS.level.min, DEV_LIMITS.level.max, 1);
  private minutes = numberInput(DEV_LIMITS.minutes.min, DEV_LIMITS.minutes.max, 0.5);
  private upgrades = document.createElement('input');
  private cheap = document.createElement('input');

  constructor(
    private storage: StorageLike | null,
    parent: HTMLElement,
    visible: boolean,
    /** Appelé quand un réglage change (pour que le jeu mette son interface à jour). */
    private onChange: () => void = () => {},
  ) {
    this.settings = loadDevSettings(storage);

    const style = document.createElement('style');
    style.textContent = STYLE;
    this.root.className = 'dev-root';
    this.tab.className = 'dev-tab';
    this.tab.type = 'button';
    this.card.className = 'dev-card hidden';
    this.enabled.type = this.upgrades.type = this.cheap.type = 'checkbox';

    const presets = document.createElement('div');
    presets.className = 'dev-presets';
    for (const preset of DEV_PRESETS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = preset.label;
      button.addEventListener('click', () => {
        this.level.value = String(preset.level);
        this.minutes.value = String(preset.minutes);
        this.enabled.checked = true;
        this.read();
      });
      presets.append(button);
    }
    const note = document.createElement('p');
    note.className = 'dev-note';
    note.textContent = 'Mode dev (version de développement uniquement). Les records de temps ne sont pas modifiés. « Coffres à 1 pièce » : 1 pièce le coffre, 2 pour trois.';

    this.card.append(
      field('Actif', this.enabled),
      field('Niveau', this.level),
      field('Temps (min)', this.minutes),
      field('Améliorations auto', this.upgrades),
      field('Coffres à 1 pièce', this.cheap),
      presets,
      note,
    );
    this.root.append(style, this.tab, this.card);
    parent.append(this.root);

    this.tab.addEventListener('click', () => this.card.classList.toggle('hidden'));
    for (const input of [this.enabled, this.level, this.minutes, this.upgrades, this.cheap]) input.addEventListener('input', () => this.read());
    this.write();
    this.setVisible(visible);
  }

  /** Affiché seulement dans le menu, pas pendant une partie. */
  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  /** Prix des coffres : 1 et 2 pièces si l'option est cochée, sinon null (prix normaux). */
  chestPrices(): ChestPrices | null {
    return devChestPrices(this.settings);
  }

  /** Réglages à appliquer à la prochaine partie, ou null si le mode est inactif. */
  runSetup(): ReturnType<typeof devRunSetup> {
    return devRunSetup(this.settings);
  }

  /** Lit les champs, corrige les valeurs hors limites et enregistre. */
  private read(): void {
    this.settings = sanitizeDevSettings({
      enabled: this.enabled.checked,
      level: this.level.value,
      minutes: this.minutes.value,
      upgrades: this.upgrades.checked,
      cheapChests: this.cheap.checked,
    });
    persistDevSettings(this.storage, this.settings);
    this.write(false);
    this.onChange();
  }

  /** Reporte les réglages dans les champs (sauf celui en cours de saisie, pour ne pas gêner la frappe). */
  private write(fields = true): void {
    if (fields) {
      this.enabled.checked = this.settings.enabled;
      this.level.value = String(this.settings.level);
      this.minutes.value = String(this.settings.minutes);
      this.upgrades.checked = this.settings.upgrades;
      this.cheap.checked = this.settings.cheapChests;
    }
    this.tab.textContent = devSummary(this.settings);
    this.tab.classList.toggle('active', this.settings.enabled || this.settings.cheapChests);
  }
}
