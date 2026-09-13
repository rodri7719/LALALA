const { chromium } = require('C:/Users/jorda/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>requests.push(r.url()));
 await page.goto('http://127.0.0.1:5174');
 await page.screenshot({path:'audit/menu-desktop.png'});
 await page.click('#btn-play');
 await page.waitForTimeout(700);
 const initial=await page.evaluate(()=>({gameActive,level,score,movesLeft,cells:boardEl.children.length,hasMove:!!findVM(),matches:findM().length}));
 await page.screenshot({path:'audit/game-desktop.png'});
 const move=await page.evaluate(()=>findVM());
 if(move){await page.locator(`.cell[data-r="${move.r1}"][data-c="${move.c1}"]`).click();await page.locator(`.cell[data-r="${move.r2}"][data-c="${move.c2}"]`).click();}
 await page.waitForTimeout(2500);
 const afterMove=await page.evaluate(()=>({score,movesLeft,anim,gameActive}));
 const probes=await page.evaluate(()=>{
  gameActive=false;clearInterval(timerInterval);stopNoMoveWatch();stopMusic();
  const results=[];
  for(let lv=1;lv<=25;lv++){
   level=lv;buildActiveTypes(lv);levelConfig=getLevelConfig(lv);mkBoard();
   results.push({level:lv,shape:levelConfig.shape,survival:isSurvivalLevel(lv),activeTypes:[...activeTypes],missions:levelConfig.missions,blockedIce:levelConfig.ice.filter(([r,c])=>blockedCells.some(([br,bc])=>br===r&&bc===c)),blockedCollectibles:(levelConfig.collectibles||[]).filter(([r,c])=>blockedCells.some(([br,bc])=>br===r&&bc===c)),hasMove:!!findVM(),matches:findM().length});
  }
  // The alleged guaranteed pattern contains only TWO pieces of the matching type.
  board=Array.from({length:8},()=>Array(8).fill(null));
  blockedCells=[];iceBoard=crateBoard=stoneBoard=webBoard=Array.from({length:8},()=>Array(8).fill(0));
  board[3][3]={type:0};board[3][4]={type:0};board[4][3]={type:1};
  const fallbackHasMove=!!findVM();
  // Initial-board prevention must reject a third identical piece.
  board=Array.from({length:8},()=>Array(8).fill(null));board[0][0]={type:0};board[0][1]={type:0};
  const rejectsThirdOnNull=wouldM(0,2,0);
  return {levels:results,fallbackHasMove,rejectsThirdOnNull};
 });
 await page.reload();await page.setViewportSize({width:390,height:844});await page.click('#btn-play');await page.waitForTimeout(400);
 await page.screenshot({path:'audit/game-mobile.png'});
 const mobile=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,board:JSON.parse(JSON.stringify(boardEl.getBoundingClientRect()))}));
 const doubleEnd=await page.evaluate(()=>{score=100;gameOver();let once=pcLifePts;gameOver();return {once,twice:pcLifePts};});
 fs.writeFileSync('audit/results.json',JSON.stringify({initial,afterMove,probes,mobile,doubleEnd,errors,requests},null,2));
 await browser.close();
 console.log(JSON.stringify({initial,afterMove,mobile,doubleEnd,errors,fallbackHasMove:probes.fallbackHasMove,blocked:probes.levels.filter(x=>x.blockedIce.length||x.blockedCollectibles.length)},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
