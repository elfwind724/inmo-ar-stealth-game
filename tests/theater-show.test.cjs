const test = require('node:test');
const assert = require('node:assert/strict');
const TheaterShow = require('../theater-show.js');

const clock = show => ({
  phase: show.state.phase,
  elapsed: show.state.elapsed,
  index: show.state.index,
  localTime: show.state.localTime,
  cue: show.state.cue.id,
  paused: show.state.paused
});

test('all three programs precede the blackout and the date reveal', () => {
  const {cues,totalDuration} = TheaterShow;
  assert.equal(cues.length,47);
  assert.equal(new Set(cues.map(cue => cue.id)).size,cues.length);
  const beats = [
    'opening-thanks','opening-cry','program-one','yunfei-enter',
    'poem-one','poem-six','poem-heckle','host-save-one',
    'program-two','hamster-enter','hamster-rope','hamster-trip',
    'hamster-limp','program-three','weijue-enter','weijue-six',
    'weijue-bow','weijue-fall','weijue-exit','host-product',
    'power-cut','power-dark','power-back','reveal-date','final-goodbye','final-bow'
  ];
  const indexes = beats.map(id => cues.findIndex(cue => cue.id===id));
  indexes.forEach((index,position) => {
    assert.ok(index>=0,`missing story beat ${beats[position]}`);
    if (position) assert.ok(index>indexes[position-1],`story beat out of order: ${beats[position]}`);
  });
  assert.match(cues.find(cue => cue.id==='opening-thanks').text,/AIR3 专属用户群/);
  assert.match(cues.find(cue => cue.id==='poem-heckle').text,/下去咯！下去咯/);
  assert.match(cues.find(cue => cue.id==='reveal-date').text,/今天是十一月三号.*明天十一月四日/);
  assert.ok(cues.find(cue => cue.id==='power-cut').blackout);
  assert.ok(cues.find(cue => cue.id==='power-dark').blackout);
  assert.equal(cues.find(cue => cue.id==='power-back').blackout,undefined);
  assert.ok(cues.filter(cue => cue.blackout).reduce((sum,cue) => sum+cue.duration,0)>=4);
  assert.equal(cues.at(-1).end,totalDuration);
  assert.ok(totalDuration>=180 && totalDuration<=270,'keep the performance watchable');
});

test('a slow frame preserves leftover time through multiple cues', () => {
  const show = TheaterShow.create();
  show.start();
  const destination = TheaterShow.cues[8];
  const offset = 2.25;
  show.update(destination.start+offset);
  assert.equal(show.state.cue.id,destination.id);
  assert.equal(show.state.index,8);
  assert.equal(show.state.localTime,offset);
  assert.equal(show.state.elapsed,destination.start+offset);
});

test('pause freezes the show clock, cue, and blackout state until resumed', () => {
  const show = TheaterShow.create();
  show.start();
  show.update(TheaterShow.cues.find(cue => cue.id==='power-dark').start+1);
  show.pause(true);
  const paused = clock(show);
  assert.equal(show.state.cue.blackout,true);
  show.update(120);
  assert.deepEqual(clock(show),paused);
  show.pause(false);
  show.update(1);
  assert.equal(show.state.cue.id,paused.cue);
  assert.equal(show.state.localTime,paused.localTime+1);
  assert.equal(show.state.elapsed,paused.elapsed+1);
});

test('manual next arrives at the same boundary as natural playback', () => {
  const manual = TheaterShow.create();
  const natural = TheaterShow.create();
  manual.start();natural.start();
  for (let i=0;i<TheaterShow.cues.length;i++) {
    const partial = Math.min(.75,manual.state.cue.duration/2);
    manual.update(partial);
    manual.next();
    natural.update(natural.state.cue.duration);
    assert.deepEqual(clock(manual),clock(natural),`boundary after cue ${i}`);
  }
  assert.equal(manual.state.phase,'ENDED');
});

test('an oversized update finishes once and subsequent next or updates are inert', () => {
  const show = TheaterShow.create();
  show.start();
  show.update(1e6);
  assert.equal(show.state.phase,'ENDED');
  assert.equal(show.state.index,TheaterShow.cues.length-1);
  assert.equal(show.state.elapsed,TheaterShow.totalDuration);
  assert.equal(show.state.localTime,show.state.cue.duration);
  const ended = clock(show);
  show.next();show.update(999);show.pause(true);show.next();
  assert.deepEqual(clock(show),ended);
});

test('restart clears late-show and pause state without replacing the state reference', () => {
  const show = TheaterShow.create();
  const state = show.state;
  assert.equal(state.phase,'READY');
  show.update(20);
  assert.equal(state.elapsed,0);
  show.start();show.update(150);show.pause(true);
  show.restart();
  assert.equal(show.state,state);
  assert.deepEqual(clock(show),{
    phase:'PLAYING',elapsed:0,index:0,localTime:0,cue:TheaterShow.cues[0].id,paused:false
  });
  show.update(2);
  show.start();
  assert.equal(state.elapsed,2,'start during playback resumes without rewinding');
  for (const invalid of [NaN,Infinity,-1,0,undefined]) show.update(invalid);
  assert.equal(state.elapsed,2);
});
