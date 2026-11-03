import * as THREE from 'three';
import {paintMaterial,canopyMaterial} from './art.js';
import {silhouetteGeometry} from './animal-models.js';
import {flowerTexture,projectedUV} from './paint-textures.js';

const sphere=new THREE.SphereGeometry(1,20,14);sphere.userData.shared=true;
const blossom=new THREE.PlaneGeometry(2,2);blossom.userData.shared=true;
function oval(g,mat,pos,scale){
 const m=new THREE.Mesh(sphere,mat);m.position.set(...pos);m.scale.set(...scale);
 m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
}
export function buildGardenObject(type,g,{variant=0}={}){
 const mats=[];let height=.3,body;
 const paint=color=>{const m=paintMaterial(color);mats.push(m);return m;};
 if(type==='tree'){
  const bark=paint('#74513a'),leaves=canopyMaterial(variant===1?'pink':'green');mats.push(leaves);
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.055,.095,1,8),bark);
  trunk.position.y=.48;trunk.castShadow=true;trunk.receiveShadow=true;g.add(trunk);
  const geo=silhouetteGeometry('canopy');projectedUV(geo,{spherical:true});
  body=new THREE.Mesh(geo,leaves);body.position.y=.94;body.scale.set(1.13,.90,.98);
  body.castShadow=true;body.receiveShadow=true;g.add(body);height=1.9;
 }else if(type==='rock'){
  const colors=['#a7a99b','#c0bcaa','#939b91'];
  for(let j=0;j<3;j++){
   const m=oval(g,paint(colors[j]),[(j-1)*.17,.10+j*.025,(j-1)*.08],[.19-j*.018,.13+j*.016,.16+j*.01]);
   m.rotation.set(j*.13,j*1.8,j*.08);if(j===1)body=m;
  }
  height=.30;
 }else if(type==='flowers'){
  const leaf=paint('#91ad63'),stem=paint('#849a57');
  const colors=['#f2d9ab','#e9b7c2','#fff0d7'];
  const petals=colors.map(color=>{
   const m=new THREE.MeshBasicMaterial({color,map:flowerTexture(),side:THREE.DoubleSide,transparent:true,alphaTest:.04,opacity:.9,depthWrite:false,toneMapped:false});mats.push(m);return m;
  });
  // A low, open cluster keeps the same painted flecks as the surrounding meadow.
  for(let i=0;i<17;i++){
   const a=i*2.39996,r=Math.sqrt((i+.5)/17)*.45,x=Math.sin(a)*r,z=Math.cos(a)*r,h=.045+(i%5)*.018;
   const l=oval(g,leaf,[x,.018,z],[.075,.018,.036]);l.rotation.y=a;
   const stalk=new THREE.Mesh(new THREE.CylinderGeometry(.003,.005,h,4),stem);stalk.position.set(x,h/2,z);g.add(stalk);
   const f=new THREE.Mesh(blossom,petals[(i+variant)%3]);f.position.set(x,h,z);f.rotation.set(-Math.PI/2+.22,0,a);f.scale.setScalar(.044+(i%3)*.008);g.add(f);
   if(i===0)body=l;
  }
  height=.16;
 }else throw new Error(`Unknown garden object: ${type}`);
 return {body,mats,height};
}

// The original composition now consists of the same editable objects as new drawings.
export const INITIAL_PROPS=[
 {type:'tree',x:-5.45,z:-3.6,size:1.12},{type:'tree',x:-4.15,z:-3.9,size:.74},
 {type:'tree',x:5.35,z:-3.65,size:.95,variant:1},{type:'tree',x:-5.7,z:3.75,size:.72},
 {type:'tree',x:5.92,z:3.95,size:.55},
 ...[[-3.9,1.9],[-3.7,-1.85],[2.7,-2.8],[5.04,.55],[.15,3.7]].map(([x,z])=>({type:'rock',x,z,size:1})),
 {type:'flowers',x:-4.7,z:2.95,size:1.05},{type:'flowers',x:3.6,z:-3.65,size:.95}
];
