(function (root) {
  'use strict';

  function build({THREE:T,scene,assets,makeTextTexture,addCollider,camera,sound}) {
    const group=new T.Group();group.name='inmo-launch-venue';scene.add(group);
    const people=[],dancers=[],floaters=[],bubbles=[];
    let elapsed=0,nextBubble=2.5,bubbleIndex=0,lastCheer=-1;
    let nextEmcee=1,nextLyric=15,nextStream=17,emceeLine=0,lyricLine=0,streamLine=0,storyCycle=-1,storyCue=-1;
    const stations={drink:{x:-4.7,z:3.3,name:'饮料台'},waiter:{x:-4.6,z:1.2,name:'服务员'},show:{x:10.4,z:5.0,name:'现场调音台'}};
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const geometry={box:new T.BoxGeometry(1,1,1),sphere:new T.SphereGeometry(.5,12,8),cylinder:new T.CylinderGeometry(.5,.5,1,12)};
    const M=(color,roughness=.62,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
    const palette={ink:M(0x17202b),stone:M(0x32353c,.76),wall:M(0x302d31,.83),copper:M(0x8d6741,.32,.68),
      brass:M(0xc5a46c,.28,.75),black:M(0x151a21,.65),chrome:M(0x66818c,.28,.82),white:M(0xd2c8ae,.6),
      skin:[M(0xd6a27f),M(0xb88261),M(0xe2b795),M(0x9a6c52)],hair:[M(0x25202a),M(0x49372c),M(0x6b5141)],
      clothes:[M(0x253e51),M(0x735c4b),M(0x4d5b59),M(0x5c3f4b),M(0x324355),M(0x8c795d),M(0x2f383e),M(0x676571)],
      goldGlow:new T.MeshBasicMaterial({color:0xf3bc66,toneMapped:false}),redGlow:new T.MeshBasicMaterial({color:0xcc5635,toneMapped:false}),
      screen:new T.MeshBasicMaterial({color:0xa5d7d7,toneMapped:false}),eyes:new T.MeshBasicMaterial({color:0x1c2027})};
    function block(parent,w,h,d,x,y,z,material,cast=true){const m=new T.Mesh(geometry.box,material);m.scale.set(w,h,d);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;parent.add(m);return m;}
    function cylinder(parent,r,h,x,y,z,material){const m=new T.Mesh(geometry.cylinder,material);m.scale.set(r*2,h,r*2);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
    function sphere(parent,w,h,d,x,y,z,material){const m=new T.Mesh(geometry.sphere,material);m.scale.set(w,h,d);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
    function tex(width,height,drawFn,bg=null){return makeTextTexture({width,height,bg,drawFn});}
    function panel(parent,map,w,h,x,y,z){const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map,side:T.DoubleSide,toneMapped:false}));m.position.set(x,y,z);parent.add(m);return m;}
    function label(parent,text,w,x,y,z,color='#e9d2aa',bg='#252b32'){
      return panel(parent,tex(512,128,(c,W,H)=>{c.fillStyle=bg;c.fillRect(0,0,W,H);c.fillStyle=color;c.font='700 42px "Microsoft YaHei",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,W/2,H/2);}),w,w/4,x,y,z);
    }
    function floor(parent,w,d,x,z,mat,y=.012){const p=new T.Mesh(new T.PlaneGeometry(w,d),mat);p.rotation.x=-Math.PI/2;p.position.set(x,y,z);p.receiveShadow=true;parent.add(p);return p;}
    function poster(outdoor=false){
      return tex(1280,640,(c,W,H)=>{
        const gradient=c.createLinearGradient(0,H,W,0);gradient.addColorStop(0,'#8d4928');gradient.addColorStop(.35,'#d78d3f');gradient.addColorStop(.68,'#e8b85c');gradient.addColorStop(1,'#b78046');c.fillStyle=gradient;c.fillRect(0,0,W,H);
        const glow=c.createRadialGradient(W*.57,H*.46,15,W*.57,H*.46,W*.5);glow.addColorStop(0,'rgba(255,222,141,.42)');glow.addColorStop(1,'rgba(255,212,122,0)');c.fillStyle=glow;c.fillRect(0,0,W,H);
        c.strokeStyle='rgba(91,53,35,.2)';c.lineWidth=1;for(let x=40;x<W;x+=80){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke();}
        c.fillStyle='#fff5d9';c.textAlign='center';c.font='700 50px Arial,"Microsoft YaHei",sans-serif';c.fillText('INMO 影目',W/2,86);
        c.font='700 94px "Microsoft YaHei",sans-serif';c.fillText('智能眼镜',W/2,237);
        c.font='800 122px "Microsoft YaHei",sans-serif';c.fillText('进入空间时代',W/2,382);
        c.fillStyle='#bd4b26';c.fillRect(185,284,9,115);c.fillRect(185,284,35,9);c.fillRect(1088,324,9,115);c.fillRect(1062,430,35,9);
        c.fillStyle='#fff1ce';c.font='500 40px "Microsoft YaHei",sans-serif';c.fillText('11.04 · 影目新品发布会',W/2,490);
        c.fillStyle='rgba(65,40,30,.72)';c.font='500 22px Arial,"Microsoft YaHei",sans-serif';c.fillText(outdoor?'LIVE STAGE  /  发布暖场':'A NEW DIMENSION  /  新品样机体验',W/2,571);
      });
    }
    function truss(parent,x,z,height=4.8){
      for(const dx of [-.17,.17])for(const dz of [-.17,.17])cylinder(parent,.035,height,x+dx,height/2,z+dz,palette.chrome);
      for(let y=.35;y<height;y+=.55){block(parent,.42,.035,.035,x,y,z-.17,palette.chrome);block(parent,.035,.035,.42,x-.17,y,z,palette.chrome);}
      addCollider(x,z,.45,.45);
    }
    function spotlight(parent,x,y,z,tx,tz,color=0xffcb82,intensity=.75){
      const lamp=new T.SpotLight(color,intensity,24,.58,.65,1);lamp.position.set(x,y,z);lamp.target.position.set(tx,.2,tz);parent.add(lamp,lamp.target);
      cylinder(parent,.18,.35,x,y,z,palette.ink);return lamp;
    }
    // A warm, dark cutaway shell keeps the opening aisle and product clearly visible.
    const sidewalkMap=tex(512,512,(c,W,H)=>{c.fillStyle='#303a44';c.fillRect(0,0,W,H);c.strokeStyle='#3c4851';c.lineWidth=2;for(let i=0;i<=4;i++){c.beginPath();c.moveTo(i*128,0);c.lineTo(i*128,H);c.stroke();c.beginPath();c.moveTo(0,i*128);c.lineTo(W,i*128);c.stroke();}});
    sidewalkMap.wrapS=sidewalkMap.wrapT=T.RepeatWrapping;sidewalkMap.repeat.set(10,7);
    floor(group,47,36,-1,3,new T.MeshStandardMaterial({map:sidewalkMap,roughness:.88}),-.025);
    floor(group,51,13,0,19,M(0x252c33,.91),-.006);
    for(const z of [12.5,12.8])floor(group,46,.08,0,z,palette.copper,.008);
    for(let i=0;i<5;i++)floor(group,1.15,3.7,-11+i*1.7,16.1,M(0xa6a99b,.86),.002);
    floor(group,28,16,0,-2,palette.stone,.008);
    const floorMap=tex(512,512,(c,W,H)=>{c.fillStyle='#363238';c.fillRect(0,0,W,H);c.strokeStyle='#51443e';c.lineWidth=2;for(let i=0;i<=4;i++){c.beginPath();c.moveTo(i*128,0);c.lineTo(i*128,H);c.stroke();c.beginPath();c.moveTo(0,i*128);c.lineTo(W,i*128);c.stroke();}});
    floorMap.wrapS=floorMap.wrapT=T.RepeatWrapping;floorMap.repeat.set(7,4);
    floor(group,27.6,15.6,0,-2,new T.MeshStandardMaterial({map:floorMap,roughness:.54,metalness:.17}),.013);
    floor(group,5.6,11,0,.2,M(0x502c36,.94),.022);
    for(const x of [-3.65,3.65])floor(group,.055,10.6,x,.4,palette.brass,.028);
    block(group,28,4.7,.32,0,2.25,-9.85,palette.wall);
    for(const side of [-1,1]){
      block(group,.32,.65,16,side*14,.28,-2,palette.wall);block(group,.34,.08,16,side*14,.62,-2,palette.copper);
      block(group,side<0?11:13,.45,.30,side<0?-8.5:7.45,.18,6,palette.wall);
      block(group,.07,.05,15.3,side*13.65,.07,-2,palette.goldGlow,false);
      truss(group,side*11.9,-8.9,4.75);truss(group,side*12,4.8,3.8);
    }
    block(group,3.9,.16,.28,-1,3.15,6,palette.copper);
    for(const x of [-3,1]){block(group,.18,3.2,.22,x,1.55,6,palette.copper);addCollider(x,6,.23,.3);}
    label(group,'INMO 影目 · 11.04',3.3,-1,3.18,6.18,'#f4d7a1','#2c282a');
    floor(group,3.5,2.0,-1,7.4,M(0x563b31,.88),.015);
    const welcome=label(group,'新品发布会  /  入场',3.1,-1,.035,7.65);welcome.rotation.x=-Math.PI/2;
    // Main launch stage: all substantial scenery sits behind the hero pedestal.
    block(group,20,.15,4.25,0,.055,-7.55,palette.ink);
    block(group,20.1,.035,.09,0,.15,-5.45,palette.goldGlow,false);
    panel(group,poster(),17.7,4.42,0,2.65,-9.61);
    for(const side of [-1,1]){
      block(group,.22,4.7,.18,side*9.1,2.31,-9.45,palette.copper);
      for(let i=0;i<3;i++){
        const cube=new T.Group();cube.position.set(side*(8.7+i*.65),2.9+i*.57,-8.5-i*.13);group.add(cube);
        block(cube,1.45-i*.15,1.3-i*.12,1.25,0,0,0,i%2?palette.copper:palette.brass);
        for(let seam=-.4;seam<=.4;seam+=.4)block(cube,.012,1.32-i*.12,1.27,seam,0,0,palette.ink);
        cube.rotation.set(.12,side*.30,-side*.1);floaters.push({mesh:cube,baseY:cube.position.y,phase:i+side});
      }
      spotlight(group,side*8.2,5.6,-5.1,0,-5.8,0xffd49a,.85);
      spotlight(group,side*11,4.6,1,side*8,-3,0xffb367,.55);
    }
    const launchFill=new T.PointLight(0xf2bc78,.34,17,1);launchFill.position.set(0,4,-6);group.add(launchFill);
    // Experience bars give attendees something tangible to inspect besides the hero target.
    for(const side of [-1,1]){
      const x=side*9;
      block(group,4.6,.92,1.35,x,.46,-7.3,palette.ink);block(group,4.7,.07,1.42,x,.96,-7.3,palette.copper);
      block(group,4.5,.04,.03,x,.73,-6.6,palette.goldGlow,false);addCollider(x,-7.3,4.7,1.4);
      label(group,'AR 体验区',3.1,x,.58,-6.59,'#eacb93','#222832');
      for(const offset of [-1.15,1.15]){
        block(group,1.25,.08,.8,x+offset,1.04,-7.24,palette.black);
        const glasses=assets.createGlasses(T,side<0?'air3':'go3');glasses.scale.setScalar(.64);glasses.position.set(x+offset,1.12,-7.15);group.add(glasses);
      }
    }
    function stationTable(key,color,text){
      const p=stations[key];block(group,1.35,.9,.70,p.x,.45,p.z,palette.ink);block(group,1.42,.06,.78,p.x,.93,p.z,palette.copper);
      addCollider(p.x,p.z,1.4,.8);label(group,text,1.8,p.x,1.35,p.z-.2,color,'#292830');
    }
    stationTable('drink','#d9b87b','发布会饮料');
    for(const x of [-.36,0,.36]){cylinder(group,.10,.25,stations.drink.x+x,1.10,stations.drink.z,palette.white);cylinder(group,.09,.018,stations.drink.x+x,1.235,stations.drink.z,M(0xc19651));}
    stationTable('show','#efc47e','现场调音');block(group,.72,.035,.40,stations.show.x,1.01,stations.show.z,palette.screen);
    // Outdoor warm-up stage sits to the right, leaving the entrance and street clear.
    const stage=new T.Group();stage.position.set(8.5,0,9.1);group.add(stage);
    block(stage,7,.42,3.2,0,.21,0,palette.ink);block(stage,7.05,.045,.08,0,.43,1.59,palette.goldGlow,false);addCollider(8.5,9.1,7.15,3.35);
    panel(stage,poster(true),6.7,2.35,0,2.15,-1.62);
    for(const x of [-3.35,3.35]){block(stage,.15,3.5,.15,x,1.75,-1.5,palette.chrome);block(stage,.5,1.05,.55,x,.77,1.1,palette.black);}
    block(stage,6.8,.13,.13,0,3.5,-1.5,palette.chrome);
    for(const x of [-2.6,0,2.6]){cylinder(stage,.14,.25,x,3.3,-1.4,palette.black);spotlight(stage,x,3.25,-1.3,x,1.0,0xffbb70,.45);}
    floor(group,6.7,2.4,8.5,11.1,M(0x49352f,.91),.012);
    label(stage,'LIVE  /  空间序曲',4.8,0,.25,1.615,'#d9bb88','#20262e');
    // Check-in and media wall form the outdoor left side of the event.
    block(group,5.7,.95,1.05,-9.7,.47,8.9,palette.ink);block(group,5.8,.06,1.13,-9.7,.98,8.9,palette.copper);addCollider(-9.7,8.9,5.8,1.15);
    label(group,'INMO  /  来宾签到',4.4,-9.7,.53,9.44);
    panel(group,poster(true),5.4,2.7,-10.2,2.0,7.9);
    block(group,.8,.035,.42,-8.3,1.03,8.9,palette.screen);
    for(const x of [-13.3,-5.6,13.5]){
      cylinder(group,.035,1.15,x,.57,11.45,palette.chrome);sphere(group,.13,.13,.13,x,1.17,11.45,palette.brass);
      const shadow=assets.contactShadow(T,.6,.6,.35);shadow.position.set(x,.03,11.45);group.add(shadow);
    }
    // Shared geometry and materials keep the larger crowd affordable to render.
    function person({x,z,role='guest',index=0,seated=false,look='product',adultDancer=false,name}){
      const g=new T.Group(),body=new T.Group();g.add(body);group.add(g);
      const isOfficer=role==='security'||role==='stage-security';
      const uniform=isOfficer?M(0x26323e):role==='waiter'?M(0x493c37):palette.clothes[index%palette.clothes.length];
      const skin=palette.skin[index%palette.skin.length],hair=palette.hair[index%palette.hair.length];
      const p={id:people.length,name:name||({security:'巡场安保',media:'摄影记者',waiter:'服务员'}[role]||'发布会来宾'),role,
        group:g,body,pos:{x,z},home:{x,z},seated,look,angle:Math.PI,lookAngle:Math.PI,phase:index*.93,mode:'WATCH',observing:false,
        range:role==='security'?6.2:role==='media'?4.3:3.5,halfFov:role==='security'?.30:.26,route:[],routeIndex:0,
        attentionPeriod:role==='security'?(people.length%2===0?17.3:23.7):19+(people.length%5-2)*.4};
      const hipY=adultDancer?1.03:.92;
      function leg(side){const hip=new T.Group();hip.position.set(side*.16,hipY,0);body.add(hip);
        cylinder(hip,.115,.38,0,-.19,0,adultDancer?skin:palette.ink);
        const knee=new T.Group();knee.position.y=-.38;hip.add(knee);cylinder(knee,.10,.38,0,-.19,0,adultDancer?skin:palette.ink);
        block(knee,.24,.13,.37,0,-.38,.07,palette.black);return {hip,knee};}
      p.legL=leg(-1);p.legR=leg(1);
      block(body,adultDancer?.59:.70,adultDancer?.68:.83,.40,0,adultDancer?1.42:1.32,0,uniform);
      if(adultDancer){
        const skirt=new T.Mesh(new T.CylinderGeometry(.30,.48,.72,12),uniform);skirt.position.y=1.02;skirt.castShadow=true;body.add(skirt);
        block(body,.61,.055,.43,0,1.22,0,palette.brass);
      }else if(isOfficer){
        block(body,.60,.56,.08,0,1.37,.235,palette.ink);block(body,.10,.13,.02,-.18,1.57,.285,palette.brass);
      }else if(role==='waiter')block(body,.48,.55,.045,0,1.15,.23,palette.white);
      else{block(body,.018,.18,.018,0,1.55,.22,palette.white);block(body,.18,.12,.02,0,1.44,.23,palette.white);}
      function arm(side){const shoulder=new T.Group();shoulder.position.set(side*(adultDancer?.37:.44),1.66,0);body.add(shoulder);
        cylinder(shoulder,.095,.32,0,-.16,0,uniform);const elbow=new T.Group();elbow.position.y=-.32;shoulder.add(elbow);
        cylinder(elbow,.08,.30,0,-.15,0,adultDancer?uniform:skin);sphere(elbow,.15,.17,.15,0,-.33,0,skin);return {shoulder,elbow};}
      p.armL=arm(-1);p.armR=arm(1);
      const head=new T.Group();head.position.set(0,adultDancer?2.02:1.99,0);body.add(head);p.head=head;
      sphere(head,adultDancer?.41:.46,.49,.43,0,0,0,skin);sphere(head,.46,.30,.46,0,.18,-.03,hair);
      if(adultDancer){sphere(head,.19,.20,.20,0,.29,-.14,hair);cylinder(head,.038,.30,.18,-.02,0,palette.brass);}
      if(isOfficer){block(head,.53,.12,.49,0,.25,0,palette.ink);block(head,.43,.035,.16,0,.18,.27,palette.black);}
      p.eyes=[];for(const dx of [-.105,.105])p.eyes.push(sphere(head,.045,.035,.025,dx,.025,.21,palette.eyes));
      const phone=block(p.armR.elbow,.15,.025,.27,0,-.30,.09,palette.black);block(phone,.82,.09,.82,0,.56,0,palette.screen,false);phone.visible=false;p.phone=phone;
      if(role==='media'){
        const cameraBody=block(body,.32,.22,.20,.28,1.34,.43,palette.black);const lens=cylinder(cameraBody,.22,.9,0,0,.8,palette.chrome);lens.rotation.x=Math.PI/2;
        p.cameraProp=cameraBody;
      }
      if(seated){
        const chair=new T.Group();chair.position.set(x,0,z);group.add(chair);
        block(chair,.87,.11,.78,0,.48,0,palette.ink);block(chair,.87,.66,.10,0,.86,-.35,palette.ink);
        for(const dx of [-.33,.33])for(const dz of [-.28,.28])cylinder(chair,.025,.48,dx,.24,dz,palette.copper);
        chair.rotation.y=Math.PI;addCollider(x,z,1.0,.95);
      }else if(!adultDancer&&!isOfficer&&role!=='waiter')addCollider(x,z,.52,.52);
      const shadow=assets.contactShadow(T,.95,.85,.35);shadow.position.set(x,.029,z);group.add(shadow);p.shadow=shadow;
      p.baseY=seated?-.39:0;g.position.set(x,p.baseY,z);people.push(p);return p;
    }
    let index=0;
    for(const z of [-.3,1.7,3.7])for(const x of [-10.1,-7.0,6.7,9.8])person({x,z,seated:true,index:index++,look:'product'});
    for(const side of [-1,1])for(const x of [7.0,9.0,11.0])person({x:side*x,z:-5.35,index:index++,look:'experience'});
    for(const p of [{x:-5.5,z:-1.8},{x:5.5,z:-1.9},{x:-4.7,z:-.3}])person({...p,index:index++,role:'media'});
    const waiter=person({x:stations.waiter.x,z:stations.waiter.z,index:index++,role:'waiter',look:'outside',name:'服务员小周'});
    for(const side of [-1,1]){
      const p=person({x:side*4.8,z:-4.4,index:index++,role:'security',name:side<0?'左侧巡场安保':'右侧巡场安保'});
      p.route=[{x:side*4.8,z:-4.4},{x:side*5.25,z:-2.75},{x:side*6.0,z:-3.25},{x:side*6.0,z:-4.6}];
    }
    for(const p of [{x:-12.4,z:10.8},{x:-10.8,z:11.2},{x:-8.6,z:11.3},{x:-6.7,z:10.8},{x:-4.9,z:11.5},
      {x:2.2,z:11.6},{x:4.2,z:11.8},{x:6.0,z:11.85},{x:7.8,z:11.8},{x:9.6,z:11.8},{x:11.7,z:11.7},{x:12.5,z:10.8}])
      person({...p,index:index++,look:p.x< -5?'checkin':'performance'});
    for(let i=0;i<4;i++){
      const p=person({x:6.0+i*1.6,z:9.35,index:3+i,adultDancer:true,role:'dancer',look:'performance',name:'成年暖场舞者'});
      p.phase=i*Math.PI/2;p.baseY=.43;p.group.scale.setScalar(1.04);dancers.push(p);
    }
    // These four names belong only to the performance cast, independently of the
    // service / reception actors used by the key puzzle.
    const mo=dancers[dancers.length-1];mo.name='小mo';
    const heckler=people.find(p=>p.role==='guest'&&p.home.x===12.5&&p.home.z===10.8);heckler.name='韦爵爷';
    const streamer=people.find(p=>p.role==='media'&&p.home.x>0);streamer.name='周云飞';streamer.cameraProp.visible=false;
    const selfieStick=new T.Group();selfieStick.position.set(0,-.31,.08);streamer.armR.elbow.add(selfieStick);
    cylinder(selfieStick,.018,.88,0,-.42,0,palette.chrome);
    block(selfieStick,.25,.39,.045,0,-.93,0,palette.black);
    block(selfieStick,.21,.33,.012,0,-.93,-.028,palette.screen,false);
    streamer.selfieStick=selfieStick;
    const emcee=person({x:3.9,z:-7.2,role:'emcee',adultDancer:true,index:4,look:'audience',name:'inmo小影'});
    emcee.baseY=-.05;emcee.group.scale.setScalar(1.04);
    const microphone=new T.Group();microphone.position.set(0,-.28,.08);emcee.armR.elbow.add(microphone);
    cylinder(microphone,.040,.26,0,-.09,0,palette.chrome);sphere(microphone,.15,.17,.15,0,-.28,0,palette.black);emcee.microphone=microphone;
    const stageMarshal=person({x:13.45,z:10.95,role:'stage-security',index:6,look:'performance',name:'舞台秩序保安'});
    const namedActors=[{actor:emcee,label:'inmo小影'},{actor:mo,label:'小mo'},{actor:heckler,label:'韦爵爷'},{actor:streamer,label:'周云飞'}];
    for(const entry of namedActors)entry.actor.hasNameplate=true;
    const emceeLines=[
      '欢迎来到影目新品发布会，掌声借我一点！',
      '智能眼镜，进入空间时代——一起期待正式揭晓！',
      '看展请排队，体验请按现场指引。',
      '前排看得到，后排的热情我也听得到！',
      '把期待交给舞台，把掌声送给每位观众！',
      '新品信息以正式发布为准，精彩先在现场相见！',
      '灯光准备，掌声准备，一起迎接新的空间想象！'
    ];
    const lyricLines=[
      '影目开场，心里有光；跟着节拍，把笑容点亮。',
      '向前一步，换个角度；影目相伴，想象不走旧路。',
      '掌声成海，节拍澎湃；影目舞台，期待一起盛开。',
      '眼前有光，脚步有方向；影目在场，快乐一起登场。',
      '看见远方，心里有光；跟着影目，把好心情收藏。',
      '节拍开麦，笑容满载；影目在这里，等你一起喝彩。'
    ];
    const streamLines=[
      '家人们，影目现场已经把氛围拉满了！',
      '我是周云飞，镜头先对准这份期待。',
      '不抢前排，先把直播间的掌声刷起来。',
      '今天只聊现场感受，参数等正式公布。',
      '大屏有空间，手机有画面，大家有笑脸。',
      '前排看眼镜，后排跟我云逛展。',
      '跟着我绕一圈，排队也有发布会的仪式感。'
    ];
    // Guards have readable floor fans; regular guests indicate attention through their actions.
    function fan(range,half){
      const points=[0,.045,0];for(let i=0;i<=28;i++){const a=-half+2*half*i/28;points.push(Math.sin(a)*range,.045,Math.cos(a)*range);}
      const indices=[];for(let i=1;i<=28;i++)indices.push(0,i,i+1);
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points,3));geo.setIndex(indices);geo.computeVertexNormals();
      const mesh=new T.Mesh(geo,new T.MeshBasicMaterial({color:0xe9a64a,side:T.DoubleSide,transparent:true,opacity:.16,depthWrite:false,toneMapped:false}));
      group.add(mesh);return mesh;
    }
    people.filter(p=>p.role==='security').forEach(p=>{p.fan=fan(p.range,p.halfFov);});
    const lines=[
      '我真是来看眼镜的。','发布会还没开，我相册先满了。','前排看参数，后排看热闹。','智能眼镜：我负责智能，你负责戴。',
      '空间时代到了，我的座位空间还没到。','这个灯光，把我的工牌都照高级了。','别挤，镜腿也需要呼吸。','我就拍一张……已经第六十八张。',
      '新品还没上脸，期待先上头了。','这段舞蹈，是空间计算的热身吗？','一边看演出，一边假装很懂参数。','我坐得远，但我的好奇心在第一排。',
      '今天的主角：眼镜。我的主角：晚餐。','直播间的朋友，现场是真的热闹。','这副眼镜，能找到我刚才的座位吗？','朋友问在哪，我说在未来门口。',
      '摄影老师，能给我的黑眼圈打点光吗？','掌声给新品，手机电量留给返程。','我的手在鼓掌，我的脑子在想续航。','舞台很稳，我的拍照手不太稳。',
      '这里没有普通观众，都是未来体验官。','先别问多少钱，先让我多看两眼。','签到了，但还没签到前排。','请给后排朋友一点点未来视野。'
    ];
    function bubble(p,text,duration=2.8,priority=0){
      const container=document.getElementById('launch-bubbles');if(!container||!camera)return;
      if(bubbles.length>=3){
        let replace=0;for(let i=1;i<bubbles.length;i++)if(bubbles[i].priority<bubbles[replace].priority)replace=i;
        if(bubbles[replace].priority>priority)return;
        bubbles[replace].node.remove();bubbles.splice(replace,1);
      }
      const node=document.createElement('span');node.className='launch-bubble';node.textContent=text;container.appendChild(node);
      node.dataset.priority=String(priority);bubbles.push({person:p,node,life:duration,priority});
    }
    function say(p,text,duration=3.1,priority=1){p.speakingUntil=elapsed+duration;bubble(p,text,duration,priority);}
    function updateNameplates(){
      const container=document.getElementById('venue-names');if(!container||!camera)return;
      for(const entry of namedActors){
        if(!entry.node||entry.node.parentNode!==container){entry.node=document.createElement('span');entry.node.textContent=entry.label;container.appendChild(entry.node);}
        const p=entry.actor,position=new T.Vector3(p.group.position.x,p.group.position.y+2.55*p.group.scale.y,p.group.position.z).project(camera);
        const x=(position.x*.5+.5)*window.innerWidth,y=(-position.y*.5+.5)*window.innerHeight;
        entry.node.hidden=!group.visible||position.z>1||x<26||x>window.innerWidth-26||y<65||y>window.innerHeight-24;
        entry.node.style.left=x+'px';entry.node.style.top=y+'px';
      }
    }
    function updatePerformance(){
      const phase=elapsed%28,loop=Math.floor(elapsed/28);
      if(loop!==storyCycle){storyCycle=loop;storyCue=-1;}
      const cues=[
        {at:3.1,actor:heckler,text:'小mo，韦爵爷想摸摸你的手！',duration:2.9},
        {at:6.25,actor:stageMarshal,text:'流氓，冷静点',duration:3.2},
        {at:10.1,actor:heckler,text:'我冷静，手也冷静，先看演出！',duration:3.0},
        {at:13.2,actor:stageMarshal,text:'看演出可以，请保持距离。',duration:2.7}
      ];
      for(let i=0;i<cues.length;i++)if(i>storyCue&&phase>=cues[i].at){const cue=cues[i];say(cue.actor,cue.text,cue.duration,3);storyCue=i;}
      const close=clamp((phase-3)/3.1,0,1)*(1-clamp((phase-14)/3,0,1));
      const ease=close*close*(3-2*close);
      stageMarshal.pos.x=stageMarshal.home.x+(12.75-stageMarshal.home.x)*ease;
      stageMarshal.pos.z=stageMarshal.home.z+(10.4-stageMarshal.home.z)*ease;
      stageMarshal.group.position.set(stageMarshal.pos.x,0,stageMarshal.pos.z);stageMarshal.shadow.position.set(stageMarshal.pos.x,.029,stageMarshal.pos.z);
      const towardsGuest=Math.atan2(heckler.pos.x-stageMarshal.pos.x,heckler.pos.z-stageMarshal.pos.z);
      stageMarshal.body.rotation.y=towardsGuest;stageMarshal.phone.visible=false;stageMarshal.observing=false;
      stageMarshal.body.position.y=0;stageMarshal.armL.shoulder.rotation.set(-.1,0,.08);stageMarshal.armR.shoulder.rotation.set(-.1,0,-.08);
      stageMarshal.armL.elbow.rotation.set(0,0,0);stageMarshal.armR.elbow.rotation.set(0,0,0);
      const holding=phase>=6.2&&phase<14;
      if(holding){
        stageMarshal.armL.shoulder.rotation.set(-1.1,0,.48);stageMarshal.armL.elbow.rotation.set(-.2,0,-.5);
        stageMarshal.armR.shoulder.rotation.set(-1.0,0,-.2);stageMarshal.armR.elbow.rotation.set(-.7,0,.28);
        stageMarshal.head.rotation.y=.12;
      }
      const reaching=phase>=5.5&&phase<6.65,quiet=phase>=7.1&&phase<15;
      heckler.body.rotation.y=Math.atan2(mo.home.x-heckler.home.x,mo.home.z-heckler.home.z);
      heckler.phone.visible=false;heckler.observing=false;
      if(phase>=3&&phase<5.5){heckler.armR.shoulder.rotation.set(-1.0-Math.sin(elapsed*8)*.12,0,-.45);heckler.armR.elbow.rotation.x=-.7;}
      if(reaching){heckler.armR.shoulder.rotation.set(-1.35,0,-.18);heckler.armR.elbow.rotation.set(-.15,0,.1);}
      if(quiet){
        heckler.body.rotation.x=-.10;heckler.armR.shoulder.rotation.set(-.22,0,-.15);heckler.armL.shoulder.rotation.set(-.22,0,.15);
        heckler.head.rotation.y=Math.sin(elapsed*.8)*.06;
      }
      // These are separate performance lines, not puzzle clues or product claims.
      const dialogueWindow=phase<3||phase>16;
      if(dialogueWindow&&elapsed>=nextEmcee){say(emcee,emceeLines[emceeLine++%emceeLines.length],3.5,1);nextEmcee=elapsed+8.7;}
      if(dialogueWindow&&elapsed>=nextLyric){say(mo,'♪ '+lyricLines[lyricLine++%lyricLines.length],3.5,1);nextLyric=elapsed+10.3;}
      if(dialogueWindow&&elapsed>=nextStream){say(streamer,streamLines[streamLine++%streamLines.length],3.5,1);nextStream=elapsed+11.4;}
      emcee.group.position.set(emcee.home.x,emcee.baseY,emcee.home.z);emcee.observing=false;emcee.phone.visible=false;
      emcee.body.rotation.y=Math.atan2(-emcee.home.x,1.5-emcee.home.z)+Math.sin(elapsed*.7)*.04;
      emcee.armR.shoulder.rotation.set(-1.35,0,-.14);emcee.armR.elbow.rotation.set(-1.08,0,0);
      emcee.armL.shoulder.rotation.set(-.65-Math.sin(elapsed*1.7)*.45,0,.25+Math.sin(elapsed*.65)*.16);
      emcee.armL.elbow.rotation.set(-.30,0,-.1);emcee.body.position.y=Math.sin(elapsed*2.1)*.025;
      emcee.head.rotation.set(.03,Math.sin(elapsed*.65)*.12,0);
      streamer.observing=false;streamer.phone.visible=false;
      streamer.body.rotation.y=-.65+Math.sin(elapsed*.45)*.18;
      streamer.armR.shoulder.rotation.set(-1.12,0,-.15);streamer.armR.elbow.rotation.set(-.67,0,0);
      streamer.armL.shoulder.rotation.set(-.48-Math.sin(elapsed*1.8)*.18,0,.18);
      streamer.head.rotation.set(-.06,Math.sin(elapsed*.6)*.10,0);
      if((streamer.speakingUntil||0)>elapsed)streamer.armL.elbow.rotation.z=-.48;
      if((mo.speakingUntil||0)>elapsed)mo.armL.shoulder.rotation.x-=.15;
    }
    function cheer(){
      const ctx=sound?.ctx;if(!sound?.enabled||!ctx||ctx.state!=='running')return;
      for(let k=0;k<3;k++){
        const buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.10),ctx.sampleRate),data=buffer.getChannelData(0);
        for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,3);
        const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();src.buffer=buffer;filter.type='bandpass';filter.frequency.value=1550;filter.Q.value=.8;
        gain.gain.value=.025;src.connect(filter);filter.connect(gain);gain.connect(ctx.destination);src.start(ctx.currentTime+k*.18);
      }
    }
    function follow(p,route,speed,dt,loop=false){
      if(!route?.length)return false;let target=route[p.routeIndex%route.length],dx=target.x-p.pos.x,dz=target.z-p.pos.z,length=Math.hypot(dx,dz);
      if(length<.12){p.routeIndex++;if(!loop&&p.routeIndex>=route.length)return false;target=route[p.routeIndex%route.length];dx=target.x-p.pos.x;dz=target.z-p.pos.z;length=Math.hypot(dx,dz);}
      const step=Math.min(length,speed*dt);p.pos.x+=dx/(length||1)*step;p.pos.z+=dz/(length||1)*step;return true;
    }
    function reset(){
      elapsed=0;nextBubble=2.5;bubbleIndex=0;lastCheer=-1;
      nextEmcee=1;nextLyric=16.5;nextStream=18;emceeLine=0;lyricLine=0;streamLine=0;storyCycle=-1;storyCue=-1;
      while(bubbles.length)bubbles.pop().node.remove();
      for(const p of people){p.pos.x=p.home.x;p.pos.z=p.home.z;p.routeIndex=0;p.mode='WATCH';p.angle=Math.PI;p.observing=false;p.group.position.set(p.pos.x,p.baseY,p.pos.z);
        p.speakingUntil=0;
        if(p.role==='waiter'){stations.waiter.x=p.pos.x;stations.waiter.z=p.pos.z;}}
      namedActors.forEach(entry=>{if(entry.node)entry.node.hidden=true;});
    }
    function update(dt,playerPos){
      if(!group.visible){bubbles.forEach(b=>b.node.hidden=true);namedActors.forEach(entry=>{if(entry.node)entry.node.hidden=true;});return;}
      elapsed+=dt;
      const cycle=elapsed%18,show=cycle>7&&cycle<11.5;
      const cheerCycle=Math.floor(elapsed/18);
      if(show&&lastCheer!==cheerCycle){lastCheer=cheerCycle;cheer();}
      floaters.forEach(f=>{f.mesh.position.y=f.baseY+Math.sin(elapsed*.65+f.phase)*.075;f.mesh.rotation.y+=dt*.035;});
      for(const p of people){
        const t=elapsed+p.phase,attentionCycle=t%p.attentionPeriod;let walking=false;
        const isPhone=p.role!=='dancer'&&attentionCycle>p.attentionPeriod-(p.role==='security'?3.2:2.8);
        const previousX=p.pos.x,previousZ=p.pos.z;
        if(p.role==='security')walking=follow(p,p.route,isPhone?.38:1.1,dt,true);
        // Only part of the audience looks toward a musical accent. Each guard keeps
        // an independent patrol / phone cycle rather than sharing a global blind spot.
        const watchShow=p.role!=='security'&&p.role!=='waiter'&&(p.look==='performance'||(show&&(p.id+cheerCycle)%3===0));
        const localCheer=p.look==='performance'&&Math.sin(t*.9)>.25;
        p.mode=isPhone?'PHONE':watchShow&&(show||localCheer)?'CHEER':'WATCH';
        const target=watchShow?{x:8.5,z:9.1}:p.look==='checkin'?{x:-9.7,z:8.9}:p.look==='experience'?{x:p.home.x,z:-7.3}:{x:0,z:-4.4};
        let targetAngle=Math.atan2(target.x-p.pos.x,target.z-p.pos.z);
        if(p.role==='security'){
          const followsRoute=attentionCycle<4.8&&walking;
          targetAngle=followsRoute?Math.atan2(p.pos.x-previousX,p.pos.z-previousZ):Math.atan2(-p.pos.x,-3.2-p.pos.z)+Math.sin(t*.65)*.44;
        }
        let diff=Math.atan2(Math.sin(targetAngle-p.angle),Math.cos(targetAngle-p.angle));p.angle+=diff*Math.min(1,dt*5);p.lookAngle=p.angle;
        p.group.position.set(p.pos.x,p.baseY,p.pos.z);p.body.rotation.y=p.angle;p.body.position.set(0,0,0);p.body.rotation.x=0;p.body.rotation.z=0;
        if(p.role==='waiter'){stations.waiter.x=p.pos.x;stations.waiter.z=p.pos.z;}
        p.armL.shoulder.rotation.set(0,0,.06);p.armR.shoulder.rotation.set(0,0,-.06);p.armL.elbow.rotation.set(0,0,0);p.armR.elbow.rotation.set(0,0,0);
        p.head.rotation.set(isPhone?.3:Math.sin(t*.4)*.035,0,0);p.phone.visible=isPhone;
        for(const eye of p.eyes)eye.scale.y=.035;
        if(p.seated){p.legL.hip.rotation.x=p.legR.hip.rotation.x=-Math.PI/2;p.legL.knee.rotation.x=p.legR.knee.rotation.x=Math.PI/2;}
        else {const swing=walking?Math.sin(t*9)*.52:Math.sin(t*1.1)*.025;p.legL.hip.rotation.x=swing;p.legR.hip.rotation.x=-swing;p.legL.knee.rotation.x=Math.max(0,-swing)*.7;p.legR.knee.rotation.x=Math.max(0,swing)*.7;p.body.position.y=walking?Math.abs(Math.sin(t*9))*.06:0;}
        if(p.mode==='PHONE'){p.armR.shoulder.rotation.x=-.85;p.armR.elbow.rotation.x=-1.1;p.armL.shoulder.rotation.x=-.3;}
        else if(p.mode==='CHEER'&&p.role!=='security'){
          if(p.id%3===0){p.armL.shoulder.rotation.x=-2.6;p.armR.shoulder.rotation.x=-2.6;p.armL.shoulder.rotation.z=.24;p.armR.shoulder.rotation.z=-.24;p.body.position.y+=Math.max(0,Math.sin(t*5))*.055;}
          else{p.armL.shoulder.rotation.x=-1.05;p.armR.shoulder.rotation.x=-1.05;p.armL.elbow.rotation.z=-.75-Math.sin(t*14)*.17;p.armR.elbow.rotation.z=.75+Math.sin(t*14)*.17;}
        }else if(p.role==='media'){p.armR.shoulder.rotation.x=-.85;p.armL.shoulder.rotation.x=-.5;}
        p.observing=p.role!=='dancer'&&p.role!=='emcee'&&p.role!=='stage-security'&&!isPhone&&!watchShow&&p.pos.z<5.7;
        if(p.fan){p.fan.position.set(p.pos.x,0,p.pos.z);p.fan.rotation.y=p.lookAngle;p.fan.visible=p.observing;}
        p.shadow.position.set(p.pos.x,.029,p.pos.z);
      }
      for(const p of dancers){
        const t=elapsed*2.6+p.phase,wave=Math.sin(t),lift=Math.max(0,Math.sin(t*2));
        p.group.position.set(p.home.x+Math.sin(t*.5)*.16,.43+lift*.08,p.home.z+Math.cos(t*.5)*.12);
        p.body.rotation.y=.12+Math.sin(t*.5)*.35;p.body.rotation.z=Math.sin(t)*.075;p.body.position.y=0;
        p.armL.shoulder.rotation.set(-1.2-wave*.9,0,.55+Math.sin(t*.5)*.3);p.armR.shoulder.rotation.set(-1.2+wave*.9,0,-.55-Math.sin(t*.5)*.3);
        p.armL.elbow.rotation.set(-.35,0,Math.sin(t*.7)*.4);p.armR.elbow.rotation.set(-.35,0,-Math.sin(t*.7)*.4);
        p.legL.hip.rotation.x=wave*.3;p.legR.hip.rotation.x=-wave*.3;p.legL.knee.rotation.x=lift*.3;p.legR.knee.rotation.x=Math.max(0,-Math.sin(t*2))*.3;
        p.head.rotation.set(.02,Math.sin(t*.6)*.16,0);p.phone.visible=false;p.observing=false;
      }
      updatePerformance();updateNameplates();
      if(elapsed>=nextBubble){
        nextBubble=elapsed+3.7;
        const candidates=people.filter(p=>!p.hasNameplate&&p.role!=='dancer'&&p.role!=='security'&&p.role!=='stage-security');
        const p=candidates[(bubbleIndex*11+3)%candidates.length];bubble(p,lines[bubbleIndex%lines.length]);bubbleIndex++;
        if(bubbleIndex%2===0)bubble(candidates[(bubbleIndex*7+9)%candidates.length],lines[(bubbleIndex+9)%lines.length],2.6);
      }
      for(let i=bubbles.length-1;i>=0;i--){const b=bubbles[i];b.life-=dt;if(b.life<=0){b.node.remove();bubbles.splice(i,1);continue;}
        if(!camera){b.node.hidden=true;continue;}
        const p=b.person,anchorY=p.hasNameplate?p.group.position.y+3.2*p.group.scale.y:(p.seated?2.1:2.65);
        const pos=new T.Vector3(p.group.position.x,anchorY,p.group.position.z).project(camera);
        let sx=(pos.x*.5+.5)*window.innerWidth;const sy=(-pos.y*.5+.5)*window.innerHeight;
        const hero=new T.Vector3(0,1.9,-5.8).project(camera),hx=(hero.x*.5+.5)*window.innerWidth,hy=(-hero.y*.5+.5)*window.innerHeight;
        const overProduct=Math.abs(sx-hx)<150&&Math.abs(sy-hy)<85;
        if(b.priority>0&&overProduct)sx=hx+(sx<hx?-172:172);
        if(b.priority>0)sx=clamp(sx,100,window.innerWidth-100);
        b.node.hidden=pos.z>1||(!b.priority&&overProduct)||sx<90||sx>window.innerWidth-90||sy<80||sy>window.innerHeight-65;
        b.node.style.left=sx+'px';b.node.style.top=sy+'px';
      }
    }
    function witness(pos){
      for(const p of people){
        if(!p.observing)continue;const dx=pos.x-p.pos.x,dz=pos.z-p.pos.z;
        if(dx*dx+dz*dz>p.range*p.range)continue;
        const angle=Math.atan2(Math.sin(Math.atan2(dx,dz)-p.lookAngle),Math.cos(Math.atan2(dx,dz)-p.lookAngle));
        if(Math.abs(angle)<p.halfFov)return {name:p.name,role:p.role};
      }return null;
    }
    reset();
    return {group,people,stations,namedActors,update,reset,witness,alertCount:()=>people.filter(p=>p.observing).length};
  }
  root.LaunchVenue={build};
})(typeof window!=='undefined'?window:globalThis);
