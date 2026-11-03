// Timings are seconds after release. The silhouette stays at its final scale.
export const APPEARANCE={hold:.32,reveal:.72,settle:.24,strokeHold:.28,strokeFade:.5};
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{const t=clamp(x);return t*t*(3-2*t);};
export function appearanceAt(age){
 const progress=clamp((age-APPEARANCE.hold)/APPEARANCE.reveal);
 return {progress,opacity:smooth(progress/.67),ready:age>=APPEARANCE.hold+APPEARANCE.reveal+APPEARANCE.settle};
}
export function strokeOpacity(age,hold=APPEARANCE.strokeHold){return 1-smooth((age-hold)/APPEARANCE.strokeFade);}
export function prepareRevealMaterial(mat,uniforms){
 mat.transparent=true;mat.depthWrite=false;
 const paintCompile=mat.onBeforeCompile.bind(mat),paintKey=mat.customProgramCacheKey();
 mat.onBeforeCompile=shader=>{
  paintCompile(shader);
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader='varying vec3 vBirthWorld;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBirthWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=`varying vec3 vBirthWorld;
   uniform float uBirthProgress; uniform float uBirthBase; uniform float uBirthHeight;
   float birthHash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
   float birthNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(mix(birthHash(i),birthHash(i+vec3(1,0,0)),f.x),mix(birthHash(i+vec3(0,1,0)),birthHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(birthHash(i+vec3(0,0,1)),birthHash(i+vec3(1,0,1)),f.x),mix(birthHash(i+vec3(0,1,1)),birthHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
  `+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`
   float birthH=clamp((vBirthWorld.y-uBirthBase)/max(.01,uBirthHeight),0.0,1.0);
   float birthN=birthNoise(vBirthWorld*26.0)*.7+birthNoise(vBirthWorld*63.0)*.3;
   float birthThreshold=birthH*.73+birthN*.22;
   float birthCoverage=smoothstep(birthThreshold-.065,birthThreshold+.065,uBirthProgress*1.16-.08);
   if(uBirthProgress>.995)birthCoverage=1.0;
   diffuseColor.a*=birthCoverage;
   if(diffuseColor.a<.008)discard;
   #include <alphatest_fragment>`);
 };
 mat.customProgramCacheKey=()=> paintKey+'-soft-local-reveal-v4';
 return mat;
}
