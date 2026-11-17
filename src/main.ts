import './style.css';
import { watchEmoji } from './emoji';
import { Game } from './game';

// Les emojis du texte deviennent des images identiques sur tous les appareils (voir src/emoji.ts).
watchEmoji();
new Game(document.getElementById('game') as HTMLCanvasElement);
