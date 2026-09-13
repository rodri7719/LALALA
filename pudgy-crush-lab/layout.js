// Resize only when available layout space changes; no per-frame geometry reads.
(() => {
 const area=document.getElementById('game-area');
 const wrap=document.getElementById('bwrap');
 const panel=document.getElementById('peng-panel');
 const top=document.getElementById('top-bar');
 let scheduled=false;
 function fit(){
  scheduled=false;
  const a=getComputedStyle(area),w=getComputedStyle(wrap);
  const panelWidth=getComputedStyle(panel).display==='none'?0:panel.offsetWidth+14;
  const frame=parseFloat(w.paddingLeft)+parseFloat(w.paddingRight)+parseFloat(w.borderLeftWidth)+parseFloat(w.borderRightWidth);
  const availableWidth=area.clientWidth-parseFloat(a.paddingLeft)-parseFloat(a.paddingRight)-panelWidth-frame;
  const availableHeight=area.clientHeight-parseFloat(a.paddingTop)-parseFloat(a.paddingBottom)-top.offsetHeight-6-frame;
  const cell=Math.max(12,Math.min(76,Math.floor((Math.min(availableWidth,availableHeight)-21)/8)));
  document.documentElement.style.setProperty('--cell',cell+'px');
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(fit);}}
 new ResizeObserver(schedule).observe(area);
 addEventListener('resize',schedule);document.fonts.ready.then(schedule);fit();
})();
