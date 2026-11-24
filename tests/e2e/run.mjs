// Test de bout en bout : lance le jeu compilé dans un navigateur sans interface et vérifie
// le parcours complet (menu, boutique, personnages, partie, mort, sauvegarde).
//
// Aucune dépendance : le navigateur (Edge ou Chrome déjà installé) est piloté directement
// par le protocole DevTools. Usage : npm run test:e2e
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'output');
const DEBUG_PORT = 9333;

const BROWSERS = [
  process.env.BROWSER_PATH,
  // Chrome d'abord (navigateur de référence du projet), Edge en secours.
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const VIEWPORTS = [
  { name: 'pc', width: 1280, height: 720 },
  { name: 'mobile', width: 390, height: 844 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.problems = [];
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg);
        this.pending.delete(msg.id);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const details = msg.params.exceptionDetails;
        // Les erreurs des pages internes du navigateur (extensions intégrées) ne concernent pas le jeu.
        const source = details.url ?? details.stackTrace?.callFrames?.[0]?.url ?? '';
        if (/^(chrome|edge|extension|chrome-extension):/.test(source)) return;
        this.problems.push(`${details.exception?.description ?? details.text} (${source || 'source inconnue'})`);
      } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
        this.problems.push(`console.${msg.params.type}: ` + msg.params.args.map((a) => a.value ?? a.description).join(' '));
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      this.pending.set(++this.id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
      this.ws.send(JSON.stringify({ id: this.id, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(`Évaluation échouée : ${expression}\n${result.exceptionDetails.exception?.description}`);
    return result.result.value;
  }

  click(selector) {
    return this.eval(`(() => { const n = document.querySelector(${JSON.stringify(selector)}); if (!n) return false; n.click(); return true; })()`);
  }

  text(selector) {
    return this.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  }

  visible(selector) {
    return this.eval(`(() => { const n = document.querySelector(${JSON.stringify(selector)}); return !!n && !n.classList.contains('hidden'); })()`);
  }

  game() {
    return this.eval('window.__game.state()');
  }

  async waitFor(description, expression, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await this.eval(expression)) return;
      await sleep(100);
    }
    throw new Error(`Délai dépassé en attendant : ${description}`);
  }

  async key(code, ms) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code });
    await sleep(ms);
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code });
  }

  /** Envoie un événement tactile (touchStart, touchMove, touchEnd) à un ou plusieurs doigts. */
  touch(type, points) {
    return this.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : points.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  }

  async tap(x, y) {
    await this.touch('touchStart', [{ x, y }]);
    await sleep(60);
    await this.touch('touchEnd', []);
    await sleep(120);
  }

  /** Pose un doigt en `from`, le fait glisser jusqu'à `to`, le maintient `hold` ms puis le lève (joystick flottant). */
  async drag(from, to, hold = 600) {
    await this.touch('touchStart', [from]);
    for (let i = 1; i <= 6; i++) {
      await this.touch('touchMove', [{ x: from.x + ((to.x - from.x) * i) / 6, y: from.y + ((to.y - from.y) * i) / 6 }]);
      await sleep(25);
    }
    await sleep(hold);
    await this.touch('touchEnd', []);
    await sleep(100);
  }

  /**
   * Fait défiler jusqu'à l'élément puis vérifie qu'il est entièrement dans l'écran et que rien ne le recouvre
   * à son centre (donc qu'un doigt peut l'atteindre). Renvoie 'ok' ou la raison de l'échec.
   */
  reachable(selector, needHit = true) {
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'absent';
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      const inside = r.width > 0 && r.height > 0 && r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const hit = top === el || el.contains(top);
      return inside && (hit || !${JSON.stringify(needHit)}) ? 'ok' : 'hors écran ou recouvert (' + [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)].join(',') + ' dans ' + innerWidth + '×' + innerHeight + ', touchable=' + hit + (hit || !top ? '' : ', recouvert par ' + (top.id ? '#' + top.id : top.tagName.toLowerCase() + '.' + String(top.className).split(' ').join('.'))) + ')';
    })()`);
  }

  /** Vrai si deux éléments se chevauchent à l'écran. */
  overlaps(a, b) {
    return this.eval(`(() => {
      const ra = document.querySelector(${JSON.stringify(a)})?.getBoundingClientRect();
      const rb = document.querySelector(${JSON.stringify(b)})?.getBoundingClientRect();
      if (!ra || !rb) return false;
      return ra.left < rb.right - 1 && rb.left < ra.right - 1 && ra.top < rb.bottom - 1 && rb.top < ra.bottom - 1;
    })()`);
  }

  /** Touche le centre d'un élément (après l'avoir amené à l'écran). */
  async tapElement(selector) {
    const point = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await this.tap(point.x, point.y);
  }

  async screenshot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
  }
}

function check(condition, message) {
  if (!condition) throw new Error(`Vérification échouée : ${message}`);
  console.log(`  ✓ ${message}`);
}

const goldOf = (text) => Number(text.replace(/\D/g, ''));

async function scenario(page, url, viewport) {
  const shot = (name) => page.screenshot(`${viewport.name}-${name}`);
  await page.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('la page de jeu', `!!document.querySelector('#btn-start')`);
  // Chaque format part d'une sauvegarde vierge.
  await page.eval('localStorage.clear()');
  await page.send('Page.navigate', { url: `${url}?debug` });

  // --- Menu ---
  await page.waitFor('le chargement des modèles', `!!window.__game && document.querySelector('#btn-start') && !document.querySelector('#btn-start').disabled`);
  check((await page.game()).state === 'menu', 'le jeu démarre sur le menu');
  await checkPerfCounter(page, 'PC', false);
  check((await page.game()).hasModel, 'le héros a un modèle 3D');
  check((await page.eval(`document.querySelectorAll('.char-card').length`)) === 8, 'huit héros sont proposés');
  check((await page.eval(`document.querySelectorAll('.weapon-card').length`)) === 4, 'quatre armes de départ sont proposées');
  await checkWeaponAlignment(page, 'menu à quatre armes');
  check((await page.eval(`document.querySelectorAll('.diff-btn').length`)) === 4, 'quatre difficultés sont proposées');
  check(await page.eval(`!!document.querySelector('.weapon-card[data-id="rifle"] .weapon-icon svg')`), 'la carabine a une icône dessinée');
  check(await page.eval(`!!document.querySelector('#overlay-start .logo svg')`), 'le menu affiche le logo');
  check(/^v\d+\.\d+\.\d+/.test((await page.text('#version')) ?? ''), `le menu affiche la version du jeu (${await page.text('#version')})`);
  check((await page.game()).weapon === 'rifle' && (await page.game()).difficulty === 'normal', 'carabine et difficulté normale par défaut');
  check(goldOf(await page.text('#menu-gold')) === 0, 'une sauvegarde neuve commence à 0 pièce');
  check(await page.eval(`!!document.querySelector('#btn-shop') && !!document.querySelector('#btn-collection') && !document.querySelector('#btn-chests')`), 'le menu ne garde que Boutique et Collection (les coffres sont dans la boutique)');
  check((await page.text('#weapon-desc')).startsWith('Carabine'), 'la description de l’arme choisie s’affiche sous les armes');
  // Crédits et licences : exigés par les licences CC BY (Twemoji) et MIT (three.js), visibles dans le jeu publié.
  check(await page.visible('#btn-credits'), 'le menu propose « Crédits et licences »');
  await page.click('#btn-credits');
  check((await page.visible('#overlay-credits')) && (await page.eval(`document.querySelector('#overlay-start').classList.contains('covered')`)), 'l’écran des crédits s’ouvre par-dessus le menu, qui est masqué');
  const credits = await page.eval(`document.querySelector('#overlay-credits').textContent`);
  check(['Quaternius', 'CC0', 'Twemoji', 'CC BY 4.0', 'three.js', 'MIT', 'Créés pour le jeu'].every((word) => credits.includes(word)), 'les crédits citent les modèles, les icônes, le moteur 3D et leurs licences');
  check((await page.eval(`document.querySelector('#credits-three').textContent`)).includes('Permission is hereby granted'), 'le texte complet de la licence de three.js est dans le jeu');
  check(await page.eval(`[...document.querySelectorAll('#overlay-credits a')].length >= 4 && [...document.querySelectorAll('#overlay-credits a')].every((a) => a.target === '_blank' && a.rel.includes('noopener'))`), 'les liens des crédits s’ouvrent dans un nouvel onglet, sans accès à la page du jeu');
  // Un bouton et non un lien : dans l'application installée, un lien vers cette page (dans son champ) sortirait du jeu, et la
  // fermer fermerait l'application. Elle s'ouvre donc dans le jeu, par-dessus les crédits.
  check((await page.visible('#btn-privacy')) && (await page.eval(`document.querySelector('#btn-privacy').tagName`)) === 'BUTTON', 'les crédits donnent accès à la politique de confidentialité par un bouton, pas par un lien');
  check((await page.eval(`fetch('./confidentialite.html').then((r) => r.status + ' ' + r.headers.get('content-type'))`)).startsWith('200 text/html'), 'la page de confidentialité est bien servie avec le jeu');
  const homeUrl = await page.eval('location.href');
  await page.click('#btn-privacy');
  await page.waitFor('la politique de confidentialité', `(document.querySelector('#privacy-frame').contentDocument?.title ?? '').includes('confidentialité')`, 5000);
  check((await page.visible('#overlay-privacy')) && (await page.eval('location.href')) === homeUrl && (await page.eval('!!window.__game')), 'la politique de confidentialité s’ouvre dans le jeu, sans quitter la page');
  check((await page.eval(`document.querySelector('#privacy-frame').contentDocument.body.textContent`)).includes('ne collecte aucune donnée personnelle'), 'le texte de la politique de confidentialité est lisible dans le jeu');
  await shot('0-confidentialite');
  await page.click('#btn-privacy-back');
  check(!(await page.visible('#overlay-privacy')) && (await page.visible('#overlay-credits')), 'fermer la politique de confidentialité ramène aux crédits, le jeu reste ouvert');
  check(!(await page.eval(`document.querySelector('#overlay-credits').textContent.includes('Robin') || [...document.querySelectorAll('#overlay-credits a')].some((a) => a.href.includes('Robin-Delbos'))`)), 'les crédits ne donnent ni nom de personne ni lien vers le dépôt');
  await shot('0-credits');
  await page.click('#btn-credits-back');
  check(!(await page.visible('#overlay-credits')) && !(await page.eval(`document.querySelector('#overlay-start').classList.contains('covered')`)), 'les crédits se referment sur le menu');

  // Journal des nouveautés : on touche la version du menu, un menu déroulant par version, la plus récente ouverte.
  const currentVersion = (await page.text('#version')).replace(/^v/, '').replace(/ .*/, '');
  await page.click('#version');
  check((await page.visible('#overlay-changelog')) && (await page.eval(`document.querySelector('#overlay-start').classList.contains('covered')`)), 'toucher la version ouvre le journal des nouveautés par-dessus le menu');
  const log = await page.eval(`(() => { const d = [...document.querySelectorAll('#changelog-list details')]; return { count: d.length, open: d.filter((x) => x.open).length, firstOpen: d[0]?.open, first: d[0]?.querySelector('summary')?.textContent ?? '', kinds: [...new Set([...document.querySelectorAll('.changelog-kind')].map((k) => k.textContent))] }; })()`);
  check(log.count >= 5 && log.open === 1 && log.firstOpen, `le journal liste chaque version, la plus récente seule ouverte (${log.count} versions)`);
  check(log.first.includes(`v${currentVersion}`), `la première entrée du journal est la version en cours (${log.first})`);
  check(log.kinds.includes('Nouveau') && log.kinds.includes('Corrigé'), 'le journal distingue les nouveautés et les corrections');
  await page.click('#changelog-list details:nth-child(2) summary');
  check(await page.eval(`document.querySelectorAll('#changelog-list details[open]').length === 2`), 'toucher une version la déplie');
  await shot('0-nouveautes');
  await page.click('#btn-changelog-back');
  check(!(await page.visible('#overlay-changelog')) && !(await page.eval(`document.querySelector('#overlay-start').classList.contains('covered')`)), 'le journal se referme sur le menu');
  await page.click('#btn-collection');
  check(await page.visible('#overlay-collection') && (await page.visible('#panel-heroes')) && !(await page.visible('#panel-styles')), 'la collection s’ouvre sur l’onglet des héros');
  await page.click('.char-card[data-id="anne"]');
  check((await page.game()).selected === 'ombre', 'sans or, un héros payant reste verrouillé');
  check((await page.game()).trying === 'anne' && (await page.visible('#btn-buy-hero')) && (await page.eval(`document.querySelector('#btn-buy-hero').disabled`)), 'cliquer sur un héros à acheter le montre, avec un bouton « Acheter » grisé faute de pièces');
  await page.click('#btn-collection-back');
  check((await page.game()).trying === null, 'quitter la collection remet le héros choisi à l’écran');
  await page.click('.weapon-card[data-id="aura"]');
  check((await page.game()).weapon === 'rifle', 'sans or, une arme payante reste verrouillée');
  await sleep(600);
  await shot('1-menu');

  // --- Boutique ---
  await page.click('#btn-shop');
  check(await page.visible('#overlay-shop'), 'la boutique s’ouvre');
  check((await page.visible('#panel-upgrades')) && !(await page.visible('#panel-chests')), 'la boutique s’ouvre sur l’onglet des améliorations');
  check(await page.eval(`[...document.querySelectorAll('.shop-buy')].every((b) => b.disabled)`), 'sans or, tous les achats sont désactivés');
  await page.eval('window.__game.addGold(3000)');
  await page.click('.shop-buy[data-id="vitality"]');
  check(goldOf(await page.text('#shop-gold')) === 2980, 'un achat débite son prix');
  check((await page.text('.shop-row .shop-level')).trim() === '1 / 10', 'le niveau de l’amélioration augmente');
  await shot('2-boutique');

  await page.click('#tab-chests');
  check((await page.visible('#panel-chests')) && !(await page.visible('#panel-upgrades')), 'l’onglet Coffres remplace les améliorations');
  // Probabilités annoncées avant tout achat (exigence des stores pour les coffres à contenu aléatoire).
  check((await page.visible('#btn-chest-odds')) && !(await page.visible('#chest-odds')), 'une petite icône « i » est proposée, et les probabilités des coffres sont cachées par défaut');
  const infoSize = await page.eval(`(() => { const r = document.querySelector('#btn-chest-odds').getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); })()`);
  check(infoSize === '20x20', `l'icône reste discrète (${infoSize})`);
  await page.click('#btn-chest-odds');
  check((await page.visible('#chest-odds')) && (await page.eval(`document.querySelector('#btn-chest-odds').getAttribute('aria-expanded')`)) === 'true', 'l’icône affiche les probabilités');
  const odds = await page.text('#chest-odds-list');
  check(['Arme exclusive', 'Héros exclusif', '38 %', '32 %', '24 %', '5 %', '1 %'].every((word) => odds.includes(word)), `les probabilités du contenu s'affichent (${odds.replace(/s+/g, ' ').slice(0, 80)}…)`);
  check(!['Mines', 'Pirate', 'Lis'].some((name) => odds.includes(name)), 'les probabilités ne révèlent pas le nom de l’arme ni des héros exclusifs');
  check((await page.text('#chest-odds-note')).includes('déjà obtenu'), 'la précision sur les contenus déjà obtenus est donnée');
  await page.click('#btn-chest-odds');
  check(!(await page.visible('#chest-odds')), 'l’icône cache de nouveau les probabilités');
  await page.click('#tab-upgrades');
  check(await page.visible('#panel-upgrades'), 'on revient aux améliorations');
  // Le titre et les onglets restent à la même hauteur d'un onglet à l'autre, quel que soit le contenu.
  const heads = async (screen) => page.eval(`(() => ['h2', '.tabs'].map((sel) => Math.round(document.querySelector('${screen} ' + sel).getBoundingClientRect().top)).join(','))()`);
  const upgradesHead = await heads('#overlay-shop');
  await page.click('#tab-chests');
  check((await heads('#overlay-shop')) === upgradesHead, `boutique : le titre et les onglets sont au même niveau sur tous les onglets (${upgradesHead})`);
  await page.click('#tab-upgrades');
  await page.click('#btn-shop-back');
  check(!(await page.visible('#overlay-shop')), 'la boutique se ferme');

  // --- Héros (dans la collection) ---
  await page.click('#btn-collection');
  await page.click('.char-card[data-id="anne"]');
  check((await page.game()).selected === 'ombre' && goldOf(await page.text('#menu-gold')) === 2980, 'cliquer sur un héros abordable ne l’achète pas : on le voit d’abord');
  check((await page.game()).trying === 'anne' && (await page.text('#hero-desc')).startsWith('Anne'), 'le héros à acheter est montré dans l’aperçu, avec sa description');
  check((await page.text('#btn-buy-hero')).includes('Anne') && !(await page.eval(`document.querySelector('#btn-buy-hero').disabled`)), 'le bouton « Acheter » propose le héros et son prix');
  await page.click('.char-card[data-id="ombre"]');
  check((await page.game()).selected === 'ombre' && (await page.game()).trying === null && !(await page.visible('#btn-buy-hero')), 'choisir un héros possédé annule l’aperçu du héros à acheter');
  await page.click('.char-card[data-id="anne"]');
  await page.click('#btn-buy-hero');
  check((await page.game()).selected === 'anne' && (await page.game()).trying === null, 'le bouton « Acheter » achète le héros et le sélectionne');
  await shot('2b-collection-heros');
  const heroesHead = await page.eval(`(() => ['h2', '.tabs'].map((sel) => Math.round(document.querySelector('#overlay-collection ' + sel).getBoundingClientRect().top)).join(','))()`);
  for (const tab of ['styles', 'amulets', 'heroes']) {
    await page.click(`#tab-${tab}`);
    const head = await page.eval(`(() => ['h2', '.tabs'].map((sel) => Math.round(document.querySelector('#overlay-collection ' + sel).getBoundingClientRect().top)).join(','))()`);
    check(head === heroesHead, `collection : le titre et les onglets ne bougent pas sur l'onglet ${tab} (${head} contre ${heroesHead})`);
  }
  await page.click('#btn-collection-back');
  check(!(await page.visible('#overlay-collection')), 'la collection se ferme');
  check(goldOf(await page.text('#menu-gold')) === 1980, 'l’achat du héros débite son prix');
  check(goldOf(await page.text('#collection-gold')) === 1980 && (await page.visible('#collection-gold')), 'l’écran des héros affiche les pièces, mises à jour après un achat');

  // --- Armes et difficulté ---
  await page.eval('window.__game.addGold(500)');
  await page.click('.weapon-card[data-id="aura"]');
  check((await page.game()).weapon === 'aura', 'une arme abordable est achetée et sélectionnée');
  check(goldOf(await page.text('#menu-gold')) === 1280, 'l’achat de l’arme débite son prix');
  await page.click('.diff-btn[data-id="hard"]');
  check((await page.game()).difficulty === 'hard', 'la difficulté se change');
  await sleep(400);
  await shot('3b-menu-difficile');
  await page.click('.diff-btn[data-id="extreme"]');
  await sleep(400);
  await shot('3c-menu-extreme');
  // Facile pour la suite du parcours : il doit survivre assez longtemps avec n'importe quelle arme.
  await page.click('.diff-btn[data-id="easy"]');
  check((await page.game()).difficulty === 'easy', 'la difficulté facile est sélectionnée');
  await sleep(600);
  await shot('3-menu-arme');

  // --- Partie ---
  await page.click('#btn-start');
  check((await page.game()).state === 'playing', 'la partie démarre');
  check(JSON.stringify((await page.game()).weapons) === '["aura"]', 'la partie démarre avec l’arme choisie');
  await sleep(300);
  const maxHp = (await page.text('#hp-label')).split('/')[1].trim();
  check(maxHp === '110', `les bonus permanents s’appliquent : 110 PV max attendus (vitalité), ${maxHp} affichés`);
  let levelUps = 0;
  let levelUpShot = false;
  // Marche en carré pendant au moins 20 s, puis jusqu'à la première montée de niveau (90 s au plus).
  const steps = ['KeyD', 'KeyW', 'KeyA', 'KeyS'];
  const started = Date.now();
  for (let i = 0; ; i++) {
    const elapsed = Date.now() - started;
    if (elapsed > 90000 || (elapsed > 20000 && levelUps >= 1)) break;
    for (let k = 0; k < 4; k++) {
      await page.key(steps[i % steps.length], 450);
      if (!levelUpShot && (await page.visible('#overlay-levelup'))) {
        // Laisse l'animation d'arrivée des cartes se terminer avant la capture.
        await sleep(900);
        await shot('4b-niveau-superieur');
        levelUpShot = true;
      }
      if (await page.click('#overlay-levelup:not(.hidden) .card')) levelUps++;
    }
    if (i === 5) await shot('4-partie');
  }
  await shot('5-partie-fin');
  const mid = await page.game();
  check(mid.time > 15, `le temps de partie avance (${mid.time.toFixed(1)} s)`);
  check(mid.kills > 5, `des ennemis sont tués (${mid.kills})`);
  check(mid.level >= 2 && levelUps >= 1, `le héros monte de niveau (niveau ${mid.level})`);
  check(mid.enemies > 0, `des ennemis sont présents (${mid.enemies})`);

  // --- Attaque spéciale : un clic bref sur le terrain quand la jauge est pleine ---
  await page.click('#overlay-levelup:not(.hidden) .card');
  const tap = async () => {
    const point = { x: Math.round(viewport.width * 0.6), y: Math.round(viewport.height * 0.45), button: 'left', clickCount: 1 };
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point });
    await sleep(60);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point });
    await sleep(150);
  };
  await page.eval('window.__game.fillSpecial()');
  await sleep(150);
  check(await page.visible('#special-hint'), 'la jauge pleine affiche l’invitation à frapper');
  await tap();
  await shot('5b-attaque-speciale');
  check((await page.game()).charge < 1, 'un appui bref sur le terrain déclenche l’attaque spéciale');
  check(!(await page.visible('#special-hint')), 'l’invitation disparaît une fois l’attaque lancée');

  // --- Pause ---
  await page.click('#overlay-levelup:not(.hidden) .card');
  await page.click('#btn-pause');
  check((await page.game()).state === 'paused' && (await page.visible('#overlay-pause')), 'le bouton pause ouvre le menu de pause');
  // Les textes des barres (niveau, PV) doivent passer sous l'écran de pause, donc être floutés avec le reste du jeu.
  // On rend d'abord le HUD sensible au pointeur : sinon la recherche d'élément ignorerait ses textes.
  const coveredByPause = await page.eval(`(() => {
    const probe = document.createElement('style');
    probe.textContent = '#hud, #hud * { pointer-events: auto !important }';
    document.head.append(probe);
    const result = ['#level', '#hp-label', '#timer'].map((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top && top.closest('#overlay-pause') ? 'ok' : sel + ' passe au-dessus de la pause';
    });
    probe.remove();
    return result;
  })()`);
  check(coveredByPause.every((r) => r === 'ok'), `la pause recouvre (et floute) aussi le niveau et les PV${coveredByPause.some((r) => r !== 'ok') ? ' : ' + coveredByPause.join(', ') : ''}`);
  // Les titres des écrans sont nets : une seule ombre fine, plus d'ombres empilées.
  const titleShadow = await page.eval(`getComputedStyle(document.querySelector('#overlay-pause h2')).textShadow`);
  check(titleShadow.split('rgba').length - 1 + titleShadow.split('rgb(').length - 1 <= 1, `le titre « Pause » n’a qu’une ombre fine (${titleShadow})`);
  // Musique : on peut la couper seule depuis la pause, et le choix est conservé.
  check((await page.text('#btn-music')).includes('oui') && !(await page.game()).audio.silenced, 'la musique est active par défaut');
  await page.click('#btn-music');
  check((await page.text('#btn-music')).includes('non') && (await page.game()).audio.silenced, 'le bouton de la pause coupe la musique');
  check(await page.eval(`JSON.parse(localStorage.getItem('slime-rush.save')).music === false`), 'la musique coupée est enregistrée');
  check(await page.eval(`!document.querySelector('#overlay-pause').classList.contains('hidden')`), 'couper la musique laisse la pause ouverte');
  await shot('5c0-pause-musique-coupee');
  await page.click('#btn-music');
  check((await page.text('#btn-music')).includes('oui') && !(await page.game()).audio.silenced, 'on remet la musique depuis la pause');
  // Tout le son : le bouton de la pause coupe aussi la musique, sans toucher au réglage « musique ».
  check((await page.text('#btn-sound-pause')).includes('oui'), 'le son est actif par défaut');
  await page.click('#btn-sound-pause');
  check((await page.text('#btn-sound-pause')).includes('non') && (await page.game()).audio.silenced, 'le bouton de la pause coupe tout le son, musique comprise');
  check(await page.eval(`JSON.parse(localStorage.getItem('slime-rush.save')).muted === true && JSON.parse(localStorage.getItem('slime-rush.save')).music === true`), 'le son coupé est enregistré, sans changer le réglage de la musique');
  check(await page.eval(`document.querySelector('#btn-sound img.emoji')?.alt === '🔇'`), 'le bouton du menu reflète le son coupé');
  check(await page.eval(`document.querySelector('#btn-music').disabled && document.querySelector('#btn-music-menu').disabled`), 'sans son, les boutons de la musique sont grisés (pause et menu)');
  check((await page.text('#btn-music')).includes('non'), 'sans son, la pause indique que la musique est coupée aussi');
  await page.click('#btn-music');
  check(await page.eval(`JSON.parse(localStorage.getItem('slime-rush.save')).music === true`), 'un bouton grisé ne change rien au réglage de la musique');
  await page.click('#btn-sound-pause');
  check((await page.text('#btn-sound-pause')).includes('oui') && !(await page.game()).audio.silenced, 'on remet tout le son depuis la pause');
  check(await page.eval(`!document.querySelector('#btn-music').disabled && !document.querySelector('#btn-music-menu').disabled`), 'avec le son, les boutons de la musique redeviennent actifs');
  const frozen = (await page.game()).time;
  await sleep(500);
  check((await page.game()).time === frozen, 'le temps de partie est figé pendant la pause');
  await page.click('#btn-resume');
  await sleep(400);
  const resumed = await page.game();
  check(resumed.time > frozen && !(await page.visible('#overlay-pause')), 'Reprendre relance la partie');
  await page.key('Escape', 50);
  check((await page.game()).state === 'paused', 'la touche Échap met en pause');
  await shot('5c-pause');
  await page.key('Escape', 50);
  check((await page.game()).state !== 'paused', 'la touche Échap reprend la partie');

  // --- Fin de partie ---
  // Une montée de niveau en attente fige la simulation : on choisit une carte tant qu'il y en a une.
  const gameOverShown = `!document.querySelector('#overlay-gameover').classList.contains('hidden')`;
  const deadline = Date.now() + 8000;
  await page.click('#overlay-levelup:not(.hidden) .card');
  await page.eval('window.__game.kill()');
  while (!(await page.eval(gameOverShown)) && Date.now() < deadline) {
    await page.click('#overlay-levelup:not(.hidden) .card');
    await sleep(100);
  }
  await page.waitFor('l’écran de fin', gameOverShown, 1000);
  const end = await page.game();
  check(end.state === 'gameover', 'la mort du héros termine la partie');
  check(end.gold > 1280, `la partie rapporte de l’or (${end.gold - 1280} pièces)`);
  check((await page.text('#gameover-stats')).includes('×0.6'), 'le bilan indique le multiplicateur d’or de la difficulté');
  check((await page.text('#best-gameover')).includes('record'), 'le premier temps est un record');
  await shot('6-fin');

  // --- Quitter une partie depuis la pause ---
  await page.click('#btn-restart');
  await sleep(300);
  await page.click('#btn-pause');
  await page.click('#btn-quit');
  const quit = await page.game();
  check(quit.state === 'gameover' && (await page.visible('#overlay-gameover')), 'Quitter la partie affiche le bilan');
  check(quit.gold >= end.gold, 'quitter ne fait pas perdre d’or');
  // L'or du bilan s'additionne en comptant, puis affiche le total exact.
  await page.waitFor('le compteur d’or du bilan', `document.querySelector('#gameover-stats').textContent.includes('(total ${quit.gold})')`, 5000);
  check(true, 'le compteur d’or du bilan atteint le total exact');

  // --- Retour au menu et persistance ---
  await page.click('#btn-menu');
  check((await page.game()).state === 'menu', 'le bouton Menu ramène au menu');

  // --- Mort en plein clignotement : le héros doit rester visible au menu et dans l'aperçu des héros ---
  // Le chrono du clignotement ne baisse qu'en partie ; figé sur une valeur « cachée » (0,2 s : 3,6 → impair), il cachait le héros
  // pour de bon au retour au menu (corrigé). Le coup mortel tombe souvent dans le délai d'invulnérabilité, donc en plein clignotement.
  await page.click('#btn-start');
  await page.waitFor('la partie', `window.__game.state().state === 'playing'`);
  await page.eval('window.__game.blink(0.2)');
  await page.eval('window.__game.kill()');
  await page.waitFor('la mort', `window.__game.state().state === 'gameover'`, 6000);
  await page.click('#btn-menu');
  await sleep(500);
  const afterBlink = await page.game();
  check(afterBlink.state === 'menu' && afterBlink.hasModel && afterBlink.heroShown, 'mort en plein clignotement : le héros reste visible au menu');
  await page.click('#btn-start');
  await page.waitFor('la partie', `window.__game.state().state === 'playing'`);
  await page.eval('window.__game.blink(0.2)');
  await page.click('#btn-pause');
  await page.click('#btn-quit');
  await page.click('#btn-menu');
  await sleep(500);
  const beforeReload = await page.game();
  check(beforeReload.heroShown, 'quitter depuis la pause en plein clignotement : le héros reste visible au menu');

  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('le rechargement', `!!window.__game && !document.querySelector('#btn-start').disabled`);
  const reloaded = await page.game();
  check(reloaded.gold === beforeReload.gold && reloaded.selected === 'anne', 'la progression est conservée après rechargement');
  check(reloaded.weapon === 'aura' && reloaded.difficulty === 'easy', 'l’arme et la difficulté sont conservées après rechargement');

  // --- Export puis import de la sauvegarde dans un navigateur "neuf" ---
  const typeCode = (code) =>
    page.eval(`(() => { const t = document.querySelector('#save-code'); t.value = ${JSON.stringify(code)}; t.dispatchEvent(new Event('input')); })()`);
  await page.click('#btn-save');
  check(await page.visible('#overlay-save'), 'l’écran de sauvegarde s’ouvre');
  await page.click('#btn-export-copy');
  await sleep(300);
  const code = await page.eval(`document.querySelector('#save-code').value`);
  check(/^SLIMERUSH1:\S+$/.test(code), 'l’export affiche un code de sauvegarde');
  check((await page.text('#save-status')).length > 0, 'l’export confirme la copie ou invite à copier à la main');
  await shot('7-sauvegarde-export');

  await page.eval('localStorage.clear()');
  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('le rechargement', `!!window.__game && !document.querySelector('#btn-start').disabled`);
  check((await page.game()).gold === 0 && (await page.game()).selected === 'ombre', 'sans sauvegarde, la progression repart de zéro');

  await page.click('#btn-save');
  await page.click('#btn-import');
  check(await page.eval(`document.querySelector('#save-status').classList.contains('error')`), 'importer sans code affiche une erreur');
  await typeCode('ceci n’est pas un code');
  await page.click('#btn-import');
  check(await page.eval(`document.querySelector('#save-status').classList.contains('error')`), 'un code invalide est refusé');
  check((await page.game()).gold === 0, 'un code invalide ne modifie pas la progression');

  await typeCode(code);
  await page.click('#btn-import');
  check((await page.text('#btn-import')) === 'Confirmer', 'un code valide demande une confirmation');
  check((await page.game()).gold === 0, 'rien n’est remplacé avant la confirmation');
  await shot('8-sauvegarde-import');
  await page.click('#btn-import');
  const imported = await page.game();
  check(imported.gold === beforeReload.gold && imported.selected === 'anne', 'la confirmation restaure l’or et l’apparence');
  check(imported.weapon === 'aura' && imported.difficulty === 'easy', 'la confirmation restaure l’arme et la difficulté');
  await page.click('#btn-save-back');
  check(!(await page.visible('#overlay-save')), 'l’écran de sauvegarde se ferme');
  check(goldOf(await page.text('#menu-gold')) === beforeReload.gold, 'le menu affiche l’or importé');
  await page.click('#btn-shop');
  check((await page.text('.shop-row .shop-level')).trim() === '1 / 10', 'les améliorations de la boutique sont restaurées');
  await page.click('#btn-shop-back');

  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('le rechargement', `!!window.__game && !document.querySelector('#btn-start').disabled`);
  const kept = await page.game();
  check(kept.gold === beforeReload.gold && kept.selected === 'anne' && kept.weapon === 'aura', 'la sauvegarde importée est conservée après rechargement');

  // --- Chaque arme à l'écran : rendu sans erreur, arme visible, ennemis touchés ---
  await page.eval('window.__game.addGold(5000)');
  for (const weapon of ['rifle', 'orbs', 'aura', 'spear']) {
    await page.click(`.weapon-card[data-id="${weapon}"]`);
    check((await page.game()).weapon === weapon, `arme choisie : ${weapon}`);
    await page.click('#btn-start');
    await page.eval('window.__game.spawn(10, 5)');
    await page.waitFor(`des ennemis tués avec l'arme ${weapon}`, 'window.__game.state().kills > 0', 15000);
    await page.eval('window.__game.spawn(8, 6)');
    await sleep(900);
    await shot(`9-arme-${weapon}`);
    check(JSON.stringify((await page.game()).weapons) === JSON.stringify([weapon]), `la partie ne contient que l'arme ${weapon}`);
    await page.click('#overlay-levelup:not(.hidden) .card');
    await page.click('#btn-pause');
    await page.click('#btn-quit');
    await page.click('#btn-menu');
    check((await page.game()).state === 'menu', 'retour au menu après la partie de test');
  }

  // --- Boss : annonce, barre de vie, butin à la mort ; puis récompenses de niveau ---
  await page.click('#btn-start');
  await page.eval('window.__game.setTime(119.5)');
  await page.waitFor('la bannière de boss', `!document.querySelector('#banner').classList.contains('hidden')`, 5000);
  check((await page.text('#banner')).includes('Boss'), 'une bannière annonce l’arrivée du boss');
  await page.waitFor('un boss en jeu', 'window.__game.state().bosses >= 1', 5000);
  await sleep(600);
  check((await page.eval(`document.querySelectorAll('.boss-bar').length`)) === 1, 'le boss a sa barre de vie');
  await shot('10-boss');
  await page.eval('window.__game.bringBosses(9)');
  await sleep(450);
  await shot('10b-boss-proche');
  const lootBefore = (await page.game()).pickups;
  await page.eval('window.__game.killBosses()');
  await page.waitFor('la gerbe de butin du boss', `window.__game.state().pickups >= ${lootBefore + 20}`, 5000);
  check((await page.game()).bosses === 0, 'le boss est mort');
  check((await page.eval(`document.querySelectorAll('.boss-bar').length`)) === 0, 'sa barre de vie disparaît avec lui');
  await sleep(300);
  await shot('11-butin-boss');

  await page.click('#overlay-levelup:not(.hidden) .card');
  // Tout au maximum : le niveau suivant ne propose aucune carte, la partie continue.
  await page.eval('window.__game.maxUpgrades()');
  await page.eval('window.__game.levelUp()');
  await sleep(700);
  check(!(await page.visible('#overlay-levelup')), 'plus aucune carte quand toutes les améliorations sont au maximum');
  check((await page.game()).state === 'playing', 'la partie continue sans interruption');
  await page.click('#btn-pause');
  await page.click('#btn-quit');
  await page.click('#btn-menu');
  check((await page.game()).state === 'menu', 'retour au menu après le test des boss');
  // --- Niveau 100 : mode Légende, puis badge sur l'arme utilisée ---
  const legendWeapon = (await page.game()).weapon;
  const legendDifficulty = (await page.game()).difficulty;
  check(Object.keys((await page.game()).legendBadges).length === 0, 'aucun badge avant d’avoir atteint le niveau 100');
  await page.click('#btn-start');
  await page.eval('window.__game.legend()');
  await page.waitFor('le mode Légende', 'window.__game.state().legendTime > 0', 5000);
  await page.waitFor('la bannière Légende', `document.querySelector('#banner').textContent.includes('LÉGENDE')`, 3000);
  check(await page.visible('#legend'), 'le compte à rebours de la Légende s’affiche');
  check(!(await page.visible('#overlay-levelup')), 'le niveau 100 ne propose aucune carte');
  check(((await page.game()).legendBadges[legendWeapon] ?? []).includes(legendDifficulty), 'le badge (arme + difficulté) est acquis dès l’entrée dans le mode');
  // Invincible : même un coup mortel ne tue pas le héros.
  await page.eval('window.__game.kill()');
  await sleep(600);
  check((await page.game()).state === 'playing', 'le héros survit à un coup mortel pendant le mode Légende');
  await shot('13-legende');
  await page.click('#btn-pause');
  await page.click('#btn-quit');
  await page.click('#btn-menu');
  await sleep(400);
  check(await page.eval(`!!document.querySelector('.weapon-card[data-id="${legendWeapon}"] .legend-badge')`), 'le badge apparaît à côté de l’arme utilisée');
  check((await page.eval(`document.querySelectorAll('.legend-badge').length`)) === 1, 'une seule arme porte le badge');
  check((await page.text('#weapon-desc')).includes('Niveau 100 atteint'), 'la description de l’arme choisie écrit « Niveau 100 atteint » (l’info-bulle du trophée est invisible au toucher)');
  // Le badge est propre à la difficulté : il disparaît pour les autres, et revient avec la bonne.
  const otherDifficulty = legendDifficulty === 'hard' ? 'normal' : 'hard';
  await page.click(`.diff-btn[data-id="${otherDifficulty}"]`);
  check((await page.eval(`document.querySelectorAll('.legend-badge').length`)) === 0, 'le badge n’apparaît pas pour une autre difficulté');
  check(!(await page.text('#weapon-desc')).includes('Niveau 100'), 'la mention « Niveau 100 atteint » non plus');
  await page.click(`.diff-btn[data-id="${legendDifficulty}"]`);
  check((await page.eval(`document.querySelectorAll('.legend-badge').length`)) === 1, 'le badge revient avec la difficulté d’origine');
  check((await page.text('#weapon-desc')).includes('Niveau 100 atteint'), 'la mention revient aussi');
  await shot('14-badge-legende');
  check(page.problems.length === 0, `aucune erreur ni avertissement dans la console${page.problems.length ? ' :\n' + page.problems.join('\n') : ''}`);
}

/** Appareils testés dans les deux orientations. */
const DEVICES = [
  { name: 'tel-vertical', width: 390, height: 844 },
  { name: 'tel-horizontal', width: 844, height: 390 },
  { name: 'petit-vertical', width: 360, height: 640 },
  { name: 'petit-horizontal', width: 667, height: 375 },
];

/**
 * Téléphone ou tablette tenu à la verticale : l'invitation à tourner s'affiche par-dessus le jeu. Les tests qui jouent
 * à la verticale choisissent « Jouer quand même ». Renvoie vrai si l'invitation était là.
 */
async function dismissRotateInvitation(page, label) {
  if (!(await page.visible('#overlay-rotate'))) return false;
  await page.tapElement('#btn-rotate-skip');
  check(!(await page.visible('#overlay-rotate')), `${label} : « Jouer quand même à la verticale » referme l’invitation`);
  return true;
}

async function setDevice(page, width, height) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
    screenOrientation: width > height ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 },
  });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}

/**
 * Mode ?debug et économie d'énergie : le compteur de performances est visible en bas à gauche et se remplit, et le flou
 * derrière les écrans n'existe que sur ordinateur (voir src/quality.ts).
 */
async function checkPerfCounter(page, label, mobile) {
  await page.waitFor('le compteur de performances', `(document.querySelector('#perf')?.textContent ?? '').includes('i/s')`, 5000);
  const perf = await page.eval(`(() => {
    const node = document.querySelector('#perf');
    const r = node.getBoundingClientRect();
    // Le compteur ne reçoit pas les appuis (pointer-events: none), donc elementFromPoint l'ignorerait : on le rend touchable le temps de la mesure.
    node.style.pointerEvents = 'auto';
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    node.style.pointerEvents = '';
    return {
      text: node.textContent,
      fixed: getComputedStyle(node).position === 'fixed',
      inside: r.width > 0 && r.height > 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.top > innerHeight / 2,
      onTop: top === node,
      device: document.documentElement.dataset.device,
      blur: getComputedStyle(document.querySelector('#overlay-pause')).backdropFilter,
    };
  })()`);
  check(perf.fixed && perf.inside, `${label} : le compteur ?debug est posé en bas à gauche (${perf.text})`);
  check(perf.onTop, `${label} : rien ne recouvre le compteur ?debug`);
  check(perf.device === (mobile ? 'mobile' : 'desktop'), `${label} : l'appareil est reconnu comme ${mobile ? 'mobile' : 'PC'} (${perf.device})`);
  check(mobile ? perf.blur === 'none' : perf.blur.includes('blur'), `${label} : ${mobile ? 'pas de flou derrière les écrans sur mobile' : 'flou conservé derrière les écrans sur PC'} (${perf.blur})`);
}

/** Une liste d'éléments doit être atteignable au doigt. */
async function checkReachable(page, label, selectors, needHit = true) {
  const problems = [];
  for (const selector of selectors) {
    const result = await page.reachable(selector, needHit);
    if (result !== 'ok') problems.push(`${selector} : ${result}`);
  }
  check(problems.length === 0, `${label}${problems.length ? ' :\n    ' + problems.join('\n    ') : ''}`);
}

/** La page ne doit ni déborder en largeur ni en hauteur (hors zones défilantes). */
async function checkNoOverflow(page, label) {
  const overflow = await page.eval('({ w: document.documentElement.scrollWidth - innerWidth, h: document.documentElement.scrollHeight - innerHeight })');
  check(overflow.w <= 1 && overflow.h <= 1, `${label} : la page ne déborde pas (${overflow.w} px en largeur, ${overflow.h} px en hauteur)`);
}

/**
 * Parcours au doigt sur un téléphone, tenu à la verticale puis à l'horizontale : tout reste visible et atteignable,
 * le joystick et l'attaque spéciale répondent, et faire pivoter le téléphone en pleine partie ne casse rien.
 */
async function orientationScenario(page, url, device) {
  const shot = (name) => page.screenshot(`${device.name}-${name}`);
  const at = (fx, fy) => ({ x: Math.round(device.width * fx), y: Math.round(device.height * fy) });
  await setDevice(page, device.width, device.height);
  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('la page de jeu', `!!document.querySelector('#btn-start')`);
  await page.eval('localStorage.clear()');
  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('le chargement des modèles', `!!window.__game && document.querySelector('#btn-start') && !document.querySelector('#btn-start').disabled`);
  await sleep(500);
  // Tenu à la verticale, l'appareil reçoit l'invitation à tourner ; à l'horizontale, jamais.
  if (device.height > device.width) {
    check(await page.visible('#overlay-rotate'), `${device.name} : en vertical, l’invitation à tourner s’affiche`);
    await dismissRotateInvitation(page, device.name);
  } else {
    check(!(await page.visible('#overlay-rotate')), `${device.name} : à l’horizontal, pas d’invitation`);
  }

  // --- Menu ---
  await checkNoOverflow(page, 'menu');
  await checkReachable(page, 'menu : tout est atteignable au doigt', [
    '#overlay-start .logo svg',
    '#btn-music-menu',
    '#btn-sound',
    '#btn-save',
    '.weapon-card[data-id="rifle"]',
    '.weapon-card[data-id="spear"]',
    '.diff-btn[data-id="easy"]',
    '.diff-btn[data-id="extreme"]',
    '#btn-shop',
    '#btn-start',
    '#btn-collection',
  ]);
  await page.eval('window.scrollTo(0, 0); document.querySelector("#overlay-start").scrollTo(0, 0)');
  await shot('1-menu');

  // --- Boutique et sauvegarde ---
  await page.tapElement('#btn-shop');
  check(await page.visible('#overlay-shop'), 'la boutique s’ouvre au doigt');
  await checkReachable(page, 'boutique : onglets, achats et retour atteignables', ['#tab-upgrades', '#tab-chests', '.shop-row:first-child .shop-buy', '.shop-row:last-child .shop-buy', '#btn-shop-back']);
  await page.eval('document.querySelector("#overlay-shop").scrollTo(0, 0)');
  await shot('2-boutique');
  await page.tapElement('#btn-shop-back');
  await page.tapElement('#btn-save');
  check(await page.visible('#overlay-save'), 'l’écran de sauvegarde s’ouvre au doigt');
  await checkReachable(page, 'sauvegarde : export, saisie, import et retour atteignables', ['#btn-export-copy', '#btn-export-file', '#save-code', '#btn-import', '#btn-save-back']);
  await page.eval('document.querySelector("#overlay-save").scrollTo(0, 0)');
  await shot('3-sauvegarde');
  await page.tapElement('#btn-save-back');

  // --- Coffres : arme secrète, amulettes, apparence ; puis collection ---
  await page.eval('window.__game.addGold(6000)');
  check(await page.reachable('#btn-shop') === 'ok' && await page.reachable('#btn-collection') === 'ok', 'les boutons Boutique et Collection sont atteignables au menu');
  check(await page.eval(`document.querySelector('#btn-shop').classList.contains('ready')`), 'le bouton Boutique s’anime quand on a de quoi ouvrir un coffre');
  await page.eval('document.querySelector("#overlay-start").scrollTo(0, 0)');
  await shot('2a-menu-coffre-pret');
  await page.tapElement('#btn-shop');
  await page.tapElement('#tab-chests');
  check((await page.visible('#overlay-shop')) && (await page.visible('#panel-chests')), 'l’onglet Coffres de la boutique s’ouvre au doigt');
  check(await page.eval(`document.querySelector('#tab-chests').classList.contains('alert')`), 'l’onglet Coffres porte une pastille quand un coffre est abordable');
  await page.eval('document.querySelector("#overlay-shop").scrollTo(0, 0)');
  await shot('2a0-boutique-coffres');
  await checkReachable(page, 'coffres : les deux offres, les onglets et le retour sont atteignables', ['#btn-chest-1', '#btn-chest-3', '#tab-upgrades', '#btn-shop-back']);
  const openWhole = `!document.querySelector('#overlay-reveal').classList.contains('hidden')`;
  const phase = (name) => `document.querySelector('#overlay-reveal').dataset.phase === '${name}'`;
  // Tout doit tenir dans l'écran SANS défiler (le plein écran ne défile pas) : on ne fait donc aucun scrollIntoView ici.
  // Renvoie la liste des éléments qui dépassent de l'écran (vide si tout tient).
  const overflowing = (selectors) =>
    page.eval(`${JSON.stringify(selectors)}.flatMap((sel) => { const found = [...document.querySelectorAll(sel)]; if (found.length === 0) return [sel + ' : absent']; return found.filter((el) => { const r = el.getBoundingClientRect(); return !(r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1); }).map((el) => { const r = el.getBoundingClientRect(); return sel + ' [' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',') + '] dans ' + innerWidth + '×' + innerHeight; }); })`);
  const fits = async (selectors, label) => {
    // On laisse finir les animations d'arrivée, qui dépassent un instant (rebond).
    await sleep(900);
    const bad = await overflowing(selectors);
    check(bad.length === 0, `${label}${bad.length ? ' :\n    ' + bad.join('\n    ') : ''}`);
  };
  // Idem pour le toucher : les boutons doivent être dans l'écran et rien ne doit les recouvrir, sans défilement (qui fausserait la mesure).
  const touchable = (selectors) =>
    page.eval(`${JSON.stringify(selectors)}.every((sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1 && (top === el || el.contains(top)); })`);
  const actionsShown = `!document.querySelector('#reveal-actions').classList.contains('hidden')`;
  const screenSize = await page.eval('({ w: innerWidth, h: innerHeight })');
  // Dés truqués : 0,001 est le tirage de l'arme secrète.
  await page.eval('window.__game.chestRandom([0.001, 0.5])');
  await page.tapElement('#btn-chest-1');
  await page.waitFor('l’ouverture en plein écran', openWhole, 3000);
  check(await page.eval(`!!document.querySelector('#overlay-reveal .reveal-chest')`), 'le coffre apparaît en plein écran');
  await page.waitFor('la musique des coffres', 'window.__game.state().audio.wanted === "chest"', 3000);
  check(true, 'la musique des coffres remplace celle du menu pendant l’ouverture');
  await sleep(550);
  check(await page.eval(phase('tension')), 'le coffre tremble avant de s’ouvrir');
  await shot('2a1-coffre-tension');
  await page.waitFor('la carte du contenu', `!!document.querySelector('#overlay-reveal .reveal-card')`, 5000);
  await sleep(350);
  await shot('2a2-carte-plein-ecran');
  const card = await page.text('#overlay-reveal .reveal-card');
  check(card.includes('Mines') && card.includes('Nouvelle arme secrète'), 'la carte annonce l’arme secrète');
  await fits(['#overlay-reveal .reveal-card'], 'la carte tient entièrement dans l’écran');
  await page.waitFor('les boutons de fin', actionsShown, 4000);
  check(await touchable(['#reveal-again', '#reveal-close']), 'plein écran : « Encore » et « Terminer » sont dans l’écran et touchables');
  await fits(['#overlay-reveal .reveal-card', '#reveal-again', '#reveal-close'], 'coffre unique : la carte et les boutons tiennent dans l’écran sans défiler');
  check((await page.game()).savedWeapons.includes('mines') && (await page.game()).gold === 5000, 'l’arme est débloquée et le coffre coûte 1000 pièces');
  check(/1000/.test(await page.text('#reveal-again')), 'le bouton « Encore » indique le prix');
  await shot('2b-fin-coffre');
  // « Encore » ouvre directement un autre coffre : ici une apparence.
  await page.eval('window.__game.chestRandom([0.5, 0])');
  await page.tapElement('#reveal-again');
  await page.waitFor('la seconde carte', `!!document.querySelector('#overlay-reveal .reveal-card')`, 6000);
  check((await page.text('#overlay-reveal .reveal-card')).includes('Écarlate'), 'l’apparence trouvée s’annonce en plein écran');
  await page.waitFor('les boutons de fin', actionsShown, 4000);
  check((await page.game()).cosmetics.projectile.includes('crimson'), 'une apparence est trouvée');
  await page.tapElement('#reveal-close');
  check(!(await page.eval(openWhole)), '« Terminer » referme le plein écran');
  await page.waitFor('le retour à la musique du menu', 'window.__game.state().audio.wanted === "menu"', 3000);
  check(true, 'la musique du menu revient à la fermeture des coffres');
  // Trois coffres d'amulettes pour 2500 pièces : trois cartes à passer au toucher, puis le récapitulatif.
  await page.eval('window.__game.chestRandom([0.2, 0])');
  await page.tapElement('#btn-chest-3');
  for (let i = 1; i <= 3; i++) {
    await page.waitFor(`la carte ${i} sur 3`, phase('card-ready'), 8000);
    check((await page.text('#reveal-count')) === `${i} / 3`, `le compteur indique ${i} / 3`);
    if (i === 1) await shot('2c1-carte-1-sur-3');
    await page.tap(Math.round(screenSize.w / 2), Math.round(screenSize.h * 0.35));
  }
  await page.waitFor('le récapitulatif', `${phase('end')} && document.querySelectorAll('.reveal-mini').length === 3`, 5000);
  check((await page.game()).gold === 1500 && (await page.game()).amulets.sage === 3, 'trois coffres coûtent 2500 pièces et donnent trois amulettes');
  check(await touchable(['#reveal-again', '#reveal-close']), 'récapitulatif : les boutons sont dans l’écran et touchables');
  await fits(['.reveal-recap-title', '.reveal-mini', '#reveal-again', '#reveal-close'], 'récapitulatif : le titre, les trois contenus et les boutons tiennent dans l’écran sans défiler');
  await shot('2c2-recapitulatif');
  await page.tapElement('#reveal-close');
  check(!(await page.eval(openWhole)), 'le plein écran se referme après le récapitulatif');
  // Plus assez de pièces : les offres sont grisées.
  await page.eval('window.__game.addGold(-1400)');
  check((await page.eval(`document.querySelector('#btn-chest-1').disabled && document.querySelector('#btn-chest-3').disabled`)), 'sans assez de pièces, les offres sont grisées');
  await page.tapElement('#btn-shop-back');
  await page.tapElement('#btn-collection');
  check(await page.visible('#overlay-collection'), 'la collection s’ouvre au doigt');
  await checkReachable(page, 'collection : onglets, huit héros et retour atteignables', ['#tab-heroes', '#tab-styles', '#tab-amulets', '.char-card[data-id="ombre"]', '.char-card[data-id="anne"]', '.char-card[data-id="sam"]', '.char-card[data-id="pirate"]', '.char-card[data-id="lis"]', '.char-card[data-id="matt"]', '#btn-collection-back']);
  await page.eval('document.querySelector("#overlay-collection").scrollTo(0, 0)');
  await shot('2d0-collection-heros');
  // Aperçu : le héros se voit en entier (de la tête aux pieds) dans la zone prévue pour lui, sans être masqué par les cartes.
  await sleep(1300);
  const preview = await page.eval(`(() => {
    const b = window.__game.heroBox();
    const stage = document.querySelector('#hero-stage').getBoundingClientRect();
    return { previewing: window.__game.state().previewing, top: b.top, bottom: b.bottom, x: b.x, cameraY: b.cameraY, stageTop: stage.top, stageBottom: stage.bottom, w: innerWidth, h: innerHeight };
  })()`);
  check(preview.previewing, 'la collection montre l’aperçu du héros');
  check(preview.cameraY >= 0.5 - 1e-6, `l’aperçu garde la caméra au-dessus du sol, qui reste visible (hauteur ${preview.cameraY.toFixed(2)})`);
  // Un héros à acheter réduit la fenêtre d'aperçu (bouton « Acheter ») : la caméra ne doit pas passer sous le sol.
  await page.tapElement('.char-card[data-id="pip"]');
  await sleep(1300);
  const locked = await page.eval(`(() => {
    const b = window.__game.heroBox();
    const stage = document.querySelector('#hero-stage').getBoundingClientRect();
    return { trying: window.__game.state().trying, top: b.top, bottom: b.bottom, cameraY: b.cameraY, stageTop: stage.top, stageBottom: stage.bottom, w: innerWidth, h: innerHeight };
  })()`);
  check(locked.trying === 'pip' && locked.cameraY >= 0.5 - 1e-6, `aperçu d’un héros à acheter : la caméra reste au-dessus du sol (hauteur ${locked.cameraY.toFixed(2)})`);
  if (locked.h > locked.w) check(locked.top >= locked.stageTop - 4 && locked.bottom <= locked.stageBottom + 4, `le héros à acheter se voit en entier dans la fenêtre d’aperçu (tête ${Math.round(locked.top)}, pieds ${Math.round(locked.bottom)}, fenêtre ${Math.round(locked.stageTop)}–${Math.round(locked.stageBottom)})`);
  await page.tapElement('.char-card[data-id="ombre"]');
  if (preview.h > preview.w) {
    check(preview.top >= preview.stageTop - 4 && preview.bottom <= preview.stageBottom + 4, `le héros se voit en entier dans la fenêtre d’aperçu (tête ${Math.round(preview.top)}, pieds ${Math.round(preview.bottom)}, fenêtre ${Math.round(preview.stageTop)}–${Math.round(preview.stageBottom)})`);
    check(preview.stageBottom - preview.stageTop >= 150, 'la fenêtre d’aperçu est assez haute');
  } else {
    check(preview.top >= 0 && preview.bottom <= preview.h && preview.x < preview.w * 0.5, `le héros se voit en entier, dans la moitié gauche de l’écran (tête ${Math.round(preview.top)}, pieds ${Math.round(preview.bottom)})`);
  }
  await page.tapElement('#tab-amulets');
  check(!(await page.game()).previewing, 'l’aperçu du héros s’arrête quand on quitte l’onglet des héros');
  check((await page.visible('#panel-amulets')) && !(await page.visible('#panel-heroes')), 'l’onglet Amulettes remplace celui des héros');
  await checkReachable(page, 'collection : amulette et retour atteignables', ['.amulet-row[data-id="sage"] .amulet-toggle', '#btn-collection-back']);
  await page.tapElement('.amulet-row[data-id="sage"] .amulet-toggle');
  check((await page.game()).amulet === 'sage', 'l’amulette est équipée');
  await page.tapElement('.amulet-row.equipped .amulet-actions button:nth-child(2)');
  check((await page.text('.amulet-row.equipped .amulet-desc')).includes('Niveau 2'), 'on peut renforcer l’amulette avec un second exemplaire');
  // « − » baisse le niveau, et au niveau 1 (un seul exemplaire équipé) il retire l'amulette, comme « Retirer ».
  await page.tapElement('.amulet-row.equipped .step-btn:nth-child(1)');
  check((await page.text('.amulet-row.equipped .amulet-desc')).includes('Niveau 1') && (await page.game()).amulet === 'sage', 'le bouton « − » baisse l’amulette au niveau 1');
  check(await page.eval(`!document.querySelector('.amulet-row.equipped .step-btn:nth-child(1)').disabled`), 'au niveau 1, le bouton « − » n’est pas grisé : il retire l’amulette');
  await page.tapElement('.amulet-row.equipped .step-btn:nth-child(1)');
  check((await page.game()).amulet === '' && !(await page.eval(`!!document.querySelector('.amulet-row.equipped')`)), '« − » au niveau 1 retire l’amulette, comme « Retirer »');
  check((await page.game()).amulets.sage === 3, 'retirer l’amulette ne consomme aucun exemplaire');
  // On la rééquipe pour la suite du test.
  await page.tapElement('.amulet-row[data-id="sage"] .amulet-toggle');
  await page.tapElement('.amulet-row.equipped .amulet-actions button:nth-child(2)');
  check((await page.text('.amulet-row.equipped .amulet-desc')).includes('Niveau 2'), 'rééquipée, l’amulette remonte au niveau 2 avec « + »');
  check((await page.text('#btn-amulet')).includes('×2') && !(await page.eval(`document.querySelector('#btn-amulet').classList.contains('hidden')`)), 'le menu montre l’amulette équipée et son niveau');
  await page.tapElement('#tab-styles');
  await checkReachable(page, 'collection : apparences atteignables', ['.swatch[data-category="projectile"][data-id="crimson"]', '.swatch[data-category="dust"][data-id="default"]', '#btn-collection-back']);
  await page.tapElement('.swatch[data-category="projectile"][data-id="crimson"]');
  check((await page.game()).style.projectile === 'crimson', 'l’apparence trouvée se sélectionne');
  check(await page.eval(`document.querySelector('.swatch[data-category="projectile"][data-id="cyan"]').disabled`), 'une apparence non trouvée reste verrouillée');
  await page.eval('document.querySelector("#overlay-collection").scrollTo(0, 0)');
  await shot('2d-collection');
  await page.tapElement('#btn-collection-back');

  // --- Partie ---
  await page.tapElement('#btn-start');
  await page.waitFor('la partie', 'window.__game.state().state === "playing"', 5000);
  const worn = await page.game();
  check(worn.amulets.sage === 1, 'l’amulette (niveau 2) est consommée au lancement : 2 exemplaires sur 3');
  check(worn.amulet === '', 'l’amulette est déséquipée dès que la partie commence, même s’il en reste');
  check(await page.eval(`document.querySelector('#btn-amulet').classList.contains('hidden')`), 'la pastille de l’amulette disparaît du menu quand l’amulette est consommée');
  check(Math.abs(worn.xpMult - 1.5) < 0.001, `l’amulette renforce le héros pour cette partie (XP ×${worn.xpMult})`);
  await sleep(500);
  // L'interface de jeu laisse passer les appuis vers le terrain : on vérifie qu'elle est visible, et que seul le bouton pause se touche.
  const HUD = ['#xp-bar', '#hp-bar', '#timer', '#kills', '#gold', '#btn-pause', '#special'];
  await checkReachable(page, 'partie : l’interface est visible dans l’écran', HUD, false);
  await checkReachable(page, 'partie : le bouton pause est touchable', ['#btn-pause']);
  let overlap = [];
  for (const [a, b] of [['#hp-bar', '#timer'], ['#timer', '#kills'], ['#kills', '#gold'], ['#gold', '#btn-pause'], ['#hp-bar', '#btn-pause'], ['#special', '#btn-pause']]) {
    if (await page.overlaps(a, b)) overlap.push(`${a} / ${b}`);
  }
  check(overlap.length === 0, `partie : les éléments de l’interface ne se chevauchent pas${overlap.length ? ' : ' + overlap.join(', ') : ''}`);
  await shot('4-partie');

  // Joystick au doigt : glisser vers la droite puis vers le haut de l'écran.
  const start = await page.game();
  const origin = at(0.22, 0.7);
  await page.drag(origin, { x: origin.x + 90, y: origin.y }, 700);
  const right = await page.game();
  check(right.x > start.x + 1, `le joystick déplace le héros vers la droite (${(right.x - start.x).toFixed(1)} unités)`);
  await page.drag(origin, { x: origin.x, y: origin.y - 70 }, 700);
  const up = await page.game();
  check(up.z < right.z - 1, `le joystick déplace le héros vers le haut (${(right.z - up.z).toFixed(1)} unités)`);

  // Attaque spéciale : appui bref sur le terrain.
  await page.eval('window.__game.fillSpecial()');
  await sleep(150);
  const target = at(0.62, 0.45);
  await page.tap(target.x, target.y);
  check((await page.game()).charge < 1, 'un appui bref sur le terrain déclenche l’attaque spéciale');

  // Jeu à deux mains : un doigt déplace le héros, un deuxième appui bref (autre doigt) déclenche l'attaque spéciale.
  await page.eval('window.__game.fillSpecial()');
  await sleep(150);
  const left = at(0.2, 0.7);
  const leftMoved = { x: left.x + 90, y: left.y };
  const rightHand = at(0.7, 0.4);
  const twoStart = await page.game();
  await page.eval("window.__ev = []; for (const t of ['pointerdown', 'pointerup']) document.querySelector('#game').addEventListener(t, (e) => window.__ev.push(t.slice(7) + ':' + e.pointerId + ':' + (e.isPrimary ? 'P' : 's')))");
  await page.touch('touchStart', [left]);
  for (let i = 1; i <= 6; i++) {
    await page.touch('touchMove', [{ x: left.x + (90 * i) / 6, y: left.y }]);
    await sleep(25);
  }
  await sleep(150);
  const moving = await page.game();
  check(moving.x > twoStart.x + 0.3, 'à deux mains : le premier doigt déplace le héros');

  // Un vrai deuxième doigt (les outils de test ne savent pas en lever un seul : il reste posé, donc c'est un appui long, sans tap).
  await page.touch('touchStart', [leftMoved, rightHand]);
  await sleep(450);
  const events = await page.eval("window.__ev.join(' ')");
  check(/down:\d+:P/.test(events) && /down:\d+:s/.test(events),`à deux mains : Chrome envoie un événement distinct pour le deuxième doigt (${events})`);
  check((await page.game()).charge >= 1, 'à deux mains : un deuxième doigt qui reste posé ne déclenche pas l’attaque spéciale');
  const beforeTap = await page.game();

  // Appuis d'un deuxième doigt : de vrais événements de pointeur envoyés à la page, pendant que le premier doigt déplace toujours le héros.
  const secondFinger = (id, hold) =>
    page.eval(`(async () => {
      const surface = document.querySelector('#game');
      const send = (type) => surface.dispatchEvent(new PointerEvent(type, { pointerId: ${id}, pointerType: 'touch', isPrimary: false, bubbles: true, clientX: ${rightHand.x}, clientY: ${rightHand.y} }));
      send('pointerdown');
      await new Promise((resolve) => setTimeout(resolve, ${hold}));
      send('pointerup');
    })()`);
  await secondFinger(91, 450);
  check((await page.game()).charge >= 1, 'à deux mains : un deuxième appui trop long ne déclenche pas l’attaque spéciale');
  await secondFinger(92, 60);
  await sleep(150);
  check((await page.game()).charge < 1, 'à deux mains : un deuxième appui bref déclenche l’attaque spéciale');
  await sleep(500);
  const afterTap = await page.game();
  check(afterTap.x > beforeTap.x + 0.5, 'à deux mains : le premier doigt continue de déplacer le héros pendant et après le tap');
  await page.touch('touchEnd', []);
  await sleep(150);

  // Pause au doigt.
  await page.tapElement('#btn-pause');
  check((await page.game()).state === 'paused', 'le bouton pause répond au doigt');
  await checkReachable(page, 'pause : reprendre et quitter atteignables', ['#btn-resume', '#btn-quit']);
  await shot('5-pause');
  await page.tapElement('#btn-resume');
  check((await page.game()).state === 'playing', 'reprendre répond au doigt');

  // Niveau supérieur : trois cartes atteignables.
  await page.eval('window.__game.levelUp()');
  await page.waitFor('les cartes de niveau', `!document.querySelector('#overlay-levelup').classList.contains('hidden')`, 5000);
  await sleep(900);
  await checkReachable(page, 'niveau supérieur : les trois cartes sont atteignables', ['#cards .card:nth-child(1)', '#cards .card:nth-child(2)', '#cards .card:nth-child(3)']);
  await page.eval('document.querySelector("#overlay-levelup").scrollTo(0, 0)');
  await shot('6-niveau');
  await page.tapElement('#cards .card:nth-child(1)');
  check(!(await page.visible('#overlay-levelup')), 'choisir une carte au doigt referme l’écran');

  // --- On fait pivoter le téléphone en pleine partie ---
  const before = await page.game();
  await setDevice(page, device.height, device.width);
  await sleep(500);
  if (device.width > device.height) {
    // De l'horizontal vers la vertical : l'invitation apparaît et la partie se met en pause ; on joue quand même et on reprend.
    check(await page.visible('#overlay-rotate'), `${device.name} : en tournant vers la verticale, l’invitation s’affiche`);
    check((await page.game()).state === 'paused', `${device.name} : la partie se met en pause`);
    await dismissRotateInvitation(page, device.name);
    await page.tapElement('#btn-resume');
  }
  const size = await page.eval('({ w: innerWidth, h: innerHeight, cw: document.querySelector("canvas").clientWidth, ch: document.querySelector("canvas").clientHeight })');
  check(size.w === device.height && size.h === device.width, `le téléphone a pivoté (${size.w}×${size.h})`);
  check(size.cw === size.w && size.ch === size.h, `le jeu occupe tout l'écran après la rotation (canvas ${size.cw}×${size.ch})`);
  check((await page.game()).state === 'playing', 'la partie continue après la rotation');
  await checkReachable(page, 'après rotation : l’interface est visible dans l’écran', HUD, false);
  await checkReachable(page, 'après rotation : le bouton pause est touchable', ['#btn-pause']);
  await shot('7-pivote');
  const turned = { width: device.height, height: device.width };
  const pivot = { x: Math.round(turned.width * 0.22), y: Math.round(turned.height * 0.7) };
  await page.drag(pivot, { x: pivot.x + 90, y: pivot.y }, 700);
  check((await page.game()).x > before.x - 0.5 && (await page.game()).state === 'playing', 'le joystick répond encore après la rotation');
  await page.eval('window.__game.levelUp()');
  await page.waitFor('les cartes après rotation', `!document.querySelector('#overlay-levelup').classList.contains('hidden')`, 5000);
  await sleep(900);
  await checkReachable(page, 'après rotation : les cartes de niveau sont atteignables', ['#cards .card:nth-child(1)', '#cards .card:nth-child(3)']);
  await shot('8-niveau-pivote');
  await page.tapElement('#cards .card:nth-child(1)');

  // --- Fin de partie ---
  // Une montée de niveau en attente fige la simulation : on choisit une carte tant qu'il y en a une.
  await page.eval('window.__game.kill()');
  const gameOverShown = `!document.querySelector('#overlay-gameover').classList.contains('hidden')`;
  const deadline = Date.now() + 15000;
  while (!(await page.eval(gameOverShown)) && Date.now() < deadline) {
    await page.click('#overlay-levelup:not(.hidden) .card');
    await sleep(150);
  }
  if (!(await page.eval(gameOverShown))) {
    const detail = await page.eval(`JSON.stringify({ state: window.__game.state(), visible: [...document.querySelectorAll('.overlay')].filter((o) => !o.classList.contains('hidden')).map((o) => o.id), hidden: document.hidden, hp: document.querySelector('#hp-label')?.textContent })`);
    throw new Error('la fin de partie n’apparaît pas : ' + detail);
  }
  await checkReachable(page, 'fin de partie : bilan et boutons atteignables', ['#gameover-stats', '#btn-menu', '#btn-restart']);
  await shot('9-fin');
  await page.tapElement('#btn-menu');
  check((await page.game()).state === 'menu', 'le bouton Menu répond au doigt');
  await checkReachable(page, 'menu après rotation : tout est atteignable', ['#btn-start', '#btn-shop', '.weapon-card[data-id="rifle"]', '.diff-btn[data-id="extreme"]']);
  await page.eval('document.querySelector("#overlay-start").scrollTo(0, 0)');
  await shot('10-menu-pivote');

  // --- L’arme secrète apparaît au menu et fonctionne en partie ---
  check(await page.eval(`document.querySelectorAll('.weapon-card').length`) === 5, 'l’arme secrète trouvée apparaît au menu (5 armes)');
  await checkWeaponAlignment(page, 'menu à cinq armes (téléphone)');
  await checkReachable(page, 'menu à cinq armes : tout est atteignable au doigt', ['.weapon-card[data-id="mines"]', '.weapon-card[data-id="rifle"]', '#btn-start']);
  await page.eval('document.querySelector("#overlay-start").scrollTo(0, 0)');
  await shot('11-menu-5-armes');
  await page.tapElement('.weapon-card[data-id="mines"]');
  check((await page.game()).weapon === 'mines', 'l’arme secrète se choisit au doigt');
  await page.tapElement('#btn-start');
  await page.waitFor('la partie avec les Mines', 'window.__game.state().state === "playing"', 5000);
  await page.eval('window.__game.spawn(8, 5)');
  // Les mines se sèment en marchant : on fait aller et venir le héros au doigt jusqu'à ce qu'elles aient tué.
  const view = await page.eval('({ w: innerWidth, h: innerHeight })');
  const walkFrom = { x: Math.round(view.w * 0.22), y: Math.round(view.h * 0.7) };
  for (let i = 0; i < 14 && (await page.game()).kills === 0; i++) {
    await page.drag(walkFrom, { x: walkFrom.x + (i % 2 === 0 ? 90 : -90), y: walkFrom.y }, 700);
  }
  check((await page.game()).kills > 0, 'les mines, semées en marchant, tuent des ennemis');
  await shot('12-mines');
  check(JSON.stringify((await page.game()).weapons) === '["mines"]', 'la partie ne contient que les Mines');
  await page.click('#overlay-levelup:not(.hidden) .card');
  await page.tapElement('#btn-pause');
  await page.tapElement('#btn-quit');
  await page.tapElement('#btn-menu');
  check(page.problems.length === 0, `aucune erreur ni avertissement dans la console${page.problems.length ? ' :\n' + page.problems.join('\n') : ''}`);
}

/**
 * Profils de téléphones : iPhone (iOS, Safari) et Android (Chrome). Le navigateur réellement utilisé est toujours Chrome :
 * on reproduit donc ce qui peut l'être (identité du navigateur, taille d'écran, densité de pixels, tactile) et les
 * particularités d'iOS qui concernent le jeu (pas de vibration, ancien nom de l'API audio). Le rendu de WebKit lui-même
 * ne peut pas être testé ici : ce test n'est pas un essai sur un vrai iPhone.
 */
const PLATFORMS = [
  {
    name: 'iphone-15',
    width: 393,
    height: 852,
    dpr: 3,
    platform: 'iPhone',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    ios: true,
  },
  {
    name: 'iphone-se-ancien',
    width: 375,
    height: 667,
    dpr: 2,
    platform: 'iPhone',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
    ios: true,
    // Avant iOS 14.5, seul « webkitAudioContext » existe.
    oldAudio: true,
  },
  {
    name: 'pixel-7',
    width: 412,
    height: 915,
    dpr: 2.625,
    platform: 'Linux armv81',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  },
  {
    name: 'galaxy-s8',
    width: 360,
    height: 740,
    dpr: 3,
    platform: 'Linux armv8l',
    ua: 'Mozilla/5.0 (Linux; Android 9; SM-G950F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36',
  },
];

/** Tablettes : l'invitation à tourner s'y affiche aussi ; le bouton « Plein écran » seulement là où le verrouillage existe. */
const TABLETS = [
  {
    name: 'ipad',
    width: 820,
    height: 1180,
    dpr: 2,
    platform: 'MacIntel',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    // Safari ne sait pas verrouiller l'orientation.
    canLock: false,
  },
  {
    name: 'tablette-android',
    width: 800,
    height: 1280,
    dpr: 2,
    platform: 'Linux armv81',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    canLock: true,
  },
];

/** Ce qu'iOS a de différent, injecté dans la page avant tout le reste. */
function platformShims(platform) {
  const lines = [];
  // Sur Android, la vibration existe : on la compte pour vérifier que le jeu ne s'en sert pas.
  if (!platform.ios) lines.push("Object.defineProperty(Navigator.prototype, 'vibrate', { value: () => { window.__vibrations = (window.__vibrations || 0) + 1; return true; }, configurable: true });");
  // iOS n'a pas de vibration.
  if (platform.ios) lines.push("Object.defineProperty(Navigator.prototype, 'vibrate', { value: undefined, configurable: true });");
  // Plein écran et orientation : Chrome sans fenêtre ne les fait pas vraiment, on remplace les API par des témoins
  // (état du plein écran, verrouillages demandés). iOS : l'API plein écran n'existe pas sur iPhone.
  lines.push(`(() => {
    window.__fs = { locks: [], unlocks: 0 };
    // Chrome déclenche lui-même la vraie proposition d'installation (le jeu est installable) : on la retient, pour que seule la fausse, envoyée par le test, atteigne le jeu.
    window.addEventListener('beforeinstallprompt', (event) => { if (!event.__fake) event.stopImmediatePropagation(); }, true);
    let current = null;
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => ${platform.ios ? 'false' : 'true'}, configurable: true });
    ${
      platform.ios
        ? ''
        : `Object.defineProperty(Document.prototype, 'fullscreenElement', { get: () => current, configurable: true });
    Document.prototype.exitFullscreen = async function () { current = null; document.dispatchEvent(new Event('fullscreenchange')); };
    Element.prototype.requestFullscreen = async function () { current = this; document.dispatchEvent(new Event('fullscreenchange')); };`
    }
    const orientation = { ${platform.canLock === false ? '' : 'lock: async (kind) => { window.__fs.locks.push(kind); },'} unlock: () => { window.__fs.unlocks++; } };
    Object.defineProperty(Screen.prototype, 'orientation', { get: () => orientation, configurable: true });
  })();`);
  if (platform.oldAudio) lines.push("window.webkitAudioContext = window.AudioContext; Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true });");
  return lines.join('\n');
}

/**
 * Le jeu doit fonctionner de la même façon sur iOS et sur Android : les mêmes icônes (aucun emoji dessiné par le système,
 * pièce bien jaune), le son et la musique qui démarrent, le jeu qui se joue au doigt, les coffres.
 */
async function platformScenario(page, url, platform) {
  const shot = (name) => page.screenshot(`${platform.name}-${name}`);
  await page.send('Emulation.setUserAgentOverride', { userAgent: platform.ua, platform: platform.platform });
  await page.send('Emulation.setDeviceMetricsOverride', { width: platform.width, height: platform.height, deviceScaleFactor: platform.dpr, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const shims = platformShims(platform);
  const shim = shims ? await page.send('Page.addScriptToEvaluateOnNewDocument', { source: shims }) : null;

  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('la page de jeu', `!!document.querySelector('#btn-start')`);
  await page.eval('localStorage.clear()');
  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('le chargement des modèles', `!!window.__game && document.querySelector('#btn-start') && !document.querySelector('#btn-start').disabled`);
  await sleep(600);

  // Téléphone en vertical (iPhone comme Android) : l'invitation à tourner recouvre le jeu ; on choisit de jouer à la verticale.
  check(await page.visible('#overlay-rotate'), `${platform.name} en vertical : l’invitation à tourner s’affiche`);
  await dismissRotateInvitation(page, platform.name);

  check((await page.eval('navigator.userAgent')) === platform.ua, `le navigateur se présente comme ${platform.name}`);
  if (platform.ios) check((await page.eval("typeof navigator.vibrate")) === 'undefined', 'iOS : pas de vibration, le jeu doit s’en passer');
  if (platform.oldAudio) check((await page.eval('typeof window.AudioContext')) === 'undefined' && (await page.eval('typeof window.webkitAudioContext')) === 'function', 'ancien iOS : seul webkitAudioContext existe');

  // --- Icônes : les mêmes partout ---
  const icons = await page.eval(`(() => {
    const images = [...document.querySelectorAll('#app img.emoji')];
    const raw = [...document.querySelector('#app').textContent].filter((c) => /\\p{Extended_Pictographic}/u.test(c));
    return { count: images.length, broken: images.filter((i) => !(i.complete && i.naturalWidth > 0)).length, raw: raw.join('') };
  })()`);
  check(icons.count >= 8, `les icônes du menu sont des images du jeu (${icons.count})`);
  check(icons.broken === 0, 'toutes les images d’icônes se chargent');
  check(icons.raw === '', `aucun emoji n’est laissé au système (${icons.raw || 'aucun'})`);
  // La pièce doit être jaune (sur iOS, l'emoji du système la rend grisâtre).
  const coin = await page.eval(`(() => {
    const img = document.querySelector('#menu-gold img.emoji');
    if (!img) return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 36;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 36, 36);
    const data = ctx.getImageData(0, 0, 36, 36).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
    return n ? { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) } : null;
  })()`);
  check(coin && coin.r > 200 && coin.g > 140 && coin.r - coin.b > 80, `l’icône de pièce est jaune (${coin ? `rgb(${coin.r}, ${coin.g}, ${coin.b})` : 'introuvable'})`);
  await shot('1-menu');

  // --- Son et musique : démarrent au premier geste ---
  check((await page.game()).audio.state === 'aucun', 'avant tout geste, aucun son (règle des navigateurs mobiles)');
  await page.tapElement('#btn-shop');
  await page.tapElement('#btn-shop-back');
  await page.waitFor('l’audio actif', 'window.__game.state().audio.state === "running"', 5000);
  check((await page.game()).audio.track === 'menu', 'la musique du menu démarre au premier geste');

  // --- Une partie au doigt ---
  await page.tapElement('#btn-start');
  await page.waitFor('la partie', 'window.__game.state().state === "playing"', 5000);
  check((await page.game()).audio.track === 'game', 'la musique de la partie remplace celle du menu');
  const before = await page.game();
  const origin = { x: Math.round(platform.width * 0.22), y: Math.round(platform.height * 0.7) };
  await page.drag(origin, { x: origin.x + 90, y: origin.y }, 700);
  check((await page.game()).x > before.x + 1, 'le joystick déplace le héros');
  await page.eval('window.__game.setTime(119.5)');
  await page.waitFor('un boss', 'window.__game.state().bosses >= 1', 6000);
  check((await page.game()).audio.track === 'boss', 'la musique des boss se lance quand un boss arrive');
  await shot('2-partie-boss');
  await page.eval('window.__game.killBosses()');
  await page.waitFor('la fin du boss', 'window.__game.state().bosses === 0', 4000);
  await page.waitFor('le retour à la musique de partie', 'window.__game.state().audio.track === "game"', 4000);
  await page.click('#overlay-levelup:not(.hidden) .card');
  await page.tapElement('#btn-pause');
  await page.tapElement('#btn-quit');
  await page.tapElement('#btn-menu');
  await page.waitFor('la musique du menu', 'window.__game.state().audio.track === "menu"', 4000);

  // --- Un coffre en plein écran ---
  await page.eval('window.__game.addGold(5000)');
  await page.eval('window.__game.chestRandom([0.001, 0.5])');
  await page.tapElement('#btn-shop');
  await page.tapElement('#tab-chests');
  await page.tapElement('#btn-chest-1');
  await page.waitFor('la carte du coffre', `!!document.querySelector('#overlay-reveal .reveal-card')`, 6000);
  await sleep(1200);
  const card = await page.eval(`(() => { const r = document.querySelector('#overlay-reveal .reveal-card').getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1; })()`);
  check(card, 'la carte du coffre tient dans l’écran');
  await shot('3-coffre');
  await page.tapElement('#reveal-close');
  check(!(await page.visible('#overlay-reveal')), 'le plein écran du coffre se referme');
  check((await page.eval('window.__vibrations ?? 0')) === 0, 'ouvrir un coffre ne fait jamais vibrer le téléphone');
  check(page.problems.length === 0, `aucune erreur ni avertissement dans la console${page.problems.length ? ' :\n' + page.problems.join('\n') : ''}`);

  if (shim) await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: shim.identifier });
}

/**
 * Plein écran et horizontal sur mobile.
 * Android : le bouton passe en plein écran et verrouille l'horizontal, sans jamais imposer de rotation à l'écran.
 * iPhone (Apple l'interdit) : le bouton explique l'installation sur l'écran d'accueil, et l'invitation à tourner le téléphone
 * s'affiche en vertical et met la partie en pause.
 */
async function screenScenario(page, url, platform) {
  const rotate = (landscape) =>
    page.send('Emulation.setDeviceMetricsOverride', {
      width: landscape ? Math.max(platform.width, platform.height) : Math.min(platform.width, platform.height),
      height: landscape ? Math.min(platform.width, platform.height) : Math.max(platform.width, platform.height),
      deviceScaleFactor: platform.dpr,
      mobile: true,
      screenOrientation: landscape ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 },
    });
  await page.send('Emulation.setUserAgentOverride', { userAgent: platform.ua, platform: platform.platform });
  await rotate(true);
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const shim = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: platformShims(platform) });
  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('la page de jeu', `!!document.querySelector('#btn-start')`);
  await page.eval('localStorage.clear()');
  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('le chargement des modèles', `!!window.__game && document.querySelector('#btn-start') && !document.querySelector('#btn-start').disabled`);
  await sleep(500);
  const rotateShown = () => page.visible('#overlay-rotate');
  const state = async () => (await page.game()).state;

  // À l'horizontal : jamais d'invitation, le bouton de plein écran est dans le menu.
  check(!(await rotateShown()), 'à l’horizontal, aucune invitation à tourner le téléphone');
  await checkPerfCounter(page, platform.name, true);
  await checkReachable(page, 'le bouton plein écran est atteignable au doigt dans le menu', ['#btn-fullscreen']);

  // Installation comme application : le navigateur doit pouvoir la proposer (manifeste, icônes, service worker).
  const installable = await page.eval(`(async () => {
    const manifest = await (await fetch('./manifest.webmanifest')).json();
    const missing = [];
    for (const icon of manifest.icons) {
      const response = await fetch(new URL(icon.src, document.baseURI));
      if (!response.ok || !(response.headers.get('content-type') ?? '').startsWith('image/')) missing.push(icon.src);
    }
    const registration = await navigator.serviceWorker.getRegistration();
    return { missing, registered: !!registration };
  })()`);
  check(installable.missing.length === 0, `toutes les icônes du manifeste sont servies${installable.missing.length ? ' (manquantes : ' + installable.missing.join(', ') + ')' : ''}`);
  check(installable.registered, 'le service worker est enregistré (condition pour « Installer l’application » sur Android)');
  await page.waitFor('le service worker actif', `(async () => !!(await navigator.serviceWorker.getRegistration())?.active)()`, 5000);

  if (platform.ios) {
    // iPhone : pas de fenêtre d'installation possible, le bouton du menu explique le chemin.
    check(await page.visible('#btn-install'), 'iPhone : le bouton « Installer l’application » est dans le menu');
    await page.tapElement('#btn-install');
    const installHint = await page.eval(`document.querySelector('#fullscreen-hint').textContent`);
    check(installHint.includes('installer'), `iPhone : le bouton explique comment installer le jeu (texte : « ${installHint} »)`);
    await page.screenshot(`${platform.name}-aide-installation-appli`);
    await page.tapElement('#btn-fullscreen');
    check(await page.visible('#fullscreen-hint'), 'iPhone : le bouton explique comment jouer en plein écran');
    check((await page.eval(`document.querySelector('#fullscreen-hint').textContent`)).includes('écran d’accueil'), 'l’explication parle de l’écran d’accueil');
    check((await page.eval('window.__fs.locks.length')) === 0, 'iPhone : le jeu ne tente pas de verrouiller l’orientation');
    await page.screenshot(`${platform.name}-ecran-aide-installation`);

    // Une partie en cours, puis le téléphone passe à la verticale : l'invitation s'affiche et la partie se met en pause.
    await page.tapElement('#btn-start');
    await page.waitFor('la partie', 'window.__game.state().state === "playing"', 5000);
    await rotate(false);
    await page.waitFor('l’invitation à tourner', `!document.querySelector('#overlay-rotate').classList.contains('hidden')`, 3000);
    check((await state()) === 'paused', 'la partie se met en pause quand le téléphone passe à la verticale');
    check(!(await page.visible('#btn-rotate-fullscreen')), 'iPhone : pas de bouton « Plein écran » dans l’invitation (impossible sur iPhone)');
    await page.screenshot(`${platform.name}-tournez-le-telephone`);
    await rotate(true);
    await page.waitFor('la fermeture de l’invitation', `document.querySelector('#overlay-rotate').classList.contains('hidden')`, 3000);
    check((await state()) === 'paused', 'tourner le téléphone ne relance pas la partie toute seule');
    await page.tapElement('#btn-resume');
    check((await state()) === 'playing', 'on reprend la partie à la main');

    // « Jouer quand même à la verticale » (rotation verrouillée dans iOS) : l'invitation ne revient plus.
    await rotate(false);
    await page.waitFor('l’invitation à tourner', `!document.querySelector('#overlay-rotate').classList.contains('hidden')`, 3000);
    await page.tapElement('#btn-rotate-skip');
    check(!(await rotateShown()), 'refuser l’invitation la ferme');
    await rotate(true);
    await rotate(false);
    await sleep(300);
    check(!(await rotateShown()), 'l’invitation refusée ne revient pas à la rotation suivante');
  } else {
    // Android : le bouton d'installation n'apparaît que quand Chrome juge le jeu installable (événement beforeinstallprompt).
    check(!(await page.visible('#btn-install')), 'Android : pas de bouton d’installation tant que Chrome ne propose rien');
    await page.eval(`(() => {
      window.__install = { prompted: 0 };
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = async () => { window.__install.prompted++; };
      event.userChoice = Promise.resolve({ outcome: 'accepted' });
      event.__fake = true;
      window.__installEvent = event;
      window.dispatchEvent(event);
    })()`);
    check(await page.eval('window.__installEvent.defaultPrevented'), 'la bannière automatique de Chrome est retenue pour être montrée au bon moment');
    check(await page.visible('#btn-install'), 'Android : le bouton « Installer l’application » apparaît dans le menu');
    await checkReachable(page, 'le bouton d’installation est atteignable au doigt', ['#btn-install']);
    await page.screenshot(`${platform.name}-bouton-installer`);
    await page.tapElement('#btn-install');
    check((await page.eval('window.__install.prompted')) === 1, 'toucher le bouton ouvre la fenêtre d’installation de Chrome');
    check(!(await page.visible('#btn-install')), 'le bouton disparaît une fois la proposition utilisée');
    await page.eval(`window.dispatchEvent(new Event('appinstalled'))`);

    // Le bouton du menu entre en plein écran et verrouille l'horizontal.
    check((await page.eval(`document.querySelector('#btn-fullscreen').getAttribute('aria-pressed')`)) === 'false', 'le bouton plein écran n’est pas enfoncé au départ');
    await page.tapElement('#btn-fullscreen');
    await page.waitFor('le plein écran', `!!document.fullscreenElement`, 3000);
    check((await page.eval('JSON.stringify(window.__fs.locks)')) === '["landscape"]', 'le plein écran verrouille l’horizontal');
    check((await page.eval(`document.querySelector('#btn-fullscreen').getAttribute('aria-pressed')`)) === 'true', 'le bouton plein écran est enfoncé en plein écran');

    // Le bouton du menu pause fait de même, et rend la main en sortant.
    await page.tapElement('#btn-start');
    await page.waitFor('la partie', 'window.__game.state().state === "playing"', 5000);
    await page.tapElement('#btn-pause');
    check((await page.eval(`document.querySelector('#btn-fullscreen-pause').textContent`)).includes('oui'), 'le menu pause indique « Plein écran : oui »');
    await page.screenshot(`${platform.name}-pause-plein-ecran`);
    await page.tapElement('#btn-fullscreen-pause');
    await page.waitFor('la sortie du plein écran', `!document.fullscreenElement`, 3000);
    check((await page.eval('window.__fs.unlocks')) >= 1, 'en sortant du plein écran, l’orientation est libérée');
    check((await page.eval(`document.querySelector('#btn-fullscreen-pause').textContent`)).includes('non'), 'le menu pause indique « Plein écran : non »');

    // À la verticale sur Android, hors plein écran : l'invitation s'affiche, avec un bouton « Plein écran » qui verrouille
    // l'horizontal (l'appareil tourne alors tout seul, même si la rotation automatique est coupée).
    await rotate(false);
    await page.waitFor('l’invitation à tourner', `!document.querySelector('#overlay-rotate').classList.contains('hidden')`, 3000);
    check(await rotateShown(), 'Android à la verticale : l’invitation à tourner s’affiche');
    check(await page.visible('#btn-rotate-fullscreen'), 'Android : l’invitation propose « Plein écran »');
    await page.screenshot(`${platform.name}-tournez-android`);
    const locksBefore = await page.eval('window.__fs.locks.length');
    await page.tapElement('#btn-rotate-fullscreen');
    await page.waitFor('le plein écran', `!!document.fullscreenElement`, 3000);
    check((await page.eval('window.__fs.locks.length')) === locksBefore + 1, 'le bouton « Plein écran » de l’invitation verrouille l’horizontal');
    // L'appareil tourne : l'invitation disparaît toute seule.
    await rotate(true);
    await page.waitFor('la fermeture de l’invitation', `document.querySelector('#overlay-rotate').classList.contains('hidden')`, 3000);
    check(!(await rotateShown()), 'une fois l’appareil à l’horizontale, l’invitation disparaît');
  }
  check(page.problems.length === 0, `aucune erreur ni avertissement dans la console${page.problems.length ? ' :\n' + page.problems.join('\n') : ''}`);
  await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: shim.identifier });
}

/** Tablette : invitation à tourner à la verticale (bouton « Plein écran » seulement si le verrouillage existe), jamais à l'horizontale. */
async function tabletScenario(page, url, tablet) {
  const metrics = (landscape) =>
    page.send('Emulation.setDeviceMetricsOverride', {
      width: landscape ? tablet.height : tablet.width,
      height: landscape ? tablet.width : tablet.height,
      deviceScaleFactor: tablet.dpr,
      mobile: true,
      screenOrientation: landscape ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 },
    });
  await page.send('Emulation.setUserAgentOverride', { userAgent: tablet.ua, platform: tablet.platform });
  await metrics(false);
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const shim = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: platformShims(tablet) });
  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('la page de jeu', `!!document.querySelector('#btn-start')`);
  await page.eval('localStorage.clear()');
  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('le chargement des modèles', `!!window.__game && document.querySelector('#btn-start') && !document.querySelector('#btn-start').disabled`);
  await sleep(500);

  check(await page.visible('#overlay-rotate'), `${tablet.name} en vertical : l’invitation à tourner s’affiche`);
  check((await page.visible('#btn-rotate-fullscreen')) === tablet.canLock, `${tablet.name} : le bouton « Plein écran » de l’invitation ${tablet.canLock ? 'est proposé (le verrouillage existe)' : 'est absent (pas de verrouillage possible)'}`);
  await page.screenshot(`${tablet.name}-tournez-la-tablette`);

  const closed = `document.querySelector('#overlay-rotate').classList.contains('hidden')`;
  if (tablet.canLock) {
    await page.tapElement('#btn-rotate-fullscreen');
    await page.waitFor('le plein écran', `!!document.fullscreenElement`, 3000);
    check((await page.eval('window.__fs.locks.length')) === 1, `${tablet.name} : « Plein écran » verrouille l’horizontal`);
    await metrics(true);
    await page.waitFor('la fermeture de l’invitation', closed, 3000);
  } else {
    // Rotation manuelle : à l'horizontale l'invitation disparaît ; revenue à la verticale, elle revient (rien n'a été refusé).
    await metrics(true);
    await page.waitFor('la fermeture de l’invitation', closed, 3000);
    check(!(await page.visible('#overlay-rotate')), `${tablet.name} à l’horizontale : pas d’invitation`);
    await metrics(false);
    await page.waitFor('le retour de l’invitation', `!${closed}`, 3000);
    // « Jouer quand même » : elle ne revient plus.
    await dismissRotateInvitation(page, tablet.name);
    await metrics(true);
    await metrics(false);
    await sleep(300);
    check(!(await page.visible('#overlay-rotate')), `${tablet.name} : l’invitation refusée ne revient pas`);
  }
  check(page.problems.length === 0, `aucune erreur ni avertissement dans la console${page.problems.length ? ' :\n' + page.problems.join('\n') : ''}`);
  await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: shim.identifier });
}

/** Téléphones tenus à l'horizontale, du plus petit au plus grand : l'écran du menu doit y tenir sans défiler. */
const FIT_SIZES = [
  { name: 'iphone-se-paysage', width: 568, height: 320 },
  { name: 'petit-paysage', width: 640, height: 360 },
  { name: 'android-paysage', width: 740, height: 360 },
  { name: 'iphone-paysage', width: 667, height: 375 },
  { name: 'tel-paysage', width: 844, height: 390 },
  { name: 'pixel-paysage', width: 915, height: 412 },
];

/** Hauteur de contenu et hauteur visible d'un écran : si la première dépasse la seconde, une barre de défilement apparaît. */
function scrollOf(page, selector) {
  return page.eval(`(() => {
    const o = document.querySelector(${JSON.stringify(selector)});
    const h = (s) => { const e = o.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : 0; };
    return { content: o.scrollHeight, visible: o.clientHeight, hasBar: o.scrollHeight > o.clientHeight + 1, parts: { logo: h('.logo'), info: h('.menu-info'), weapons: h('#weapons'), desc: h('#weapon-desc'), diff: h('#difficulty'), actions: h('.main-actions'), foot: h('.menu-foot') } };
  })()`);
}

/**
 * Téléphone à l'horizontale : le menu principal tient dans l'écran sans barre de défilement, même dans le pire cas
 * (cinq armes, lien d'installation affiché), ainsi que l'onglet Coffres de la boutique, l'onglet Héros de la collection
 * (avec un héros à acheter regardé), la pause, le choix de niveau et la fin de partie.
 */
/** Écran des héros : jamais plus de trois cartes par rangée, quelle que soit la taille de l'écran (décision de l'utilisateur : cadres lisibles). */
async function checkHeroColumns(page, label) {
  const columns = await page.eval(`(() => {
    const cards = [...document.querySelectorAll('#characters .char-card')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    const top = cards[0].top;
    return { count: cards.length, perRow: cards.filter((r) => Math.abs(r.top - top) < 4).length };
  })()`);
  check(columns.count > 3 && columns.perRow === 3, `${label} : les héros tiennent à 3 par ligne (${columns.perRow} sur la première ligne, ${columns.count} cartes)`);
}

async function fitScenario(page, url, size) {
  const shot = (name) => page.screenshot(`tient-${size.name}-${name}`);
  await setDevice(page, size.width, size.height);
  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('la page de jeu', `!!document.querySelector('#btn-start')`);
  await page.eval('localStorage.clear()');
  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('le chargement des modèles', `!!window.__game && document.querySelector('#btn-start') && !document.querySelector('#btn-start').disabled`);
  await sleep(500);
  const report = (label, m) => `${label} : tout tient sans défiler (contenu ${m.content} px pour ${m.visible} px visibles ; logo ${m.parts.logo}, pastilles ${m.parts.info}, armes ${m.parts.weapons}, texte ${m.parts.desc}, difficultés ${m.parts.diff}, boutons ${m.parts.actions}, pied ${m.parts.foot})`;

  // Pire cas : le lien d'installation s'affiche (Chrome vient de juger le jeu installable).
  await page.eval(`(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = async () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); })()`);
  await page.eval('document.querySelector("#overlay-start").scrollTo(0, 0)');
  const four = await scrollOf(page, '#overlay-start');
  check(!four.hasBar, report('menu à quatre armes', four));
  await shot('1-menu');

  // Annonce de boss : petite à l'horizontale (elle prenait trop de place), mais lisible. Mesurée une fois son animation d'arrivée finie.
  await page.eval(`window.__game.banner('⚠ Boss ×4 !')`);
  await sleep(900);
  const banner = await page.eval(`(() => { const b = document.querySelector('#banner'); const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, font: parseFloat(getComputedStyle(b).fontSize), w: innerWidth, h: innerHeight }; })()`);
  check(banner.height <= banner.h * 0.14, `annonce de boss : elle prend peu de hauteur (${Math.round(banner.height)} px sur ${banner.h} px, ${Math.round((banner.height / banner.h) * 100)} %)`);
  check(banner.font >= 17, `annonce de boss : le texte reste lisible (${Math.round(banner.font)} px)`);
  check(banner.left >= 0 && banner.right <= banner.w && banner.top >= 0, 'annonce de boss : elle tient dans l’écran');
  await shot('1-annonce-boss');
  await sleep(1800);

  // Politique de confidentialité, dans le jeu (pas une page à part, qui sortirait du jeu dans l'application installée) : sur le plus
  // petit écran, le texte garde de la place et le bouton Retour reste atteignable.
  await page.click('#btn-credits');
  await page.click('#btn-privacy');
  await page.waitFor('la politique de confidentialité', `(document.querySelector('#privacy-frame').contentDocument?.title ?? '').includes('confidentialité')`, 5000);
  const frameHeight = await page.eval(`Math.round(document.querySelector('#privacy-frame').getBoundingClientRect().height)`);
  check(frameHeight >= 150, `politique de confidentialité : le texte garde de la place à l’écran (${frameHeight} px de haut)`);
  check((await page.reachable('#btn-privacy-back')) === 'ok', 'politique de confidentialité : le bouton Retour est atteignable au doigt');
  await shot('0-confidentialite');
  await page.click('#btn-privacy-back');
  check(!(await page.visible('#overlay-privacy')) && (await page.visible('#overlay-credits')), 'fermer la politique de confidentialité ramène aux crédits');
  check((await page.reachable('#btn-credits-back')) === 'ok', 'crédits : le bouton Retour est atteignable au doigt');
  await page.click('#btn-credits-back');
  await page.click('#version');
  check((await page.reachable('#btn-changelog-back')) === 'ok', 'nouveautés : le bouton Retour est atteignable au doigt (liste qui défile)');
  await page.click('#btn-changelog-back');

  // Boutique, onglet Coffres : le tableau des coffres tient sans défiler.
  await page.click('#btn-shop');
  await page.click('#tab-chests');
  await sleep(500);
  const chests = await scrollOf(page, '#overlay-shop');
  check(!chests.hasBar, `boutique, onglet Coffres : tout tient sans défiler (contenu ${chests.content} px pour ${chests.visible} px visibles)`);
  const tabsTopOf = (overlay) => page.eval(`(() => { const r = document.querySelector('${overlay} .tabs').getBoundingClientRect(); const t = document.querySelector('${overlay} > h2').getBoundingClientRect(); return [Math.round(t.top), Math.round(r.top)]; })()`);
  const shopChestsTabs = await tabsTopOf('#overlay-shop');
  await shot('5-boutique-coffres');
  // Le message sous les offres (« Pas assez de pièces. », affiché si l'ouverture échoue) ajoute une ligne : il ne doit pas faire défiler.
  await page.eval(`(() => { const status = document.querySelector('#chest-status'); status.textContent = 'Pas assez de pièces.'; status.classList.add('error'); })()`);
  await sleep(300);
  const chestsMessage = await scrollOf(page, '#overlay-shop');
  check(!chestsMessage.hasBar, `boutique, onglet Coffres avec un message : tout tient sans défiler (contenu ${chestsMessage.content} px pour ${chestsMessage.visible} px visibles)`);
  await shot('5b-boutique-coffres-message');
  await page.eval(`(() => { const status = document.querySelector('#chest-status'); status.textContent = ''; status.classList.remove('error'); })()`);
  await page.click('#btn-shop-back');
  await sleep(200);

  // Collection, onglet Héros, avec un héros à acheter regardé (le bouton « Acheter » est affiché : le pire cas).
  await page.click('#btn-collection');
  await sleep(400);
  await page.click('.char-card.locked');
  await sleep(500);
  const heroes = await scrollOf(page, '#overlay-collection');
  check(!heroes.hasBar, `collection, onglet Héros : tout tient sans défiler (contenu ${heroes.content} px pour ${heroes.visible} px visibles)`);
  const edge = await page.eval(`(() => {
    const parts = [...document.querySelectorAll('#overlay-collection > h2, #overlay-collection .tabs, #overlay-collection #hero-desc, #overlay-collection #btn-buy-hero:not(.hidden), #overlay-collection #characters .char-card, #overlay-collection > .btn')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    return { limit: innerWidth * 0.52, left: Math.min(...parts.map((r) => r.left)) };
  })()`);
  check(edge.left >= edge.limit - 0.5, `collection, onglet Héros : le texte et les cadres commencent après le dégradé (à ${Math.round(edge.left)} px, dégradé fini à ${Math.round(edge.limit)} px)`);
  await checkHeroColumns(page, 'collection, onglet Héros');
  // Les pièces (on y achète des héros) : visibles, dans l'écran, sans cacher le titre, les onglets ni les cartes.
  const gold = await page.eval(`(() => {
    const box = (e) => e.getBoundingClientRect();
    const pill = box(document.querySelector('#collection-gold'));
    const others = [...document.querySelectorAll('#overlay-collection > h2, #overlay-collection .tabs, #overlay-collection #hero-desc, #overlay-collection #btn-buy-hero:not(.hidden), #overlay-collection #characters .char-card, #overlay-collection > .btn')].map(box).filter((r) => r.width > 0);
    const overlap = others.some((r) => pill.left < r.right - 1 && pill.right > r.left + 1 && pill.top < r.bottom - 1 && pill.bottom > r.top + 1);
    return { shown: pill.width > 0, inside: pill.left >= 0 && pill.right <= innerWidth && pill.top >= 0 && pill.bottom <= innerHeight, overlap, text: document.querySelector('#collection-gold').textContent, menu: document.querySelector('#menu-gold').textContent };
  })()`);
  check(gold.shown && gold.inside && !gold.overlap, 'collection, onglet Héros : les pièces sont affichées, dans l’écran, sans rien cacher');
  check(gold.text === gold.menu, 'collection : le nombre de pièces est celui du menu');
  const heroesTabs = await tabsTopOf('#overlay-collection');
  await shot('6-collection-heros');
  await page.click('#btn-collection-back');
  await sleep(200);

  // Les listes, dans leur pire cas : tout débloqué, amulettes en réserve.
  await page.eval('window.__game.unlockAll(); window.__game.giveAmulets(3)');
  await sleep(300);
  const listAt = async (label, open, panel, mustFit = true) => {
    for (const action of open) await page.click(action);
    await sleep(500);
    const m = await scrollOf(page, panel);
    if (mustFit) check(!m.hasBar, `${label} : tout tient sans défiler (contenu ${m.content} px pour ${m.visible} px visibles)`);
  };
  await listAt('boutique, onglet Améliorations', ['#btn-shop', '#tab-upgrades'], '#overlay-shop');
  const shopUpgradesTabs = await tabsTopOf('#overlay-shop');
  check(shopUpgradesTabs.join() === shopChestsTabs.join(), `boutique : le titre et les onglets ne bougent pas d'un onglet à l'autre (Coffres ${shopChestsTabs.join(' / ')} px, Améliorations ${shopUpgradesTabs.join(' / ')} px)`);
  await shot('7-boutique-ameliorations');
  await page.click('#btn-shop-back');
  await listAt('collection, onglet Apparences', ['#btn-collection', '#tab-styles'], '#overlay-collection');
  const stylesTabs = await tabsTopOf('#overlay-collection');
  check(stylesTabs.join() === heroesTabs.join(), `collection : le titre et les onglets ne bougent pas d'un onglet à l'autre (Héros ${heroesTabs.join(' / ')} px, Apparences ${stylesTabs.join(' / ')} px)`);
  await shot('8-apparences');
  // Six types d'amulettes en réserve (le pire cas) : ils tiennent dès 360 px de haut ; sur 320 px (iPhone SE ancien), la liste défile un peu.
  await listAt('collection, onglet Amulettes (six types en réserve)', ['#tab-amulets'], '#overlay-collection', size.height >= 360);
  // Une amulette équipée : sa rangée (avec − / + / Retirer) remplace la ligne « Aucune » en haut. Le titre et la rangée sont sur
  // une même ligne pour que l'écran ne grandisse pas : il tient dès 360 px de haut, comme avant d'équiper.
  await listAt('collection, onglet Amulettes (une équipée, cinq en réserve)', ['#amulets-body .amulet-toggle'], '#overlay-collection', size.height >= 360);
  const amuletsTabs = await tabsTopOf('#overlay-collection');
  check(amuletsTabs.join() === heroesTabs.join(), `collection : le titre et les onglets ne bougent pas non plus sur l'onglet Amulettes (${amuletsTabs.join(' / ')} px)`);
  await shot('9-amulettes');
  await page.click('#btn-collection-back');
  // Amulette équipée : sa pastille est au menu (icône et niveau), dans l'écran, sans recouvrir une autre pastille, et le menu tient
  // toujours sans défiler ; la toucher ouvre la collection sur les amulettes.
  await sleep(300);
  const wornMenu = await scrollOf(page, '#overlay-start');
  check(!wornMenu.hasBar, report('menu avec une amulette équipée', wornMenu));
  const pill = await page.eval(`(() => {
    const r = (e) => e.getBoundingClientRect();
    const p = document.querySelector('#btn-amulet');
    const box = r(p);
    const others = [...document.querySelectorAll('.menu-info .pill')].filter((e) => e !== p && !e.classList.contains('hidden')).map(r);
    return { shown: box.width > 0, inside: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight, text: p.textContent, overlap: others.some((o) => box.left < o.right - 1 && box.right > o.left + 1 && box.top < o.bottom - 1 && box.bottom > o.top + 1), svg: !!p.querySelector('svg, img') };
  })()`);
  check(pill.shown && pill.inside && !pill.overlap, `menu : la pastille de l'amulette équipée est visible, dans l'écran, sans recouvrir une autre (${pill.text})`);
  check(/×\d/.test(pill.text) && pill.svg, 'la pastille montre l’icône et le niveau de l’amulette');
  check((await page.reachable('#btn-amulet')) === 'ok', 'menu : la pastille de l’amulette est atteignable au doigt');
  await page.click('#btn-amulet');
  check((await page.visible('#overlay-collection')) && (await page.visible('#panel-amulets')), 'toucher la pastille ouvre la collection sur les amulettes');
  await page.click('#btn-collection-back');
  await listAt('sauvegarde', ['#btn-save'], '#overlay-save');
  await shot('10-sauvegarde');
  await page.click('#btn-import');
  await sleep(300);
  const saveMessage = await scrollOf(page, '#overlay-save');
  check(!saveMessage.hasBar, `sauvegarde avec un message de statut : tout tient sans défiler (contenu ${saveMessage.content} px pour ${saveMessage.visible} px visibles)`);
  await shot('10b-sauvegarde-message');
  await page.click('#btn-save-back');
  await sleep(200);

  // Cinq armes (l'arme secrète trouvée) : la rangée doit toujours tenir sur une ligne et dans l'écran.
  await page.eval('window.__game.unlockAll()');
  await sleep(300);
  const five = await scrollOf(page, '#overlay-start');
  check(!five.hasBar, report('menu à cinq armes', five));
  await shot('2-menu-5-armes');
  await checkWeaponAlignment(page, `${size.name} : menu à cinq armes`);

  // En partie : pause, choix de niveau et fin de partie.
  await page.click('#btn-start');
  await page.waitFor('la partie', 'window.__game.state().state === "playing"', 5000);
  await page.click('#btn-pause');
  await sleep(300);
  const pause = await scrollOf(page, '#overlay-pause');
  check(!pause.hasBar, `pause : tout tient sans défiler (contenu ${pause.content} px pour ${pause.visible} px visibles)`);
  await shot('3-pause');
  await page.click('#btn-resume');
  await page.eval('window.__game.levelUp()');
  await page.waitFor('les cartes de niveau', `!document.querySelector('#overlay-levelup').classList.contains('hidden')`, 5000);
  await sleep(900);
  const levelUp = await scrollOf(page, '#overlay-levelup');
  check(!levelUp.hasBar, `choix de niveau : tout tient sans défiler (contenu ${levelUp.content} px pour ${levelUp.visible} px visibles)`);
  await shot('4-niveau');
  await page.click('#cards .card');
  await page.eval('window.__game.kill()');
  const over = `!document.querySelector('#overlay-gameover').classList.contains('hidden')`;
  const deadline = Date.now() + 15000;
  while (!(await page.eval(over)) && Date.now() < deadline) {
    await page.click('#overlay-levelup:not(.hidden) .card');
    await sleep(150);
  }
  await sleep(1500);
  const gameOver = await scrollOf(page, '#overlay-gameover');
  check(!gameOver.hasBar, `fin de partie : tout tient sans défiler (contenu ${gameOver.content} px pour ${gameOver.visible} px visibles)`);
  await shot('5-fin');
}

/** Les cadres (cartes, boutons, pastilles, barres...) dont le texte ne doit jamais dépasser. */
const TEXT_FRAMES = '.odds, .info-btn, .credit, .menu-foot, .weapon-card, .diff-btn, .char-card, .side-btn, .btn, .tab, .pill, .shop-row, .swatch, .amulet-row, .card, .reveal-mini, .reveal-card, .bar, .collection-section, .save-box, #banner, .boss-bar, .stats, .changelog-item';

/** Liste les textes qui sortent de leur cadre (liste vide : tout tient). */
function textOverflows(page) {
  return page.eval(`(() => {
    const bad = [];
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      // Le contenu d'un bloc replié (<details> fermé, hors de son titre) n'est pas affiché.
      const folded = el.closest('details') && !el.closest('details').open && !el.closest('summary');
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('.hidden') && !folded;
    };
    const name = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).trim().split(/\\s+/).join('.'));
    for (const frame of document.querySelectorAll(${JSON.stringify(TEXT_FRAMES)})) {
      if (!visible(frame)) continue;
      const fr = frame.getBoundingClientRect();
      const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent.trim();
        if (!text || !node.parentElement || !visible(node.parentElement)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (r.width < 1) continue;
          // L'étiquette de rareté est un ruban posé à cheval sur le haut de la carte : il dépasse volontairement vers le haut.
          const ribbon = node.parentElement.closest('.reveal-tier-label') ? 16 : 1;
          // Hors du cadre, ou hors de l'écran (un cadre trop large coupé par les bords).
          const offscreen = r.left < -1 || r.right > innerWidth + 1;
          if (offscreen || r.left < fr.left - 1 || r.right > fr.right + 1 || r.top < fr.top - ribbon || r.bottom > fr.bottom + 1) {
            bad.push(name(frame) + ' : « ' + text.slice(0, 36) + ' » dépasse du cadre ou de l’écran (texte ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',') + ', cadre ' + [fr.left, fr.top, fr.right, fr.bottom].map(Math.round).join(',') + ')');
            break;
          }
        }
      }
    }
    return bad;
  })()`);
}

/** Pour chaque paire [icône, texte], l'icône ne doit pas recouvrir le texte. */
function overlapsBetween(page, pairs) {
  return page.eval(`${JSON.stringify(pairs)}.flatMap(([iconSel, textSel]) => {
    const out = [];
    for (const icon of document.querySelectorAll(iconSel)) {
      const ir = icon.getBoundingClientRect();
      if (ir.width === 0 || icon.closest('.hidden')) continue;
      const scope = icon.closest('.weapon-card, #hp-bar, .char-card') ?? document;
      for (const target of scope.querySelectorAll(textSel)) {
        const range = document.createRange();
        range.selectNodeContents(target);
        for (const r of range.getClientRects()) {
          if (r.width < 1) continue;
          if (r.left < ir.right - 1 && ir.left < r.right - 1 && r.top < ir.bottom - 1 && ir.top < r.bottom - 1) out.push(iconSel + ' recouvre ' + textSel + ' (' + (target.textContent || '').trim().slice(0, 24) + ')');
        }
      }
    }
    return out;
  })`);
}

/** Dans les cases d'armes d'une même ligne, icônes, noms et « Choisir » doivent être à la même hauteur. */
async function checkWeaponAlignment(page, label) {
  const problems = await page.eval(`(() => {
    const cards = [...document.querySelectorAll('.weapon-card')].filter((c) => c.getBoundingClientRect().width > 0);
    const rows = new Map();
    for (const card of cards) {
      const key = Math.round(card.getBoundingClientRect().top);
      rows.set(key, [...(rows.get(key) ?? []), card]);
    }
    const out = [];
    // Toutes les armes tiennent sur une seule ligne, dans la zone prévue, et la remplissent (au plus 120 px par tuile).
    if (rows.size > 1) out.push('les armes sont sur ' + rows.size + ' lignes');
    const box = document.querySelector('#weapons').getBoundingClientRect();
    const rects = cards.map((c) => c.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    if (left < box.left - 1 || right > box.right + 1) out.push('des armes dépassent de leur zone : ' + Math.round(left) + '-' + Math.round(right) + ' pour ' + Math.round(box.left) + '-' + Math.round(box.right));
    const expected = Math.min(box.width, cards.length * 120 + (cards.length - 1) * 8);
    if (right - left < expected - 2) out.push('les armes laissent de la place inutilisée : ' + Math.round(right - left) + ' px sur ' + Math.round(expected));
    for (const [, row] of rows) {
      for (const part of ['.weapon-icon', '.char-name', '.char-status']) {
        const tops = row.map((c) => c.querySelector(part).getBoundingClientRect().top);
        if (Math.max(...tops) - Math.min(...tops) > 1) out.push(part + ' à des hauteurs différentes : ' + tops.map(Math.round).join(', '));
      }
    }
    return out;
  })()`);
  check(problems.length === 0, `${label} : icônes, noms et statuts des armes sont alignés${problems.length ? ' :\n    ' + problems.join('\n    ') : ''}`);
}

/** Les quatre difficultés ont la même mise en page : icône + nom sur une ligne, multiplicateur d'or sur la suivante. */
async function checkDifficultyAlignment(page, label) {
  const problems = await page.eval(`(() => {
    const buttons = [...document.querySelectorAll('.diff-btn')];
    const out = [];
    for (const part of ['.diff-name', '.diff-gold']) {
      const rects = buttons.map((b) => b.querySelector(part).getBoundingClientRect());
      const tops = rects.map((r) => r.top);
      if (Math.max(...tops) - Math.min(...tops) > 1) out.push(part + ' à des hauteurs différentes : ' + tops.map(Math.round).join(', '));
      const heights = rects.map((r) => r.height);
      if (Math.max(...heights) - Math.min(...heights) > 1) out.push(part + ' de hauteurs différentes : ' + heights.map(Math.round).join(', '));
    }
    // Une seule ligne de texte pour le nom : sa hauteur ne dépasse pas celle de l'icône (1,15 em) augmentée de l'interligne.
    for (const b of buttons) {
      const name = b.querySelector('.diff-name');
      if (name.getBoundingClientRect().height > parseFloat(getComputedStyle(name).fontSize) * 1.9) out.push(b.dataset.id + ' : nom sur plusieurs lignes');
    }
    return out;
  })()`);
  check(problems.length === 0, `${label} : les difficultés sont alignées (nom sur une ligne, or sur l'autre)${problems.length ? ' :\n    ' + problems.join('\n    ') : ''}`);
}

async function checkTexts(page, label, pairs = []) {
  const overflow = await textOverflows(page);
  const overlaps = pairs.length ? await overlapsBetween(page, pairs) : [];
  const problems = [...overflow, ...overlaps];
  check(problems.length === 0, `${label} : les textes tiennent dans leurs cadres${problems.length ? ' :\n    ' + problems.join('\n    ') : ''}`);
}

const TEXT_SIZES = [
  { name: 'tres-petit', width: 320, height: 568 },
  { name: 'petit', width: 360, height: 640 },
  { name: 'petit-horizontal', width: 667, height: 375 },
];

/**
 * Sur de petits écrans : les textes des armes, héros, niveaux, boutons, cartes et barres restent dans leurs cadres,
 * même avec de très grands nombres, et le cœur de la barre de vie ne recouvre pas les PV.
 */
async function textScenario(page, url, size) {
  const shot = (name) => page.screenshot(`texte-${size.name}-${name}`);
  await setDevice(page, size.width, size.height);
  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('la page de jeu', `!!document.querySelector('#btn-start')`);
  await page.eval('localStorage.clear()');
  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('le chargement des modèles', `!!window.__game && document.querySelector('#btn-start') && !document.querySelector('#btn-start').disabled`);
  await dismissRotateInvitation(page, 'textes');
  await page.eval('window.__game.addGold(987654); window.__game.unlockAll(); window.__game.giveAmulets(3)');
  await sleep(600);
  const BADGES = [['.legend-badge', '.char-name'], ['.legend-badge', '.char-status'], ['.legend-badge', '.weapon-icon']];

  // --- Menu : cinq armes avec badges, difficultés, boutons ---
  await checkTexts(page, 'menu', BADGES);
  await checkWeaponAlignment(page, 'menu à cinq armes');
  await checkDifficultyAlignment(page, 'menu');
  await shot('1-menu');
  for (const id of ['easy', 'normal', 'hard', 'extreme']) {
    await page.click(`.diff-btn[data-id="${id}"]`);
    await checkTexts(page, `menu en difficulté ${id}`);
    await checkDifficultyAlignment(page, `menu en difficulté ${id}`);
  }
  await page.click('.diff-btn[data-id="normal"]');

  // --- Boutique et collection ---
  await checkTexts(page, 'menu avec le lien des crédits');
  await page.click('#version');
  await checkTexts(page, 'nouveautés');
  await page.click('#btn-changelog-back');
  await page.click('#btn-credits');
  await page.click('#overlay-credits details summary');
  await checkTexts(page, 'crédits et licences');
  await shot('1b-credits');
  await page.click('#btn-credits-back');
  await page.click('#btn-shop');
  await sleep(200);
  await checkTexts(page, 'boutique (améliorations)');
  await page.click('#tab-chests');
  await checkTexts(page, 'boutique (coffres)');
  await page.click('#btn-chest-odds');
  await checkTexts(page, 'boutique (coffres, probabilités affichées)');
  await shot('2-boutique-probabilites');
  await page.click('#btn-chest-odds');
  await shot('2-boutique-coffres');
  await page.click('#btn-shop-back');
  await page.click('#btn-collection');
  await checkTexts(page, 'collection (héros)');
  await checkHeroColumns(page, 'collection (héros)');
  await shot('3-collection-heros');
  await page.click('.char-card[data-id="matt"]');
  await checkTexts(page, 'collection (héros à acheter, bouton Acheter)');
  await page.click('#tab-styles');
  await checkTexts(page, 'collection (apparences)');
  await page.click('#tab-amulets');
  await page.click('.amulet-row .amulet-toggle');
  await page.click('.amulet-row.equipped .amulet-actions button:nth-child(2)');
  await checkTexts(page, 'collection (amulettes)');
  await shot('4-collection-amulettes');
  await page.click('#btn-collection-back');
  await page.click('#btn-save');
  await checkTexts(page, 'sauvegarde');
  await page.click('#btn-save-back');

  // --- Partie avec des chiffres énormes (PV, niveau, ennemis tués, or) ---
  await page.click('#btn-start');
  await page.waitFor('la partie', 'window.__game.state().state === "playing"', 5000);
  await page.eval('window.__game.hudStress()');
  await sleep(500);
  await checkTexts(page, 'jeu avec de grands nombres', [['#hp-bar .bar-icon', '#hp-label']]);
  await shot('5-jeu-grands-nombres');
  const hpText = (await page.text('#hp-label')).trim();
  check(hpText === '9999 / 9999', `la barre de vie affiche les grands nombres (${hpText})`);
  await page.eval('window.__game.levelUp()');
  await page.waitFor('le choix de niveau', `!document.querySelector('#overlay-levelup').classList.contains('hidden')`, 5000);
  await sleep(1000);
  await checkTexts(page, 'choix d’amélioration');
  await shot('6-niveau-superieur');
  await page.click('#overlay-levelup:not(.hidden) .card');
  await page.click('#btn-pause');
  await sleep(300);
  await checkTexts(page, 'pause');
  await page.click('#btn-quit');
  await sleep(1800);
  await checkTexts(page, 'fin de partie');
  await shot('7-fin');
  await page.click('#btn-menu');

  // --- Coffres : arme secrète (long texte), puis trois coffres et leur récapitulatif ---
  await page.click('#btn-shop');
  await page.click('#tab-chests');
  await page.eval('window.__game.chestRandom([0.001, 0.5])');
  await page.click('#btn-chest-1');
  await page.waitFor('la carte du coffre', `!!document.querySelector('#overlay-reveal .reveal-card')`, 6000);
  await sleep(1300);
  await checkTexts(page, 'carte de coffre');
  await shot('8-carte-coffre');
  await page.waitFor('les boutons de fin', `!document.querySelector('#reveal-actions').classList.contains('hidden')`, 4000);
  await checkTexts(page, 'fin de coffre');
  await page.click('#reveal-close');
  await page.eval('window.__game.chestRandom([0.2, 0])');
  await page.click('#btn-chest-3');
  for (let i = 1; i <= 3; i++) {
    await page.waitFor(`la carte ${i} sur 3`, `document.querySelector('#overlay-reveal').dataset.phase === 'card-ready'`, 8000);
    if (i === 1) await checkTexts(page, 'carte d’amulette');
    await page.click('#overlay-reveal');
  }
  await page.waitFor('le récapitulatif', `document.querySelector('#overlay-reveal').dataset.phase === 'end' && document.querySelectorAll('.reveal-mini').length === 3`, 5000);
  await sleep(500);
  await checkTexts(page, 'récapitulatif des coffres');
  await shot('9-recapitulatif');
  await page.click('#reveal-close');
  check(page.problems.length === 0, `aucune erreur ni avertissement dans la console${page.problems.length ? ' :\n' + page.problems.join('\n') : ''}`);
}

async function main() {
  const browserPath = BROWSERS.find((p) => existsSync(p));
  if (!browserPath) throw new Error('Aucun navigateur Chromium trouvé. Indiquez son chemin dans la variable BROWSER_PATH.');

  console.log(`Navigateur : ${browserPath}`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const server = await preview({ preview: { port: 4317 }, logLevel: 'silent' });
  const url = server.resolvedUrls.local[0];
  const browser = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${join(outDir, 'profile')}`,
    '--enable-unsafe-swiftshader',
    // Les bruitages du jeu ne doivent pas sortir des haut-parleurs pendant les tests.
    '--mute-audio',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--no-first-run',
    'about:blank',
  ]);

  let failed = false;
  try {
    let target;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(250);
      try {
        target = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find((t) => t.type === 'page');
      } catch {
        // Le navigateur n'a pas encore ouvert son port de pilotage.
      }
    }
    if (!target) throw new Error('Impossible de piloter le navigateur.');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('Connexion DevTools refusée.'));
    });
    const page = new Page(ws);
    await page.send('Runtime.enable');
    await page.send('Page.enable');

    const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7);
    if (!only || only === 'desktop') {
      for (const viewport of VIEWPORTS) {
        console.log(`\nFormat ${viewport.name} (${viewport.width}×${viewport.height})`);
        page.problems.length = 0;
        await scenario(page, url, viewport);
      }
    }
    if (!only || only === 'orientation') {
      for (const device of DEVICES) {
        console.log(`\nTéléphone ${device.name} (${device.width}×${device.height}), puis pivoté`);
        page.problems.length = 0;
        await orientationScenario(page, url, device);
      }
    }
    if (!only || only === 'fit') {
      for (const size of FIT_SIZES) {
        console.log(`\nÀ l'horizontale, sans défilement : ${size.name} (${size.width}×${size.height})`);
        page.problems.length = 0;
        await fitScenario(page, url, size);
      }
    }
    if (!only || only === 'texts') {
      for (const size of TEXT_SIZES) {
        console.log(`\nTextes sur écran ${size.name} (${size.width}×${size.height})`);
        page.problems.length = 0;
        await textScenario(page, url, size);
      }
    }
    if (!only || only === 'platforms') {
      for (const platform of PLATFORMS) {
        console.log(`\nPlateforme ${platform.name} (${platform.width}×${platform.height}, densité ${platform.dpr})`);
        page.problems.length = 0;
        await platformScenario(page, url, platform);
        console.log('  Plein écran et orientation');
        page.problems.length = 0;
        await screenScenario(page, url, platform);
      }
      for (const tablet of TABLETS) {
        console.log(`\nTablette ${tablet.name} (${tablet.width}×${tablet.height})`);
        page.problems.length = 0;
        await tabletScenario(page, url, tablet);
      }
    }
    ws.close();
    console.log(`\nTous les tests de bout en bout passent. Captures : ${outDir}`);
  } catch (error) {
    failed = true;
    console.error(`\n✗ ${error.message}`);
  } finally {
    browser.kill();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
  process.exit(failed ? 1 : 0);
}

main();
