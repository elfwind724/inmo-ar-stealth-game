/* Optional, locally shipped Kenney CC0 GLBs. Source rigs remain the authored animation interface. */
(function(global){
  'use strict';
  const characters=['xiaoying','yunfei','hamster','weijue'];
  const files=[...characters,'chairModernFrameCushion','pottedPlant','speaker','tableRound'];
  function resolveURL(path){return global.THEATER_MODEL_DATA?.[path]||path;}
  async function load({THREE:T,venue}){
    const status={phase:'loading',characters:0,audience:0,viewer:0,props:0,files:{},errors:[]};
    const records=[];
    const identity=new T.Quaternion(),tempQ=new T.Quaternion(),tempQ2=new T.Quaternion(),tempV=new T.Vector3(),worldQ=new T.Quaternion(),worldScale=new T.Vector3();
    if(!T.GLTFLoader||!T.SkeletonUtils?.clone){status.phase='fallback';status.errors.push('GLTFLoader or SkeletonUtils unavailable');return{status,update(){}};}
    const loader=new T.GLTFLoader();
    function request(name){
      return new Promise(resolve=>{
        const path='./assets/theater-models/'+name+'.glb';
        // A failed optional asset preserves the fallback actor, without blocking the show.
        const timer=setTimeout(()=>{if(status.files[name]==='loading'){status.files[name]='timeout';resolve(null);}},20000);
        status.files[name]='loading';
        loader.load(resolveURL(path),asset=>{clearTimeout(timer);if(status.files[name]==='timeout')return;status.files[name]='ready';resolve(asset);},undefined,error=>{clearTimeout(timer);status.files[name]='fallback';status.errors.push(name+': '+String(error?.message||'load failed'));resolve(null);});
      });
    }
    function meshes(root,fn){root.traverse(o=>{if(o.isMesh)fn(o);});}
    function prepare(root){meshes(root,o=>{o.castShadow=true;o.receiveShadow=true;if(o.isSkinnedMesh)o.frustumCulled=false;});}
    function joint(model,name){return model.getObjectByName(name);}
    const imageCache=new WeakMap();
    const guestColors=[0x75455e,0x426983,0x576b4d,0xa7793c,0x59677c,0x33766e,0xb9ac8f,0x705483,0x35434d,0x496f9c,0xa55c51,0x897082];
    const hairColors=[0x27232a,0x433128,0x66503e,0x82796d,0x393a40,0xa99168];
    function linear(c){return new T.Color(c).convertSRGBToLinear();}
    function pixelsFor(texture){
      const image=texture?.image;if(!image||typeof image!=='object')return null;
      if(imageCache.has(image))return imageCache.get(image);
      let result=null;
      try{const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;if(width&&height){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);result={width,height,data:context.getImageData(0,0,width,height).data};}}catch{}
      imageCache.set(image,result);return result;
    }
    function wardrobe(actor,id,seated){
      const match=String(actor.id||'').match(/guest-(\d+)/),index=match?Number(match[1]):0;
      const named={xiaoying:0x922d5b,yunfei:0x2b6492,hamster:0xd68b35,weijue:0x235f4c,viewer:0x486986};
      const coat=linear(seated?guestColors[(index*5+Math.floor(index/4))%guestColors.length]:named[id]||0x526778);
      return{coat,pants:coat.clone().lerp(linear(0x18232d),id==='xiaoying'&&!seated?.2:.64),accent:linear(id==='xiaoying'&&!seated?0xe2c38b:0xc9beaa),hair:linear(seated?hairColors[(index*3+Math.floor(index/6))%hairColors.length]:id==='xiaoying'?0x211b26:0x40312b),index};
    }
    function styleAvatar(model,actor,id,seated){
      const palette=wardrobe(actor,id,seated),sampleUV=new T.Vector2(),white=new T.Color(1,1,1);
      // Each clone owns its colors/materials. The original texture is sampled once so
      // recoloring a jacket never tints the hands, face, eyes or another guest.
      meshes(model,mesh=>{
        mesh.geometry=mesh.geometry.clone();
        const original=Array.isArray(mesh.material)?mesh.material[0]:mesh.material,map=original.map,pixels=pixelsFor(map),positions=mesh.geometry.getAttribute('position'),uvs=mesh.geometry.getAttribute('uv');
        mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();
        const head=/head-mesh/.test(mesh.name),colors=new Float32Array(positions.count*3),joints=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
        for(let i=0;i<positions.count;i++){
          const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),color=white.clone();
          if(pixels&&uvs){sampleUV.fromBufferAttribute(uvs,i);map.updateMatrix();map.transformUv(sampleUV);const px=Math.max(0,Math.min(pixels.width-1,Math.floor(sampleUV.x*pixels.width))),py=Math.max(0,Math.min(pixels.height-1,Math.floor(sampleUV.y*pixels.height))),at=(py*pixels.width+px)*4;color.setRGB(pixels.data[at]/255,pixels.data[at+1]/255,pixels.data[at+2]/255).convertSRGBToLinear();}
          let dominant=0;if(joints&&weights){let best=-1;for(const [k,get] of ['getX','getY','getZ','getW'].entries()){const w=weights[get](i);if(w>best){best=w;dominant=joints[get](i);}}}
          if(!head){
            const torso=dominant===3,arm=[4,5,7,8].includes(dominant),leg=[1,2,9,10].includes(dominant);
            if(torso&&y<.329&&y>.17){color.copy(palette.coat);if(Math.abs(x)<.039&&z>.068&&y>.225)color.copy(palette.accent);}
            else if(arm&&Math.abs(x)<.291)color.copy(palette.coat);
            else if(leg&&y>.044)color.copy(palette.pants);
          }else{
            // Face and ears project toward +z. Only scalp/back regions receive hair color.
            const hair=(y>.575&&z<.13)||(z<-.065&&y>.405)||(Math.abs(x)>.18&&z<.08&&y>.425);
            if(hair&&!(id==='weijue'&&!seated))color.copy(palette.hair);
          }
          colors.set([color.r,color.g,color.b],i*3);
        }
        mesh.geometry.setAttribute('color',new T.BufferAttribute(colors,3));
        for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){material.vertexColors=true;material.roughness=.86;material.metalness=0;if(pixels){material.map=null;material.color.set(0xffffff);}material.needsUpdate=true;}
      });
      actor.modelStyle={coat:palette.coat.getHex(),hair:palette.hair.getHex(),individual:true};
      if(id==='xiaoying'&&!seated){
        const head=joint(model,'head'),torso=joint(model,'torso'),hair=new T.MeshStandardMaterial({color:palette.hair,roughness:.87}),gold=new T.MeshStandardMaterial({color:linear(0xd9b879),roughness:.34,metalness:.65});
        const shape=(parent,x,y,z,sx,sy,sz,material)=>{const m=new T.Mesh(new T.SphereGeometry(1,10,8),material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
        const longHair=new T.Group();longHair.name='xiaoying-long-hair';head.add(longHair);
        shape(longHair,0,.235,-.105,.238,.232,.185,hair);
        shape(longHair,0,.035,-.205,.225,.215,.116,hair);
        for(const side of [-1,1]){shape(longHair,side*.195,.035,-.045,.057,.234,.086,hair);shape(head,side*.205,.075,.054,.012,.019,.009,gold);}
        const tail=shape(longHair,.132,.025,-.335,.077,.234,.075,hair);tail.rotation.z=-.22;
        const band=new T.Mesh(new T.TorusGeometry(.046,.009,5,10),gold);band.position.set(.126,.207,-.310);band.rotation.x=Math.PI/2;longHair.add(band);
        const dress=new T.Mesh(new T.CylinderGeometry(.132,.185,.17,10),new T.MeshStandardMaterial({color:palette.coat,roughness:.9}));dress.name='xiaoying-evening-skirt';dress.position.set(0,-.063,-.018);dress.castShadow=true;dress.receiveShadow=true;torso.add(dress);
        const brooch=shape(torso,-.073,.101,.112,.014,.022,.009,gold);brooch.name='host-gold-brooch';
      }
    }
    function clonedAvatar(actor,asset,id,seated=false){
      if(!actor||!asset)return;
      const model=T.SkeletonUtils.clone(asset.scene),visual=new T.Group();visual.name='kenney-'+id;
      styleAvatar(model,actor,id,seated);
      const box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3()),scale=(actor.height||2.1)/Math.max(.01,size.y);
      visual.scale.setScalar(scale);visual.position.y=-box.min.y*scale;visual.add(model);actor.body.add(visual);prepare(model);
      const bones={root:joint(model,'root'),torso:joint(model,'torso'),head:joint(model,'head'),
        // Source L is negative x. Kenney's anatomical names use the opposite side.
        armL:joint(model,'arm-right'),armR:joint(model,'arm-left'),forearmL:joint(model,'forearm-right'),forearmR:joint(model,'forearm-left'),
        legL:joint(model,'leg-right'),legR:joint(model,'leg-left'),shinL:joint(model,'shin-right'),shinR:joint(model,'shin-left')};
      if(Object.values(bones).some(b=>!b)){actor.body.remove(visual);status.errors.push(id+': rig incomplete');return;}
      const rest={};for(const [name,bone] of Object.entries(bones))rest[name]={position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()};
      const mixer=new T.AnimationMixer(model),clips=new Map(asset.animations.map(c=>[c.name,c])),actions=new Map();
      for(const name of ['idle','walk','sit','fall'])if(clips.has(name))actions.set(name,mixer.clipAction(clips.get(name)));
      // The original arm rest is a T pose. Authored shoulder deltas layer over native idle/walk.
      const basisL=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-Math.PI/2),basisR=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI/2);
      const native={};for(const [name,pose] of Object.entries(rest))native[name]={position:pose.position.clone(),quaternion:pose.quaternion.clone(),scale:pose.scale.clone()};
      const contacts=[];
      if(!seated)model.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const p=mesh.geometry.getAttribute('position'),weights=mesh.geometry.getAttribute('skinWeight'),joints=mesh.geometry.getAttribute('skinIndex'),seen=new Set();for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i),weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i),joints.getX(i),joints.getY(i),joints.getZ(i),joints.getW(i)].map(n=>Math.round(n*1e6)).join('/');if(!seen.has(key)){seen.add(key);contacts.push({mesh,index:i});}}});
      const record={actor,id,model,visual,bones,rest,native,mixer,actions,seated,scale,basisL,basisR,current:null,clock:0,contacts,bindOffset:-box.min.y*scale};
      if(!seated){
        // These lightweight props retain their public visibility handles, but follow actual GLB landmarks.
        for(const prop of [actor.microphone,actor.tearDrops,actor.sweatDrop])if(prop)actor.group.add(prop);
        if(actor.tearDrops)actor.tearDrops.scale.setScalar(2.05);
        if(actor.sweatDrop)actor.sweatDrop.scale.setScalar(1.5);
      }
      actor.fallbackMeshes.forEach(m=>m.visible=false);actor.modelAsset={file:(id==='viewer'?'yunfei':id)+'.glb',joints:11,clips:asset.animations.map(c=>c.name)};
      records.push(record);if(seated)status.audience++;else if(id==='viewer')status.viewer=1;else status.characters++;
      return record;
    }
    function changeAction(record,name){
      if(record.current===name)return;
      const next=record.actions.get(name)||record.actions.get('idle');if(!next)return;
      const old=record.actions.get(record.current);next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
      if(old&&old!==next)next.crossFadeFrom(old,.18,false);record.current=name;
    }
    function sourceDelta(source,amount=1){return tempQ.copy(identity).slerp(source.quaternion,amount);}
    function ikArm(record,side,target,weight=1){
      if(weight<=0)return;
      const {actor:a,bones:b,rest}=record,upper=b['arm'+side],lower=b['forearm'+side],sign=side==='L'?-1:1;
      const shoulder=upper.getWorldPosition(new T.Vector3()),wrist=lower.localToWorld(new T.Vector3(sign*.13,0,0));
      target=wrist.clone().lerp(target,Math.min(1,weight));
      const scale=upper.getWorldScale(new T.Vector3()),l1=rest['forearm'+side].position.length()*scale.x,l2=.13*scale.x;
      const direction=target.clone().sub(shoulder),distance=Math.max(.001,Math.min(direction.length(),(l1+l2)*.998));direction.normalize();
      target.copy(shoulder).addScaledVector(direction,distance);
      const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
      // The elbow points out from the body, giving a stable bend plane even when the
      // hand reaches across the face. This is a two-bone solve, not a shoulder twist.
      const lateral=new T.Vector3(sign,0,.18).applyQuaternion(a.body.getWorldQuaternion(new T.Quaternion()));
      lateral.addScaledVector(direction,-lateral.dot(direction)).normalize();
      const elbow=shoulder.clone().addScaledVector(direction,along).addScaledVector(lateral,height);
      function aim(bone,restQuaternion,axis,from,to){
        const parentQ=bone.parent.getWorldQuaternion(new T.Quaternion()).invert(),wanted=to.clone().sub(from).normalize().applyQuaternion(parentQ);
        const restAxis=axis.clone().normalize().applyQuaternion(restQuaternion);
        bone.quaternion.copy(new T.Quaternion().setFromUnitVectors(restAxis,wanted)).multiply(restQuaternion);
      }
      aim(upper,rest['arm'+side].quaternion,rest['forearm'+side].position,shoulder,elbow);a.group.updateMatrixWorld(true);
      const elbowNow=lower.getWorldPosition(new T.Vector3());aim(lower,rest['forearm'+side].quaternion,new T.Vector3(sign,0,0),elbowNow,target);a.group.updateMatrixWorld(true);
    }
    function surfaceAt(x,z){
      if(Math.abs(x)<9.03&&z>=-12.52&&z<=-5.49)return venue.stageY||.75;
      if(Math.abs(x)<=3.12){if(z>=-5.31&&z<-4.81)return .573;if(z>=-4.81&&z<-4.33)return .388;if(z>=-4.33&&z<-3.85)return .203;}
      return .018;
    }
    function groundAvatar(record){
      // Geometry samples include the large GLB head as well as feet/palms. Sampling the
      // actual skin (deduplicated once at load) avoids the fallback collision proxy's
      // different proportions during forward falls. Only four performers run this pass.
      const {actor:a,visual}=record;if(!a.group.visible)return;
      let lift=0;
      for(const {mesh,index} of record.contacts){mesh.boneTransform(index,tempV).applyMatrix4(mesh.matrixWorld);lift=Math.max(lift,surfaceAt(tempV.x,tempV.z)+.008-tempV.y);}
      if(lift>0){a.body.getWorldQuaternion(tempQ).invert();a.body.getWorldScale(worldScale);tempV.set(0,lift,0).applyQuaternion(tempQ).divide(worldScale);visual.position.add(tempV);visual.updateMatrixWorld(true);}
    }
    function pose(record,dt,frame){
      const {actor:a,bones:b,rest,native,visual,mixer,seated}=record;
      const active=frame.cue?.actor===record.id,performance=a.performance||{};
      visual.position.set(0,record.bindOffset,0);
      // Seated guests use explicit hip/knee source poses, so new knee joints never bend twice.
      const clip=seated?'idle':performance.walking?'walk':'idle';changeAction(record,clip);
      // Restore the previous native sample, not the modified render pose. PropertyMixer can
      // skip unchanged tracks at dt=0, so resetting to bind pose here would break paused frames.
      for(const [key,bone] of Object.entries(b)){bone.position.copy(native[key].position);bone.quaternion.copy(native[key].quaternion);bone.scale.copy(native[key].scale);}
      mixer.update(Math.max(0,Number(dt)||0));
      for(const [key,bone] of Object.entries(b)){native[key].position.copy(bone.position);native[key].quaternion.copy(bone.quaternion);native[key].scale.copy(bone.scale);}
      const moving=!!performance.walking;
      const limbAmount=moving?.35:1;
      if(seated){
        b.legL.quaternion.copy(rest.legL.quaternion).multiply(a.legL.quaternion);b.legR.quaternion.copy(rest.legR.quaternion).multiply(a.legR.quaternion);
        b.shinL.quaternion.copy(rest.shinL.quaternion).multiply(a.shinL.quaternion);b.shinR.quaternion.copy(rest.shinR.quaternion).multiply(a.shinR.quaternion);
        // Chibi legs are intentionally shorter; a low upholstered seat fits their actual hip height.
        visual.position.y=.36-rest.legL.position.y*record.scale;
      }else{
        b.legL.quaternion.premultiply(sourceDelta(a.legL,limbAmount));b.legR.quaternion.premultiply(sourceDelta(a.legR,limbAmount));
        b.shinL.quaternion.multiply(a.shinL.quaternion);b.shinR.quaternion.multiply(a.shinR.quaternion);
      }
      b.head.quaternion.premultiply(sourceDelta(a.head,.85));
      for(const side of ['L','R']){
        const upper=b['arm'+side],lower=b['forearm'+side],basis=record['basis'+side];
        upper.quaternion.premultiply(sourceDelta(a['arm'+side],moving?.45:.85));
        // A source forearm points down -Y; the imported arm points sideways ±X.
        // Conjugating through that basis turns elbow flex into bending, rather than forearm twisting.
        tempQ2.copy(basis).multiply(a['forearm'+side].quaternion).multiply(tempQ.copy(basis).invert());
        lower.quaternion.copy(rest['forearm'+side].quaternion).multiply(tempQ2);
      }
      // Performance just moved/rotated the actor root and body. Refresh those ancestors
      // before sampling the skin; updating only visual would read the previous frame.
      a.group.updateMatrixWorld(true);
      if(!seated){
        if(a.microphone?.visible){const target=b.head.localToWorld(new T.Vector3(.065,.065,.19));ikArm(record,'R',target,1);}
        if(active&&/cry|wipe/.test(frame.cue?.action||'')){
          const time=Number(frame.localTime)||0,duration=frame.cue.duration||5,smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
          const amount=smooth((time-.2)/.7)*(1-smooth((time-duration+.7)/.6));
          const wipe=frame.cue.action==='wipe',x=wipe?-.12+.16*smooth((time-.9)/1.5):-.12+Math.sin(time*8)*.012;
          const target=b.head.localToWorld(new T.Vector3(x,wipe?.19:.15,wipe?.13:.15));ikArm(record,'L',target,amount);
        }
        groundAvatar(record);
        if(a.microphone){
          // Right hand is at the end of the extended left-named model arm (+X in bind space).
          tempV.set(.13,0,0);b.forearmR.localToWorld(tempV);a.group.worldToLocal(tempV);a.microphone.position.copy(tempV);
          const mouth=b.head.localToWorld(new T.Vector3(.065,.12,.18));b.forearmR.localToWorld(tempV.set(.13,0,0));mouth.sub(tempV).normalize();a.group.getWorldQuaternion(tempQ);mouth.applyQuaternion(tempQ.invert());a.microphone.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),mouth);
        }
        if(a.tearDrops){tempV.set(0,.17,.01);b.head.localToWorld(tempV);a.group.worldToLocal(tempV);a.tearDrops.position.copy(tempV);b.head.getWorldQuaternion(worldQ);a.group.getWorldQuaternion(tempQ);a.tearDrops.quaternion.copy(tempQ.invert()).multiply(worldQ);}
        if(a.sweatDrop){tempV.set(.15,.22,.16);b.head.localToWorld(tempV);a.group.worldToLocal(tempV);a.sweatDrop.position.copy(tempV);a.sweatDrop.rotation.set(0,0,-.45);}
        if(a.rope){a.rope.position.y=.54;a.rope.scale.set(.9,.68,.9);}
      }
    }
    function placeProp(asset,name,anchor,width,height,depth){
      if(!asset)return;
      const container=new T.Group(),model=asset.scene.clone(true),box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
      model.position.set(-center.x,-box.min.y,-center.z);container.add(model);
      const s=height/Math.max(.001,size.y);container.scale.set(width?width/size.x:s,s,depth?depth/size.z:s);container.position.set(anchor.x,anchor.y||0,anchor.z);container.rotation.y=anchor.rotationY||0;
      prepare(container);venue.movingRoot.add(container);status.props++;return container;
    }
    const loaded=await Promise.all(files.map(async name=>[name,await request(name)])),assets=Object.fromEntries(loaded);
    for(const id of characters)clonedAvatar(venue.actors[id],assets[id],id);
    if(venue.viewer)clonedAvatar(venue.viewer,assets.yunfei,'viewer');
    const audienceAssets=['yunfei','hamster','weijue','xiaoying'];
    for(let i=0;i<(venue.audience||[]).length;i++){const id=audienceAssets[i%audienceAssets.length];clonedAvatar(venue.audience[i],assets[id],id,true);}
    const anchors=venue.furnitureAnchors||{};
    if(assets.chairModernFrameCushion){for(const a of anchors.chairs||[])placeProp(assets.chairModernFrameCushion,'chair',a,1.06,.828,.92);if(venue.chairRoot)venue.chairRoot.visible=false;}
    for(const a of anchors.plants||[])placeProp(assets.pottedPlant,'plant',a,null,1.9);
    for(const a of anchors.tables||[])placeProp(assets.tableRound,'table',a,1.65,.85,1.65);
    for(const x of [-8.3,8.3]){const speaker=placeProp(assets.speaker,'speaker',{x,y:.81,z:-6.3},.76,2.05,.76);if(speaker)meshes(speaker,m=>{m.material=Array.isArray(m.material)?m.material.map(x=>x.clone()):m.material.clone();for(const mat of Array.isArray(m.material)?m.material:[m.material]){mat.color.lerp(new T.Color(0x263440).convertSRGBToLinear(),.82);mat.roughness=.75;}});}
    status.phase=status.characters===4?'ready':'partial';
    return {status,update(dt,frame={}){for(const record of records)pose(record,dt,frame);}};
  }
  global.TheaterModels={load,resolveURL,files};
})(typeof window!=='undefined'?window:globalThis);
