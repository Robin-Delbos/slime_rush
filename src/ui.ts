import { CHARACTERS, DIFFICULTIES, SHOP_ITEMS, exportSave, hasLegend, importSave, shopCost, type SaveData } from './meta';
import { AMULETS, AMULET_MAX_LEVEL, amuletOf } from './amulets';
import { countUp } from './anim';
import { CHEST_BUNDLE, rewardView, type ChestPrices, type ChestReward } from './chests';
import { REVEAL_TIMING, RevealFlow } from './reveal';
import { CATEGORIES, CATEGORY_LABELS, COSMETICS, type CosmeticCategory } from './cosmetics';
import { WEAPON_PREFIX } from './upgrades';
import { VERSION_LABEL } from './version';
import { WEAPONS } from './weaponData';
import type { Upgrade } from './upgrades';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Élément #${id} introuvable`);
  return node as T;
}

/** Coffre au trésor : un corps et un couvercle séparés, pour que le couvercle puisse s'ouvrir. */
const CHEST_ART =
  '<svg class="chest-lid" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" aria-hidden="true"><g stroke="#3b2412" stroke-width="3" stroke-linejoin="round">' +
  '<path d="M10 48Q10 8 50 8Q90 8 90 48Z" fill="#b5733c"/>' +
  '<path d="M10 40Q50 28 90 40V48H10Z" fill="#ffc93c" stroke="#8a5a0a" stroke-width="2.5"/>' +
  '<path d="M30 12V46M70 12V46" fill="none" stroke="#7a4a24" stroke-width="2.5"/>' +
  '<ellipse cx="38" cy="20" rx="9" ry="4" fill="#fff" opacity="0.35" stroke="none"/></g></svg>' +
  '<span class="chest-glow"></span>' +
  '<svg class="chest-body" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" aria-hidden="true"><g stroke="#3b2412" stroke-width="3" stroke-linejoin="round">' +
  '<rect x="10" y="2" width="80" height="44" rx="7" fill="#9a6232"/>' +
  '<path d="M10 20H90M10 34H90" fill="none" stroke="#7a4a24" stroke-width="2"/>' +
  '<rect x="10" y="9" width="80" height="9" fill="#ffc93c" stroke="#8a5a0a" stroke-width="2.5"/>' +
  '<rect x="42" y="6" width="16" height="22" rx="4" fill="#ffd84d" stroke="#8a5a0a" stroke-width="2.5"/>' +
  '<circle cx="50" cy="15" r="3" fill="#3b2412" stroke="none"/><rect x="48.5" y="15" width="3" height="8" fill="#3b2412" stroke="none"/></g></svg>';

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
  /** Ouvre `count` coffres. Renvoie leur contenu, ou null s'il manque des pièces. */
  onOpenChests(count: number): ChestReward[] | null;
  /** Équipe une amulette pour la prochaine partie (id vide : aucune). */
  onEquipAmulet(id: string, level: number): void;
  onSelectCosmetic(category: CosmeticCategory, id: string): void;
  /** Prix actuels des coffres (ceux du jeu, ou ceux du mode dev). */
  chestPrices(): ChestPrices;
  /** Un son de l'ouverture des coffres (impact, grondement, éclat, rareté du contenu, suite, récapitulatif). */
  onChestSound(sound: 'rumble' | 'thud' | 'boom' | 'common' | 'rare' | 'legendary' | 'next' | 'recap'): void;
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
  private bossBars = el('boss-bars');
  private banner = el('banner');
  private bannerTimer = 0;
  private legendPill = el('legend');
  private legendShown = 0;
  private pause = el('overlay-pause');
  private gameOver = el('overlay-gameover');
  private playButton = el<HTMLButtonElement>('btn-start');
  private saveScreen = el('overlay-save');
  private chestScreen = el('overlay-chests');
  private collection = el('overlay-collection');
  private reveal = el('overlay-reveal');
  private revealStage = el('reveal-stage');
  private revealFlow: RevealFlow | null = null;
  private revealRewards: ChestReward[] = [];
  /** Délais de l'animation d'ouverture en cours (annulés si on quitte l'écran). */
  private chestTimers: number[] = [];
  private saveCode = el<HTMLTextAreaElement>('save-code');
  private saveStatus = el('save-status');
  private importButton = el<HTMLButtonElement>('btn-import');
  /** Sauvegarde lue dans le champ, en attente de confirmation avant d'écraser la progression. */
  private pendingImport: SaveData | null = null;
  /** Animation de l'or du bilan de fin de partie en cours. */
  private rewardFrame = 0;
  /** Dernier texte écrit dans chaque élément du HUD (voir setText). */
  private shownText = new Map<HTMLElement, string>();

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
    this.bindChestScreens();
    el('version').textContent = VERSION_LABEL;
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
      // Une arme de coffre reste secrète tant qu'elle n'est pas trouvée.
      if (w.chest && !unlocked) continue;
      const selected = save.weapon === w.id;
      const card = make('button', `weapon-card${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`);
      card.dataset.id = w.id;
      const status = selected ? '✔ Choisie' : unlocked ? 'Choisir' : `🪙 ${w.cost}`;
      card.append(iconElement('weapon-icon', w.icon), make('span', 'char-name', w.name), make('span', 'char-desc', w.desc), make('span', 'char-status', status));
      // Le badge n'apparaît que pour la difficulté avec laquelle le niveau 100 a été atteint.
      if (hasLegend(save, w.id)) {
        const badge = make('span', 'legend-badge', '🏆');
        const difficulty = DIFFICULTIES.find((d) => d.id === save.difficulty)?.name ?? '';
        badge.title = `Niveau 100 atteint avec cette arme en difficulté ${difficulty}`;
        card.append(badge);
      }
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

    this.refreshChests();
    this.refreshCollection();

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

  /** Écran des coffres : or, prix, et boutons grisés quand il manque des pièces. */
private refreshChests(): void {
    const gold = this.save.gold;
    const prices = this.handlers.chestPrices();
    el('chest-gold').textContent = `🪙 ${gold}`;
    el<HTMLButtonElement>('btn-chest-1').disabled = gold < prices.single;
    el<HTMLButtonElement>('btn-chest-3').disabled = gold < prices.bundle;
    el('btn-chest-1').textContent = `🎁 Un coffre · ${prices.single} 🪙`;
    el('btn-chest-3').textContent = `🎁 ${CHEST_BUNDLE.count} coffres · ${prices.bundle} 🪙`;
    // Le bouton du menu s'anime et porte un « ! » dès qu'on a de quoi ouvrir un coffre.
    el('btn-chests').classList.toggle('ready', gold >= prices.single);
  }

  /** Écran de collection : amulettes en stock (une équipée), puis les apparences par catégorie. */
  private refreshCollection(): void {
    const { save } = this;
    const body = el('collection-body');
    body.replaceChildren();

    const amuletBox = make('section', 'collection-section');
    amuletBox.append(make('h3', 'section-title', 'Amulette de la prochaine partie'));
    amuletBox.append(make('p', 'hint', 'Consommée au lancement : son effet ne dure que pour une partie. Plusieurs exemplaires la renforcent.'));
    const stock = AMULETS.filter((a) => (save.amulets[a.id] ?? 0) > 0);
    if (stock.length === 0) amuletBox.append(make('p', 'hint', 'Aucune amulette pour l’instant : ouvrez des coffres !'));
    for (const a of stock) {
      const count = save.amulets[a.id];
      const equipped = save.amulet === a.id;
      const level = equipped ? Math.min(save.amuletLevel, count, AMULET_MAX_LEVEL) : 1;
      const row = make('div', `amulet-row${equipped ? ' equipped' : ''}`);
      row.dataset.id = a.id;
      const text = make('div', 'amulet-text');
      text.append(make('span', 'amulet-name', `${a.name} ×${count}`), make('span', 'amulet-desc', `Niveau ${level} : ${a.describe(level)}`));
      const actions = make('div', 'amulet-actions');
      if (equipped) {
        const minus = make('button', 'step-btn', '−');
        minus.disabled = level <= 1;
        minus.addEventListener('click', () => this.handlers.onEquipAmulet(a.id, level - 1));
        const plus = make('button', 'step-btn', '+');
        plus.disabled = level >= Math.min(count, AMULET_MAX_LEVEL);
        plus.addEventListener('click', () => this.handlers.onEquipAmulet(a.id, level + 1));
        const remove = make('button', 'amulet-toggle', 'Retirer');
        remove.addEventListener('click', () => this.handlers.onEquipAmulet('', 1));
        actions.append(minus, plus, remove);
      } else {
        const equip = make('button', 'amulet-toggle', 'Équiper');
        equip.addEventListener('click', () => this.handlers.onEquipAmulet(a.id, 1));
        actions.append(equip);
      }
      row.append(iconElement('amulet-icon', a.icon), text, actions);
      amuletBox.append(row);
    }
    body.append(amuletBox);

    for (const category of CATEGORIES) {
      const box = make('section', 'collection-section');
      box.append(make('h3', 'section-title', CATEGORY_LABELS[category]));
      const swatches = make('div', 'swatches');
      for (const c of COSMETICS[category]) {
        const owned = save.cosmetics[category].includes(c.id);
        const button = make('button', `swatch${save.style[category] === c.id ? ' selected' : ''}${owned ? '' : ' locked'}`);
        button.dataset.category = category;
        button.dataset.id = c.id;
        button.disabled = !owned;
        const dot = make('span', 'swatch-dot');
        if (c.color === 'rainbow') dot.classList.add('rainbow');
        else if (c.color !== null) dot.style.background = '#' + c.color.toString(16).padStart(6, '0');
        else dot.classList.add('plain');
        button.append(dot, make('span', 'swatch-name', owned ? c.name : '🔒 ???'));
        button.addEventListener('click', () => this.handlers.onSelectCosmetic(category, c.id));
        swatches.append(button);
      }
      box.append(swatches);
      body.append(box);
    }
  }

  /** Boutons des écrans « Coffres » et « Collection ». */
  private bindChestScreens(): void {
    const { handlers } = this;
    const open = (screen: HTMLElement) => {
      handlers.onNavigate();
      this.shop.classList.add('hidden');
      this.saveScreen.classList.add('hidden');
      this.chestScreen.classList.add('hidden');
      this.collection.classList.add('hidden');
      screen.classList.remove('hidden');
    };
    el('btn-chests').addEventListener('click', () => {
      el('chest-status').textContent = '';
      open(this.chestScreen);
    });
    el('btn-collection').addEventListener('click', () => open(this.collection));
    el('btn-open-collection').addEventListener('click', () => open(this.collection));
    el('btn-chests-back').addEventListener('click', () => {
      handlers.onNavigate();
      this.clearChestTimers();
      this.chestScreen.classList.add('hidden');
    });
    el('btn-collection-back').addEventListener('click', () => {
      handlers.onNavigate();
      this.collection.classList.add('hidden');
    });
    el('btn-chest-1').addEventListener('click', () => this.openChests(1));
    // Plein écran : un toucher ouvre le coffre qui tremble, ou passe à la carte suivante.
    this.reveal.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('button')) return;
      this.tapReveal();
    });
    el('reveal-again').addEventListener('click', () => this.openChests(this.revealRewards.length === CHEST_BUNDLE.count ? CHEST_BUNDLE.count : 1));
    el('reveal-close').addEventListener('click', () => this.closeReveal());
    el('btn-chest-3').addEventListener('click', () => this.openChests(CHEST_BUNDLE.count));
  }

private clearChestTimers(): void {
    for (const timer of this.chestTimers) window.clearTimeout(timer);
    this.chestTimers = [];
  }

  private later(ms: number, action: () => void): void {
    this.chestTimers.push(window.setTimeout(action, ms));
  }

  private vibrate(pattern: number[]): void {
    navigator.vibrate?.(pattern);
  }

  /** Confettis qui tombent sur tout l'écran (plus il y en a, plus le contenu est rare). */
  private confetti(tier: 'common' | 'rare' | 'legendary'): void {
    const fx = el('reveal-fx');
    const palette = tier === 'legendary' ? ['#ffd84d', '#ffffff', '#ff9a3d', '#fff27a', '#ff7ad9'] : tier === 'rare' ? ['#d8b8ff', '#ffffff', '#a97bff', '#6fe9ff'] : ['#c9d7f5', '#ffffff', '#8fb0ff'];
    const count = tier === 'legendary' ? 80 : tier === 'rare' ? 45 : 22;
    for (let i = 0; i < count; i++) {
      const piece = make('span', 'confetti');
      piece.style.setProperty('--x', `${Math.random() * 100}%`);
      piece.style.setProperty('--c', palette[i % palette.length]);
      piece.style.setProperty('--d', `${1.6 + Math.random() * 1.8}s`);
      piece.style.setProperty('--delay', `${Math.random() * 0.5}s`);
      fx.append(piece);
      this.later(3800, () => piece.remove());
    }
  }

  /** Étincelles qui jaillissent du centre de l'écran au moment de l'éclat. */
  private burstSparks(tier: 'common' | 'rare' | 'legendary'): void {
    const fx = el('reveal-fx');
    const palette = tier === 'legendary' ? ['#ffd84d', '#ffffff', '#ff9a3d'] : tier === 'rare' ? ['#d8b8ff', '#ffffff'] : ['#c9d7f5', '#ffffff'];
    const count = tier === 'legendary' ? 46 : tier === 'rare' ? 30 : 18;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 120 + Math.random() * 220;
      const spark = make('span', 'reveal-spark');
      spark.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
      spark.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
      spark.style.setProperty('--c', palette[i % palette.length]);
      fx.append(spark);
      this.later(1100, () => spark.remove());
    }
  }

  private setRevealPhase(): void {
    this.reveal.dataset.phase = this.revealFlow?.phase ?? 'tension';
  }

  /**
   * Lance l'ouverture plein écran des coffres tirés : pour chacun, tension, éclat, grande carte du contenu ;
   * puis, après plusieurs coffres, un récapitulatif, et l'envie d'en ouvrir d'autres.
   */
  private startReveal(rewards: ChestReward[]): void {
    this.clearChestTimers();
    this.reveal.classList.remove('quake', 'rumbling');
    el('reveal-fx').replaceChildren();
    this.revealRewards = rewards;
    this.revealFlow = new RevealFlow(rewards.length);
    this.reveal.classList.remove('hidden');
    el('reveal-actions').classList.add('hidden');
    this.showRevealChest();
  }

  /** Le coffre tombe et tremble de plus en plus, avec un grondement. */
  private showRevealChest(): void {
    const flow = this.revealFlow!;
    this.setRevealPhase();
    delete this.reveal.dataset.tier;
    el('reveal-count').textContent = flow.counter;
    el('reveal-hint').textContent = 'Touchez pour ouvrir';
    const chest = make('div', 'reveal-chest tension');
    chest.innerHTML = CHEST_ART;
    this.revealStage.replaceChildren(chest);
    // Il tombe d'abord en silence, puis touche le sol : impact, poussière, et le grondement commence.
    this.later(REVEAL_TIMING.impact, () => this.chestImpact());
    this.later(REVEAL_TIMING.tension, () => this.burstReveal());
  }

  /**
   * Le coffre touche le sol : choc sourd, onde de choc et poussière à sa base, écran qui tressaute ; puis le grondement
   * commence (tremblement de l'écran, étincelles qui s'échappent du couvercle) et dure jusqu'à l'éclat.
   */
  private chestImpact(): void {
    const chest = this.revealStage.querySelector<HTMLElement>('.reveal-chest');
    if (!chest || this.revealFlow?.phase !== 'tension') return;
    const rect = chest.getBoundingClientRect();
    const fx = el('reveal-fx');
    const baseX = rect.left + rect.width / 2;
    const baseY = rect.bottom - 10;

    const ring = make('span', 'reveal-impact');
    ring.style.left = `${baseX}px`;
    ring.style.top = `${baseY}px`;
    fx.append(ring);
    this.later(700, () => ring.remove());
    for (let i = 0; i < 14; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const dust = make('span', 'reveal-dust');
      dust.style.left = `${baseX}px`;
      dust.style.top = `${baseY}px`;
      dust.style.setProperty('--dx', `${side * (50 + Math.random() * 130)}px`);
      dust.style.setProperty('--dy', `${-(8 + Math.random() * 34)}px`);
      fx.append(dust);
      this.later(900, () => dust.remove());
    }

    this.handlers.onChestSound('thud');
    this.handlers.onChestSound('rumble');
    this.vibrate([90, 50, 40, 40, 40, 40, 40]);
    // Une secousse franche à l'impact, puis un tremblement continu pendant le grondement.
    this.reveal.classList.add('quake');
    this.later(420, () => {
      this.reveal.classList.remove('quake');
      this.reveal.classList.add('rumbling');
    });
    // Des étincelles s'échappent du couvercle de plus en plus vite.
    for (let k = 0; k < 9; k++) {
      this.later(150 + k * 110, () => {
        const spark = make('span', 'reveal-leak');
        spark.style.left = `${baseX + (Math.random() - 0.5) * rect.width * 0.6}px`;
        spark.style.top = `${rect.top + rect.height * 0.3}px`;
        spark.style.setProperty('--dx', `${(Math.random() - 0.5) * 60}px`);
        fx.append(spark);
        this.later(800, () => spark.remove());
      });
    }
  }

  /** L'éclat : le couvercle saute, flash et secousse d'écran, puis la carte arrive. */
  private burstReveal(): void {
    const flow = this.revealFlow;
    if (!flow || !flow.openNow()) return;
    this.setRevealPhase();
    const reward = this.revealRewards[flow.index];
    const view = rewardView(reward);
    const chest = this.revealStage.querySelector('.reveal-chest');
    chest?.classList.remove('tension');
    chest?.classList.add('open');
    this.reveal.classList.remove('rumbling');
    el('reveal-hint').textContent = '';
    const flash = el('reveal-flash');
    flash.className = view.tier === 'legendary' ? 'go gold' : 'go';
    this.reveal.classList.add('quake');
    this.later(520, () => this.reveal.classList.remove('quake'));
    this.burstSparks(view.tier);
    this.handlers.onChestSound('boom');
    this.vibrate(view.tier === 'legendary' ? [80, 40, 160, 40, 240] : [70]);
    this.later(REVEAL_TIMING.burst, () => this.showRevealCard());
  }

  /** La grande carte du contenu, avec son annonce, ses rayons et ses confettis. */
  private showRevealCard(): void {
    const flow = this.revealFlow;
    if (!flow || !flow.showCard()) return;
    this.setRevealPhase();
    const reward = this.revealRewards[flow.index];
    const view = rewardView(reward);
    this.reveal.dataset.tier = view.tier;

    const card = make('div', `reveal-card ${view.tier}`);
    const title = make('span', 'reveal-title', view.title);
    // Pour des pièces, le montant défile de 0 à sa valeur.
    if (view.amount !== undefined) this.countCoins(title, view.amount);
    card.append(make('span', 'reveal-tier-label', view.label), iconElement('reveal-icon', view.icon), title, make('span', 'reveal-sub', view.subtitle));
    if (reward.type === 'amulet') card.append(make('span', 'reveal-stock', `${this.save.amulets[reward.id] ?? 1} en stock`));
    this.revealStage.replaceChildren(card);

    this.handlers.onChestSound(view.tier);
    this.confetti(view.tier);
    this.vibrate(view.tier === 'common' ? [40] : [50, 30, 90]);
    this.later(REVEAL_TIMING.admire, () => this.readyReveal());
  }

  /** Fait défiler le montant d'un trésor de 0 à sa valeur. */
  private countCoins(node: HTMLElement, amount: number): void {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      node.textContent = `${amount} pièces`;
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 900;
      node.textContent = `${countUp(0, amount, t)} pièces`;
      if (t < 1 && node.isConnected) requestAnimationFrame(tick);
    };
    node.textContent = '0 pièces';
    requestAnimationFrame(tick);
  }

  /** On peut maintenant passer la carte (ou, pour un coffre unique, les boutons de fin apparaissent). */
  private readyReveal(): void {
    const flow = this.revealFlow;
    if (!flow || !flow.makeReady()) return;
    this.setRevealPhase();
    if (flow.phase === 'end') {
      el('reveal-hint').textContent = '';
      this.showRevealActions();
    } else {
      el('reveal-hint').textContent = 'Touchez pour continuer';
    }
  }

  /** Un toucher sur le plein écran : ouvre le coffre qui tremble, ou passe à la suite. */
  private tapReveal(): void {
    const flow = this.revealFlow;
    if (!flow) return;
    if (flow.phase === 'tension') {
      this.burstReveal();
      return;
    }
    const next = flow.advance();
    if (next === 'chest') {
      this.handlers.onChestSound('next');
      el('reveal-flash').className = '';
      this.showRevealChest();
    } else if (next === 'recap') {
      this.showRecap();
    }
  }

  /** Récapitulatif après plusieurs coffres : tout le butin d'un coup d'œil. */
  private showRecap(): void {
    const flow = this.revealFlow!;
    flow.finish();
    this.setRevealPhase();
    delete this.reveal.dataset.tier;
    el('reveal-count').textContent = '';
    el('reveal-hint').textContent = '';
    const recap = make('div', 'reveal-recap');
    recap.append(make('h2', 'reveal-recap-title', 'Butin'));
    const grid = make('div', 'reveal-grid');
    for (const reward of this.revealRewards) {
      const view = rewardView(reward);
      const mini = make('div', `reveal-mini ${view.tier}`);
      mini.append(iconElement('reveal-mini-icon', view.icon), make('span', 'reveal-mini-title', view.title), make('span', 'reveal-mini-sub', view.label));
      grid.append(mini);
    }
    recap.append(grid);
    this.revealStage.replaceChildren(recap);
    this.handlers.onChestSound('recap');
    this.confetti('rare');
    this.showRevealActions();
  }

  /** Boutons de fin : en ouvrir d'autres (avec le prix), ou terminer. */
  private showRevealActions(): void {
    const again = el<HTMLButtonElement>('reveal-again');
    const prices = this.handlers.chestPrices();
    const bundle = this.revealRewards.length === CHEST_BUNDLE.count;
    const price = bundle ? prices.bundle : prices.single;
    again.textContent = `🎁 Encore ${bundle ? CHEST_BUNDLE.count + ' coffres' : 'un coffre'} · ${price} 🪙`;
    again.disabled = this.save.gold < price;
    el('reveal-actions').classList.remove('hidden');
  }

  private closeReveal(): void {
    this.clearChestTimers();
    this.reveal.classList.remove('quake', 'rumbling');
    el('reveal-fx').replaceChildren();
    this.revealFlow = null;
    this.reveal.classList.add('hidden');
    this.revealStage.replaceChildren();
    this.refresh();
  }

  /** Ouvre des coffres : débite, tire le contenu, puis lance l'ouverture plein écran. */
  private openChests(count: number): void {
    const rewards = this.handlers.onOpenChests(count);
    const status = el('chest-status');
    if (!rewards) {
      status.textContent = 'Pas assez de pièces.';
      status.classList.add('error');
      // Le plein écran peut être ouvert (bouton « Encore ») : on le ferme pour montrer le message.
      if (!this.reveal.classList.contains('hidden')) this.closeReveal();
      return;
    }
    status.classList.remove('error');
    status.textContent = '';
    this.startReveal(rewards);
  }

  showMenu(): void {
    this.lowHp.classList.remove('active');
    this.refresh();
    for (const node of [this.hud, this.shop, this.saveScreen, this.chestScreen, this.collection, this.levelUp, this.pause, this.gameOver]) node.classList.add('hidden');
    this.start.classList.remove('hidden');
  }

  showGame(): void {
    for (const node of [this.start, this.shop, this.saveScreen, this.chestScreen, this.collection, this.levelUp, this.pause, this.gameOver]) node.classList.add('hidden');
    this.hud.classList.remove('hidden');
  }

  setPaused(paused: boolean): void {
    this.pause.classList.toggle('hidden', !paused);
  }

  /**
   * Change un texte seulement s'il est différent. Évite de réécrire chaque image un texte qui contient un emoji
   * (remplacé par une image) : l'image serait recréée soixante fois par seconde.
   */
  private setText(node: HTMLElement, text: string): void {
    if (this.shownText.get(node) === text) return;
    this.shownText.set(node, text);
    node.textContent = text;
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
    this.setText(this.hpLabel, `${Math.ceil(hp)} / ${maxHp}`);
    this.xpFill.style.width = `${Math.min(1, xpRatio) * 100}%`;
    this.setText(this.level, `Niv. ${level}`);
    this.setText(this.timer, formatTime(time));
    this.setText(this.kills, `💀 ${kills}`);
    this.setText(this.gold, `🪙 ${Math.floor(gold)}`);
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
        make('span', 'card-tag', isWeapon ? 'Arme' : 'Passif'),
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

  /** Compte à rebours du mode Légende (0 ou moins : masqué). */
  setLegend(secondsLeft: number): void {
    const seconds = Math.ceil(secondsLeft);
    if (seconds === this.legendShown) return;
    this.legendShown = seconds;
    this.legendPill.classList.toggle('hidden', seconds <= 0);
    if (seconds > 0) this.legendPill.textContent = `👑 Légende ${seconds} s`;
  }

  /** Bannière centrale qui s'affiche un instant (arrivée d'un boss). */
  showBanner(text: string, kind: 'boss' | 'legend' = 'boss'): void {
    this.banner.textContent = text;
    this.banner.classList.toggle('legend', kind === 'legend');
    this.banner.classList.remove('hidden', 'show');
    // Relance l'animation même si une bannière précédente est encore affichée.
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.add('hidden'), 2600);
  }

  /**
   * Barres de vie des boss. `x` et `y` sont en pourcentage de l'écran ; `off` indique un boss hors de l'écran,
   * dont la barre est alors ramenée au bord pour montrer d'où il vient.
   */
  setBossBars(bars: { x: number; y: number; ratio: number; off: boolean }[]): void {
    while (this.bossBars.children.length < bars.length) {
      const bar = make('div', 'boss-bar');
      bar.append(make('span', 'boss-skull', '💀'), make('div', 'boss-track'));
      bar.lastElementChild!.append(make('div', 'boss-fill'));
      this.bossBars.append(bar);
    }
    while (this.bossBars.children.length > bars.length) this.bossBars.lastElementChild!.remove();
    bars.forEach((b, i) => {
      const node = this.bossBars.children[i] as HTMLElement;
      node.style.left = `${b.x}%`;
      node.style.top = `${b.y}%`;
      node.classList.toggle('off', b.off);
      (node.querySelector('.boss-fill') as HTMLElement).style.width = `${Math.max(0, Math.min(1, b.ratio)) * 100}%`;
    });
  }

  /** Fait monter l'or gagné de 0 à sa valeur, et le total avec lui. */
  private countReward(node: HTMLElement, info: GameOverInfo): void {
    cancelAnimationFrame(this.rewardFrame);
    const total = this.save.gold;
    // Le texte est en morceaux : seuls les deux nombres changent à chaque image (l'icône de pièce reste en place).
    const earnedNode = make('span', '');
    const totalNode = make('span', '');
    const bonus = info.multiplier !== 1 ? ` (×${info.multiplier})` : '';
    node.replaceChildren(document.createTextNode('🪙 +'), earnedNode, document.createTextNode(`${bonus} (total `), totalNode, document.createTextNode(')'));
    const render = (earned: number) => {
      earnedNode.textContent = String(earned);
      totalNode.textContent = String(total - info.reward + earned);
    };
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
