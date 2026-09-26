(() => {
  "use strict";
  const CALIBRATION_FREQUENCIES = Object.freeze([80,160,315,630,1250,2500,5000,10000]);
  const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,Number(x)||0));
  function median(a){const b=[...a].filter(Number.isFinite).sort((x,y)=>x-y);if(!b.length)return 0;const m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2;}
  function deriveCalibrationGains(measuredDb=[], noiseDb=-120){
    const m=CALIBRATION_FREQUENCIES.map((_,i)=>Number(measuredDb[i]));
    if(m.some(x=>!Number.isFinite(x))) return {ok:false,reason:"invalid-measurement",gainsDb:Array(8).fill(0),snrDb:[]};
    const n=Number.isFinite(Number(noiseDb))?Number(noiseDb):-120;
    const snr=m.map(x=>x-n); const good=snr.filter(x=>x>=12).length;
    if(good<6)return{ok:false,reason:"low-snr",gainsDb:Array(8).fill(0),snrDb:snr};
    const target=median(m.slice(1,7));
    const raw=m.map(x=>clamp(target-x,-3,3));
    const smooth=raw.map((x,i)=>{
      const a=raw[Math.max(0,i-1)],b=raw[Math.min(raw.length-1,i+1)];
      return clamp((a+2*x+b)/4,-3,3);
    });
    // Remove common gain; calibration should change shape, not become another volume control.
    const center=median(smooth.slice(1,7));
    const gains=smooth.map((x,i)=>clamp(x-center,i===0||i===7?-2.5:-3,i===0||i===7?2.5:3));
    const spread=Math.max(...m)-Math.min(...m);
    const confidence=clamp((good/8)*0.65 + clamp((median(snr)-12)/24,0,1)*0.25 + clamp((18-spread)/18,0,1)*0.10,0,1);
    return{ok:true,reason:"ok",gainsDb:gains,snrDb:snr,targetDb:target,confidence};
  }
  function calibrationPrecutDb(gainsDb=[],strength=100){
    const t=clamp((Number(strength)||0)/100,0,1);const peak=Math.max(0,...gainsDb.map(x=>Number(x)||0));return -peak*t;
  }
  function safeCalibrationArray(v){return CALIBRATION_FREQUENCIES.map((_,i)=>clamp(Array.isArray(v)?v[i]:0,-3,3));}
  globalThis.YurikaAdaptiveV29=Object.freeze({CALIBRATION_FREQUENCIES,deriveCalibrationGains,calibrationPrecutDb,safeCalibrationArray});
})();
