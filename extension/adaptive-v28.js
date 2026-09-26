(() => {
  "use strict";
  const clamp=(x,lo=0,hi=1)=>Math.min(hi,Math.max(lo,Number(x)||0));
  const CPU_TIERS=Object.freeze({
    conservative:Object.freeze({name:"conservative",maxSessions:1,spatialReportMs:120,diagnosticStride:3}),
    balanced:Object.freeze({name:"balanced",maxSessions:2,spatialReportMs:80,diagnosticStride:2}),
    parallel:Object.freeze({name:"parallel",maxSessions:3,spatialReportMs:55,diagnosticStride:1}),
    extended:Object.freeze({name:"extended",maxSessions:4,spatialReportMs:42,diagnosticStride:1})
  });
  function cpuProfile(logicalProcessors=2){
    const n=Math.max(1,Math.min(64,Math.floor(Number(logicalProcessors)||1)));
    if(n<=2)return {...CPU_TIERS.conservative,logicalProcessors:n};
    if(n<=4)return {...CPU_TIERS.balanced,logicalProcessors:n};
    if(n<=8)return {...CPU_TIERS.parallel,logicalProcessors:n};
    return {...CPU_TIERS.extended,logicalProcessors:n};
  }
  function reflectionProfile(settings={},report={},pressure=0){
    if(!settings.reflectionCharacterEnabled)return {active:false,wet:0,hpHz:520,lpHz:11800,taps:[0,0,0],delaysMs:[4.8,9.7,16.1]};
    const amount=clamp((Number(settings.reflectionCharacterAmount)||0)/100);
    const pulse=clamp(report.pulse);
    const speech=clamp(report.speechRatio);
    const seam=clamp(report.seamConfidence ?? report.discontinuity);
    const safety=clamp(pressure);
    const mode=["subtle","balanced","lively"].includes(settings.reflectionCharacterMode)?settings.reflectionCharacterMode:"balanced";
    const base={subtle:{cap:.020,hp:650,lp:9800,shape:[.52,.31,.17]},balanced:{cap:.038,hp:520,lp:11800,shape:[.48,.32,.20]},lively:{cap:.058,hp:430,lp:13500,shape:[.44,.33,.23]}}[mode];
    const onset=0.35+0.65*Math.pow(pulse,0.65);
    const speechGuard=1-0.22*speech;
    const seamGuard=1-0.78*seam;
    const wet=clamp(base.cap*amount*onset*speechGuard*seamGuard*(1-safety),0,base.cap);
    const spread=mode==="lively"?1.12:mode==="subtle"?0.90:1;
    return {active:wet>.0008,wet,hpHz:base.hp,lpHz:base.lp,taps:base.shape.map(x=>x*wet),delaysMs:[4.8*spread,9.7*spread,16.1*spread]};
  }
  function localizationProxy({itdMs=0,ildDb=0,iacc=1}={}){
    // Diagnostic cue-consistency proxy only. It is not a measured listener localization error.
    const itdNorm=clamp((Number(itdMs)||0)/0.70,-1,1);
    const ildNorm=Math.tanh((Number(ildDb)||0)/12);
    const itdAngle=90*itdNorm;
    const ildAngle=90*ildNorm;
    const cueErrorDeg=Math.min(180,Math.abs(itdAngle-ildAngle));
    const corr=clamp(iacc,-1,1);
    const confidence=clamp((corr+1)/2);
    const consistencyScore=clamp(100-(cueErrorDeg/90)*70-(1-confidence)*30,0,100);
    return {itdAngleDeg:itdAngle,ildAngleDeg:ildAngle,cueErrorDeg,consistencyScore};
  }
  function spatialReportBlocks(sampleRate=48000,reportMs=80,quantum=128){
    return Math.max(4,Math.min(96,Math.round((Math.max(20,Number(reportMs)||80)/1000)*(Number(sampleRate)||48000)/(Number(quantum)||128))));
  }
  globalThis.YurikaAdaptiveV28=Object.freeze({CPU_TIERS,cpuProfile,reflectionProfile,localizationProxy,spatialReportBlocks});
})();
