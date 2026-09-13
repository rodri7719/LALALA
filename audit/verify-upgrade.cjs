const {chromium}=require('C:/Users/jorda/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const errors=[],results=[];
 for(const [width,height] of [[1440,1000],[360,740],[390,844],[430,932],[844,390]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:width<900,hasTouch:width<900});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5174');await page.click('#btn-play');await page.waitForTimeout(250);
  const geometry=await page.evaluate(()=>{
   const b=document.getElementById('bwrap').getBoundingClientRect();
   return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:innerWidth,height:innerHeight,lightEffects};
  });
  assert(geometry.left>=0&&geometry.right<=width&&geometry.top>=0&&geometry.bottom<=height,JSON.stringify(geometry));
  if(width===390){
   await page.locator('.cell[data-r="2"][data-c="2"]').tap();
   assert.equal(await page.evaluate(()=>document.querySelectorAll('.cell.selected').length),1);
   await page.locator('.cell[data-r="2"][data-c="2"]').tap();
   assert.equal(await page.evaluate(()=>sel),null);
  }
  const move=await page.evaluate(()=>findVM());assert(move);
  await page.locator(`.cell[data-r="${move.r1}"][data-c="${move.c1}"]`).click();
  await page.locator(`.cell[data-r="${move.r2}"][data-c="${move.c2}"]`).click();
  await page.waitForFunction(()=>!anim);
  assert.equal(await page.evaluate(()=>movesLeft),29);
  assert(await page.evaluate(()=>score>0));
  await page.screenshot({path:`audit/upgraded-${width}x${height}.png`});
  results.push(geometry);await page.close();
 }
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5174');await page.click('#btn-play');
 const timer=await page.evaluate(async()=>{
  isMuted=true;stopMusic();score=100;timeLeft=.05;const before=pcLifePts;
  await new Promise(r=>window.setTimeout(r,2200));
  const first=pcLifePts-before;gameOver();return {first,afterDuplicate:pcLifePts-before,gameActive};
 });assert.equal(timer.first,100);assert.equal(timer.afterDuplicate,100);
 const cancellation=await page.evaluate(async()=>{
  startGame();const move=findVM();const pending=trySwap(move.r1,move.c1,move.r2,move.c2);
  goMenu();startGame();const snapshot=JSON.stringify(board);await pending;
  return {sameBoard:snapshot===JSON.stringify(board),score,movesLeft,anim};
 });assert.equal(cancellation.sameBoard,true);assert.equal(cancellation.score,0);assert.equal(cancellation.movesLeft,30);assert.equal(cancellation.anim,false);
 assert.deepEqual(errors,[]);
 fs.writeFileSync('audit/upgrade-results.json',JSON.stringify({results,timer,cancellation,errors},null,2));
 console.log(JSON.stringify({results,timer,cancellation,errors},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
