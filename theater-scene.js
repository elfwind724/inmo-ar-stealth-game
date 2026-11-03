/* INMO fan-made comedy theatre. Render adapter; show progression lives in theater-story.js. */
(function (global) {
  'use strict';
  function build({THREE:T,scene,renderer}) {
    const stageY=.75, staticRoot=new T.Group(), movingRoot=new T.Group(),chairRoot=new T.Group();
    staticRoot.name='theatre-architecture';movingRoot.name='theatre-performers';chairRoot.name='fallback-chairs';
    scene.add(staticRoot,movingRoot,chairRoot);
    const geometries={box:new T.BoxGeometry(1,1,1),sphere:new T.SphereGeometry(1,16,12),cylinder:new T.CylinderGeometry(1,1,1,16),cone:new T.ConeGeometry(1,1,24,1,true)};
    const mats=[],textures=[],actors={},audience=[],stageLights=[],beams=[],lampFaces=[],screens=[],glows=[];
    const materialCache=new Map();
    const color=c=>new T.Color(c).convertSRGBToLinear();
    function mat(c,roughness=.7,metalness=0){const key=c+'/'+roughness+'/'+metalness;if(materialCache.has(key))return materialCache.get(key);const m=new T.MeshStandardMaterial({color:color(c),roughness,metalness});mats.push(m);materialCache.set(key,m);return m;}
    function glow(c){const key='glow/'+c;if(materialCache.has(key))return materialCache.get(key);const m=new T.MeshBasicMaterial({color:color(c),toneMapped:false});mats.push(m);glows.push({material:m,base:color(c)});materialCache.set(key,m);return m;}
    const P={floor:mat(0x181c26,.78),wall:mat(0x12151e,.91),velvet:mat(0x11151f,.96),chair:mat(0x27232c,.98),chairBack:mat(0x3d3038,.94),black:mat(0x181b21,.7),stage:mat(0x22252d,.5,.12),white:mat(0xe0ded7,.65),silver:mat(0x737e88,.31,.72),gold:mat(0xb89453,.32,.62),brass:mat(0x776343,.55,.45),amber:glow(0xffc873),light:glow(0xffeed5),blue:glow(0x6ac7da),red:glow(0xe45d3f),skin:mat(0xdbac8a,.86),hair:mat(0x29242b,.88)};
    function mesh(parent,g,m,x=0,y=0,z=0,sx=1,sy=1,sz=1,shadow=true){const o=new T.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=shadow;o.receiveShadow=true;parent.add(o);return o;}
    function box(parent,w,h,d,x,y,z,m,shadow=true){return mesh(parent,geometries.box,m,x,y,z,w,h,d,shadow);}
    function sphere(parent,w,h,d,x,y,z,m,shadow=true){return mesh(parent,geometries.sphere,m,x,y,z,w,h,d,shadow);}
    function cyl(parent,r,h,x,y,z,m,shadow=true){return mesh(parent,geometries.cylinder,m,x,y,z,r,h,r,shadow);}
    function panel(parent,w,h,x,y,z,m){return mesh(parent,new T.PlaneGeometry(w,h),m,x,y,z,1,1,1,false);}
    function makeTexture(w,h,paint){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');paint(ctx,w,h);const tx=new T.CanvasTexture(c);tx.encoding=T.sRGBEncoding;tx.anisotropy=Math.min(4,renderer?.capabilities?.getMaxAnisotropy?.()||1);textures.push(tx);return tx;}
    function screenMaterial(texture){const m=new T.MeshBasicMaterial({map:texture,color:0xffffff,toneMapped:false});mats.push(m);screens.push(m);return m;}
    function textPanel(text,sub,w=3,h=.65,bg='#161b25',fg='#edd4a1'){
      return screenMaterial(makeTexture(768,Math.round(768*h/w),(c,W,H)=>{c.fillStyle=bg;c.fillRect(0,0,W,H);c.textAlign='center';c.textBaseline='middle';c.fillStyle=fg;c.font='700 '+Math.round(H*(sub?.32:.45))+'px "Microsoft YaHei",sans-serif';c.fillText(text,W/2,H*(sub?.36:.5));if(sub){c.fillStyle='#a6b2be';c.font='400 '+Math.round(H*.17)+'px "Microsoft YaHei",sans-serif';c.fillText(sub,W/2,H*.76);}}));
    }
    // A dark, high-ceilinged hall keeps the white booth artwork and gold trim readable.
    box(staticRoot,30,.18,38,0,-.1,3,P.floor);
    box(staticRoot,30,12,.35,0,5.9,-13,P.wall);
    for(const side of [-1,1]){
      box(staticRoot,.35,10,36,side*14.5,4.9,3,P.wall);
      for(let i=0;i<16;i++)box(staticRoot,.18,7.8,.48,side*14.25,3.8,-12+i*2.2,i%3?P.velvet:P.black);
      for(let z=-10;z<21;z+=5.5){box(staticRoot,.04,3.8,.04,side*14,2.25,z,P.amber,false);box(staticRoot,.4,.12,1.4,side*13.7,.04,z,P.brass,false);}
      // White branded exhibition islands sit to either side of the audience.
      box(staticRoot,2.5,1.1,2.2,side*11,.55,-1.4,P.white);
      box(staticRoot,2.42,.09,2.1,side*11,1.13,-1.4,P.black);
      panel(staticRoot,2.1,.52,side*11,.64,-.285,textPanel('inmo',side<0?'GO3 / MAGIC AI':'AIR3 / 空间智能',2.1,.52,'#e2dfd6','#20232a'));
      for(let i=0;i<2;i++){
        const stemX=side*11+(i?1:-1)*.55;
        box(staticRoot,.55,.025,.45,stemX,1.19,-1.35,P.silver);cyl(staticRoot,.018,.42,stemX,1.41,-1.35,P.silver);
        const glasses=new T.Group();glasses.position.set(stemX,1.63,-1.35);staticRoot.add(glasses);
        if(global.INMOAssets?.createGlasses){const g=global.INMOAssets.createGlasses(T,i?'go3':'air3');g.scale.setScalar(.30);g.rotation.x=0;glasses.add(g);global.INMOAssets.linearizeScene?.(glasses);}else{
          for(const s of [-1,1]){const ring=new T.Mesh(new T.TorusGeometry(.102,.018,6,16),i?P.white:P.black);ring.position.x=s*.12;glasses.add(ring);}box(glasses,.08,.025,.025,0,0,0,P.silver);
        }
      }
      panel(staticRoot,2.8,.45,side*10.8,4.4,-3.4,textPanel('让信息 回到真实空间','INMO COMMUNITY · FAN SHOW',2.8,.45));
    }
    // Recessed carpet lanes and aisle edge lighting guide first-person movement.
    box(staticRoot,2.0,.012,24,0,.007,8.2,mat(0x514532,.95));
    for(const side of [-1,1])box(staticRoot,.025,.012,23,side*1.03,.016,8.25,P.amber,false);
    for(let x=-12;x<=12;x+=2.4)box(staticRoot,.012,.008,34,x,.005,3.2,mat(0x303540,.98),false);
    for(let z=-12;z<=20;z+=2.4)box(staticRoot,27,.008,.012,0,.005,z,mat(0x303540,.98),false);
    // Stage platform, stepped apron and a floating gold reveal line.
    box(staticRoot,18,.75,7,0,.375,-9,P.black);
    box(staticRoot,18,.04,7.05,0,.73,-9,P.stage);
    box(staticRoot,18,.028,.025,0,.78,-5.465,P.amber,false);
    for(let i=0;i<3;i++){
      const y=(3-i)*.185,z=-5.06+i*.48;
      box(staticRoot,6.2,y,.48,0,y/2,z,P.stage);
      box(staticRoot,6.12,.018,.025,0,y+.008,z+.245,P.amber,false);
    }
    // Main photo is the official booth banner crop, not a replacement for the 3D space.
    const fallback=makeTexture(1600,640,(c,W,H)=>{c.fillStyle='#dddcd3';c.fillRect(0,0,W,H);const g=c.createLinearGradient(0,H,W,0);g.addColorStop(0,'#efc341');g.addColorStop(.55,'#eda62d');g.addColorStop(1,'#d46a25');c.fillStyle=g;c.beginPath();c.moveTo(0,H*.75);c.lineTo(W,H*.05);c.lineTo(W,H*.38);c.lineTo(0,H);c.fill();c.fillStyle='#17191e';c.font='800 180px Arial,sans-serif';c.fillText('inmo',100,225);c.font='600 61px "Microsoft YaHei",sans-serif';c.fillText('让信息 回到真实空间',100,365);c.font='500 28px Arial,sans-serif';c.fillText('11.04  /  11:00  /  NEW DIMENSIONS',104,437);});
    const bannerMat=screenMaterial(fallback);box(staticRoot,16.6,6.6,.16,0,4.35,-12.25,P.white);panel(staticRoot,16.15,6.12,0,4.4,-12.15,bannerMat);
    const assetStatus={wide:'loading',close:'loading'};
    function loadPhoto(path,material,status,crop){return new Promise(resolve=>{new T.TextureLoader().load(path,tx=>{tx.encoding=T.sRGBEncoding;tx.anisotropy=Math.min(4,renderer?.capabilities?.getMaxAnisotropy?.()||1);if(crop){tx.repeat.set(crop[0],crop[1]);tx.offset.set(crop[2],crop[3]);}textures.push(tx);material.map=tx;material.needsUpdate=true;assetStatus[status]='ready';resolve(true);},undefined,()=>{assetStatus[status]='fallback';resolve(false);});});}
    const ready=[loadPhoto('./assets/booth-reference-wide.jpg',bannerMat,'wide',[725/1440,275/1080,390/1440,520/1080])];
    panel(staticRoot,7.1,.46,0,7.95,-12.04,textPanel('INMO 影目 · 新品发布会','',7.1,.46,'#0e131d','#e9d3a5'));
    panel(staticRoot,5.6,.38,0,.36,-5.45,textPanel('INMO COMMUNITY  /  群友特别场','',5.6,.38,'#141820','#dbbd87'));
    // Side screens carry readable current-act titles; central image stays unobstructed.
    const sideScreens=[];let titleTexture=null;
    for(const side of [-1,1]){
      box(staticRoot,2.65,4.85,.3,side*10.1,3.16,-9.5,P.black);
      const sm=textPanel('群友特别场','11.04 11:00 · 先看节目',2.42,3.9,'#191e28','#e7c68a');
      sideScreens.push(sm);panel(staticRoot,2.42,3.9,side*10.1,3.27,-9.32,sm);
      box(staticRoot,2.64,.035,.025,side*10.1,.8,-9.33,P.amber,false);
      box(staticRoot,2.64,.035,.025,side*10.1,5.58,-9.33,P.amber,false);
    }
    function setStageTitle(title,subtitle='群友特别场'){
      const tx=makeTexture(512,768,(c,W,H)=>{c.fillStyle='#161c28';c.fillRect(0,0,W,H);c.fillStyle='#f1c66c';c.fillRect(44,68,56,5);c.textAlign='center';c.fillStyle='#8894a6';c.font='20px Arial';c.fillText('ON STAGE',W/2,145);c.fillStyle='#efede6';const text=String(title||'群友特别场');const lines=text.length>7?[text.slice(0,7),text.slice(7,14)]:[text];c.font='700 48px "Microsoft YaHei",sans-serif';lines.forEach((s,i)=>c.fillText(s,W/2,320+i*73));c.fillStyle='#c4a66c';c.font='23px "Microsoft YaHei",sans-serif';c.fillText(String(subtitle).slice(0,18),W/2,568);c.fillStyle='#596775';c.font='19px Arial';c.fillText('INMO COMMUNITY',W/2,693);});
      if(titleTexture){titleTexture.dispose();const index=textures.indexOf(titleTexture);if(index>=0)textures.splice(index,1);}titleTexture=tx;for(const m of sideScreens){m.map=tx;m.needsUpdate=true;}
    }
    // A real acrylic product poster gives the side display a photographic detail.
    const closeMat=textPanel('MAGIC AI','inmo · Designed for possibility',1.1,1.6,'#ece8dd','#20232a');
    panel(staticRoot,1.1,1.6,-11,2.1,-2.25,closeMat);
    ready.push(loadPhoto('./assets/booth-reference-close.jpg',closeMat,'close',[338/1440,497/1084,440/1440,178/1084]));
    // Truss, hanging fixtures and soft volumetric cones, all kept above the viewer.
    function bar(a,b,r,m,parent=staticRoot){const d=new T.Vector3().subVectors(b,a),o=cyl(parent,r,d.length(),0,0,0,m);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;}
    for(const z of [-10.8,-5.9]){
      for(const y of [7.4,7.8])bar(new T.Vector3(-12,y,z),new T.Vector3(12,y,z),.045,P.silver);
      for(let x=-12;x<12;x+=.8){bar(new T.Vector3(x,7.4,z),new T.Vector3(x+.8,7.8,z),.027,P.silver);bar(new T.Vector3(x,7.8,z),new T.Vector3(x+.8,7.4,z),.027,P.silver);}
    }
    for(const x of [-11.7,11.7]){
      for(const z of [-10.8,-5.9])for(const dx of [-.15,.15])bar(new T.Vector3(x+dx,.8,z),new T.Vector3(x+dx,7.8,z),.045,P.silver);
      for(let y=1;y<7.4;y+=.6)for(const z of [-10.8,-5.9])bar(new T.Vector3(x-.15,y,z),new T.Vector3(x+.15,y+.6,z),.025,P.silver);
    }
    const hemi=new T.HemisphereLight(0xc4d3e9,0x34303a,.53);scene.add(hemi);
    const ambient=new T.AmbientLight(0xf0ded0,.16);scene.add(ambient);
    const main=new T.DirectionalLight(0xffedd8,1.3);main.position.set(-2,8,4);main.castShadow=true;main.shadow.mapSize.set(2048,2048);main.shadow.camera.left=-13;main.shadow.camera.right=13;main.shadow.camera.top=10;main.shadow.camera.bottom=-12;main.shadow.camera.near=.5;main.shadow.camera.far=35;main.shadow.bias=-.0006;main.shadow.normalBias=.025;scene.add(main);main.target.position.set(0,.75,-7);scene.add(main.target);
    stageLights.push(main);
    const fills=[[-7,6.9,-7.3,0xffcf8b,1.8],[7,6.9,-7.3,0xc6e5ff,1.45],[0,7.2,-11.5,0xffc66d,1.2]];
    for(const [x,y,z,c,intensity] of fills){
      const light=new T.SpotLight(c,intensity,28,.46,.65,1.2);light.position.set(x,y,z);light.target.position.set(x*.25,1.2,-8.15);scene.add(light,light.target);stageLights.push(light);
      const fixture=new T.Group();fixture.position.copy(light.position);fixture.lookAt(light.target.position);staticRoot.add(fixture);const housing=cyl(fixture,.22,.56,0,0,0,P.black);housing.rotation.x=Math.PI/2;const face=cyl(fixture,.18,.02,0,0,.29,P.light,false);face.rotation.x=Math.PI/2;lampFaces.push(face);
      const bm=new T.MeshBasicMaterial({color:color(c),transparent:true,opacity:.027,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,toneMapped:false});mats.push(bm);
      const beam=mesh(movingRoot,geometries.cone,bm,0,0,0,1,1,1,false);beam.renderOrder=1;beams.push({beam,from:light.position.clone(),to:light.target.position.clone(),phase:x,intensity});
      const disc=new T.Mesh(new T.CircleGeometry(2.2,48),new T.MeshBasicMaterial({color:color(c),transparent:true,opacity:.035,depthWrite:false,toneMapped:false}));disc.rotation.x=-Math.PI/2;disc.position.set(x*.25,.812,-8.15);movingRoot.add(disc);lampFaces.push(disc);
    }
    // Rim lighting on the seated guests, plus low, believable aisle illumination.
    for(const x of [-8,8]){const fill=new T.PointLight(0xdab879,.65,15,1.5);fill.position.set(x,4,6);scene.add(fill);stageLights.push(fill);}
    const baseIntensities=stageLights.map(l=>l.intensity);let blackout=0;
    function setBlackout(value){blackout=Math.max(0,Math.min(1,Number(value)||0));for(let i=0;i<stageLights.length;i++)stageLights[i].intensity=baseIntensities[i]*(1-blackout);hemi.intensity=.53*(1-blackout)+.025*blackout;ambient.intensity=.16*(1-blackout);for(const x of lampFaces)x.visible=blackout<.98;for(const {beam} of beams)beam.visible=blackout<.98;for(const m of screens)m.color.setScalar(1-blackout);for(const {material,base} of glows)material.color.copy(base).multiplyScalar(1-.98*blackout);}
    function batchLocal(parent){
      const groups=new Map();for(const child of parent.children){if(!child.isMesh||child.material.transparent||child.userData.keepDynamic)continue;const list=groups.get(child.material)||[];list.push(child);groups.set(child.material,list);}
      for(const [material,objects] of groups){if(objects.length<2)continue;let count=0;const parts=[];for(const o of objects){o.updateMatrix();const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geo.applyMatrix4(o.matrix);parts.push(geo);count+=geo.getAttribute('position').count;parent.remove(o);}const geo=new T.BufferGeometry();for(const [name,size] of [['position',3],['normal',3],['uv',2]]){const data=new Float32Array(count*size);let n=0;for(const part of parts){const attr=part.getAttribute(name);if(attr)data.set(attr.array,n);n+=part.getAttribute('position').count*size;}geo.setAttribute(name,new T.BufferAttribute(data,size));}geo.computeBoundingSphere();const merged=new T.Mesh(geo,material);merged.castShadow=objects.some(o=>o.castShadow);merged.receiveShadow=true;parent.add(merged);for(const p of parts)p.dispose();}
    }
    // Performer rigs have stable limb pivots for replacement by animated GLB skins.
    const wardrobes={
      xiaoying:{skin:0xe3b79a,coat:0x20232e,trousers:0x20232e,hair:0x241d25,accent:0xd4ad60,female:true},
      yunfei:{skin:0xd1a080,coat:0x476b80,trousers:0x222b35,hair:0x2c2531,accent:0xf0bd58,glasses:true},
      hamster:{skin:0xe3b38f,coat:0xd09b60,trousers:0xc3c5bf,hair:0x49362d,accent:0xede1c8,glasses:true},
      weijue:{skin:0xc99b78,coat:0x263f51,trousers:0x1d2b38,hair:0x2b2327,accent:0xc8a061,mandarin:true}
    };
    function createActor(id,options={}){
      const o={...wardrobes[id],...options},g=new T.Group();g.name=id||'guest';
      const skin=mat(o.skin||0xc99e7d,.88),cloth=mat(o.coat||0x304356,.86),pants=mat(o.trousers||0x2b303b,.9),hair=mat(o.hair||0x30282c,.92),accent=mat(o.accent||0xbea16b,.48,.15),shoe=P.black;
      const body=new T.Group();body.name='fallback-body';g.add(body);
      sphere(body,.29,.38,.18,0,1.28,0,cloth);box(body,.29,.09,.32,0,.99,0,cloth);
      const neck=cyl(body,.074,.14,0,1.62,0,skin);neck.name='neck';
      const head=new T.Group();head.position.set(0,1.83,0);body.add(head);
      sphere(head,.195,.244,.175,0,0,0,skin);
      // Small ears, a tapered nose and eyebrows read as an adult at first-person scale.
      for(const s of [-1,1])sphere(head,.04,.062,.041,s*.194,-.012,0,skin);
      sphere(head,.029,.042,.044,0,-.016,.167,skin);
      const faceDark=glow(0x28232b),brows=[];
      for(const s of [-1,1]){
        sphere(head,.031,.023,.012,s*.074,.037,.166,faceDark,false);
        sphere(head,.009,.009,.004,s*.071,.045,.179,P.light,false);
        const eyebrow=box(head,.07,.014,.01,s*.074,.09,.166,hair,false);eyebrow.userData.keepDynamic=true;brows.push(eyebrow);
      }
      const mouth=sphere(head,.045,.009,.008,0,-.096,.160,faceDark,false);mouth.userData.keepDynamic=true;
      const cap=mesh(head,new T.SphereGeometry(1,16,10,0,Math.PI*2,0,1.62),hair,0,.047,-.014,.202,.218,.181);
      if(o.female){
        sphere(head,.208,.236,.118,0,-.03,-.11,hair);for(const s of [-1,1])sphere(head,.071,.25,.09,s*.166,-.09,-.05,hair);
        sphere(head,.105,.105,.1,.12,.18,-.14,hair);
        const earring=P.gold;for(const s of [-1,1])sphere(head,.014,.04,.013,s*.2,-.075,.015,earring);
        // Long skirt hangs separately so the stable walking rig remains usable.
        const skirt=mesh(body,new T.CylinderGeometry(.23,.34,.67,16),cloth,0,.84,0);skirt.name='skirt';
        box(body,.49,.035,.36,0,1.06,0,accent,false);
        for(const s of [-1,1]){const lapel=box(body,.052,.31,.025,s*.108,1.37,.171,accent);lapel.rotation.z=s*.31;}
      }else{
        if(o.mandarin){cyl(body,.095,.075,0,1.55,0,cloth);for(let y=1.08;y<1.5;y+=.105)sphere(body,.012,.012,.01,.035,y,.185,accent,false);}
        else{const shirt=box(body,.135,.39,.02,0,1.36,.181,P.white,false);const tie=box(body,.035,.29,.025,0,1.37,.198,accent,false);tie.rotation.z=.03;for(const s of [-1,1]){const lapel=box(body,.075,.32,.028,s*.12,1.36,.19,cloth);lapel.rotation.z=s*.26;}}
      }
      if(o.glasses){
        for(const s of [-1,1]){const ring=new T.Mesh(new T.TorusGeometry(.074,.012,6,16),P.black);ring.position.set(s*.085,.039,.177);ring.scale.y=.74;head.add(ring);bar(new T.Vector3(s*.16,.04,.17),new T.Vector3(s*.2,.05,-.05),.009,P.black,head);}
        box(head,.035,.013,.02,0,.04,.18,P.black,false);
      }
      const limbs={};
      for(const [suffix,s] of [['L',-1],['R',1]]){
        const arm=new T.Group();arm.position.set(s*.30,1.48,0);body.add(arm);limbs['arm'+suffix]=arm;
        cyl(arm,.085,.31,0,-.145,0,cloth);sphere(arm,.09,.09,.09,0,-.01,0,cloth);
        const forearm=new T.Group();forearm.position.y=-.30;arm.add(forearm);limbs['forearm'+suffix]=forearm;
        cyl(forearm,.067,.28,0,-.14,0,cloth);sphere(forearm,.069,.088,.06,0,-.325,0,skin);
        const leg=new T.Group();leg.position.set(s*.145,.94,0);body.add(leg);limbs['leg'+suffix]=leg;cyl(leg,.10,.41,0,-.205,0,pants);
        const shin=new T.Group();shin.position.y=-.41;leg.add(shin);limbs['shin'+suffix]=shin;cyl(shin,.082,.39,0,-.195,0,pants);sphere(shin,.085,.07,.14,0,-.445,.053,shoe);
      }
      // Only mesh visuals are hidden when an optional GLB avatar replaces this fallback.
      // Keep pivot groups and independent props visible for authored performance cues.
      for(const part of [body,head,...Object.values(limbs)])batchLocal(part);
      const fallbackMeshes=[];body.traverse(o=>{if(o.isMesh)fallbackMeshes.push(o);});
      const tearDrops=new T.Group();head.add(tearDrops);tearDrops.visible=false;
      const tearMat=new T.MeshBasicMaterial({color:0x82c9e8,transparent:true,opacity:.83,toneMapped:false});mats.push(tearMat);
      for(const s of [-1,1])sphere(tearDrops,.014,.045,.010,s*.082,-.037,.17,tearMat,false);
      const sweatDrop=sphere(head,.026,.067,.019,.173,.095,.139,tearMat,false);sweatDrop.rotation.z=-.45;sweatDrop.visible=false;
      const microphone=new T.Group();limbs.forearmR.add(microphone);microphone.position.set(0,-.31,.03);microphone.rotation.x=-.25;cyl(microphone,.025,.20,0,-.015,0,P.black);sphere(microphone,.041,.051,.041,0,.12,0,P.silver);microphone.visible=false;
      const rope=new T.Group();g.add(rope);rope.name='jump-rope';rope.position.y=.96;rope.visible=false;
      const ropeCurve=new T.CatmullRomCurve3([new T.Vector3(-.45,.2,.02),new T.Vector3(-.72,-.6,0),new T.Vector3(0,-.91,0),new T.Vector3(.72,-.6,0),new T.Vector3(.45,.2,.02)]);
      const ropeLine=new T.Mesh(new T.TubeGeometry(ropeCurve,40,.014,5,false),accent);rope.add(ropeLine);for(const s of [-1,1])cyl(rope,.023,.15,s*.45,.18,0,P.black);
      movingRoot.add(g);return {id,group:g,body,fallbackMeshes,head,mouth,brows,tearDrops,sweatDrop,microphone,rope,...limbs,home:{x:0,y:stageY,z:-8.3},baseY:stageY,height:2.1};
    }
    for(const id of Object.keys(wardrobes)){const a=createActor(id);a.group.position.set(-10,stageY,-10);a.group.visible=false;actors[id]=a;}
    const guestTitles=['科技大佬','数码大V','电影导演','音乐天王','科技教授','脱口秀达人','投资人','游戏制作人','影像大师','潮流主编','航天迷','测评博主'];
    const coatColors=[0x263c4d,0x77594e,0x365147,0x4f3e56,0x69614e,0x2c303b,0x737c82,0x634a4b];
    // Forty-eight fictional VIPs. Front-facing namecards identify roles, never real endorsements.
    const audienceAnchors=[],furnitureAnchors={chairs:[],plants:[{x:-9.2,y:0,z:1.4},{x:9.2,y:0,z:1.4},{x:-9.4,y:0,z:16.8},{x:9.4,y:0,z:16.8}],tables:[{x:-10.5,y:0,z:9.8},{x:10.5,y:0,z:9.8}]};
    for(let row=0;row<6;row++)for(const side of [-1,1])for(let col=0;col<4;col++){
      const i=audience.length,x=side*(2.2+col*1.45),z=.8+row*2.65;
      const chair=new T.Group();chair.position.set(x,0,z);chair.rotation.y=Math.PI;chairRoot.add(chair);furnitureAnchors.chairs.push({x,y:0,z,rotationY:Math.PI,seatHeight:.71,width:1.06});
      box(chair,1.06,.14,.92,0,.71,0,P.chair);box(chair,1.08,.97,.15,0,1.13,-.44,P.chairBack);
      sphere(chair,.53,.11,.08,0,1.61,-.435,P.chairBack);
      for(const s of [-1,1]){box(chair,.095,.67,.095,s*.43,.335,-.22,P.black);box(chair,.08,.04,.78,s*.58,.97,-.03,P.gold);box(chair,.065,.33,.065,s*.58,.81,-.25,P.black);}
      const g=createActor('guest-'+i,{skin:[0xe3b18b,0xc79271,0xb78260,0xd9ba9f][i%4],coat:coatColors[i%coatColors.length],hair:i%7===0?0x9b9186:i%3?0x302a2b:0x6b5140,trousers:i%5?0x262f3a:0x56555a,glasses:i%3===0,female:i%6===2});
      // Chair shadows ground the crowd; avoid re-rendering every fallback face into the shadow map.
      for(const visual of g.fallbackMeshes)visual.castShadow=false;
      g.group.position.set(x,0,z);g.group.rotation.y=Math.PI;g.group.scale.setScalar(.92+((i*7)%5)*.022);
      g.legL.rotation.x=-Math.PI/2;g.legR.rotation.x=-Math.PI/2;g.shinL.rotation.x=Math.PI/2;g.shinR.rotation.x=Math.PI/2;
      g.armL.rotation.x=-.72;g.armR.rotation.x=-.72;g.forearmL.rotation.x=-.8;g.forearmR.rotation.x=-.8;
      g.phase=i*1.397;g.seatedY=0;g.title=guestTitles[i%guestTitles.length];audience.push(g);
      const card=panel(staticRoot,.7,.18,x,.96,z+.53,textPanel(g.title,'',.7,.18,'#171c26','#d2bf9d'));card.rotation.y=Math.PI;
      audienceAnchors.push({id:'guest-'+i,name:g.title,x,y:2.05,z,group:g.group});
    }
    // Baking static meshes by material avoids hundreds of chair/truss draw calls.
    function batchStatic(batchRoot=staticRoot){
      batchRoot.updateMatrixWorld(true);const batches=new Map();
      batchRoot.traverse(o=>{if(!o.isMesh||o.material.transparent)return;const a=batches.get(o.material)||[];a.push(o);batches.set(o.material,a);});
      for(const [material,objects] of batches){if(objects.length<3)continue;const parts=[],positions=[],normals=[],uvs=[];let count=0;
        for(const o of objects){let geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geo.applyMatrix4(o.matrixWorld);const p=geo.getAttribute('position'),n=geo.getAttribute('normal'),uv=geo.getAttribute('uv');positions.push(p.array);normals.push(n?n.array:new Float32Array(p.count*3));uvs.push(uv?uv.array:new Float32Array(p.count*2));count+=p.count;parts.push(geo);o.parent.remove(o);}
        const join=(arr,n)=>{const out=new Float32Array(count*n);let offset=0;for(const a of arr){out.set(a,offset);offset+=a.length;}return out;};const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(join(positions,3),3));geo.setAttribute('normal',new T.BufferAttribute(join(normals,3),3));geo.setAttribute('uv',new T.BufferAttribute(join(uvs,2),2));geo.computeBoundingSphere();const merged=new T.Mesh(geo,material);merged.castShadow=objects.some(o=>o.castShadow);merged.receiveShadow=true;batchRoot.add(merged);for(const p of parts)p.dispose();
      }
    }
    batchStatic();batchStatic(chairRoot);
    let lastCue='',lastTime=0;
    function update(dt,frame={}){
      const time=Number(frame.time)||0,reaction=frame.reaction||'',cue=frame.cue||{};lastTime=time;
      if(frame.blackout!==undefined)setBlackout(frame.blackout);
      const title=cue.stageTitle||cue.title||cue.section;
      if(title&&title!==lastCue){lastCue=title;setStageTitle(title,cue.subtitle||'INMO COMMUNITY · 群友特别场');}
      for(const {beam,from,to,phase} of beams){const target=to.clone();target.x+=Math.sin(time*.22+phase)*.65;const delta=target.sub(from),length=delta.length();beam.position.copy(from).addScaledVector(delta,.5);beam.quaternion.setFromUnitVectors(new T.Vector3(0,-1,0),delta.normalize());beam.scale.set(length*.21,length,length*.21);beam.material.opacity=.025*(1-blackout);}
      for(const a of audience){
        const p=a.phase,wiggle=Math.sin(time*1.5+p),laugh=/laugh|笑|cheer|欢呼/.test(reaction),boo=/boo|嘘|起哄/.test(reaction),clap=/clap|applause|掌|cheer|欢呼/.test(reaction);
        a.group.position.y=laugh?Math.abs(Math.sin(time*7+p))*.055:0;a.head.rotation.x=laugh?-.10+Math.sin(time*9+p)*.08:Math.sin(time*.7+p)*.025;a.head.rotation.y=Math.sin(time*.39+p)*.08;
        a.armL.rotation.set(clap?-1.04:boo?-1.9-.18*wiggle:-.72,0,clap?-.38+Math.sin(time*13+p)*.13:boo?-.28:0);
        a.armR.rotation.set(clap?-1.04:boo?-1.9+.18*wiggle:-.72,0,clap?.38-Math.sin(time*13+p)*.13:boo?.28:0);
        a.forearmL.rotation.x=clap?-1.15:boo?-.15:-.8;a.forearmR.rotation.x=clap?-1.15:boo?-.15:-.8;
        a.forearmL.rotation.z=clap?-.4:.05;a.forearmR.rotation.z=clap?.4:-.05;
        a.mouth.scale.y=laugh?1.8:1;
      }
    }
    function getActorAnchor(id){const actor=actors[id]||audience.find(a=>a.id===id);if(!actor)return null;actor.group.updateMatrixWorld(true);return actor.group.localToWorld(new T.Vector3(0,2.25,0));}
    return {actors,audience,audienceAnchors,stageLights,staticRoot,movingRoot,chairRoot,furnitureAnchors,assetStatus,ready:Promise.allSettled(ready),setBlackout,setStageTitle,update,getActorAnchor,createActor,bounds:{minX:-12.7,maxX:12.7,minZ:-3.2,maxZ:19},stageY,
      dispose(){const gs=new Set(),ms=new Set();for(const group of [staticRoot,movingRoot,chairRoot])group.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)ms.add(o.material);});for(const g of gs)g.dispose();for(const m of [...ms,...mats])m.dispose();for(const tx of textures)tx.dispose();scene.remove(staticRoot,movingRoot,chairRoot,hemi,ambient);for(const l of stageLights){scene.remove(l);if(l.target)scene.remove(l.target);}}
    };
  }
  global.TheaterScene={build};
})(typeof window!=='undefined'?window:globalThis);
