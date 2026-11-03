import * as THREE from 'three';
import {washTexture,flowerTexture,projectedUV,glazeStrokeTexture} from './paint-textures.js';

import {terrain,POND,coastPoint,coastRadius,inPond} from './terrain.js';
import {TerrainPaint} from './terrain-render.js';
export {POND,coastPoint,coastRadius,inPond};
const clockUniform={value:0};
const NOISE=`
float artHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float artNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(artHash(i),artHash(i+vec2(1,0)),f.x),mix(artHash(i+vec2(0,1)),artHash(i+vec2(1,1)),f.x),f.y);}
float artFbm(vec2 p){return artNoise(p)*.57+artNoise(p*2.03+2.7)*.28+artNoise(p*4.07+8.3)*.15;}
`;
function injectPaint(mat,fragment,key='paint',uniforms={}){
 mat.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader='varying vec3 vArtLocal; varying vec3 vArtWorld; varying vec3 vArtNormal;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvArtLocal=position;vArtWorld=(modelMatrix*vec4(transformed,1.0)).xyz;vArtNormal=normal;');
  shader.fragmentShader='varying vec3 vArtLocal; varying vec3 vArtWorld; varying vec3 vArtNormal;\n'+NOISE+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n'+fragment);
 };
 mat.customProgramCacheKey=()=>key;
 return mat;
}
export function paintMaterial(base,{kind='plain',roughness=1}={}){
 const m=new THREE.MeshStandardMaterial({color:base,roughness,metalness:0});
 const common=`
 vec2 brushUV=vArtLocal.xz*15.0+vArtLocal.y*vec2(3.7,6.2);
 float wash=artFbm(brushUV*.65);
 float fleck=artNoise(brushUV*6.0);
 float dry=artHash(floor(brushUV*31.0));
 diffuseColor.rgb*=.86+wash*.22+fleck*.045;
 diffuseColor.rgb*=.978+dry*.044;
 `;
 let extra='';
 if(kind==='frog')extra=`
  float spotNoise=artNoise(vArtLocal.xz*19.0+vec2(3.2,1.3));
  float spots=smoothstep(.66,.76,spotNoise)*smoothstep(.14,.24,vArtLocal.y);
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.61,.75,.45),spots*.56);
  float belly=(1.0-smoothstep(.045,.16,vArtLocal.y))*.38;
  diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.62,.69,.31),belly);
 `;
 if(kind==='duck')extra=`
  float wing=1.0-smoothstep(.78,1.08,length(vec2(vArtLocal.x/.205,(vArtLocal.z-.10)/.31)));
  wing*=smoothstep(.19,.24,vArtLocal.y);
  diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.25,.115,.052),wing*.94);
 `;
 if(kind==='leaf')extra=`
  vec2 leafUV=vArtLocal.xy;
  float r=length(leafUV),a=atan(leafUV.y,leafUV.x);
  float vein=pow(abs(cos(a*10.0+sin(r*13.0)*.05)),110.0)*smoothstep(.04,.16,r);
  float rim=smoothstep(.49,.58,r);
  diffuseColor.rgb*=1.0-vein*.24-rim*.16;
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*1.18,(1.0-smoothstep(.0,.08,r))*.6);
 `;
 if(kind==='wood')extra=`
  float grain=artNoise(vec2(vArtLocal.x*5.0,vArtLocal.z*90.0));
  diffuseColor.rgb*=.86+grain*.24;
 `;
 if(kind==='canopy')extra=`
  float leafWash=artFbm(vArtLocal.xz*6.5+vArtLocal.y*vec2(3.1,5.2));
  float stroke=artNoise(vArtLocal.xz*35.0+vArtLocal.y*17.0);
  diffuseColor.rgb*=.82+leafWash*.35+smoothstep(.64,.78,stroke)*.10;
 `;
 return injectPaint(m,common+extra,'handpaint-'+kind);
}
export function canopyMaterial(theme){
 const mat=new THREE.MeshBasicMaterial({map:washTexture(theme),color:'#ffffff',transparent:false,alphaToCoverage:true,depthWrite:true,toneMapped:false});
 injectPaint(mat,`
  float softLight=dot(normalize(vArtNormal),normalize(vec3(-.45,.72,.68)));
  diffuseColor.rgb*=mix(.82,1.04,smoothstep(-.85,.85,softLight));
  float coolBase=(1.0-smoothstep(-.65,.25,vArtLocal.y))*.09;
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.94,.97,1.055),coolBase);
 `,'gouache-crown-'+theme);
 const compile=mat.onBeforeCompile;
 mat.onBeforeCompile=shader=>{
  compile(shader);
  shader.vertexShader='varying vec3 vCrownFacing;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCrownFacing=normalize(normalMatrix*normal);');
  shader.fragmentShader='varying vec3 vCrownFacing;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`
   float crownFacing=abs(normalize(vCrownFacing).z);
   float edgeBristle=artNoise(vArtLocal.xy*51.0+vArtLocal.z*13.0);
   float crownCoverage=smoothstep(.015,.11,crownFacing+(edgeBristle-.5)*.09);
   diffuseColor.a*=crownCoverage;
   if(diffuseColor.a<.035)discard;
   #include <alphatest_fragment>`);
 };
 return mat;
}
export function animalMaterials(type,{young=false}={}){
 const palettes={
  frog:{body:'#79ad37',detail:'#a3bf58',accent:'#d9cb82'},
  duck:{body:'#f4ebd8',detail:'#84522f',accent:'#ce893d'},
  rabbit:{body:'#e3d3b6',detail:'#c5ad91',accent:'#ce9c91'},
  lily:{body:'#edb2b7',detail:'#6a9444',accent:'#dfb951'}
 };
 const p=young?{body:'#dfc264',detail:'#ac8848',accent:'#c68e3c'}:palettes[type];
 return {m:paintMaterial(p.body,{kind:type==='frog'?'frog':type==='duck'&&!young?'duck':'plain'}),shaded:paintMaterial(p.detail,{kind:type==='lily'?'leaf':'plain'}),eyeMat:paintMaterial('#342e22'),accent:paintMaterial(p.accent),cream:paintMaterial('#fff2df')};
}
function oval(parent,mat,pos,scale,geometry){const m=new THREE.Mesh(geometry||new THREE.SphereGeometry(1,16,12),mat);m.position.set(...pos);m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function rngFactory(s){return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
const sphere=new THREE.SphereGeometry(1,16,12);sphere.userData.shared=true;
function bladeGeometry(){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,0,.5,0,0,-.32,.55,.06,.32,.55,.06,.15,1,.21],3));g.setIndex([0,1,2,1,3,2,2,3,4]);g.computeVertexNormals();return g;
}
function swayingMaterial(color){
 const m=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.70,alphaTest:.045,toneMapped:false});
 m.onBeforeCompile=s=>{s.uniforms.uWindTime=clockUniform;s.vertexShader='uniform float uWindTime;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x+=sin(uWindTime*.65+instanceMatrix[3].x*2.0+instanceMatrix[3].z)*position.y*position.y*.095;');};
 m.customProgramCacheKey=()=> 'quiet-reed-wind';return m;
}
export function buildLandscape(scene,model=terrain){
 const terrainPaint=new TerrainPaint(model);
 const random=rngFactory(61542),group=new THREE.Group();scene.add(group);
 const floorMat=new THREE.MeshBasicMaterial({color:'#eee9dc',toneMapped:false});
 injectPaint(floorMat,`float paperGrain=artHash(floor(vArtWorld.xz*250.0));float fiber=artNoise(vArtWorld.xz*vec2(42.0,380.0));diffuseColor.rgb*=.985+paperGrain*.018+fiber*.006;`,'parchment');
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(180,180),floorMat);floor.rotation.x=-Math.PI/2;floor.position.y=-.025;group.add(floor);
 const lawn=new THREE.Shape();
 for(let c=0;c<4;c++){
  const corners=[[-7.05,-5.1],[7.05,-5.1],[7.05,5.1],[-7.05,5.1]],p=corners[c],q=corners[(c+1)%4];
  for(let i=0;i<70;i++){const t=i/70,x=p[0]+(q[0]-p[0])*t,z=p[1]+(q[1]-p[1])*t,w=.04*Math.sin(i*3.4+c*11);if(!c&&!i)lawn.moveTo(x,-z);else lawn.lineTo(x+(c%2?w:0),-z+(c%2?0:w));}
 }
 lawn.closePath();
 const grassMat=new THREE.MeshBasicMaterial({color:'#ffffff',map:washTexture('meadow'),toneMapped:false,transparent:true,alphaTest:.008});
 injectPaint(grassMat,`
  vec2 p=vArtWorld.xz;
  float broad=artFbm(p*.55+vec2(4.1,7.3));
  diffuseColor.rgb*=.975+broad*.045;
  float margin=min(7.03-abs(p.x),5.1-abs(p.y));
  float wetEdge=artFbm(p*3.5)*.17+artNoise(p*23.0)*.065;
  float coverage=smoothstep(.0,.24,margin+wetEdge-.13);
  float tooth=artHash(floor(p*370.0));
  coverage=clamp(coverage+(tooth-.5)*.22*(1.0-coverage),0.0,1.0);
  diffuseColor.rgb=mix(vec3(.854,.815,.716),diffuseColor.rgb,coverage);
 `,'brushed-meadow-v2');
 terrainPaint.attach(grassMat,'land');
 const landGeometry=new THREE.ShapeGeometry(lawn,100);projectedUV(landGeometry);
 const land=new THREE.Mesh(landGeometry,grassMat);land.rotation.x=-Math.PI/2;land.position.y=.165;land.renderOrder=-30;group.add(land);
 const shadowMat=terrainPaint.attach(new THREE.ShadowMaterial({color:'#776d87',opacity:.24,transparent:true,depthWrite:false}),'shadow');
 const shadowWash=new THREE.Mesh(landGeometry,shadowMat);
 shadowWash.rotation.x=-Math.PI/2;shadowWash.position.y=.166;shadowWash.receiveShadow=true;shadowWash.renderOrder=-29;group.add(shadowWash);
 const waterMat=new THREE.MeshBasicMaterial({color:'#ffffff',map:washTexture('water'),toneMapped:false,transparent:true,depthWrite:false});
 injectPaint(waterMat,`float milk=artFbm(vArtWorld.xz*.65+vec2(4.0,2.7));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.64,.72,.75),smoothstep(.57,.76,milk)*.07);`,'water-washes');
 terrainPaint.attach(waterMat,'water');
 const water=new THREE.Mesh(landGeometry,waterMat);water.rotation.x=-Math.PI/2;water.position.y=.13;water.renderOrder=-31;group.add(water);
 const wood=[paintMaterial('#93613b',{kind:'wood'}),paintMaterial('#a47447',{kind:'wood'}),paintMaterial('#b1814d',{kind:'wood'})];
 const landing=new THREE.Group();landing.position.set(3.75,.23,2.55);landing.rotation.y=-.61;group.add(landing);
 for(let i=0;i<11;i++){
  const plank=new THREE.Mesh(new THREE.BoxGeometry(.73,.055,.14),wood[i%3]);plank.position.set((random()-.5)*.026,Math.sin(i*.8)*.008,(i-5)*.15);plank.rotation.y=(random()-.5)*.025;plank.castShadow=true;plank.receiveShadow=true;landing.add(plank);
 }
 for(const x of [-.34,.34])for(const z of [-.6,.6]){const post=new THREE.Mesh(new THREE.CylinderGeometry(.025,.032,.40,7),wood[0]);post.position.set(x,-.065,z);post.castShadow=true;landing.add(post);}
 const blade=bladeGeometry();blade.userData.shared=true;
 const grassBladeMat=terrainPaint.attach(swayingMaterial('#d4dca6'));
 const shortGrass=new THREE.InstancedMesh(blade,grassBladeMat,3600);
 const dummy=new THREE.Object3D(),color=new THREE.Color();let shortCount=0;
 const shoreLayers=[];
 function refreshShore(now,instant=false){
  for(const layer of shoreLayers){layer.from=layer.opacity;layer.retire=true;layer.start=now;}
  const shore=new THREE.Group();group.add(shore);
  const reedMat=terrainPaint.attach(swayingMaterial('#d6dfae'));
  const stemMat=terrainPaint.attach(new THREE.MeshStandardMaterial({color:'#597a31',roughness:1,transparent:true,opacity:1,depthWrite:false}));
  const tipMat=terrainPaint.attach(paintMaterial('#845537'));tipMat.transparent=true;tipMat.depthWrite=false;
  const reeds=new THREE.InstancedMesh(blade,reedMat,1600),stems=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,5),stemMat,120),tips=new THREE.InstancedMesh(new THREE.CapsuleGeometry(1,2,3,5),tipMat,120);
  let reedCount=0,stemCount=0;const random=rngFactory(61542);
  for(const p of model.shorePoints().slice(0,210)){
   if(p.x>3.15&&p.x<4.6&&p.z>1.7&&p.z<3.5)continue;
   const height=.25+random()*.38;
   for(let j=0;j<4+Math.floor(random()*4);j++){
    dummy.position.set(p.x+(random()-.5)*.16,.165,p.z+(random()-.5)*.16);dummy.rotation.set(0,random()*Math.PI*2,(random()-.5)*.11);dummy.scale.set(.009+random()*.01,height*(.55+random()*.6),1);dummy.updateMatrix();reeds.setMatrixAt(reedCount,dummy.matrix);color.setHSL(.205+random()*.055,.4+random()*.2,.26+random()*.15);reeds.setColorAt(reedCount++,color);
   }
   if(random()>.48&&stemCount<120){dummy.position.set(p.x,.165+height*.56,p.z);dummy.rotation.set(0,0,(random()-.5)*.08);dummy.scale.set(.007,height*1.12,.007);dummy.updateMatrix();stems.setMatrixAt(stemCount,dummy.matrix);dummy.position.y=.165+height*1.10;dummy.scale.set(.022,.035+random()*.012,.022);dummy.updateMatrix();tips.setMatrixAt(stemCount,dummy.matrix);stemCount++;}
  }
  reeds.count=reedCount;stems.count=stemCount;tips.count=stemCount;shore.add(reeds,stems,tips);
  const mats=[reedMat,stemMat,tipMat];shoreLayers.push({g:shore,mats,base:mats.map(m=>m.opacity),opacity:instant?1:0,from:0,start:instant?now-2:now,retire:false});
  mats.forEach(m=>m.opacity*=instant?1:0);
 }
 for(let i=0;i<1800;i++){
  const x=(random()-.5)*13.6,z=(random()-.5)*9.6;
  if(x>3.6&&x<5.3&&z>2.6)continue;
  if(Math.sin(x*1.3+z*.6)*Math.cos(z*.9-x*.2)<.10)continue;
  dummy.position.set(x,.166,z);dummy.rotation.set(0,random()*6.28,(random()-.5)*.3);dummy.scale.set(.003+random()*.004,.012+random()*.024,1);dummy.updateMatrix();shortGrass.setMatrixAt(shortCount,dummy.matrix);color.setHSL(.19+random()*.065,.42+random()*.25,.33+random()*.14);shortGrass.setColorAt(shortCount++,color);
 }
 shortGrass.count=shortCount;group.add(shortGrass);
 // Flower meadows are concentrated at the outer margins, with quiet stretches between.
 const flowers=new THREE.InstancedMesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({color:'#fff8df',map:flowerTexture(),side:THREE.DoubleSide,transparent:true,alphaTest:.04,opacity:.82,depthWrite:false,toneMapped:false}),2500);
 let flowerCount=0;
 for(let i=0;i<2500;i++){
  const x=(random()-.5)*13.4,z=(random()-.5)*9.6;
  const density=Math.sin(x*1.4+z*.7)*Math.cos(z*1.1-x*.2)*.5+.5;
  if(density<.46||Math.abs(x)<3.6&&Math.abs(z)<3.5||x>4.4&&z>3)continue;
  dummy.position.set(x,.18+random()*.03,z);dummy.rotation.set(-Math.PI/2,0,random()*6.28);const r=.012+random()*.013;dummy.scale.set(r,r,1);dummy.updateMatrix();flowers.setMatrixAt(flowerCount,dummy.matrix);color.set(random()>.3?'#f6d579':random()>.5?'#fff1d1':'#e8c7c7');flowers.setColorAt(flowerCount++,color);
 }
 terrainPaint.attach(flowers.material);flowers.count=flowerCount;group.add(flowers);
 const drifters=[];
 const petalMat=terrainPaint.attach(new THREE.MeshBasicMaterial({color:'#eeb8ba',transparent:true,opacity:.86,side:THREE.DoubleSide,toneMapped:false}),'water-clip');
 for(let i=0;i<36;i++){
  const p=model.randomPoint('water',random)||{x:0,z:0},x=p.x,z=p.z;
  const m=new THREE.Mesh(new THREE.CircleGeometry(1,7),petalMat);m.rotation.x=-Math.PI/2;m.position.set(x,.143,z);m.scale.set(.025,.012,1);group.add(m);drifters.push({m,x,z,phase:random()*6.28});
 }
 // Painted water dashes are sparse; they never fill the pool with bright sparkles.
 const dashes=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:'#d8e6dc',map:glazeStrokeTexture(),transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}),21);
 terrainPaint.attach(dashes.material,'water-clip');group.add(dashes);
 function refreshWaterMarks(){
  for(const p of drifters){const spot=model.randomPoint('water',random)||{x:0,z:0};p.x=spot.x;p.z=spot.z;}
  for(let i=0;i<21;i++){const p=model.randomPoint('water',random)||{x:0,z:0};dummy.position.set(p.x,.142,p.z);dummy.rotation.set(-Math.PI/2,0,random()*6.28);dummy.scale.set(.18+random()*.28,.10,1);dummy.updateMatrix();dashes.setMatrixAt(i,dummy.matrix);}dashes.instanceMatrix.needsUpdate=true;
 }


 const fish=[];
 for(let i=0;i<3;i++){
  const g=new THREE.Group();group.add(g);
  const bodyMat=new THREE.MeshBasicMaterial({color:['#e4b675','#e9ded0','#d8b19f'][i],transparent:true,opacity:.76,depthWrite:false,toneMapped:false});
  const patchMat=new THREE.MeshBasicMaterial({color:i===1?'#ce826b':'#eee3c9',transparent:true,opacity:.78,depthWrite:false,toneMapped:false});
  const finMat=new THREE.MeshBasicMaterial({color:['#c6b98c','#d3c8b1','#c6beb2'][i],transparent:true,opacity:.58,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
  const body=oval(g,bodyMat,[0,0,-.05],[.073,.015,.28],sphere);body.castShadow=false;body.receiveShadow=false;
  for(let j=0;j<2;j++){const p=oval(g,patchMat,[(j?1:-1)*.023,.012,-.14+j*.16],[.045,.007,.065],sphere);p.castShadow=false;p.receiveShadow=false;}
  function fin(vertices){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();const m=new THREE.Mesh(geo,finMat);g.add(m);return m;}
  fin([-.04,0,-.06,-.15,0,.08,-.035,0,.02]);fin([.04,0,-.06,.15,0,.08,.035,0,.02]);
  const tail=fin([0,0,.20,-.105,0,.43,0,0,.35,0,0,.20,0,0,.35,.105,0,.43]);
  for(const mat of [bodyMat,patchMat,finMat])terrainPaint.attach(mat,'water-clip');
  const p=model.randomPoint('water',random);g.position.set(p?.x||0,.145,p?.z||0);g.visible=!!p;fish.push({g,tail,phase:i*2.1+.7,speed:.15+i*.018,angle:i*2.1});
 }
 let lastTime=0;
 function refresh(now=0,instant=false){terrainPaint.set(model,now,instant);refreshShore(now,instant);refreshWaterMarks();}
 refresh(0,true);
 return {refresh,update(t){
  const dt=Math.min(.05,t-lastTime);lastTime=t;clockUniform.value=t;terrainPaint.update(t);
  for(let i=shoreLayers.length-1;i>=0;i--){
   const layer=shoreLayers[i],v=THREE.MathUtils.smoothstep(t-layer.start,.20,1.15);layer.opacity=layer.retire?layer.from*(1-v):v;
   layer.mats.forEach((mat,j)=>mat.opacity=layer.base[j]*layer.opacity);
   if(layer.retire&&v>=1){group.remove(layer.g);layer.g.traverse(o=>{if(o.isMesh&&!o.geometry.userData.shared)o.geometry.dispose();});layer.mats.forEach(m=>m.dispose());shoreLayers.splice(i,1);}
  }
  for(const p of drifters){p.m.position.x=p.x+Math.sin(t*.14+p.phase)*.08;p.m.position.z=p.z+Math.cos(t*.11+p.phase)*.045;p.m.rotation.z=t*.015+p.phase;}
  for(const f of fish){
   if(!model.isWater(f.g.position.x,f.g.position.z)){
    const p=model.randomPoint('water',random);if(!p){f.g.visible=false;continue;}
    if(terrainPaint.uniforms.uTerrainMix.value<.96){f.g.visible=false;continue;}
    f.g.position.x=p.x;f.g.position.z=p.z;f.g.visible=true;
   }
   f.g.visible=true;
   const x=f.g.position.x-Math.sin(f.angle)*dt*f.speed,z=f.g.position.z-Math.cos(f.angle)*dt*f.speed;
   if(model.sample(model.waterDistance,x,z)<-.19){f.g.position.x=x;f.g.position.z=z;}
   else f.angle+=dt*2.5;
   f.g.rotation.y=f.angle;f.tail.rotation.y=Math.sin(t*2.8+f.phase)*.11;
  }
 }};
}
