/* First-person theater runtime: input, performance poses and DOM presentation. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('scene');
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),mix=(a,b,t)=>a+(b-a)*t;
  try{
    const T=window.THREE,scene=new T.Scene();
    const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));
    renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
    const camera=new T.PerspectiveCamera(58,1,.1,100);
    const venue=TheaterScene.build({THREE:T,scene,renderer});
    venue.viewer=venue.createActor('viewer',{coat:0x28465c,hair:0x242735,trousers:0x222c3a,accent:0xe7bd64});
    venue.viewer.group.name='player-spectator';venue.viewer.group.visible=false;
    venue.viewer.performance={walking:false,speed:0};
    const performance=TheaterPerformance.create({venue});
    const show=TheaterShow.create(),state=show.state;
    const viewer={x:0,z:3.2,yaw:0,pitch:.055,mode:'first',walking:0,heading:Math.PI};
    let menu=false,roaming=false,lastStamp=0,poseTime=0,lastCue='',currentStageTitle='',reaction='',reactionUntil=0,roamStarted=false;
    const keys=new Set(),movePointers=new Map();let lookPointer=null,lookX=0,lookY=0;
    const pointerAllowed=()=>!menu&&!document.hidden&&state.phase!=='READY';
    const paused=()=>menu||document.hidden;
    let voiceOn=true;try{voiceOn=localStorage.getItem('inmo_theater_voice')!=='false';}catch{}
    const speech=window.speechSynthesis;let voicedCue='',voiceGeneration=0,spokenAt=0;
    const voiceButton=$('voice-toggle');
    function voiceUI(){voiceButton.textContent=!speech?'不支持':voiceOn?'开启':'关闭';voiceButton.disabled=!speech;voiceButton.setAttribute('aria-pressed',String(!!speech&&voiceOn));if(!speech)$('voice-info').textContent='当前浏览器提供字幕播放';}
    function cancelVoice(){voiceGeneration++;speech?.cancel();}
    function speak(cue){
      cancelVoice();voicedCue=cue.id;spokenAt=poseTime;
      if(!voiceOn||!speech||paused()||state.phase!=='PLAYING'||cue.blackout&&cue.id==='power-cut')return;
      const generation=voiceGeneration,utterance=new SpeechSynthesisUtterance(cue.text);
      const chinese=speech.getVoices().filter(v=>/^zh[-_]/i.test(v.lang));
      const female=chinese.find(v=>/Xiaoxiao|Huihui|Ting|female|晓晓|小燕/i.test(v.name));
      utterance.voice=(cue.speaker==='inmo小影'?female:null)||chinese[0]||null;
      utterance.lang='zh-CN';utterance.rate=cue.actor==='weijue'?1.05:1.12;utterance.pitch=cue.speaker==='inmo小影'?1.22:cue.actor==='hamster'?1.15:.91;utterance.volume=.88;
      utterance.onend=()=>{if(generation===voiceGeneration)audio.volume=.19;};
      speech.speak(utterance);
    }
    const audio=$('venue-music');
    const music=VenueMusic.create({audio,button:$('music-toggle'),canPlay:()=>state.phase!=='READY'&&!paused()&&!state.cue.blackout});
    audio.volume=.19;
    let audioContext=null,lastReactionAt=-100;
    function effect(kind){
      try{
        const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
        audioContext??=new AC();audioContext.resume();const ac=audioContext,now=ac.currentTime;
        function tone(freq,at,dur,gain=.1,type='sine'){
          const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(freq,now+at);g.gain.setValueAtTime(gain,now+at);g.gain.exponentialRampToValueAtTime(.0001,now+at+dur);o.connect(g).connect(ac.destination);o.start(now+at);o.stop(now+at+dur);
        }
        function noise(at,dur,gain,filter='highpass'){
          const b=ac.createBuffer(1,Math.ceil(ac.sampleRate*dur),ac.sampleRate),data=b.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1);
          const s=ac.createBufferSource(),g=ac.createGain(),f=ac.createBiquadFilter();s.buffer=b;f.type=filter;f.frequency.value=filter==='highpass'?1500:450;g.gain.setValueAtTime(gain,now+at);g.gain.exponentialRampToValueAtTime(.001,now+at+dur);s.connect(f).connect(g).connect(ac.destination);s.start(now+at);s.stop(now+at+dur);
        }
        if(kind==='clap'){for(let i=0;i<17;i++)noise(i*.075+Math.random()*.035,.12,.06);}
        else if(kind==='laugh'){for(let i=0;i<8;i++)tone(180+Math.random()*100,i*.13,.12,.035,'triangle');}
        else if(kind==='boo'){tone(145,0,.7,.045);tone(160,.08,.75,.04);}
        else if(kind==='thud'){tone(66,0,.32,.2,'triangle');noise(0,.14,.16,'lowpass');}
        else if(kind==='power'){noise(0,.18,.18);tone(70,0,.3,.08,'sawtooth');}
        else if(kind==='drum'){for(let i=0;i<16;i++)noise(i*.11,.13,.045,'lowpass');}
        else if(kind==='chime'){[659,880,1046].forEach((f,i)=>tone(f,i*.14,.5,.035));}
      }catch{}
    }
    const reactionNames={clap:'掌声响起来！',laugh:'全场：哈哈哈哈！',boo:'观众席：下去咯！下去咯！',murmur:'观众席：怎么黑了？'};
    function react(kind,manual=false){
      if(manual&&(paused()||state.phase!=='PLAYING'||poseTime-lastReactionAt<1.5))return;
      if(manual)lastReactionAt=poseTime;
      reaction=kind;reactionUntil=poseTime+3;$('reaction-toast').textContent=reactionNames[kind]||'全场欢呼！';$('reaction-toast').hidden=false;
      if(kind!=='murmur')effect(kind);
    }
    const moods={cry:'感动 · 抹泪',recite:'深情朗诵',awkward:'现场稍微有点尴尬',tremble:'腿有自己的想法',rope:'绝活展示',trip:'失去平衡',fall:'节目效果拉满',limp:'体面退场中',backstep:'自信退场',wipe:'主持人：擦汗',tease:'惊喜揭晓',laugh:'笑声不断',blackout:'现场信号中断',bow:'谢谢各位'};
    function syncCue(){
      const cue=state.cue;if(cue.id===lastCue)return;lastCue=cue.id;
      $('chapter-label').textContent=cue.chapter;$('cue-counter').textContent=String(state.index+1).padStart(2,'0')+' / '+TheaterShow.cues.length;
      $('speaker').textContent=cue.speaker;$('line').textContent=cue.text;$('cue-mood').textContent=moods[cue.action]||'';
      $('actor-label').textContent={xiaoying:'inmo小影',yunfei:'周云飞',hamster:'小仓鼠',weijue:'韦爵爷'}[cue.actor]||'';
      if(currentStageTitle!==cue.chapter){currentStageTitle=cue.chapter;venue.setStageTitle?.(cue.chapter.split(' · ')[1]||'好戏开场','INMO COMMUNITY · 特邀群友特别场');}
      if(cue.audience)react(cue.audience);if(cue.sound)effect(cue.sound);
      speak(cue);document.body.dataset.cue=cue.id;
    }
    function clearInput(){keys.clear();movePointers.clear();lookPointer=null;document.querySelectorAll('[data-move]').forEach(b=>b.classList.remove('active'));}
    function setMenu(open){
      menu=!!open;show.pause(menu||document.hidden);$('settings').hidden=!menu;$('menu-toggle').setAttribute('aria-expanded',String(menu));
      clearInput();cancelVoice();if(menu)audioContext?.suspend();else audioContext?.resume();if(!menu&&state.phase==='PLAYING')speak(state.cue);music.update();
      if(!menu)canvas.focus({preventScroll:true});
    }
    const viewNames={first:'第一人称',third:'第三人称',overhead:'俯视全景'};
    function viewUI(){
      $('view-toggle').textContent=viewNames[viewer.mode]+' ›';$('quick-view').textContent='视角 · '+{first:'第一',third:'第三',overhead:'俯视'}[viewer.mode];
      $('quick-view').setAttribute('aria-label','切换视角，当前'+viewNames[viewer.mode]);
      document.body.classList.toggle('overhead',viewer.mode==='overhead');document.body.dataset.view=viewer.mode;
    }
    function resetView(){viewer.x=0;viewer.z=3.2;viewer.yaw=0;viewer.pitch=.055;viewer.heading=Math.PI;}
    function setView(){const modes=['first','third','overhead'];viewer.mode=modes[(modes.indexOf(viewer.mode)+1)%3];clearInput();viewUI();}
    function start(replay=false){
      cancelVoice();show.restart();menu=false;roaming=false;roamStarted=false;lastCue='';currentStageTitle='';poseTime=0;reaction='';reactionUntil=0;lastReactionAt=-100;
      for(const a of Object.values(venue.actors)){a.group.visible=false;a.group.position.set(-10,.75,-9);a.group.rotation.set(0,0,0);}
      const host=venue.actors.xiaoying;host.group.visible=true;host.group.position.set(0,.75,-8.3);
      performance.reset();
      viewer.mode='first';viewUI();resetView();clearInput();
      $('welcome').hidden=true;$('ending').hidden=true;$('settings').hidden=true;$('menu-toggle').setAttribute('aria-expanded','false');
      $('show-status').hidden=false;$('subtitles').hidden=false;$('reaction-controls').hidden=false;document.body.classList.add('playing');
      syncCue();music.update();canvas.focus({preventScroll:true});
    }
    $('start-show').addEventListener('click',()=>start());$('replay-show').addEventListener('click',()=>start(true));$('ending-replay').addEventListener('click',()=>start(true));
    $('menu-toggle').addEventListener('click',()=>setMenu(!menu));$('close-settings').addEventListener('click',()=>setMenu(false));$('resume-show').addEventListener('click',()=>setMenu(false));
    $('reset-view').addEventListener('click',resetView);$('view-toggle').addEventListener('click',setView);$('quick-view').addEventListener('click',setView);
    $('voice-toggle').addEventListener('click',()=>{voiceOn=!voiceOn;try{localStorage.setItem('inmo_theater_voice',String(voiceOn));}catch{}cancelVoice();voiceUI();});
    $('ending-roam').addEventListener('click',()=>{$('ending').hidden=true;roaming=true;roamStarted=true;canvas.focus();});
    function next(){if(state.phase==='PLAYING'&&!paused()){show.next();syncCue();}}
    $('next-line').addEventListener('click',next);document.querySelectorAll('[data-reaction]').forEach(b=>b.addEventListener('click',()=>react(b.dataset.reaction,true)));
    document.addEventListener('keydown',e=>{
      if(e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA/.test(e.target.tagName))return;
      if(e.code==='Space'&&e.target.closest('button'))return;
      if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
      if(e.code==='Escape'||e.code==='KeyP'){if(!e.repeat)setMenu(!menu);return;}
      if(e.code==='KeyF'){if(!e.repeat)setView();return;}
      if(e.code==='Space'&&!e.repeat&&!e.target.closest('button')){if(state.phase==='READY')start();else next();return;}
      if(pointerAllowed())keys.add(e.code);
    });document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',clearInput);
    document.addEventListener('visibilitychange',()=>{clearInput();show.pause(paused());cancelVoice();if(paused())audioContext?.suspend();else audioContext?.resume();if(!paused()&&state.phase==='PLAYING')speak(state.cue);lastStamp=0;music.update();});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('pointerdown',e=>{
      if(!pointerAllowed()||viewer.mode==='overhead'||lookPointer!==null)return;
      if(e.pointerType==='touch'&&e.clientX<innerWidth*.38)return;
      lookPointer=e.pointerId;lookX=e.clientX;lookY=e.clientY;canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{if(e.pointerId!==lookPointer)return;viewer.yaw-=(e.clientX-lookX)*.004;viewer.pitch=clamp(viewer.pitch-(e.clientY-lookY)*.003,-.6,.65);lookX=e.clientX;lookY=e.clientY;});
    const releaseLook=e=>{if(e.pointerId===lookPointer)lookPointer=null;};canvas.addEventListener('pointerup',releaseLook);canvas.addEventListener('pointercancel',releaseLook);canvas.addEventListener('lostpointercapture',releaseLook);
    document.querySelectorAll('[data-move]').forEach(b=>{
      b.addEventListener('pointerdown',e=>{e.preventDefault();if(!pointerAllowed())return;movePointers.set(e.pointerId,b.dataset.move);b.classList.add('active');b.setPointerCapture(e.pointerId);});
      const release=e=>{movePointers.delete(e.pointerId);b.classList.remove('active');};b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);
    });
    function updateViewer(dt){
      let moving=false;
      if(pointerAllowed()){
        const virtual=new Set(movePointers.values());let forward=Number(keys.has('KeyW')||keys.has('ArrowUp')||virtual.has('forward'))-Number(keys.has('KeyS')||keys.has('ArrowDown')||virtual.has('backward'));
        let right=Number(keys.has('KeyD')||keys.has('ArrowRight')||virtual.has('right'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')||virtual.has('left'));
        const n=Math.hypot(forward,right)||1;forward/=n;right/=n;
        const moveYaw=viewer.mode==='overhead'?Math.PI/4:viewer.yaw;
        const dx=(-Math.sin(moveYaw)*forward+Math.cos(moveYaw)*right)*dt*2.6,dz=(-Math.cos(moveYaw)*forward-Math.sin(moveYaw)*right)*dt*2.6;
        // Central aisle plus the empty cross-aisle: chairs are never walked through.
        const nx=clamp(viewer.x+dx,-10.5,10.5),nz=clamp(viewer.z+dz,-3.1,18);
        if(Math.abs(nx)<.83||nz<-.7||nz>17.1){moving=Math.abs(nx-viewer.x)+Math.abs(nz-viewer.z)>.00001;viewer.x=nx;viewer.z=nz;viewer.walking+=(Math.abs(forward)+Math.abs(right))*dt;if(moving)viewer.heading=Math.atan2(dx,dz);}
      }
      if(viewer.mode==='first'){
        camera.position.set(viewer.x,1.48+Math.sin(viewer.walking*10)*.012,viewer.z);
        camera.rotation.order='YXZ';camera.rotation.set(viewer.pitch,viewer.yaw,0);camera.fov=innerWidth<innerHeight?68:58;
      }else if(viewer.mode==='third'){
        camera.position.set(viewer.x+Math.sin(viewer.yaw)*4.4,clamp(3.25-Math.sin(viewer.pitch)*2.2,2.55,4.6),viewer.z+Math.cos(viewer.yaw)*4.4);
        camera.lookAt(viewer.x-Math.sin(viewer.yaw)*3.6,1.5,viewer.z-Math.cos(viewer.yaw)*3.6);camera.fov=innerWidth<innerHeight?67:58;
      }else{camera.position.set(21,23,23);camera.lookAt(0,1,-1);camera.fov=48;}
      const avatar=venue.viewer;avatar.group.visible=viewer.mode!=='first'&&state.phase!=='READY';avatar.group.position.set(viewer.x,.04,viewer.z);avatar.group.rotation.y=viewer.heading;
      avatar.performance.walking=moving;avatar.performance.speed=moving?2.6:0;
      const step=Math.sin(viewer.walking*7);avatar.legL.rotation.x=moving?step*.35:0;avatar.legR.rotation.x=moving?-step*.35:0;avatar.shinL.rotation.x=moving?Math.max(0,-step)*.5:0;avatar.shinR.rotation.x=moving?Math.max(0,step)*.5:0;avatar.armL.rotation.x=moving?-step*.28:0;avatar.armR.rotation.x=moving?step*.28:0;
      camera.updateProjectionMatrix();
    }
    function poseActors(dt){performance.update(dt,{time:poseTime,cue:state.cue,localTime:state.localTime,phase:state.phase});}
    let models=null;
    Promise.resolve(TheaterModels.load({THREE:T,venue})).then(m=>{models=m;document.body.dataset.models=m?.status?.phase||'ready';}).catch(error=>{console.warn('Imported models unavailable; authored stage characters remain.',error);document.body.dataset.models='fallback';});
    function label(){
      const cue=state.cue,element=$('actor-label'),p=venue.getActorAnchor(cue.actor);element.hidden=state.phase!=='PLAYING'||menu||!!cue.blackout||!p;
      if(element.hidden)return;p.project(camera);const x=(p.x*.5+.5)*innerWidth,y=(-p.y*.5+.5)*innerHeight;
      element.hidden=p.z>1||p.z<-1||x<30||x>innerWidth-30||y<110||y>innerHeight-220;
      if(!element.hidden){element.style.left=x+'px';element.style.top=y+'px';}
    }
    function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
    window.addEventListener('resize',resize);resize();voiceUI();viewUI();
    // READY already shows a lit, inhabited stage from the default audience eye level.
    venue.actors.xiaoying.group.visible=true;venue.actors.xiaoying.group.position.set(0,.75,-8.3);
    function frame(stamp){
      requestAnimationFrame(frame);const dt=lastStamp?Math.min(.05,(stamp-lastStamp)/1000):0;lastStamp=stamp;
      if(!paused()){
        poseTime+=dt;
        // A slower installed Chinese voice may finish its sentence before the
        // next cue. Subtitles never run away while that sentence is audible.
        const remaining=state.cue.duration-state.localTime;
        const voiceFinishing=voiceOn&&speech?.speaking&&voicedCue===state.cue.id&&!state.cue.blackout&&poseTime-spokenAt<state.cue.duration+6&&remaining<=dt;
        show.update(voiceFinishing?Math.max(0,remaining-.0001):dt);
        if(state.phase==='PLAYING'){syncCue();poseActors(dt);}
        if(state.phase==='ENDED'&&!roamStarted){$('ending').hidden=false;$('subtitles').hidden=true;$('reaction-controls').hidden=true;cancelVoice();roamStarted=true;}
        if(poseTime>reactionUntil){reaction='';$('reaction-toast').hidden=true;}
        venue.update(dt,{time:poseTime,cue:state.cue,localTime:state.localTime,reaction,blackout:state.phase==='PLAYING'&&state.cue.blackout?1:0});
        updateViewer(dt);
        models?.update?.(dt,{time:poseTime,cue:state.cue,localTime:state.localTime,reaction});
      }
      const dark=state.phase==='PLAYING'&&!!state.cue.blackout;$('blackout').classList.toggle('on',dark);document.body.classList.toggle('power-out',dark);$('blackout').setAttribute('aria-hidden',String(!dark));
      $('cue-progress-fill').style.width=clamp(state.localTime/state.cue.duration*100,0,100)+'%';document.body.dataset.phase=state.phase;document.body.dataset.paused=String(paused());
      audio.volume=speech?.speaking ? .08 : .19;music.update();label();renderer.render(scene,camera);
    }
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();setMenu(true);$('boot-error').hidden=false;});
    requestAnimationFrame(frame);
  }catch(error){console.error('Theater boot failed:',error);$('boot-error').hidden=false;}
})();
