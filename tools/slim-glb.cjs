/**
 * Allège un modèle 3D .glb avant de l'ajouter au jeu (public/models/) : ne garde que les animations demandées,
 * retire les nœuds indésirables (arme tenue en main...) et les données devenues inutiles (UV sans texture, etc.).
 * Un fichier de 1,5 Mo peut descendre à 0,4 Mo. Aucune dépendance : `node` suffit.
 *
 * Usage :
 *   DROP=Axe node tools/slim-glb.cjs entrée.glb public/models/hero-nom.glb Idle Run Death
 *
 * - `Idle Run Death` : les trois animations dont le jeu a besoin. Elles sont renommées proprement
 *   (« CharacterArmature|Idle »...), même si le fichier d'origine a des noms mal formés.
 * - `DROP` (facultatif) : noms, séparés par des virgules, des nœuds à retirer (ex. `Axe`, `Weapon_Cutlass`, `Pistol`).
 *   Pour les connaître, lire la liste « nodes » du JSON du .glb.
 * - Les textures intégrées (atlas) sont conservées ; les accessors « sparse » ne sont pas gérés.
 */
const fs = require('fs');
const [input, output, ...keepNames] = process.argv.slice(2);
const drop = (process.env.DROP || '').split(',').filter(Boolean);
const buf = fs.readFileSync(input);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const bin = buf.slice(binStart, binStart + buf.readUInt32LE(20 + jsonLen));

// Certains fichiers ont des noms mal formés (« A|A|Idle|A|Idle ») : on cherche le nom parmi les morceaux et on renomme proprement.
const animations = keepNames.map((keep) => {
  const found = (json.animations || []).find((a) => (a.name || '').split('|').includes(keep));
  return found ? { ...found, name: 'CharacterArmature|' + keep } : undefined;
}).filter(Boolean);
if (animations.length !== keepNames.length) throw new Error('animations manquantes : ' + keepNames.join(','));

// Nœuds à retirer (arme tenue en main...) : on enlève leur maillage, puis les maillages devenus inutiles.
if (drop.length) {
  for (const node of json.nodes) {
    if (node.mesh !== undefined && drop.some((d) => (node.name || '').includes(d))) { delete node.mesh; delete node.skin; }
  }
  const referenced = [...new Set(json.nodes.filter((n) => n.mesh !== undefined).map((n) => n.mesh))].sort((a, b) => a - b);
  const meshMap = new Map(referenced.map((old, i) => [old, i]));
  json.meshes = referenced.map((i) => json.meshes[i]);
  for (const node of json.nodes) if (node.mesh !== undefined) node.mesh = meshMap.get(node.mesh);
}

// Sans texture, les coordonnées UV ne servent à rien.
if (!(json.textures || []).length) for (const mesh of json.meshes || []) for (const p of mesh.primitives) for (const k of Object.keys(p.attributes)) if (k.startsWith('TEXCOORD')) delete p.attributes[k];

// Accessors utilisés
const used = new Set();
for (const mesh of json.meshes || []) {
  for (const p of mesh.primitives) {
    if (p.indices !== undefined) used.add(p.indices);
    for (const a of Object.values(p.attributes)) used.add(a);
    for (const t of p.targets || []) for (const a of Object.values(t)) used.add(a);
  }
}
for (const s of json.skins || []) if (s.inverseBindMatrices !== undefined) used.add(s.inverseBindMatrices);
for (const a of animations) for (const s of a.samplers) { used.add(s.input); used.add(s.output); }

const oldAccessors = json.accessors;
const accessorMap = new Map();
const newAccessors = [];
for (const i of [...used].sort((a, b) => a - b)) {
  if (oldAccessors[i].sparse) throw new Error('accessor sparse non géré');
  accessorMap.set(i, newAccessors.length);
  newAccessors.push({ ...oldAccessors[i] });
}

// BufferViews utilisés (copiés tels quels, alignés sur 4 octets) : ceux des accessors, et ceux des images (textures).
const bvMap = new Map();
const newViews = [];
const chunks = [];
let offset = 0;
const keepView = (index) => {
  if (bvMap.has(index)) return bvMap.get(index);
  const old = json.bufferViews[index];
  const start = old.byteOffset || 0;
  const data = bin.slice(start, start + old.byteLength);
  const pad = (4 - (data.length % 4)) % 4;
  bvMap.set(index, newViews.length);
  newViews.push({ ...old, byteOffset: offset });
  chunks.push(data, Buffer.alloc(pad));
  offset += data.length + pad;
  return bvMap.get(index);
};
for (const acc of newAccessors) if (acc.bufferView !== undefined) acc.bufferView = keepView(acc.bufferView);
for (const image of json.images || []) if (image.bufferView !== undefined) image.bufferView = keepView(image.bufferView);

// Réécriture des références
for (const mesh of json.meshes || []) {
  for (const p of mesh.primitives) {
    if (p.indices !== undefined) p.indices = accessorMap.get(p.indices);
    for (const k of Object.keys(p.attributes)) p.attributes[k] = accessorMap.get(p.attributes[k]);
    for (const t of p.targets || []) for (const k of Object.keys(t)) t[k] = accessorMap.get(t[k]);
  }
}
for (const s of json.skins || []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = accessorMap.get(s.inverseBindMatrices);
for (const a of animations) for (const s of a.samplers) { s.input = accessorMap.get(s.input); s.output = accessorMap.get(s.output); }

json.animations = animations;
json.accessors = newAccessors;
json.bufferViews = newViews;
const newBin = Buffer.concat(chunks);
json.buffers = [{ byteLength: newBin.length }];

let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
const total = 12 + 8 + jsonBuf.length + 8 + newBin.length;
const head = Buffer.alloc(12);
head.writeUInt32LE(0x46546c67, 0);
head.writeUInt32LE(2, 4);
head.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(newBin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(output, Buffer.concat([head, jh, jsonBuf, bh, newBin]));
console.log(input, Math.round(buf.length / 1024) + ' Ko ->', Math.round(total / 1024) + ' Ko');
