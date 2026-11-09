/** Local, deterministic keyword query parser; does not call a language model. */
export function parseNaturalQuery(text){
  const q=text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const neighborType=/pinhead|cabeca pequena/.test(q)?'pinhead':/debris|detrito|fragmento/.test(q)?'debris':/esperm|sperm/.test(q)?'sperm':'all';
  const cluster=/\bcluster\s*(?:simbolico\s*)?(\d+)\b/.exec(q);
  const physical=/\bcluster\s*fisico\s*(\d+)\b/.exec(q);
  const minEntropy=/entropia\s*(?:maior que|acima de|>)\s*(\d+(?:[.,]\d+)?)/.exec(q);
  const maxEntropy=/entropia\s*(?:menor que|abaixo de|<)\s*(\d+(?:[.,]\d+)?)/.exec(q);
  const duration=/(?:duracao|durante|por pelo menos)\s*(\d+)\s*(?:frames?)?/.exec(q);
  const sequence=/depois|apos|seguido|recuper|desaceler|aceler|slowdown|recovery/.test(q);
  const order=['muito_rapido','muito_lento','rapido','lento','medio','norte','sul','leste','oeste'];
  const token=order.find(s=>q.replace(/\s+/g,'_').includes(s))||'';
  return {queryMode:sequence?'temporal_sequence':'filters',
    temporal:sequence?{neighborType,slowdownWithinFrames:20,recoveryWithinFrames:60,
      baselineLookbackFrames:30,minSpeedDrop:1,minDuration:duration?+duration[1]:0,requireRecovery:/recuper|recovery/.test(q)}:null,
    neighborType,minDuration:duration?+duration[1]:0,
    requireBehaviorChange:/mudanca|alteracao|change/.test(q),
    symbolBefore:'',symbolDuring:token.replaceAll('_','_'),
    clusterFilter:cluster?+cluster[1]:null,
    physClusterFilter:physical?+physical[1]:null,
    minEntropy:minEntropy?Number(minEntropy[1].replace(',','.')):null,
    maxEntropy:maxEntropy?Number(maxEntropy[1].replace(',','.')):null,
    explanation:'Interpretação local por palavras-chave; confira os filtros antes de interpretar o resultado.'};
}
