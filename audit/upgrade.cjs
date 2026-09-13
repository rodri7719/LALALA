// One-time migration of the recovered lab. Originals remain in recovered/.
const fs=require('node:fs');
let html=fs.readFileSync('pudgy-crush-lab/index.html','utf8').replaceAll('\r\n','\n');
function change(a,b){if(!html.includes(a))throw Error('Missing migration anchor: '+a.slice(0,90));html=html.replace(a,b);}
change('<script>','<script>\nlet runEpoch=0, resultSaved=true;\nconst lightEffects=matchMedia("(pointer: coarse), (max-width: 760px), (prefers-reduced-motion: reduce)").matches;\ndocument.documentElement.classList.toggle("light-effects",lightEffects);\n');
change('function timeUp(){','function timeUp(){\n  if(!gameActive)return;\n  gameActive=false;clearInterval(timerInterval);\n');
change('function gameOver(reason){','function gameOver(reason){if(resultSaved)return;resultSaved=true;runEpoch++;sel=null;anim=false;');
change('function startGame(){','function startGame(){\n  runEpoch++;resultSaved=false;sel=null;anim=false;\n');
change('function goMenu(){','function goMenu(){runEpoch++;resultSaved=true;sel=null;anim=false;');
change('function nextLevel(){','function nextLevel(){runEpoch++;sel=null;anim=false;');
// Scope delayed UI and state changes to the run that created them.
html=html.replaceAll('setTimeout(', 'runLater(');
change('function sleep(ms){return new Promise(r=>runLater(r,ms));}',`function sleep(ms){return new Promise(r=>window.setTimeout(r,ms));}
function runLater(callback,ms){const epoch=runEpoch;return window.setTimeout(()=>{if(epoch===runEpoch)callback();},ms);}`);
change('async function trySwap(r1,c1,r2,c2){','async function trySwap(r1,c1,r2,c2){\n  if(!gameActive||anim||Math.abs(r1-r2)+Math.abs(c1-c2)!==1||!board[r1]?.[c1]||!board[r2]?.[c2])return;\n  const epoch=runEpoch;');
change('await processM(m);await cascade();checkState();','await processM(m);if(epoch!==runEpoch||!gameActive)return;await cascade();if(epoch!==runEpoch||!gameActive)return;checkState();');
change('async function processM(mg){','async function processM(mg){\n  const epoch=runEpoch;');
change('await sleep(300);','await sleep(lightEffects?180:240);\n  if(epoch!==runEpoch||!gameActive)return;');
change('async function cascade(){let had=true;while(had){','async function cascade(){const epoch=runEpoch;let had=true;while(had&&gameActive&&epoch===runEpoch){');
change('await sleep(285);','await sleep(lightEffects?180:240);\n  if(epoch!==runEpoch||!gameActive)return;');
change('processM=async function(mg){','processM=async function(mg){\n  const epoch=runEpoch;');
change('await originalProcessM(mg);\n  updateCollectiblePositions();','await originalProcessM(mg);\n  if(epoch!==runEpoch||!gameActive)return;\n  updateCollectiblePositions();');
change('checkState=function(){','checkState=function(){\n  if(!gameActive)return;');
change('cl.appendChild(pc);cl.addEventListener(\'pointerdown\',()=>onClick(r,c));boardEl.appendChild(cl);','cl.appendChild(pc);boardEl.appendChild(cl);');
const inputStart=html.indexOf('// SWIPE');const inputEnd=html.indexOf("document.addEventListener('keydown'",inputStart);
if(inputStart<0||inputEnd<0)throw Error('Input section missing');
html=html.slice(0,inputStart)+`// One pointer pipeline for mouse, pen and touch. Commit on release.
let pointerGesture=null;
boardEl.addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0||!gameActive||anim)return;
  const cell=e.target.closest('.cell');if(!cell)return;
  pointerGesture={id:e.pointerId,r:+cell.dataset.r,c:+cell.dataset.c,x:e.clientX,y:e.clientY};
  boardEl.setPointerCapture(e.pointerId);e.preventDefault();
});
boardEl.addEventListener('pointerup',e=>{
  const p=pointerGesture;if(!p||p.id!==e.pointerId)return;pointerGesture=null;
  if(boardEl.hasPointerCapture(e.pointerId))boardEl.releasePointerCapture(e.pointerId);
  if(!gameActive||anim)return;
  const dx=e.clientX-p.x,dy=e.clientY-p.y;
  if(Math.hypot(dx,dy)<12){onClick(p.r,p.c);return;}
  const r=p.r+(Math.abs(dy)>Math.abs(dx)?Math.sign(dy):0);
  const c=p.c+(Math.abs(dx)>=Math.abs(dy)?Math.sign(dx):0);
  if(sel)getCell(sel.r,sel.c)?.classList.remove('selected');sel=null;
  if(r>=0&&r<ROWS&&c>=0&&c<COLS)void trySwap(p.r,p.c,r,c);
});
boardEl.addEventListener('pointercancel',()=>{pointerGesture=null;});
boardEl.addEventListener('lostpointercapture',()=>{pointerGesture=null;});
`+html.slice(inputEnd);
change('function triggerScreenImpact(){','function triggerScreenImpact(){if(lightEffects)return;');
for(const name of ['fxLightning','fxFireExplosion','fxColumnLight','fxExplosionRays']){
 const re=new RegExp('(function '+name+'\\([^)]*\\)\\{)');
 if(!re.test(html))throw Error(name);html=html.replace(re,'$1if(lightEffects)return;');
}
change('function drawSn(){','function drawSn(){if(lightEffects||document.hidden){window.setTimeout(drawSn,500);return;}');
change('function drawFx(){','function drawFx(){if(document.hidden||fxP.length===0){fxX.clearRect(0,0,fxC.width,fxC.height);window.setTimeout(drawFx,100);return;}');
change('function spFx(x,y,col,n,sp=1){','function spFx(x,y,col,n,sp=1){if(lightEffects)n=Math.min(n,3);n=Math.min(n,Math.max(0,(lightEffects?60:250)-fxP.length));');
change("function spConf(x,y,n){","function spConf(x,y,n){if(lightEffects)n=Math.min(n,5);n=Math.min(n,Math.max(0,(lightEffects?60:250)-fxP.length));");
change("const el=document.getElementById('bwrap');\n  if(!el)return;","const el=document.getElementById('bwrap');\n  if(!el||lightEffects)return;");
change("img.src=url+(url.includes('?')?'&':'?')+'v='+(Date.now());","img.src=url;");
// Stop rewriting every piece and rerolling its ambient animation if it did not change.
change("if(b){pc.className=", "if(b){pc.className="); // validate old renderer before modifying updater only
change("function updCell(r,c){const cl=getCell(r,c);if(!cl)return;const pc=cl.querySelector('.piece');const b=board[r][c];",`function updCell(r,c){const cl=getCell(r,c);if(!cl)return;const pc=cl.querySelector('.piece');const b=board[r][c];
  const visualKey=b?b.type+':'+(b.pw||''):'empty';
  if(pc.dataset.visualKey===visualKey)return;
  pc.dataset.visualKey=visualKey;`);
html=html.replaceAll('const rn=Math.random();if(!b.pw)', 'const rn=lightEffects?1:Math.random();if(!b.pw)');
change('</head>','<link rel="stylesheet" href="responsive.css">\n</head>');
change('</body>','<script src="layout.js"></script></body>');
fs.writeFileSync('pudgy-crush-lab/index.html',html);
