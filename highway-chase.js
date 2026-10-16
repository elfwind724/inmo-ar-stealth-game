(function(root){
  'use strict';
  const DURATION=120,PLAYER_MAX=230/3.6,POLICE_MAX=190/3.6,STEP=1/60;
  function create(context){
    const {THREE:T,scene,camera,keys,assets,sound,clearInput}=context;
    const $=id=>document.getElementById(id),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const state={active:false,mode:'IDLE',paused:false,time:0,speed:110/3.6,targetSpeed:110/3.6,
      hp:100,cleanTime:0,hitCooldown:0,stopTime:0,brakeRam:0,ramCooldown:0,shake:0,
      rearView:false,ramCount:0,peakSpeed:110,warning:'',warningTime:0,flash:0};
    let R,world,events,group,city,chunks=[],police=[],car,colliderOwners=new Map(),contacts=new Set();
    let snapshot=[],background,fog,cameraSettings,accumulator=0,generation=0,reinforceAt=17,sparks=[];
    let textures=[],lastHUD='',lastEngine=0;
    const cameraFocus=new T.Vector3(),cameraPosition=new T.Vector3();
    const mat=(color,roughness=.55,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
    function box(parent,w,h,d,x,y,z,material){const m=new T.Mesh(new T.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
    function label(text,bg='#142a3d',color='#bdd8d9',width=512,height=128){
      const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');
      x.fillStyle=bg;x.fillRect(0,0,width,height);x.fillStyle=color;x.textAlign='center';x.textBaseline='middle';
      x.font='bold 45px "Microsoft YaHei",sans-serif';x.fillText(text,width/2,height/2);
      const texture=new T.CanvasTexture(c);texture.encoding=T.sRGBEncoding;textures.push(texture);return texture;
    }
    function warn(text,time=2.2){state.warning=text;state.warningTime=time;}
    function makeCruiser(isPlayer=false){
      const rootGroup=new T.Group(),shell=assets.createCar(T);shell.rotation.y=Math.PI/2;rootGroup.add(shell);
      const white=mat(isPlayer?0xbccfcf:0x9db4c5,.26,.5),blue=mat(0x174d80,.3,.45),black=mat(0x152435,.35,.6);
      for(const side of [-1,1]){
        box(shell,2.85,.34,.045,0,.83,side*1.03,white);box(shell,2.7,.12,.045,0,.83,side*1.06,blue);
        const m=new T.Mesh(new T.PlaneGeometry(1.45,.36),new T.MeshBasicMaterial({map:label(isPlayer?'借用一下':'POLICE'),side:T.DoubleSide,toneMapped:false}));
        m.position.set(-.2,1.02,side*1.07);if(side<0)m.rotation.y=Math.PI;shell.add(m);
      }
      box(shell,1.5,.1,.4,-.1,1.8,0,black);
      const red=new T.MeshBasicMaterial({color:0xfc4354,transparent:true,toneMapped:false}),blueGlow=new T.MeshBasicMaterial({color:0x398dff,transparent:true,toneMapped:false});
      const beacons=[box(shell,.60,.2,.37,-.48,1.93,0,red),box(shell,.60,.2,.37,.28,1.93,0,blueGlow)];
      const tailLights=[];
      for(const s of [-1,1])tailLights.push(box(shell,.04,.15,.5,-2.35,.74,s*.64,new T.MeshBasicMaterial({color:0xff513b,toneMapped:false})));
      const underglow=new T.Mesh(new T.PlaneGeometry(2.1,4.9),new T.MeshBasicMaterial({color:isPlayer?0x37d7c0:0x2569bf,transparent:true,opacity:.12,depthWrite:false,toneMapped:false}));
      underglow.rotation.x=-Math.PI/2;underglow.position.y=.018;rootGroup.add(underglow);
      const wheels=[];shell.traverse(o=>{if(o.isMesh&&o.geometry?.type==='CylinderGeometry'&&o.position.y<.55)wheels.push(o);});
      return {group:rootGroup,shell,beacons,wheels,tailLights,hp:isPlayer?100:74,isPlayer,mode:'TAIL',modeTime:0,
        ramX:0,stun:0,disabled:false,disabledTime:0,spawnTime:0,index:0,angle:0,previousVelocity:{x:0,z:0}};
    }
    function makeBody(a,x,z){
      const desc=R.RigidBodyDesc.dynamic().setTranslation(x,.67,z).enabledRotations(false,true,false)
        .setLinearDamping(.08).setAngularDamping(5).setAdditionalMass(a.isPlayer?1500:1280).setCcdEnabled(true);
      a.body=world.createRigidBody(desc);
      a.collider=world.createCollider(R.ColliderDesc.cuboid(.96,.62,2.20).setFriction(.12).setRestitution(.18)
        .setDensity(.1).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),a.body);
      colliderOwners.set(a.collider.handle,a);group.add(a.group);a.body.setLinvel({x:0,y:0,z:-(a.isPlayer?state.speed:35)},true);
    }
    function buildCity(){
      const road=mat(0x26333e,.9),shoulder=mat(0x3e4a4b,.9),metal=mat(0x607988,.35,.8);
      const line=new T.MeshBasicMaterial({color:0xa8b8ad,toneMapped:false});
      const lampGlow=new T.MeshBasicMaterial({color:0xffd999,toneMapped:false});
      const buildingMats=[mat(0x173046,.92),mat(0x263948,.92),mat(0x1c3841,.92)];
      const windows=new T.MeshBasicMaterial({color:0xd5b77e,toneMapped:false});
      city=new T.Group();group.add(city);chunks=[];
      for(let i=0;i<6;i++){
        const chunk=new T.Group();chunk.position.z=70-i*70;city.add(chunk);chunks.push(chunk);
        box(chunk,28,.25,70,0,-.15,0,road);box(chunk,2,.16,70,-13.5,-.01,0,shoulder);box(chunk,2,.16,70,13.5,-.01,0,shoulder);
        const marks=[];for(const x of [-7,0,7])for(let z=-31;z<35;z+=10)marks.push([x,.008,z,1]);
        const inst=new T.InstancedMesh(new T.BoxGeometry(.12,.025,4.5),line,marks.length);
        const dummy=new T.Object3D();marks.forEach((p,j)=>{dummy.position.set(p[0],p[1],p[2]);dummy.updateMatrix();inst.setMatrixAt(j,dummy.matrix);});chunk.add(inst);
        for(const side of [-1,1]){
          box(chunk,.14,.025,70,side*11.8,.02,0,line);
          box(chunk,.2,.38,70,side*14.7,.75,0,metal);
          box(chunk,.18,.12,70,side*14.7,1.15,0,metal);
          for(const z of [-27,8]){
            box(chunk,.19,6.2,.19,side*16,3,z,metal);box(chunk,3,.15,.2,side*14.6,6,z,metal);
            box(chunk,1.3,.06,.42,side*13.7,5.88,z,lampGlow);
            box(chunk,.65,.65,.55,side*16,.22,z,shoulder);
          }
          const windowTransforms=[];
          for(let b=0;b<3;b++){
            const height=8+((i*7+b*11+(side+1)*5)%5)*4,z=-26+b*24;
            box(chunk,8,height,17,side*24,height/2,z,buildingMats[(i+b)%3]);
            for(let y=2;y<height-1;y+=3)for(let zz=-6;zz<=6;zz+=4)if((Math.floor(y)+zz+b+i)%4!==0)
              windowTransforms.push({x:side*19.96,y,z:z+zz,side});
          }
          const wi=new T.InstancedMesh(new T.BoxGeometry(.025,1.15,1.7),windows,windowTransforms.length);
          windowTransforms.forEach((p,j)=>{dummy.position.set(p.x,p.y,p.z);dummy.updateMatrix();wi.setMatrixAt(j,dummy.matrix);});chunk.add(wi);
        }
        if(i%2===0){
          for(const x of [-15,15])box(chunk,.45,7.5,.45,x,3.65,-15,metal);
          box(chunk,30,.3,.35,0,7.3,-15,metal);
          const sign=new T.Mesh(new T.PlaneGeometry(9,2.25),new T.MeshBasicMaterial({map:label(i===0?'北环快速路  ↑':'NORTH  /  出口  ↑','#163e3b','#c2d8af'),toneMapped:false}));
          sign.position.set(0,6.45,-14.76);chunk.add(sign);
        }
      }
      const hemi=new T.HemisphereLight(0x8cb9d3,0x152022,.8);group.add(hemi);
      const key=new T.DirectionalLight(0xffd5a2,1.2);key.position.set(-10,16,8);key.castShadow=true;
      Object.assign(key.shadow.camera,{left:-35,right:35,top:55,bottom:-25,near:.5,far:100});key.shadow.mapSize.set(1024,1024);key.shadow.normalBias=.05;
      key.userData.follow=true;group.add(key);group.userData.sun=key;group.add(key.target);
      const rim=new T.DirectionalLight(0x579acb,.8);rim.position.set(10,8,-16);group.add(rim);
      const light=new T.PointLight(0xffddb3,1.0,26);light.position.set(0,5,-12);group.add(light);group.userData.bounce=light;
    }
    async function start(){
      if(state.active)return;const token=++generation;
      Object.assign(state,{active:true,mode:'LOADING',paused:false,time:0,speed:110/3.6,targetSpeed:110/3.6,hp:100,
        cleanTime:0,hitCooldown:0,stopTime:0,brakeRam:0,ramCooldown:0,shake:0,rearView:false,ramCount:0,peakSpeed:110,flash:0,warningTime:0});
      clearInput();snapshot=scene.children.map(object=>({object,visible:object.visible}));background=scene.background;fog=scene.fog;
      cameraSettings={fov:camera.fov,near:camera.near,far:camera.far};
      $('chase-hud').hidden=false;$('chase-result').hidden=true;$('chase-pause').hidden=true;
      document.body.classList.add('highway-active');$('chase-loading').hidden=false;
      try{R=await root.INMOPhysics.load();}catch(error){if(token!==generation)return;state.mode='ERROR';$('chase-loading').hidden=true;finish(false,'车辆场景加载失败，请重试。');return;}
      if(token!==generation||!state.active)return;
      snapshot.forEach(({object})=>object.visible=false);
      scene.background=new T.Color(0x0b1828).convertSRGBToLinear();scene.fog=new T.FogExp2(new T.Color(0x142639).convertSRGBToLinear(),.009);
      group=new T.Group();group.name='chapter-three-highway';scene.add(group);buildCity();
      world=new R.World({x:0,y:-9.81,z:0});world.timestep=STEP;events=new R.EventQueue(true);
      const ground=world.createCollider(R.ColliderDesc.cuboid(18,.25,10000).setTranslation(0,-.25,-4000).setFriction(.08));
      colliderOwners.set(ground.handle,{kind:'ground'});
      for(const side of [-1,1]){
        const rail=world.createCollider(R.ColliderDesc.cuboid(.25,1,10000).setTranslation(side*14.8,.65,-4000));colliderOwners.set(rail.handle,{kind:'rail'});
      }
      car=makeCruiser(true);makeBody(car,0,0);police=[];
      [[-4,18],[4,27],[0,39],[-9,-145],[9,-200]].forEach((p,i)=>{
        const a=makeCruiser();a.index=i;a.spawnTime=i<3?0:(i===3?17:34);makeBody(a,p[0],p[1]);
        a.body.setEnabled(i<3);a.group.visible=i<3;police.push(a);
      });
      assets.linearizeScene(group);camera.fov=62;camera.near=.2;camera.far=280;camera.updateProjectionMatrix();
      cameraPosition.set(0,6.2,13);cameraFocus.set(0,1,-8);
      accumulator=0;reinforceAt=17;lastHUD='';sparks=[];state.mode='DRIVING';
      $('chase-loading').hidden=true;warn('坚持 2 分钟 · 不碰撞就会自动提速',4);sound.caughtSiren();
      if(document.hidden)state.paused=true;
      $('chase-pause').hidden=!state.paused;
      $('chase-roof').hidden=false;
      updateModels(0);updateHUD();
    }
    function respawn(a,ahead=true){
      const p=car.body.translation(),side=a.index%2?1:-1;
      a.body.setEnabled(true);a.group.visible=true;a.disabled=false;a.hp=74;a.stun=0;a.mode='TAIL';a.modeTime=0;a.angle=0;
      a.body.setTranslation({x:side*(ahead?9:5),y:.7,z:p.z+(ahead?-125:75)},true);
      a.body.setRotation({x:0,y:0,z:0,w:1},true);a.body.setLinvel({x:0,y:0,z:-42},true);a.body.setAngvel({x:0,y:0,z:0},true);
      a.spawnTime=state.time;warn(ahead?'前方增援正在并线':'后方出现增援',3);
    }
    function carAngle(a){const q=a.body.rotation();return Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z));}
    function controlPlayer(dt){
      const v=car.body.linvel(),angle=carAngle(car),steer=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);
      const braking=keys.s||keys.arrowdown;
      const accel=braking?-11:(keys.w||keys.arrowup?2.25:1.65);
      state.targetSpeed=clamp(state.targetSpeed+accel*dt,0,PLAYER_MAX);
      if(state.brakeRam>0){state.brakeRam=Math.max(0,state.brakeRam-dt);state.targetSpeed=Math.max(7,state.targetSpeed-dt*16);}
      const steerSpeed=steer*(5.5+state.speed*.035),blend=1-Math.exp(-dt*5);
      car.body.setLinvel({x:v.x+(steerSpeed-v.x)*blend,y:v.y,z:v.z+(-state.targetSpeed-v.z)*(1-Math.exp(-dt*(state.hitCooldown>0?1.5:3.2)))},true);
      car.body.setAngvel({x:0,y:clamp(-angle*7-steer*.38,-1.4,1.4),z:0},true);
      car.previousVelocity={x:v.x,z:v.z};car.shell.rotation.z=(braking?.035:0)+Math.abs(steer)*.008;
      car.tailLights.forEach(m=>m.material.color.setHex(braking||state.brakeRam>0?0xffb29a:0xb83a36));
    }
    function controlPolice(a,dt){
      if(!a.body.isEnabled())return;
      const p=a.body.translation(),p0=car.body.translation(),v=a.body.linvel();a.modeTime+=dt;a.stun=Math.max(0,a.stun-dt);
      a.previousVelocity={x:v.x,z:v.z};
      if(a.disabled){a.disabledTime+=dt;a.body.setLinvel({x:v.x*.985,y:v.y,z:v.z*.995},true);return;}
      if(a.stun>0)return;
      const gap=p.z-p0.z,side=a.index%2?1:-1;
      if(a.mode==='TAIL'&&Math.abs(gap)<13&&state.time-a.spawnTime>2){a.mode='WINDUP';a.modeTime=0;a.ramX=p0.x;warn((p.x<p0.x?'左':'右')+'后方警车准备冲撞',1.2);}
      if(a.mode==='WINDUP'&&a.modeTime>.95){a.mode='RAM';a.modeTime=0;a.ramX=p0.x+clamp(car.body.linvel().x*.35,-2,2);}
      if(a.mode==='RAM'&&a.modeTime>1.4){a.mode='RECOVER';a.modeTime=0;}
      if(a.mode==='RECOVER'&&a.modeTime>2.1){a.mode='TAIL';a.modeTime=0;}
      let targetX=p0.x+side*(a.index===2?1.2:3.5),targetSpeed=clamp(state.speed+(gap-6)*.60,27,POLICE_MAX);
      if(gap< -20){targetX=side*5.4;targetSpeed=39;}
      if(a.mode==='WINDUP'){targetX=p0.x+side*3.0;targetSpeed=clamp(state.speed+2,25,POLICE_MAX);}
      if(a.mode==='RAM'){targetX=a.ramX;targetSpeed=POLICE_MAX;}
      if(a.mode==='RECOVER'){targetX=clamp(p0.x+side*5,-11,11);targetSpeed=clamp(state.speed-2,23,POLICE_MAX);}
      const vx=clamp((targetX-p.x)*(a.mode==='RAM'?3.4:1.7),-8.0,8.0);
      const angular=carAngle(a);
      a.body.setLinvel({x:v.x+(vx-v.x)*(1-Math.exp(-dt*3)),y:v.y,z:v.z+(-targetSpeed-v.z)*(1-Math.exp(-dt*1.8))},true);
      a.body.setAngvel({x:0,y:clamp(-angular*5-vx*.045,-1.3,1.3),z:0},true);
    }
    function spark(pos,color=0xffbe6e){
      for(let i=0;i<14;i++){
        const m=new T.Mesh(new T.BoxGeometry(.08,.08,.3),new T.MeshBasicMaterial({color,transparent:true,toneMapped:false}));
        m.position.set(pos.x,.8+Math.random()*.5,pos.z);group.add(m);sparks.push({mesh:m,life:.55,vx:(Math.random()-.5)*8,vy:3+Math.random()*3,vz:state.speed*.2});
      }
    }
    function collision(other){
      if(!other||other.kind==='ground'||other.disabled||state.hitCooldown>0||state.mode!=='DRIVING')return;
      const p=car.body.translation();state.hitCooldown=.8;state.cleanTime=0;state.flash=1;state.shake=.3;
      if(other.kind==='rail'){
        state.hp=Math.max(0,state.hp-5);state.targetSpeed*=.76;warn('擦撞护栏 · 减速',1.4);spark(p);
      }else{
        if(other.disabled)return;
        const q=other.body.translation(),pv=car.previousVelocity,ov=other.previousVelocity;
        const relative=Math.hypot(pv.x-ov.x,pv.z-ov.z),counter=state.brakeRam>0&&q.z>p.z-1;
        const damage=Math.round(clamp((counter?2:6)+relative*(counter?.16:.42),counter?2:6,18));
        state.hp=Math.max(0,state.hp-damage);state.targetSpeed=Math.max(0,state.targetSpeed*(counter?.86:.68)-relative*.1);
        other.hp-=counter?42:20+relative*.7;other.stun=counter?1.6:.65;
        const dx=q.x-p.x,sign=dx===0?(other.index%2?1:-1):Math.sign(dx);
        other.body.applyImpulse({x:sign*(counter?8500:3500),y:0,z:counter?7500:1500},true);
        other.body.applyTorqueImpulse({x:0,y:sign*(counter?4300:1500),z:0},true);
        if(counter){state.ramCount++;warn('反撞成功 · 警车失控',1.8);}else warn('遭到撞击 · 减速 -'+damage+' 耐久',1.7);
        if(other.hp<=0){other.disabled=true;other.disabledTime=0;warn('撞毁一辆追击警车',2);state.ramCount++;}
        spark({x:(p.x+q.x)/2,z:(p.z+q.z)/2});
      }
      sound.playTone(58,'sawtooth',.15,.10);sound.playTone(180,'square',.06,.04);
    }
    function stepPhysics(dt){
      state.hitCooldown=Math.max(0,state.hitCooldown-dt);state.ramCooldown=Math.max(0,state.ramCooldown-dt);state.cleanTime+=dt;
      controlPlayer(dt);police.forEach(a=>controlPolice(a,dt));world.step(events);
      events.drainCollisionEvents((h1,h2,started)=>{
        if(h1!==car.collider.handle&&h2!==car.collider.handle)return;
        const handle=h1===car.collider.handle?h2:h1,other=colliderOwners.get(handle);
        if(started){contacts.add(handle);collision(other);}else contacts.delete(handle);
      });
      if(state.hitCooldown<=0)for(const h of contacts){const o=colliderOwners.get(h);if(o?.kind==='rail'||o?.body&&!o.disabled)collision(o);}
      const v=car.body.linvel();state.speed=Math.max(0,-v.z);state.peakSpeed=Math.max(state.peakSpeed,state.speed*3.6);
      if(state.speed*3.6<12&&state.cleanTime<3.2)state.stopTime+=dt;else state.stopTime=Math.max(0,state.stopTime-dt*2);
      if(state.hp<=0)finish(false,'车辆耐久耗尽，被拦截了。');
      else if(state.stopTime>=3)finish(false,'连续被撞停 3 秒，追捕警车把你围住了。');
    }
    function updateModels(dt){
      for(const a of [car,...police]){
        if(!a?.body.isEnabled())continue;
        const p=a.body.translation(),q=a.body.rotation();a.group.position.set(p.x,p.y-.63,p.z);a.group.quaternion.set(q.x,q.y,q.z,q.w);
        a.wheels.forEach(w=>{w.rotation.z-=dt*Math.max(0,-a.body.linvel().z)*2.1;});
        const flash=Math.sin(state.time*12+a.index)>0;
        a.beacons[0].material.opacity=flash?1:.12;a.beacons[1].material.opacity=flash?.12:1;
        if(a.disabled){a.beacons.forEach(m=>m.material.opacity=.1);a.shell.rotation.z=Math.sin(a.disabledTime*3)*.05;}
      }
      const p=car.body.translation();
      chunks.forEach(c=>{if(c.position.z-p.z>135)c.position.z-=420;});
      const key=group.userData.sun;key.position.set(p.x-10,16,p.z+8);key.target.position.set(p.x,0,p.z-15);
      group.userData.bounce.position.set(p.x,5,p.z-12);
      for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.life-=dt;s.vy-=dt*9;s.mesh.position.x+=s.vx*dt;s.mesh.position.y+=s.vy*dt;s.mesh.position.z+=s.vz*dt;s.mesh.material.opacity=Math.max(0,s.life/.55);
        if(s.life<=0){group.remove(s.mesh);s.mesh.geometry.dispose();s.mesh.material.dispose();sparks.splice(i,1);}}
    }
    function update(dt){
      if(!state.active||state.paused||state.mode!=='DRIVING')return;
      state.time+=dt;state.shake=Math.max(0,state.shake-dt);state.flash=Math.max(0,state.flash-dt*2.5);
      state.warningTime=Math.max(0,state.warningTime-dt);
      for(const a of police){
        if(!a.body.isEnabled()&&state.time>=a.spawnTime)respawn(a,true);
        const p=a.body.translation(),p0=car.body.translation();
        if(a.body.isEnabled()&&(p.z-p0.z>150||a.disabled&&a.disabledTime>9)&&state.time>reinforceAt){respawn(a,true);reinforceAt=state.time+12;}
      }
      accumulator=Math.min(.15,accumulator+dt);while(accumulator>=STEP&&state.mode==='DRIVING'){stepPhysics(STEP);accumulator-=STEP;}
      updateModels(dt);updateHUD();
      if(state.time>=DURATION&&state.mode==='DRIVING')finish(true,'连续坚持 2 分钟，成功甩开追捕。');
      if(sound.enabled&&state.time-lastEngine>.18){lastEngine=state.time;sound.playTone(42+state.speed*.9,'sawtooth',.12,.009);}
    }
    function updateHUD(){
      const remain=Math.max(0,DURATION-state.time),time=Math.ceil(remain),speed=Math.round(state.speed*3.6),hp=Math.ceil(state.hp);
      const stamp=[time,speed,hp,state.warning,state.warningTime>0,state.ramCooldown>.1,state.rearView,Math.floor(state.cleanTime),state.stopTime>.1].join('|');
      if(stamp!==lastHUD){lastHUD=stamp;
        $('chase-time').textContent=String(Math.floor(time/60)).padStart(2,'0')+':'+String(time%60).padStart(2,'0');
        $('chase-speed').textContent=speed;$('chase-durability-value').textContent=hp+'%';$('chase-durability-fill').style.width=hp+'%';
        $('chase-roof').classList.toggle('damaged',hp<35);$('chase-warning').hidden=state.warningTime<=0;$('chase-warning').textContent=state.warning;
        $('chase-clean').textContent=state.cleanTime>1?'无碰撞 '+Math.floor(state.cleanTime)+'s · 自动提速':'正在恢复车速';
        $('chase-brake-ram').disabled=state.ramCooldown>.1;$('chase-brake-ram').textContent=state.ramCooldown>.1?'反撞冷却':'急刹反撞 · 空格';
        $('chase-rear-view').textContent=state.rearView?'返回前视 · C':'看后方 · C';
        $('chase-stop-warning').hidden=state.stopTime<=.1;
      }
      $('chase-progress').style.width=(Math.min(1,state.time/DURATION)*100)+'%';
      $('chase-damage-flash').style.opacity=String(state.flash*.65);
      $('chase-speed-lines').style.opacity=String(clamp((speed-140)/400,0,.2));
    }
    function updateCamera(dt){
      if(!state.active||!car?.body)return;
      const p=car.body.translation(),rear=state.rearView,shake=state.shake;
      const offset=rear?-11.5:13.5;
      const goal=new T.Vector3(p.x*.92,6.1,p.z+offset);
      cameraPosition.lerp(goal,1-Math.exp(-dt*7));cameraFocus.set(p.x*.95,1.0,p.z+(rear?13:-10));
      camera.position.copy(cameraPosition);camera.position.x+=Math.sin(state.time*81)*shake;camera.position.y+=Math.cos(state.time*93)*shake*.35;
      const fov=62+clamp((state.speed*3.6-120)/18,0,6);if(Math.abs(camera.fov-fov)>.04){camera.fov=fov;camera.updateProjectionMatrix();}
      camera.lookAt(cameraFocus);
      const roof=new T.Vector3(p.x,p.y+2.45,p.z).project(camera);
      $('chase-roof').style.left=((roof.x*.5+.5)*window.innerWidth)+'px';$('chase-roof').style.top=((-roof.y*.5+.5)*window.innerHeight)+'px';
    }
    function brakeRam(){
      if(state.mode!=='DRIVING'||state.paused||state.ramCooldown>0)return;
      state.brakeRam=.9;state.ramCooldown=3.4;state.targetSpeed=Math.max(12,state.targetSpeed-7);
      warn('急刹反撞 · 让追车撞上你的车尾',1.8);sound.playTone(440,'triangle',.13,.045);
    }
    function pause(value){
      if(!state.active||!['DRIVING','LOADING'].includes(state.mode))return;state.paused=value;clearInput();$('chase-pause').hidden=!value;
      if(value)$('chase-resume').focus();
    }
    function key(event){
      const k=event.key.toLowerCase();
      if(k==='escape'||k==='p'){if(!event.repeat)pause(!state.paused);return;}
      if(state.paused||event.repeat)return;
      if(k===' ')brakeRam();if(k==='c'){state.rearView=!state.rearView;updateHUD();}
    }
    function finish(win,reason){
      if(!state.active||['SUCCESS','FAILED'].includes(state.mode))return;
      state.mode=win?'SUCCESS':'FAILED';clearInput();$('chase-result').hidden=false;$('chase-pause').hidden=true;
      $('chase-result-kicker').textContent=win?'CHAPTER 03 / ESCAPED':'CHAPTER 03 / CAUGHT';
      $('chase-result-title').textContent=win?'这次，真的逃出来了':'追逐结束 · 被拦截';$('chase-result-copy').textContent=reason;
      $('chase-result-stats').textContent=`坚持 ${Math.min(120,Math.floor(state.time))} 秒 · 耐久 ${Math.ceil(state.hp)}% · 最高 ${Math.round(state.peakSpeed)} km/h · 反撞 ${state.ramCount} 次`;
      $('chase-retry').focus();if(win)sound.victoryFanfare();else sound.caughtSiren();
    }
    function dispose(){
      if(group){scene.remove(group);const geos=new Set(),mats=new Set();group.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mats.add(m));o.shadow?.map?.dispose();});
        geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());}
      textures.forEach(t=>t.dispose());textures=[];world?.free();events?.free();world=null;events=null;group=null;car=null;police=[];chunks=[];sparks=[];
      colliderOwners.clear();contacts.clear();
    }
    function stop(){
      if(!state.active)return;generation++;state.active=false;state.mode='IDLE';dispose();
      snapshot.forEach(({object,visible})=>object.visible=visible);snapshot=[];scene.background=background;scene.fog=fog;
      if(cameraSettings){Object.assign(camera,cameraSettings);camera.updateProjectionMatrix();}
      document.body.classList.remove('highway-active');
      for(const id of ['chase-hud','chase-result','chase-pause','chase-roof'])$(id).hidden=true;
    }
    async function retry(){stop();await start();}
    function bindHold(id,key){const el=$(id);el.addEventListener('pointerdown',e=>{e.preventDefault();if(state.paused||state.mode!=='DRIVING')return;el.setPointerCapture(e.pointerId);keys[key]=true;});
      for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,()=>{keys[key]=false;});}
    bindHold('chase-left','a');bindHold('chase-right','d');bindHold('chase-brake','s');
    $('chase-brake-ram').addEventListener('click',brakeRam);$('chase-rear-view').addEventListener('click',()=>{state.rearView=!state.rearView;updateHUD();});
    $('chase-pause-button').addEventListener('click',()=>pause(true));$('chase-resume').addEventListener('click',()=>pause(false));
    $('chase-retry').addEventListener('click',retry);$('chase-return').addEventListener('click',context.restart);
    $('chase-pause-return').addEventListener('click',context.restart);
    return {state,start,stop,update,updateCamera,key,pause,get active(){return state.active;},get paused(){return state.paused;}};
  }
  root.HighwayChase={create};
})(typeof window!=='undefined'?window:globalThis);
