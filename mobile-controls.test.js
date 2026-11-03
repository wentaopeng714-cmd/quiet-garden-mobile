import assert from 'node:assert/strict';
import * as THREE from 'three';
import {deviceLayout,cameraLayout,touchHitScore,canDragSelection,TouchSession} from './mobile-controls.js';
for(const [w,h] of [[320,568],[360,640],[390,844],[430,932],[768,1024],[568,320],[844,390],[932,430],[1280,800]]){
 const top=112,bottom=186,l=cameraLayout(w,h,{topReserved:top,bottomReserved:bottom});
 assert(Number.isFinite(l.fieldHeight)&&l.fieldHeight>0);assert(l.nearZoom>=1&&l.nearZoom<=2.1);
 if(l.mobile){
  const center={x:w/2-l.shiftX,y:h/2-l.shiftY};
  assert(center.x>20&&center.x<w-20);assert(center.y>top&&center.y<h-12);
  if(l.landscape)assert(center.x<w-272,'landscape leaves the right side for the toolbox');
  else assert(center.y<h-bottom,'portrait keeps the scene above the bottom toolbox');
  const camera=new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2*Math.atan(l.fieldHeight/(2*Math.hypot(18.6,25.5)))),w/h,.1,100);
  camera.position.set(0,18.9,25.5);camera.lookAt(0,.3,0);camera.setViewOffset(w,h,l.shiftX,l.shiftY,w,h);camera.updateMatrixWorld();
  const projected=new THREE.Vector3(0,.3,0).project(camera);assert(Math.abs((projected.x+1)*w/2-center.x)<.001);assert(Math.abs((1-projected.y)*h/2-center.y)<.001);
 }
}
assert(!deviceLayout(1280,800).mobile);assert(deviceLayout(932,430).landscape);assert(cameraLayout(390,844).nearZoom>1.8,'portrait starts close enough to play');
assert(cameraLayout(320,568,{bottomReserved:286}).nearZoom<cameraLayout(320,568).nearZoom,'a small phone leaves room for a selection sheet');
const small={left:100,right:110,top:100,bottom:110,width:10,height:10};assert(Number.isFinite(touchHitScore(84,105,small)),'small animals receive a 44-pixel touch area');assert.equal(touchHitScore(60,105,small),Infinity);
assert(!canDragSelection({softHit:true,wasSelected:false,elapsed:100}),'drawing near an unselected object can remain a drawing');assert(canDragSelection({softHit:true,wasSelected:true,elapsed:100}));assert(canDragSelection({softHit:false,wasSelected:false,elapsed:10}));assert(canDragSelection({softHit:true,wasSelected:false,elapsed:300}));
const touch=new TouchSession();assert.equal(touch.down(1,100,100),'draw');assert.equal(touch.move(1,110,100),null);assert.equal(touch.down(2,210,100),'navigate');
const zoom=touch.move(2,260,100);assert.equal(zoom.scale,1.5);assert.equal(zoom.previous.x,160);assert.equal(zoom.next.x,185);
assert(touch.up(2));assert(touch.navigating,'one remaining finger must not paint');assert(touch.move(1,80,150).blocked);
assert.equal(touch.down(3,190,150),'navigate','adding a second finger stays in navigation');assert.equal(touch.move(3,210,150).scale,130/110);
assert(touch.up(1));assert(touch.up(3));assert(!touch.navigating);assert.equal(touch.points.size,0);assert.equal(touch.down(4,50,50),'draw','a fresh gesture can draw after every finger lifts');assert(!touch.up(4));
touch.down(1,0,0);touch.down(2,100,0);touch.down(3,50,50);assert(touch.up(1));assert(touch.move(2,110,0).scale>0,'three-finger interruptions keep a valid navigation baseline');touch.reset();assert.equal(touch.points.size,0);assert(!touch.navigating);
console.log('Phone portrait/landscape framing, 44px touch picking, drag intent and multi-touch interruption checks passed');
