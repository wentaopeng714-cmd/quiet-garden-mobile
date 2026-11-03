import assert from 'node:assert/strict';
import * as THREE from 'three';
import {silhouetteGeometry,buildAnimal} from './animal-models.js';
import {APPEARANCE,appearanceAt,strokeOpacity} from './appearance.js';
for(const type of ['frog','duck','rabbit','canopy']){
 const g=silhouetteGeometry(type),p=g.attributes.position,n=g.attributes.normal;
 assert(p.count>1000&&p.count===n.count,`${type}: complete surface`);
 for(let i=0;i<p.array.length;i++)assert(Number.isFinite(p.array[i])&&Number.isFinite(n.array[i]),`${type}: finite geometry`);
 for(let i=0;i<n.count;i+=97)assert(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<.001,`${type}: unit normals`);
}
const frog=silhouetteGeometry('frog').boundingBox,duck=silhouetteGeometry('duck').boundingBox;
const width=frog.max.x-frog.min.x,height=frog.max.y-frog.min.y;
assert(height/width<.38,'frog must retain its low silhouette');
assert((duck.max.y-duck.min.y)/(duck.max.z-duck.min.z)<.42,'duck torso must remain boat-shaped');
// The pupils must be outside the joined eyelids, rather than hidden in the mesh.
const g=new THREE.Group(),mat=new THREE.MeshStandardMaterial(),model=buildAnimal('frog',g,mat,mat,mat);
g.updateMatrixWorld(true);
const ray=new THREE.Raycaster(new THREE.Vector3(.174,.270,-2),new THREE.Vector3(0,0,1));
const first=ray.intersectObjects(g.children,true)[0];
assert(first&&first.object!==model.body,'pupil remains visible from the front');
assert.deepEqual(appearanceAt(.31),{progress:0,opacity:0,ready:false},'release must leave a quiet pause');
let last=0;
for(let t=0;t<1.6;t+=.01){const a=appearanceAt(t);assert(a.progress>=last&&a.progress<=1&&a.opacity>=0&&a.opacity<=1);last=a.progress;}
assert(appearanceAt(APPEARANCE.hold+APPEARANCE.reveal+.001).progress===1);
assert(appearanceAt(1.3).ready,'movement starts after reveal settles');
assert(strokeOpacity(.27)===1,'completed circle holds briefly');
assert(Math.abs(strokeOpacity(.53)-.5)<1e-8,'circle fades continuously');
assert(strokeOpacity(.79)===0,'circle clears before the next gesture');
console.log('Geometry, silhouette, pupil visibility and appearance timing checks passed');
