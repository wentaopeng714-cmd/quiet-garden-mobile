export function analyzeStroke(pts){
 let length=0;for(let i=1;i<pts.length;i++)length+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
 if(length<15)return {type:'tap'};
 let xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),w=right-left,h=bottom-top;
 let gap=Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1]);
 let area=0;for(let i=0;i<pts.length;i++){let p=pts[i],q=pts[(i+1)%pts.length];area+=p[0]*q[1]-q[0]*p[1]}
 if(pts.length<9||w<22||h<18||gap>Math.max(24,Math.hypot(w,h)*.38)||Math.abs(area)/2/(w*h)<.28)return {type:'invalid'};
 return {type:'circle',x:(left+right)/2,y:(top+bottom)/2,width:w,height:h};
}
