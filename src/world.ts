import * as THREE from 'three';
import { atmosphereFor } from './atmosphere';

/** Tirage pour le décor : volontairement indépendant de l'aléatoire de la simulation. */
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Demi-largeur de la zone jouable (le joueur est borné à ±ARENA). */
export const ARENA = 40;

let gradientMap: THREE.DataTexture | null = null;

/** Matériau cartoon : ombrage en 3 paliers nets au lieu d'un dégradé lisse. */
export function toonMaterial(color: THREE.ColorRepresentation): THREE.MeshToonMaterial {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(new Uint8Array([95, 175, 255]), 3, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ color, gradientMap });
}

export type CameraMode = 'menu' | 'play';

/** Zone de l'écran (en pixels) où le héros doit apparaître en entier : de `top` à `bottom`, centré sur `centerX`. */
export interface PreviewView {
  top: number;
  bottom: number;
  centerX: number;
}

/** Hauteur du héros dans la scène (voir HERO_HEIGHT dans assets.ts). */
const PREVIEW_HERO_HEIGHT = 1.9;

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  readonly renderer: THREE.WebGLRenderer;

  private sun = new THREE.DirectionalLight(0xfff2d6, 2.0);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x7ccf5a, 1.2);
  private sky: THREE.CanvasTexture | null = null;
  private portrait = false;
  private mode: CameraMode = 'menu';
  /** Cadrage d'aperçu du héros (écran des héros de la collection), ou null. */
  private preview: PreviewView | null = null;
  /** Position de la caméra par rapport au joueur, lissée d'un mode à l'autre. */
  private offset = new THREE.Vector3(0, 2.3, 6);
  private targetOffset = new THREE.Vector3();
  private lookY = 1.1;
  /** Intensité du tremblement d'écran, de 0 à 1. */
  private trauma = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.fog = new THREE.Fog(0xffffff, 35, 80);
    this.scene.add(this.hemi);
    this.setAtmosphere('normal');

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -22;
    cam.right = 22;
    cam.top = 22;
    cam.bottom = -22;
    cam.near = 1;
    cam.far = 60;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.buildGround();
    this.buildBorder();
    this.buildDecor();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.follow(0, 0, 1);
  }

  /** Applique l'ambiance (ciel en dégradé, brume, lumières) liée à une difficulté. */
  setAtmosphere(difficultyId: string): void {
    const a = atmosphereFor(difficultyId);
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#' + a.skyTop.toString(16).padStart(6, '0'));
    gradient.addColorStop(1, '#' + a.skyBottom.toString(16).padStart(6, '0'));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.sky?.dispose();
    this.sky = texture;
    this.scene.background = texture;

    (this.scene.fog as THREE.Fog).color.setHex(a.fog);
    this.sun.color.setHex(a.sun);
    this.sun.intensity = a.sunIntensity;
    this.hemi.color.setHex(a.hemiSky);
    this.hemi.groundColor.setHex(a.hemiGround);
    this.hemi.intensity = a.hemiIntensity;
  }

  /** 'menu' : gros plan sur le héros ; 'play' : vue de dessus inclinée. */
  setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  /** Cadre le héros en entier dans une zone de l'écran (null : retour au gros plan du menu). */
  setPreview(view: PreviewView | null): void {
    this.preview = view;
  }

  /** Secoue la caméra (dégâts subis, mort d'un gros ennemi). */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Place la caméra et le soleil (donc la zone d'ombres) autour du joueur. */
  follow(x: number, z: number, dt: number): void {
    const play = this.mode === 'play';
    // En portrait le champ horizontal est étroit : on recule la caméra.
    const zoom = this.portrait ? 1.35 : 1;
    let lookTarget = play ? 0.5 : 1.1;
    if (play) this.targetOffset.set(0, 14 * zoom, 13 * zoom);
    else if (this.preview && this.preview.bottom - this.preview.top > 60) {
      // Aperçu : on recule jusqu'à ce que le héros (1,9) remplisse la zone demandée, et on le centre dedans.
      const { top, bottom, centerX } = this.preview;
      const height = window.innerHeight;
      const visible = (PREVIEW_HERO_HEIGHT * height) / ((bottom - top) * 0.88);
      const perPixel = visible / height;
      const distance = visible / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
      lookTarget = PREVIEW_HERO_HEIGHT / 2 - (height / 2 - (top + bottom) / 2) * perPixel;
      this.targetOffset.set(-(centerX - window.innerWidth / 2) * perPixel, lookTarget + 0.15, distance);
    } else this.targetOffset.set(0, 2.3, this.portrait ? 7.5 : 6);

    const k = 1 - Math.exp(-dt * 5);
    this.offset.lerp(this.targetOffset, k);
    this.lookY += (lookTarget - this.lookY) * k;

    this.trauma = Math.max(0, this.trauma - dt * 2.5);
    const amplitude = this.trauma * this.trauma * 0.6;
    this.camera.position.set(
      x + this.offset.x + (Math.random() - 0.5) * amplitude,
      this.offset.y + (Math.random() - 0.5) * amplitude,
      z + this.offset.z,
    );
    this.camera.lookAt(x + this.offset.x, this.lookY, z);
    this.sun.position.set(x + 10, 20, z + 8);
    this.sun.target.position.set(x, 0, z);
  }

  /** Point du sol situé sous une position de l'écran, ou null si le rayon part vers le ciel. */
  groundPoint(clientX: number, clientY: number): { x: number; z: number } | null {
    this.pointer.set((clientX / window.innerWidth) * 2 - 1, 1 - (clientY / window.innerHeight) * 2);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.ground, this.hit);
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = w < h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Sol : damier doux, volontairement plus sombre et moins saturé que les ennemis et les gemmes
   * pour qu'ils ressortent, avec des plaques d'herbe et de terre pour casser l'uniformité.
   */
  private buildGround(): void {
    const SIZE = 512;
    const CELLS = 8;
    const cell = SIZE / CELLS;
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const ctx = c.getContext('2d')!;
    for (let i = 0; i < CELLS; i++) {
      for (let j = 0; j < CELLS; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? '#5b9449' : '#538b43';
        ctx.fillRect(i * cell, j * cell, cell, cell);
      }
    }
    // Plaques : dessinées aussi de l'autre côté du bord pour que la texture se raccorde en se répétant.
    const patches = ['#66a152', '#4d843f', '#6a9a4e', '#5f9246', '#778f50'];
    for (let n = 0; n < 46; n++) {
      const x = rand(0, SIZE);
      const y = rand(0, SIZE);
      const rx = rand(14, 46);
      const ry = rx * rand(0.55, 0.9);
      ctx.fillStyle = patches[Math.floor(Math.random() * patches.length)];
      ctx.globalAlpha = rand(0.2, 0.4);
      for (const dx of [-SIZE, 0, SIZE]) {
        for (const dy of [-SIZE, 0, SIZE]) {
          ctx.beginPath();
          ctx.ellipse(x + dx, y + dy, rx, ry, rand(0, Math.PI), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    const size = 240;
    // Une texture couvre 8 cases de 3 unités, soit 24 unités de côté.
    tex.repeat.set(size / 24, size / 24);

    const mat = toonMaterial(0xffffff);
    mat.map = tex;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  /**
   * Limite de l'arène : une clôture en bois, et au-delà un sol plus sombre (terrain broussailleux)
   * qui rend le bord visible même sans les arbres derrière.
   */
  private buildBorder(): void {
    const edge = ARENA + 1.5;

    // Sol extérieur : grand carré percé d'un trou aux dimensions de l'arène.
    const outer = new THREE.Shape();
    outer.moveTo(-150, -150);
    outer.lineTo(150, -150);
    outer.lineTo(150, 150);
    outer.lineTo(-150, 150);
    outer.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-edge, -edge);
    hole.lineTo(-edge, edge);
    hole.lineTo(edge, edge);
    hole.lineTo(edge, -edge);
    hole.closePath();
    outer.holes.push(hole);
    const rough = new THREE.Mesh(new THREE.ShapeGeometry(outer).rotateX(-Math.PI / 2), toonMaterial(0x3f6a3a));
    rough.position.y = 0.02;
    rough.receiveShadow = true;
    this.scene.add(rough);

    // Poteaux tous les 3 unités, puis deux lisses par côté.
    const wood = toonMaterial(0x8b5a2b);
    const step = 3;
    const perSide = Math.floor((edge * 2) / step) + 1;
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 1.35, 0.26).translate(0, 0.675, 0), wood, perSide * 4);
    const m = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < perSide; i++) {
      const t = -edge + i * step;
      for (const [x, z] of [
        [t, -edge],
        [t, edge],
        [-edge, t],
        [edge, t],
      ]) {
        posts.setMatrixAt(n++, m.makeTranslation(x, 0, z));
      }
    }
    posts.count = n;
    posts.castShadow = true;
    posts.frustumCulled = false;
    this.scene.add(posts);

    const railMaterial = toonMaterial(0xa56d3a);
    for (const y of [0.5, 1.0]) {
      for (const [x, z, alongX] of [
        [0, -edge, true],
        [0, edge, true],
        [-edge, 0, false],
        [edge, 0, false],
      ] as const) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(alongX ? edge * 2 : 0.14, 0.14, alongX ? 0.14 : edge * 2), railMaterial);
        rail.position.set(x, y, z);
        rail.castShadow = true;
        this.scene.add(rail);
      }
    }
  }

  private buildDecor(): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    // Forêt : anneau d'arbres qui matérialise la limite de l'arène.
    const TREES = 320;
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.38, 1.4, 7).translate(0, 0.7, 0);
    const leafGeo = new THREE.ConeGeometry(1.5, 3, 8).translate(0, 2.7, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, toonMaterial(0x9b6a3c), TREES);
    const leaves = new THREE.InstancedMesh(leafGeo, toonMaterial(0x2fa35a), TREES);
    const leafColor = new THREE.Color();
    for (let i = 0; i < TREES; i++) {
      // Point aléatoire dans la bande située juste autour du carré jouable.
      const band = rand(ARENA + 2, ARENA + 16);
      const t = rand(-band, band);
      const side = Math.floor(Math.random() * 4);
      const x = side === 0 ? band : side === 1 ? -band : t;
      const z = side === 2 ? band : side === 3 ? -band : t;
      const scale = rand(0.8, 1.6);
      p.set(x, 0, z);
      q.setFromAxisAngle(up, rand(0, Math.PI * 2));
      s.setScalar(scale);
      m.compose(p, q, s);
      trunks.setMatrixAt(i, m);
      leaves.setMatrixAt(i, m);
      leaves.setColorAt(i, leafColor.setHSL(rand(0.36, 0.43), 0.6, rand(0.32, 0.42)));
    }
    trunks.castShadow = leaves.castShadow = true;
    trunks.frustumCulled = leaves.frustumCulled = false;
    this.scene.add(trunks, leaves);

    // Touffes d'herbe et cailloux : purement décoratifs, donnent un repère de mouvement.
    // Le décor reste dans les verts et les gris pour que tout objet coloré au sol
    // (gemme, pièce) soit immédiatement identifiable comme quelque chose à ramasser.
    const TUFTS = 500;
    const tufts = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.13, 0.42, 4).translate(0, 0.21, 0),
      toonMaterial(0xffffff),
      TUFTS,
    );
    const tuftColor = new THREE.Color();
    for (let i = 0; i < TUFTS; i++) {
      p.set(rand(-ARENA, ARENA), 0, rand(-ARENA, ARENA));
      q.setFromAxisAngle(up, rand(0, Math.PI * 2));
      s.set(rand(0.8, 1.5), rand(0.6, 1.4), rand(0.8, 1.5));
      m.compose(p, q, s);
      tufts.setMatrixAt(i, m);
      tufts.setColorAt(i, tuftColor.setHSL(rand(0.27, 0.33), 0.6, rand(0.36, 0.46)));
    }
    tufts.frustumCulled = false;
    this.scene.add(tufts);

    const ROCKS = 70;
    const rocks = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.5, 0),
      toonMaterial(0xa9b2c3),
      ROCKS,
    );
    for (let i = 0; i < ROCKS; i++) {
      const scale = rand(0.3, 0.7);
      p.set(rand(-ARENA, ARENA), scale * 0.15, rand(-ARENA, ARENA));
      // Pas de caillou sur le point de départ du joueur.
      if (Math.hypot(p.x, p.z) < 4) p.x += 8;
      q.setFromAxisAngle(up, rand(0, Math.PI * 2));
      s.set(scale, scale * 0.6, scale);
      m.compose(p, q, s);
      rocks.setMatrixAt(i, m);
    }
    rocks.castShadow = rocks.receiveShadow = true;
    rocks.frustumCulled = false;
    this.scene.add(rocks);

    // Plus de décor, toujours dans les verts, les gris et les bruns (les fleurs sont crème, discrètes) :
    // rien de bleu, de rose ou de jaune vif qui pourrait se confondre avec une gemme ou une pièce.
    const spot = (minRadius = 4.5) => {
      for (;;) {
        const x = rand(-ARENA + 1, ARENA - 1);
        const z = rand(-ARENA + 1, ARENA - 1);
        if (Math.hypot(x, z) >= minRadius) return { x, z };
      }
    };

    const BUSHES = 48;
    const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.85, 0).translate(0, 0.55, 0), toonMaterial(0xffffff), BUSHES);
    const bushColor = new THREE.Color();
    for (let i = 0; i < BUSHES; i++) {
      const { x, z } = spot();
      const scale = rand(0.7, 1.35);
      p.set(x, 0, z);
      q.setFromAxisAngle(up, rand(0, Math.PI * 2));
      s.set(scale * rand(1, 1.3), scale * rand(0.7, 0.95), scale);
      bushes.setMatrixAt(i, m.compose(p, q, s));
      bushes.setColorAt(i, bushColor.setHSL(rand(0.28, 0.36), 0.5, rand(0.22, 0.3)));
    }
    bushes.castShadow = bushes.receiveShadow = true;
    bushes.frustumCulled = false;
    this.scene.add(bushes);

    const STUMPS = 26;
    const stumps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.38, 0.48, 0.55, 9).translate(0, 0.275, 0), toonMaterial(0x7d522b), STUMPS);
    const stumpTops = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 9).translate(0, 0.56, 0), toonMaterial(0xc9a06a), STUMPS);
    for (let i = 0; i < STUMPS; i++) {
      const { x, z } = spot();
      const scale = rand(0.8, 1.4);
      p.set(x, 0, z);
      q.setFromAxisAngle(up, rand(0, Math.PI * 2));
      s.set(scale, scale * rand(0.8, 1.2), scale);
      m.compose(p, q, s);
      stumps.setMatrixAt(i, m);
      stumpTops.setMatrixAt(i, m);
    }
    stumps.castShadow = stumps.receiveShadow = true;
    stumps.frustumCulled = stumpTops.frustumCulled = false;
    this.scene.add(stumps, stumpTops);

    const CLUSTERS = 80;
    const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), toonMaterial(0xf1ecd8), CLUSTERS * 3);
    for (let i = 0; i < CLUSTERS; i++) {
      const { x, z } = spot(3);
      for (let k = 0; k < 3; k++) {
        p.set(x + rand(-0.35, 0.35), rand(0.16, 0.3), z + rand(-0.35, 0.35));
        q.identity();
        s.setScalar(rand(0.8, 1.3));
        flowers.setMatrixAt(i * 3 + k, m.compose(p, q, s));
      }
    }
    flowers.frustumCulled = false;
    this.scene.add(flowers);
  }
}
