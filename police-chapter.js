(function (root) {
  'use strict';

  // The chapter owns its simulation and scene layer; the showroom loop stays frozen.
  function create(context) {
    const { THREE: T, scene, camera, player, keys, sound, toast, assets, rules } = context;
    const $ = id => document.getElementById(id);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const state = { active: false, phase: 'IDLE', time: 0, elapsed: 0, hp: 120, maxHp: 120,
      target: null, path: [], attack: null, cooldown: 0, combo: 0, invulnerable: 0,
      dodge: 0, dodgeCooldown: 0, dodgeDir: { x: 0, z: 1 }, kills: 0, hasKey: false,
      paused: false, walkCycle: 0, shake: 0, guardReady: false };
    let showroom = [], originalBackground, originalFog, escortRoot, stationRoot, policeCar, door;
    let escorts = [], enemies = [], guard, boss, gate, nav, route = [], particles = [], obstacles = [], keyModel;
    let transitionSwitched = false, lastHud = '';
    const focus = new T.Vector3(), desiredFocus = new T.Vector3();
    const playerActor = { group: player.group, body: player.bodyGroup, pos: player.pos,
      armL: player.armL, armR: player.armR, legL: player.legL, legR: player.legR, cycle: 0 };
    const disposables = [];

    function material(color, roughness = .65, metalness = 0) {
      return new T.MeshStandardMaterial({ color, roughness, metalness });
    }
    function box(parent, w, h, d, x, y, z, mat) {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    }
    function textMap(text, color = '#bde6ef', bg = '#112b38', width = 512, height = 128) {
      const c = document.createElement('canvas'); c.width = width; c.height = height;
      const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = color; ctx.font = 'bold 48px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, width / 2, height / 2);
      const texture = new T.CanvasTexture(c); texture.encoding = T.sRGBEncoding; texture.anisotropy = 4;
      disposables.push(texture); return texture;
    }
    function sign(parent, text, x, y, z, width = 4, color, bg) {
      const m = new T.Mesh(new T.PlaneGeometry(width, width / 4), new T.MeshBasicMaterial({
        map: textMap(text, color, bg), side: T.DoubleSide, toneMapped: false }));
      m.position.set(x, y, z); parent.add(m); return m;
    }
    function obstacle(x, z, w, d) { obstacles.push({ minX: x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2 }); }
    function ring(radius, color, opacity = .6) {
      const m = new T.Mesh(new T.RingGeometry(radius-.055, radius, 48), new T.MeshBasicMaterial({
        color, transparent: true, opacity, side: T.DoubleSide, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI/2; m.position.y = .045; return m;
    }
    function makeOfficer(name, x, z, isBoss = false) {
      const group = new T.Group(), body = new T.Group(); group.add(body); group.position.set(x,0,z);
      const uniform = material(isBoss ? 0x262e3b : 0x234b66, .65), trousers = material(0x122538), skin = material(0xc58d64);
      const black = material(0x10151d), gold = material(0xd0ad58,.3,.7), vest = material(isBoss ? 0x353c3d : 0x152c3e);
      function leg(x) {
        const p = new T.Group(); p.position.set(x,.85,0); body.add(p);
        box(p,.29,.72,.32,0,-.36,0,trousers); box(p,.33,.18,.47,0,-.74,.07,black);
        return p;
      }
      function arm(x) {
        const p = new T.Group(); p.position.set(x,1.68,0); body.add(p);
        box(p,.26,.60,.29,0,-.3,0,uniform); box(p,.23,.21,.24,0,-.68,0,skin); return p;
      }
      const a = { name, group, body, pos: group.position, legL:leg(-.2), legR:leg(.2), armL:arm(-.51), armR:arm(.51),
        hp:isBoss?220:54, maxHp:isBoss?220:54, boss:isBoss, cycle:0, mode:'IDLE', timer:0,
        cooldown:1.0, attack:null, stun:0, alive:true, activated:false, flash:0, down:0, path:[], repath:0 };
      box(body,.82,.94,.49,0,1.32,0,uniform); box(body,.68,.68,.08,0,1.35,.275,vest);
      box(body,.87,.12,.55,0,.94,0,black); box(body,.14,.11,.03,0,.94,.30,gold);
      box(body,.12,.18,.03,-.20,1.58,.33,gold);
      box(body,.52,.49,.48,0,2.04,0,skin); box(body,.58,.18,.55,0,2.30,0,uniform);
      box(body,.58,.05,.27,0,2.22,.37,black); box(body,.13,.14,.03,0,2.31,.29,gold);
      for(const x of [-.13,.13]) box(body,.055,.045,.015,x,2.08,.248,black);
      if(isBoss) {
        group.scale.setScalar(1.32); box(body,.20,.28,.58,-.48,1.67,0,vest); box(body,.20,.28,.58,.48,1.67,0,vest);
        box(body,.61,.15,.04,0,2.1,.27,black);
      }
      const shadow = assets.contactShadow(T,1.65,1.5,.55); shadow.position.y=.025; group.add(shadow);
      a.selection = ring(isBoss?1.2:.85,0xf7c86a,.95); a.selection.visible=false; group.add(a.selection);
      a.warning = new T.Mesh(new T.CircleGeometry(isBoss?2.9:1.75,48), new T.MeshBasicMaterial({
        color:isBoss?0xff9957:0xf15f66,transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide,toneMapped:false }));
      a.warning.rotation.x=-Math.PI/2; a.warning.position.y=.035; group.add(a.warning);
      a.bar = new T.Group(); a.bar.position.y=isBoss?3.5:2.8; group.add(a.bar);
      box(a.bar,1.3,.12,.02,0,0,0,new T.MeshBasicMaterial({color:0x122532,toneMapped:false}));
      a.barFill=box(a.bar,1.2,.07,.025,0,0,.02,new T.MeshBasicMaterial({color:isBoss?0xffb65d:0x7ac8e6,toneMapped:false}));
      a.bar.visible=false;
      const hitbox = box(group,isBoss?1.35:1.1,isBoss?3.2:2.65,1.05,0,isBoss?1.6:1.3,0,
        new T.MeshBasicMaterial({visible:false})); hitbox.userData.officer=a;
      return a;
    }
    function animateBody(a, dt, walking, attack = null, cuffed = false) {
      a.cycle += dt * (walking?12:2);
      const swing=walking?Math.sin(a.cycle)*.68:0;
      a.legL.rotation.set(swing,0,0); a.legR.rotation.set(-swing,0,0);
      a.armL.rotation.set(-swing*.8,0,cuffed?-.3:.12); a.armR.rotation.set(swing*.8,0,cuffed?.3:-.12);
      a.legL.position.y=a.legR.position.y=.85; a.legL.position.z=a.legR.position.z=0;
      a.body.position.y=walking?Math.abs(Math.sin(a.cycle))*.085:Math.sin(a.cycle)*.012;
      a.body.rotation.x=0; a.body.rotation.z=0;
      if(cuffed) { a.armL.rotation.x=.45; a.armR.rotation.x=.45; }
      if(attack) {
        const punch=Math.sin(clamp(attack.time/attack.duration,0,1)*Math.PI);
        if(attack.kick) { a.legR.rotation.x=-1.65*punch; a.body.rotation.x=-.15*punch; a.armL.rotation.x=-.7; }
        else { const arm=attack.left?a.armL:a.armR; arm.rotation.x=-2.25*punch; a.body.rotation.y+=.08*punch*(attack.left?-1:1); }
      }
    }
    function face(a, p) { a.body.rotation.y=Math.atan2(p.x-a.pos.x,p.z-a.pos.z); }
    function moveAlong(a, path, speed, dt, collides = false) {
      while(path.length && distance(a.pos,path[0])<.13) path.shift();
      if(!path.length) return false;
      const q=path[0], dx=q.x-a.pos.x, dz=q.z-a.pos.z, len=Math.hypot(dx,dz);
      const step=Math.min(len,speed*dt), nx=a.pos.x+dx/len*step,nz=a.pos.z+dz/len*step;
      if(!collides||walkable(nx,a.pos.z)) a.pos.x=nx;
      if(!collides||walkable(a.pos.x,nz)) a.pos.z=nz;
      face(a,q); return true;
    }
    function setPhase(phase) {
      state.phase=phase;state.time=0;
      document.body.classList.toggle('chapter-cinematic',['ESCORT','BOARD','DRIVE','TRANSITION'].includes(phase));
    }
    function caption(kicker, text, hint='') {
      $('chapter-kicker').textContent=kicker; $('chapter-caption').textContent=text; $('chapter-hint').textContent=hint;
    }
    function hideOriginalHUD(hidden) {
      document.body.classList.toggle('police-chapter-active',hidden);
      for(const id of ['counter-tooltip','clerk-bubble','btn-quick-steal','danger-overlay','game-toast']) $(id).classList.add('hidden');
    }
    function makePoliceCar() {
      const g=assets.createCar(T);
      const paint=material(0xc2d2d7,.25,.5), blue=material(0x164b82,.3,.4);
      for(const side of [-1,1]) {
        box(g,2.65,.33,.045,-.05,.84,side*1.025,paint);
        box(g,2.5,.13,.05,-.05,.85,side*1.055,blue);
        const label=sign(g,'POLICE',0,1.01,side*1.06,1.5,'#e1f2ff','#12365b');
        if(side<0) label.rotation.y=Math.PI;
      }
      box(g,1.5,.1,.42,-.1,1.79,0,material(0x192633,.3,.7));
      const red=new T.MeshBasicMaterial({color:0xff334d,transparent:true,toneMapped:false}), cyan=new T.MeshBasicMaterial({color:0x3caaff,transparent:true,toneMapped:false});
      g.userData.beacons=[box(g,.57,.23,.38,-.48,1.93,0,red),box(g,.57,.23,.38,.28,1.93,0,cyan)];
      const light=new T.PointLight(0x368fff,1.5,8); light.position.set(0,2.1,0);g.add(light);g.userData.light=light;
      door=new T.Group();door.position.set(.63,1.1,-1.05);g.add(door);
      box(door,1.08,.6,.07,-.52,-.22,0,paint);box(door,1.08,.13,.08,-.52,-.22,-.05,blue);
      box(door,1.03,.45,.055,-.52,.27,0,material(0x305069,.15,.55));
      return g;
    }
    function start() {
      if(state.active) return;
      state.active=true;state.paused=false;state.elapsed=0;state.hp=120;state.target=null;state.hasKey=false;state.kills=0;
      state.attack=null;state.path=[];state.cooldown=0;state.invulnerable=0;state.dodge=0;state.dodgeCooldown=0;
      state.combo=0;state.guardReady=false;lastHud='';transitionSwitched=false;
      showroom=scene.children.map(object=>({object,visible:object.visible}));
      originalBackground=scene.background; originalFog=scene.fog;
      player.isCrouching=false;player.bodyGroup.scale.set(1,1,1);player.bodyGroup.position.set(0,0,0);
      player.group.visible=true;player.ringMesh.visible=false;player.path=[];player.targetDest=null;
      focus.copy(player.pos);focus.y=.6;
      hideOriginalHUD(true);$('chapter-hud').hidden=false;$('chapter-result').hidden=true;
      $('chapter-pause').hidden=true;$('chapter-transition').hidden=false;$('chapter-transition').style.opacity='0';
      escortRoot=new T.Group();scene.add(escortRoot);
      escorts=[makeOfficer('押送警员',player.pos.x-.85,player.pos.z),makeOfficer('押送警员',player.pos.x+.85,player.pos.z)];
      escorts.forEach(a=>{a.bar.visible=false;escortRoot.add(a.group);});
      policeCar=makePoliceCar();policeCar.position.set(-4,0,14.5);escortRoot.add(policeCar);
      assets.linearizeScene(escortRoot);
      route=context.showroomPath(player.pos,{x:-4,z:12.4})||[{x:-1,z:4.7},{x:-1,z:8.5},{x:-4,z:12.4}];
      caption('故事还没结束','你以为，被抓就是结局？','两名警员正在把你押往警车。');
      $('chapter-combat-ui').hidden=true;$('chapter-cell-action').hidden=true;$('chapter-dodge').hidden=true;
      setPhase('ESCORT');sound.caughtSiren(); updateHud();
    }
    function buildStation() {
      obstacles=[];enemies=[];particles=[];
      stationRoot=new T.Group();stationRoot.name='police-station-chapter';scene.add(stationRoot);
      const floor=material(0x30424c,.82), tile=material(0x344b54,.82), seam=material(0x1c303a), wall=material(0x41606d,.9);
      const base=material(0x182d3d,.72), steel=material(0x476171,.32,.75), dark=material(0x101f2c), brass=material(0xc6a258,.35,.65);
      box(stationRoot,28,.55,21,0,-.35,1,floor);
      for(let x=-12;x<=12;x+=2) for(let z=-7;z<=9;z+=2) box(stationRoot,1.97,.025,1.97,x,-.055,z,(x+z)%4===1?tile:floor);
      box(stationRoot,27,3.6,.32,0,1.7,-8,wall);box(stationRoot,.3,2.8,18,13.2,1.3,1,wall);
      box(stationRoot,.28,.5,18,-13.2,.2,1,base);box(stationRoot,27,.45,.32,0,.17,10,base);
      box(stationRoot,26,.18,.08,0,.65,-7.8,brass);box(stationRoot,26,.65,.10,0,.1,-7.78,base);
      sign(stationRoot,'中央警察局',-3.8,2.7,-7.80,4.6);
      sign(stationRoot,'CENTRAL  /  PRECINCT',7,3,-7.80,5.3);
      sign(stationRoot,'拘留区  01',-8.4,2.35,1.79,4,'#eac77c','#1c303d');
      // Cell is cut open toward the camera; its door actually rotates on the hinge.
      box(stationRoot,8.2,2.9,.25,-9.1,1.35,1.6,wall);obstacle(-9.1,1.6,8.2,.25);
      for(const z of [2.2,2.75,3.3,6.2,6.75,7.3,7.85,8.4,9]) box(stationRoot,.10,2.8,.10,-4.8,1.35,z,steel);
      box(stationRoot,.13,.13,7.1,-4.8,2.65,5.55,steel);
      box(stationRoot,.13,.13,7.1,-4.8,.1,5.55,steel);
      obstacle(-4.8,2.7,.18,1.8);obstacle(-4.8,7.65,.18,3.35);
      gate=new T.Group();gate.position.set(-4.8,0,3.55);stationRoot.add(gate);
      for(let z=0;z<=2.15;z+=.36)box(gate,.11,2.7,.09,0,1.35,z,steel);
      for(const y of [.16,1.25,2.6])box(gate,.13,.12,2.2,0,y,1.08,steel);
      box(gate,.23,.3,.25,-.09,1.3,1.9,brass);
      // Bed, folded blanket, sink and a tray establish a lived-in holding cell.
      box(stationRoot,2,.35,3.6,-11.3,.28,7.2,steel);box(stationRoot,1.92,.23,3.5,-11.3,.56,7.2,material(0x657b7c));
      box(stationRoot,1.82,.16,1.5,-11.3,.76,7.85,material(0x293f58));box(stationRoot,1.35,.20,.64,-11.3,.78,5.9,material(0xaeb4a2));
      obstacle(-11.3,7.2,2.1,3.65);
      box(stationRoot,1.15,.15,.8,-11.7,1.15,2.3,material(0x9aa8a6,.25,.15));
      box(stationRoot,.1,.4,.1,-11.7,1.44,2.05,steel);obstacle(-11.7,2.3,1.2,.8);
      sign(stationRoot,'01',-11,1.5,1.76,1,'#93bccc','#344b56');
      // Officer work area and evidence storage frame an open fighting corridor.
      function desk(x,z) {
        const wood=material(0x66513c,.7);box(stationRoot,3.7,.18,1.65,x,.95,z,wood);
        for(const dx of [-1.6,1.6])box(stationRoot,.16,.9,1.45,x+dx,.45,z,steel);
        box(stationRoot,1.1,.62,.1,x+.8,1.43,z-.25,dark);
        box(stationRoot,.98,.50,.018,x+.8,1.43,z-.18,new T.MeshBasicMaterial({color:0x73b4bc,toneMapped:false}));
        box(stationRoot,.15,.2,.18,x+.8,1.08,z-.25,steel);box(stationRoot,.9,.05,.3,x+.8,1.07,z+.35,dark);
        box(stationRoot,.7,.08,.52,x-.7,1.08,z,material(0xa49e7e));obstacle(x,z,3.8,1.75);
      }
      desk(-9,-5.5);desk(9.8,-5.7);
      for(const x of [-11.5,-10.2,-8.9,-7.6]) {
        box(stationRoot,1.15,2.5,.68,x,1.2,-7.25,base);
        for(const y of [.6,1.5,2.2]) { box(stationRoot,.75,.035,.02,x,y,-6.9,steel); }
        box(stationRoot,.06,.28,.05,x+.35,1.45,-6.88,brass);
      }
      obstacle(-9.55,-7.25,5.4,.75);
      for(const x of [11.3,12.1]) {
        box(stationRoot,.10,2.6,3.5,x,1.25,-.7,steel);
        for(const y of [.25,1.05,1.85])box(stationRoot,.9,.09,3.5,11.7,y,-.7,steel);
      }
      for(let i=0;i<6;i++)box(stationRoot,.66,.55,.65,11.7,.57+Math.floor(i/3)*.8,-1.8+(i%3)*1.08,material(i%2?0x6b6147:0x4b6064));
      obstacle(11.7,-.7,1.1,3.7);sign(stationRoot,'物证保管',11.6,2.6,-2.55,2.6);
      for(const x of [.2,3.2,6.2]) {
        box(stationRoot,2.7,.14,.8,x,.56,8.45,material(0x3a6268));
        box(stationRoot,2.7,.65,.16,x,.95,8.8,material(0x3a6268));
        for(const dx of [-1,1])box(stationRoot,.12,.5,.65,x+dx,.25,8.45,steel);obstacle(x,8.5,2.8,1.1);
      }
      const reception=sign(stationRoot,'接待区  /  RECEPTION',3,.025,9.4,5);
      reception.rotation.x=-Math.PI/2;
      // Hazard paint, drain and doors give scale without covering the arena.
      for(let z=-6;z<7;z+=1.0)box(stationRoot,.10,.01,.5,-3.6,.005,z,brass);
      box(stationRoot,2.8,3,.15,1,1.4,-7.7,base);sign(stationRoot,'出口 EXIT',1,3.05,-7.57,2.5,'#93dfbd','#163a31');
      box(stationRoot,.10,.43,.10,2,1.35,-7.54,brass);
      const hemi=new T.HemisphereLight(0xbce8ed,0x122031,.65);stationRoot.add(hemi);
      const sun=new T.DirectionalLight(0xe5d3ae,1.1);sun.position.set(-8,15,8);sun.castShadow=true;
      Object.assign(sun.shadow.camera,{left:-17,right:17,top:15,bottom:-15,near:.5,far:50});
      sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.03;sun.shadow.bias=-.0002;stationRoot.add(sun);
      const rim=new T.DirectionalLight(0x72abc8,.65);rim.position.set(12,9,-7);stationRoot.add(rim);
      for(const x of [-8,1,9]) {
        box(stationRoot,3,.09,.38,x,4.7,-3.8,steel);
        box(stationRoot,2.85,.025,.28,x,4.64,-3.8,new T.MeshBasicMaterial({color:0xd1e8db,toneMapped:false}));
        const light=new T.PointLight(0xd2e5dc,.75,12,1);light.position.set(x,4.5,-3.8);stationRoot.add(light);
      }
      const warm=new T.PointLight(0xe8b16c,.75,10,1);warm.position.set(-8,3.5,6);stationRoot.add(warm);
      guard=makeOfficer('送饭警察',-2,1.2);stationRoot.add(guard.group);
      keyModel=new T.Group();
      const keyMetal=material(0xe0b859,.25,.8);
      const keyBow=new T.Mesh(new T.TorusGeometry(.21,.065,8,24),keyMetal);keyModel.add(keyBow);
      box(keyModel,.10,.57,.10,0,-.39,0,keyMetal);box(keyModel,.22,.08,.10,.07,-.62,0,keyMetal);
      keyModel.visible=false;stationRoot.add(keyModel);
      const tray=new T.Group();box(tray,.75,.055,.48,0,0,0,steel);
      const bowl=new T.Mesh(new T.CylinderGeometry(.20,.16,.14,16),material(0xacae99));bowl.position.y=.09;tray.add(bowl);
      tray.position.set(0,1.15,.7);guard.body.add(tray);guard.tray=tray;
      const spots=[[-1,5],[4.8,6],[8.6,3.1],[7,-.3],[1.2,-2],[-3.6,-4.9],[6.8,-5.8]];
      const names=['值班警员','巡逻警员','走廊警卫','物证室警卫','执勤警员','值夜警卫','精英警卫'];
      spots.forEach((p,i)=>{const a=makeOfficer(names[i],p[0],p[1]);a.id=i+1;enemies.push(a);stationRoot.add(a.group);});
      boss=makeOfficer('典狱长 · 铁拳',.4,-5.8,true);boss.group.visible=false;stationRoot.add(boss.group);
      assets.linearizeScene(stationRoot);
      nav=new rules.Navigator(walkable,.45);
    }
    function walkable(x,z) {
      const radius=.42;
      if(x< -12.65||x>12.6||z< -7.3||z>9.45) return false;
      if(!state.hasKey && (x> -5.3||z<2.45||z>9.25))return false;
      return !obstacles.some(b=>x+radius>b.minX&&x-radius<b.maxX&&z+radius>b.minZ&&z-radius<b.maxZ);
    }
    function enterCell() {
      showroom.forEach(({object})=>{if(object!==player.group)object.visible=false;});escortRoot.visible=false;
      scene.background=new T.Color(0x0b1824).convertSRGBToLinear();scene.fog=null;
      state.hasKey=false;buildStation();
      player.pos.set(-8,0,5.8);player.group.position.copy(player.pos);player.group.visible=true;player.ringMesh.visible=true;
      state.path=[];state.attack=null;state.target=null;state.guardReady=false;
      focus.set(-5.5,.5,3.7);setPhase('CELL');
      caption('第二章  /  不速之客','门锁着。晚饭正在路上。','点击地面移动；等送饭的警察靠近。');
      $('chapter-transition-title').textContent='第二章';$('chapter-transition-subtitle').textContent='这次，换一条出路。';
      $('chapter-combat-ui').hidden=false;$('chapter-cell-action').hidden=true;updateHud();
    }
    function pickTarget(a) {
      if(!a?.alive)return;
      state.target=a;state.path=[];
      a.activated=true;
      if(a===guard)caption('机会只有一次','趁他靠近，拿到钥匙。','已锁定送饭警察 · 正在近身');
      else toast('锁定 '+a.name+' · 自动近身连击，空格闪避。',1700);
    }
    function pointer(event, canvas) {
      if(!state.active||state.paused||event.button!==0)return;
      if(!['CELL','GUARD','COMBAT'].includes(state.phase))return;
      const rect=canvas.getBoundingClientRect(), mouse=new T.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
      const ray=new T.Raycaster();ray.setFromCamera(mouse,camera);
      const candidates=state.phase==='GUARD'&&state.guardReady?[guard]:state.phase==='COMBAT'?[...enemies,boss].filter(a=>a.alive&&a.group.visible):[];
      const hits=ray.intersectObjects(candidates.map(a=>a.group),true);
      if(hits.length){let obj=hits[0].object;while(obj&&!candidates.some(a=>a.group===obj))obj=obj.parent;const a=candidates.find(a=>a.group===obj);if(a){pickTarget(a);return;}}
      const p=new T.Vector3();if(ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),0),p)&&walkable(p.x,p.z)) {
        state.target=null;state.path=nav.findPath(player.pos,p)||[];
      }
    }
    function beginAttack() {
      if(!state.target?.alive||state.cooldown>0||state.attack||state.dodge>0)return;
      const kick=state.combo%3===2;
      state.attack={time:0,duration:kick?.56:.40,hit:false,kick,left:state.combo%2===0,target:state.target};
      state.cooldown=kick?.65:.48;state.combo++;
      face(playerActor,state.target.pos);
      sound.playTone(kick?160:260,'triangle',.06,.05);
    }
    function burst(pos,color=0xffd482,count=8) {
      for(let i=0;i<count;i++) {
        const m=new T.Mesh(new T.BoxGeometry(.09,.09,.09),new T.MeshBasicMaterial({color,transparent:true,toneMapped:false}));
        m.position.set(pos.x,1.3+Math.random()*.45,pos.z);stationRoot.add(m);
        particles.push({mesh:m,life:.4,vx:(Math.random()-.5)*5,vy:2+Math.random()*2,vz:(Math.random()-.5)*5});
      }
    }
    function knockOut(a) {
      if(!a.alive)return;a.alive=false;a.mode='DOWN';a.down=0;a.attack=null;a.warning.material.opacity=0;a.bar.visible=false;a.selection.visible=false;
      if(state.target===a){state.target=null;state.path=[];}
      if(a===guard) {
        a.tray.visible=false;state.hasKey=true;state.guardReady=false;state.attack=null;
        $('chapter-speech').hidden=true;$('chapter-cell-action').hidden=true;
        gate.rotation.y=-Math.PI*.53;nav=new rules.Navigator(walkable,.45);
        keyModel.visible=true;keyModel.position.set(player.pos.x,2.85,player.pos.z);
        state.hp=state.maxHp;state.invulnerable=1.5;setPhase('KEY');
        caption('钥匙到手','牢门开了。现在，轮到你出招。','7 名警卫 + 1 名 Boss · 点击敌人自动拳脚连击');
        toast('获得拘留室钥匙 · 牢门已打开',3000);sound.stealSuccess();
      } else {
        if(!a.boss){state.kills++;state.hp=Math.min(state.maxHp,state.hp+9);toast('击倒 '+state.kills+'/7 · 恢复 9 点体力',1600);}
        else {setPhase('ESCAPED');state.target=null;sound.victoryFanfare();caption('第二章完成','逃出警察局成功','原来，故事还可以这样发展。');}
      }
    }
    function hitEnemy(a,amount,kick) {
      if(!a.alive)return;
      a.hp=Math.max(0,a.hp-amount);
      // The boss keeps winding up through ordinary hits; dodging his attack matters.
      if(!a.boss || (kick && (!a.attack || a.attack.time>=1.05))) {
        a.stun=a.boss?.30:.42;a.attack=null;a.warning.material.opacity=0;
      }
      burst(a.pos,kick?0xffc16e:0xd6f0ed);state.shake=kick?.11:.055;sound.playTone(kick?75:110,'square',.06,.055);
      const dx=a.pos.x-player.pos.x,dz=a.pos.z-player.pos.z,len=Math.hypot(dx,dz)||1;
      const nx=a.pos.x+dx/len*(kick?.28:.12),nz=a.pos.z+dz/len*(kick?.28:.12);
      if(walkable(nx,nz)){a.pos.x=nx;a.pos.z=nz;}
      if(a.hp<=0||a===guard)knockOut(a);
    }
    function damagePlayer(amount,from) {
      if(state.invulnerable>0||state.phase!=='COMBAT')return;
      state.hp=Math.max(0,state.hp-amount);state.invulnerable=.65;state.shake=.15;burst(player.pos,0xf18b74,5);
      sound.playTone(65,'sawtooth',.10,.06);
      const dx=player.pos.x-from.x,dz=player.pos.z-from.z,len=Math.hypot(dx,dz)||1;
      const nx=player.pos.x+dx/len*.4,nz=player.pos.z+dz/len*.4;if(walkable(nx,nz))player.pos.set(nx,0,nz);
      if(state.hp<=0){setPhase('DEFEAT');state.target=null;state.attack=null;showResult(false);}
    }
    function dodge() {
      if(state.phase!=='COMBAT'||state.paused||state.dodgeCooldown>0)return;
      let x=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),z=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);
      if(x||z){const d=rules.screenMove(x,z,-16,23,0);x=d.x;z=d.z;}
      else if(state.target){x=player.pos.x-state.target.pos.x;z=player.pos.z-state.target.pos.z;}
      else {x=Math.sin(player.bodyGroup.rotation.y);z=Math.cos(player.bodyGroup.rotation.y);}
      const length=Math.hypot(x,z)||1;state.dodgeDir={x:x/length,z:z/length};state.dodge=.3;state.invulnerable=.45;state.dodgeCooldown=1.5;
      state.attack=null;sound.playTone(370,'sine',.08,.045);
    }
    function updatePlayer(dt) {
      state.cooldown=Math.max(0,state.cooldown-dt);state.invulnerable=Math.max(0,state.invulnerable-dt);state.dodgeCooldown=Math.max(0,state.dodgeCooldown-dt);
      let walking=false;
      if(state.dodge>0) {
        state.dodge=Math.max(0,state.dodge-dt);const nx=player.pos.x+state.dodgeDir.x*10*dt,nz=player.pos.z+state.dodgeDir.z*10*dt;
        if(walkable(nx,player.pos.z))player.pos.x=nx;if(walkable(player.pos.x,nz))player.pos.z=nz;walking=true;
      } else {
        let mx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),mz=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);
        if(mx||mz) {
          state.path=[];const d=rules.screenMove(mx,mz,-16,23,0),speed=state.attack?2:5;
          const nx=player.pos.x+d.x*speed*dt,nz=player.pos.z+d.z*speed*dt;
          if(walkable(nx,player.pos.z))player.pos.x=nx;if(walkable(player.pos.x,nz))player.pos.z=nz;
          if(!state.attack)face(playerActor,{x:player.pos.x+d.x,z:player.pos.z+d.z});walking=true;
        } else if(state.target?.alive) {
          const target=state.target,range=target.boss?2.15:1.5;
          if(distance(player.pos,target.pos)>range&&!state.attack) {
            if(!state.path.length||state.time-(state.repathAt||0)>.35){state.path=nav.findPath(player.pos,target.pos)||[];state.repathAt=state.time;}
            walking=moveAlong(playerActor,state.path,5,dt,true);
          } else {state.path=[];face(playerActor,target.pos);beginAttack();}
        } else if(!state.attack)walking=moveAlong(playerActor,state.path,4.8,dt,true);
      }
      if(state.attack) {
        const attack=state.attack;attack.time+=dt;
        if(!attack.hit&&attack.time>=attack.duration*.42) {
          attack.hit=true;const a=attack.target;
          if(a.alive&&distance(player.pos,a.pos)<(a.boss?2.6:2.05))hitEnemy(a,attack.kick?29:18,attack.kick);
        }
        if(state.attack===attack&&attack.time>=attack.duration)state.attack=null;
      }
      player.group.position.copy(player.pos);animateBody(playerActor,dt,walking,state.attack);
      if(state.dodge>0)player.bodyGroup.rotation.z=.28;
      player.ringMesh.material.opacity=state.invulnerable>0?.4+Math.sin(state.time*30)*.3:.85;
    }
    function updateEnemies(dt) {
      const alive=enemies.filter(a=>a.alive);
      if(state.kills===7&&!boss.activated) {
        boss.activated=true;boss.group.visible=true;boss.cooldown=1.8;state.hp=Math.min(state.maxHp,state.hp+35);
        caption('最后一道门','典狱长 · 铁拳','橙色圆圈蓄满前闪避，趁他收招时近身。');
        toast('Boss 登场 · 恢复 35 点体力',3500);sound.caughtSiren();
      }
      const candidates=[...alive,...(boss.activated&&boss.alive?[boss]:[])];
      const nearby=candidates.filter(a=>distance(a.pos,player.pos)<7.5||state.target===a).sort((a,b)=>distance(a.pos,player.pos)-distance(b.pos,player.pos));
      const attackers=new Set(nearby.slice(0,2));
      for(const a of candidates) {
        const d=distance(a.pos,player.pos);a.cooldown=Math.max(0,a.cooldown-dt);a.stun=Math.max(0,a.stun-dt);
        let walking=false;
        if(a.stun>0){animateBody(a,dt,false);continue;}
        if(a.attack) {
          a.attack.time+=dt;const windup=a.boss?1.05:.70, duration=a.boss?1.65:1.12;
          a.warning.material.opacity=a.attack.time<windup?.10+.35*a.attack.time/windup:0;
          if(!a.attack.hit&&a.attack.time>=windup){a.attack.hit=true;if(d<(a.boss?3:1.95))damagePlayer(a.boss?16:7,a.pos);}
          if(a.attack.time>=duration){a.attack=null;a.cooldown=a.boss?1.1:1.2;a.warning.material.opacity=0;}
        } else if(attackers.has(a)&&state.hasKey) {
          a.activated=true;face(a,player.pos);
          if(d>(a.boss?2.4:1.65)) {
            a.repath-=dt;if(a.repath<=0){a.path=nav.findPath(a.pos,player.pos)||[];a.repath=.65;}
            walking=moveAlong(a,a.path,a.boss?2.25:2.1,dt,true);
          } else if(a.cooldown<=0){a.attack={time:0,duration:a.boss?1.65:1.12,hit:false,kick:a.boss};a.path=[];}
        }
        // Keep fighters from occupying the same point, with collision-aware separation.
        for(const b of candidates)if(b!==a&&distance(a.pos,b.pos)<.8){const dx=a.pos.x-b.pos.x,dz=a.pos.z-b.pos.z,len=Math.hypot(dx,dz)||1;
          const nx=a.pos.x+dx/len*dt,nz=a.pos.z+dz/len*dt;if(walkable(nx,nz)){a.pos.x=nx;a.pos.z=nz;}}
        let anim=a.attack&&a.attack.time>(a.boss?1.0:.65)?{time:a.attack.time-(a.boss?1.0:.65),duration:.45,kick:a.boss}:null;
        animateBody(a,dt,walking,anim);
      }
    }
    function showResult(win) {
      $('chapter-result').hidden=false;$('chapter-result-kicker').textContent=win?'CHAPTER 02 / COMPLETE':'CHAPTER 02 / TRY AGAIN';
      $('chapter-result-title').textContent=win?'逃出警察局成功':'被重新关回去了';
      $('chapter-result-copy').textContent=win?'7 名警卫与典狱长已全部击倒。门外的夜色，终于属于你。':'钥匙已经拿到过一次。调整走位，看到攻击预警时用空格闪避。';
      const m=Math.floor(state.elapsed/60),s=Math.floor(state.elapsed%60);
      $('chapter-result-stats').textContent=`警卫 ${state.kills}/7  ·  Boss ${boss?.alive?'未击倒':'已击倒'}  ·  ${m}:${String(s).padStart(2,'0')}`;
      $('chapter-retry').hidden=win;$(win?'chapter-result-restart':'chapter-retry').focus();
    }
    function retryStation() {
      $('chapter-result').hidden=true;$('chapter-pause').hidden=true;state.paused=false;
      state.hp=120;state.kills=0;state.combo=0;state.attack=null;state.target=null;state.cooldown=0;state.elapsed=0;
      state.dodge=0;state.invulnerable=1;state.path=[];state.guardReady=false;state.repathAt=0;
      releaseGroup(stationRoot);stationRoot=null;enterCell();
    }
    function updateHud() {
      const hp=Math.ceil(state.hp),target=state.target?.alive?state.target:null;
      const stamp=[hp,state.kills,state.hasKey,target?.name,target?.hp,boss?.activated,state.dodgeCooldown>.1,state.phase].join('|');
      if(stamp===lastHud)return;lastHud=stamp;
      $('chapter-health-fill').style.width=(state.hp/state.maxHp*100)+'%';$('chapter-health-value').textContent=hp+' / '+state.maxHp;
      $('chapter-key').textContent=state.hasKey?'钥匙 ✓':'牢门已锁';$('chapter-enemy-count').textContent=state.kills+' / 7';
      $('chapter-boss-status').textContent=boss?.activated?(boss.alive?'Boss 已登场':'Boss 已击倒'):'Boss 待登场';
      $('chapter-target').hidden=!target;
      if(target){$('chapter-target-name').textContent=target.name;$('chapter-target-fill').style.width=(target.hp/target.maxHp*100)+'%';}
      $('chapter-dodge').disabled=state.dodgeCooldown>.1;$('chapter-dodge').textContent=state.dodgeCooldown>.1?'闪避冷却':'闪避 · 空格';
      $('chapter-speech').hidden=state.phase!=='GUARD'||!state.guardReady;
    }
    function update(dt) {
      if(!state.active||state.paused)return;
      state.time+=dt;state.elapsed+=dt;state.shake=Math.max(0,state.shake-dt);
      if(escortRoot?.visible) {
        const flash=Math.sin(state.time*11)>0;policeCar.userData.beacons.forEach((m,i)=>m.material.opacity=(flash===(i===0))?1:.22);
        policeCar.userData.light.color.setHex(flash?0xf23b50:0x318bff);
      }
      if(state.phase==='ESCORT') {
        const moving=moveAlong(playerActor,route,3.2,dt);player.group.position.copy(player.pos);animateBody(playerActor,dt,moving,null,true);
        const angle=player.bodyGroup.rotation.y;
        escorts.forEach((a,i)=>{const side=i?1:-1;a.pos.set(player.pos.x+Math.cos(angle)*side*.83,0,player.pos.z-Math.sin(angle)*side*.83);
          a.body.rotation.y=angle;animateBody(a,dt,moving);a.armR.rotation.z=i?-.2:-.7;a.armL.rotation.z=i?.7:.2;});
        if(!route.length){setPhase('BOARD');caption('请上车','还有一段路要走。','警车即将驶离展厅。');}
      } else if(state.phase==='BOARD') {
        door.rotation.y=-Math.sin(Math.min(1,state.time/1.0)*Math.PI/2)*1.15;
        player.pos.lerp(new T.Vector3(-4,0,14),Math.min(1,dt*2));player.group.position.copy(player.pos);animateBody(playerActor,dt,true,null,true);
        escorts.forEach((a,i)=>{a.pos.lerp(new T.Vector3(-4+(i?1.0:-1.0),0,14.2),dt*2);animateBody(a,dt,true);});
        if(state.time>2.5){player.group.visible=false;escorts.forEach(a=>a.group.visible=false);door.rotation.y=0;setPhase('DRIVE');}
      } else if(state.phase==='DRIVE') {
        policeCar.position.x+=dt*(3+state.time*3);if(state.time>2.8){setPhase('TRANSITION');$('chapter-transition-title').textContent='稍后 · 中央警察局';$('chapter-transition-subtitle').textContent='事情开始偏离原计划。';}
      } else if(state.phase==='TRANSITION') {
        $('chapter-transition').style.opacity=String(Math.min(1,state.time));
        if(state.time>2.1&&!transitionSwitched){transitionSwitched=true;enterCell();}
      } else if(state.phase==='CELL') {
        $('chapter-transition').style.opacity=String(Math.max(0,1-state.time));
        if(state.time>1.1)$('chapter-transition').hidden=true;
        updatePlayer(dt);
        const moving=moveAlong(guard,[{x:-3.2,z:4.6}],1.9,dt);animateBody(guard,dt,moving);
        if(state.time>3.4){setPhase('DELIVERY');gate.rotation.y=-1.35;caption('有人来了','送饭的警察打开了门。','等他靠近。');}
      } else if(state.phase==='DELIVERY') {
        updatePlayer(dt);const moving=moveAlong(guard,[{x:-6.1,z:4.9}],1.65,dt);animateBody(guard,dt,moving);face(guard,player.pos);
        if(distance(guard.pos,{x:-6.1,z:4.9})<.2){setPhase('GUARD');state.guardReady=true;gate.rotation.y=0;
          caption('破绽','他只顾着放下餐盘。','点击警察，或按 E，打晕他并拿走钥匙。');$('chapter-cell-action').hidden=false;$('chapter-speech').hidden=false;}
      } else if(state.phase==='GUARD') {
        updatePlayer(dt);if(guard.alive){face(guard,player.pos);animateBody(guard,dt,false);guard.armL.rotation.x=-.8;guard.armR.rotation.x=-.8;}
      } else if(state.phase==='KEY') {
        keyModel.rotation.y+=dt*3;keyModel.position.y=2.85+Math.sin(state.time*4)*.12;
        animateBody(playerActor,dt,false);if(state.time>1.5){keyModel.visible=false;setPhase('COMBAT');$('chapter-dodge').hidden=false;caption('第二章 / 警局突围','击倒 7 名警卫，再挑战典狱长。','点击敌人自动追击 · 点击地面走位 · WASD 移动 · 空格闪避');}
      } else if(state.phase==='COMBAT') {
        updatePlayer(dt);if(state.phase==='COMBAT')updateEnemies(dt);
      } else if(state.phase==='ESCAPED') {
        animateBody(playerActor,dt,false);if(state.time>1.3&&$('chapter-result').hidden)showResult(true);
      }
      for(const a of [...enemies,guard,boss].filter(Boolean)) {
        if(!a.alive){a.down=Math.min(1,a.down+dt*3);a.body.rotation.z=-a.down*Math.PI/2;a.body.position.y=a.down*.43;}
        a.selection.visible=a.alive&&state.target===a;
        a.bar.visible=a.alive&&a.group.visible&&(a.activated||state.target===a)&&a!==guard;
        a.bar.quaternion.copy(camera.quaternion);a.barFill.scale.x=Math.max(0,a.hp/a.maxHp);a.barFill.position.x=-.6*(1-a.hp/a.maxHp);
      }
      for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.vy-=dt*9;p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;p.mesh.material.opacity=Math.max(0,p.life/.4);
        if(p.life<=0){stationRoot.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();particles.splice(i,1);}}
      updateHud();
    }
    function updateCamera(dt) {
      if(!state.active)return;
      const station=stationRoot?.visible;
      if(station){desiredFocus.set(player.pos.x*.58,.5,player.pos.z*.52);}
      else if(state.phase==='DRIVE'||state.phase==='TRANSITION')desiredFocus.copy(policeCar.position).add(new T.Vector3(0,.5,0));
      else desiredFocus.copy(player.pos).add(new T.Vector3(0,.6,0));
      focus.lerp(desiredFocus,Math.min(1,dt*3));
      const fit=Math.max(1,Math.min(1.65,1.06/camera.aspect));
      const scale=station ? .86 : .76;
      camera.position.set(focus.x-16*fit*scale,focus.y+28*fit*scale,focus.z+23*fit*scale);
      if(state.shake>0)camera.position.x+=Math.sin(state.time*73)*state.shake;
      camera.lookAt(focus);
      if(state.phase==='GUARD'&&state.guardReady){const v=guard.pos.clone().add(new T.Vector3(0,3.2,0)).project(camera);
        $('chapter-speech').style.left=((v.x*.5+.5)*window.innerWidth)+'px';$('chapter-speech').style.top=((-v.y*.5+.5)*window.innerHeight)+'px';}
    }
    function pause(value) {
      if(!state.active||['ESCAPED','DEFEAT'].includes(state.phase))return;
      state.paused=value;context.clearInput();$('chapter-pause').hidden=!value;
      if(value)$('chapter-resume').focus();
    }
    function key(event) {
      const k=event.key.toLowerCase();
      if(['escape','p'].includes(k)){if(!event.repeat)pause(!state.paused);return;}
      if(state.paused||event.repeat)return;
      if(k===' '||k==='shift')dodge();
      if(k==='e'&&state.phase==='GUARD'&&state.guardReady)pickTarget(guard);
    }
    function releaseGroup(group) {
      if(!group)return;scene.remove(group);const geos=new Set(),mats=new Set();
      group.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mats.add(m));if(o.shadow?.map)o.shadow.map.dispose();});
      geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());
    }
    function stop() {
      if(!state.active)return;
      state.active=false;state.paused=false;state.phase='IDLE';
      showroom.forEach(({object,visible})=>object.visible=visible);showroom=[];
      scene.background=originalBackground;scene.fog=originalFog;
      releaseGroup(escortRoot);releaseGroup(stationRoot);escortRoot=null;stationRoot=null;particles=[];enemies=[];guard=null;boss=null;
      disposables.splice(0).forEach(t=>t.dispose());
      player.group.visible=true;player.ringMesh.visible=true;player.bodyGroup.rotation.set(0,0,0);player.bodyGroup.position.set(0,0,0);
      player.ringMesh.material.opacity=.9;
      for(const a of [player.armL,player.armR,player.legL,player.legR])a.rotation.set(0,0,0);
      player.legL.position.set(-.19,.85,0);player.legR.position.set(.19,.85,0);
      hideOriginalHUD(false);
      document.body.classList.remove('chapter-cinematic');
      for(const id of ['chapter-hud','chapter-transition','chapter-pause','chapter-result','chapter-speech'])$(id).hidden=true;
    }
    $('chapter-cell-action').addEventListener('click',()=>{if(state.guardReady)pickTarget(guard);});
    $('chapter-dodge').addEventListener('click',dodge);
    $('chapter-pause-button').addEventListener('click',()=>pause(true));
    $('chapter-resume').addEventListener('click',()=>pause(false));
    $('chapter-restart').addEventListener('click',()=>context.restart());
    $('chapter-result-restart').addEventListener('click',()=>context.restart());
    $('chapter-retry').addEventListener('click',retryStation);
    window.addEventListener('blur',()=>{if(state.active&&!state.paused)pause(true);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.active&&!state.paused)pause(true);});
    return { state, start, stop, update, updateCamera, pointer, key, pause,
      get active(){return state.active;},get paused(){return state.paused;} };
  }
  root.PoliceChapter={create};
})(typeof window!=='undefined'?window:globalThis);
