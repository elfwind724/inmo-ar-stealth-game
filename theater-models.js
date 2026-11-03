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
    function clonedAvatar(actor,asset,id,seated=false){
      if(!actor||!asset)return;
      const model=T.SkeletonUtils.clone(asset.scene),visual=new T.Group();visual.name='kenney-'+id;
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
        groundAvatar(record);
        if(a.microphone){
          // Right hand is at the end of the extended left-named model arm (+X in bind space).
          tempV.set(.13,0,0);b.forearmR.localToWorld(tempV);a.group.worldToLocal(tempV);a.microphone.position.copy(tempV);
          b.forearmR.getWorldQuaternion(worldQ);a.group.getWorldQuaternion(tempQ);a.microphone.quaternion.copy(tempQ.invert()).multiply(worldQ).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI/2));
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
