// One editable surface is shared by rendering, placement, navigation and saves.
export const TERRAIN={width:14.1,depth:10.2,cols:320,rows:232,margin:.30};
export const POND={x:.5,z:.35,rx:4.5,rz:3.2};
export function coastRadius(a){return 1+.055*Math.sin(a*2+.7)+.043*Math.cos(a*3-.5)+.022*Math.sin(a*5);}
export function coastPoint(a,offset=0){const r=coastRadius(a);return {x:POND.x+Math.cos(a)*(POND.rx*r+offset),z:POND.z+Math.sin(a)*(POND.rz*r+offset)};}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dx=TERRAIN.width/(TERRAIN.cols-1),dz=TERRAIN.depth/(TERRAIN.rows-1),count=TERRAIN.cols*TERRAIN.rows;
function segmentDistance(p,a,b){const x=b.x-a.x,z=b.z-a.z,d=x*x+z*z,t=d?clamp(((p.x-a.x)*x+(p.z-a.z)*z)/d,0,1):0;return Math.hypot(p.x-a.x-x*t,p.z-a.z-z*t);}
function insidePolygon(p,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;}
function simplifyStroke(points){
 if(points.length<12)return points;
 const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
 while(stack.length){const [a,b]=stack.pop();let far=-1,d=.025;for(let i=a+1;i<b;i++){const next=segmentDistance(points[i],points[a],points[b]);if(next>d){far=i;d=next;}}if(far>=0){keep.add(far);stack.push([a,far],[far,b]);}}
 return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
export function closesArea(points,radius){
 if(points.length<6)return false;const a=points[0],b=points.at(-1);if(Math.hypot(a.x-b.x,a.z-b.z)>Math.max(.26,radius*1.5))return false;
 let area=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];area+=p.x*q.z-q.x*p.z;}return Math.abs(area)>.35;
}
function pack(mask){const runs=[];for(let i=0;i<count;){if(!mask[i]){i++;continue;}const start=i;while(i<count&&mask[i])i++;runs.push(start,i-start);}return runs;}
function unpack(runs){
 if(!Array.isArray(runs)||runs.length%2||runs.length>count*2)return null;
 const mask=new Uint8Array(count);let end=0;
 for(let i=0;i<runs.length;i+=2){const start=runs[i],length=runs[i+1];if(!Number.isInteger(start)||!Number.isInteger(length)||start<end||length<1||start+length>count)return null;mask.fill(1,start,start+length);end=start+length;}
 return mask;
}
export function validateTerrain(value){return !!value&&value.version===1&&!!unpack(value.water)&&!!unpack(value.paths);}
function distances(mask){
 const d=new Float32Array(count).fill(100),diagonal=Math.hypot(dx,dz),nx=TERRAIN.cols,nz=TERRAIN.rows;
 // Distances to a boundary rather than to cell centers keep the contour smooth.
 for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const i=z*nx+x,v=mask[i];if(x&&v!==mask[i-1]||x<nx-1&&v!==mask[i+1]||z&&v!==mask[i-nx]||z<nz-1&&v!==mask[i+nx])d[i]=Math.min(dx,dz)*.5;}
 for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const i=z*nx+x;let v=d[i];if(x)v=Math.min(v,d[i-1]+dx);if(z)v=Math.min(v,d[i-nx]+dz);if(x&&z)v=Math.min(v,d[i-nx-1]+diagonal);if(x<nx-1&&z)v=Math.min(v,d[i-nx+1]+diagonal);d[i]=v;}
 for(let z=nz-1;z>=0;z--)for(let x=nx-1;x>=0;x--){const i=z*nx+x;let v=d[i];if(x<nx-1)v=Math.min(v,d[i+1]+dx);if(z<nz-1)v=Math.min(v,d[i+nx]+dz);if(x<nx-1&&z<nz-1)v=Math.min(v,d[i+nx+1]+diagonal);if(x&&z<nz-1)v=Math.min(v,d[i+nx-1]+diagonal);d[i]=v;}
 for(let i=0;i<count;i++)if(mask[i])d[i]=-d[i];
 // Smooth the distance field, rather than the picture, to remove grid steps.
 // Placement and navigation use this same contour as the watercolor renderer.
 const temp=new Float32Array(count),smooth=new Float32Array(count),weights=[1,4,6,4,1];
 for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){let v=0;for(let k=-2;k<=2;k++)v+=d[z*nx+clamp(x+k,0,nx-1)]*weights[k+2];temp[z*nx+x]=v/16;}
 for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){let v=0;for(let k=-2;k<=2;k++)v+=temp[clamp(z+k,0,nz-1)*nx+x]*weights[k+2];smooth[z*nx+x]=v/16;}
 return smooth;
}
export class GardenTerrain{
 constructor({empty=false}={}){
  this.water=new Uint8Array(count);this.paths=new Uint8Array(count);this.revision=0;
  if(!empty){
   const path=[{x:3.8,z:2.6},{x:4.3,z:3.15},{x:4.8,z:4.2},{x:5.15,z:5.1}];
   for(let i=0;i<count;i++){
    const p=this.point(i),u=(p.x-POND.x)/POND.rx,v=(p.z-POND.z)/POND.rz;
    this.water[i]=Math.hypot(u,v)<coastRadius(Math.atan2(v,u))?1:0;
    if(!this.water[i]&&path.slice(1).some((q,j)=>segmentDistance(p,path[j],q)<.19))this.paths[i]=1;
   }
  }
  this.rebuild();
 }
 point(i){return {x:(i%TERRAIN.cols)*dx-TERRAIN.width/2,z:Math.floor(i/TERRAIN.cols)*dz-TERRAIN.depth/2};}
 sample(field,x,z){
  if(Math.abs(x)>TERRAIN.width/2||Math.abs(z)>TERRAIN.depth/2)return 4;
  const u=(x+TERRAIN.width/2)/dx,v=(z+TERRAIN.depth/2)/dz,ix=clamp(Math.floor(u),0,TERRAIN.cols-2),iz=clamp(Math.floor(v),0,TERRAIN.rows-2),fx=u-ix,fz=v-iz,i=iz*TERRAIN.cols+ix;
  return (field[i]*(1-fx)+field[i+1]*fx)*(1-fz)+(field[i+TERRAIN.cols]*(1-fx)+field[i+TERRAIN.cols+1]*fx)*fz;
 }
 isWater(x,z){return this.sample(this.waterDistance,x,z)<0;}
 isPath(x,z){return !this.isWater(x,z)&&this.sample(this.pathDistance,x,z)<0;}
 rebuild(){
  this.waterDistance=distances(this.water);this.pathDistance=distances(this.paths);
  this.waterCells=[];this.pathCells=[];
  for(let i=0;i<count;i++){if(this.waterDistance[i]<-.22)this.waterCells.push(i);if(this.paths[i]&&!this.water[i])this.pathCells.push(i);}
 }
 paint(layer,points,radius,{erase=false,fill=true}={}){
  if(!['water','path'].includes(layer)||!Array.isArray(points)||!points.length||points.length>2000||!Number.isFinite(radius)||radius<.08||radius>1.6||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.z)))return false;
  const polygon=layer==='water'&&fill&&closesArea(points,radius),mask=layer==='water'?this.water:this.paths;
  points=simplifyStroke(points);
  const xs=points.map(p=>p.x),zs=points.map(p=>p.z),loX=clamp(Math.floor((Math.min(...xs)-radius+TERRAIN.width/2)/dx),0,TERRAIN.cols-1),hiX=clamp(Math.ceil((Math.max(...xs)+radius+TERRAIN.width/2)/dx),0,TERRAIN.cols-1),loZ=clamp(Math.floor((Math.min(...zs)-radius+TERRAIN.depth/2)/dz),0,TERRAIN.rows-1),hiZ=clamp(Math.ceil((Math.max(...zs)+radius+TERRAIN.depth/2)/dz),0,TERRAIN.rows-1);
  let changed=false;
  // Rasterize each swept segment in its own bounds: long strokes stay inexpensive.
  const touched=new Uint8Array(count);
  if(polygon)for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++){const i=z*TERRAIN.cols+x;if(insidePolygon(this.point(i),points))touched[i]=1;}
  for(let s=0;s<Math.max(1,points.length-1);s++){
   const a=points[s],b=points[Math.min(s+1,points.length-1)];
   const x0=clamp(Math.floor((Math.min(a.x,b.x)-radius+TERRAIN.width/2)/dx),0,TERRAIN.cols-1),x1=clamp(Math.ceil((Math.max(a.x,b.x)+radius+TERRAIN.width/2)/dx),0,TERRAIN.cols-1),z0=clamp(Math.floor((Math.min(a.z,b.z)-radius+TERRAIN.depth/2)/dz),0,TERRAIN.rows-1),z1=clamp(Math.ceil((Math.max(a.z,b.z)+radius+TERRAIN.depth/2)/dz),0,TERRAIN.rows-1);
   for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){const i=z*TERRAIN.cols+x;if(segmentDistance(this.point(i),a,b)<=radius)touched[i]=1;}
  }
  for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++){
   const i=z*TERRAIN.cols+x;if(!touched[i])continue;const p=this.point(i);
   const margin=layer==='water'?.55:.12;
   if(Math.abs(p.x)>TERRAIN.width/2-margin||Math.abs(p.z)>TERRAIN.depth/2-margin)continue;
   if(layer==='path'&&!erase&&this.water[i])continue;
   const value=erase?0:1;if(mask[i]!==value){mask[i]=value;changed=true;}
   if(layer==='water'&&!erase&&this.paths[i]){this.paths[i]=0;changed=true;}
  }
  if(changed){this.revision++;this.rebuild();}return changed;
 }
 toJSON(){return {version:1,water:pack(this.water),paths:pack(this.paths)};}
 restore(data){if(!validateTerrain(data))return false;this.water=unpack(data.water);this.paths=unpack(data.paths);this.revision++;this.rebuild();return true;}
 randomPoint(surface,random=Math.random){const cells=surface==='water'?this.waterCells:this.pathCells;if(!cells.length)return null;return this.point(cells[Math.min(cells.length-1,Math.floor(random()*cells.length))]);}
 nearestLand(x,z,test=()=>true){
  let best=null,bestD=Infinity;
  for(let iz=0;iz<TERRAIN.rows;iz+=2)for(let ix=0;ix<TERRAIN.cols;ix+=2){const i=iz*TERRAIN.cols+ix;if(this.waterDistance[i]<.14)continue;const p=this.point(i),d=Math.hypot(p.x-x,p.z-z);if(d<bestD&&test(p)){best=p;bestD=d;}}
  return best;
 }
 shorePoints(){
  const points=[];
  for(let iz=3;iz<TERRAIN.rows-3;iz+=7)for(let ix=3;ix<TERRAIN.cols-3;ix+=7){
   const i=iz*TERRAIN.cols+ix,d=this.waterDistance[i];if(d<.14||d>.42)continue;
   const p=this.point(i);if(this.isPath(p.x,p.z)||Math.abs(p.x)>6.65||Math.abs(p.z)>4.7)continue;
   const hash=Math.sin(ix*12.9898+iz*78.233)*43758.5453;if(hash-Math.floor(hash)<.24)continue;
   points.push(p);
  }
  return points;
 }
}
export const terrain=new GardenTerrain();
export const inPond=(x,z)=>terrain.isWater(x,z);
