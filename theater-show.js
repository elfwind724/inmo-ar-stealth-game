/* Original, fictional INMO community comedy. The clock is independent of rendering. */
(function (root) {
  'use strict';

  // actor is the performer currently on stage, including during an audience reply.
  // Durations include a little room for the gesture or audience reaction to land.
  const raw = [
    {id:'opening-enter',chapter:'开场 · 影目相聚',speaker:'inmo小影',text:'各位来宾、各位群友，欢迎来到影目！影目发布会，现在开始！',duration:6,actor:'xiaoying',action:'welcome',audience:'clap',sound:'chime'},
    {id:'opening-thanks',chapter:'开场 · 影目相聚',speaker:'inmo小影',text:'特别感谢 INMO AIR3 专属用户群！谢谢你们一路陪伴，还总在群里替我接话。',duration:7,actor:'xiaoying',action:'talk'},
    {id:'opening-cry',chapter:'开场 · 影目相聚',speaker:'inmo小影',text:'看到大家真的坐在这里……我有点感动。等一下，让我擦擦眼泪。',duration:5.5,actor:'xiaoying',action:'cry'},
    {id:'opening-crowd',chapter:'开场 · 影目相聚',speaker:'观众席',text:'别哭了小影！纸巾我们带了，发布会门票可没带退款申请！',duration:4.5,actor:'xiaoying',action:'cry',audience:'laugh'},
    {id:'program-one',chapter:'第一节目 · 云飞的诗',speaker:'inmo小影',text:'今天先给大家安排几个节目。第一位，有请著名 AR 眼镜主播——周云飞！',duration:6,actor:'xiaoying',action:'welcome',audience:'clap'},

    {id:'yunfei-enter',chapter:'第一节目 · 云飞的诗',speaker:'周云飞',text:'谢谢大家，谢谢大家！今天不测续航，不讲参数，我来测一测各位的耐心。',duration:6,actor:'yunfei',action:'enter',audience:'clap'},
    {id:'yunfei-title',chapter:'第一节目 · 云飞的诗',speaker:'周云飞',text:'一首原创诗朗诵，《啊，鼻梁上的远方》，献给影目，也献给我直播间的家人们。',duration:6,actor:'yunfei',action:'recite'},
    {id:'poem-one',chapter:'第一节目 · 云飞的诗',speaker:'周云飞',text:'啊，影目！你是我鼻梁上，永不下班的小月亮！',duration:4.5,actor:'yunfei',action:'recite'},
    {id:'poem-two',chapter:'第一节目 · 云飞的诗',speaker:'周云飞',text:'左边镜腿托住理想，右边镜腿，夹住我昨夜的发量！',duration:5,actor:'yunfei',action:'recite'},
    {id:'poem-three',chapter:'第一节目 · 云飞的诗',speaker:'周云飞',text:'我把思念投向远方，却只想把你，郑重地戴到我脸上！',duration:5,actor:'yunfei',action:'recite'},
    {id:'poem-four',chapter:'第一节目 · 云飞的诗',speaker:'周云飞',text:'若生活给我一个白眼，我就回它，一副好看的镜框！',duration:5,actor:'yunfei',action:'recite'},
    {id:'poem-five',chapter:'第一节目 · 云飞的诗',speaker:'周云飞',text:'别人问我何为浪漫？我说：鼻托不滑，就是心安！',duration:5,actor:'yunfei',action:'recite'},
    {id:'poem-six',chapter:'第一节目 · 云飞的诗',speaker:'周云飞',text:'影目啊影目，今夜我不看星光——我看直播间，谁还没点赞！',duration:6,actor:'yunfei',action:'recite'},
    {id:'poem-heckle',chapter:'第一节目 · 云飞的诗',speaker:'观众席',text:'下去咯！下去咯！这诗念完，镜片都要起鸡皮疙瘩了！',duration:4.5,actor:'yunfei',action:'awkward',audience:'boo'},
    {id:'yunfei-exit',chapter:'第一节目 · 云飞的诗',speaker:'周云飞',text:'行，文化人的事，下次再聊。记得关注啊，各位小卡拉米！',duration:4.5,actor:'yunfei',action:'exit',audience:'boo'},
    {id:'host-save-one',chapter:'第一节目 · 云飞的诗',speaker:'inmo小影',text:'啊哈哈……谢谢云飞。诗有点烫嘴，大家的反应也非常有温度。',duration:5,actor:'xiaoying',action:'awkward'},

    {id:'program-two',chapter:'第二节目 · 仓鼠绝活',speaker:'inmo小影',text:'接下来有请群友小仓鼠！听说他准备了一个，真正有技术含量的绝活。',duration:5.5,actor:'xiaoying',action:'welcome',audience:'clap'},
    {id:'hamster-enter',chapter:'第二节目 · 仓鼠绝活',speaker:'小仓鼠',text:'大、大、大家好。我腿没有抖，是这个舞台……可能开了震动模式。',duration:5.5,actor:'hamster',action:'tremble'},
    {id:'hamster-announce',chapter:'第二节目 · 仓鼠绝活',speaker:'小仓鼠',text:'我给大家表演一个绝活——跳绳！别眨眼，我练了，整整一个午休！',duration:5.5,actor:'hamster',action:'talk'},
    {id:'hamster-rope',chapter:'第二节目 · 仓鼠绝活',speaker:'小仓鼠',text:'一、二、三！看好了，脚步跟上，绳子跟上，我的勇气也跟上！',duration:7,actor:'hamster',action:'rope',audience:'clap'},
    {id:'hamster-trip',chapter:'第二节目 · 仓鼠绝活',speaker:'小仓鼠',text:'四——哎哟！绳子怎么比我还想下班！',duration:3,actor:'hamster',action:'trip',sound:'thud'},
    {id:'hamster-crowd',chapter:'第二节目 · 仓鼠绝活',speaker:'观众席',text:'绝活！别人跳绳，你这是让绳跳人啊！',duration:4,actor:'hamster',action:'fall',audience:'laugh'},
    {id:'hamster-limp',chapter:'第二节目 · 仓鼠绝活',speaker:'小仓鼠',text:'节目到此结束。脚先开了小差，技术今天请假……大家不用送，不用送！',duration:5.5,actor:'hamster',action:'limp'},
    {id:'host-save-two',chapter:'第二节目 · 仓鼠绝活',speaker:'inmo小影',text:'谢谢小仓鼠，至少他证明了：今天的节目，真的没有替身。',duration:4.5,actor:'xiaoying',action:'awkward',audience:'laugh'},

    {id:'program-three',chapter:'第三节目 · 爵爷开麦',speaker:'inmo小影',text:'第三个节目，有请群友韦爵爷！这位看起来，就对自己很有把握。',duration:5.5,actor:'xiaoying',action:'welcome',audience:'clap'},
    {id:'weijue-enter',chapter:'第三节目 · 爵爷开麦',speaker:'韦爵爷',text:'嗯？瞧好吧您！今儿给各位来一段单口相声，掌声先欠着，待会儿一块还！',duration:6,actor:'weijue',action:'enter'},
    {id:'weijue-title',chapter:'第三节目 · 爵爷开麦',speaker:'韦爵爷',text:'列位，段子叫《戴上眼镜，先看脚下》。讲究的就是一个，稳当！',duration:5,actor:'weijue',action:'talk'},
    {id:'weijue-one',chapter:'第三节目 · 爵爷开麦',speaker:'韦爵爷',text:'我一戴影目，就觉得自己特有文化。路过图书馆，我都敢走慢两步。',duration:5.5,actor:'weijue',action:'talk'},
    {id:'weijue-two',chapter:'第三节目 · 爵爷开麦',speaker:'韦爵爷',text:'朋友问：眼镜能让你变聪明吗？我说您先别急，它还在适应我呢！',duration:5.5,actor:'weijue',action:'talk',audience:'laugh'},
    {id:'weijue-three',chapter:'第三节目 · 爵爷开麦',speaker:'韦爵爷',text:'上台前我写了提词，第一行是“自然一点”。好家伙，我把这四个字也给念了！',duration:6,actor:'weijue',action:'talk'},
    {id:'weijue-four',chapter:'第三节目 · 爵爷开麦',speaker:'韦爵爷',text:'第二行写“看向观众”。我一看，全是债主似的眼神：你倒是讲个好笑的呀！',duration:6,actor:'weijue',action:'talk',audience:'laugh'},
    {id:'weijue-five',chapter:'第三节目 · 爵爷开麦',speaker:'韦爵爷',text:'我说这眼镜配我，绝配！一个框架清晰，一个脑子里，框架都还没搭起来！',duration:6,actor:'weijue',action:'talk'},
    {id:'weijue-six',chapter:'第三节目 · 爵爷开麦',speaker:'韦爵爷',text:'小影说发布会要有惊喜。我说简单，您让我讲完，大家还没走，就是最大的惊喜！',duration:6.5,actor:'weijue',action:'talk',audience:'laugh'},
    {id:'weijue-applause',chapter:'第三节目 · 爵爷开麦',speaker:'观众席',text:'哈哈哈哈！爵爷可以！再来一个！',duration:3.5,actor:'weijue',action:'bow',audience:'laugh'},
    {id:'weijue-bow',chapter:'第三节目 · 爵爷开麦',speaker:'韦爵爷',text:'承让，承让！这叫实力。您几位坐着，咱倒着下台，都不带看路的！',duration:5.5,actor:'weijue',action:'backstep',audience:'clap'},
    {id:'weijue-fall',chapter:'第三节目 · 爵爷开麦',speaker:'韦爵爷',text:'哎哟喂！谁把台阶放这儿了！我刚才那段“先看脚下”，白说了！',duration:4.5,actor:'weijue',action:'fall',audience:'laugh',sound:'thud'},
    {id:'weijue-exit',chapter:'第三节目 · 爵爷开麦',speaker:'韦爵爷',text:'嘿，这台阶不讲武德……散场后别走啊，我跟它单独聊聊！',duration:4.5,actor:'weijue',action:'limp',audience:'laugh'},

    {id:'host-wipe',chapter:'终场 · 新品时刻',speaker:'inmo小影',text:'好吧……汗都给我整出来了。感谢爵爷把节目的最后一句，亲自演示了一遍。',duration:6,actor:'xiaoying',action:'wipe'},
    {id:'host-product',chapter:'终场 · 新品时刻',speaker:'inmo小影',text:'大家节目也看够了。接下来，就是我们的新品眼镜登场！',duration:5,actor:'xiaoying',action:'welcome',audience:'clap'},
    {id:'host-suspense',chapter:'终场 · 新品时刻',speaker:'inmo小影',text:'让我们一起倒数！三、二、一……有请——',duration:5,actor:'xiaoying',action:'welcome',sound:'drum'},
    {id:'power-cut',chapter:'终场 · 新品时刻',speaker:'全场',text:'啪！',duration:1,actor:'xiaoying',action:'blackout',blackout:true,sound:'power'},
    {id:'power-dark',chapter:'终场 · 新品时刻',speaker:'观众席',text:'啊？停电了？这新品……有点黑科技啊。',duration:4.5,actor:'xiaoying',action:'blackout',blackout:true,audience:'murmur'},
    {id:'power-back',chapter:'终场 · 新品时刻',speaker:'inmo小影',text:'啊哈哈哈哈！你们被耍了吧！',duration:4,actor:'xiaoying',action:'tease',sound:'chime'},
    {id:'reveal-date',chapter:'终场 · 新品时刻',speaker:'inmo小影',text:'今天是十一月三号！明天十一月四日，上午十一点，才是新品发布会！',duration:7,actor:'xiaoying',action:'tease'},
    {id:'reveal-crowd',chapter:'终场 · 新品时刻',speaker:'观众席',text:'合着我们今天来，给明天的观众把雷都排了？！',duration:4.5,actor:'xiaoying',action:'laugh',audience:'laugh'},
    {id:'final-goodbye',chapter:'终场 · 新品时刻',speaker:'inmo小影',text:'热场成功！新品先保密，大家明儿见！哈哈哈哈哈哈！',duration:6,actor:'xiaoying',action:'laugh',audience:'clap'},
    {id:'final-bow',chapter:'终场 · 新品时刻',speaker:'全体演职人员',text:'感谢 INMO AIR3 专属用户群。今晚的快乐，留给明天的惊喜！',duration:5,actor:'xiaoying',action:'bow',audience:'clap'}
  ];

  let cursor = 0;
  const cues = Object.freeze(raw.map(cue => {
    const result = Object.freeze(Object.assign({start:cursor,end:cursor + cue.duration},cue));
    cursor += cue.duration;
    return result;
  }));
  const totalDuration = cursor;

  function create() {
    const state = {
      phase:'READY',elapsed:0,index:0,localTime:0,cue:cues[0],paused:false,
      totalDuration
    };

    function reset(phase) {
      state.phase=phase;state.elapsed=0;state.index=0;
      state.localTime=0;state.cue=cues[0];state.paused=false;
      return state;
    }

    function start() {
      if (state.phase==='READY' || state.phase==='ENDED') return reset('PLAYING');
      state.paused=false;
      return state;
    }

    function pause(value=true) {
      if (state.phase==='PLAYING') state.paused=Boolean(value);
      return state;
    }

    function advance() {
      if (state.index >= cues.length-1) {
        state.phase='ENDED';state.paused=false;state.elapsed=totalDuration;
        state.localTime=state.cue.duration;
      } else {
        state.index++;
        state.cue=cues[state.index];
        state.localTime=0;state.elapsed=state.cue.start;
      }
    }

    function next() {
      if (state.phase==='PLAYING') advance();
      return state;
    }

    function update(dt) {
      if (state.phase!=='PLAYING' || state.paused || !Number.isFinite(dt) || dt<=0) return state;
      let left=Math.min(dt,totalDuration-state.elapsed);
      // Use a loop so a slow frame can cross several cues without losing time.
      while (left>0 && state.phase==='PLAYING') {
        const remaining=Math.max(0,state.cue.duration-state.localTime);
        if (left + 1e-9 >= remaining) {
          left=Math.max(0,left-remaining);
          advance();
        } else {
          state.localTime+=left;
          state.elapsed=state.cue.start+state.localTime;
          left=0;
        }
      }
      return state;
    }

    return {state,start,pause,update,next,restart:()=>reset('PLAYING')};
  }

  const api=Object.freeze({cues,totalDuration,create});
  root.TheaterShow=api;
  if (typeof module==='object' && module.exports) module.exports=api;
})(typeof window!=='undefined' ? window : globalThis);
