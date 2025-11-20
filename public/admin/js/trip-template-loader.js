(function(global){
  const state = { template:null, loadPromise:null };

  function clone(value){
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function fillMissing(target, template){
    if (!template || typeof template !== 'object') return;
    Object.keys(template).forEach((key)=>{
      const tplVal = template[key];
      const hasKey = Object.prototype.hasOwnProperty.call(target, key);
      if (!hasKey || target[key] === undefined) {
        target[key] = clone(tplVal);
        return;
      }
      const curVal = target[key];
      if (Array.isArray(tplVal)) {
        if (!Array.isArray(curVal)) target[key] = clone(tplVal);
        return;
      }
      if (tplVal && typeof tplVal === 'object') {
        if (!curVal || typeof curVal !== 'object' || Array.isArray(curVal)) {
          target[key] = clone(tplVal);
        } else {
          fillMissing(curVal, tplVal);
        }
      }
    });
  }

  async function ensure(){
    if (state.template) return clone(state.template);
    if (!state.loadPromise){
      state.loadPromise = fetch('/api/admin/trips/template', { credentials:'same-origin', cache:'no-store' })
        .then((res)=> res.ok ? res.json() : {})
        .then((data)=>{
          state.template = (data && typeof data === 'object') ? data : {};
          const snapshot = clone(state.template) || {};
          state.loadPromise = null;
          return snapshot;
        })
        .catch((err)=>{
          state.loadPromise = null;
          console.error('TripTemplateLoader: failed to load template', err);
          throw err;
        });
    }
    return state.loadPromise.then((tpl)=> clone(tpl));
  }

  function requireTemplate(){
    if (!state.template) throw new Error('Trip template not loaded yet. Call TripTemplateLoader.ensure() first.');
    return state.template;
  }

  function cloneTemplate(){
    return clone(requireTemplate()) || {};
  }

  function withDefaults(source){
    const tpl = requireTemplate();
    const base = (source && typeof source === 'object' && !Array.isArray(source)) ? clone(source) : {};
    fillMissing(base, tpl);
    return base;
  }

  global.TripTemplateLoader = {
    ensure,
    clone: cloneTemplate,
    withDefaults,
    getTemplate(){ return clone(requireTemplate()) || {}; },
    reload(){ state.template = null; return ensure(); }
  };
})(window);
