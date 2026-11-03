/* Authored stage performance. Source pivots also drive optional skinned avatars. */
(function(root){
  'use strict';
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const mix=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
  const progress=(t,a,b)=>smooth((t-a)/Math.max(.001,b-a));
  const pulse=(t,a,b,c,d)=>progress(t,a,b)*(1-progress(t,c,d));
  const angles=(x=0,y=0,z=0)=>[x,y,z];
  const joints=['head','armL','armR','forearmL','forearmR','legL','legR','shinL','shinR'];

  function create({venue}){
    const actors=venue.actors,stageY=venue.stageY??.75,origins=new Map();
    let cueId='';
    const encoreOrigins=new Map();
    const temp=actors.xiaoying.group.position.clone();

    function neutral(a){
      for(const name of joints)a[name]?.rotation.set(0,0,0);
      a.body?.rotation.set(0,0,0);
      if(a.mouth)a.mouth.scale.y=1;
      if(a.tearDrops)a.tearDrops.visible=false;
      if(a.sweatDrop)a.sweatDrop.visible=false;
      if(a.microphone)a.microphone.visible=false;
      if(a.rope){a.rope.visible=false;a.rope.rotation.x=0;}
    }
    function reset(){
      cueId='';origins.clear();encoreOrigins.clear();
      for(const [id,a] of Object.entries(actors)){
        neutral(a);a.group.position.set(-10,stageY,-9);a.group.rotation.set(0,0,0);
        a.group.visible=id==='xiaoying';
        if(id==='xiaoying')a.group.position.set(0,stageY,-8.3);
        a.performance={action:'idle',walking:false,speed:0,grounded:true,beat:0};
      }
    }
    function enterCue(cue){
      cueId=cue.id;
      for(const [id,a] of Object.entries(actors)){
        if(id===cue.actor&&!a.group.visible){a.group.visible=true;a.group.position.set(id==='xiaoying'?-6:-10,stageY,-8.6);a.group.rotation.set(0,0,0);}
        origins.set(id,{x:a.group.position.x,y:a.group.position.y,z:a.group.position.z,rx:a.group.rotation.x,ry:a.group.rotation.y,rz:a.group.rotation.z});
      }
    }
    function setPose(a,p,blend){
      for(const name of joints){
        if(!a[name])continue;const target=p[name]||[0,0,0],r=a[name].rotation;
        r.set(mix(r.x,target[0],blend),mix(r.y,target[1],blend),mix(r.z,target[2],blend));
      }
      if(a.body){a.body.rotation.x=mix(a.body.rotation.x,p.torso||0,blend);a.body.rotation.y=0;a.body.rotation.z=mix(a.body.rotation.z,p.torsoSide||0,blend);}
    }
    function walk(p,t,speed=1,limp=false,backwards=false){
      const step=Math.sin(t*(limp?5.4:7.2)*speed),opposite=Math.sin(t*(limp?5.4:7.2)*speed+Math.PI);
      const swing=backwards?-.37:.37;
      p.legL=angles(step*swing);p.legR=angles(opposite*swing*(limp?.25:1));
      p.shinL=angles(Math.max(0,-step)*.66);p.shinR=angles(limp?.42:Math.max(0,-opposite)*.66);
      p.armL=angles(-step*.28,0,-.08);p.armR=angles(step*.24,0,.08);
      p.forearmL=angles(-.25);p.forearmR=angles(-.3);
      if(limp){p.torsoSide=-.09+step*.055;p.head=angles(.09,0,.06);}
    }
    function salute(p,bow){
      p.armL=angles(-.69,0,.47);p.armR=angles(-.69,0,-.47);
      p.forearmL=angles(-1.45,0,.2);p.forearmR=angles(-1.45,0,-.2);
      p.head=angles(.1+bow*.18);p.torso=bow*.14;
    }
    function lyingPose(p,stage){
      // Palms settle beside the chest rather than hanging through the floor.
      p.armL=angles(-.04,0,-.42);p.armR=angles(-.04,0,.42);
      p.forearmL=angles(.12,0,.2);p.forearmR=angles(.12,0,-.2);
      p.legL=angles(-.10,0,-.05);p.legR=angles(.04,0,.07);
      p.shinL=angles(.17);p.shinR=angles(.36);p.head=angles(-.12,0,-.11);
      if(!stage)p.head=angles(-.1,.12,-.14);
    }
    function surfaceAt(x,z){
      if(Math.abs(x)<9.03&&z>=-12.52&&z<=-5.49)return stageY;
      if(Math.abs(x)<=3.12){
        if(z>=-5.31&&z<-4.81)return .555;
        if(z>=-4.81&&z<-4.33)return .37;
        if(z>=-4.33&&z<-3.85)return .185;
      }
      return .018;
    }
    function guardGround(a){
      // The fallback's geometry bounds are the collision proxy for both avatars.
      // This also prevents a hand/foot catching the stage edge during the tumble.
      const g=a.group;g.updateMatrixWorld(true);let correction=0;
      for(const mesh of a.fallbackMeshes||[]){
        const geo=mesh.geometry;if(!geo)continue;if(!geo.boundingBox)geo.computeBoundingBox();const b=geo.boundingBox;if(!b)continue;
        for(let ix=0;ix<2;ix++)for(let iy=0;iy<2;iy++)for(let iz=0;iz<2;iz++){
          temp.set(ix?b.max.x:b.min.x,iy?b.max.y:b.min.y,iz?b.max.z:b.min.z).applyMatrix4(mesh.matrixWorld);
          correction=Math.max(correction,surfaceAt(temp.x,temp.z)+.018-temp.y);
        }
      }
      if(correction>0){g.position.y+=correction;g.updateMatrixWorld(true);}
    }

    function updateEncore(dt,frame){
      const time=Math.max(0,Number(frame.localTime)||0),cycle=time%16;
      // Keep the curtain-call order: nobody crosses through a neighbour while
      // the two centre performers exchange their earlier speaking positions.
      const order=['yunfei','xiaoying','hamster','weijue'];
      if(cueId!=='encore-dance'){
        cueId='encore-dance';encoreOrigins.clear();
        for(const id of order){
          const a=actors[id],r=a.group.rotation,p={};
          for(const name of joints){const j=a[name]?.rotation;p[name]=j?[j.x,j.y,j.z]:[0,0,0];}
          p.torso=a.body?.rotation.x||0;p.torsoSide=a.body?.rotation.z||0;
          encoreOrigins.set(id,{x:a.group.position.x,y:a.group.position.y,z:a.group.position.z,rx:r.x,ry:r.y,rz:r.z,pose:p});
        }
      }
      const intro=progress(time,0,1.2),tau=Math.PI*2;
      // 120 BPM, four eight-count phrases. Every phrase modifier has zero
      // position and velocity at its endpoints; the base groove repeats too.
      const beat=tau*cycle/.5,groove=tau*cycle/2,slow=tau*cycle/4;
      const section=Math.min(3,Math.floor(cycle/4)),within=cycle-section*4;
      const envelope=Math.sin(Math.PI*within/4)**2;
      for(let i=0;i<order.length;i++){
        const id=order[i],a=actors[id];if(!a)continue;
        const g=a.group,origin=encoreOrigins.get(id),style=[1.0,1.08,.87,1.02][i];
        const direction=i%2?-1:1,sway=Math.sin(groove),accent=Math.sin(groove+Math.PI/2);
        const pulseBeat=(1-Math.cos(beat))*.5;
        const p={
          head:angles(-.035+.035*Math.sin(slow),-.065*sway,-.065*sway),
          armL:angles(-.43-.10*accent,.05,-.27-.075*sway),
          armR:angles(-.43+.10*accent,-.05,.27-.075*sway),
          forearmL:angles(-1.02+.10*Math.sin(groove+.5),.08*Math.sin(groove),-.10),
          forearmR:angles(-1.02+.10*Math.sin(groove+Math.PI+.5),-.08*Math.sin(groove),.10),
          legL:angles(-.06-.04*accent,0,.09+.065*sway),
          legR:angles(-.06+.04*accent,0,-.09+.065*sway),
          shinL:angles(.14+.11*(1-accent)*.5),shinR:angles(.14+.11*(1+accent)*.5),
          torso:.028*Math.sin(groove-Math.PI/3),torsoSide:-.105*sway*style
        };
        let x=-3.3+i*2.2+.135*sway*style,z=-7.8+.045*Math.sin(slow),yaw=.115*Math.sin(groove),roll=.026*sway;
        let y=stageY+.02*pulseBeat;
        if(section===0){
          // Hip figure-eights, a fan of the hands beside the face, then an
          // open-palmed invitation. The torso counter-rotates over the hips.
          p.torsoSide-=envelope*.065*Math.sin(groove+.45)*style;
          p.torso+=envelope*.055*Math.sin(slow);
          p.armL[0]-=envelope*(.50+.20*Math.sin(groove));
          p.armR[0]-=envelope*(.50-.20*Math.sin(groove));
          p.armL[2]-=envelope*.24;p.armR[2]+=envelope*.24;
          p.forearmL[1]+=envelope*.30*Math.sin(groove+.6);
          p.forearmR[1]-=envelope*.30*Math.sin(groove+.6);
          p.forearmL[2]-=envelope*.21*Math.cos(groove);p.forearmR[2]-=envelope*.21*Math.cos(groove);
          yaw+=envelope*.17*Math.sin(slow);
        }else if(section===1){
          // Compact crossing steps: knees soften on the weight shift while
          // the opposite shoulder and hand draw an S-shaped flourish.
          const step=Math.sin(groove),cross=Math.sin(slow);
          x+=envelope*.12*step;z+=envelope*.10*Math.sin(groove-Math.PI/2);
          p.legL[2]+=envelope*.15*cross;p.legR[2]+=envelope*.15*cross;
          p.legL[0]-=envelope*.16*Math.max(0,step);p.legR[0]-=envelope*.16*Math.max(0,-step);
          p.shinL[0]+=envelope*.20*Math.max(0,step);p.shinR[0]+=envelope*.20*Math.max(0,-step);
          p.armL[0]-=envelope*(.35+.30*Math.sin(slow));p.armR[0]-=envelope*(.35-.30*Math.sin(slow));
          p.forearmL[0]-=envelope*.25;p.forearmR[0]-=envelope*.25;
          p.head[1]+=envelope*.17*Math.sin(slow);p.torsoSide+=envelope*.045*Math.sin(groove+.75);
        }else if(section===2){
          // Alternating overhead arcs with elbows and wrists following a
          // delayed wave, plus a small body roll rather than a rigid lean.
          const wave=Math.sin(slow),shoulder=Math.sin(groove-.25);
          p.armL[0]-=envelope*(1.35+.22*wave);p.armR[0]-=envelope*(1.35-.22*wave);
          p.armL[2]-=envelope*.22;p.armR[2]+=envelope*.22;
          p.forearmL[0]+=envelope*.30*Math.sin(slow-.55);p.forearmR[0]-=envelope*.30*Math.sin(slow-.55);
          p.forearmL[2]+=envelope*.22*Math.sin(groove-.6);p.forearmR[2]+=envelope*.22*Math.sin(groove-.6);
          p.head[0]+=envelope*.065*Math.sin(groove+.65);p.torso+=envelope*.075*shoulder;
          yaw+=envelope*.24*wave;
        }else{
          // A full shared turn lands on the beat, followed by a playful
          // shoulder pose. 2π and 0 are the same final orientation, and the
          // turn's easing has zero velocity at that reset point.
          const turn=progress(within,.20,2.25);
          yaw+=within<2.25?tau*turn:0;
          const flourish=pulse(within,.20,.65,1.65,2.35),pose=pulse(within,2.25,2.60,3.30,3.85);
          p.armL[0]-=flourish*.85+pose*.75;p.armR[0]-=flourish*.85;
          p.armL[2]-=flourish*.50;p.armR[2]+=flourish*.50;
          p.forearmL[0]-=pose*.50;p.forearmR[0]-=pose*.42;
          p.head[2]-=pose*.10*direction;p.head[1]+=pose*.18*direction;
          p.torsoSide-=pose*.06*direction;
          p.legL[0]-=pose*.10;p.shinL[0]+=pose*.16;
        }
        // A little individual charm, still on the same count and formation.
        p.head[2]+=.018*direction*Math.sin(slow);
        if(id==='weijue')p.torsoSide*=1.10;
        if(id==='hamster'){p.shinL[0]+=.035*pulseBeat;p.shinR[0]+=.035*pulseBeat;}
        if(id==='xiaoying'){p.forearmL[2]-=.055*Math.sin(groove);p.forearmR[2]+=.055*Math.sin(groove);}
        for(const name of joints)p[name]=p[name].map((value,k)=>mix(origin.pose[name][k],value,intro));
        p.torso=mix(origin.pose.torso,p.torso,intro);p.torsoSide=mix(origin.pose.torsoSide,p.torsoSide,intro);
        g.visible=true;g.position.set(mix(origin.x,x,intro),mix(origin.y,y,intro),mix(origin.z,z,intro));
        g.rotation.set(mix(origin.rx,0,intro),mix(origin.ry,yaw,intro),mix(origin.rz,roll,intro));
        setPose(a,p,1);
        if(a.mouth)a.mouth.scale.y=1.1+.1*pulseBeat;
        for(const prop of [a.microphone,a.tearDrops,a.sweatDrop,a.rope])if(prop)prop.visible=false;
        guardGround(a);
        a.performance={action:'dance',walking:false,speed:0,grounded:true,beat:(cycle%.5)/.5,loopPhase:cycle/16};
      }
    }

    function update(dt,frame={}){
      const cue=frame.cue;if(!cue)return;
      if(frame.phase==='ENCORE'){updateEncore(dt,frame);return;}
      if(frame.phase==='READY'||frame.phase==='ENDED')return;
      const time=Math.max(0,Number(frame.localTime)||0),clock=Number(frame.time)||0;
      const duration=Math.max(1,cue.duration||5),active=cue.actor,action=cue.action||'talk';
      if(cueId!==cue.id)enterCue(cue);
      const finale=cue.id==='final-bow',blend=1-Math.exp(-Math.max(.001,dt)*14);
      for(const [id,a] of Object.entries(actors)){
        const g=a.group,onStage=id===active||finale,origin=origins.get(id)||{x:g.position.x,y:g.position.y,z:g.position.z,rx:0,ry:0,rz:0};
        let tx=id==='xiaoying'?-6:11,tz=id==='xiaoying'?-8.8:-10,ty=stageY,rx=0,ry=0,rz=0;
        const beforeX=g.position.x,beforeZ=g.position.z;
        if(id===active){tx=0;tz=-8.3;}
        if(finale){tx={xiaoying:-1,yunfei:-3.2,hamster:1.2,weijue:3.4}[id]??0;tz=-7.8;g.visible=true;}
        let authoredPosition=false,gettingUp=false;
        // The fallen performer leaves along the floor in front of the stage;
        // he must not pop back up onto the platform when the host takes over.
        const floorExit=!onStage&&id==='weijue'&&origin.y<.65&&origin.z>-5.55;
        if(floorExit){ty=.04;tz=-5.0;}
        if(id===active&&/exit|limp/.test(action)){
          tx=10.5;tz=-6.2;
          if(id==='weijue'&&action==='limp'){tz=-5.0;ty=.04;}
          if(action==='limp'){
            const recover=progress(time,0,1.15);gettingUp=recover<1;
            rx=mix(origin.rx,0,recover);ry=mix(origin.ry,0,recover);
            ty=mix(origin.y,ty,recover);
            if(gettingUp){tx=origin.x;tz=origin.z;}
          }
        }
        if(id===active&&action==='backstep'){
          const travel=progress(time,.95,duration);
          tx=mix(origin.x,3.6,travel);tz=mix(origin.z,-5.58,travel);ty=stageY;
          ry=progress(time,.8,1.8)*Math.PI*.92;authoredPosition=true;
        }
        if(id===active&&id==='weijue'&&action==='fall'){
          const stumble=progress(time,0,.25),drop=progress(time,.22,.95),settle=progress(time,.95,1.3);
          tx=mix(origin.x,3.6,progress(time,0,.7));tz=mix(origin.z,-5.0,progress(time,.05,.85));
          ty=mix(stageY,.22,drop)+Math.sin(drop*Math.PI)*.09;ty=mix(ty,.18,settle);
          rx=mix(.06,1.45,progress(time,.13,1.05));ry=mix(origin.ry,0,progress(time,0,.7));rz=Math.sin(stumble*Math.PI)*-.15;
          authoredPosition=true;
        }
        const distance=Math.hypot(tx-g.position.x,tz-g.position.z),moveSpeed=id===active&&action==='limp'?1.18:3.3;
        const amount=authoredPosition?1:Math.min(1,Math.max(0,dt)*moveSpeed/Math.max(distance,.001));
        g.position.x=mix(g.position.x,tx,amount);g.position.z=mix(g.position.z,tz,amount);
        g.position.y=ty;
        if(!onStage&&!finale&&id!=='xiaoying'&&g.position.x>10)g.visible=false;
        if(!g.visible)continue;
        const moving=Math.hypot(g.position.x-beforeX,g.position.z-beforeZ)>.001;
        const p={head:angles(-.025),armL:angles(-.1,0,-.07),armR:angles(-.86,0,.07),forearmL:angles(-.2),forearmR:angles(-.89),legL:angles(),legR:angles(),shinL:angles(),shinR:angles(),torso:0,torsoSide:0};
        if(moving)walk(p,clock,1,action==='limp'&&onStage,action==='backstep'&&onStage);
        const speaking=onStage&&cue.speaker!=='观众席'&&cue.speaker!=='全场';
        const beat=pulse(time,.08,.4,duration-.7,duration-.1);
        if(onStage){
          // Keep the right-hand microphone near the mouth between rhetorical beats.
          if(!/rope|trip|fall|limp|exit|backstep/.test(action)){p.armR=angles(-.88,0,.02);p.forearmR=angles(-.85);}
          if(action==='welcome'){
            const sweep=pulse(time,.12,1.15,duration-1.05,duration-.15);
            p.armL=angles(mix(-.1,-1.12,sweep),-.1*sweep,mix(-.07,-.9,sweep));p.forearmL=angles(-.25-.32*sweep);
            p.head=angles(-.03,-.12+progress(time,1.4,3.4)*.24,0);p.torso=-.025*sweep;
          }
          if(action==='enter'){
            if(id==='weijue'){
              const question=pulse(time,.1,.3,.65,1.05),confidence=progress(time,1.15,2.05);
              p.head=angles(.07*question-.1*confidence,.19*question,-.15*question);
              p.armL=angles(-.18-.55*confidence,0,-.13-.35*confidence);p.forearmL=angles(-.35-.6*confidence);
              p.torsoSide=-.03*confidence;
            }else{
              const greet=pulse(time,.4,1.05,1.85,2.35),thanks=pulse(time,3.3,3.85,4.5,5.2);
              p.armL=angles(-.2-1.0*greet,0,-.1-.6*greet);p.forearmL=angles(-.3-.4*greet);
              p.head=angles(.13*thanks,.12*greet,0);p.torso=.11*thanks;
            }
          }
          if(action==='exit'){
            const bye=pulse(time,.15,.55,1.25,1.8);
            p.armL=angles(-.2-1.0*bye,0,-.14-.35*bye);p.forearmL=angles(-.25-.4*bye);
            p.head=angles(.04,-.26*bye,-.08*bye);p.torso=.055;
          }
          if(action==='talk'){
            if(id==='xiaoying'&&cue.id==='opening-thanks'){
              const handToHeart=pulse(time,.2,.85,3.8,4.8),openPalm=progress(time,4.4,5.5);
              p.armL=angles(-.38-handToHeart*.25-openPalm*.45,0,-.15-openPalm*.45);p.forearmL=angles(-.3-handToHeart*1.65);
              p.head=angles(.1*pulse(time,.6,1.3,2.6,3.4),-.09*openPalm,0);p.torso=.045*handToHeart;
            }else if(id==='weijue'){
              const aBeat=pulse(time,.25,.62,1.35,1.8),bBeat=pulse(time,duration*.40,duration*.49,duration*.61,duration*.69),punch=pulse(time,duration*.73,duration*.82,duration-.15,duration);
              p.armL=angles(-.22-.75*aBeat-.55*bBeat-.95*punch,-.12*bBeat,-.08-.48*aBeat+.12*bBeat);
              p.forearmL=angles(-.35-.8*aBeat-1.1*bBeat-.4*punch);p.head=angles(-.02-.1*punch,.13*aBeat-.14*bBeat,.045*punch);
              p.torsoSide=-.025*aBeat+.035*bBeat;p.torso=-.035*punch;
            }else{
              const gesture=pulse(time,.3,.8,duration*.58,duration*.8);p.armL=angles(-.15-.55*gesture,0,-.2*gesture);p.forearmL=angles(-.4-.6*gesture);p.head=angles(-.02,.09*gesture);
            }
          }
          if(action==='cry'){
            const hand=progress(time,.25,1.1),dab=pulse(time,1.15,1.4,1.75,2.1)+pulse(time,3.05,3.3,3.65,4.0);
            p.armL=angles(mix(-.1,-1.64,hand),0,mix(-.07,.03,hand)+dab*.10);p.forearmL=angles(mix(-.2,-.85,hand));
            p.head=angles(.13*hand,-.055*hand,-.035*hand);p.torso=.025*hand;
            if(a.tearDrops)a.tearDrops.visible=time>.55;
          }
          if(action==='recite'){
            const line=Number((cue.id.match(/poem-(one|two|three|four|five|six)/)||[])[1]?.replace('one',1).replace('two',2).replace('three',3).replace('four',4).replace('five',5).replace('six',6))||0;
            const lift=pulse(time,.22,1.15,duration-.85,duration-.08);
            const poses=[angles(-.7,0,-.25),angles(-1.55,-.1,-.55),angles(-1.1,0,-1.0),angles(-1.58,-.16,-.2),angles(-1.72,0,.13),angles(-.55,0,.33),angles(-1.7,-.1,-.7)];
            p.armL=poses[line].map((v,i)=>mix(p.armL[i],v,lift));p.forearmL=angles(line===5?-1.75:line===4?-.65:-.34);
            p.head=angles(line===3?.03:-.10*lift,line===6?-.12:0,line===2?-.06:0);p.torso=line===3?.11*lift:-.025*lift;
            if(line===6){p.armR=angles(-1.0-.2*progress(time,2.1,3),0,.1);p.forearmR=angles(-.65);}
          }
          if(action==='awkward'){
            const look=progress(time,.6,1.4)-2*progress(time,2.0,2.9),shrug=pulse(time,1.3,1.8,2.8,3.5);
            p.head=angles(.03,look*.24,-.09);p.armL=angles(-.15-.65*shrug,0,-.32*shrug);p.forearmL=angles(-.35-.9*shrug);
            p.armR[2]=-.08*shrug;p.torsoSide=.025*shrug;
            if(a.sweatDrop)a.sweatDrop.visible=time>.55;
          }
          if(action==='wipe'){
            const hand=pulse(time,.25,.95,2.8,3.6),swipe=progress(time,1.05,2.2);
            p.armL=angles(-.12-1.6*hand,0,hand*mix(-.2,.25,swipe));p.forearmL=angles(-.25-.6*hand);p.head=angles(.08*hand,-.1*hand);p.torso=.025*hand;
            if(a.sweatDrop)a.sweatDrop.visible=time<3.5;
          }
          if(action==='tremble'){
            const settle=progress(time,.5,2.1);p.head=angles(.08,0,-.04);p.legL=angles(-.07,0,Math.sin(time*31)*.038*settle);p.legR=angles(.03,0,-Math.sin(time*29)*.045*settle);p.shinL=angles(.1);p.shinR=angles(.06);
            p.armL=angles(-.08,0,-.08);p.forearmL=angles(-.35);rz=Math.sin(time*28)*.009*settle;
          }
          if(action==='rope'){
            // One airborne interval per complete rope turn. At phase .5 the
            // rope is beneath the shoes, coinciding with maximum clearance.
            const ready=progress(time,0,.65),cycle=Math.max(0,time-.65)/.78,phase=cycle-Math.floor(cycle),flight=clamp((phase-.24)/.50);
            const airborne=phase>=.24&&phase<=.74?Math.sin(flight*Math.PI):0;
            const load=pulse(phase,.01,.12,.23,.30)+pulse(phase,.73,.80,.91,.99);
            g.position.y=stageY+airborne*.31-load*.026;
            p.legL=angles(-.12-.24*load-.16*airborne);p.legR=angles(-.12-.24*load-.16*airborne);
            p.shinL=angles(.20+.48*load+.29*airborne);p.shinR=angles(.20+.48*load+.29*airborne);
            p.armL=angles(-.15,0,-.33);p.armR=angles(-.15,0,.33);p.forearmL=angles(-.50+Math.sin(cycle*Math.PI*2)*.15);p.forearmR=angles(-.50+Math.sin(cycle*Math.PI*2)*.15);
            p.head=angles(.05);p.torso=.03*load;
            if(a.rope){a.rope.visible=ready>.6;a.rope.rotation.x=Math.PI+cycle*Math.PI*2;}
          }
          if(action==='trip'||action==='fall'){
            const hamster=id==='hamster',alreadyDown=hamster&&action==='fall';
            const tumble=alreadyDown?1:progress(time,.16,1.25),brace=alreadyDown?0:pulse(time,.35,.6,.86,1.2);
            const flatten=alreadyDown?1:progress(time,.88,1.25);
            if(hamster){rx=mix(0,1.45,tumble);g.position.y=mix(stageY,.90,tumble)+brace*.18;}
            lyingPose(p,hamster);
            if(!alreadyDown){
              p.armL=angles(mix(-1.8,-.04,flatten),0,mix(-.12,-.42,flatten));p.armR=angles(mix(-1.8,-.04,flatten),0,mix(.12,.42,flatten));
              p.forearmL=angles(mix(-.5,.12,flatten));p.forearmR=angles(mix(-.5,.12,flatten));
              p.head=angles(mix(.1,-.12,flatten));p.legL=angles(-.3*(1-flatten));p.shinR=angles(.9*(1-flatten)+.36*flatten);
            }
            if(a.rope){a.rope.visible=action==='trip'&&time<.6;a.rope.rotation.x=progress(time,0,.6)*Math.PI*.7;}
          }
          if(action==='limp'){
            if(gettingUp){
              const up=progress(time,0,1.15);p.armL=angles(mix(-.04,-.4,up),0,-.35*(1-up));p.armR=angles(-.2,0,.22*(1-up));
              p.forearmL=angles(.15+up*.5);p.forearmR=angles(.15+up*.5);p.legL=angles(-.7*Math.sin(up*Math.PI));p.legR=angles(-.3*Math.sin(up*Math.PI));p.shinL=angles(.9*Math.sin(up*Math.PI));p.shinR=angles(.5*Math.sin(up*Math.PI));p.head=angles(-.1*(1-up));
            }else{walk(p,clock,1,true);g.position.y=ty+Math.max(0,Math.sin(clock*5.4))*.032;}
          }
          if(action==='bow'||finale){
            const bow=pulse(time,.3,1.2,duration-1.0,duration-.1);salute(p,bow);rx=.25*bow;g.position.y=stageY-.025*bow;
          }
          if(action==='backstep'){
            const bow=1-progress(time,.7,1.3);if(time<1.3)salute(p,bow);
            else{walk(p,time,1,false,true);p.armL=angles(-.85,0,.30);p.armR=angles(-.85,0,-.30);p.forearmL=angles(-1.3);p.forearmR=angles(-1.3);p.head=angles(-.07,-.2,0);}
          }
          if(action==='tease'){
            const reveal=pulse(time,.2,.75,duration-.8,duration-.1),point=pulse(time,1.15,1.65,2.8,3.4);
            p.armL=angles(-.3-1.0*reveal-.25*point,-.12*point,-.5*reveal);p.forearmL=angles(-.45+.15*point);p.head=angles(-.02,-.09,-.1*reveal);p.torso=.045*point;
          }
          if(action==='laugh'){
            const chuckle=pulse(time,.22,.35,.44,.62)+pulse(time,.8,.94,1.05,1.23)+pulse(time,1.45,1.6,1.72,1.9);
            p.armL=angles(-.4,0,.25);p.forearmL=angles(-1.8);p.head=angles(-.12-.06*chuckle);p.torso=.045*chuckle;
          }
        }
        if(a.mouth)a.mouth.scale.y=speaking?1+.38*Math.max(0,Math.sin(clock*18))+.22*Math.max(0,Math.sin(clock*27)):1;
        if(a.microphone)a.microphone.visible=onStage&&!/rope|trip|fall|limp|exit|backstep|blackout/.test(action);
        if(a.tearDrops&&action!=='cry')a.tearDrops.visible=false;
        if(a.sweatDrop&&!/wipe|awkward/.test(action))a.sweatDrop.visible=false;
        if(a.rope&&!/rope|trip/.test(action))a.rope.visible=false;
        // Reset hidden inactive props as soon as the speaker changes.
        if(!onStage){if(a.microphone)a.microphone.visible=false;if(a.tearDrops)a.tearDrops.visible=false;if(a.sweatDrop)a.sweatDrop.visible=false;if(a.rope)a.rope.visible=false;}
        setPose(a,p,blend);
        g.rotation.set(rx,ry,rz);
        if(onStage&&/rope|trip|fall|limp/.test(action)||floorExit)guardGround(a);
        a.performance={action:onStage?action:'idle',walking:moving&&!gettingUp,speed:dt>0?Math.hypot(g.position.x-beforeX,g.position.z-beforeZ)/dt:0,grounded:action!=='rope'||Math.abs(g.position.y-stageY)<.08,beat};
      }
    }
    reset();
    return {update,reset};
  }
  const api={create};root.TheaterPerformance=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
