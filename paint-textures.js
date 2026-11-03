import * as THREE from 'three';

function seeded(seed){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function canvas(size){const c=document.createElement('canvas');c.width=c.height=size;return c;}
function texture(c){const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;}
function brushStamp(ctx,x,y,rx,ry,angle,color,alpha,rnd,bristles=true){
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(rx,ry);
 // A soft loaded center and uneven bristle fringe, rather than a geometric dot.
 const wet=ctx.createRadialGradient(-.16,-.10,.04,0,0,1.12);
 wet.addColorStop(0,color);wet.addColorStop(.60,color);wet.addColorStop(1,'transparent');
 ctx.globalAlpha=alpha;ctx.fillStyle=wet;ctx.beginPath();
 for(let i=0;i<=30;i++){const a=i/30*Math.PI*2,r=.88+rnd()*.18;const px=Math.cos(a)*r,py=Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();
 ctx.globalAlpha=alpha*.26;ctx.strokeStyle=color;ctx.lineCap='round';
 if(bristles)for(let j=0;j<5;j++){const yy=(rnd()-.5)*1.5;ctx.lineWidth=.015+rnd()*.025;ctx.beginPath();ctx.moveTo(-.9+rnd()*.2,yy);ctx.bezierCurveTo(-.3,yy+.03,.4,yy-.03,.85-rnd()*.25,yy);ctx.stroke();}
 ctx.restore();
}
function tooth(ctx,size,rnd,amount=.018){
 const data=ctx.getImageData(0,0,size,size),p=data.data;
 for(let i=0;i<p.length;i+=4){const v=1+(rnd()-.5)*amount;for(let j=0;j<3;j++)p[i+j]*=v;}
 ctx.putImageData(data,0,0);
}
const cache=new Map();
export function washTexture(theme='meadow'){
 if(cache.has(theme))return cache.get(theme);
 const size=theme==='meadow'?1536:1024,c=canvas(size),ctx=c.getContext('2d'),rnd=seeded(theme==='meadow'?832:theme==='water'?211:theme==='pink'?143:491);
 const palettes={
  meadow:{base:'#a9c676',dark:['#8fac65','#98b66b','#adc47f'],light:['#b7cc8d','#c0d096','#a5c478']},
  water:{base:'#7ba8b3',dark:['#6896a6','#7397aa','#799bad','#88adb8'],light:['#a5c4c9','#97bdbd','#bbd1cb','#a8bacb']},
  green:{base:'#85a859',dark:['#648b50','#749754','#7c9b5b','#5f8657'],light:['#aac075','#b5c781','#99b96b','#8cae60']},
  bright:{base:'#96b366',dark:['#7e9e5b','#86a45f','#74995c'],light:['#b8c984','#c0cd92','#a8c179']},
  pink:{base:'#cfa2ae',dark:['#bc90a5','#bc8e9d','#c197ad'],light:['#e6bdc0','#e9c8c5','#dcb2bd','#edcecb']}
 };
 const p=palettes[theme]||palettes.green;ctx.fillStyle=p.base;ctx.fillRect(0,0,size,size);
 // Broad underpainting. The quiet gaps remain visible between brush groups.
 for(let i=0;i<(theme==='meadow'?40:theme==='water'?60:90);i++){
  const x=rnd()*size,y=rnd()*size,r=size*(.07+rnd()*.14),colors=i%2?p.dark:p.light;
  brushStamp(ctx,x,y,r,r*(.5+rnd()*.5),(rnd()-.5)*.8,colors[i%colors.length],theme==='meadow'?.035+rnd()*.04:.055+rnd()*.075,rnd,false);
 }
 if(theme==='water'){
  for(let i=0;i<60;i++){
   const x=rnd()*size,y=rnd()*size,colors=i%3?p.light:p.dark;
   brushStamp(ctx,x,y,size*(.045+rnd()*.15),size*(.006+rnd()*.018),(rnd()-.5)*.075,colors[i%colors.length],.045+rnd()*.04,rnd,false);
  }
  // A handful of pale dragged strokes. Their lengths and spacing are irregular.
  for(let i=0;i<19;i++)brushStamp(ctx,rnd()*size,rnd()*size,size*(.04+rnd()*.11),size*(.001+rnd()*.0025),(rnd()-.5)*.045,'#d7dfd5',.13+rnd()*.11,rnd);
 }else if(theme==='meadow'){
  for(let i=0;i<120;i++){
   const x=rnd()*size,y=rnd()*size;
   if(Math.sin(x/size*8+y/size*3)*Math.cos(y/size*7)<-.15)continue;
   const colors=i%3?p.light:p.dark;
   brushStamp(ctx,x,y,18+rnd()*65,8+rnd()*27,(rnd()-.5)*1.2,colors[i%colors.length],.045+rnd()*.045,rnd,false);
  }
  ctx.lineCap='round';
  for(let i=0;i<2200;i++){
   const x=rnd()*size,y=rnd()*size;
   if(Math.sin(x*.007+y*.002)*Math.cos(y*.009)<.0)continue;
   ctx.globalAlpha=.07+rnd()*.09;ctx.strokeStyle=i%3?'#6e9255':'#e1dca3';ctx.lineWidth=.65+rnd()*.5;
   ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+1.5,y-1,x+1+rnd()*2,y-2-rnd()*3);ctx.stroke();
  }
  ctx.globalAlpha=1;
 }else{
  // Leaf-shaped daubs in a few overlapping sweeps, with dry strokes above them.
  for(let i=0;i<620;i++){
   const x=rnd()*size,y=rnd()*size,colors=i%3?p.light:p.dark;
   const direction=-.6+Math.sin(y/size*5)*.4;
   brushStamp(ctx,x,y,10+rnd()*35,6+rnd()*19,direction+(rnd()-.5)*.7,colors[i%colors.length],.12+rnd()*.16,rnd,false);
  }
  for(let i=0;i<900;i++){
   const x=rnd()*size,y=rnd()*size;
   if(rnd()>.7)continue;
   brushStamp(ctx,x,y,2+rnd()*8,1+rnd()*2,-.45+(rnd()-.5)*.5,p.light[i%p.light.length],.09+rnd()*.12,rnd);
  }
 }
 tooth(ctx,size,rnd,theme==='meadow'?.025:.018);
 const t=texture(c);cache.set(theme,t);return t;
}
export function flowerTexture(){
 if(cache.has('flower'))return cache.get('flower');
 const c=canvas(128),ctx=c.getContext('2d'),rnd=seeded(204);
 for(let i=0;i<5;i++){const a=i/5*Math.PI*2;brushStamp(ctx,64+Math.cos(a)*22,64+Math.sin(a)*22,26,18,a,'#fffdf4',.95,rnd);}
 brushStamp(ctx,64,64,10,10,0,'#f3d28d',1,rnd);
 const t=texture(c);cache.set('flower',t);return t;
}
export function projectedUV(geometry,{spherical=false}={}){
 if(geometry.userData.paintUV)return;
 const a=geometry.attributes.position,uv=new Float32Array(a.count*2);
 for(let i=0;i<a.count;i++){
  const x=a.getX(i),y=a.getY(i),z=a.getZ(i);
  if(spherical){uv[i*2]=Math.atan2(z,x)/(Math.PI*2)+.5;uv[i*2+1]=1-Math.acos(THREE.MathUtils.clamp(y/Math.hypot(x,y,z),-1,1))/Math.PI;}
  else{uv[i*2]=(x+7.05)/14.1;uv[i*2+1]=(y+5.1)/10.2;}
 }
 if(spherical&&!geometry.index){for(let i=0;i<a.count;i+=3){const us=[uv[i*2],uv[(i+1)*2],uv[(i+2)*2]];if(Math.max(...us)-Math.min(...us)>.5)for(let j=0;j<3;j++)if(uv[(i+j)*2]<.5)uv[(i+j)*2]+=1;}}
 geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.userData.paintUV=true;
}
export function glazeStrokeTexture(){
 if(cache.has('waterstroke'))return cache.get('waterstroke');
 const c=canvas(256),ctx=c.getContext('2d'),rnd=seeded(118);
 brushStamp(ctx,128,128,114,9,.006,'#ffffff',.85,rnd);
 const t=texture(c);cache.set('waterstroke',t);return t;
}
