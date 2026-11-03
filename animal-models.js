import * as THREE from 'three';

// Smoothly joined volumes preserve a single low silhouette, with no bead seams.
const cache=new Map();
function ellipsoid(p,c,r){
 const x=p[0]-c[0],y=p[1]-c[1],z=p[2]-c[2];
 const k0=Math.hypot(x/r[0],y/r[1],z/r[2]);
 const k1=Math.hypot(x/(r[0]*r[0]),y/(r[1]*r[1]),z/(r[2]*r[2]));
 return k1<1e-8?-Math.min(...r):k0*(k0-1)/k1;
}
function smoothMin(a,b,k){const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25;}
const forms={
 frog:{bounds:[[-.64,-.035,-.61],[.64,.42,.68]],grid:[42,24,44],blend:.085,parts:[
  [[0,.137,.08],[.365,.137,.40]],
  [[0,.145,-.235],[.325,.127,.245]],
  [[-.278,.062,.24],[.135,.062,.20]],[[.278,.062,.24],[.135,.062,.20]],
  [[-.245,.031,-.30],[.082,.031,.16]],[[.245,.031,-.30],[.082,.031,.16]],
  [[-.173,.239,-.267],[.081,.062,.083]],[[.173,.239,-.267],[.081,.062,.083]]
 ]},
 duck:{bounds:[[-.43,-.025,-.56],[.43,.48,.76]],grid:[34,28,52],blend:.09,parts:[
  [[0,.15,.06],[.29,.15,.45]],[[0,.17,-.24],[.235,.17,.235]],
  [[0,.286,-.33],[.108,.155,.12]],[[0,.215,.47],[.105,.067,.19]]
 ]},
 rabbit:{bounds:[[-.52,-.035,-.66],[.52,.59,.74]],grid:[34,30,48],blend:.1,parts:[
  [[0,.24,.12],[.31,.24,.40]],[[0,.31,-.30],[.205,.175,.235]],
  [[-.235,.105,.23],[.155,.105,.24]],[[.235,.105,.23],[.155,.105,.24]],
  [[-.16,.042,-.29],[.11,.042,.19]],[[.16,.042,-.29],[.11,.042,.19]],
  [[0,.22,.51],[.107,.105,.105]]
 ]},
 canopy:{bounds:[[-1.05,-1,-.9],[1.05,1,.9]],grid:[38,36,36],blend:.10,parts:[
  [[0,0,0],[.50,.61,.43]],[[-.34,.12,.06],[.39,.47,.39]],
  [[.31,.27,.05],[.41,.43,.39]],[[-.22,-.31,.15],[.39,.40,.36]],
  [[.26,-.28,-.07],[.39,.40,.37]],[[.02,.47,-.1],[.39,.36,.36]],
  [[-.1,.05,-.29],[.41,.45,.35]],[[-.45,.04,.10],[.29,.33,.28]],[[.46,-.02,.16],[.27,.31,.30]],[[.05,-.48,.19],[.31,.30,.30]],
  [[-.28,.32,.36],[.28,.28,.27]],[[.27,.29,.37],[.27,.26,.28]],
  [[-.29,-.23,.37],[.28,.30,.27]],[[.27,-.28,.36],[.28,.30,.28]],[[0,.02,.45],[.26,.28,.25]]
 ]}
};
export function silhouetteGeometry(type){
 if(cache.has(type))return cache.get(type);
 const f=forms[type];if(!f)throw new Error(`Unknown silhouette: ${type}`);
 const field=p=>{let d=1e6;for(const [c,r] of f.parts)d=smoothMin(d,ellipsoid(p,c,r),f.blend);return d;};
 const [lo,hi]=f.bounds,[nx,ny,nz]=f.grid;
 const at=(i,j,k)=>(i*(ny+1)+j)*(nz+1)+k;
 const points=[],values=new Float32Array((nx+1)*(ny+1)*(nz+1));
 for(let i=0;i<=nx;i++)for(let j=0;j<=ny;j++)for(let k=0;k<=nz;k++){
  const p=[lo[0]+(hi[0]-lo[0])*i/nx,lo[1]+(hi[1]-lo[1])*j/ny,lo[2]+(hi[2]-lo[2])*k/nz];
  const n=at(i,j,k);points[n]=p;values[n]=field(p);
 }
 const positions=[],normals=[],tetra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
 const normal=p=>{const e=.0005;const n=[0,1,2].map(a=>{const q=p.slice(),r=p.slice();q[a]+=e;r[a]-=e;return field(q)-field(r);});const l=Math.hypot(...n)||1;return n.map(v=>v/l);};
 const cut=(a,b)=>{const t=values[a]/(values[a]-values[b]);return points[a].map((v,i)=>v+(points[b][i]-v)*t);};
 function tri(a,b,c){
  const n=normal(a.map((v,i)=>(v+b[i]+c[i])/3));
  const u=b.map((v,i)=>v-a[i]),v=c.map((w,i)=>w-a[i]);
  const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  if(cross.reduce((sum,w,i)=>sum+w*n[i],0)<0)[b,c]=[c,b];
  for(const p of [a,b,c]){positions.push(...p);normals.push(...normal(p));}
 }
 for(let i=0;i<nx;i++)for(let j=0;j<ny;j++)for(let k=0;k<nz;k++){
  const cube=[at(i,j,k),at(i+1,j,k),at(i+1,j+1,k),at(i,j+1,k),at(i,j,k+1),at(i+1,j,k+1),at(i+1,j+1,k+1),at(i,j+1,k+1)];
  for(const t of tetra){
   const inside=t.map(n=>cube[n]).filter(n=>values[n]<0),outside=t.map(n=>cube[n]).filter(n=>values[n]>=0);
   if(inside.length===1){tri(...outside.map(n=>cut(inside[0],n)));}
   else if(inside.length===3){tri(...inside.map(n=>cut(outside[0],n)));}
   else if(inside.length===2){const [a,b]=inside,[c,d]=outside,p=cut(a,c),q=cut(a,d),r=cut(b,d),s=cut(b,c);tri(p,q,r);tri(p,r,s);}
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();
 geometry.userData.shared=true;cache.set(type,geometry);return geometry;
}
const unitSphere=new THREE.SphereGeometry(1,28,18);unitSphere.userData.shared=true;
function oval(parent,mat,pos,scale){const m=new THREE.Mesh(unitSphere,mat);m.position.set(...pos);m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export function buildAnimal(type,g,m,shaded,eyeMat,accents={}){
 const accent=accents.accent||shaded,cream=accents.cream||m;
 const body=new THREE.Mesh(silhouetteGeometry(type),m);body.castShadow=true;body.receiveShadow=true;g.add(body);
 let head=new THREE.Group(),throat,tongue,ears=[],legs=[],petals=[];g.add(head);
 if(type==='frog'){
  // Tiny pupils sit in the joined eyelids, rather than on two large eyeballs.
  for(const s of [-1,1]){
   oval(head,accent,[s*.174,.270,-.340],[.021,.023,.008]);
   oval(head,eyeMat,[s*.174,.270,-.348],[.014,.015,.008]);
   oval(head,cream,[s*.174-.003,.276,-.355],[.0032,.0032,.002]);
  }
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-.19,.105,-.418),new THREE.Vector3(0,.083,-.462),new THREE.Vector3(.19,.105,-.418)]);
  const mouth=new THREE.Mesh(new THREE.TubeGeometry(curve,24,.0025,5,false),eyeMat);head.add(mouth);
  throat=oval(g,shaded,[0,.091,-.334],[.16,.055,.104]);
  tongue=oval(g,shaded,[0,.095,-.45],[.012,.012,.001]);
 }else if(type==='duck'){
  head.position.set(0,.414,-.38);
  oval(head,shaded,[0,0,0],[.13,.135,.14]);
  oval(head,accent,[0,-.039,-.171],[.083,.022,.112]);
  for(const s of [-1,1]){
   oval(head,eyeMat,[s*.104,.018,-.086],[.012,.014,.01]);
   const wing=oval(g,shaded,[s*.225,.202,.08],[.045,.046,.275]);wing.rotation.z=-s*.12;ears.push(wing);
  }
 }else{
  head.position.set(0,.31,-.3);
  for(const s of [-1,1]){
   const ear=oval(g,m,[s*.088,.60,-.245],[.052,.225,.063]);ear.rotation.x=.2;ear.rotation.z=-s*.11;ears.push(ear);
   oval(ear,accent,[0,0,-.96],[.48,.74,.12]);
   oval(head,eyeMat,[s*.146,.04,-.145],[.013,.015,.01]);
  }
  oval(head,accent,[0,-.04,-.222],[.021,.017,.014]);
 }
 const bounds=new THREE.Box3().setFromObject(g);
 return {body,head,throat,tongue,ears,legs,petals,height:bounds.max.y+.025};
}
