(function(root){
  'use strict';
  function create({THREE:T,scene,player,venue,navigate,toast,sound,canAct,onHook}){
    const state={coins:500,hook:1,drink:1,show:1,open:false,cooldown:0};
    const panel=document.getElementById('launch-kit');
    panel.innerHTML=`<button id="kit-toggle" aria-expanded="false"><span>行动道具</span><strong id="kit-coins">500 筹码</strong><span>＋</span></button>
      <div id="kit-content" hidden><p>先找机会，再动手。摄像头始终有效。</p>
      <button data-tool="hook"><b>伸缩钩</b><small>6.2 米内回收样机 · 4.6 秒 · 一次</small><em id="kit-hook">1</em></button>
      <button data-tool="drink"><b>瞌睡汽水</b><small>去饮料台 · 虚构道具 · 安保暂时休息</small><em id="kit-drink">1</em></button>
      <button data-tool="bribe"><b>请服务员帮忙</b><small>找到服务员 · 250 筹码引开安保</small><em>250</em></button>
      <button data-tool="show"><b>舞台应援</b><small>到应援台 · 吸引人群注意表演</small><em id="kit-show">1</em></button>
      <p class="kit-note">瞌睡汽水是纯虚构的游戏道具。</p></div>`;
    const line=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]),new T.LineBasicMaterial({color:0xe9c87e,transparent:true,opacity:.9}));
    line.visible=false;scene.add(line);
    const hook=new T.Mesh(new T.TorusGeometry(.12,.035,6,14,Math.PI*1.5),new T.MeshStandardMaterial({color:0xb6ada0,metalness:.8,roughness:.3}));hook.visible=false;scene.add(hook);
    function render(){
      document.getElementById('kit-coins').textContent=state.coins+' 筹码';
      for(const key of ['hook','drink','show'])document.getElementById('kit-'+key).textContent=state[key];
      for(const btn of panel.querySelectorAll('[data-tool]'))btn.disabled=btn.dataset.tool==='bribe'?state.coins<250||state.cooldown>0:!state[btn.dataset.tool];
    }
    function use(kind){
      if(!canAct())return;sound.init();
      if(kind==='hook'){
        if(!state.hook)return;
        if(onHook()){state.hook--;toast('钩线已抛出 · 保持不动，注意镜头和人群。');render();}return;
      }
      const station=venue.stations[kind==='bribe'?'waiter':kind];
      if(!station){toast('这位工作人员暂时不在这里。');return;}
      if(Math.hypot(player.pos.x-station.x,player.pos.z-station.z)>2.35){
        navigate({x:station.approachX??station.x,z:station.approachZ??station.z+.95},station.name);
        toast('先去'+station.name+'，走近后再点一次道具。');return;
      }
      if(kind==='bribe'){
        if(state.coins<250||state.cooldown>0)return;state.coins-=250;state.cooldown=12;venue.distract('bribe',12);
        toast('服务员收下筹码，带巡场安保去处理舞台事务 · 12 秒');
      } else if(kind==='drink'){
        if(!state.drink)return;state.drink--;venue.distract('drink',16);toast('虚构的瞌睡汽水生效：两位安保暂时休息 · 16 秒');
      } else {
        if(!state.show)return;state.show--;venue.distract('show',7);toast('应援开始！人群转向舞台，镜头仍在扫描 · 7 秒');
      }
      sound.playTone(470,'triangle',.10,.045,690);render();
    }
    document.getElementById('kit-toggle').addEventListener('click',()=>{state.open=!state.open;document.getElementById('kit-content').hidden=!state.open;document.getElementById('kit-toggle').setAttribute('aria-expanded',String(state.open));});
    panel.querySelectorAll('[data-tool]').forEach(btn=>btn.addEventListener('click',()=>use(btn.dataset.tool)));
    function update(dt,target,method){
      if(state.cooldown>0){state.cooldown=Math.max(0,state.cooldown-dt);if(!state.cooldown)render();}
      line.visible=hook.visible=Boolean(target&&method==='hook');if(!line.visible)return;
      const p=player.pos,q=target.data.pos;
      const arr=line.geometry.attributes.position.array;arr.set([p.x,1.4,p.z,q.x,1.75,q.z]);line.geometry.attributes.position.needsUpdate=true;line.geometry.computeBoundingSphere();
      hook.position.set(q.x,1.75,q.z);hook.rotation.z+=dt*2;
    }
    function reset(){Object.assign(state,{coins:500,hook:1,drink:1,show:1,cooldown:0});line.visible=hook.visible=false;render();}
    render();return{state,update,reset};
  }
  root.LaunchTools={create};
})(typeof window!=='undefined'?window:globalThis);
