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
  check((await page.eval(`document.querySelectorAll('.char-card').length`)) === 3, 'trois personnages sont proposés');
  check(goldOf(await page.text('#menu-gold')) === 0, 'une sauvegarde neuve commence à 0 pièce');
  await page.click('.char-card[data-id="bolt"]');
  check((await page.game()).selected === 'pip', 'sans or, un personnage payant reste verrouillé');
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
  await page.click('#btn-shop-back');
  check(!(await page.visible('#overlay-shop')), 'la boutique se ferme');

  // --- Personnages ---
  await page.click('.char-card[data-id="bolt"]');
  check((await page.game()).selected === 'bolt', 'un personnage abordable est acheté et sélectionné');
  check(goldOf(await page.text('#menu-gold')) === 330, 'l’achat du personnage débite son prix');
  await sleep(600);
  await shot('3-personnage');

  // --- Partie ---
  await page.click('#btn-start');
  check((await page.game()).state === 'playing', 'la partie démarre');
  await sleep(300);
  const maxHp = (await page.text('#hp-label')).split('/')[1].trim();
  check(maxHp === '154', `les bonus permanents s’appliquent : 154 PV max attendus (vitalité + personnage), ${maxHp} affichés`);
  let levelUps = 0;
  // Marche en carré pendant au moins 20 s, puis jusqu'à la première montée de niveau (90 s au plus).
  const steps = ['KeyD', 'KeyW', 'KeyA', 'KeyS'];
  const started = Date.now();
  for (let i = 0; ; i++) {
    const elapsed = Date.now() - started;
    if (elapsed > 90000 || (elapsed > 20000 && levelUps >= 1)) break;
    for (let k = 0; k < 4; k++) {
      await page.key(steps[i % steps.length], 450);
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
  await page.eval('window.__game.kill()');
  await page.waitFor('l’écran de fin', `!document.querySelector('#overlay-gameover').classList.contains('hidden')`, 6000);
  const end = await page.game();
  check(end.state === 'gameover', 'la mort du héros termine la partie');
  check(end.gold > 330, `la partie rapporte de l’or (${end.gold - 330} pièces)`);
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

  // --- Retour au menu et persistance ---
  await page.click('#btn-menu');
  check((await page.game()).state === 'menu', 'le bouton Menu ramène au menu');
  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('le rechargement', `!!window.__game && !document.querySelector('#btn-start').disabled`);
  const reloaded = await page.game();
  check(reloaded.gold === quit.gold && reloaded.selected === 'bolt', 'la progression est conservée après rechargement');

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
  check((await page.game()).gold === 0 && (await page.game()).selected === 'pip', 'sans sauvegarde, la progression repart de zéro');

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
  check(imported.gold === quit.gold && imported.selected === 'bolt', 'la confirmation restaure l’or et le personnage');
  await page.click('#btn-save-back');
  check(!(await page.visible('#overlay-save')), 'l’écran de sauvegarde se ferme');
  check(goldOf(await page.text('#menu-gold')) === quit.gold, 'le menu affiche l’or importé');
  await page.click('#btn-shop');
  check((await page.text('.shop-row .shop-level')).trim() === '1 / 10', 'les améliorations de la boutique sont restaurées');
  await page.click('#btn-shop-back');

  await page.send('Page.navigate', { url: `${url}?debug` });
  await page.waitFor('le rechargement', `!!window.__game && !document.querySelector('#btn-start').disabled`);
  const kept = await page.game();
  check(kept.gold === quit.gold && kept.selected === 'bolt', 'la sauvegarde importée est conservée après rechargement');

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

    for (const viewport of VIEWPORTS) {
      console.log(`\nFormat ${viewport.name} (${viewport.width}×${viewport.height})`);
      page.problems.length = 0;
      await scenario(page, url, viewport);
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
