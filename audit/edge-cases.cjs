const {chromium}=require('C:/Users/jorda/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto('http://127.0.0.1:5174');await page.click('#btn-play');
 const result=await page.evaluate(async()=>{
  isMuted=true;stopMusic();stopNoMoveWatch();
  let calls=0;const end=gameOver;gameOver=()=>{calls++;end();};
  score=100;timeLeft=0.05;
  await new Promise(r=>setTimeout(r,2200));
  const timeout={calls,lifePoints:pcLifePts};
  // Reproduce an outstanding cascade completing after a run was ended.
  startGame();clearInterval(timerInterval);stopNoMoveWatch();
  const move=findVM();const pending=trySwap(move.r1,move.c1,move.r2,move.c2);
  goMenu();await pending;
  const afterQuit={gameActive,score,levelCompleteVisible:document.getElementById('lc').classList.contains('show')};
  return {timeout,afterQuit};
 });
 const touchPage=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await touchPage.goto('http://127.0.0.1:5174');await touchPage.locator('#btn-play').tap();
 await touchPage.locator('.cell[data-r="2"][data-c="2"]').tap();
 result.touchAfterSingleTap=await touchPage.evaluate(()=>({sel,selectedCells:document.querySelectorAll('.cell.selected').length}));
 fs.writeFileSync('audit/edge-results.json',JSON.stringify(result,null,2));console.log(result);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
