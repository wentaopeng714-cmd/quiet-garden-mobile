import {inPond,terrain} from './terrain.js';

export const CATALOG={
 frog:{label:'青蛙',creature:true,radius:.15},duck:{label:'小鸭',creature:true,radius:.17},rabbit:{label:'小兔',creature:true,radius:.17},
 lily:{label:'荷叶',surface:'water',radius:.34},tree:{label:'树',surface:'land',radius:.15},
 flowers:{label:'花丛',surface:'land',radius:.35},rock:{label:'石头',surface:'land',radius:.26}
};
export const isCreature=type=>!!CATALOG[type]?.creature;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function surfaceFits(type,x,z,r=0){
 if(Math.abs(x)+r>6.8||Math.abs(z)+r>4.85)return false;
 const surface=type==='rabbit'?'land':CATALOG[type]?.surface;
 if(!surface)return true;
 for(const [dx,dz] of [[0,0],[r,0],[-r,0],[0,r],[0,-r]]){
  if(inPond(x+dx,z+dz)!==(surface==='water'))return false;
 }
 return true;
}
export function placementAt(type,x,z,size,objects=[],ignoreId=null){
 if(!Object.hasOwn(CATALOG,type)||!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(size))return {valid:false,reason:'换一处空地试试'};
 const radius=CATALOG[type].radius*size;
 if(!surfaceFits(type,x,z,radius))return {valid:false,reason:CATALOG[type].surface==='water'?'荷叶要放在水面里':type==='rabbit'?'给小兔找一块岸上的空地吧':CATALOG[type].surface==='land'?'放在岸上的草地试试':'这里太靠边了'};
 for(const o of objects){
  if(o.id===ignoreId||isCreature(o.type))continue;
  // Canopies and flower patches may overlap; solid bases and pads need a little room.
  const other=CATALOG[o.type].radius*o.size;
  if(o.type==='flowers'||type==='flowers')continue;
  if(type==='frog'&&(o.type==='lily'||o.type==='rock'))continue;
  if(type==='duck'&&o.type==='lily')continue;
  if(distance({x,z},o)<radius+other+.045)return {valid:false,reason:'稍微挪开一点，给彼此留些空隙'};
 }
 return {valid:true,x,z};
}
function obstacleRadius(o){return o.type==='tree'?.115*o.size:o.type==='rock'?.29*o.size:0;}
export function canTravel(type,x,z,objects=[],targetId=null,escapeFrom=null){
 const radius=type==='rabbit'?.12:.09;
 if(!surfaceFits(type,x,z,radius))return false;
 for(const o of objects){
  const r=obstacleRadius(o);if(!r||o.dragging)continue;
  if(type==='frog'&&o.id===targetId&&o.type==='rock')continue;
  const d=Math.hypot(x-o.x,z-o.z);
  if(d<r+radius){
   // A prop may be dropped over an animal. It can gently step out, without
   // treating that solid object as passable on subsequent routes.
   if(!escapeFrom)return false;
   const before=distance(escapeFrom,o);
   if(before>=r+radius||d<=before+1e-7)return false;
  }
 }
 return true;
}
function clearLine(a,b,type,objects,targetId){
 const n=Math.max(1,Math.ceil(distance(a,b)/.10));
 let previous=a;
 for(let i=1;i<=n;i++){const t=i/n,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};if(!canTravel(type,p.x,p.z,objects,targetId,previous))return false;previous=p;}
 return true;
}
// A small navigation grid is only searched when an animal chooses a destination.
// Every segment is also checked, so rabbits cannot cut corners through the pond.
export function findRoute(start,goal,type,objects=[],targetId=null){
 if(!canTravel(type,goal.x,goal.z,objects,targetId))return null;
 if(clearLine(start,goal,type,objects,targetId))return [{...goal}];
 const step=.25,nx=53,nz=39,origin={x:-6.5,z:-4.75},total=nx*nz;
 const pos=i=>({x:origin.x+(i%nx)*step,z:origin.z+Math.floor(i/nx)*step});
 const nearest=p=>{
  const ix=clamp(Math.round((p.x-origin.x)/step),0,nx-1),iz=clamp(Math.round((p.z-origin.z)/step),0,nz-1);
  let best=-1,bestD=Infinity;
  for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
   const x=ix+dx,z=iz+dz;if(x<0||x>=nx||z<0||z>=nz)continue;
   const i=z*nx+x,q=pos(i),d=distance(p,q);
   if(d<bestD&&canTravel(type,q.x,q.z,objects,targetId)&&clearLine(p,q,type,objects,targetId)){best=i;bestD=d;}
  }
  return best;
 };
 const first=nearest(start),last=nearest(goal);if(first<0||last<0)return null;
 const open=new Set([first]),closed=new Uint8Array(total),cost=new Float64Array(total).fill(Infinity),parent=new Int32Array(total).fill(-1);
 cost[first]=0;
 while(open.size){
  let current=-1,best=Infinity;for(const i of open){const f=cost[i]+distance(pos(i),pos(last));if(f<best){best=f;current=i;}}
  if(current===last){
   const path=[{...goal}];for(let i=last;i!==first;i=parent[i])path.push(pos(i));path.push(pos(first));path.reverse();
   const result=[];let anchor=start;
   for(let i=0;i<path.length;){let far=i;while(far+1<path.length&&clearLine(anchor,path[far+1],type,objects,targetId))far++;result.push(path[far]);anchor=path[far];i=far+1;}
   return result;
  }
  open.delete(current);closed[current]=1;const p=pos(current),cx=current%nx,cz=Math.floor(current/nx);
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dz)continue;const x=cx+dx,z=cz+dz;if(x<0||x>=nx||z<0||z>=nz)continue;
   const i=z*nx+x;if(closed[i])continue;const q=pos(i);
   if(!clearLine(p,q,type,objects,targetId))continue;
   const next=cost[current]+distance(p,q);if(next>=cost[i])continue;
   cost[i]=next;parent[i]=current;open.add(i);
  }
 }
 return null;
}
export function newBrain(now=0,random=Math.random){return {mode:'idle',next:now+1.8+random()*2.8,targetId:null,targetRevision:0,terrainRevision:terrain.revision,route:[],activity:'idle',lastTarget:null,note:'四处看看',phase:random()*7};}
export function resetBrain(a,now,random=Math.random){
 const last=a.brain?.lastTarget;a.brain=newBrain(now,random);a.brain.lastTarget=last;a.pad=null;
}
function candidates(a,o){
 if(a.type==='frog'&&o.type==='lily')return [{x:o.x,z:o.z,activity:'perch',note:'去荷叶上歇歇',restNote:'在荷叶上歇脚',weight:1.5}];
 if(a.type==='frog'&&o.type==='rock')return [{x:o.x,z:o.z,activity:'perch',note:'去石头上坐坐',restNote:'坐在石头上',weight:.92}];
 if(o.type==='tree'&&a.type==='rabbit'){
  return [0,.9,-.9,2.2].map(t=>({x:o.x+Math.cos(t+.8)*(.38+.28*o.size),z:o.z+Math.sin(t+.8)*(.38+.28*o.size),activity:'rest',note:'去树荫里歇歇',restNote:'在树荫里打盹',weight:1.3}));
 }
 if(o.type==='flowers'&&['rabbit','frog','duck'].includes(a.type)){
  const angle=Math.atan2(a.z-o.z,a.x-o.x),r=.28+.25*o.size;
  return [{x:o.x+Math.cos(angle)*r,z:o.z+Math.sin(angle)*r,activity:a.type==='frog'?'catch':'nibble',note:a.type==='frog'?'去花边找小虫':'去闻闻花香',restNote:a.type==='frog'?'在花边等小虫':'闻闻花香',weight:a.type==='rabbit'?1.15:.75}];
 }
 if(o.type==='lily'&&a.type==='duck'){
  const angle=Math.atan2(a.z-o.z,a.x-o.x),r=.30+.6*o.size;
  return [{x:o.x+Math.cos(angle)*r,z:o.z+Math.sin(angle)*r,activity:'nibble',note:'去荷叶旁觅食',restNote:'在荷叶旁觅食',weight:1.0}];
 }
 return [];
}
export function chooseInterest(a,objects,random=Math.random){
 const choices=[];
 for(const o of objects){
  if(isCreature(o.type)||o.dragging||o.ready===false||distance(a,o)>8||!surfaceFits(o.type,o.x,o.z,CATALOG[o.type].radius*o.size*.8))continue;
  if(a.type==='frog'&&['lily','rock'].includes(o.type)&&objects.some(other=>other!==a&&other.type==='frog'&&other.brain?.targetId===o.id))continue;
  for(const point of candidates(a,o)){
   const d=distance(a,point);if(!canTravel(a.type,point.x,point.z,objects,o.id))continue;
   const recent=a.brain?.lastTarget===o.id ? .55 : 1;
   choices.push({target:o,point,score:point.weight*recent*(.88+random()*.24)/(1+d*.3)});
  }
 }
 choices.sort((a,b)=>b.score-a.score);
 for(const choice of choices.slice(0,5)){
  const route=findRoute(a,choice.point,a.type,objects,choice.target.id);if(route)return {...choice,route};
 }
 return null;
}
function startWander(a,objects,now,random){
 const b=a.brain;
 if(a.type==='rabbit'&&random()<.65){
  for(let i=0;i<10;i++){const goal=terrain.randomPoint('path',random);if(!goal||distance(a,goal)>2.6)continue;const route=findRoute(a,goal,a.type,objects);if(route){Object.assign(b,{mode:'travel',route,targetId:null,activity:'idle',note:'沿着小路走走'});return;}}
 }
 for(let i=0;i<8;i++){
  const angle=random()*Math.PI*2,r=.65+random()*1.25,goal={x:a.x+Math.cos(angle)*r,z:a.z+Math.sin(angle)*r};
  const route=findRoute(a,goal,a.type,objects);if(!route)continue;
  Object.assign(b,{mode:'travel',route,targetId:null,activity:'idle',note:a.type==='duck'?'慢慢游逛':'四处走走'});return;
 }
 b.mode='idle';b.next=now+2+random()*3;b.note='安静待一会';
}
export function stepHabitat(a,objects,now,dt,{random=Math.random,paused=false}={}){
 if(!a.brain||a.brain.terrainRevision!==terrain.revision)resetBrain(a,now,random);const b=a.brain;
 // Painting water beneath a rabbit gives it a temporary way back to the bank.
 // Normal routes still stay entirely on land.
 if(a.type==='rabbit'&&!surfaceFits('rabbit',a.x,a.z,.12)){
  if(!b.escapeRoute){const goal=terrain.nearestLand(a.x,a.z,p=>canTravel('rabbit',p.x,p.z,objects));b.escapeRoute=goal&&findRoute(a,goal,'duck',objects);}
  b.mode='escape';b.note='去岸上歇歇';
  const route=b.escapeRoute;
  if(!paused&&route?.length){
   while(route.length&&distance(a,route[0])<.04)route.shift();
   if(route.length){const p=route[0],d=distance(a,p),step=Math.min(d,dt*.5),x=a.x+(p.x-a.x)/d*step,z=a.z+(p.z-a.z)/d*step;if(canTravel('duck',x,z,objects,null,a)){a.targetAngle=Math.atan2(-(p.x-a.x),-(p.z-a.z));a.x=x;a.z=z;return {state:'walk',moving:true,height:Math.max(0,Math.sin(now*5))*.035};}}
  }
  return {state:'idle',moving:false,height:0};
 }
 if(b.mode==='escape'){resetBrain(a,now,random);return {state:'idle',moving:false,height:0};}
 const target=b.targetId&&objects.find(o=>o.id===b.targetId);
 if(b.targetId&&(!target||target.dragging||target.revision!==b.targetRevision||!surfaceFits(target.type,target.x,target.z,CATALOG[target.type].radius*target.size*.8)))resetBrain(a,now,random);
 const brain=a.brain;
 if(paused)return {state:brain.mode==='rest'?brain.activity==='perch'?'idle':brain.activity:'idle',moving:false,height:0};
 if(brain.mode==='rest'&&now>=brain.until){
  brain.lastTarget=brain.targetId;brain.targetId=null;brain.mode='idle';brain.next=now+2+random()*3;brain.note='安静待一会';
 }
 if(brain.mode==='idle'&&now>=brain.next){
  const choice=random()<.86?chooseInterest(a,objects,random):null;
  if(choice){
   Object.assign(brain,{mode:'travel',targetId:choice.target.id,targetRevision:choice.target.revision,route:choice.route,activity:choice.point.activity,note:choice.point.note,restNote:choice.point.restNote});
  }else startWander(a,objects,now,random);
 }
 if(brain.mode==='travel'){
  while(brain.route.length&&distance(a,brain.route[0])<.045)brain.route.shift();
  if(!brain.route.length){
   if(brain.targetId)Object.assign(brain,{mode:'rest',until:now+7+random()*7,note:brain.restNote});
   else Object.assign(brain,{mode:'idle',next:now+2.5+random()*3,note:'安静待一会'});
  }else{
   const goal=brain.route[0],d=distance(a,goal),phase=(now+brain.phase)%1.05;
   const hopping=a.type==='frog'&&!inPond(a.x,a.z),pace=hopping?(phase<.58?1.65:0):1;
   const speed=(a.type==='rabbit'?.49:a.type==='frog'?.43:.33)*pace;
   const step=Math.min(d,dt*speed),x=a.x+(goal.x-a.x)/d*step,z=a.z+(goal.z-a.z)/d*step;
   if(step===0)return {state:'idle',moving:false,height:0};
   if(canTravel(a.type,x,z,objects,brain.targetId,a)){
    a.targetAngle=Math.atan2(-(goal.x-a.x),-(goal.z-a.z));
    a.x=x;a.z=z;
    return {state:'walk',moving:step>0,height:hopping&&phase<.58?Math.sin(phase/.58*Math.PI)*.13:0};
   }
   resetBrain(a,now,random);
  }
 }
 const activity=a.brain.mode==='rest'?a.brain.activity:'idle';
 // Short, spaced movements leave long quiet pauses at a chosen place.
 const state=activity==='perch'?'idle':activity==='nibble'?(Math.sin(now*.8+brain.phase)>.15?'nibble':'idle'):activity==='catch'?(Math.sin(now*.6+brain.phase)>.96?'catch':'idle'):activity;
 return {state,moving:false,height:0};
}
export function supportHeight(a,objects){
 if(a.type!=='frog')return 0;
 const support=objects.find(o=>!o.dragging&&o.ready!==false&&['lily','rock'].includes(o.type)&&(o.type!=='lily'||surfaceFits('lily',o.x,o.z,.2*o.size))&&distance(a,o)<(o.type==='lily'?.29:.20)*o.size);
 return support?(support.type==='lily'?.075:.24)*support.size:0;
}
