import { CHARACTERS, DIFFICULTIES, SHOP_ITEMS, exportSave, importSave, shopCost, type SaveData } from './meta';
import { countUp } from './anim';
import { WEAPON_PREFIX } from './upgrades';
import { WEAPONS } from './weaponData';
import type { Upgrade } from './upgrades';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Élément #${id} introuvable`);
  return node as T;
}

/**
 * Crée l'élément d'une icône : un emoji (texte), ou un dessin SVG si la valeur commence par « <svg ».
 * Les icônes viennent du code du jeu (jamais de l'utilisateur), l'insertion de SVG est donc sûre.
 */
function iconElement(className: string, icon: string): HTMLSpanElement {
  const node = make('span', className);
  if (icon.startsWith('<svg')) node.innerHTML = icon;
  else node.textContent = icon;
  return node;
}

/** Crée un élément avec une classe et un texte. */
function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export interface UiHandlers {
  onPlay(): void;
  onMenu(): void;
  /** Ouverture / fermeture d'un écran (pour le son de clic). */
  onNavigate(): void;
  onSelectCharacter(id: string): void;
  onSelectWeapon(id: string): void;
  onSelectDifficulty(id: string): void;
  onBuy(id: string): void;
  onToggleSound(): void;
  /** Remplacement de la progression par une sauvegarde importée, déjà validée. */
  onImportSave(data: SaveData): void;
  onPause(): void;
  onResume(): void;
  /** Abandon de la partie en cours depuis le menu de pause. */
  onQuit(): void;
}

export interface GameOverInfo {
  time: number;
  kills: number;
  level: number;
  reward: number;
  /** Multiplicateur d'or de la difficulté jouée. */
  multiplier: number;
  isRecord: boolean;
}

/** Toute l'interface HTML posée par-dessus le canvas 3D : HUD, menu, boutique, écrans de partie. */
export class Ui {
  private hud = el('hud');
  private xpFill = el('xp-fill');
  private level = el('level');
  private hpFill = el('hp-fill');
  private hpGhost = el('hp-ghost');
  private hpBar = el('hp-bar');
  private hpLabel = el('hp-label');
  private timer = el('timer');
  private kills = el('kills');
  private gold = el('gold');
  private special = el('special');
  private specialHint = el('special-hint');
  private flash = el('hit-flash');
  private lowHp = el('low-hp');
  private start = el('overlay-start');
  private shop = el('overlay-shop');
  private levelUp = el('overlay-levelup');
  private cards = el('cards');
  private pause = el('overlay-pause');
  private gameOver = el('overlay-gameover');
  private playButton = el<HTMLButtonElement>('btn-start');
  private saveScreen = el('overlay-save');
  private saveCode = el<HTMLTextAreaElement>('save-code');
  private saveStatus = el('save-status');
  private importButton = el<HTMLButtonElement>('btn-import');
  /** Sauvegarde lue dans le champ, en attente de confirmation avant d'écraser la progression. */
  private pendingImport: SaveData | null = null;
  /** Animation de l'or du bilan de fin de partie en cours. */
  private rewardFrame = 0;

  constructor(
    private save: SaveData,
    private handlers: UiHandlers,
  ) {
    this.playButton.addEventListener('click', () => handlers.onPlay());
    el('btn-restart').addEventListener('click', () => handlers.onPlay());
    el('btn-menu').addEventListener('click', () => handlers.onMenu());
    el('btn-sound').addEventListener('click', () => handlers.onToggleSound());
    el('btn-pause').addEventListener('click', () => handlers.onPause());
    el('btn-resume').addEventListener('click', () => handlers.onResume());
    el('btn-quit').addEventListener('click', () => handlers.onQuit());
    el('btn-shop').addEventListener('click', () => {
      handlers.onNavigate();
      this.shop.classList.remove('hidden');
    });
    el('btn-shop-back').addEventListener('click', () => {
      handlers.onNavigate();
      this.shop.classList.add('hidden');
    });
    this.bindSaveScreen();
    this.refresh();
  }

  /** Écran d'export / import de la sauvegarde. */
  private bindSaveScreen(): void {
    const { handlers } = this;
    const fileInput = el<HTMLInputElement>('save-file');

    el('btn-save').addEventListener('click', () => {
      handlers.onNavigate();
      this.saveCode.value = '';
      this.resetImport();
      this.setSaveStatus('');
      this.saveScreen.classList.remove('hidden');
    });
    el('btn-save-back').addEventListener('click', () => {
      handlers.onNavigate();
      this.saveScreen.classList.add('hidden');
    });

    el('btn-export-copy').addEventListener('click', async () => {
      handlers.onNavigate();
      this.resetImport();
      // Le code est aussi affiché et sélectionné : si le presse-papiers est refusé, il reste copiable à la main.
      this.saveCode.value = exportSave(this.save);
      this.saveCode.select();
      try {
        await navigator.clipboard.writeText(this.saveCode.value);
        this.setSaveStatus('Code copié. Collez-le dans l’autre navigateur, ou envoyez-le-vous par message.');
      } catch {
        this.setSaveStatus('Copie automatique impossible : copiez le code affiché ci-dessus.');
      }
    });

    el('btn-export-file').addEventListener('click', () => {
      handlers.onNavigate();
      const url = URL.createObjectURL(new Blob([exportSave(this.save)], { type: 'text/plain' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'slime-rush-sauvegarde.txt';
      link.click();
      URL.revokeObjectURL(url);
      this.setSaveStatus('Fichier « slime-rush-sauvegarde.txt » téléchargé.');
    });

    el('btn-import-file').addEventListener('click', () => {
      handlers.onNavigate();
      fileInput.click();
    });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      // Permet de rechoisir le même fichier ensuite.
      fileInput.value = '';
      if (!file) return;
      this.saveCode.value = await file.text();
      this.previewImport();
    });

    // Toute modification du code annule une confirmation en attente.
    this.saveCode.addEventListener('input', () => {
      this.resetImport();
      this.setSaveStatus('');
    });

    this.importButton.addEventListener('click', () => {
      handlers.onNavigate();
      if (!this.pendingImport) {
        this.previewImport();
        return;
      }
      const data = this.pendingImport;
      this.resetImport();
      this.saveCode.value = '';
      handlers.onImportSave(data);
      this.setSaveStatus('Sauvegarde importée.');
    });
  }

  /** Premier temps de l'import : vérifie le code et annonce ce qui va remplacer la progression actuelle. */
  private previewImport(): void {
    const data = importSave(this.saveCode.value);
    if (!data) {
      this.resetImport();
      this.setSaveStatus(
        this.saveCode.value.trim() ? 'Ce code de sauvegarde n’est pas valide.' : 'Collez d’abord un code ou choisissez un fichier.',
        true,
      );
      return;
    }
    this.pendingImport = data;
    this.importButton.textContent = 'Confirmer';
    const best = data.bestTime > 0 ? formatTime(data.bestTime) : '--:--';
    const characters = `${data.unlocked.length} personnage${data.unlocked.length > 1 ? 's' : ''}`;
    this.setSaveStatus(
      `Sauvegarde trouvée : 🪙 ${data.gold} · 🏆 ${best} · ${characters}. Elle remplacera votre progression actuelle (🪙 ${this.save.gold}).`,
    );
  }

  private resetImport(): void {
    this.pendingImport = null;
    this.importButton.textContent = 'Importer';
  }

  private setSaveStatus(text: string, error = false): void {
    this.saveStatus.textContent = text;
    this.saveStatus.classList.toggle('error', error);
  }

  /** Active le bouton Jouer une fois les modèles chargés. */
  setReady(): void {
    this.playButton.disabled = false;
    this.playButton.textContent = 'Jouer';
  }

  /** Redessine le menu et la boutique d'après la sauvegarde. */
  refresh(): void {
    const { save } = this;
    el('menu-gold').textContent = `🪙 ${save.gold}`;
    el('shop-gold').textContent = `🪙 ${save.gold}`;
    el('best-start').textContent = save.bestTime > 0 ? `🏆 ${formatTime(save.bestTime)}` : '🏆 --:--';
    el('btn-sound').textContent = save.muted ? '🔇' : '🔊';

    const characters = el('characters');
    characters.replaceChildren();
    for (const c of CHARACTERS) {
      const unlocked = save.unlocked.includes(c.id);
      const selected = save.selected === c.id;
      const card = make('button', `char-card${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`);
      card.dataset.id = c.id;
      const status = selected ? '✔ Choisie' : unlocked ? 'Choisir' : `🪙 ${c.cost}`;
      card.append(make('span', 'char-name', c.name), make('span', 'char-desc', c.desc), make('span', 'char-status', status));
      card.addEventListener('click', () => this.handlers.onSelectCharacter(c.id));
      characters.append(card);
    }

    const weapons = el('weapons');
    weapons.replaceChildren();
    for (const w of WEAPONS) {
      const unlocked = save.weapons.includes(w.id);
      const selected = save.weapon === w.id;
      const card = make('button', `weapon-card${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`);
      card.dataset.id = w.id;
      const status = selected ? '✔ Choisie' : unlocked ? 'Choisir' : `🪙 ${w.cost}`;
      card.append(iconElement('weapon-icon', w.icon), make('span', 'char-name', w.name), make('span', 'char-desc', w.desc), make('span', 'char-status', status));
      card.addEventListener('click', () => this.handlers.onSelectWeapon(w.id));
      weapons.append(card);
    }

    const difficulty = el('difficulty');
    difficulty.replaceChildren();
    for (const d of DIFFICULTIES) {
      const button = make('button', `diff-btn${save.difficulty === d.id ? ' selected' : ''}`);
      button.dataset.id = d.id;
      button.append(make('span', 'diff-name', `${d.icon} ${d.name}`), make('span', 'diff-gold', `🪙 ×${d.gold}`));
      button.addEventListener('click', () => this.handlers.onSelectDifficulty(d.id));
      difficulty.append(button);
    }

    const items = el('shop-items');
    items.replaceChildren();
    for (const item of SHOP_ITEMS) {
      const level = save.shop[item.id] ?? 0;
      const maxed = level >= item.max;
      const cost = shopCost(item, level);
      const row = make('div', 'shop-row');
      const text = make('div', 'shop-text');
      text.append(
        make('span', 'shop-name', `${item.name} `),
        make('span', 'shop-level', `${level} / ${item.max}`),
        make('span', 'shop-desc', item.desc),
      );
      const buy = make('button', 'shop-buy', maxed ? 'MAX' : `🪙 ${cost}`);
      buy.dataset.id = item.id;
      buy.disabled = maxed || save.gold < cost;
      buy.addEventListener('click', () => this.handlers.onBuy(item.id));
      row.append(make('span', 'shop-icon', item.icon), text, buy);
      items.append(row);
    }
  }

  showMenu(): void {
    this.lowHp.classList.remove('active');
    this.refresh();
    for (const node of [this.hud, this.shop, this.saveScreen, this.levelUp, this.pause, this.gameOver]) node.classList.add('hidden');
    this.start.classList.remove('hidden');
  }

  showGame(): void {
    for (const node of [this.start, this.shop, this.saveScreen, this.levelUp, this.pause, this.gameOver]) node.classList.add('hidden');
    this.hud.classList.remove('hidden');
  }

  setPaused(paused: boolean): void {
    this.pause.classList.toggle('hidden', !paused);
  }

  updateHud(hp: number, maxHp: number, xpRatio: number, level: number, time: number, kills: number, gold: number, charge: number): void {
    const ready = charge >= 1;
    this.special.style.setProperty('--charge', `${Math.min(1, charge) * 360}deg`);
    this.special.classList.toggle('ready', ready);
    this.specialHint.classList.toggle('hidden', !ready);
    this.lowHp.classList.toggle('active', hp / maxHp < 0.3 && hp > 0);
    const hpRatio = Math.max(0, Math.min(1, hp / maxHp));
    this.hpFill.style.width = `${hpRatio * 100}%`;
    // La traînée claire rattrape la barre avec retard : on voit ce qu'un coup vient de coûter.
    this.hpGhost.style.width = `${hpRatio * 100}%`;
    this.hpBar.classList.toggle('low', hpRatio < 0.3);
    this.hpLabel.textContent = `${Math.ceil(hp)} / ${maxHp}`;
    this.xpFill.style.width = `${Math.min(1, xpRatio) * 100}%`;
    this.level.textContent = `Niv. ${level}`;
    this.timer.textContent = formatTime(time);
    this.kills.textContent = `💀 ${kills}`;
    this.gold.textContent = `🪙 ${Math.floor(gold)}`;
  }

  hurtFlash(): void {
    this.flash.animate([{ opacity: 0.7 }, { opacity: 0 }], { duration: 350, easing: 'ease-out' });
  }

  showLevelUp(choices: { upgrade: Upgrade; level: number }[], onPick: (upgrade: Upgrade) => void): void {
    this.cards.replaceChildren();
    choices.forEach(({ upgrade, level }, index) => {
      const isWeapon = upgrade.id.startsWith(WEAPON_PREFIX);
      const card = make('button', `card ${isWeapon ? 'weapon' : 'passive'}`);
      // Les cartes arrivent l'une après l'autre.
      card.style.setProperty('--i', String(index));
      card.append(
        make('span', 'card-tag', isWeapon ? 'Arme' : 'Bonus'),
        iconElement('card-icon', upgrade.icon),
        make('span', 'card-name', upgrade.name),
        make('span', 'card-desc', upgrade.desc),
        make('span', 'card-level', level === 0 ? 'Nouveau !' : `Niv. ${level} → ${level + 1}`),
      );
      card.addEventListener('click', () => {
        this.levelUp.classList.add('hidden');
        onPick(upgrade);
      });
      this.cards.append(card);
    });
    this.levelUp.classList.remove('hidden');
  }

  /** Fait monter l'or gagné de 0 à sa valeur, et le total avec lui. */
  private countReward(node: HTMLElement, info: GameOverInfo): void {
    cancelAnimationFrame(this.rewardFrame);
    const total = this.save.gold;
    const render = (earned: number) =>
      (node.textContent = `🪙 +${earned}${info.multiplier !== 1 ? ` (×${info.multiplier})` : ''} (total ${total - info.reward + earned})`);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (info.reward <= 0 || reduced) {
      render(info.reward);
      return;
    }
    render(0);
    const DURATION = 1000;
    const start = performance.now();
    // Laisse l'écran de fin s'afficher avant de commencer à compter.
    const tick = (now: number) => {
      const t = Math.max(0, (now - start - 350) / DURATION);
      render(countUp(0, info.reward, t));
      if (t < 1) this.rewardFrame = requestAnimationFrame(tick);
    };
    this.rewardFrame = requestAnimationFrame(tick);
  }

  showGameOver(info: GameOverInfo): void {
    this.lowHp.classList.remove('active');
    const stats = el('gameover-stats');
    const reward = make('span', 'reward');
    stats.replaceChildren(
      make('span', '', `⏱️ ${formatTime(info.time)}`),
      make('span', '', `💀 ${info.kills} ennemis`),
      make('span', '', `⭐ Niveau ${info.level}`),
      reward,
    );
    this.countReward(reward, info);
    el('best-gameover').textContent = info.isRecord
      ? 'Nouveau record !'
      : `Meilleur temps : ${formatTime(this.save.bestTime)}`;
    this.gameOver.classList.remove('hidden');
  }
}
