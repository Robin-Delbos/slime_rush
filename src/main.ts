import './style.css';
import { watchEmoji } from './emoji';
import { Game } from './game';

// Les emojis du texte deviennent des images identiques sur tous les appareils (voir src/emoji.ts).
watchEmoji();
new Game(document.getElementById('game') as HTMLCanvasElement);

// Le service worker rend le jeu installable (public/sw.js). Pas en développement : un cache gênerait le rechargement à chaud.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Navigateur ou mode (navigation privée) qui l'interdit : le jeu marche pareil, sans installation.
    });
  });
}
