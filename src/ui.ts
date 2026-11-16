import { CHARACTERS, SHOP_ITEMS, shopCost, type SaveData } from './meta';
import type { Upgrade } from './upgrades';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Élément #${id} introuvable`);
  return node as T;
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
  onBuy(id: string): void;
  onToggleSound(): void;
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
  isRecord: boolean;
}

/** Toute l'interface HTML posée par-dessus le canvas 3D : HUD, menu, boutique, écrans de partie. */
export class Ui {
  private hud = el('hud');
  private xpFill = el('xp-fill');
  private level = el('level');
  private hpFill = el('hp-fill');
  private hpLabel = el('hp-label');
  private timer = el('timer');
  private kills = el('kills');
  private gold = el('gold');
  private special = el('special');
  private specialHint = el('special-hint');
  private flash = el('hit-flash');
  private start = el('overlay-start');
  private shop = el('overlay-shop');
  private levelUp = el('overlay-levelup');
  private cards = el('cards');
  private pause = el('overlay-pause');
  private gameOver = el('overlay-gameover');
  private playButton = el<HTMLButtonElement>('btn-start');

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
    this.refresh();
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
      const status = selected ? '✔ Sélectionné' : unlocked ? 'Choisir' : `🪙 ${c.cost}`;
      card.append(make('span', 'char-name', c.name), make('span', 'char-desc', c.desc), make('span', 'char-status', status));
      card.addEventListener('click', () => this.handlers.onSelectCharacter(c.id));
      characters.append(card);
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
    this.refresh();
    for (const node of [this.hud, this.shop, this.levelUp, this.pause, this.gameOver]) node.classList.add('hidden');
    this.start.classList.remove('hidden');
  }

  showGame(): void {
    for (const node of [this.start, this.shop, this.levelUp, this.pause, this.gameOver]) node.classList.add('hidden');
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
    this.hpFill.style.width = `${(hp / maxHp) * 100}%`;
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
    for (const { upgrade, level } of choices) {
      const card = make('button', 'card');
      card.append(
        make('span', 'card-icon', upgrade.icon),
        make('span', 'card-name', upgrade.name),
        make('span', 'card-desc', upgrade.desc),
        make('span', 'card-level', level === 0 ? 'Nouveau !' : `Niv. ${level} → ${level + 1}`),
      );
      card.addEventListener('click', () => {
        this.levelUp.classList.add('hidden');
        onPick(upgrade);
      });
      this.cards.append(card);
    }
    this.levelUp.classList.remove('hidden');
  }

  showGameOver(info: GameOverInfo): void {
    const stats = el('gameover-stats');
    stats.replaceChildren(
      make('span', '', `⏱️ ${formatTime(info.time)}`),
      make('span', '', `💀 ${info.kills} ennemis`),
      make('span', '', `⭐ Niveau ${info.level}`),
      make('span', 'reward', `🪙 +${info.reward} (total ${this.save.gold})`),
    );
    el('best-gameover').textContent = info.isRecord
      ? 'Nouveau record !'
      : `Meilleur temps : ${formatTime(this.save.bestTime)}`;
    this.gameOver.classList.remove('hidden');
  }
}
