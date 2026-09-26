(() => {
  "use strict";
  const M = globalThis.YurikaModularCore;
  const C = globalThis.YurikaAudioCore;
  if (!M || !C) throw new Error("YURIKA modular/audio core missing");

  const filter = (ctx,type,freq,gain=0,q=0.707) => { const n=ctx.createBiquadFilter(); n.type=type; n.frequency.value=freq; n.gain.value=gain; n.Q.value=(type==="lowpass"||type==="highpass")?C.webAudioResonanceDb(q):q; return n; };
  const smooth = (param,value,now,seconds=0.08) => { param.cancelScheduledValues(now); param.setValueAtTime(param.value,now); param.linearRampToValueAtTime(value,now+seconds); };

  function createDacMatrixStage(ctx,input) {
    const bypass=ctx.createGain(), processed=ctx.createGain(), out=ctx.createGain();
    const pre=ctx.createGain(), low=filter(ctx,"lowshelf",120), presence=filter(ctx,"peaking",3200,0,0.8), high=filter(ctx,"highshelf",11000);
    const direct=ctx.createGain(), shaper=ctx.createWaveShaper(), harm=ctx.createGain(), sum=ctx.createGain(), lowpass=filter(ctx,"lowpass",21000,0,0.707);
    bypass.gain.value=1; processed.gain.value=0; harm.gain.value=0; shaper.curve=C.makeSoftSaturationCurve(4096,1.03);
    input.connect(bypass); bypass.connect(out);
    input.connect(pre); pre.connect(low); low.connect(presence); presence.connect(high); high.connect(direct); direct.connect(sum); high.connect(shaper); shaper.connect(harm); harm.connect(sum); sum.connect(lowpass); lowpass.connect(processed); processed.connect(out);
    return { output:out, stage:{bypass,processed,out,pre,low,presence,high,direct,shaper,harm,sum,lowpass} };
  }
  function applyDacMatrixStage(stage,settings,ctx,initial=false) {
    if (!stage) return;
    const p=M.dacMatrixProfile(settings.dacMatrixMode,settings.dacMatrixStrength,settings.dacAkmWeight,settings.dacEssWeight,settings.dacTiWeight), now=ctx.currentTime, enabled=p.mode!=="off";
    smooth(stage.bypass.gain,enabled?0:1,now,0.08); smooth(stage.processed.gain,enabled?1:0,now,0.08);
    smooth(stage.pre.gain,C.dbToGain(p.preDb),now,0.12); smooth(stage.low.gain,p.lowDb,now,0.14); smooth(stage.presence.gain,p.presenceDb,now,0.14); smooth(stage.high.gain,p.highDb,now,0.14);
    smooth(stage.direct.gain,Math.max(0.90,1-p.harmonic),now,0.12); smooth(stage.harm.gain,p.harmonic,now,0.12);
    smooth(stage.lowpass.frequency,Math.min(p.cutoffHz,ctx.sampleRate*0.47),now,0.18); stage.lowpass.Q.value=C.webAudioResonanceDb(p.q);
    if (initial || stage._mode!==p.mode || Math.abs((stage._strength??-1)-p.strength)>1e-6) { stage.shaper.curve=C.makeSoftSaturationCurve(4096,p.drive); stage.shaper.oversample=settings.hiResMode?"4x":"2x"; stage._mode=p.mode; stage._strength=p.strength; }
  }

  function createRoomIR(ctx) {
    const len=Math.max(1,Math.floor(ctx.sampleRate*0.070)); const b=ctx.createBuffer(2,len,ctx.sampleRate);
    const taps=[[[11,0.24],[18,-0.12],[29,0.08],[43,-0.05],[61,0.025]],[[13,0.22],[21,-0.11],[32,0.075],[47,-0.045],[65,0.022]]];
    for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch); for(const [ms,a] of taps[ch]){const i=Math.min(d.length-1,Math.round(ctx.sampleRate*ms/1000));d[i]+=a;}}
    return b;
  }
  function createRoomStage(ctx,input) {
    const bypass=ctx.createGain(), processed=ctx.createGain(), out=ctx.createGain();
    const direct=ctx.createGain(), low=filter(ctx,"lowshelf",120), high=filter(ctx,"highshelf",7000), hp=filter(ctx,"highpass",120), lp=filter(ctx,"lowpass",15500), delay=ctx.createDelay(0.08), conv=ctx.createConvolver(), wet=ctx.createGain(), sum=ctx.createGain();
    bypass.gain.value=1; processed.gain.value=0; conv.normalize=false; conv.buffer=createRoomIR(ctx); wet.gain.value=0;
    input.connect(bypass); bypass.connect(out);
    input.connect(direct); direct.connect(low); low.connect(high); high.connect(sum); input.connect(hp); hp.connect(lp); lp.connect(delay); delay.connect(conv); conv.connect(wet); wet.connect(sum); sum.connect(processed); processed.connect(out);
    return {output:out,stage:{bypass,processed,out,direct,low,high,hp,lp,delay,conv,wet,sum}};
  }
  function applyRoomStage(stage,settings,ctx) {
    if(!stage)return; const p=M.roomProfile(settings.roomEnabled?settings.roomMode:"off",settings.roomAmount),now=ctx.currentTime,enabled=settings.roomEnabled && p.mode!=="off";
    smooth(stage.bypass.gain,enabled?0:1,now,0.10); smooth(stage.processed.gain,enabled?1:0,now,0.10);
    smooth(stage.direct.gain,C.dbToGain(p.directDb),now,0.20); smooth(stage.low.gain,p.lowDb,now,0.20); smooth(stage.high.gain,p.highDb,now,0.20); smooth(stage.delay.delayTime,p.predelaySeconds,now,0.20); smooth(stage.wet.gain,p.wet,now,0.25);
    const lp=15000-(p.diffusion*3500); smooth(stage.lp.frequency,Math.min(lp,ctx.sampleRate*0.44),now,0.22);
  }

  // Integrity DC blocking must remain numerically stable at 96 kHz. A second-order
  // Biquad at only 3.5-5 Hz has coefficients extremely close to cancellation and
  // can accumulate float32 residual in browser DSP implementations. Use normalized
  // first-order IIR blockers instead, and make transparent mode a true unity path.
  function createDcBlockIir(ctx,cutoffHz) {
    const fc=Math.max(0.1,Number(cutoffHz)||0.1), r=Math.exp((-2*Math.PI*fc)/ctx.sampleRate), k=(1+r)*0.5;
    return ctx.createIIRFilter([k,-k],[1,-r]);
  }
  function createIntegrityStage(ctx,input) {
    const bypass=ctx.createGain(), processed=ctx.createGain(), dc35=createDcBlockIir(ctx,3.5), dc5=createDcBlockIir(ctx,5.0), dc35Gain=ctx.createGain(), dc5Gain=ctx.createGain(), sum=ctx.createGain();
    bypass.gain.value=1; processed.gain.value=1; dc35Gain.gain.value=0; dc5Gain.gain.value=0;
    input.connect(bypass); bypass.connect(sum);
    input.connect(dc35); dc35.connect(dc35Gain); dc35Gain.connect(processed);
    input.connect(dc5); dc5.connect(dc5Gain); dc5Gain.connect(processed); processed.connect(sum);
    return {output:sum,stage:{bypass,processed,dc:dc35,dc35,dc5,dc35Gain,dc5Gain,sum,_implementation:"stable-first-order-iir"}};
  }
  function applyIntegrityStage(stage,settings,ctx) {
    if(!stage)return; const mode=settings.integrityEnabled?settings.integrityMode:"off",p=M.integrityProfile(mode,settings.integrityStrength),now=ctx.currentTime;
    const use35=p.enabled && p.dcBlockHz>0 && p.dcBlockHz<4.25, use5=p.enabled && p.dcBlockHz>=4.25;
    // off/transparent are bit-clean unity paths; explicit stability modes select a DC blocker.
    smooth(stage.bypass.gain,(use35||use5)?0:1,now,p.smoothingSeconds);
    smooth(stage.dc35Gain.gain,use35?1:0,now,p.smoothingSeconds);
    smooth(stage.dc5Gain.gain,use5?1:0,now,p.smoothingSeconds);
    stage._profile={...p,implementation:"stable-first-order-iir",effectiveDcBlockHz:use35?3.5:(use5?5:0)};
  }

  function createCartridgeBranch(ctx,input) {
    const shelf=filter(ctx,"highshelf",9000),res=filter(ctx,"peaking",10000,0,0.72),trim=ctx.createGain(); input.connect(shelf); shelf.connect(res); res.connect(trim); return {output:trim,shelf,res,trim};
  }
  function createCartridgeStage(ctx,input) {
    const direct=ctx.createGain(), sum=ctx.createGain(), mixSum=ctx.createGain(), mixOut=ctx.createGain(), splitOut=ctx.createGain(); direct.gain.value=1; mixOut.gain.value=0; splitOut.gain.value=0; input.connect(direct); direct.connect(sum);
    const A=createCartridgeBranch(ctx,input),B=createCartridgeBranch(ctx,input),Cbr=createCartridgeBranch(ctx,input); const ag=ctx.createGain(),bg=ctx.createGain(),cg=ctx.createGain(); ag.gain.value=0;bg.gain.value=0;cg.gain.value=0; A.output.connect(ag);B.output.connect(bg);Cbr.output.connect(cg);ag.connect(mixSum);bg.connect(mixSum);cg.connect(mixSum);mixSum.connect(mixOut);mixOut.connect(sum);
    const as=ctx.createChannelSplitter(2),bs=ctx.createChannelSplitter(2),merger=ctx.createChannelMerger(2);A.output.connect(as);B.output.connect(bs);as.connect(merger,0,0);bs.connect(merger,1,1);merger.connect(splitOut);splitOut.connect(sum);
    return {output:sum,stage:{direct,sum,A,B,C:Cbr,ag,bg,cg,mixSum,mixOut,splitOut,as,bs,merger}};
  }
  function applyCartridgeStage(stage,settings,ctx) {
    if(!stage)return; const now=ctx.currentTime; const specs=[
      [stage.A,M.cartridgeProfile(settings.cartridgeAResistance,settings.cartridgeACapacitance,settings.cartridgeAGainDb)],
      [stage.B,M.cartridgeProfile(settings.cartridgeBResistance,settings.cartridgeBCapacitance,settings.cartridgeBGainDb)],
      [stage.C,M.cartridgeProfile(settings.cartridgeCResistance,settings.cartridgeCCapacitance,settings.cartridgeCGainDb)]
    ];
    for(const [b,p] of specs){smooth(b.shelf.gain,p.highShelfDb,now,0.20);smooth(b.res.frequency,p.resonanceHz,now,0.20);smooth(b.res.gain,p.resonanceDb,now,0.20);b.res.Q.value=p.q;smooth(b.trim.gain,C.dbToGain(p.gainDb),now,0.15);}
    const enabled=settings.cartridgeEnabled && settings.cartridgeMode!=="off",mode=enabled?settings.cartridgeMode:"off"; let ga=0,gb=0,gc=0,split=0,mix=0,direct=1;
    if(mode==="a"){ga=1;mix=1;direct=0;} else if(mode==="b"){gb=1;mix=1;direct=0;} else if(mode==="c"){gc=1;mix=1;direct=0;} else if(mode==="mix"){const g=M.cartridgeMixGains(settings.cartridgeMixA,settings.cartridgeMixB,settings.cartridgeMixC);ga=g.a;gb=g.b;gc=g.c;mix=1;direct=0;} else if(mode==="ab-split"){split=1;direct=0;}
    smooth(stage.direct.gain,direct,now,0.10);smooth(stage.ag.gain,ga,now,0.12);smooth(stage.bg.gain,gb,now,0.12);smooth(stage.cg.gain,gc,now,0.12);smooth(stage.mixOut.gain,mix,now,0.10);smooth(stage.splitOut.gain,split,now,0.10);stage._mode=mode;
  }


  function createSessionBranch(ctx,source,inputBus) {
    const gate=ctx.createGain(); gate.gain.value=1; source.connect(gate); gate.connect(inputBus); return {source,gate};
  }
  function createDeckBranch(ctx,source,inputBus) {
    const low=filter(ctx,"lowshelf",120),mid=filter(ctx,"peaking",1200,0,0.75),high=filter(ctx,"highshelf",8000),trim=ctx.createGain(),xfade=ctx.createGain();
    xfade.gain.value=0; // transactional arm: never enter the live mix at full gain before settings are applied.
    source.connect(low);low.connect(mid);mid.connect(high);high.connect(trim);trim.connect(xfade);xfade.connect(inputBus); return {source,low,mid,high,trim,xfade};
  }
  function applyDecks(deckNodes,settings,ctx) {
    const now=ctx.currentTime,xf=M.equalPowerCrossfade(settings.djCrossfader); for(const name of ["A","B"]){const n=deckNodes?.[name];if(!n)continue;const pre=name==="A"?"deckA":"deckB"; const activeGain=settings.djEnabled?(name==="A"?xf.a:xf.b):(name==="A"?1:0); smooth(n.trim.gain,C.dbToGain(settings[pre+"GainDb"]),now,0.08);smooth(n.xfade.gain,activeGain,now,0.06);smooth(n.low.gain,settings[pre+"LowDb"],now,0.10);smooth(n.mid.gain,settings[pre+"MidDb"],now,0.10);smooth(n.high.gain,settings[pre+"HighDb"],now,0.10);}
  }

  globalThis.YurikaAudioModules=Object.freeze({createDacMatrixStage,applyDacMatrixStage,createRoomStage,applyRoomStage,createIntegrityStage,applyIntegrityStage,createCartridgeStage,applyCartridgeStage,createSessionBranch,createDeckBranch,applyDecks});
})();
