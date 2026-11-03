import * as THREE from 'three';
import {TERRAIN} from './terrain.js';
const RANGE=1.8;
const declarations=`
 varying vec3 vTerrainWorld;
 uniform sampler2D uTerrainOld;
 uniform sampler2D uTerrainNew;
 uniform float uTerrainMix;
 vec2 terrainUV(){return (vTerrainWorld.xz+vec2(7.05,5.1))/vec2(14.1,10.2);}
 vec2 terrainFields(sampler2D field){return (texture2D(field,terrainUV()).rg-.5)*3.6;}
 float terrainWater(float d){return 1.0-smoothstep(-.025,.025,d);}
 float terrainPath(float d){return 1.0-smoothstep(-.045,.09,d);}
 float terrainWaterMix(){vec2 a=terrainFields(uTerrainOld),b=terrainFields(uTerrainNew);return mix(terrainWater(a.r),terrainWater(b.r),uTerrainMix);}
`;
function texture(data){const t=new THREE.DataTexture(data,TERRAIN.cols,TERRAIN.rows,THREE.RGBAFormat);t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;}
function encode(model){const data=new Uint8Array(TERRAIN.cols*TERRAIN.rows*4);for(let i=0;i<model.water.length;i++){data[i*4]=Math.round((THREE.MathUtils.clamp(model.waterDistance[i]/RANGE,-1,1)*.5+.5)*255);data[i*4+1]=Math.round((THREE.MathUtils.clamp(model.pathDistance[i]/RANGE,-1,1)*.5+.5)*255);data[i*4+3]=255;}return data;}
export class TerrainPaint{
 constructor(model){const data=encode(model);this.old=texture(data.slice());this.next=texture(data);this.uniforms={uTerrainOld:{value:this.old},uTerrainNew:{value:this.next},uTerrainMix:{value:1}};this.started=-10;}
 set(model,now=0,instant=false){
  const blend=this.uniforms.uTerrainMix.value,a=this.old.image.data,b=this.next.image.data;
  for(let i=0;i<a.length;i++)a[i]=Math.round(a[i]*(1-blend)+b[i]*blend);
  this.old.needsUpdate=true;this.next.image.data=encode(model);this.next.needsUpdate=true;
  this.started=instant?now-2:now;this.update(now);
 }
 update(now){const t=THREE.MathUtils.clamp((now-this.started-.20)/.95,0,1);this.uniforms.uTerrainMix.value=t*t*(3-2*t);}
 attach(mat,kind='land-clip'){
  const compile=mat.onBeforeCompile.bind(mat),key=mat.customProgramCacheKey();
  mat.onBeforeCompile=s=>{
   compile(s);Object.assign(s.uniforms,this.uniforms);
   s.vertexShader='varying vec3 vTerrainWorld;\n'+s.vertexShader;
   s.vertexShader=s.vertexShader.replace('#include <project_vertex>',`vec4 terrainLocal=vec4(transformed,1.0);
    #ifdef USE_INSTANCING
    terrainLocal=instanceMatrix*terrainLocal;
    #endif
    vTerrainWorld=(modelMatrix*terrainLocal).xyz;
    #include <project_vertex>`);
   s.fragmentShader=declarations+s.fragmentShader;
   let fragment='';
   if(kind==='land'){
    s.uniforms.uShoreColor={value:new THREE.Color('#d6c998')};s.uniforms.uPathColor={value:new THREE.Color('#cabb94')};
    s.fragmentShader='uniform vec3 uShoreColor;uniform vec3 uPathColor;\n'+s.fragmentShader;
    fragment=`vec2 oldField=terrainFields(uTerrainOld),newField=terrainFields(uTerrainNew);
     float waterCover=mix(terrainWater(oldField.r),terrainWater(newField.r),uTerrainMix);
     float edgeNoise=(artNoise(vTerrainWorld.xz*13.0)-.5)*.028;
     float oldShore=(1.0-smoothstep(.02,.23+edgeNoise,oldField.r));
     float newShore=(1.0-smoothstep(.02,.23+edgeNoise,newField.r));
     float shoreCover=mix(oldShore,newShore,uTerrainMix);
     float pathCover=mix(terrainPath(oldField.g),terrainPath(newField.g),uTerrainMix);
     float brushGrain=.97+artNoise(vTerrainWorld.xz*31.0)*.055;
     diffuseColor.rgb=mix(diffuseColor.rgb,uPathColor*brushGrain,pathCover*.94);
     diffuseColor.rgb=mix(diffuseColor.rgb,uShoreColor*brushGrain,shoreCover*.96);
     diffuseColor.a*=1.0-waterCover;
     if(diffuseColor.a<.008)discard;`;
   }else if(kind==='water'){
    s.uniforms.uShallow={value:new THREE.Color('#aed1c2')};s.fragmentShader='uniform vec3 uShallow;\n'+s.fragmentShader;
    fragment=`vec2 oldField=terrainFields(uTerrainOld),newField=terrainFields(uTerrainNew);
     float coverage=mix(1.0-smoothstep(.015,.095,oldField.r),1.0-smoothstep(.015,.095,newField.r),uTerrainMix);
     float wash=artNoise(vTerrainWorld.xz*2.7)*.10;
     float oldShallow=1.0-smoothstep(.06,.72+wash,-oldField.r);
     float newShallow=1.0-smoothstep(.06,.72+wash,-newField.r);
     float shallow=mix(oldShallow,newShallow,uTerrainMix);
     diffuseColor.rgb=mix(diffuseColor.rgb,uShallow,shallow*.88);
     diffuseColor.a*=coverage;if(diffuseColor.a<.008)discard;`;
   }else if(kind==='shadow'){
    s.fragmentShader=s.fragmentShader.replace('opacity * ( 1.0 - getShadowMask() )','opacity * ( 1.0 - getShadowMask() ) * (1.0-terrainWaterMix())');
   }else{
    fragment=`diffuseColor.a*=${kind==='water-clip'?'terrainWaterMix()':'(1.0-terrainWaterMix())'};if(diffuseColor.a<.008)discard;`;
   }
   if(fragment)s.fragmentShader=s.fragmentShader.replace('#include <alphatest_fragment>',fragment+'\n#include <alphatest_fragment>');
  };
  mat.customProgramCacheKey=()=>key+'-editable-terrain-'+kind;return mat;
 }
}
