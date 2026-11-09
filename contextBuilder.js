import {createFloatingBuilder} from './floatingBuilder.js';
import {loadProximity, queryProximity} from './contextUtils.js';
import {eventManager} from './events.js';

const COLORS = ['#c0392b','#8e44ad','#21867a','#d97706','#2563a6','#854f22'];
let instance = 0;

/** Contextos são alternativas (OR). Dentro de cada contexto, tipo e distância são AND. */
export function createContextBuilder(parent, {trajectories = []} = {}) {
  const ns = `.contextBuilder${++instance}`;
  const root = parent.append('div').attr('class','dropdown context-builder-dropdown').style('margin-left', '12px');
  root.append('span').attr('class','mb-toolbar-label').text('Context:').style('margin-right', '6px');
  const toggle = root.append('button').attr('type','button').attr('class','dropdown-toggle mb-toggle')
    .text('Build').attr('aria-expanded','false');
  const panel = root.append('div').attr('class','dropdown-content cb-panel')
    .attr('role','dialog').attr('aria-label','Context Builder');
  const floating = createFloatingBuilder(toggle.node(), panel.node(), 'context');
  panel.append('button').attr('class','cb-close').attr('type','button')
    .attr('aria-label','Close').text('×').on('click',close);

  let contexts = [];
  let serial = 0;
  let dirty = false;
  const meta = panel.append('div').attr('class','cb-meta');
  const nameLabel = meta.append('label');
  nameLabel.append('span').text('Name:');
  const nameInput = nameLabel.append('input').attr('type','text').attr('class','cb-name');
  const colorLabel = meta.append('label');
  colorLabel.append('span').text('Color:');
  const colorInput = colorLabel.append('input').attr('type','color').attr('class','cb-color');
  const title = panel.append('div').attr('class','cb-section-title').text('Define proximity');
  const typesRow = panel.append('div').attr('class','cb-types');
  const checked = {1:true,2:true};
  for (const [id,labelText] of [[1,'Debris'],[2,'Pinhead']]) {
    const label = typesRow.append('label');
    label.append('input').attr('type','checkbox').property('checked',true)
      .on('change',function(){checked[id]=this.checked;});
    label.append('span').text(labelText);
  }
  const distRow = panel.append('label').attr('class','cb-distance');
  distRow.append('span').text('Distance ≤');
  const distance = distRow.append('input').attr('type','number').attr('step','any')
    .attr('min','0').property('value','0.01');
  const add = panel.append('button').attr('class','cb-add').attr('type','button').text('+ Add Context');
  const contextList = panel.append('div').attr('class','cb-list');
  const status = panel.append('div').attr('class','cb-status').attr('aria-live','polite');
  const actions = panel.append('div').attr('class','cb-actions');
  const search = actions.append('button').attr('class','cb-search').attr('type','button').text('Search Contexts');
  actions.append('button').attr('class','cb-clear').attr('type','button').text('Clear all')
    .on('click',()=>{
      contexts=[];
      dirty=false;
      resetDraft();
      eventManager.notify('CONTEXT_QUERY_CHANGED',{trajectoryIds:null,segmentMap:null,segmentColors:null});
      status.text('Context filter cleared');
      render();
    });

  function resetDraft(){
    nameInput.property('value',`Context ${contexts.length+1}`);
    colorInput.property('value',COLORS[contexts.length%COLORS.length]);
    distance.property('value','0.01');
    checked[1]=checked[2]=true;
    typesRow.selectAll('input').property('checked',true);
  }
  function render(){
    contextList.selectAll('*').remove();
    if (contexts.length) {
      contextList.append('div').attr('class','cb-section-title').text('Contexts to search:');
      contexts.forEach((ctx,i)=>{
        const item=contextList.append('div').attr('class','cb-context-row');
        item.append('span').attr('class','cb-swatch').style('background-color',ctx.color);
        const info=item.append('div').attr('class','cb-context-info');
        info.append('strong').text(ctx.name);
        const types=ctx.types.length===2?'Debris / Pinhead':ctx.types[0]===1?'Debris':'Pinhead';
        info.append('small').text(`${types} · distance ≤ ${ctx.maxDistance}`);
        item.append('button').attr('type','button').attr('class','cb-remove')
          .attr('aria-label',`Remove ${ctx.name}`).attr('title','Remove context').text('×')
          .on('click',()=>{contexts.splice(i,1);dirty=true;render();});
      });
    }
    search.property('disabled',!contexts.length);
    if (dirty) status.text('Changes not applied');
  }
  add.on('click',()=>{
    const types=[1,2].filter(t=>checked[t]);
    const raw=String(distance.property('value')).trim();
    const maxDistance=Number(raw);
    if (!types.length || raw==='' || !Number.isFinite(maxDistance) || maxDistance<0) {
      status.text('Choose an object type and a valid distance'); return;
    }
    contexts.push({id:`context-${++serial}`,name:String(nameInput.property('value')).trim()||`Context ${contexts.length+1}`,
      color:colorInput.property('value'),types,maxDistance});
    dirty=true;
    resetDraft();
    render();
  });
  search.on('click',async()=>{
    if(!contexts.length) return;
    search.property('disabled',true);
    status.text('Searching…');
    try {
      const rows=await loadProximity();
      const ids=new Set();
      const segmentMap=new Map();
      const segmentColors=new Map();
      // União dos contextos, com a cor do primeiro contexto correspondente em cada segmento.
      for(const ctx of contexts){
        const result=queryProximity(rows,trajectories,{types:ctx.types,maxDistance:ctx.maxDistance});
        result.ids.forEach(id=>ids.add(id));
        for(const [key,cells] of result.segmentMap){
          if(!segmentMap.has(key)) segmentMap.set(key,new Map());
          if(!segmentColors.has(key)) segmentColors.set(key,new Map());
          const merged=segmentMap.get(key), colors=segmentColors.get(key);
          for(const [index,kinds] of cells){
            if(!merged.has(index)) merged.set(index,new Set());
            kinds.forEach(kind=>merged.get(index).add(kind));
            if(!colors.has(index)) colors.set(index,ctx.color);
          }
        }
      }
      eventManager.notify('CONTEXT_QUERY_CHANGED',{
        trajectoryIds:[...ids],segmentMap,segmentColors
      });
      dirty=false;
      status.text(`${ids.size} matching trajectories`);
      close();
    } catch(err){console.error(err); status.text(`Could not load proximity.csv: ${err.message}`);}
    finally {render();}
  });
  panel.on('click',e=>e.stopPropagation());
  function close(){panel.classed('show',false);toggle.attr('aria-expanded','false');}
  toggle.on('click',e=>{
    e.stopPropagation();
    const open=!panel.classed('show');
    d3.selectAll('.dropdown-content.show').classed('show',false);
    if (open) floating.open();
    panel.classed('show',open);toggle.attr('aria-expanded',String(open));
  });
  d3.select(window).on(`click${ns}`,close).on(`keydown${ns}`,e=>{if(e.key==='Escape')close();});
  resetDraft();render();
  return {destroy(){d3.select(window).on(`click${ns}`,null).on(`keydown${ns}`,null);root.remove();floating.destroy();}};
}
