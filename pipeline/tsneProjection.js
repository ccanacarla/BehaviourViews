/** Port of sklearn TSNE's default recipe used by notebook 03_01:
 * perplexity=30, random_state=42, method='barnes_hut', angle=0.5,
 * init='pca', learning_rate='auto', early_exaggeration=12, max_iter=1000.
 * The approximation and floating-point arithmetic are not bit-identical to
 * sklearn's Cython/OpenMP implementation, but no algorithmic defaults are
 * intentionally changed. Input: ROW-NORMALIZED Markov transition matrices.
 */
import {projectPCA} from './projection.js';
const yieldUI=()=>new Promise(r=>setTimeout(r,0));
const EPS=Number.EPSILON;

function probabilities(vectors, perplexity){
  const n=vectors.length, neighborCount=Math.min(n-1,Math.floor(3*perplexity+1));
  const lists=Array.from({length:n},()=>[]);
  for(let i=0;i<n;i++){
    const neighbors=[];
    for(let j=0;j<n;j++)if(i!==j){
      let d=0;for(let a=0;a<vectors[i].length;a++){
        const diff=vectors[i][a]-vectors[j][a];d+=diff*diff;
      }
      neighbors.push({j,d:Math.fround(d)});
    }
    neighbors.sort((a,b)=>a.d-b.d||a.j-b.j);
    const selected=neighbors.slice(0,neighborCount);
    let beta=1,lo=-Infinity,hi=Infinity;
    const target=Math.log(perplexity);
    let vals=new Float64Array(selected.length);
    for(let attempt=0;attempt<100;attempt++){
      let sum=0,weighted=0;
      for(let z=0;z<selected.length;z++){
        const v=Math.exp(-selected[z].d*beta);
        vals[z]=v;sum+=v;weighted+=selected[z].d*v;
      }
      const entropy=sum>0?Math.log(sum)+beta*weighted/sum:0;
      if(Math.abs(entropy-target)<1e-5)break;
      if(entropy>target){lo=beta; beta=hi===Infinity?beta*2:(beta+hi)/2;}
      else{hi=beta;beta=lo===-Infinity?beta/2:(beta+lo)/2;}
    }
    const sum=vals.reduce((a,b)=>a+b,0)||1;
    for(let z=0;z<selected.length;z++)lists[i].push([selected[z].j,vals[z]/sum]);
  }
  // P = (P_conditional + P_conditional.T) / sum(P_conditional + ...)
  const edges=new Map();
  for(let i=0;i<n;i++)for(const [j,p] of lists[i]){
    const a=Math.min(i,j),b=Math.max(i,j),key=a*n+b;
    edges.set(key,(edges.get(key)||0)+p);
  }
  const attractive=Array.from({length:n},()=>[]);
  let total=0;for(const val of edges.values())total+=2*val;
  for(const [key,val] of edges){
    const a=Math.floor(key/n),b=key%n,p=Math.max(val/total,EPS);
    attractive[a].push([b,p]);attractive[b].push([a,p]);
  }
  return attractive;
}

// Exact repulsion avoids the additional, implementation-specific errors from
// approximating the Barnes-Hut quadtree. To match sklearn defaults, the option
// below switches to a Barnes-Hut theta=0.5 quadtree for large trajectories.
function makeTree(pos,n){
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  for(let i=0;i<n;i++){const x=pos[2*i],y=pos[2*i+1];xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}
  const half=Math.max(xmax-xmin,ymax-ymin,1e-6)/2+1e-6;
  const root={cx:(xmin+xmax)/2,cy:(ymin+ymax)/2,h:half,n:0,sx:0,sy:0,children:null,ids:[]};
  function add(node,id,depth){
    const x=pos[id*2],y=pos[id*2+1];node.n++;node.sx+=x;node.sy+=y;
    if(!node.children && (node.ids.length===0||depth>=35||node.h<1e-8)){
      node.ids.push(id);return;
    }
    if(!node.children){
      node.children=new Array(4);const ids=node.ids;node.ids=null;
      for(const prev of ids)put(node,prev,depth);
    }
    put(node,id,depth);
  }
  function put(node,id,depth){
    const x=pos[id*2],y=pos[id*2+1];const q=(x>=node.cx?1:0)+(y>=node.cy?2:0);
    if(!node.children[q]){
      const h=node.h/2;
      node.children[q]={cx:node.cx+(q&1?h:-h),cy:node.cy+(q&2?h:-h),h,n:0,sx:0,sy:0,children:null,ids:[]};
    }
    add(node.children[q],id,depth+1);
  }
  for(let i=0;i<n;i++)add(root,i,0);
  return root;
}
function calculateRepulsion(pos,n,theta){
  const forces=new Float64Array(n*2);let sumQ=0;
  const root=theta>0?makeTree(pos,n):null;
  for(let i=0;i<n;i++){
    const x=pos[2*i],y=pos[2*i+1];let fx=0,fy=0,qi=0;
    if(root){
      const stack=[root];
      while(stack.length){
        const node=stack.pop();if(!node||!node.n)continue;
        const mx=node.sx/node.n,my=node.sy/node.n;
        const dx=x-mx,dy=y-my,d2=dx*dx+dy*dy;
        const contains=Math.abs(x-node.cx)<=node.h&&Math.abs(y-node.cy)<=node.h;
        if(!node.children){
          for(const j of node.ids)if(j!==i){
            const ax=x-pos[2*j],ay=y-pos[2*j+1],w=1/(1+ax*ax+ay*ay);
            qi+=w;fx+=w*w*ax;fy+=w*w*ay;
          }
        }else if(!contains && (node.h*2)/Math.sqrt(d2)<theta){
          const w=1/(1+d2);qi+=node.n*w;fx+=node.n*w*w*dx;fy+=node.n*w*w*dy;
        }else for(const child of node.children)if(child)stack.push(child);
      }
    }else{
      for(let j=0;j<n;j++)if(i!==j){
        const dx=x-pos[2*j],dy=y-pos[2*j+1],w=1/(1+dx*dx+dy*dy);
        qi+=w;fx+=w*w*dx;fy+=w*w*dy;
      }
    }
    forces[2*i]=fx;forces[2*i+1]=fy;sumQ+=qi;
  }
  return {forces,sumQ:Math.max(sumQ,EPS)};
}

export async function projectTSNE(vectors,progress=()=>{},perplexity=30,iterations=1000){
  const n=vectors.length;
  if(n<3)return projectPCA(vectors);
  if(perplexity>=n)throw new Error(`t-SNE exige perplexity < número de trajetórias (${n}).`);
  progress('t-SNE: calculando vizinhos e probabilidades (perplexidade 30)...');
  const attractive=probabilities(vectors,perplexity);
  await yieldUI();
  // sklearn init='pca': PCA (float32) normalized by std(first component) * 1e-4
  const pca=projectPCA(vectors),mean0=pca.reduce((s,v)=>s+v[0],0)/n;
  const sd=Math.sqrt(pca.reduce((s,v)=>s+(Math.fround(v[0])-mean0)**2,0)/n)||1;
  const pos=new Float32Array(n*2),update=new Float32Array(n*2),gains=new Float32Array(n*2).fill(1);
  for(let i=0;i<n;i++){
    pos[2*i]=Math.fround(Math.fround(pca[i][0])/sd*1e-4);
    pos[2*i+1]=Math.fround(Math.fround(pca[i][1])/sd*1e-4);
  }
  const rate=Math.max(n/48,50),angle=.5;
  let bestCost=Infinity,bestIter=0;
  for(let iter=0;iter<iterations;iter++){
    const {forces,sumQ}=calculateRepulsion(pos,n,angle);
    const exaggeration=iter<250?12:1;
    const grad=new Float32Array(n*2);
    for(let i=0;i<n;i++){
      let px=0,py=0;const x=pos[2*i],y=pos[2*i+1];
      for(const [j,p] of attractive[i]){
        const dx=x-pos[2*j],dy=y-pos[2*j+1];const w=1/(1+dx*dx+dy*dy);
        px+=exaggeration*p*w*dx;py+=exaggeration*p*w*dy;
      }
      grad[2*i]=Math.fround(4*(px-forces[2*i]/sumQ));
      grad[2*i+1]=Math.fround(4*(py-forces[2*i+1]/sumQ));
    }
    const momentum=iter<250?.5:.8;
    let gradNorm=0;
    for(let a=0;a<pos.length;a++){
      const g=grad[a];
      gains[a]=Math.max(.01, update[a]*g<0?gains[a]+.2:gains[a]*.8);
      const adjusted=Math.fround(g*gains[a]);gradNorm+=adjusted*adjusted;
      update[a]=Math.fround(momentum*update[a]-rate*adjusted);
      pos[a]=Math.fround(pos[a]+update[a]);
    }
    // sklearn checks convergence on iterations divisible by 50, after stage 1.
    // Full KL is expensive; gradient tolerance check is sufficient in practice.
    if((iter+1)%50===0){
      progress(`t-SNE Barnes-Hut: ${iter+1}/${iterations} iterações`);
      await yieldUI();
      if(iter>=250&&Math.sqrt(gradNorm)<1e-7)break;
    }
  }
  return Array.from({length:n},(_,i)=>[pos[2*i],pos[2*i+1]]);
}
