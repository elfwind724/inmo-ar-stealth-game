(function(global){
  'use strict';
  function create({audio,button,canPlay}){
    const preferenceKey='inmo_venue_music_enabled';
    let enabled=true,unlocked=false,blocked=false,failed=false,pending=false,wanted=false;
    try{enabled=localStorage.getItem(preferenceKey)!=='false';}catch{}
    audio.loop=true;audio.volume=.35;
    function render(){
      const waiting=enabled&&(blocked||!unlocked);
      button.textContent=failed?'♫ 重试':!enabled?'♫ 关':waiting?'♫ 播放':'♫ 开';
      button.setAttribute('aria-pressed',String(enabled&&!waiting&&!failed));
      button.setAttribute('aria-label',failed?'会场音乐加载失败，点击重试':!enabled?'开启会场音乐':waiting?'播放会场音乐':'关闭会场音乐');
      button.title=failed?'音乐加载失败，点击重试':!enabled?'会场音乐已关闭':waiting?'点击播放会场音乐':'会场音乐已开启（循环播放）';
    }
    function sync(){
      const next=enabled&&unlocked&&!document.hidden&&canPlay();
      wanted=next;
      if(!next){if(!audio.paused)audio.pause();return;}
      if(pending||blocked||failed||!audio.paused)return;
      pending=true;
      const result=audio.play();
      Promise.resolve(result).then(()=>{
        pending=false;blocked=false;
        if(!wanted)audio.pause();
        render();
      }).catch(error=>{
        pending=false;
        if(error.name==='NotAllowedError')blocked=true;
        else if(error.name!=='AbortError')failed=true;
        render();
      });
    }
    function unlock(event){
      if(event.type==='keydown'&&(event.repeat||event.ctrlKey||event.metaKey||event.altKey))return;
      if(button.contains(event.target))return;
      unlocked=true;blocked=false;render();sync();
    }
    button.addEventListener('click',()=>{
      if(failed){failed=false;audio.load();enabled=true;}
      else if(!enabled||!unlocked||blocked)enabled=true;
      else enabled=false;
      unlocked=true;blocked=false;
      try{localStorage.setItem(preferenceKey,String(enabled));}catch{}
      render();sync();
    });
    audio.addEventListener('error',()=>{failed=true;render();});
    document.addEventListener('pointerdown',unlock,{capture:true,passive:true});
    document.addEventListener('keydown',unlock,{capture:true});
    document.addEventListener('visibilitychange',sync);
    render();
    return {update:sync};
  }
  global.VenueMusic={create};
})(window);
