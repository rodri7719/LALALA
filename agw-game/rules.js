/* Shared rules for the guest build. Loaded after the recovered engine. */
(() => {
  const legacyConfig=getLevelConfig;
  getLevelConfig=function(lv){
    const cfg=structuredClone(legacyConfig(lv));
    const blocked=new Set(getShapeCells(cfg.shape).map(([r,c])=>`${r},${c}`));
    const occupied=new Set();
    const open=[];
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(!blocked.has(`${r},${c}`))open.push([r,c]);
    for(const kind of ['ice','crates','stones','jelly','webs','bombs','collectibles']){
      cfg[kind]=(cfg[kind]||[]).flatMap(item=>{
        const suitable=([r,c])=>!blocked.has(`${r},${c}`)&&!occupied.has(`${r},${c}`)&&
          (kind!=='collectibles'||(r<ROWS-1&&Array.from({length:ROWS-r},(_,i)=>r+i).every(row=>!blocked.has(`${row},${c}`))));
        let pos=item.slice(0,2);
        if(!suitable(pos))pos=open.find(suitable);
        if(!pos)return [];
        occupied.add(`${pos[0]},${pos[1]}`);return [[...pos,...item.slice(2)]];
      });
    }
    const missionKinds={ice:'ice',crate:'crates',stone:'stones',jelly:'jelly',web:'webs',bomb:'bombs',collectible:'collectibles'};
    cfg.missions=cfg.missions.flatMap(m=>{
      const kind=missionKinds[m.type];if(!kind)return [m];
      const count=Math.min(m.count,cfg[kind].length);
      return count>0?[{...m,count}]:[];
    });
    return cfg;
  };

  function movable(r,c){return !!board[r]?.[c]&&!blockedCells.some(([br,bc])=>br===r&&bc===c)&&
    !iceBoard[r]?.[c]&&!crateBoard[r]?.[c]&&!stoneBoard[r]?.[c]&&!webBoard[r]?.[c];}
  function groupsForSwap(r,c,nr,nc){
    return findM().filter(group=>group.some(p=>(p.r===r&&p.c===c)||(p.r===nr&&p.c===nc)));
  }
  window.crushSwapMatches=groupsForSwap;
  findVM=function(){
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      if(!movable(r,c))continue;
      for(const [dr,dc] of [[0,1],[1,0]]){
        const nr=r+dr,nc=c+dc;if(!movable(nr,nc))continue;
        swap(r,c,nr,nc);const valid=groupsForSwap(r,c,nr,nc).length>0;swap(r,c,nr,nc);
        if(valid)return {r1:r,c1:c,r2:nr,c2:nc};
      }
    }
    return null;
  };

  // Bounded search. Never label a board playable without checking both invariants.
  function repairBoard(){
    if(findM().length===0&&findVM())return true;
    const free=[];
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(movable(r,c))free.push([r,c]);
    const saved=free.map(([r,c])=>board[r][c]);
    for(let attempt=0;attempt<120;attempt++){
      const pieces=[...saved];
      for(let i=pieces.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pieces[i],pieces[j]]=[pieces[j],pieces[i]];}
      free.forEach(([r,c],i)=>{board[r][c]=pieces[i];});
      if(findM().length===0&&findVM())return true;
    }
    // Preserve powers and blocked cells while assigning fresh regular types if needed.
    for(let attempt=0;attempt<120;attempt++){
      free.forEach(([r,c],i)=>{board[r][c]={...saved[i],type:rndActiveType()};});
      if(findM().length===0&&findVM())return true;
    }
    free.forEach(([r,c],i)=>{board[r][c]=saved[i];});
    return false;
  }
  window.crushRepairBoard=repairBoard;
  const legacyBoard=mkBoard;
  mkBoard=function(){
    // Old obstacles must not participate in validation of the next level.
    stoneBoard=[];webBoard=[];bombBoard=[];
    legacyBoard();
    if(!repairBoard())throw new Error('No se pudo crear un tablero válido para el nivel '+level);
  };

  doAutoShuffle=async function(automatic=false){
    if(!gameActive||anim||(!automatic&&autoShuffleUsed>=AUTO_SHUFFLE_MAX))return;
    const epoch=runEpoch;anim=true;
    // Manual shuffles intentionally mix a valid board; recovery shuffles are free.
    if(!automatic){
      autoShuffleUsed++;
      const free=[];for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)if(movable(r,c))free.push([r,c]);
      const pieces=free.map(([r,c])=>board[r][c]);
      for(let i=pieces.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pieces[i],pieces[j]]=[pieces[j],pieces[i]];}
      free.forEach(([r,c],i)=>{board[r][c]=pieces[i];});
    }
    const ok=repairBoard();updAll();animFall();updateShuffleBtn();
    pengR('celebrate',ok?'Nueva combinación de piezas 🔀':'No quedan jugadas');
    await sleep(200);if(epoch!==runEpoch||!gameActive)return;
    anim=false;noMoveSince=null;pendingNoMoveCheck=false;
    if(!ok){gameOver('blocked');return;}resetH();
  };
  checkState=function(){
    if(!gameActive)return;
    if(!isSurvivalLevel(level)&&allMissionsDone()){lvlComplete();return;}
    if(!isSurvivalLevel(level)&&movesLeft<=0){gameOver();return;}
    if(!anim&&!findVM())void doAutoShuffle(true);
    updateGoalProgress();
  };
  // Campaign is turn-based. Survival keeps its own HP and timer system.
  startTimer=function(){clearInterval(timerInterval);timerInterval=null;};
  const legacyTimerUI=updateTimerUI;
  updateTimerUI=function(){
    legacyTimerUI();
    document.getElementById('hud-time-chip').hidden=true;
    document.getElementById('timer-wrap').style.display='none';
  };
  function updateGoalProgress(){
    const total=levelConfig?.missions?.reduce((n,m)=>n+m.count,0)||1;
    const done=missionProgress.reduce((n,p,i)=>n+Math.min(p.current,levelConfig.missions[i]?.count||0),0);
    document.getElementById('prog-bar').style.width=Math.min(100,100*done/total)+'%';
  }
  const legacyHUD=updHUD;
  updHUD=function(){legacyHUD();updateGoalProgress();};
  const legacyMissions=initMissions;
  initMissions=function(){legacyMissions();updateGoalProgress();
    const tips={1:'Intercambiá dos vecinos y juntá 3 iguales. Completá los objetivos sin reloj.',2:'Rompé el hielo combinando piezas a su lado.',3:'Supervivencia: combiná rápido para recuperar vida.',4:'La forma cambia: buscá combinaciones dentro del mapa.',5:'Combiná 4 piezas para crear una bomba.'};
    document.getElementById('play-tip').textContent=tips[level]||(isSurvivalLevel(level)?'Mantené la vida hasta que termine el tiempo.':'Completá los objetivos antes de quedarte sin movimientos.');
  };
})();
