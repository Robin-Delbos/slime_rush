/**
 * Icônes identiques sur tous les appareils.
 *
 * Un emoji écrit dans un texte (« 🪙 », « 💀 »...) est dessiné par le système : iOS, Android et Windows ne les
 * dessinent pas pareil (une pièce dorée sur l'un, grisâtre sur l'autre). Ici, chaque emoji utilisé par le jeu est
 * remplacé, dans la page, par une image du jeu d'icônes Twemoji (public/emoji/, licence CC-BY 4.0, voir le README).
 * Le texte du code reste écrit avec des emojis : le remplacement se fait à l'affichage, partout, y compris pour les
 * textes changés pendant la partie.
 */

/** Fichiers présents dans public/emoji (code Unicode de l'emoji, sans le sélecteur de variante FE0F). */
export const EMOJI_CODES = [
  '1f331', '1f33f', '1f381', '1f392', '1f3a8', '1f3c6', '1f451', '1f45f', '1f480', '1f4a5',
  '1f4be', '1f4d8', '1f507', '1f50a', '1f512', '1f525', '1f531', '1f6e0', '1f9f2', '1f9ff',
  '1fa99', '23f1', '23f8', '2694', '26a0', '26a1', '2714', '2764', '2b50',
] as const;

const AVAILABLE = new Set<string>(EMOJI_CODES);

/** Un emoji, avec ou sans son sélecteur de variante (FE0F, qui demande la version en couleur). */
const EMOJI_PATTERN = /\p{Extended_Pictographic}️?/gu;

export type EmojiPart = string | { emoji: string; file: string };

/** Nom du fichier d'un emoji : ses codes Unicode en hexadécimal, sans FE0F, séparés par des tirets. */
export function emojiFile(emoji: string): string {
  const codes = [...emoji].map((c) => c.codePointAt(0)!.toString(16)).filter((c) => c !== 'fe0f');
  return `${codes.join('-')}.svg`;
}

/** Vrai si le texte contient au moins un emoji que le jeu sait dessiner lui-même. */
export function hasEmoji(text: string): boolean {
  for (const match of text.matchAll(EMOJI_PATTERN)) if (AVAILABLE.has(emojiFile(match[0]).slice(0, -4))) return true;
  return false;
}

/** Découpe un texte en morceaux : du texte, et les emojis connus (les autres restent du texte). */
export function splitEmoji(text: string): EmojiPart[] {
  const parts: EmojiPart[] = [];
  let last = 0;
  for (const match of text.matchAll(EMOJI_PATTERN)) {
    const file = emojiFile(match[0]);
    if (!AVAILABLE.has(file.slice(0, -4))) continue;
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push({ emoji: match[0], file });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const SKIPPED = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'TITLE', 'NOSCRIPT']);

function imageFor(emoji: string, file: string): HTMLImageElement {
  const img = document.createElement('img');
  img.className = 'emoji';
  img.src = `${import.meta.env.BASE_URL}emoji/${file}`;
  // Le texte d'origine reste disponible pour les lecteurs d'écran et en cas d'échec du chargement.
  img.alt = emoji;
  img.draggable = false;
  img.decoding = 'async';
  return img;
}

function replaceInText(node: Text): void {
  const text = node.data;
  if (!hasEmoji(text) || (node.parentElement && SKIPPED.has(node.parentElement.tagName))) return;
  const fragment = document.createDocumentFragment();
  for (const part of splitEmoji(text)) fragment.append(typeof part === 'string' ? document.createTextNode(part) : imageFor(part.emoji, part.file));
  node.replaceWith(fragment);
}

/** Remplace les emojis de tous les textes sous `root` par leurs images. */
export function emojify(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    replaceInText(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) targets.push(node as Text);
  for (const node of targets) replaceInText(node);
}

/**
 * Applique le remplacement à toute la page, puis le maintient : tout texte ajouté ou modifié ensuite (HUD, menus,
 * bilans...) est converti à son tour.
 */
export function watchEmoji(root: Node = document.body): MutationObserver {
  emojify(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') emojify(record.target);
      else record.addedNodes.forEach((added) => emojify(added));
    }
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  return observer;
}
