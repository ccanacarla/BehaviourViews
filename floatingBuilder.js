/** Abre filtros fora de contêineres com overflow, sem perder estilos nem eventos D3. */
export function createFloatingBuilder(toggleNode, panelNode, kind) {
  // Descarta portais órfãos de renders anteriores.
  document.querySelectorAll(`.builder-floating-root[data-kind="${kind}"]`).forEach(el => {
    if (!el._builderToggle || !el._builderToggle.isConnected) el.remove();
  });
  const portal = document.createElement('div');
  portal.className = `builder-floating-root ${kind}-builder-dropdown`;
  portal.dataset.kind = kind;
  portal._builderToggle = toggleNode;
  document.body.append(portal);
  portal.append(panelNode);
  function position() {
    const r = toggleNode.getBoundingClientRect();
    const width = kind === 'motif' ? 338 : 310;
    const x = Math.max(8, Math.min(r.left, window.innerWidth - Math.min(width, window.innerWidth - 16) - 8));
    const availableBelow = window.innerHeight - r.bottom - 10;
    const above = availableBelow < 260 && r.top > availableBelow;
    const top = above ? 8 : Math.max(8, r.bottom + 5);
    panelNode.style.setProperty('position', 'fixed', 'important');
    panelNode.style.setProperty('left', `${x}px`, 'important');
    panelNode.style.setProperty('right', 'auto', 'important');
    panelNode.style.setProperty('top', `${top}px`, 'important');
    panelNode.style.setProperty('bottom', 'auto', 'important');
    panelNode.style.setProperty('max-height', `${Math.max(100, above ? r.top - 16 : window.innerHeight - top - 8)}px`, 'important');
  }
  const reposition = () => { if (panelNode.classList.contains('show')) position(); };
  window.addEventListener('resize', reposition, {passive:true});
  window.addEventListener('scroll', reposition, true);
  return {open: position, destroy() {
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
    portal.remove();
  }};
}
