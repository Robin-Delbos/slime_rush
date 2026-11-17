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
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true });
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
      return inside && (hit || !${JSON.stringify(needHit)}) ? 'ok' : 'hors écran ou recouvert (' + [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)].join(',') + ' dans ' + innerWidth + '×' + innerHeight + ', touchable=' + hit + ')';
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
  check((await page.game()).hasModel, 'le héros a un modèle 3D');
  check((await page.eval(`document.querySelectorAll('.char-card').length`)) === 3, 'trois apparences sont proposées');
  check((await page.eval(`document.querySelectorAll('.weapon-card').length`)) === 4, 'quatre armes de départ sont proposées');
  check((await page.eval(`document.querySelectorAll('.diff-btn').length`)) === 4, 'quatre difficultés sont proposées');
  check(await page.eval(`!!document.querySelector('.weapon-card[data-id="rifle"] .weapon-icon svg')`), 'la carabine a une icône dessinée');
  check(await page.eval(`!!document.querySelector('#overlay-start .logo svg')`), 'le menu affiche le logo');
  check(/^v\d+\.\d+\.\d+/.test((await page.text('#version')) ?? ''), `le menu affiche la version du jeu (${await page.text('#version')})`);
  check((await page.game()).weapon === 'rifle' && (await page.game()).difficulty === 'normal', 'carabine et difficulté normale par défaut');
  check(goldOf(await page.text('#menu-gold')) === 0, 'une sauvegarde neuve commence à 0 pièce');
  await page.click('.char-card[data-id="bolt"]');
  check((await page.game()).selected === 'ombre', 'sans or, une apparence payante reste verrouillée');
  await page.click('.weapon-card[data-id="aura"]');
  check((await page.game()).weapon === 'rifle', 'sans or, une arme payante reste verrouillée');
  await sleep(600);
  await shot('1-menu');

  // --- Boutique ---
  await page.click('#btn-shop');
  check(await page.visible('#overlay-shop'), 'la boutique s’ouvre');
  check(await page.eval(`[...document.querySelectorAll('.shop-buy')].every((b) => b.disabled)`), 'sans or, tous les achats sont désactivés');
  await page.eval('window.__game.addGold(500)');
  await page.click('.shop-buy[data-id="vitality"]');
  check(goldOf(await page.text('#shop-gold')) === 480, 'un achat débite son prix');
  check((await page.text('.shop-row .shop-level')).trim() === '1 / 10', 'le niveau de l’amélioration augmente');
  await shot('2-boutique');

  // --- Apparences (dans la boutique) ---
  await page.click('.char-card[data-id="bolt"]');
  check((await page.game()).selected === 'bolt', 'une apparence abordable est achetée et sélectionnée');
  check(goldOf(await page.text('#shop-gold')) === 330, 'l’achat de l’apparence débite son prix');
  await page.click('#btn-shop-back');
  check(!(await page.visible('#overlay-shop')), 'la boutique se ferme');

  // --- Armes et difficulté ---
  await page.eval('window.__game.addGold(500)');
  await page.click('.weapon-card[data-id="aura"]');
  check((await page.game()).weapon === 'aura', 'une arme abordable est achetée et sélectionnée');
  check(goldOf(await page.text('#menu-gold')) === 630, 'l’achat de l’arme débite son prix');
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
  check(end.gold > 630, `la partie rapporte de l’or (${end.gold - 630} pièces)`);
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
  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('le rechargement', `!!window.__game && !document.querySelector('#btn-start').disabled`);
  const reloaded = await page.game();
  check(reloaded.gold === quit.gold && reloaded.selected === 'bolt', 'la progression est conservée après rechargement');
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
  check(imported.gold === quit.gold && imported.selected === 'bolt', 'la confirmation restaure l’or et l’apparence');
  check(imported.weapon === 'aura' && imported.difficulty === 'easy', 'la confirmation restaure l’arme et la difficulté');
  await page.click('#btn-save-back');
  check(!(await page.visible('#overlay-save')), 'l’écran de sauvegarde se ferme');
  check(goldOf(await page.text('#menu-gold')) === quit.gold, 'le menu affiche l’or importé');
  await page.click('#btn-shop');
  check((await page.text('.shop-row .shop-level')).trim() === '1 / 10', 'les améliorations de la boutique sont restaurées');
  await page.click('#btn-shop-back');

  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('le rechargement', `!!window.__game && !document.querySelector('#btn-start').disabled`);
  const kept = await page.game();
  check(kept.gold === quit.gold && kept.selected === 'bolt' && kept.weapon === 'aura', 'la sauvegarde importée est conservée après rechargement');

  // --- Chaque arme à l'écran : rendu sans erreur, arme visible, ennemis touchés ---
  await page.eval('window.__game.addGold(1000)');
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
  // Le badge est propre à la difficulté : il disparaît pour les autres, et revient avec la bonne.
  const otherDifficulty = legendDifficulty === 'hard' ? 'normal' : 'hard';
  await page.click(`.diff-btn[data-id="${otherDifficulty}"]`);
  check((await page.eval(`document.querySelectorAll('.legend-badge').length`)) === 0, 'le badge n’apparaît pas pour une autre difficulté');
  await page.click(`.diff-btn[data-id="${legendDifficulty}"]`);
  check((await page.eval(`document.querySelectorAll('.legend-badge').length`)) === 1, 'le badge revient avec la difficulté d’origine');
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

  // --- Menu ---
  await checkNoOverflow(page, 'menu');
  await checkReachable(page, 'menu : tout est atteignable au doigt', [
    '#overlay-start .logo svg',
    '#btn-sound',
    '#btn-save',
    '.weapon-card[data-id="rifle"]',
    '.weapon-card[data-id="spear"]',
    '.diff-btn[data-id="easy"]',
    '.diff-btn[data-id="extreme"]',
    '#btn-shop',
    '#btn-start',
  ]);
  await page.eval('window.scrollTo(0, 0); document.querySelector("#overlay-start").scrollTo(0, 0)');
  await shot('1-menu');

  // --- Boutique et sauvegarde ---
  await page.tapElement('#btn-shop');
  check(await page.visible('#overlay-shop'), 'la boutique s’ouvre au doigt');
  await checkReachable(page, 'boutique : achats, apparences et retour atteignables', ['.shop-row:first-child .shop-buy', '.shop-row:last-child .shop-buy', '.char-card[data-id="bolt"]', '#btn-shop-back']);
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
  check(await page.reachable('#btn-chests') === 'ok' && await page.reachable('#btn-collection') === 'ok', 'les boutons Coffres et Collection sont atteignables au menu');
  check(await page.eval(`document.querySelector('#btn-chests').classList.contains('ready')`), 'le bouton Coffres s’anime quand on a de quoi ouvrir un coffre');
  await page.eval('document.querySelector("#overlay-start").scrollTo(0, 0)');
  await shot('2a-menu-coffre-pret');
  await page.tapElement('#btn-chests');
  check(await page.visible('#overlay-chests'), 'l’écran des coffres s’ouvre au doigt');
  await checkReachable(page, 'coffres : les deux offres, la collection et le retour sont atteignables', ['#btn-chest-1', '#btn-chest-3', '#btn-open-collection', '#btn-chests-back']);
  // Dés truqués : 0,001 est le tirage de l'arme secrète.
  await page.eval('window.__game.chestRandom([0.001, 0.5])');
  await page.tapElement('#btn-chest-1');
  // L'animation : le coffre tombe et tremble, puis s'ouvre dans la lumière.
  await sleep(900);
  check(await page.eval(`!!document.querySelector('.chest-slot.rumble')`), 'le coffre tremble avant de s’ouvrir');
  await shot('2a1-coffre-tremble');
  await sleep(550);
  await shot('2a2-coffre-ouvert');
  await page.waitFor('le contenu du coffre', `document.querySelectorAll('#chest-stage .reward-card').length === 1`, 5000);
  check((await page.text('#chest-stage')).includes('Mines'), 'le coffre contient l’arme secrète');
  check((await page.game()).savedWeapons.includes('mines') && (await page.game()).gold === 5000, 'l’arme est débloquée et le coffre coûte 1000 pièces');
  await shot('2b-coffre-arme');
  // Trois coffres d'amulettes pour 2500 pièces.
  await page.waitFor('les boutons de coffre actifs', `!document.querySelector('#btn-chest-1').disabled && !document.querySelector('#btn-chest-3').disabled`, 5000);
  await page.eval('window.__game.chestRandom([0.2, 0])');
  await page.tapElement('#btn-chest-3');
  await page.waitFor('les trois coffres', `document.querySelectorAll('#chest-stage .reward-card').length === 3`, 5000);
  check((await page.game()).gold === 2500 && (await page.game()).amulets.sage === 3, 'trois coffres coûtent 2500 pièces et donnent trois amulettes');
  await checkReachable(page, 'coffres : les trois cartes de contenu sont atteignables', ['#chest-stage .chest-slot:nth-child(1) .reward-card', '#chest-stage .chest-slot:nth-child(3) .reward-card']);
  await shot('2c-coffres-amulettes');
  // Une apparence.
  await page.waitFor('les boutons de coffre actifs', `!document.querySelector('#btn-chest-1').disabled && !document.querySelector('#btn-chest-3').disabled`, 5000);
  await page.eval('window.__game.chestRandom([0.5, 0])');
  await page.tapElement('#btn-chest-1');
  await page.waitFor('le coffre d’apparence', `document.querySelectorAll('#chest-stage .reward-card').length === 1`, 5000);
  check((await page.game()).cosmetics.projectile.includes('crimson'), 'une apparence est trouvée');
  // Plus assez de pièces : les offres sont grisées.
  await page.eval('window.__game.addGold(-1400)');
  check((await page.eval(`document.querySelector('#btn-chest-1').disabled && document.querySelector('#btn-chest-3').disabled`)), 'sans assez de pièces, les offres sont grisées');
  await page.tapElement('#btn-open-collection');
  check(await page.visible('#overlay-collection'), 'la collection s’ouvre au doigt');
  await checkReachable(page, 'collection : amulette, apparences et retour atteignables', ['.amulet-row[data-id="sage"] .amulet-toggle', '.swatch[data-category="projectile"][data-id="crimson"]', '.swatch[data-category="dust"][data-id="default"]', '#btn-collection-back']);
  await page.tapElement('.amulet-row[data-id="sage"] .amulet-toggle');
  check((await page.game()).amulet === 'sage', 'l’amulette est équipée');
  await page.tapElement('.amulet-row.equipped .amulet-actions button:nth-child(2)');
  check((await page.text('.amulet-row.equipped .amulet-desc')).includes('Niveau 2'), 'on peut renforcer l’amulette avec un second exemplaire');
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
  await checkReachable(page, 'menu à cinq armes : tout est atteignable au doigt', ['.weapon-card[data-id="mines"]', '.weapon-card[data-id="rifle"]', '#btn-start']);
  await page.eval('document.querySelector("#overlay-start").scrollTo(0, 0)');
  await shot('11-menu-5-armes');
  await page.tapElement('.weapon-card[data-id="mines"]');
  check((await page.game()).weapon === 'mines', 'l’arme secrète se choisit au doigt');
  await page.tapElement('#btn-start');
  await page.waitFor('la partie avec les Mines', 'window.__game.state().state === "playing"', 5000);
  await page.eval('window.__game.spawn(8, 5)');
  await page.waitFor('des ennemis tués par les mines', 'window.__game.state().kills > 0', 20000);
  await shot('12-mines');
  check(JSON.stringify((await page.game()).weapons) === '["mines"]', 'la partie ne contient que les Mines');
  await page.click('#overlay-levelup:not(.hidden) .card');
  await page.tapElement('#btn-pause');
  await page.tapElement('#btn-quit');
  await page.tapElement('#btn-menu');
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

    const onlyOrientation = process.argv.includes('--only=orientation');
    if (!onlyOrientation) {
      for (const viewport of VIEWPORTS) {
        console.log(`\nFormat ${viewport.name} (${viewport.width}×${viewport.height})`);
        page.problems.length = 0;
        await scenario(page, url, viewport);
      }
    }
    for (const device of DEVICES) {
      console.log(`\nTéléphone ${device.name} (${device.width}×${device.height}), puis pivoté`);
      page.problems.length = 0;
      await orientationScenario(page, url, device);
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
