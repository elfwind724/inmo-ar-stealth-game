(function(root){
  'use strict';

  function create({THREE:T,renderer,player,onDone}){
    const scene=new T.Scene();
    scene.background=new T.Color(0x010205).convertSRGBToLinear();
    scene.fog=new T.FogExp2(new T.Color(0x010205).convertSRGBToLinear(),.008);
    const camera=new T.PerspectiveCamera(42,window.innerWidth/window.innerHeight,.15,230);
    const state={started:false,active:false,paused:false,time:0,complete:false};
    const WALK=10.4,FADE_START=9.8,FADE_END=10.8,END=11.45;
    const $=id=>document.getElementById(id);
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const linear=hex=>new T.Color(hex).convertSRGBToLinear();
    function material(hex,options={}){
      return new T.MeshStandardMaterial({color:linear(hex),roughness:.5,metalness:0,...options});
    }
    function basic(hex,options={}){
      return new T.MeshBasicMaterial({color:linear(hex),toneMapped:false,...options});
    }
    function box(parent,w,h,d,x,y,z,mat){
      const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat);
      mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
    }
    function canvasTexture(width,height,draw){
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      draw(canvas.getContext('2d'),width,height);
      const map=new T.CanvasTexture(canvas);map.encoding=T.sRGBEncoding;map.anisotropy=4;
      return {canvas,map};
    }

    // Soft, original cloud colour inside a physical opening. It is deliberately
    // warmer and dimmer than white, so the doorway keeps its amber atmosphere.
    const sky=canvasTexture(512,2048,(c,w,h)=>{
      const gradient=c.createLinearGradient(0,0,w*.22,h);
      gradient.addColorStop(0,'#a75624');gradient.addColorStop(.20,'#d58b3f');
      gradient.addColorStop(.50,'#edb364');gradient.addColorStop(.76,'#dfa05b');gradient.addColorStop(1,'#a55e32');
      c.fillStyle=gradient;c.fillRect(0,0,w,h);
      for(let i=0;i<47;i++){
        const x=(Math.sin(i*13.72)*.5+.5)*w,y=(Math.cos(i*5.17)*.5+.5)*h;
        const rx=90+(i%7)*24,ry=20+(i%5)*17;
        c.save();c.translate(x,y);c.scale(rx,ry);
        const cloud=c.createRadialGradient(0,0,0,0,0,1);
        cloud.addColorStop(0,i%3?'rgba(255,219,163,.10)':'rgba(112,63,35,.08)');cloud.addColorStop(1,'rgba(0,0,0,0)');
        c.fillStyle=cloud;c.fillRect(-1,-1,2,2);c.restore();
      }
      const sun=c.createRadialGradient(w*.54,h*.37,0,w*.54,h*.37,w*.78);
      sun.addColorStop(0,'rgba(255,226,173,.22)');sun.addColorStop(1,'rgba(255,219,160,0)');
      c.fillStyle=sun;c.fillRect(0,0,w,h);
      c.fillStyle='rgba(74,42,31,.07)';c.beginPath();c.moveTo(0,h*.93);
      for(let x=0;x<=w;x+=16)c.lineTo(x,h*(.925+Math.sin(x*.018)*.006));
      c.lineTo(w,h);c.lineTo(0,h);c.closePath();c.fill();
    });
    const portal=new T.Group();portal.position.z=-16;scene.add(portal);
    const inner=new T.Mesh(new T.PlaneGeometry(4,16),new T.MeshBasicMaterial({map:sky.map,toneMapped:false}));
    inner.position.set(0,8,0);portal.add(inner);
    const bronze=material(0x5c3c22,{roughness:.23,metalness:.82,emissive:linear(0x6d391b),emissiveIntensity:.12});
    const lightEdge=basic(0xe5ac61);
    for(const side of [-1,1]){
      box(portal,.14,16.22,.30,side*2.10,8.04,-.035,bronze);
      box(portal,.024,16.04,.018,side*2.012,8.0,.13,lightEdge);
    }
    box(portal,4.34,.14,.30,0,16.10,-.035,bronze);
    box(portal,4.03,.024,.018,0,16.01,.13,lightEdge);
    box(portal,4.32,.065,.45,0,.012,.015,bronze);

    const halo=canvasTexture(256,1024,(c,w,h)=>{
      c.clearRect(0,0,w,h);
      c.strokeStyle='rgba(237,166,76,.8)';c.lineWidth=4;c.shadowColor='#c97932';c.shadowBlur=24;
      c.strokeRect(w*.16,h*.075,w*.68,h*.85);
      c.lineWidth=1;c.shadowBlur=10;c.strokeStyle='rgba(255,204,125,.30)';c.strokeRect(w*.16,h*.075,w*.68,h*.85);
    });
    const halos=[];
    for(const layer of [{w:5.5,h:18.2,o:.19},{w:7.1,h:21.2,o:.09},{w:10.0,h:25.0,o:.035}]){
      const mesh=new T.Mesh(new T.PlaneGeometry(layer.w,layer.h),new T.MeshBasicMaterial({
        map:halo.map,transparent:true,opacity:layer.o,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));
      mesh.position.set(0,8.05,-.08-halos.length*.015);portal.add(mesh);halos.push(mesh);
    }

    const groundTexture=canvasTexture(512,512,(c,w,h)=>{
      c.fillStyle='#0d1015';c.fillRect(0,0,w,h);
      for(let i=0;i<4200;i++){
        const x=((i*139)%509),y=((i*269)%503),value=i%3===0?30:19;
        c.fillStyle='rgba('+value+','+value+','+(value+3)+',.14)';c.fillRect(x,y,1,1);
      }
    });
    groundTexture.map.wrapS=groundTexture.map.wrapT=T.RepeatWrapping;groundTexture.map.repeat.set(9,21);
    const ground=new T.Mesh(new T.PlaneGeometry(100,230),new T.MeshPhysicalMaterial({
      color:linear(0x2d3035),map:groundTexture.map,metalness:.63,roughness:.19,clearcoat:.9,clearcoatRoughness:.14,envMapIntensity:.55}));
    ground.rotation.x=-Math.PI/2;ground.position.set(0,-.025,-35);ground.receiveShadow=true;scene.add(ground);
    const seams=[];
    for(let x=-36;x<=36;x+=4)seams.push(x,-.012,-100,x,-.012,65);
    for(let z=-100;z<=65;z+=4)seams.push(-36,-.012,z,36,-.012,z);
    const seamsGeometry=new T.BufferGeometry();seamsGeometry.setAttribute('position',new T.Float32BufferAttribute(seams,3));
    const grout=new T.LineSegments(seamsGeometry,new T.LineBasicMaterial({color:linear(0x34312c),transparent:true,opacity:.34}));scene.add(grout);

    // A floor-projected image supplies the long reflection without a second render pass.
    const reflectionTexture=canvasTexture(512,2048,(c,w,h)=>{
      c.clearRect(0,0,w,h);c.save();c.translate(0,h);c.scale(1,-1);c.drawImage(sky.canvas,0,0,w,h);c.restore();
      c.globalCompositeOperation='destination-in';const mask=c.createLinearGradient(0,0,0,h);
      mask.addColorStop(0,'rgba(255,255,255,.56)');mask.addColorStop(.35,'rgba(255,255,255,.21)');
      mask.addColorStop(.73,'rgba(255,255,255,.03)');mask.addColorStop(1,'rgba(255,255,255,0)');
      c.fillStyle=mask;c.fillRect(0,0,w,h);
    });
    const reflection=new T.Mesh(new T.PlaneGeometry(4.05,28),new T.MeshBasicMaterial({
      map:reflectionTexture.map,transparent:true,opacity:.44,depthWrite:false,toneMapped:false}));
    reflection.rotation.x=-Math.PI/2;reflection.position.set(0,.003,-2);reflection.renderOrder=1;scene.add(reflection);
    const spillTexture=canvasTexture(256,512,(c,w,h)=>{
      c.save();c.translate(w/2,h/2);c.scale(w*.5,h*.5);
      const g=c.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,'rgba(224,143,65,.50)');g.addColorStop(.45,'rgba(177,104,40,.18)');g.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=g;c.fillRect(-1,-1,2,2);c.restore();
    });
    const spill=new T.Mesh(new T.PlaneGeometry(9,24),new T.MeshBasicMaterial({map:spillTexture.map,transparent:true,opacity:.28,depthWrite:false,toneMapped:false}));
    spill.rotation.x=-Math.PI/2;spill.position.set(0,.001,-5);scene.add(spill);

    const ambient=new T.HemisphereLight(0x56718b,0x040506,.16);scene.add(ambient);
    const gateLight=new T.PointLight(0xe6a35b,1.4,32,1.4);gateLight.position.set(0,5.5,-14.8);scene.add(gateLight);
    const lowLight=new T.PointLight(0xd18a42,.6,20,1.5);lowLight.position.set(0,1.0,-14);scene.add(lowLight);
    const rim=new T.DirectionalLight(0xd89b53,.48);rim.position.set(-4,8,-10);scene.add(rim);
    const frontFill=new T.DirectionalLight(0x7a8495,.18);frontFill.position.set(2,4,13);scene.add(frontFill);

    if(renderer?.isWebGLRenderer&&T.PMREMGenerator){
      const env=new T.Scene();env.background=new T.Color(0x030405);
      const envGate=new T.Mesh(new T.PlaneGeometry(4,16),basic(0xaf743b));envGate.position.set(0,7,-18);env.add(envGate);
      const upper=new T.Mesh(new T.PlaneGeometry(18,2),basic(0x0f141d));upper.position.set(0,12,3);upper.rotation.x=Math.PI/2;env.add(upper);
      const pmrem=new T.PMREMGenerator(renderer);const target=pmrem.fromScene(env,.05,.1,100);scene.environment=target.texture;pmrem.dispose();
      envGate.geometry.dispose();envGate.material.dispose();upper.geometry.dispose();upper.material.dispose();
    }

    // Cloning the graph shares source geometry/materials safely. Only transforms
    // and visibility on the cloned graph are changed; gameplay state is untouched.
    const actor=player.group.clone(true),nodeMap=new Map();
    function pair(a,b){nodeMap.set(a,b);a.children.forEach((child,i)=>pair(child,b.children[i]));}
    pair(player.group,actor);
    const body=nodeMap.get(player.bodyGroup),legL=nodeMap.get(player.legL),legR=nodeMap.get(player.legR),
      armL=nodeMap.get(player.armL),armR=nodeMap.get(player.armR);
    actor.children.forEach(child=>{child.visible=child===body;});
    actor.position.set(0,0,10);actor.rotation.set(0,0,0);body.rotation.set(0,Math.PI,0);body.position.set(0,0,0);body.scale.set(1,1,1);
    scene.add(actor);

    const mirrored=actor.clone(true),reflectionNodes=new Map(),reflectionMaterials=new Map();
    function pairReflection(a,b){reflectionNodes.set(a,b);a.children.forEach((child,i)=>pairReflection(child,b.children[i]));}
    pairReflection(actor,mirrored);
    mirrored.traverse(mesh=>{
      if(!mesh.material)return;
      const cloneMaterial=source=>{
        if(!reflectionMaterials.has(source)){
          const m=source.clone();m.transparent=true;m.opacity=.10;m.depthWrite=false;m.depthTest=false;
          if(m.color)m.color.multiplyScalar(.65);reflectionMaterials.set(source,m);
        }return reflectionMaterials.get(source);
      };
      mesh.material=Array.isArray(mesh.material)?mesh.material.map(cloneMaterial):cloneMaterial(mesh.material);
      mesh.castShadow=false;mesh.receiveShadow=false;mesh.renderOrder=2;
    });
    scene.add(mirrored);

    const dustPositions=new Float32Array(96*3);
    for(let i=0;i<96;i++){
      dustPositions[i*3]=Math.sin(i*31.7)*3.7;dustPositions[i*3+1]=(i*1.71)%16;
      dustPositions[i*3+2]=-13.8-Math.cos(i*17.9)*1.7;
    }
    const dustGeometry=new T.BufferGeometry();dustGeometry.setAttribute('position',new T.BufferAttribute(dustPositions,3));
    const dust=new T.Points(dustGeometry,new T.PointsMaterial({color:linear(0xc99150),size:.027,transparent:true,opacity:.35,depthWrite:false,toneMapped:false}));scene.add(dust);

    function pose(time){
      const fraction=clamp(time/WALK,0,1),gait=time*8.0,stride=Math.sin(gait)*.55;
      actor.position.set(Math.sin(time*.65)*.025,0,10-26.5*fraction);
      body.position.y=Math.abs(Math.sin(gait))*.050;body.rotation.set(0,Math.PI+Math.sin(gait*.5)*.012,Math.cos(gait)*.018);
      legL.rotation.set(stride,0,0);legR.rotation.set(-stride,0,0);
      legL.position.y=.85+Math.max(0,Math.sin(gait))*.045;legR.position.y=.85+Math.max(0,-Math.sin(gait))*.045;
      legL.position.z=Math.sin(gait)*.035;legR.position.z=-Math.sin(gait)*.035;
      armL.rotation.set(-stride*.48,0,.06);armR.rotation.set(stride*.48,0,-.06);
      for(const [from,to] of reflectionNodes){if(from===actor)continue;to.position.copy(from.position);to.rotation.copy(from.rotation);to.scale.copy(from.scale);to.visible=from.visible;}
      mirrored.position.set(actor.position.x,-.045,actor.position.z);
      mirrored.rotation.copy(actor.rotation);mirrored.scale.set(actor.scale.x,-actor.scale.y,actor.scale.z);
      dust.position.y=Math.sin(time*.15)*.12;
      halos.forEach((mesh,i)=>mesh.material.opacity=[.19,.09,.035][i]*(.96+Math.sin(time*.7+i)*.04));
      camera.position.set(0,3.3,21-Math.min(.55,time*.05));camera.lookAt(0,4.0,-10);
      const fade=clamp((time-FADE_START)/(FADE_END-FADE_START),0,1);
      if($('opening-fade'))$('opening-fade').style.opacity=String(fade);
      if($('opening-brand'))$('opening-brand').style.opacity=String(clamp(time/.9,0,1));
      if($('opening-title'))$('opening-title').style.opacity=String(clamp(time/1.6,0,1)*clamp((7.0-time)/1.4,0,1));
      if($('opening-date'))$('opening-date').style.opacity=String(clamp((time-.5)/1.2,0,1)*clamp((8.3-time)/1.2,0,1));
    }
    function finish(){
      if(state.complete)return;state.complete=true;state.active=false;state.paused=false;scene.visible=false;
      const opening=$('launch-opening');if(opening)opening.hidden=true;document.body.classList.remove('intro-playing');
      if($('opening-fade'))$('opening-fade').style.opacity='0';
      if(typeof onDone==='function')onDone();
    }
    function start(){
      if(state.active)return;state.started=true;state.complete=false;state.active=true;state.paused=false;state.time=0;scene.visible=true;
      document.body.classList.add('intro-playing');const opening=$('launch-opening');if(opening)opening.hidden=false;
      if($('opening-skip'))$('opening-skip').textContent='跳过入场';
      resize();pose(0);
    }
    function update(dt){
      if(!state.active||state.paused)return;
      state.time+=Math.max(0,Math.min(.1,dt));pose(state.time);
      if(state.time>=END)finish();
    }
    function resize(){
      const width=renderer?.domElement?.clientWidth||window.innerWidth,height=renderer?.domElement?.clientHeight||window.innerHeight;
      camera.aspect=width/Math.max(1,height);camera.fov=camera.aspect<.8?47:42;camera.updateProjectionMatrix();
    }
    function pause(value){
      if(!state.active)return;state.paused=Boolean(value);
      if($('opening-skip'))$('opening-skip').textContent=state.paused?'继续入场':'跳过入场';
    }
    function skip(){if(state.active)finish();}
    $('opening-skip')?.addEventListener('click',()=>{if(state.paused)pause(false);else skip();});
    resize();pose(0);
    return {scene,camera,start,update,resize,skip,pause,get active(){return state.active;},get paused(){return state.paused;}};
  }
  root.LaunchIntro={create};
})(typeof window!=='undefined'?window:globalThis);
