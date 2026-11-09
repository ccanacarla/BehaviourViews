/** Matrizes de Markov e K-means++ (RandomState MT19937, uma inicialização como no notebook). */
function distance2(a,b){let d=0;for(let j=0;j<a.length;j++){const z=a[j]-b[j];d+=z*z;}return d;}
class RandomState {
  constructor(seed=42){this.mt=new Uint32Array(624);this.mt[0]=seed>>>0;for(let i=1;i<624;i++)this.mt[i]=(Math.imul(1812433253,(this.mt[i-1]^(this.mt[i-1]>>>30)))+i)>>>0;this.i=624;}
  uint32(){if(this.i===624){for(let i=0;i<624;i++){const y=(this.mt[i]&0x80000000)|(this.mt[(i+1)%624]&0x7fffffff);this.mt[i]=(this.mt[(i+397)%624]^(y>>>1)^((y&1)?0x9908b0df:0))>>>0;}this.i=0;}let y=this.mt[this.i++];y^=y>>>11;y^=(y<<7)&0x9d2c5680;y^=(y<<15)&0xefc60000;y^=y>>>18;return y>>>0;}
  random(){return ((this.uint32()>>>5)*67108864+(this.uint32()>>>6))/9007199254740992;}
  randint(max){let mask=max-1;mask|=mask>>>1;mask|=mask>>>2;mask|=mask>>>4;mask|=mask>>>8;mask|=mask>>>16;let n;do{n=this.uint32()&mask;}while(n>=max);return n;}
}
function initPlusPlus(data,k,rng){
  const n=data.length,centers=[Float64Array.from(data[Math.floor(rng.random()*n)])];
  let closest=data.map(x=>distance2(x,centers[0]));let potential=closest.reduce((a,b)=>a+b,0);
  const trials=2+Math.floor(Math.log(k));
  while(centers.length<k){
    let best=-1,bestPot=Infinity,bestDistances=null;
    for(let t=0;t<trials;t++){
      let target=rng.random()*potential,idx=n-1;
      for(let i=0;i<n;i++){target-=closest[i];if(target<=0){idx=i;break;}}
      const candidate=data[idx];const dists=closest.map((d,i)=>Math.min(d,distance2(data[i],candidate)));
      const pot=dists.reduce((a,b)=>a+b,0);
      if(pot<bestPot){best=idx;bestPot=pot;bestDistances=dists;}
    }
    centers.push(Float64Array.from(data[best]));closest=bestDistances;potential=bestPot;
  }
  return centers;
}
export function kmeans(data,k,maxIterations=300,seed=42,nInit=1){
  if(!data.length||!Number.isInteger(k)||k<1||k>data.length)throw new Error(`Clusters devem estar entre 1 e ${data.length}.`);
  const rng=new RandomState(seed), n=data.length, dim=data[0].length;
  const tol=1e-4*Array.from({length:dim},(_,j)=>{const mu=data.reduce((s,v)=>s+v[j],0)/n;return data.reduce((s,v)=>s+(v[j]-mu)**2,0)/n;}).reduce((a,b)=>a+b,0)/dim;
  let bestInertia=Infinity,bestLabels=null;
  for(let run=0;run<nInit;run++){
    let centers=initPlusPlus(data,k,rng),labels=new Int32Array(n).fill(-1);
    for(let iteration=0;iteration<maxIterations;iteration++){
      const sums=Array.from({length:k},()=>new Float64Array(dim)),counts=new Int32Array(k),next=new Int32Array(n);
      let changed=false;
      for(let i=0;i<n;i++){
        let best=0,min=Infinity;
        for(let c=0;c<k;c++){const d=distance2(data[i],centers[c]);if(d<min){min=d;best=c;}}
        next[i]=best;if(labels[i]!==best)changed=true;counts[best]++;
        for(let j=0;j<dim;j++)sums[best][j]+=data[i][j];
      }
      for(let c=0;c<k;c++)if(!counts[c]){
        let far=-1,dist=-1;
        for(let i=0;i<n;i++){const d=distance2(data[i],centers[next[i]]);if(d>dist){far=i;dist=d;}}
        if(far>=0){const donor=next[far];counts[donor]--;for(let j=0;j<dim;j++)sums[donor][j]-=data[far][j];next[far]=c;counts[c]=1;for(let j=0;j<dim;j++)sums[c][j]=data[far][j];}
      }
      const updated=centers.map((c,i)=>counts[i]?Float64Array.from(sums[i],v=>v/counts[i]):c);
      const shift=centers.reduce((s,c,i)=>s+distance2(c,updated[i]),0);
      centers=updated;labels=next;
      if(!changed || shift<=tol)break;
    }
    const finalLabels=data.map(row=>{
      let best=0,score=Infinity;for(let c=0;c<k;c++){const d=distance2(row,centers[c]);if(d<score){score=d;best=c;}}return best;
    });
    const inertia=data.reduce((sum,row,i)=>sum+distance2(row,centers[finalLabels[i]]),0);
    if(inertia<bestInertia){bestInertia=inertia;bestLabels=finalLabels;}
  }
  return bestLabels;
}
export function transitionVectors(symbolGroups){
  const states=[...new Set(symbolGroups.flatMap(g=>g.map(p=>p.symbol)))].sort();
  const index=new Map(states.map((s,i)=>[s,i])), n=states.length;
  return symbolGroups.map(group=>{
    const v=new Float64Array(n*n),counts=new Float64Array(n);
    for(let j=1;j<group.length;j++){const a=index.get(group[j-1].symbol),b=index.get(group[j].symbol);v[a*n+b]++;counts[a]++;}
    for(let a=0;a<n;a++)if(counts[a])for(let b=0;b<n;b++)v[a*n+b]/=counts[a];
    return v;
  });
}
export function metrics(group,points){
  const seq=group.map(p=>p.symbol),counts=new Map();let runs=0;
  for(let i=0;i<seq.length;i++){counts.set(seq[i],(counts.get(seq[i])||0)+1);if(!i||seq[i]!==seq[i-1])runs++;}
  let entropy=0;for(const n of counts.values()){const p=n/seq.length;entropy-=p*Math.log2(p);}
  let path=0;for(let i=1;i<points.length;i++)path+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
  return {shannon_entropy:entropy,avg_dwell_time:seq.length/(runs||1),high_speed_ratio:seq.filter(s=>s.includes('Rapido')).length/(seq.length||1),path_length:path};
}
