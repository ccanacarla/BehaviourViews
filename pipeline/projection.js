/** Browser-native 2D PCA. These are PCA coordinates, not a t-SNE embedding. */
export function projectPCA(vectors){
  if(!vectors.length)return [];
  const n=vectors.length,dim=vectors[0].length;
  const means=new Float64Array(dim);
  for(const row of vectors)for(let j=0;j<dim;j++)means[j]+=row[j]/n;
  const centered=vectors.map(row=>Float64Array.from(row,(v,j)=>v-means[j]));
  const components=[];
  for(let axis=0;axis<2;axis++){
    let v=Float64Array.from({length:dim},(_,j)=>Math.sin((j+1)*(axis+1)*1.71));
    for(let iteration=0;iteration<100;iteration++){
      const result=new Float64Array(dim);
      for(const row of centered){let dot=0;for(let j=0;j<dim;j++)dot+=row[j]*v[j];for(let j=0;j<dim;j++)result[j]+=dot*row[j];}
      for(const previous of components){let dot=0;for(let j=0;j<dim;j++)dot+=result[j]*previous[j];for(let j=0;j<dim;j++)result[j]-=dot*previous[j];}
      const norm=Math.hypot(...result);if(norm<1e-12)break;
      v=Float64Array.from(result,x=>x/norm);
    }
    components.push(v);
  }
  return centered.map(row=>components.map(v=>{let dot=0;for(let j=0;j<dim;j++)dot+=row[j]*v[j];return dot;}));
}
