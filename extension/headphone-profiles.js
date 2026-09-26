(() => {
  "use strict";
  // Small embedded starter registry. Exact model match controls headphone EQ only; HRTF remains a separate listener/spatial profile.
  // AutoEq-derived numerical presets are attributed in profile metadata. The registry is intentionally offline and expandable.
  const PROFILES = Object.freeze({
    "generic-neutral": Object.freeze({
      label:"Generic / No model correction", source:"none", aliases:[], preampDb:0, filters:[]
    }),
    "sennheiser-hd600": Object.freeze({
      label:"Sennheiser HD 600", source:"AutoEq-derived / oratory1990 measurement family", aliases:["sennheiser hd 600","sennheiser hd600","hd 600","hd600"], sourceUrl:"https://github.com/jaakkopasanen/AutoEq", preampDb:-6.2,
      filters:Object.freeze([
        {type:"lowshelf",frequency:105,gain:6.4,q:0.70},{type:"peaking",frequency:120,gain:-2.1,q:0.59},
        {type:"peaking",frequency:9320,gain:3.8,q:2.35},{type:"peaking",frequency:4270,gain:4.2,q:4.49},
        {type:"peaking",frequency:3040,gain:-2.6,q:3.53},{type:"highshelf",frequency:10000,gain:-3.9,q:0.70},
        {type:"peaking",frequency:1380,gain:-1.7,q:2.29},{type:"peaking",frequency:476,gain:0.7,q:1.18},
        {type:"peaking",frequency:2070,gain:0.8,q:2.97},{type:"peaking",frequency:237,gain:-0.5,q:2.22}
      ])
    }),
    "sony-wh1000xm5": Object.freeze({
      label:"Sony WH-1000XM5", source:"AutoEq / oratory1990", aliases:["sony wh-1000xm5","sony wh1000xm5","wh-1000xm5","wh1000xm5","1000xm5"], sourceUrl:"https://github.com/jaakkopasanen/AutoEq", preampDb:-6.2,
      filters:Object.freeze([
        {type:"lowshelf",frequency:105,gain:-3.2,q:0.70},{type:"peaking",frequency:2448,gain:6.9,q:2.46},
        {type:"peaking",frequency:173,gain:-5.6,q:0.96},{type:"peaking",frequency:3028,gain:-5.4,q:2.03},
        {type:"peaking",frequency:1327,gain:3.3,q:0.58},{type:"highshelf",frequency:10000,gain:4.9,q:0.70},
        {type:"peaking",frequency:6110,gain:-2.3,q:5.81},{type:"peaking",frequency:875,gain:-1.2,q:4.07},
        {type:"peaking",frequency:1197,gain:1.0,q:3.28},{type:"peaking",frequency:63,gain:0.4,q:2.13}
      ])
    })
  });
  function getProfile(id){ return PROFILES[id] || PROFILES["generic-neutral"]; }
  function listProfiles(){ return Object.entries(PROFILES).map(([id,p])=>({id,label:p.label,source:p.source,aliases:[...(p.aliases||[])]})); }
  function normalizeLabel(label=""){return String(label).toLowerCase().normalize("NFKC").replace(/[()\[\]{}]/g," ").replace(/[_/]/g," ").replace(/\s+/g," ").trim();}
  function matchOutputLabel(label=""){
    const normalized=normalizeLabel(label);
    if(!normalized)return{profileId:"generic-neutral",confidence:0,label:String(label||""),reason:"empty-label",headphoneLike:false};
    let best={profileId:"generic-neutral",confidence:0,label:String(label),reason:"no-exact-model-match"};
    for(const [id,p] of Object.entries(PROFILES)){
      if(id==="generic-neutral")continue;
      for(const alias of p.aliases||[]){
        const a=normalizeLabel(alias); if(!a)continue;
        if(normalized===a)return{profileId:id,confidence:1,label:String(label),reason:`exact:${alias}`,headphoneLike:true};
        if(normalized.includes(a)){const conf=Math.min(.99,.86+.12*(a.length/Math.max(a.length,normalized.length)));if(conf>best.confidence)best={profileId:id,confidence:conf,label:String(label),reason:`contains:${alias}`};}
      }
    }
    const headphoneLike=/headphone|headset|headphones|ヘッドホン|ヘッドセット|stereo|bluetooth|buds|airpods|wf-|wh-|hd\s?\d|audio[- ]?technica|\bath[- ]?[a-z0-9]+/i.test(normalized);
    return{...best,headphoneLike:Boolean(headphoneLike)};
  }
  globalThis.YurikaHeadphoneProfiles = Object.freeze({ PROFILES, getProfile, listProfiles, normalizeLabel, matchOutputLabel });
})();
