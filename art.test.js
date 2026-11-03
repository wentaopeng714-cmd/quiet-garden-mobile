import assert from 'node:assert/strict';
import {POND,coastPoint,inPond,animalMaterials} from './art.js';
import {prepareRevealMaterial} from './appearance.js';
for(let i=0;i<240;i++){
 const p=coastPoint(i/240*Math.PI*2);
 const inside={x:POND.x+(p.x-POND.x)*.97,z:POND.z+(p.z-POND.z)*.97};
 const outside={x:POND.x+(p.x-POND.x)*1.03,z:POND.z+(p.z-POND.z)*1.03};
 assert(inPond(inside.x,inside.z),'water hit area agrees with the painted shore');
 assert(!inPond(outside.x,outside.z),'land stays outside the painted shore');
}
for(const type of ['frog','duck','rabbit','lily']){
 const materials=animalMaterials(type);
 const uniforms={uBirthProgress:{value:.5},uBirthBase:{value:.13},uBirthHeight:{value:.5}};
 for(const mat of Object.values(materials)){
  prepareRevealMaterial(mat,uniforms);
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>\n#include <alphatest_fragment>'};
  mat.onBeforeCompile(shader);
  assert(shader.fragmentShader.includes('artNoise'),'paint stays attached during reveal');
  assert(shader.fragmentShader.includes('birthCoverage'),'reveal stays attached to the paint');
  assert(shader.uniforms.uBirthProgress===uniforms.uBirthProgress,'all materials share one reveal clock');
  assert(mat.color.r>=0&&mat.color.r<=1,'valid linear palette');
 }
}
assert.notEqual(animalMaterials('duck').m.color.getHex(),animalMaterials('duck',{young:true}).m.color.getHex(),'ducklings have their own plumage');
console.log('Paint/reveal integration and shoreline checks passed');
