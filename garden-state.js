import {CATALOG} from './habitat.js';
import {terrain,validateTerrain} from './terrain.js';

export const SAVE_KEY='quiet-garden.sandbox.v1';
export function snapshot(o){return {id:o.id,type:o.type,x:o.x,z:o.z,size:o.size,angle:o.angle,variant:o.variant||0,bloom:o.bloom||0};}
export function encodeGarden(objects,surface=terrain.toJSON()){return JSON.stringify({version:2,objects:objects.map(snapshot),terrain:surface});}
export function decodeGarden(raw){
 try{
  const data=JSON.parse(raw);if(![1,2].includes(data.version)||!Array.isArray(data.objects)||data.objects.length>110)return null;
  if(data.version===2&&!validateTerrain(data.terrain))return null;
  const seen=new Set();
  for(const o of data.objects){
   if(typeof o.id!=='string'||!o.id||seen.has(o.id)||!Object.hasOwn(CATALOG,o.type)||![o.x,o.z,o.size,o.angle].every(Number.isFinite))return null;
   if(Math.abs(o.x)>6.9||Math.abs(o.z)>4.9||o.size<.2||o.size>1.8||![0,1,2].includes(o.variant||0))return null;
   seen.add(o.id);
  }
  return {objects:data.objects,terrain:data.version===2?data.terrain:null};
 }catch{return null;}
}
// History records the edited object, so undoing a tree move never rewinds animals.
export class EditHistory{
 constructor(limit=80){this.past=[];this.future=[];this.limit=limit;}
 record(before,after,kind='object'){
  if(JSON.stringify(before)===JSON.stringify(after))return;
  this.past.push({id:kind==='terrain'?'terrain':(after||before).id,kind,before:before?structuredClone(before):null,after:after?structuredClone(after):null});
  if(this.past.length>this.limit)this.past.shift();this.future=[];
 }
 undo(){const edit=this.past.pop();if(!edit)return null;this.future.push(edit);return {id:edit.id,kind:edit.kind,value:edit.before};}
 redo(){const edit=this.future.pop();if(!edit)return null;this.past.push(edit);return {id:edit.id,kind:edit.kind,value:edit.after};}
}
