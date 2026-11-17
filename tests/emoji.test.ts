import { describe, expect, it } from 'vitest';
import { EMOJI_CODES, emojiFile, hasEmoji, splitEmoji } from '../src/emoji';
import indexHtml from '../index.html?raw';
import readme from '../README.md?raw';

// Tous les textes du jeu (code et page) et tous les fichiers d'icônes, lus tels quels.
const sources = import.meta.glob('../src/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const icons = import.meta.glob('../public/emoji/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const EVERY_EMOJI = /\p{Extended_Pictographic}\uFE0F?/gu;

describe('Icônes identiques sur tous les appareils', () => {
  it('nomme le fichier d’un emoji par ses codes Unicode, sans le sélecteur de variante', () => {
    expect(emojiFile('🪙')).toBe('1fa99.svg');
    expect(emojiFile('❤️')).toBe('2764.svg');
    expect(emojiFile('❤')).toBe('2764.svg');
    expect(emojiFile('⏱️')).toBe('23f1.svg');
    expect(emojiFile('⚔️')).toBe('2694.svg');
  });

  it('découpe un texte en texte et en emojis', () => {
    expect(splitEmoji('🪙 120')).toEqual([{ emoji: '🪙', file: '1fa99.svg' }, ' 120']);
    expect(splitEmoji('Score : 💀 5 et 🪙 7')).toEqual(['Score : ', { emoji: '💀', file: '1f480.svg' }, ' 5 et ', { emoji: '🪙', file: '1fa99.svg' }, ' 7']);
    expect(splitEmoji('⚔️ Normal')).toEqual([{ emoji: '⚔️', file: '2694.svg' }, ' Normal']);
    expect(splitEmoji('❤️❤')).toEqual([
      { emoji: '❤️', file: '2764.svg' },
      { emoji: '❤', file: '2764.svg' },
    ]);
  });

  it('laisse le texte sans emoji tel quel', () => {
    expect(splitEmoji('Niv. 12 — 00:45 (×1.5)')).toEqual(['Niv. 12 — 00:45 (×1.5)']);
    expect(splitEmoji('')).toEqual([]);
    expect(hasEmoji('Niv. 12')).toBe(false);
    expect(hasEmoji('🏆 03:20')).toBe(true);
  });

  it('laisse en texte un emoji dont il n’a pas l’image (sans casser le texte autour)', () => {
    // 🦄 n'est pas utilisé par le jeu : pas d'image pour lui.
    expect(splitEmoji('a 🦄 b 🪙')).toEqual(['a 🦄 b ', { emoji: '🪙', file: '1fa99.svg' }]);
    expect(hasEmoji('🦄')).toBe(false);
  });

  it('possède l’image de chaque emoji de la liste, et seulement celles-là', () => {
    const files = Object.keys(icons).map((path) => path.split('/').pop()!.replace('.svg', ''));
    expect([...files].sort()).toEqual([...EMOJI_CODES].sort());
  });

  it('a pour chaque icône un vrai fichier SVG léger', () => {
    for (const [path, content] of Object.entries(icons)) {
      expect(content.trimStart().startsWith('<svg'), path).toBe(true);
      expect(content.length, path).toBeLessThan(20000);
    }
  });

  it('couvre tous les emojis écrits dans le code du jeu et dans la page : aucun ne reste dessiné par le système', () => {
    const texts: Record<string, string> = { 'index.html': indexHtml, ...sources };
    const missing: string[] = [];
    for (const [file, text] of Object.entries(texts)) {
      for (const match of text.matchAll(EVERY_EMOJI)) {
        if (!EMOJI_CODES.includes(emojiFile(match[0]).slice(0, -4) as (typeof EMOJI_CODES)[number])) missing.push(`${file} : ${match[0]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('crédite le jeu d’icônes utilisé (licence CC-BY)', () => {
    expect(readme).toContain('Twemoji');
    expect(readme).toContain('CC-BY');
  });
});
