const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function deviceLayout(width,height,coarse=false){
 const mobile=width<=800||(height<=520&&width<=1000)||(coarse&&Math.min(width,height)<=1000);
 return {mobile,landscape:mobile&&width>height};
}
export function cameraLayout(width,height,{coarse=false,topReserved=110,bottomReserved=150,sideReserved=272}={}){
 const {mobile,landscape}=deviceLayout(width,height,coarse),aspect=width/height;
 if(!mobile)return {mobile,landscape,fieldHeight:Math.max(10.05,16.6/aspect),nearZoom:1,shiftX:0,shiftY:0};
 if(landscape){
  const availableWidth=Math.max(260,width-sideReserved-20),availableHeight=Math.max(180,height-topReserved-12);
  return {mobile,landscape,fieldHeight:Math.max(10.05*height/availableHeight,16.6*height/availableWidth),nearZoom:1.28,shiftX:sideReserved/2,shiftY:(12-topReserved)/2};
 }
 const availableHeight=Math.max(190,height-topReserved-bottomReserved),targetZoom=clamp(2.05-(width-390)*.0012,1.45,2.05);
 const nearZoom=Math.min(targetZoom,Math.max(1.25,availableHeight*.92/(width/16.6*8.1)));
 return {mobile,landscape,fieldHeight:Math.max(10.05,16.6/aspect),nearZoom,shiftX:0,shiftY:(bottomReserved-topReserved)/2};
}
export function touchHitScore(x,y,rect,minSize=44){
 const px=Math.max(9,(minSize-rect.width)/2),py=Math.max(9,(minSize-rect.height)/2);
 if(x<rect.left-px||x>rect.right+px||y<rect.top-py||y>rect.bottom+py)return Infinity;
 const dx=Math.max(rect.left-x,0,x-rect.right),dy=Math.max(rect.top-y,0,y-rect.bottom);
 return Math.hypot(dx,dy)+Math.hypot(x-(rect.left+rect.right)/2,y-(rect.top+rect.bottom)/2)*.035;
}
export const canDragSelection=({softHit,wasSelected,elapsed})=>!softHit||wasSelected||elapsed>=280;
function geometry(points){
 if(points.size<2)return null;const [a,b]=[...points.values()];
 return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(8,Math.hypot(a.x-b.x,a.y-b.y))};
}
// Once two fingers take over, every remaining finger belongs to navigation until
// all fingers lift. A pinch can never finish as an accidental paint stroke.
export class TouchSession{
 constructor(){this.points=new Map();this.navigating=false;this.previous=null;}
 down(id,x,y){
  this.points.set(id,{x,y});if(this.navigating||this.points.size>1){this.navigating=true;this.previous=geometry(this.points);return 'navigate';}return 'draw';
 }
 move(id,x,y){
  if(!this.points.has(id))return null;this.points.set(id,{x,y});if(!this.navigating)return null;
  const next=geometry(this.points),previous=this.previous;this.previous=next;
  return previous&&next?{previous,next,scale:next.distance/previous.distance}:{blocked:true};
 }
 up(id){const consumed=this.navigating;this.points.delete(id);if(!this.points.size)this.reset();else this.previous=geometry(this.points);return consumed;}
 reset(){this.points.clear();this.navigating=false;this.previous=null;}
}
