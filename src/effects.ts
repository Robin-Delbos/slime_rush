import * as THREE from 'three';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
  gravity: number;
  /** Nuage : grossit puis disparaît, au lieu de simplement rétrécir. */
  puff: boolean;
}

const MAX_PARTICLES = 400;
const MAX_FLOATERS = 28;
const GRAVITY = 22;
const WAVE_TIME = 0.45;

/** Effets purement visuels : particules 3D et textes flottants (dégâts, gains). */
export class Effects {
  private particles: Particle[] = [];
  private mesh: THREE.InstancedMesh;
  private floaters = 0;
  private waves: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; radius: number; age: number; peak: number }[] = [];
  private waveGeometry = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  private ringGeometry = new THREE.RingGeometry(0.9, 1, 56).rotateX(-Math.PI / 2);
  private m = new THREE.Matrix4();
  private p = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private layer: HTMLElement,
  ) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.6, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_PARTICLES,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  clear(): void {
    for (const wave of this.waves) {
      this.scene.remove(wave.mesh);
      wave.material.dispose();
    }
    this.waves.length = 0;
    this.particles.length = 0;
    this.mesh.count = 0;
    this.layer.replaceChildren();
    this.floaters = 0;
  }

  /** Gerbe de particules partant du point donné. */
  burst(x: number, y: number, z: number, color: THREE.Color, count: number, power = 5, size = 0.16): void {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = power * (0.4 + Math.random() * 0.6);
      const life = 0.35 + Math.random() * 0.3;
      this.particles.push({
        x,
        y,
        z,
        vx: Math.cos(angle) * speed,
        vy: power * (0.5 + Math.random() * 0.8),
        vz: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: size * (0.7 + Math.random() * 0.6),
        color,
        gravity: GRAVITY,
        puff: false,
      });
    }
  }

  /** Petits nuages qui gonflent puis se dissipent : mort d'un ennemi, poussière sous les pas. */
  puff(x: number, y: number, z: number, color: THREE.Color, size: number, count = 3): void {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 1.4;
      const life = 0.4 + Math.random() * 0.3;
      this.particles.push({
        x: x + Math.cos(angle) * 0.15,
        y,
        z: z + Math.sin(angle) * 0.15,
        vx: Math.cos(angle) * speed,
        vy: 0.8 + Math.random() * 0.8,
        vz: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: size * (0.75 + Math.random() * 0.5),
        color,
        gravity: 0,
        puff: true,
      });
    }
  }

  /** Couronne d'étincelles qui part d'un cercle de rayon donné (pulsation d'aura, onde de choc). */
  ring(x: number, z: number, radius: number, color: THREE.Color, count: number, size = 0.2): void {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const life = 0.35 + Math.random() * 0.25;
      this.particles.push({
        x: x + Math.cos(angle) * radius,
        y: 0.2,
        z: z + Math.sin(angle) * radius,
        vx: Math.cos(angle) * 2.5,
        vy: 2.5 + Math.random() * 2,
        vz: Math.sin(angle) * 2.5,
        life,
        maxLife: life,
        size: size * (0.7 + Math.random() * 0.6),
        color,
        gravity: 10,
        puff: false,
      });
    }
  }

  /** Texte qui s'élève puis s'efface au-dessus d'un point du monde. */
  floater(x: number, z: number, text: string, className = ''): void {
    if (this.floaters >= MAX_FLOATERS) return;
    this.v.set(x, 1.4, z).project(this.camera);
    if (this.v.z > 1 || Math.abs(this.v.x) > 1 || Math.abs(this.v.y) > 1) return;

    const el = document.createElement('span');
    el.className = `floater ${className}`;
    el.textContent = text;
    el.style.left = `${((this.v.x + 1) / 2) * 100 + (Math.random() - 0.5) * 3}%`;
    el.style.top = `${((1 - this.v.y) / 2) * 100}%`;
    this.layer.append(el);
    this.floaters++;

    const animation = el.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 1 },
        { transform: 'translate(-50%, -110%) scale(1.15)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -190%) scale(1)', opacity: 0 },
      ],
      { duration: 600, easing: 'ease-out' },
    );
    animation.onfinish = () => {
      el.remove();
      this.floaters--;
    };
  }

  /** Onde de choc : disque lumineux et anneau net qui s'étendent au sol jusqu'à `radius` puis s'effacent. */
  shockwave(x: number, z: number, radius: number, color: THREE.Color): void {
    const add = (geometry: THREE.BufferGeometry, peak: number) => {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, 0.06, z);
      this.scene.add(mesh);
      this.waves.push({ mesh, material, radius, age: 0, peak });
    };
    add(this.waveGeometry, 0.5);
    add(this.ringGeometry, 1);
  }

  update(dt: number): void {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wave = this.waves[i];
      wave.age += dt;
      const k = wave.age / WAVE_TIME;
      if (k >= 1) {
        this.scene.remove(wave.mesh);
        wave.material.dispose();
        this.waves.splice(i, 1);
        continue;
      }
      // Expansion rapide puis ralentie, opacité décroissante.
      wave.mesh.scale.setScalar(wave.radius * (1 - (1 - k) ** 3));
      wave.material.opacity = wave.peak * (1 - k);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const part = this.particles[i];
      part.life -= dt;
      if (part.life <= 0) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }
      part.vy -= part.gravity * dt;
      part.x += part.vx * dt;
      part.y = Math.max(0.05, part.y + part.vy * dt);
      part.z += part.vz * dt;
    }

    for (let i = 0; i < this.particles.length; i++) {
      const part = this.particles[i];
      this.p.set(part.x, part.y, part.z);
      const age = 1 - part.life / part.maxLife;
      // Nuage : gonfle vite puis fond ; étincelle : rétrécit régulièrement.
      this.s.setScalar(part.puff ? part.size * (0.4 + 1.2 * age) * (1 - age * age * age) : part.size * (1 - age));
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
      this.mesh.setColorAt(i, part.color);
    }
    this.mesh.count = this.particles.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
