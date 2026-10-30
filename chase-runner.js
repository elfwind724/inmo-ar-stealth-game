(function(global){
  'use strict';

  const LIMIT=180,CHASER_SPEED=80;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const smooth=n=>{n=clamp(n,0,1);return n*n*(3-2*n);};

  function create({THREE:T,renderer,player,emcee,sound,onWin,onLose,onPause,onMusic}){
    const scene=new T.Scene();
    scene.background=new T.Color(0x172a36).convertSRGBToLinear();
    scene.fog=new T.Fog(scene.background,24,78);
    scene.environment=player.group.parent?.environment||null;
    const camera=new T.PerspectiveCamera(43,9/16,.1,115);
    const state={elapsed:0,health:100,speed:86,phase:'IDLE',paused:false,taps:0,hits:0,maxSpeed:86};
    let active=false,phaseTime=0,runCycle=0,chaserCycle=0,gap=5.8,slowTime=0,cooldown=0,kickTime=-1,kickOrigin=5.8;
    let strikeDone=false,hitTime=-1,hitFlash=0,roadDistance=0,callbackDone=false,lastTap=-1e6;
    let viewWidth=405,viewHeight=720,viewLeft=0,savedRenderer=null;
    const cameraBase=new T.Vector3(0,11.2,17.5),lookAt=new T.Vector3(0,1,-2.5);
    const roadParts=[],scenery=[],speedStreaks=[],particles=[];
    const M=(hex,roughness=.8,metalness=0)=>new T.MeshStandardMaterial({color:new T.Color(hex).convertSRGBToLinear(),roughness,metalness});
    const basic=(hex,opacity=1)=>new T.MeshBasicMaterial({color:new T.Color(hex).convertSRGBToLinear(),transparent:opacity<1,opacity,depthWrite:opacity>=1,toneMapped:false});
    const boxGeometry=new T.BoxGeometry(1,1,1);
    function box(w,h,d,x,y,z,material,parent=scene){
      const mesh=new T.Mesh(boxGeometry,material);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);mesh.receiveShadow=true;parent.add(mesh);return mesh;
    }

    const roadMat=M(0x26343f,.95),walkMat=M(0x667779,.94),lineMat=M(0xd8bd72,.82);
    box(8.4,.15,110,0,-.12,-28,roadMat);
    for(const side of [-1,1]){
      box(2.1,.25,110,side*5.15,-.06,-28,walkMat);
      box(.09,.035,110,side*3.9,.018,-28,lineMat);
    }
    for(let i=0;i<15;i++)roadParts.push(box(.13,.02,2.6,0,.025,-66+i*6,lineMat));
    const windowMats=[basic(0xffd297),basic(0xa4d4e0),basic(0xceb7e9)];
    const wallMats=[M(0x364855),M(0x354047),M(0x4a494d)];
    function sign(text,color){
      const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#14242d';ctx.fillRect(0,0,256,96);ctx.strokeStyle=color;ctx.lineWidth=4;ctx.strokeRect(3,3,250,90);
      ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 35px Arial,"Microsoft YaHei",sans-serif';ctx.fillText(text,128,49);
      const texture=new T.CanvasTexture(canvas);texture.encoding=T.sRGBEncoding;
      return new T.MeshBasicMaterial({map:texture,toneMapped:false});
    }
    const signMats=[sign('INMO','#f2ca83'),sign('11.04','#b4dbe1'),sign('RUN !','#f09e8b')];
    for(let row=0;row<7;row++)for(const side of [-1,1]){
      const group=new T.Group();group.position.set(0,0,-66+row*13);scene.add(group);scenery.push(group);
      const height=5+(row%3)*1.4,x=side*(7.5+(row%2)*.7);
      box(4,height,10,x,height/2,-1,wallMats[row%wallMats.length],group);
      for(let floor=0;floor<3;floor++){
        box(.035,.8,1.7,side*5.47,1.3+floor*1.45,-2.7,windowMats[(row+floor)%3],group);
        box(.035,.8,1.7,side*5.47,1.3+floor*1.45,.2,windowMats[(row+floor+1)%3],group);
      }
      const poster=new T.Mesh(new T.PlaneGeometry(2.2,.82),signMats[row%3]);poster.position.set(side*5.45,2.0,3.6);poster.rotation.y=-side*Math.PI/2;group.add(poster);
      box(.08,4.8,.08,side*4.75,2.4,4.7,M(0x374a55,.38,.55),group);
      box(.85,.09,.22,side*4.4,4.8,4.7,windowMats[0],group);
    }
    scene.add(new T.HemisphereLight(0xc6e5ff,0x293638,.95));
    const keyLight=new T.DirectionalLight(0xffd9a5,1.55);keyLight.position.set(-4,10,6);scene.add(keyLight);
    const fillLight=new T.DirectionalLight(0x88bedb,.65);fillLight.position.set(5,5,-12);scene.add(fillLight);

    function cloneActor(source,isPlayer){
      const original=[],cloned=[],group=source.group.clone(true);
      source.group.traverse(o=>original.push(o));group.traverse(o=>cloned.push(o));
      const ref=o=>o?cloned[original.indexOf(o)]:null;
      const actor={group,body:ref(isPlayer?source.bodyGroup:source.body),legL:ref(isPlayer?source.legL:source.legL.hip),legR:ref(isPlayer?source.legR:source.legR.hip),
        kneeL:isPlayer?null:ref(source.legL.knee),kneeR:isPlayer?null:ref(source.legR.knee),
        armL:ref(isPlayer?source.armL:source.armL.shoulder),armR:ref(isPlayer?source.armR:source.armR.shoulder),
        elbowL:isPlayer?null:ref(source.armL.elbow),elbowR:isPlayer?null:ref(source.armR.elbow)};
      if(isPlayer&&source.ringMesh)ref(source.ringMesh).visible=false;
      if(!isPlayer){if(source.phone)ref(source.phone).visible=false;if(source.microphone)ref(source.microphone).visible=false;}
      group.visible=true;group.position.set(0,0,0);group.rotation.set(0,Math.PI,0);
      actor.body.rotation.set(0,0,0);actor.body.position.set(0,0,0);actor.body.scale.set(1,1,1);
      group.traverse(o=>{if(o.isMesh)o.frustumCulled=false;});scene.add(group);return actor;
    }
    const hero=cloneActor(player,true),chaser=cloneActor(emcee,false);
    const originalHeroScale=hero.group.scale.clone(),originalChaserScale=chaser.group.scale.clone();
    const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;
    const shadowCtx=shadowCanvas.getContext('2d'),shadowGradient=shadowCtx.createRadialGradient(64,64,4,64,64,62);
    shadowGradient.addColorStop(0,'rgba(0,0,0,.65)');shadowGradient.addColorStop(1,'rgba(0,0,0,0)');shadowCtx.fillStyle=shadowGradient;shadowCtx.fillRect(0,0,128,128);
    const chaserShadow=new T.Mesh(new T.PlaneGeometry(1.6,1.35),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,opacity:.7,depthWrite:false,toneMapped:false}));
    chaserShadow.rotation.x=-Math.PI/2;chaserShadow.position.y=.02;scene.add(chaserShadow);
    const whiteStreak=basic(0xcce5e4,.2);
    for(let i=0;i<18;i++){
      const mesh=box(.028,.028,1.2+(i%4)*.65,(i%2?-1:1)*(2.4+(i%5)*.48),.45+(i%4)*.5,-40+i*3.3,whiteStreak);
      speedStreaks.push(mesh);
    }
    const ring=new T.Mesh(new T.TorusGeometry(.45,.045,6,36),basic(0xffe6a3,.9));ring.visible=false;scene.add(ring);
    const kickArc=new T.Mesh(new T.TorusGeometry(.75,.035,6,30,Math.PI*1.05),basic(0xffc371,.8));kickArc.rotation.y=Math.PI/2;kickArc.visible=false;scene.add(kickArc);
    const particleGeometry=new T.SphereGeometry(.07,5,4);
    for(let i=0;i<28;i++){
      const material=basic(i%3?0xffd894:0xe5f5ff,.95),mesh=new T.Mesh(particleGeometry,material);mesh.visible=false;scene.add(mesh);
      particles.push({mesh,life:0,total:1,v:new T.Vector3()});
    }

    const root=document.createElement('section');root.id='chase-screen';root.hidden=true;root.setAttribute('aria-label','第二关：追逐');
    root.innerHTML=`<div id="chase-frame">
      <button id="chase-tap-pad" type="button" aria-label="连续点击加速"><span class="chase-sr-only">点击或按空格加速，保持80码以上，坚持三分钟。</span></button>
      <div class="chase-top"><div class="chase-heading"><span>第二关 <b>追逐</b></span><div class="chase-controls"><button id="chase-music-toggle" data-music-toggle type="button" aria-label="切换背景音乐">♫ 音乐</button><button id="chase-pause" type="button" aria-label="暂停追逐">Ⅱ</button></div></div>
        <div class="chase-health-line"><span>生命 <strong id="chase-health-value">100%</strong></span><span id="chase-time">03:00</span></div><div class="chase-health-track"><i id="chase-health-fill"></i></div>
        <div class="chase-speed-line"><span><strong id="chase-speed">86</strong><small>码</small></span><span class="chase-target">小影恒速 <b>80 码</b><small>飞踹命中 −15% 生命</small></span></div>
        <div class="chase-progress"><i id="chase-progress-fill"></i></div><p id="chase-warning">保持节奏，别停下来</p>
      </div>
      <span id="chase-player-label" class="chase-actor-label">你 · 带着眼镜快跑</span><span id="chase-xiaoying-label" class="chase-actor-label chaser-label">inmo小影 · 80 码</span>
      <div class="chase-tap-hint"><span class="chase-tap-ripple"></span><strong>连点加速</strong><span>点击画面 / 手指轻点 / 空格</span></div>
      <div id="chase-hit-flash"></div><strong id="chase-hit-callout" aria-hidden="true">飞踹！ −15%</strong>
      <div id="chase-countdown" aria-live="polite"></div><div id="chase-pause-hint">已暂停</div>
      <div id="chase-title"><span>INMO / RUN FOR IT</span><h2>第二关</h2><strong>追逐</strong><p>小影追来了。连续点击，保持 80 码以上。</p></div>
    </div>`;
    document.body.appendChild(root);
    const byId=id=>root.querySelector('#'+id);
    const frame=byId('chase-frame'),tapPad=byId('chase-tap-pad'),healthValue=byId('chase-health-value'),healthFill=byId('chase-health-fill'),speedValue=byId('chase-speed');
    const timeValue=byId('chase-time'),warning=byId('chase-warning'),progress=byId('chase-progress-fill'),title=byId('chase-title'),countdown=byId('chase-countdown');
    const pausedHint=byId('chase-pause-hint'),flash=byId('chase-hit-flash'),hitCallout=byId('chase-hit-callout'),playerLabel=byId('chase-player-label'),chaserLabel=byId('chase-xiaoying-label');

    function tap(){
      if(!active||state.paused||state.phase!=='RUNNING')return false;
      const now=performance.now();if(now-lastTap<55)return false;lastTap=now;
      state.speed=Math.min(128,state.speed+4.8);state.maxSpeed=Math.max(state.maxSpeed,state.speed);state.taps++;
      frame.style.setProperty('--tap-flash','.12');
      return true;
    }
    tapPad.addEventListener('pointerdown',event=>{
      if(event.pointerType==='mouse'&&event.button!==0)return;
      event.preventDefault();event.stopPropagation();tapPad.focus({preventScroll:true});tap();
    });
    window.addEventListener('keydown',event=>{
      if(!active||state.paused||![' ','Enter'].includes(event.key)||event.repeat)return;
      const control=event.target.closest?.('input,textarea,select,button,a,[contenteditable="true"]');
      if(control&&control!==tapPad)return;
      event.preventDefault();tap();
    });
    byId('chase-pause').addEventListener('click',event=>{event.stopPropagation();if(active&&!callbackDone)onPause?.();});
    byId('chase-music-toggle').addEventListener('click',event=>{event.stopPropagation();if(active)onMusic?.();});

    function resetPose(actor){
      actor.body.position.set(0,0,0);actor.body.rotation.set(0,0,0);
      for(const limb of [actor.legL,actor.legR,actor.kneeL,actor.kneeR,actor.armL,actor.armR,actor.elbowL,actor.elbowR])limb?.rotation.set(0,0,0);
    }
    function runPose(actor,cycle,amplitude){
      resetPose(actor);const wave=Math.sin(cycle),other=Math.sin(cycle+Math.PI);
      actor.body.rotation.x=.13;actor.body.position.y=Math.abs(Math.sin(cycle*2))*.055;
      actor.legL.rotation.x=wave*amplitude;actor.legR.rotation.x=other*amplitude;
      if(actor.kneeL){actor.kneeL.rotation.x=Math.max(0,-wave)*.95;actor.kneeR.rotation.x=Math.max(0,-other)*.95;}
      actor.armL.rotation.x=-wave*.85-.22;actor.armR.rotation.x=wave*.85-.22;
      if(actor.elbowL){actor.elbowL.rotation.x=-.9;actor.elbowR.rotation.x=-.9;}
    }
    function emitImpact(){
      for(let i=0;i<particles.length;i++){
        const p=particles[i],a=i/particles.length*Math.PI*2;
        p.life=.25+(i%5)*.045;p.total=p.life;p.mesh.visible=true;p.mesh.material.opacity=.95;
        p.mesh.position.set(hero.group.position.x,.9,hero.group.position.z+.25);
        p.v.set(Math.cos(a)*(2.8+i%3),1.2+(i%4)*.8,Math.sin(a)*3.0);p.mesh.scale.setScalar(.6+(i%3)*.5);
      }
      ring.position.set(0,1.05,hero.group.position.z+.3);ring.scale.setScalar(.6);ring.material.opacity=.95;ring.visible=true;
    }
    function strike(){
      if(strikeDone)return;strikeDone=true;state.health=Math.max(0,state.health-15);state.hits++;
      state.speed=Math.max(38,state.speed-9);hitTime=0;hitFlash=.5;emitImpact();
      if(sound?.enabled){sound.playTone(78,'triangle',.15,.24,32);sound.playTone(180,'sawtooth',.065,.055,70);}
      if(state.health<=0)finish(false);
    }
    function finish(won){
      if(callbackDone)return;callbackDone=true;state.phase=won?'WON':'LOST';state.elapsed=Math.min(LIMIT,state.elapsed);
      renderUI();const result={health:state.health,elapsed:state.elapsed,taps:state.taps,hits:state.hits,maxSpeed:state.maxSpeed};
      if(won)onWin?.(result);else onLose?.(result);
    }
    function animateActors(dt){
      runCycle+=dt*(state.phase==='RUNNING'?9+state.speed*.025:8);
      chaserCycle+=dt*(state.phase==='RUNNING'?11.2:8);
      runPose(hero,runCycle,.85);runPose(chaser,chaserCycle+.8,.98);
      hero.group.position.set(Math.sin(runCycle*.5)*.035,0,-4.5);chaser.group.position.set(Math.sin(runCycle*.4)*.11,-.19,-4.5+gap);
      if(kickTime>=0){
        const t=kickTime,flight=smooth((t-.18)/.35),recover=smooth((t-.62)/.48);
        const attackZ=-4.5+1.05;
        chaser.group.position.x=.12;
        chaser.group.position.z=(1-recover)*(kickOrigin+(attackZ-kickOrigin)*flight)+recover*(-4.5+4.2);
        chaser.group.position.y=-.19+Math.sin(clamp((t-.12)/.8,0,1)*Math.PI)*.78;
        chaser.body.rotation.x=-.25;chaser.body.rotation.z=-.16*Math.sin(clamp(t/1.1,0,1)*Math.PI);
        chaser.legR.rotation.x=t<.25?-.9:-1.7*(1-recover);chaser.kneeR.rotation.x=t<.25?1.35:.035;
        chaser.legL.rotation.x=.8*(1-recover);chaser.kneeL.rotation.x=1.25*(1-recover);
        chaser.armL.rotation.set(-1.0,0,.7);chaser.armR.rotation.set(-.9,0,-.6);
        kickArc.visible=t>.18&&t<.68;kickArc.position.set(.3,1.15+chaser.group.position.y,chaser.group.position.z-.35);kickArc.material.opacity=.8*(1-recover);
      }else kickArc.visible=false;
      if(hitTime>=0){
        const p=clamp(hitTime/.86,0,1),fall=Math.sin(p*Math.PI);
        hero.body.rotation.x=.2+1.15*fall;hero.body.position.y=-.35*fall;
        hero.group.position.z-=1.05*fall;hero.group.position.x=.15*Math.sin(p*Math.PI*2);
        hero.armL.rotation.x=-2.1*fall;hero.armR.rotation.x=-2.0*fall;
        hero.legL.rotation.x=-.5*fall;hero.legR.rotation.x=.8*fall;
      }
      chaserShadow.position.set(chaser.group.position.x,.02,chaser.group.position.z);chaserShadow.scale.setScalar(1+Math.max(0,chaser.group.position.y)*.35);
    }
    function renderUI(){
      healthValue.textContent=state.health+'%';healthFill.style.width=state.health+'%';
      speedValue.textContent=String(Math.round(state.speed));
      const left=Math.max(0,Math.ceil(LIMIT-state.elapsed));timeValue.textContent=String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0');
      progress.style.width=(state.elapsed/LIMIT*100)+'%';
      const danger=state.phase==='RUNNING'&&state.speed<CHASER_SPEED;
      root.classList.toggle('is-danger',danger);root.classList.toggle('low-health',state.health<=30);
      warning.textContent=state.phase==='WON'?'坚持三分钟，甩掉小影！':state.phase==='LOST'?'被小影追上了':state.phase==='COUNTDOWN'?'准备好，开跑！':
        hitTime>=0?'稳住！继续点击加速':kickTime>=0?'小影飞踹！快加速！':danger?'低于 80 码！小影正在追近':'保持节奏，别停下来';
      pausedHint.hidden=!state.paused||callbackDone;
      root.classList.toggle('is-running',state.phase==='RUNNING');
      title.hidden=state.phase!=='TITLE';
      countdown.hidden=state.phase!=='COUNTDOWN';
      if(state.phase==='COUNTDOWN')countdown.textContent=String(Math.max(1,3-Math.floor(phaseTime/.9)));
      const flashRatio=hitFlash/.5;flash.style.opacity=String(flashRatio*.48);hitCallout.style.opacity=String(clamp(flashRatio*1.7,0,1));
      hitCallout.style.transform='translate(-50%,'+(-26*(1-flashRatio))+'px)';
    }
    function update(dt,paused=false){
      if(!active)return;dt=clamp(dt,0,.1);state.paused=Boolean(paused);
      if(state.paused||callbackDone){renderUI();return;}
      phaseTime+=dt;
      if(state.phase==='TITLE'){
        if(phaseTime>=1.55){state.phase='COUNTDOWN';phaseTime=0;}
      }else if(state.phase==='COUNTDOWN'){
        if(phaseTime>=2.7){state.phase='RUNNING';phaseTime=0;lastTap=-1e6;}
      }else if(state.phase==='RUNNING'){
        const runDt=Math.min(dt,LIMIT-state.elapsed);
        state.elapsed=Math.min(LIMIT,state.elapsed+runDt);state.speed=Math.max(30,state.speed-11*runDt);
        cooldown=Math.max(0,cooldown-runDt);
        if(kickTime<0){
          gap=clamp(gap+(state.speed-CHASER_SPEED)/3.6*runDt*.62,1.65,8.4);
          slowTime=state.speed<CHASER_SPEED?slowTime+runDt:Math.max(0,slowTime-runDt*2.7);
          if(state.speed<CHASER_SPEED&&slowTime>=1.2&&gap<4.8&&cooldown<=0){kickTime=0;kickOrigin=-4.5+gap;strikeDone=false;}
        }else{
          kickTime+=runDt;if(kickTime>=.49)strike();
          if(kickTime>=1.1){kickTime=-1;cooldown=3.0;slowTime=0;gap=4.2;}
        }
        if(state.elapsed>=LIMIT&&state.health>0&&!callbackDone)finish(true);
      }
      if(hitTime>=0){hitTime+=dt;if(hitTime>=.86)hitTime=-1;}
      hitFlash=Math.max(0,hitFlash-dt);
      const flow=state.phase==='RUNNING'?state.speed/3.6*.58:3.8;
      const travel=flow*dt;roadDistance+=travel;
      for(const part of roadParts){part.position.z+=travel;if(part.position.z>22)part.position.z-=90;}
      for(const group of scenery){group.position.z+=travel;if(group.position.z>23)group.position.z-=91;}
      for(const streak of speedStreaks){streak.position.z+=travel*1.8;if(streak.position.z>18)streak.position.z-=63;}
      whiteStreak.opacity=clamp((state.speed-45)/350,.04,.23);
      for(const p of particles)if(p.life>0){
        p.life=Math.max(0,p.life-dt);p.mesh.visible=p.life>0;p.mesh.position.addScaledVector(p.v,dt);p.v.y-=dt*7;p.mesh.material.opacity=p.life/p.total;
      }
      if(ring.visible){ring.scale.addScalar(dt*6);ring.material.opacity=Math.max(0,ring.material.opacity-dt*2.8);if(ring.material.opacity===0)ring.visible=false;}
      animateActors(dt);
      const shake=hitFlash*hitFlash*.7;
      camera.position.copy(cameraBase);camera.position.x+=Math.sin(roadDistance*43)*shake;camera.position.y+=Math.cos(roadDistance*37)*shake*.5;camera.lookAt(lookAt);camera.updateMatrixWorld(true);
      frame.style.setProperty('--tap-flash',String(Math.max(0,.12-(performance.now()-lastTap)/1000)));
      renderUI();
    }
    function positionLabel(node,actor){
      const p=new T.Vector3(actor.group.position.x,actor.group.position.y+2.65,actor.group.position.z).project(camera);
      node.hidden=state.phase==='TITLE'||p.z < -1||p.z>1;
      node.style.left=clamp((p.x*.5+.5)*viewWidth,70,viewWidth-70)+'px';node.style.top=clamp((-p.y*.5+.5)*viewHeight-5,160,viewHeight-105)+'px';
    }
    function render(){
      if(!active)return;
      renderer.setScissorTest(false);renderer.setViewport(0,0,window.innerWidth,window.innerHeight);renderer.setClearColor(0x070c13,1);renderer.clear();
      renderer.setViewport(viewLeft,0,viewWidth,viewHeight);renderer.setScissor(viewLeft,0,viewWidth,viewHeight);renderer.setScissorTest(true);
      renderer.render(scene,camera);
      renderer.setScissorTest(false);renderer.setViewport(0,0,window.innerWidth,window.innerHeight);
      positionLabel(playerLabel,hero);positionLabel(chaserLabel,chaser);
    }
    function resize(){
      viewHeight=window.innerHeight;viewWidth=Math.min(window.innerWidth,Math.max(280,Math.round(viewHeight*9/16)));viewLeft=Math.round((window.innerWidth-viewWidth)/2);
      frame.style.width=viewWidth+'px';camera.aspect=viewWidth/viewHeight;camera.updateProjectionMatrix();
    }
    function start(){
      if(!active)savedRenderer={color:renderer.getClearColor(new T.Color()).clone(),alpha:renderer.getClearAlpha(),autoClear:renderer.autoClear};
      active=true;callbackDone=false;Object.assign(state,{elapsed:0,health:100,speed:86,phase:'TITLE',paused:false,taps:0,hits:0,maxSpeed:86});
      phaseTime=0;runCycle=0;chaserCycle=0;gap=5.8;slowTime=0;cooldown=0;kickTime=-1;strikeDone=false;hitTime=-1;hitFlash=0;roadDistance=0;lastTap=-1e6;
      hero.group.scale.copy(originalHeroScale);chaser.group.scale.copy(originalChaserScale);hero.group.visible=chaser.group.visible=true;
      for(const p of particles){p.life=0;p.mesh.visible=false;}ring.visible=kickArc.visible=false;
      roadParts.forEach((part,i)=>part.position.z=-66+i*6);scenery.forEach((part,i)=>part.position.z=-66+Math.floor(i/2)*13);
      root.hidden=false;document.body.classList.add('chase-playing');resize();
      camera.position.copy(cameraBase);camera.lookAt(lookAt);camera.updateMatrixWorld(true);animateActors(0);renderUI();
      tapPad.focus({preventScroll:true});
    }
    function stop(){
      active=false;state.phase='IDLE';state.paused=false;root.hidden=true;document.body.classList.remove('chase-playing');
      renderer.setScissorTest(false);renderer.setViewport(0,0,window.innerWidth,window.innerHeight);
      if(savedRenderer){renderer.setClearColor(savedRenderer.color,savedRenderer.alpha);renderer.autoClear=savedRenderer.autoClear;savedRenderer=null;}
      tapPad.blur();
    }
    window.addEventListener('resize',resize);resize();
    return {state,scene,camera,get active(){return active;},start,stop,update,render,resize,tap};
  }
  global.ChaseRunner={create};
})(window);
