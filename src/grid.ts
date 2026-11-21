/**
 * Séparation des ennemis qui se chevauchent, avec une grille spatiale (sans affichage, testable sous Node).
 *
 * Comparer chaque ennemi à tous les autres coûte n² / 2 tests par image (45 000 à 300 ennemis) : beaucoup de calcul,
 * donc de chaleur, sur un téléphone. La grille range chaque ennemi dans une case ; deux ennemis ne peuvent se
 * toucher que dans des cases voisines, on ne teste donc que ceux-là. Le résultat est le même que `separateBruteForce`.
 */

export interface Disc {
  x: number;
  z: number;
  radius: number;
}

/** Deux disques qui se chevauchent s'écartent chacun de la moitié du chevauchement (le long de la ligne de leurs centres). */
function pushApart(a: Disc, b: Disc): void {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const min = a.radius + b.radius;
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min || d2 === 0) return;
  const d = Math.sqrt(d2);
  const push = (min - d) / d / 2;
  a.x -= dx * push;
  a.z -= dz * push;
  b.x += dx * push;
  b.z += dz * push;
}

/** Méthode d'origine : toutes les paires, dans l'ordre. Sert de référence (tests) et de secours. */
export function separateBruteForce(list: Disc[]): void {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) pushApart(list[i], list[j]);
  }
}

/** Marge de la case sur la somme des plus grands rayons : les ennemis bougent un peu pendant le passage (ils se poussent). */
const MARGIN = 1;

export class SeparationGrid {
  /** Nombre de paires réellement testées au dernier passage (pour les tests et les mesures). */
  checks = 0;

  private readonly size: number;
  private readonly half: number;
  private readonly cells: number;
  private readonly head: Int32Array;
  private next: Int32Array;
  private cellX: Int32Array;
  private cellZ: Int32Array;
  private near: Int32Array;

  /**
   * @param maxRadius plus grand rayon d'ennemi possible
   * @param half demi-largeur de la zone couverte (au-delà, les ennemis sont rangés dans la case du bord : toujours correct)
   * @param capacity nombre d'ennemis prévu (la grille s'agrandit si besoin)
   */
  constructor(
    maxRadius: number,
    half: number,
    capacity: number,
  ) {
    this.size = 2 * maxRadius + MARGIN;
    this.half = half;
    this.cells = Math.max(1, Math.ceil((2 * half) / this.size));
    this.head = new Int32Array(this.cells * this.cells);
    this.next = new Int32Array(capacity);
    this.cellX = new Int32Array(capacity);
    this.cellZ = new Int32Array(capacity);
    this.near = new Int32Array(capacity);
  }

  private cellOf(v: number): number {
    const c = Math.floor((v + this.half) / this.size) || 0;
    return c < 0 ? 0 : c >= this.cells ? this.cells - 1 : c;
  }

  separate(list: Disc[]): void {
    const n = list.length;
    this.checks = 0;
    if (n < 2) return;
    if (n > this.next.length) {
      this.next = new Int32Array(n);
      this.cellX = new Int32Array(n);
      this.cellZ = new Int32Array(n);
      this.near = new Int32Array(n);
    }

    // Un rayon plus grand que prévu fausserait la taille des cases : méthode lente mais sûre.
    for (let i = 0; i < n; i++) {
      if (!(list[i].radius * 2 + MARGIN / 2 <= this.size)) {
        separateBruteForce(list);
        this.checks = (n * (n - 1)) / 2;
        return;
      }
    }

    const { head, next, cellX, cellZ, near, cells } = this;
    head.fill(-1);
    // Rangés de la fin vers le début : la liste de chaque case est dans l'ordre croissant des indices.
    for (let i = n - 1; i >= 0; i--) {
      const cx = this.cellOf(list[i].x);
      const cz = this.cellOf(list[i].z);
      cellX[i] = cx;
      cellZ[i] = cz;
      const cell = cz * cells + cx;
      next[i] = head[cell];
      head[cell] = i;
    }

    for (let i = 0; i < n; i++) {
      // Voisins d'indice plus grand dans les 9 cases autour, puis triés : les paires sont traitées dans le même ordre
      // que la méthode d'origine (chaque poussée change les positions suivantes, l'ordre compte).
      let m = 0;
      const z0 = Math.max(0, cellZ[i] - 1);
      const z1 = Math.min(cells - 1, cellZ[i] + 1);
      const x0 = Math.max(0, cellX[i] - 1);
      const x1 = Math.min(cells - 1, cellX[i] + 1);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          for (let j = head[cz * cells + cx]; j !== -1; j = next[j]) if (j > i) near[m++] = j;
        }
      }
      // Tri par insertion : quelques dizaines de voisins au plus.
      for (let k = 1; k < m; k++) {
        const value = near[k];
        let p = k - 1;
        while (p >= 0 && near[p] > value) {
          near[p + 1] = near[p];
          p--;
        }
        near[p + 1] = value;
      }
      const a = list[i];
      for (let k = 0; k < m; k++) pushApart(a, list[near[k]]);
      this.checks += m;
    }
  }
}

/**
 * Index spatial pour les armes : « quels ennemis sont près de ce point ? » sans parcourir toute la liste.
 *
 * Les armes (tirs, orbes, aura, mines) cherchaient dans les 300 ennemis à chaque image, et un tir le faisait chacun
 * pour soi. L'index range les ennemis dans des cases une fois par image (`rebuild`), puis ne renvoie que ceux des cases voisines.
 *
 * Le résultat est exactement celui du parcours complet : mêmes ennemis, dans l'ordre de la liste (l'ordre compte, chaque
 * coup a des effets de bord). Les reculs infligés pendant l'image déplacent les ennemis après le rangement : leur somme est
 * suivie (`noteMove`) et élargit la recherche en conséquence, au besoin jusqu'à tous les ennemis.
 */
export class SpatialIndex {
  /** Nombre de disques rangés au dernier `rebuild`. */
  count = 0;

  private readonly size: number;
  private readonly half: number;
  private readonly cells: number;
  private readonly head: Int32Array;
  private next: Int32Array;
  /** Plus grand rayon rangé. */
  private biggest = 0;
  /** Borne du déplacement de n'importe quel disque depuis le rangement. */
  private drift = 0;

  /**
   * @param maxRadius plus grand rayon d'ennemi attendu (fixe la taille des cases ; un rayon plus grand reste correct)
   * @param half demi-largeur de la zone couverte (au-delà : case du bord, sans erreur)
   * @param capacity nombre d'ennemis prévu (l'index s'agrandit si besoin)
   */
  constructor(maxRadius: number, half: number, capacity: number) {
    this.size = 2 * maxRadius + MARGIN;
    this.half = half;
    this.cells = Math.max(1, Math.ceil((2 * half) / this.size));
    this.head = new Int32Array(this.cells * this.cells);
    this.next = new Int32Array(capacity);
  }

  private cellOf(v: number): number {
    const c = Math.floor((v + this.half) / this.size) || 0;
    return c < 0 ? 0 : c >= this.cells ? this.cells - 1 : c;
  }

  /** Range les disques à leurs positions du moment. */
  rebuild(list: Disc[]): void {
    const n = list.length;
    if (n > this.next.length) this.next = new Int32Array(n);
    this.head.fill(-1);
    this.count = n;
    this.drift = 0;
    this.biggest = 0;
    // De la fin vers le début : la liste de chaque case est dans l'ordre croissant des indices.
    for (let i = n - 1; i >= 0; i--) {
      const d = list[i];
      if (d.radius > this.biggest) this.biggest = d.radius;
      const cell = this.cellOf(d.z) * this.cells + this.cellOf(d.x);
      this.next[i] = this.head[cell];
      this.head[cell] = i;
    }
  }

  /** Un disque vient de bouger d'au plus `distance` depuis le rangement (recul d'un coup, par exemple). */
  noteMove(distance: number): void {
    this.drift += distance;
  }

  /**
   * Écrit dans `out` les indices, par ordre croissant, de tous les disques qui peuvent être touchés par un cercle de rayon
   * `reach` centré en (x, z), c'est-à-dire ceux à moins de `reach + leur rayon` (le test exact reste à faire par l'appelant).
   * `out` doit pouvoir contenir `count` indices. Renvoie leur nombre.
   */
  query(x: number, z: number, reach: number, out: Int32Array): number {
    const n = this.count;
    // Un disque touché est, à son rang d'origine, à moins de (reach + plus grand rayon + déplacement) du point.
    const span = Math.ceil((this.biggest + reach + this.drift) / this.size);
    if (span >= this.cells || !Number.isFinite(span)) {
      for (let i = 0; i < n; i++) out[i] = i;
      return n;
    }
    const { head, next, cells } = this;
    const cx = this.cellOf(x);
    const cz = this.cellOf(z);
    const x0 = Math.max(0, cx - span);
    const x1 = Math.min(cells - 1, cx + span);
    const z0 = Math.max(0, cz - span);
    const z1 = Math.min(cells - 1, cz + span);
    let m = 0;
    for (let row = z0; row <= z1; row++) {
      for (let col = x0; col <= x1; col++) {
        for (let j = head[row * cells + col]; j !== -1; j = next[j]) out[m++] = j;
      }
    }
    if (m > 32) {
      out.subarray(0, m).sort();
    } else {
      for (let k = 1; k < m; k++) {
        const value = out[k];
        let p = k - 1;
        while (p >= 0 && out[p] > value) {
          out[p + 1] = out[p];
          p--;
        }
        out[p + 1] = value;
      }
    }
    return m;
  }
}
