/* Tiny pub/sub so drills, HUD and state never import each other directly. */
const map = new Map();

export const bus = {
  on(evt, fn){
    if(!map.has(evt)) map.set(evt, new Set());
    map.get(evt).add(fn);
    return () => bus.off(evt, fn);
  },
  off(evt, fn){ map.get(evt)?.delete(fn); },
  emit(evt, payload){
    map.get(evt)?.forEach(fn => { try{ fn(payload); }catch(e){ console.error('[bus]', evt, e); } });
  }
};
