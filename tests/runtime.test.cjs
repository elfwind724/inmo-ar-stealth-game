const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const Three = require('three');
const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

async function runtime() {
  const dom = new JSDOM(source, { url:'https://game.example/', runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:new VirtualConsole() });
  const win=dom.window;
  await new Promise(resolve=>win.addEventListener('load',resolve,{once:true}));
  let clock=0, nextFrame;
  Object.defineProperty(win.performance,'now',{value:()=>clock});
  win.requestAnimationFrame=callback=>{nextFrame=callback;return 1;};
  win.HTMLCanvasElement.prototype.getContext=function(){
    return new Proxy({canvas:this,measureText:text=>({width:String(text).length*8})},{get:(object,key)=>key in object?object[key]:()=>({addColorStop(){}})});
  };
  win.HTMLElement.prototype.setPointerCapture=function(){};
  class Renderer {
    constructor(){this.domElement=win.document.createElement('canvas');this.shadowMap={};}
    setSize(w,h){this.domElement.width=w;this.domElement.height=h;}
    setPixelRatio(){}
    render(){}
  }
  win.THREE={...Three,WebGLRenderer:Renderer};
  const context=dom.getInternalVMContext();
  const evaluate=code=>vm.runInContext(code,context);
  evaluate(fs.readFileSync(path.join(__dirname,'../game-rules.js'),'utf8'));
  evaluate(fs.readFileSync(path.join(__dirname,'../showroom-assets.js'),'utf8'));
  evaluate(fs.readFileSync(path.join(__dirname,'../police-chapter.js'),'utf8'));
  for(const m of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if(m[1].trim()) evaluate(m[1]);
  evaluate('SoundFX.enabled=false');
  win.onload();
  const frames=(n=1)=>{for(let i=0;i<n;i++){clock+=50;nextFrame(clock);}};
  const value=code=>JSON.parse(JSON.stringify(evaluate(code)));
  const click=id=>win.document.getElementById(id).click();
  return {dom,win,evaluate,frames,value,click};
}

test('production game boot, menus, navigation, capture, replay and ranking flow', async t=>{
  const game=await runtime();t.after(()=>game.dom.window.close());
  const {win,evaluate,frames,value,click}=game;

  await t.test('boots the real scene with six cabinets and four cameras',()=>{
    assert.deepEqual(value('({counters:counterMeshes.length,cameras:securityCameras.length,status:gameState.status,z:player.pos.z})'),{counters:6,cameras:4,status:'PLAYING',z:8.8});
    assert.ok(win.document.getElementById('boot-status').classList.contains('hidden'));
    frames();
  });

  await t.test('catalog and leaderboard freeze game time and movement',()=>{
    click('btn-price-info');
    const before=value('gameState.elapsedTime');frames(40);
    assert.equal(value('gameState.elapsedTime'),before);
    click('btn-close-catalog');frames();assert.ok(value('gameState.elapsedTime')>before);
    click('btn-leaderboard');const time=value('gameState.elapsedTime');frames(20);
    assert.equal(value('gameState.elapsedTime'),time);click('btn-close-leaderboard');
  });

  await t.test('blur clears held keys and pauses until resume',()=>{
    win.dispatchEvent(new win.KeyboardEvent('keydown',{key:'w',bubbles:true}));frames(2);
    win.dispatchEvent(new win.Event('blur'));
    const before=value('({x:player.pos.x,z:player.pos.z,time:gameState.elapsedTime})');frames(20);
    assert.deepEqual(value('({x:player.pos.x,z:player.pos.z,time:gameState.elapsedTime})'),before);
    assert.equal(value("keys.w"),false);click('btn-resume');frames();
    assert.ok(value('gameState.elapsedTime')>before.time);
  });

  await t.test('navigation reaches every cabinet and never auto-steals on arrival',()=>{
    click('btn-restart-quick');
    for(let i=0;i<6;i++){
      win.document.querySelectorAll('#mission-list button')[i].click();
      let limit=500;
      while(value('player.path.length')&&limit-->0) frames();
      assert.ok(limit>0,'navigation must not get stuck');
      assert.ok(value(`Math.hypot(player.pos.x-GLASSES_DATA[${i}].pos.x,player.pos.z-GLASSES_DATA[${i}].pos.z)`)<2.95);
      assert.equal(value('gameState.stealingTarget'),null);
    }
    assert.equal(value('gameState.stolenCount'),0);
  });

  await t.test('camera capture wins on a finishing frame; replay resets crouch and overlays',()=>{
    evaluate("isPointInVisionCone=()=>true; player.pos.set(-8.2,0,-2.45); player.path=[]; player.targetDest=null; gameState.stealingTarget=counterMeshes[0]; gameState.stealProgress=.999;");
    frames();assert.equal(value('gameState.status'),'GAMEOVER');assert.equal(value('GLASSES_DATA[0].stolen'),false);
    click('btn-play-again');
    assert.equal(value('gameState.status'),'PLAYING');assert.equal(value('player.isCrouching'),false);
    assert.equal(value('player.pos.z'),8.8);
  });

  await t.test('sixth safe steal auto-records a genuine win and renaming does not duplicate it',()=>{
    evaluate("isPointInVisionCone=()=>false; GLASSES_DATA.forEach((g,i)=>g.stolen=i<5); gameState.stolenCount=5; gameState.score=GLASSES_DATA.slice(0,5).reduce((n,g)=>n+g.priceRmb,0); player.pos.set(9.6,0,4.05); player.path=[]; player.targetDest=null; gameState.stealingTarget=counterMeshes[5]; gameState.stealProgress=.999;");
    frames();assert.equal(value('gameState.status'),'VICTORY');assert.equal(value('gameState.stolenCount'),6);
    const records=JSON.parse(win.localStorage.getItem('inmo_stealth_leaderboard_v2'));
    assert.equal(records.length,1);assert.ok(records[0].score>20994);
    win.document.getElementById('player-name-input').value='<潜行者>';
    click('btn-save-score');
    const renamed=JSON.parse(win.localStorage.getItem('inmo_stealth_leaderboard_v2'));
    assert.equal(renamed.length,1);assert.equal(renamed[0].name,'<潜行者>');
    assert.ok(win.document.getElementById('leaderboard-rows').textContent.includes('<潜行者>'));
    assert.equal(win.document.querySelector('#leaderboard-rows 潜行者'),null);
  });

  await t.test('touch cancellation releases movement instead of leaving a stuck direction',()=>{
    click('btn-play-again');const el=win.document.getElementById('dpad-up');
    const down=new win.Event('pointerdown',{cancelable:true});Object.defineProperty(down,'pointerId',{value:1});el.dispatchEvent(down);
    assert.equal(value('keys.w'),true);el.dispatchEvent(new win.Event('pointercancel',{cancelable:true}));assert.equal(value('keys.w'),false);
  });
});
