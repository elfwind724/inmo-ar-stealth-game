(function(root){
  'use strict';

  function create({THREE:T,scene,player,venue,camera,toast,sound,canAct}){
    const state={hasKey:false,heardWaiter:false,heardReceptionist:false,inspected:false};
    const group=new T.Group();group.name='launch-key-puzzle';scene.add(group);
    const keyPoint={x:-7.2,z:8.95},keyApproach={x:-6.1,z:9.0};
    const allowed=()=>typeof canAct!=='function'||canAct();
    const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
    const linearMaterial=(hex,extra={})=>{
      const material=new T.MeshStandardMaterial({color:hex,...extra});
      material.color.convertSRGBToLinear();return material;
    };
    const cover=linearMaterial(0x384b4a,{roughness:.83}),paper=linearMaterial(0xc4bba0,{roughness:.94});
    const metal=linearMaterial(0xc5a35a,{roughness:.28,metalness:.8,envMapIntensity:.85,emissive:0x000000});
    let elapsed=0,dialogue=null;
    function box(parent,w,h,d,x,y,z,material){
      const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);
      mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
    }

    // The book sits beside the original check-in tablet. The key peeks out from its edge.
    const bookGroup=new T.Group();bookGroup.name='check-in-guest-register';bookGroup.position.set(keyPoint.x,0,keyPoint.z);group.add(bookGroup);
    box(bookGroup,.70,.035,.55,-.35,1.028,-.04,cover);
    box(bookGroup,.65,.026,.50,-.35,1.057,-.04,paper);
    const pageCanvas=document.createElement('canvas');pageCanvas.width=256;pageCanvas.height=192;
    const page=pageCanvas.getContext('2d');page.fillStyle='#c8bfa7';page.fillRect(0,0,256,192);
    page.fillStyle='#49514b';page.font='bold 27px "Microsoft YaHei",sans-serif';page.textAlign='center';page.fillText('来宾名册',128,44);
    page.strokeStyle='#8e9787';page.lineWidth=2;
    for(let y=70;y<=166;y+=24){page.beginPath();page.moveTo(25,y);page.lineTo(231,y);page.stroke();}
    page.beginPath();page.moveTo(82,62);page.lineTo(82,178);page.stroke();
    const pageMap=new T.CanvasTexture(pageCanvas);pageMap.encoding=T.sRGBEncoding;
    const pageMesh=new T.Mesh(new T.PlaneGeometry(.63,.48),new T.MeshBasicMaterial({map:pageMap,toneMapped:false}));
    pageMesh.rotation.x=-Math.PI/2;pageMesh.position.set(-.35,1.071,-.04);bookGroup.add(pageMesh);

    const keyModel=new T.Group();keyModel.name='display-cabinet-key';keyModel.position.set(.008,1.038,0);bookGroup.add(keyModel);
    const bow=new T.Mesh(new T.TorusGeometry(.066,.014,7,20),metal);bow.rotation.x=-Math.PI/2;keyModel.add(bow);
    box(keyModel,.235,.022,.033,.164,0,0,metal);
    box(keyModel,.033,.022,.082,.245,0,.025,metal);
    box(keyModel,.033,.022,.070,.180,0,.019,metal);
    keyModel.rotation.y=-.10;

    const waiter=venue.people.find(p=>p.role==='waiter');
    const receptionCandidates=venue.people.filter(p=>p.role==='guest'&&p.pos.z>6&&p.look==='checkin');
    const receptionist=receptionCandidates.sort((a,b)=>distance(a.home||a.pos,{x:-6.7,z:10.8})-distance(b.home||b.pos,{x:-6.7,z:10.8}))[0];
    const helpers=[
      ...(receptionist?[{kind:'receptionist',actor:receptionist,label:'和签到接待员交谈',name:'签到接待员'}]:[]),
      ...(waiter?[{kind:'waiter',actor:waiter,label:'和服务员小周交谈',name:'服务员小周'}]:[])
    ];
    const targets=[{kind:'key',group:bookGroup,approach:keyApproach,interactionPoint:keyPoint,range:1.8,label:'查看来宾名册'}];
    for(const helper of helpers){
      const target={kind:helper.kind,group:helper.actor.group,range:2.0,label:helper.label};
      Object.defineProperty(target,'approach',{enumerable:true,get:()=>helper.kind==='receptionist'?{x:helper.actor.pos.x+1.1,z:helper.actor.pos.z-.7}:{x:helper.actor.pos.x+.95,z:helper.actor.pos.z+.50}});
      Object.defineProperty(target,'interactionPoint',{enumerable:true,get:()=>helper.actor.pos});
      targets.push(target);
    }

    const markerCanvas=document.createElement('canvas');markerCanvas.width=96;markerCanvas.height=128;
    const markerCtx=markerCanvas.getContext('2d');
    markerCtx.fillStyle='rgba(25,34,35,.88)';markerCtx.beginPath();markerCtx.arc(48,58,33,0,Math.PI*2);markerCtx.fill();
    markerCtx.strokeStyle='#c6a25f';markerCtx.lineWidth=2;markerCtx.stroke();
    markerCtx.fillStyle='#e8c47b';markerCtx.font='bold 66px Georgia,serif';markerCtx.textAlign='center';markerCtx.textBaseline='middle';markerCtx.fillText('?',48,59);
    const markerMap=new T.CanvasTexture(markerCanvas);markerMap.encoding=T.sRGBEncoding;
    for(const helper of helpers){
      const marker=new T.Sprite(new T.SpriteMaterial({map:markerMap,transparent:true,depthTest:false,toneMapped:false}));
      marker.scale.set(.46,.61,1);marker.renderOrder=12;group.add(marker);helper.marker=marker;
      targets.find(t=>t.kind===helper.kind).marker=marker;
    }

    let bubbleNode=null;
    function ensureBubble(){
      const container=document.getElementById('puzzle-dialogue');if(!container)return null;
      if(!bubbleNode){
        bubbleNode=document.createElement('div');bubbleNode.className='puzzle-npc-bubble';bubbleNode.setAttribute('role','status');
        bubbleNode.style.cssText='position:absolute;max-width:min(260px,calc(100vw - 28px));padding:10px 13px;border:1px solid #d6b57c;border-radius:8px;background:#f3e6cc;color:#392f24;box-shadow:0 5px 18px #0005;font:12px/1.7 "Microsoft YaHei",sans-serif;transform:translate(-50%,-100%);pointer-events:none;';
        bubbleNode.hidden=true;container.appendChild(bubbleNode);
        container.style.position='fixed';container.style.inset='0';container.style.pointerEvents='none';container.style.zIndex='27';
      }
      return bubbleNode;
    }
    function speak(helper,text){
      const node=ensureBubble();
      dialogue={actor:helper?.actor||null,point:helper?null:{x:keyPoint.x,z:keyPoint.z,y:1.72},remaining:4};
      if(node){node.textContent=(helper?helper.name+'：':'')+text;node.hidden=false;}
      if(typeof toast==='function')toast(text,4000);
    }
    function nearbyHint(){
      if(!allowed())return null;
      const key=targets[0];
      if(!state.hasKey&&distance(player.pos,keyPoint)<=key.range)return {label:key.label,kind:key.kind,target:key};
      const near=targets.slice(1).filter(t=>distance(player.pos,t.interactionPoint)<=t.range)
        .sort((a,b)=>distance(player.pos,a.interactionPoint)-distance(player.pos,b.interactionPoint))[0];
      return near?{label:near.label,kind:near.kind,target:near}:null;
    }
    function interact(requested){
      if(!allowed())return false;
      const requestedKind=typeof requested==='string'?requested:requested?.kind;
      const target=requestedKind?targets.find(t=>t.kind===requestedKind):nearbyHint()?.target;
      if(!target||distance(player.pos,target.interactionPoint)>target.range)return false;
      if(target.kind==='key'){
        state.inspected=true;
        if(state.hasKey){speak(null,'名册已经看过了，钥匙在你手里。');return true;}
        state.hasKey=true;keyModel.visible=false;
        speak(null,'名册下面压着一把小钥匙。展柜钥匙已拿到。');
        if(sound?.enabled)sound.playTone(740,'triangle',.12,.045,990);
        return true;
      }
      const helper=helpers.find(h=>h.kind===target.kind);if(!helper)return false;
      if(state.hasKey){speak(helper,'钥匙有了。展柜就在店内主舞台，开柜时可别让人拍到。');}
      else if(target.kind==='waiter'){
        speak(helper,state.heardWaiter?'门外左边是签到台，问问那位接待同事。':'展柜钥匙不在我这，室外签到台的接待员应该知道。');
        state.heardWaiter=true;
      }else{
        speak(helper,state.heardReceptionist?'钥匙和来宾名册放在一起，看看签到台靠门的那一边。':'我刚把钥匙压在来宾名册下面了。看看签到台靠门那边。');
        state.heardReceptionist=true;
      }
      if(sound?.enabled)sound.playTone(430,'sine',.05,.015,510);
      return true;
    }
    function positionBubble(){
      const node=ensureBubble();if(!node||!dialogue)return;
      const anchor=dialogue.actor?{...dialogue.actor.pos,y:2.85}:dialogue.point;
      const projected=new T.Vector3(anchor.x,anchor.y,anchor.z).project(camera);
      const width=window.innerWidth,height=window.innerHeight;
      const x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height;
      node.hidden=!group.visible||projected.z>1||projected.z< -1;
      node.style.left=Math.max(145,Math.min(width-145,x))+'px';
      node.style.top=Math.max(130,Math.min(height-24,y))+'px';
    }
    function update(dt){
      elapsed+=dt;
      keyModel.visible=!state.hasKey;
      metal.emissive.setRGB(.032,.020,.006);metal.emissiveIntensity=state.hasKey?0:.45+Math.sin(elapsed*1.7)*.18;
      for(const helper of helpers){
        helper.marker.position.set(helper.actor.pos.x,2.72+Math.sin(elapsed*2+helper.actor.id)*.035,helper.actor.pos.z);
        helper.marker.material.opacity=state.hasKey?.68:.92;
      }
      if(dialogue){dialogue.remaining-=dt;if(dialogue.remaining<=0){dialogue=null;if(bubbleNode)bubbleNode.hidden=true;}else positionBubble();}
    }
    function reset(){
      Object.assign(state,{hasKey:false,heardWaiter:false,heardReceptionist:false,inspected:false});elapsed=0;dialogue=null;keyModel.visible=true;
      if(bubbleNode)bubbleNode.hidden=true;
      update(0);
    }
    reset();
    return {state,group,targets,keyPoint,keyApproach,update,reset,interact,nearbyHint};
  }
  root.LaunchPuzzle={create};
})(typeof window!=='undefined'?window:globalThis);
