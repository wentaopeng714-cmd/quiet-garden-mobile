import {analyzeStroke} from './gesture.js';
import * as THREE from 'three';
import {buildAnimal} from './animal-models.js';
import {APPEARANCE,appearanceAt,strokeOpacity,prepareRevealMaterial} from './appearance.js';
import {buildLandscape,animalMaterials,inPond} from './art.js';
import {buildGardenObject,INITIAL_PROPS} from './garden-objects.js';
import {CATALOG,isCreature,placementAt,canTravel,newBrain,resetBrain,stepHabitat,supportHeight} from './habitat.js';
import {SAVE_KEY,snapshot,encodeGarden,decodeGarden,EditHistory} from './garden-state.js';
import {terrain} from './terrain.js';
import {deviceLayout,cameraLayout,touchHitScore,canDragSelection,TouchSession} from './mobile-controls.js';

let savedGarden=null;try{savedGarden=decodeGarden(localStorage.getItem(SAVE_KEY));}catch{}
if(savedGarden?.terrain)terrain.restore(savedGarden.terrain);

const scene=new THREE.Scene();scene.background=new THREE.Color('#eee9dc');
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.VSMShadowMap;renderer.localClippingEnabled=true;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;document.body.prepend(renderer.domElement);
const canvas=renderer.domElement,camera=new THREE.PerspectiveCamera();
const cameraOffset=new THREE.Vector3(0,18.6,25.5),look=new THREE.Vector3(0,.3,0),desiredLook=look.clone();let desiredZoom=1;
const coarsePointer=matchMedia('(pointer: coarse)');let viewProfile=null,viewPreset='near',layoutRequest=0;
function updateHomeLabel(){const home=document.querySelector('#home');home.textContent=viewProfile?.mobile&&viewPreset==='overview'?'近景':'全景';home.title=viewProfile?.mobile&&viewPreset==='overview'?'回到适合触控的近景':'查看整个庭院';}
function resize(){
 const width=innerWidth,height=innerHeight,device=deviceLayout(width,height,coarsePointer.matches);
 document.body.classList.toggle('mobile-layout',device.mobile);document.body.classList.toggle('mobile-landscape',device.landscape);
 const dock=document.querySelector('.toolbar').getBoundingClientRect(),hintRect=document.querySelector('#hint').getBoundingClientRect(),contextHeight=document.body.classList.contains('has-selection')?document.querySelector('#context').offsetHeight+8:0;
 document.body.style.setProperty('--dock-height',dock.height+'px');
 const next=cameraLayout(width,height,{coarse:coarsePointer.matches,topReserved:hintRect.bottom+12,bottomReserved:height-dock.top+contextHeight,sideReserved:width-dock.left+12});
 if(!viewProfile){viewPreset=next.mobile?'near':'overview';desiredZoom=next.mobile?next.nearZoom:1;}
 else if(next.mobile!==viewProfile.mobile||next.landscape!==viewProfile.landscape){if(viewPreset==='near')desiredZoom=next.nearZoom;else if(viewPreset==='custom')desiredZoom=THREE.MathUtils.clamp(desiredZoom*next.nearZoom/viewProfile.nearZoom,.85,4.5);}
 else if(viewPreset==='near')desiredZoom=next.nearZoom;
 viewProfile=next;camera.aspect=width/height;camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(next.fieldHeight/(2*cameraOffset.length())));camera.near=.1;camera.far=100;
 camera.setViewOffset(width,height,next.shiftX,next.shiftY,width,height);camera.updateProjectionMatrix();
 renderer.setPixelRatio(Math.min(devicePixelRatio,next.mobile?1.5:2));renderer.setSize(width,height);updateHomeLabel();
}
function requestLayout(){if(layoutRequest)cancelAnimationFrame(layoutRequest);layoutRequest=requestAnimationFrame(()=>{layoutRequest=0;if(gesture||touchSession.navigating)return;resize();});}
function setViewPreset(preset){viewPreset=preset;desiredLook.set(0,.3,0);desiredZoom=preset==='near'&&viewProfile.mobile?viewProfile.nearZoom:1;updateHomeLabel();}
function updateCamera(dt=1){const t=1-Math.exp(-dt*13);look.lerp(desiredLook,t);camera.zoom=THREE.MathUtils.lerp(camera.zoom,desiredZoom,t);camera.position.copy(look).add(cameraOffset);camera.lookAt(look);camera.updateProjectionMatrix();camera.updateMatrixWorld();}
resize();updateCamera();
scene.add(new THREE.HemisphereLight(0xfff9e9,0x8b8195,1.6));
const sun=new THREE.DirectionalLight(0xfff0d5,2.2);sun.position.set(-9,17,7);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-13,right:13,top:13,bottom:-13});sun.shadow.normalBias=.025;sun.shadow.bias=-.00015;sun.shadow.radius=4;sun.shadow.blurSamples=8;sun.shadow.intensity=.45;scene.add(sun);
const sphere=new THREE.SphereGeometry(1,24,16);sphere.userData.shared=true;
function ell(parent,mat,pos,scale){const m=new THREE.Mesh(sphere,mat);m.position.set(...pos);m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
const landscape=buildLandscape(scene),groundY=(x,z)=>inPond(x,z)?.13:.165;
let seed=274;function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
const entities=[],ripples=[],history=new EditHistory();let kind='frog',selected=null,time=0,serial=0,saveDue=0;
const hint=document.querySelector('#hint'),context=document.querySelector('#context'),selectionBox=document.querySelector('#select-box'),saveStatus=document.querySelector('#save-status');
let feedbackUntil=0,statusLabel=null;
const toolHints={frog:'画圈唤出青蛙 · 它会寻找荷叶和石头',duck:'画圈唤出小鸭 · 它会去荷叶旁觅食',rabbit:'在草地画圈唤出小兔 · 它喜欢树荫和花丛',lily:'在水面画圈种荷叶 · 青蛙会来歇脚',tree:'在草地画圈种树 · 小兔会来树荫下休息',flowers:'在草地画圈种花 · 小动物会来闻一闻',rock:'在岸边画圈放石头 · 青蛙会来坐坐',water:'拖动涂水，围一圈成池塘 · 擦去水面可留出小岛',path:'拖动画出小路 · 补画接长，擦去修改边缘'};
const isTerrainTool=()=>kind==='water'||kind==='path';
const brushFits=(p,layer=kind)=>Math.abs(p.x)<7.05-(layer==='water'?.55:.12)&&Math.abs(p.z)<5.1-(layer==='water'?.55:.12);
let brushMode='paint';const brushWidths={water:1.25,path:.65};
const brushSize=document.querySelector('#brush-size'),terrainOptions=document.querySelector('#terrain-options');
function terrainChanged(instant=false){
 landscape.refresh(time,instant);for(const a of entities)if(isCreature(a.type))resetBrain(a,time,rand);
}
function paintTerrain(points,layer=kind,width=brushWidths[layer],mode=brushMode){
 const before=terrain.toJSON();
 if(!terrain.paint(layer,points,width/2,{erase:mode==='erase'})){feedback('这一笔没有改变地形，换一处或调整笔宽试试');return;}
 history.record(before,terrain.toJSON(),'terrain');terrainChanged();markChanged();select(null);
 feedback(mode==='erase'?'轻轻擦去了这一片，等颜色慢慢收回':layer==='water'?'水色正在晕开，岸草会沿新的水边长出来':'小路正在慢慢铺开');
}
function feedback(text,duration=3200){hint.textContent=text;hint.classList.add('feedback');feedbackUntil=performance.now()+duration;}
function updateHistory(){document.querySelector('#undo').disabled=!history.past.length;document.querySelector('#redo').disabled=!history.future.length;}
function markChanged(){saveDue=time+.6;saveStatus.textContent='正在记住…';updateHistory();}
function recordEdit(before,after){history.record(before,after);markChanged();}
function persist(){
 try{localStorage.setItem(SAVE_KEY,encodeGarden(entities));saveStatus.textContent='已记住这座庭院';}
 catch{saveStatus.textContent='本次庭院暂未保存';}
 saveDue=0;
}
function disturbEnvironment(){for(const a of entities)if(isCreature(a.type)&&a.brain?.mode==='idle')a.brain.next=Math.min(a.brain.next,time+1.2+rand()*2);}
function actualSize(type,size=1){return isCreature(type)||type==='lily'?size*.65:size;}
function validSpot(x,z,type=kind,size=actualSize(type),ignoreId=null){return placementAt(type,x,z,size,entities,ignoreId);}
function makeEntity(type,x,z,instant=false,inputSize=1,options={}){
 const size=options.actualSize?inputSize:actualSize(type,inputSize),creature=isCreature(type);
 if(entities.filter(a=>isCreature(a.type)===creature).length>=(creature?45:65)){feedback(creature?'先陪陪庭院里的小生命吧':'给庭院留一点呼吸的空隙吧');return null;}
 const g=new THREE.Group(),variant=options.variant||0;scene.add(g);
 let body,head,throat,tongue,ears=[],legs=[],petals=[],mats,height;
 if(creature||type==='lily'){
  const {m,shaded,eyeMat,accent,cream}=animalMaterials(type,{young:type==='duck'&&size<.52});mats=[m,shaded,eyeMat,accent,cream];
  if(creature){const model=buildAnimal(type,g,m,shaded,eyeMat,{accent,cream});({body,head,throat,tongue,ears,legs,petals}=model);height=model.height;}
  else{
   const pad=new THREE.Shape();pad.moveTo(0,0);for(let i=0;i<=60;i++){const a=.18+i/60*(Math.PI*2-.36);pad.lineTo(Math.sin(a)*.6,Math.cos(a)*.56);}pad.closePath();
   body=new THREE.Mesh(new THREE.ExtrudeGeometry(pad,{depth:.025,bevelEnabled:false,curveSegments:40}),shaded);body.rotation.x=-Math.PI/2;body.position.y=.045;body.castShadow=true;body.receiveShadow=true;g.add(body);
   head=ell(g,accent,[0,.13,0],[.05,.09,.05]);for(let i=0;i<7;i++){const a=i/7*Math.PI*2,p=ell(g,m,[Math.sin(a)*.1,.12,Math.cos(a)*.1],[.045,.14,.065]);p.rotation.z=-Math.sin(a)*.4;p.userData.angle=a;petals.push(p);}height=.35;
  }
 }else{
  const model=buildGardenObject(type,g,{variant});({body,mats,height}=model);
  if(type==='flowers'){
   const pick=new THREE.Mesh(new THREE.CylinderGeometry(.47,.47,.15,12),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false}));pick.position.y=.06;g.add(pick);mats.push(pick.material);
  }
 }
 const y=groundY(x,z),reveal=new THREE.Plane(new THREE.Vector3(0,-1,0),100);
 const birthUniforms={uBirthProgress:{value:instant?1:0},uBirthBase:{value:y},uBirthHeight:{value:height*size}};
 const materialRest=mats.map(mat=>({opacity:mat.opacity,depthWrite:mat.depthWrite,transparent:mat.transparent}));
 mats.forEach(mat=>{prepareRevealMaterial(mat,birthUniforms);mat.clippingPlanes=[reveal];mat.clipShadows=true;});
 const angle=options.angle??(type==='frog'?Math.PI+(rand()-.5)*.5:Math.PI*.65+(rand()-.5)*1.6);
 const a={id:options.id||`garden-${Date.now().toString(36)}-${++serial}`,g,type,body,head,throat,tongue,ears,legs,petals,mats,materialRest,reveal,size,x,z,y,birth:instant?-10:time,angle,targetAngle:angle,state:'idle',progress:0,actionUntil:0,height,birthUniforms,bloom:options.bloom||0,variant,revision:0,ready:instant,dragging:false};
 if(creature)a.brain=newBrain(time,rand);
 g.position.set(x,y,z);g.rotation.y=angle;g.scale.setScalar(size);
 if(throat)a.throatRest=throat.scale.clone();ears.forEach(e=>e.userData.restRotation=e.rotation.clone());
 g.traverse(o=>{if(o.isMesh)o.userData.entity=a;});entities.push(a);return a;
}
function create(type,x,z,size=1){const a=makeEntity(type,x,z,false,size);if(a){recordEdit(null,snapshot(a));disturbEnvironment();}return a;}
function ripple(x,z,size=.25){const m=new THREE.Mesh(new THREE.RingGeometry(.97,1,48),new THREE.MeshBasicMaterial({color:'#f9faf3',transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,groundY(x,z)+.012,z);m.scale.setScalar(size);scene.add(m);ripples.push({m,born:time,size});}
const commands={frog:[['hop','跳一跳'],['catch','捉小虫'],['croak','鼓鼓腮']],duck:[['nibble','觅食'],['preen','理羽毛'],['friend','添小鸭']],rabbit:[['hop','跳一跳'],['nibble','闻一闻'],['rest','歇一会']],lily:[['bloom','开花'],['drift','漂一漂'],['invite','请青蛙']],tree:[['rotate','转一转']],flowers:[['rotate','转一转']],rock:[['rotate','转一转']]};
function select(a){
 if(selected===a)return;selected=a;context.replaceChildren();statusLabel=null;document.body.classList.toggle('has-selection',!!a);
 if(!a){context.style.display='none';selectionBox.style.display='none';requestLayout();return;}
 const info=document.createElement('div');info.className='context-info';context.append(info);
 const label=document.createElement('span');label.className='name';label.textContent=CATALOG[a.type].label;
 info.append(label);statusLabel=document.createElement('span');statusLabel.className='behavior';info.append(statusLabel);
 const close=document.createElement('button');close.className='close-selection';close.textContent='×';close.setAttribute('aria-label','取消选择');close.onclick=()=>select(null);info.append(close);
 for(const [act,name] of [...commands[a.type],['focus','近看'],['remove','移走']]){const button=document.createElement('button');button.textContent=name;button.dataset.act=act;button.onclick=()=>doAction(act);context.append(button);}
 context.style.display='flex';selectionBox.style.display='block';
 requestLayout();
 if(a.type==='lily'&&!inPond(a.x,a.z))feedback('这片荷叶在等水面 · 补画一点水，或把它拖回池塘里');
 else if(['tree','flowers','rock'].includes(a.type)&&inPond(a.x,a.z))feedback('这里变成水面了 · 可拖回岸上，或擦去物件脚下的水');
 else if(!isCreature(a.type))feedback('按住拖动，摆到喜欢的位置 · '+({lily:'青蛙会寻找荷叶',tree:'小兔会寻找树荫',flowers:'小动物会来闻花香',rock:'青蛙会在石头上歇脚'}[a.type]));
}
function removeEntity(a){
 scene.remove(a.g);a.g.traverse(o=>{if(o.isMesh&&!o.geometry.userData.shared)o.geometry.dispose();});a.mats.forEach(m=>m.dispose());
 const index=entities.indexOf(a);if(index>=0)entities.splice(index,1);if(selected===a)select(null);disturbEnvironment();
}
function focus(a){viewPreset='custom';desiredLook.set(a.x,.3,a.z);desiredZoom=viewProfile.mobile?Math.min(4.5,viewProfile.nearZoom*1.7):2.8;updateHomeLabel();}
function doAction(act){
 const a=selected;if(!a||!a.ready)return;
 if(act==='focus'){focus(a);return;}
 if(act==='remove'){const before=snapshot(a);removeEntity(a);recordEdit(before,null);return;}
 if(act==='rotate'){const before=snapshot(a);a.angle+=Math.PI/4;a.targetAngle=a.angle;a.g.rotation.y=a.angle;a.revision++;recordEdit(before,snapshot(a));return;}
 if(act==='bloom'){const before=snapshot(a);a.bloom=a.bloom?0:1;recordEdit(before,snapshot(a));return;}
 if(act==='friend'||act==='invite'){
  if(act==='invite'&&!inPond(a.x,a.z)){feedback('先给荷叶画一点水，青蛙才会过来歇脚');return;}
  const type=act==='invite'?'frog':'duck',size=act==='friend'?.65:1;
  for(const [dx,dz] of (act==='invite'?[[0,0]]:[[.55,.35],[-.55,.35],[.55,-.35]])){
   const p=validSpot(a.x+dx,a.z+dz,type,actualSize(type,size));if(!p.valid)continue;
   const n=create(type,p.x,p.z,size);if(n){if(act==='invite')n.brain.next=time+1.5;ripple(n.x,n.z);}return;
  }
  feedback('给它旁边留一点空隙吧');return;
 }
 if(a.type==='lily'){a.driftBefore=snapshot(a);}else resetBrain(a,time,rand);
 a.state=act;a.progress=0;a.actionUntil=time+({hop:.85,catch:1.15,croak:2.6,nibble:2.6,preen:3,rest:5,drift:4}[act]||2);
}
function applyHistory(edit){
 if(!edit)return;
 if(edit.kind==='terrain'){terrain.restore(edit.value);terrainChanged();markChanged();return;}
 const existing=entities.find(a=>a.id===edit.id),s=edit.value;
 if(!s){if(existing)removeEntity(existing);}
 else if(existing){Object.assign(existing,{x:s.x,z:s.z,size:s.size,angle:s.angle,targetAngle:s.angle,bloom:s.bloom,revision:existing.revision+1,state:'idle',actionUntil:0});existing.y=groundY(s.x,s.z);existing.g.position.set(s.x,existing.y,s.z);existing.g.rotation.y=s.angle;if(isCreature(existing.type))resetBrain(existing,time,rand);}
 else makeEntity(s.type,s.x,s.z,false,s.size,{...s,actualSize:true});
 disturbEnvironment();markChanged();
}
const groups={animals:'frog',garden:'lily',terrain:'water'};let category='animals';
function chooseTool(type){kind=type;groups[category]=type;document.querySelectorAll('[data-kind]').forEach(b=>{const active=b.dataset.kind===kind;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});terrainOptions.hidden=!isTerrainTool();document.body.classList.toggle('editing-terrain',isTerrainTool());if(isTerrainTool())brushSize.value=brushWidths[kind];select(null);stroke.style.stroke='';feedback(toolHints[kind]);requestLayout();}
brushSize.oninput=()=>{if(isTerrainTool())brushWidths[kind]=Number(brushSize.value);};
for(const b of document.querySelectorAll('[data-brush-mode]'))b.onclick=()=>{brushMode=b.dataset.brushMode;document.querySelectorAll('[data-brush-mode]').forEach(k=>k.setAttribute('aria-pressed',String(k===b)));feedback(brushMode==='erase'?'按住擦去当前地形 · 水面和小路分别修改':toolHints[kind]);};
for(const b of document.querySelectorAll('[data-kind]'))b.onclick=()=>chooseTool(b.dataset.kind);
for(const b of document.querySelectorAll('[data-category]'))b.onclick=()=>{
 category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(tab=>tab.setAttribute('aria-selected',String(tab===b)));
 document.querySelectorAll('[data-tools]').forEach(group=>group.hidden=group.dataset.tools!==category);chooseTool(groups[category]);
};
for(const id of ['undo','redo'])document.querySelector('#'+id).onclick=()=>applyHistory(history[id]());
document.querySelector('#home').onclick=()=>setViewPreset(viewProfile.mobile&&viewPreset==='overview'?'near':'overview');
document.querySelector('#zoom-in').onclick=()=>{viewPreset='custom';desiredZoom=Math.min(4.5,desiredZoom*1.25);updateHomeLabel();};
document.querySelector('#zoom-out').onclick=()=>{viewPreset='custom';desiredZoom=Math.max(.85,desiredZoom/1.25);updateHomeLabel();};

const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.165);
function point(x,y){ndc.set(x/innerWidth*2-1,-y/innerHeight*2+1);ray.setFromCamera(ndc,camera);return ray.ray.intersectPlane(plane,new THREE.Vector3());}
function hitAt(x,y){point(x,y);return ray.intersectObjects(entities.filter(a=>a.ready).map(a=>a.g),true)[0]?.object.userData.entity??null;}
const touchBox=new THREE.Box3(),touchCorners=Array.from({length:8},()=>new THREE.Vector3());
function touchHitAt(x,y){
 let best=null,bestScore=Infinity;
 for(const a of entities){
  if(!a.ready)continue;touchBox.setFromObject(a.g);let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(let i=0;i<8;i++){const p=project(touchCorners[i].set(i&1?touchBox.max.x:touchBox.min.x,i&2?touchBox.max.y:touchBox.min.y,i&4?touchBox.max.z:touchBox.min.z));left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);}
  const score=touchHitScore(x,y,{left,right,top,bottom,width:right-left,height:bottom-top});if(score<bestScore){best=a;bestScore=score;}
 }
 return best;
}
function zoomAt(x,y,factor){const anchor=point(x,y);if(!anchor)return;viewPreset='custom';const next=THREE.MathUtils.clamp(desiredZoom*factor,.85,4.5),ratio=desiredZoom/next;desiredLook.x=anchor.x+(desiredLook.x-anchor.x)*ratio;desiredLook.z=anchor.z+(desiredLook.z-anchor.z)*ratio;desiredZoom=next;updateHomeLabel();}
function navigateTouch(change){
 if(change.blocked)return;const anchor=point(change.previous.x,change.previous.y);if(!anchor)return;
 viewPreset='custom';desiredZoom=THREE.MathUtils.clamp(desiredZoom*change.scale,.85,4.5);updateCamera(1);
 const under=point(change.next.x,change.next.y);if(under){desiredLook.x=THREE.MathUtils.clamp(desiredLook.x+anchor.x-under.x,-6.4,6.4);desiredLook.z=THREE.MathUtils.clamp(desiredLook.z+anchor.z-under.z,-4.6,4.6);}updateCamera(1);updateHomeLabel();
}
canvas.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.clientX,e.clientY,Math.exp(-e.deltaY*.0015));},{passive:false});canvas.addEventListener('contextmenu',e=>e.preventDefault());
const marker=new THREE.Mesh(new THREE.RingGeometry(.94,1,64),new THREE.MeshBasicMaterial({color:'#71885b',transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}));marker.rotation.x=-Math.PI/2;marker.visible=false;scene.add(marker);
function showMarker(x,z,r,valid){marker.visible=true;marker.position.set(x,groundY(x,z)+.018,z);marker.scale.setScalar(Math.max(.22,r));marker.material.color.set(valid?'#71885b':'#b88e7c');}
let gesture=null,spaceDown=false,panLast=null,lastTap=null,markerUntil=0;
const touchSession=new TouchSession(),stroke=document.querySelector('#stroke');let fading=null;
function clearStroke(hold=0){fading={at:performance.now(),hold};}
function cancelGesture(){
 if(gesture?.hit){const a=gesture.hit;a.dragging=false;if(gesture.dragging){const s=gesture.before;Object.assign(a,{x:s.x,z:s.z,y:groundY(s.x,s.z)});a.g.position.set(a.x,a.y,a.z);}}
 gesture=null;marker.visible=false;panLast=null;clearStroke();
}
canvas.addEventListener('pointerdown',e=>{
 canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
 if(e.pointerType==='touch'){e.preventDefault();if(touchSession.down(e.pointerId,e.clientX,e.clientY)==='navigate'){cancelGesture();return;}}
 if(e.button===1||e.button===2||spaceDown){panLast={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.style.cursor='grabbing';return;}
 if(e.button!==0)return;const editing=isTerrainTool(),direct=editing?null:hitAt(e.clientX,e.clientY),hit=direct||(!editing&&e.pointerType==='touch'?touchHitAt(e.clientX,e.clientY):null),p=point(e.clientX,e.clientY);
 gesture={id:e.pointerId,pts:[[e.clientX,e.clientY]],hit,offset:hit&&p?{x:hit.x-p.x,z:hit.z-p.z}:null,before:hit?snapshot(hit):null,dragging:false,touch:e.pointerType==='touch',softHit:!!hit&&!direct,wasSelected:hit===selected,started:performance.now(),terrainLayer:editing?kind:null,worlds:p?[{x:p.x,z:p.z}]:[],width:brushWidths[kind],mode:brushMode};
 if(editing)select(null);
 if(hit)hit.dragging=true;
 fading=null;stroke.style.opacity=1;stroke.setAttribute('d','');
});
canvas.addEventListener('pointermove',e=>{
 if(e.pointerType==='touch'){e.preventDefault();if(!touchSession.points.has(e.pointerId))return;const change=touchSession.move(e.pointerId,e.clientX,e.clientY);if(touchSession.navigating){if(change)navigateTouch(change);return;}}
 if(panLast?.id===e.pointerId){const before=point(panLast.x,panLast.y),after=point(e.clientX,e.clientY);if(before&&after){viewPreset='custom';desiredLook.x=THREE.MathUtils.clamp(desiredLook.x+before.x-after.x,-6.4,6.4);desiredLook.z=THREE.MathUtils.clamp(desiredLook.z+before.z-after.z,-4.6,4.6);updateHomeLabel();}panLast={x:e.clientX,y:e.clientY,id:e.pointerId};return;}
 if(!gesture){
  if(isTerrainTool()){const p=point(e.clientX,e.clientY);if(p){showMarker(p.x,p.z,brushWidths[kind]/2,brushFits(p));markerUntil=time+30;}canvas.style.cursor='crosshair';}
  else{marker.visible=false;canvas.style.cursor=hitAt(e.clientX,e.clientY)?'grab':'crosshair';}return;
 }
 if(gesture.id!==e.pointerId)return;const prev=gesture.pts.at(-1);if(Math.hypot(prev[0]-e.clientX,prev[1]-e.clientY)<2)return;gesture.pts.push([e.clientX,e.clientY]);
 if(gesture.terrainLayer){
  const p=point(e.clientX,e.clientY);if(p){gesture.worlds.push({x:p.x,z:p.z});if(gesture.worlds.length>1500)gesture.worlds=gesture.worlds.filter((_,i)=>i%2===0);showMarker(p.x,p.z,gesture.width/2,brushFits(p,gesture.terrainLayer));}
  stroke.style.stroke=gesture.mode==='erase'?'#fffaf0':gesture.terrainLayer==='water'?'#b4d3d3':'#e3d5b2';stroke.setAttribute('d',gesture.pts.map((p,i)=>(i?'L':'M')+p.join(',')).join(' '));return;
 }
 if(gesture.hit){
  if(Math.hypot(e.clientX-gesture.pts[0][0],e.clientY-gesture.pts[0][1])<(gesture.touch?10:6)&&!gesture.dragging)return;
  if(!canDragSelection({softHit:gesture.softHit,wasSelected:gesture.wasSelected,elapsed:performance.now()-gesture.started})){gesture.hit.dragging=false;gesture.hit=null;}
 }
 if(gesture.hit){
  select(gesture.hit);gesture.dragging=true;const a=gesture.hit,p=point(e.clientX,e.clientY);if(!p)return;
  const x=p.x+gesture.offset.x,z=p.z+gesture.offset.z,spot=validSpot(x,z,a.type,a.size,a.id);gesture.lastSpot=spot;
  showMarker(x,z,CATALOG[a.type].radius*a.size+.12,spot.valid);
  if(spot.valid){a.x=x;a.z=z;a.y=groundY(x,z);a.state='idle';a.actionUntil=0;a.g.position.set(x,a.y,z);}
  canvas.style.cursor='grabbing';return;
 }
 select(null);stroke.setAttribute('d',gesture.pts.map((p,i)=>(i?'L':'M')+p.join(',')).join(' '));
});
canvas.addEventListener('pointerup',e=>{
 if(e.pointerType==='touch'){e.preventDefault();if(touchSession.up(e.pointerId)){gesture=null;clearStroke();marker.visible=false;if(!touchSession.navigating)requestLayout();return;}}
 if(panLast){panLast=null;canvas.style.cursor='crosshair';return;}
 if(!gesture||gesture.id!==e.pointerId)return;const g=gesture;gesture=null;clearStroke();marker.visible=false;canvas.style.cursor='crosshair';requestLayout();
 if(g.terrainLayer){const p=point(e.clientX,e.clientY);if(p)g.worlds.push({x:p.x,z:p.z});paintTerrain(g.worlds,g.terrainLayer,g.width,g.mode);clearStroke(APPEARANCE.strokeHold);return;}
 stroke.style.stroke='';
 if(g.hit){
  const a=g.hit;a.dragging=false;
  if(g.dragging){a.revision++;if(isCreature(a.type))resetBrain(a,time,rand);recordEdit(g.before,snapshot(a));disturbEnvironment();if(g.lastSpot&&!g.lastSpot.valid)feedback(g.lastSpot.reason);else feedback('摆好了，静静看看谁会过来');}
  select(a);if(!g.dragging&&lastTap?.a===a&&performance.now()-lastTap.at<350)focus(a);lastTap={a,at:performance.now()};return;
 }
 const result=analyzeStroke(g.pts);if(result.type==='tap'){select(null);return;}if(result.type!=='circle'){feedback('顺手绕回来，围成一个小圈就好');return;}
 const p=point(result.x,result.y);if(!p)return;
 const worlds=g.pts.map(p=>point(p[0],p[1])).filter(Boolean),wx=Math.max(...worlds.map(p=>p.x))-Math.min(...worlds.map(p=>p.x)),wz=Math.max(...worlds.map(p=>p.z))-Math.min(...worlds.map(p=>p.z));
 const size=THREE.MathUtils.clamp(Math.sqrt(wx*wz)/(kind==='tree'?1.7:kind==='lily'?1.1:1),kind==='tree'?.55:.65,kind==='tree'?1.25:1.5);
 const spot=validSpot(p.x,p.z,kind,actualSize(kind,size));if(!spot.valid){feedback(spot.reason);return;}
 const a=create(kind,p.x,p.z,size);if(a){clearStroke(APPEARANCE.strokeHold);feedback('');}
});
function cancelPointer(e){if(touchSession.points.has(e.pointerId))touchSession.up(e.pointerId);if(gesture?.id===e.pointerId)cancelGesture();if(panLast?.id===e.pointerId)panLast=null;if(!touchSession.navigating)requestLayout();}
canvas.addEventListener('pointercancel',cancelPointer);canvas.addEventListener('lostpointercapture',cancelPointer);
canvas.addEventListener('dblclick',e=>{const a=hitAt(e.clientX,e.clientY);if(a){select(a);focus(a);}});
canvas.addEventListener('pointerleave',()=>{if(!gesture)marker.visible=false;});
canvas.tabIndex=0;canvas.setAttribute('aria-label','庭院画布：单指画圈或拖放，双指移动与缩放；地形画笔拖动绘制；方向键移动落点，回车落笔；选中后方向键移动、R旋转，Esc取消');
let cursor={x:0,z:4};
canvas.addEventListener('keydown',e=>{
 if(e.ctrlKey||e.metaKey)return;
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter','Escape','0','r','R'].includes(e.key))e.preventDefault();
 if(e.key===' ')spaceDown=true;
 const dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,dz=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;
 if(dx||dz){
  if(selected){const a=selected,before=snapshot(a),step=e.shiftKey?.4:.2,p=validSpot(a.x+dx*step,a.z+dz*step,a.type,a.size,a.id);if(p.valid){a.x=p.x;a.z=p.z;a.y=groundY(a.x,a.z);a.g.position.set(a.x,a.y,a.z);a.revision++;if(isCreature(a.type))resetBrain(a,time,rand);recordEdit(before,snapshot(a));disturbEnvironment();}else feedback(p.reason);}
  else{cursor.x=THREE.MathUtils.clamp(cursor.x+dx*.4,-6.4,6.4);cursor.z=THREE.MathUtils.clamp(cursor.z+dz*.4,-4.5,4.5);showMarker(cursor.x,cursor.z,isTerrainTool()?brushWidths[kind]/2:.35,isTerrainTool()||validSpot(cursor.x,cursor.z).valid);markerUntil=time+2;}
 }
 if(e.key==='Enter'){
  if(isTerrainTool()){paintTerrain([{...cursor}]);marker.visible=false;return;}
  const p=validSpot(cursor.x,cursor.z);if(p.valid){
   const cue=Array.from({length:45},(_,i)=>{const a=i/44*Math.PI*2;return project(new THREE.Vector3(p.x+Math.cos(a)*.36,groundY(p.x,p.z)+.005,p.z+Math.sin(a)*.36));});
   stroke.setAttribute('d',cue.map((p,i)=>(i?'L':'M')+p.x+','+p.y).join(' '));stroke.style.opacity=1;clearStroke(APPEARANCE.strokeHold);marker.visible=false;const a=create(kind,p.x,p.z);if(a)select(a);
  }else feedback(p.reason);
 }
 if(e.key==='r'||e.key==='R')doAction('rotate');if(e.key==='Escape'){select(null);marker.visible=false;}
 if(e.key==='0')setViewPreset(viewProfile.mobile?'near':'overview');
});
addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||!['z','y'].includes(e.key.toLowerCase())||/INPUT|TEXTAREA/.test(e.target.tagName))return;e.preventDefault();applyHistory(e.shiftKey||e.key.toLowerCase()==='y'?history.redo():history.undo());});
addEventListener('keyup',e=>{if(e.key===' ')spaceDown=false;});
addEventListener('blur',()=>{spaceDown=false;cancelGesture();touchSession.reset();});
addEventListener('resize',()=>{cancelGesture();touchSession.reset();resize();});window.visualViewport?.addEventListener('resize',requestLayout);coarsePointer.addEventListener('change',requestLayout);
addEventListener('pagehide',persist);document.addEventListener('visibilitychange',()=>{if(document.hidden){persist();cancelGesture();touchSession.reset();cancelAnimationFrame(frameId);frameId=null;}else if(frameId===null){previousFrame=0;frameId=requestAnimationFrame(animate);}});
const saved=savedGarden;
if(saved){for(const o of saved.objects)makeEntity(o.type,o.x,o.z,true,o.size,{...o,actualSize:true});saveStatus.textContent='已恢复你的庭院';}
else{
 for(const o of INITIAL_PROPS)makeEntity(o.type,o.x,o.z,true,o.size,o);
 makeEntity('rabbit',-3.3,2.9,true,.9);makeEntity('frog',4.7,2.1,true,1.1);makeEntity('duck',-.9,.9,true);makeEntity('duck',.4,-1.3,true,.95);
 makeEntity('lily',2,-.7,true,1.25);makeEntity('lily',-.8,-1.1,true,1.05);makeEntity('lily',-2.7,.95,true,1.05,{bloom:1});makeEntity('lily',-1.9,1.5,true,1.24);makeEntity('lily',2.8,1.7,true,1.1);persist();
}
updateHistory();
const box=new THREE.Box3(),corners3=Array.from({length:8},()=>new THREE.Vector3());
function project(p){const v=p.clone().project(camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};}
function updateContext(){
 if(!selected||gesture?.dragging||!selected.ready){context.style.visibility='hidden';selectionBox.style.visibility='hidden';return;}
 context.style.visibility='visible';selectionBox.style.visibility='visible';
 if(statusLabel){const text=selected.brain?.note||'拖动摆放';if(statusLabel.textContent!==text)statusLabel.textContent=text;}
 box.setFromObject(selected.g);const xs=[],ys=[];for(let i=0;i<8;i++){corners3[i].set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z);const p=project(corners3[i]);xs.push(p.x);ys.push(p.y);}
 const left=Math.min(...xs)-5,right=Math.max(...xs)+5,top=Math.min(...ys)-5,bottom=Math.max(...ys)+5;if(right<0||left>innerWidth||bottom<0||top>innerHeight){selectionBox.style.visibility='hidden';if(viewProfile.mobile){context.style.left='';context.style.top='';}else context.style.visibility='hidden';return;}
 Object.assign(selectionBox.style,{left:left+'px',top:top+'px',width:right-left+'px',height:bottom-top+'px'});
 if(viewProfile.mobile){context.style.left='';context.style.top='';return;}
 const w=context.offsetWidth,h=context.offsetHeight,x=THREE.MathUtils.clamp((left+right)/2-w/2,10,Math.max(10,innerWidth-w-10));let y=bottom+18;
 if(y+h>innerHeight-130)y=top-h-18;y=THREE.MathUtils.clamp(y,12,Math.max(12,innerHeight-h-130));context.style.left=x+'px';context.style.top=y+'px';
}
function updateLily(a,dt){
 if(a.state==='drift'){
  if(time<a.actionUntil){const nx=a.x+dt*.15,nz=a.z+Math.sin(time)*dt*.07;if(validSpot(nx,nz,a.type,a.size,a.id).valid){a.x=nx;a.z=nz;a.revision++;}}
  else{a.state='idle';if(a.driftBefore){recordEdit(a.driftBefore,snapshot(a));a.driftBefore=null;disturbEnvironment();}}
 }
 a.y=groundY(a.x,a.z);a.g.position.set(a.x,a.y+Math.sin(time*1.2+a.birth)*.008,a.z);
 const t=1-Math.exp(-dt*3.4);
 a.petals.forEach(p=>{const angle=p.userData.angle,opening=a.bloom?1.12:.18,r=a.bloom?.115:.07;p.rotation.x=THREE.MathUtils.lerp(p.rotation.x,Math.cos(angle)*opening,t);p.rotation.z=THREE.MathUtils.lerp(p.rotation.z,-Math.sin(angle)*opening,t);p.position.y=THREE.MathUtils.lerp(p.position.y,a.bloom?.09:.14,t);p.position.x=THREE.MathUtils.lerp(p.position.x,Math.sin(angle)*r,t);p.position.z=THREE.MathUtils.lerp(p.position.z,Math.cos(angle)*r,t);});
 a.head.scale.y=THREE.MathUtils.lerp(a.head.scale.y,a.bloom?.045:.09,t);a.head.position.y=THREE.MathUtils.lerp(a.head.position.y,a.bloom?.10:.15,t);
}
let frameId=null,previousFrame=0,rippleTick=0,lastPeriodicSave=0;
function animate(now=performance.now()){
 frameId=null;if(document.hidden)return;frameId=requestAnimationFrame(animate);
 if(viewProfile.mobile&&previousFrame&&now-previousFrame<1000/30-1)return;
 const dt=previousFrame?Math.min((now-previousFrame)/1000,.05):1/60;previousFrame=now;time+=dt;updateCamera(dt);landscape.update(time);
 // Resolve appearance first, so behaviors only consider fully emerged objects.
 for(const a of entities){
  const birth=appearanceAt(time-a.birth),wasReady=a.ready;a.ready=birth.ready;a.g.scale.setScalar(a.size);
  a.birthUniforms.uBirthProgress.value=birth.progress;a.birthUniforms.uBirthBase.value=a.y;a.birthUniforms.uBirthHeight.value=a.height*a.size;
  a.reveal.constant=birth.ready?100:birth.progress===0?a.y-.08:a.y+a.height*a.size*(birth.progress+.14);
  a.surfaceFade=THREE.MathUtils.lerp(a.surfaceFade??1,a.type==='lily'&&!inPond(a.x,a.z)?.38:1,1-Math.exp(-dt*3));
  a.mats.forEach((m,i)=>{const rest=a.materialRest[i];m.opacity=rest.opacity*birth.opacity*a.surfaceFade;m.depthWrite=(birth.ready?rest.depthWrite:birth.progress>.96&&rest.depthWrite)&&a.surfaceFade>.995;const transparent=!birth.ready||a.surfaceFade<.995||rest.transparent;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}});
  if(!wasReady&&a.ready&&!isCreature(a.type))disturbEnvironment();
 }
 for(const a of entities){
  if(!a.ready||a.dragging){a.g.position.set(a.x,a.y,a.z);continue;}
  if(a.type==='lily'){updateLily(a,dt);continue;}if(!isCreature(a.type)){a.y=THREE.MathUtils.lerp(a.y,groundY(a.x,a.z),1-Math.exp(-dt*3));a.g.position.y=a.y;continue;}
  let height=0,moving=false;
  if(time<a.actionUntil){
   if(a.state==='hop'){a.progress=Math.min(1,a.progress+dt/.85);height=Math.sin(a.progress*Math.PI)*.65;const nx=a.x-Math.sin(a.angle)*dt*.28,nz=a.z-Math.cos(a.angle)*dt*.28;if(canTravel(a.type,nx,nz,entities)){a.x=nx;a.z=nz;}}
  }else{
   const behavior=stepHabitat(a,entities,time,dt,{random:rand,paused:gesture?.hit===a});a.state=behavior.state;height=behavior.height;moving=behavior.moving;
  }
  a.body.scale.y=a.state==='rest'?THREE.MathUtils.lerp(a.body.scale.y,.89,1-Math.exp(-dt*3)):1+Math.sin(time*1.55+a.birth)*.006;
  if(a.state==='hop')a.body.scale.y=1-.055*Math.cos(a.progress*Math.PI*2);
  a.head.rotation.x=a.state==='nibble'?Math.sin(time*3.3)*.16+.19:Math.sin(time*1.5+a.birth)*.02;a.head.rotation.z=a.state==='preen'?Math.sin(time*2)*.5:0;
  if(a.throat){const v=a.state==='croak'?(Math.sin(time*7)*.5+.5):0;a.throat.scale.copy(a.throatRest).multiplyScalar(1+v*.20);}
  if(a.tongue){const phase=time<a.actionUntil?(1.15-(a.actionUntil-time))/1.15:time%1;const v=a.state==='catch'?Math.max(0,Math.sin(phase*Math.PI*2)):0;a.tongue.scale.z=.001+v*.35;a.tongue.position.z=-.45-v*.32;}
  const diff=Math.atan2(Math.sin(a.targetAngle-a.angle),Math.cos(a.targetAngle-a.angle));a.angle+=diff*Math.min(1,dt*3);a.g.rotation.y=a.angle;
  const base=groundY(a.x,a.z)+supportHeight(a,entities);a.y=THREE.MathUtils.lerp(a.y,base,1-Math.exp(-dt*10));
  if(moving&&!inPond(a.x,a.z)&&a.type==='rabbit')height+=Math.max(0,Math.sin(time*5+a.birth))*.018;
  a.g.position.set(a.x,a.y+height*a.size,a.z);for(let i=0;i<a.ears.length;i++)a.ears[i].rotation.x=a.ears[i].userData.restRotation.x+Math.sin(time*1.1+i+a.birth)*.012;
 }
 if(time>rippleTick){rippleTick=time+1;for(const a of entities)if(isCreature(a.type)&&inPond(a.x,a.z)&&a.state==='walk')ripple(a.x,a.z,.12);}
 for(let i=ripples.length-1;i>=0;i--){const r=ripples[i],age=time-r.born;r.m.scale.setScalar(r.size+age*.25);r.m.material.opacity=Math.max(0,.35*(1-age/2));if(age>2){scene.remove(r.m);r.m.geometry.dispose();r.m.material.dispose();ripples.splice(i,1);}}
 if(fading&&!gesture){const opacity=strokeOpacity((performance.now()-fading.at)/1000,fading.hold);stroke.style.opacity=opacity;if(opacity<=0)fading=null;}
 if(marker.visible&&!gesture&&time>markerUntil)marker.visible=false;
 if(feedbackUntil&&performance.now()>feedbackUntil){hint.classList.remove('feedback');hint.textContent=toolHints[kind];feedbackUntil=0;}
 if((saveDue&&time>=saveDue)||time-lastPeriodicSave>12){if(!gesture?.dragging){persist();lastPeriodicSave=time;}}
 updateContext();renderer.render(scene,camera);
}
const layoutObserver=new ResizeObserver(requestLayout);for(const el of [document.querySelector('.toolbar'),context,document.querySelector('.view'),hint])layoutObserver.observe(el);
animate();
