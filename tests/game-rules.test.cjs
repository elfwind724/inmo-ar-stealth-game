const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rules = require('../game-rules.js');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function array(name) {
  const a = html.indexOf('const ' + name + ' = ') + ('const ' + name + ' = ').length;
  return vm.runInNewContext('(' + html.slice(a, html.indexOf('];', a) + 1) + ')');
}
const glasses = array('GLASSES_DATA');
const patrol = array('CLERK_WAYPOINTS');
const boxes = [];
function box(x,z,w,d) { boxes.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2}); }
// Use the actual production layout, including its outdoor furniture and storefront.
for (const m of html.matchAll(/addBoxCollider\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/g)) box(...m.slice(1).map(Number));
for (const m of html.matchAll(/makePlanter\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/g)) { const [x,z,w]=m.slice(1).map(Number); box(x,z,w+.2,1); }
for (const item of glasses) box(item.pos.x,item.pos.z,3.35,1.9);
const door = {minX:-2.9,maxX:.9};
const walk = (x,z) => rules.canWalk(x,z,boxes,door);
const nav = new rules.Navigator(walk);
const start = {x:-1,z:8.8};
function validateRoute(route, from) {
  assert.ok(route?.length, 'route must exist');
  let prev=from;
  for(const point of route){assert.ok(nav.clear(prev,point), 'route must not cut a wall or counter');prev=point;}
}

test('street spawn can reach all six real counters through the entrance', () => {
  assert.ok(walk(start.x,start.z));
  for(const g of glasses) {
    const to={x:g.pos.x,z:g.pos.z+1.75};
    const route=nav.findPath(start,to);
    validateRoute(route,start);
    assert.ok(Math.hypot(route.at(-1).x-to.x,route.at(-1).z-to.z)<.01);
    assert.ok(route.some(p=>p.z<5.45));
  }
});

test('every counter can reach every other counter without clipping displays', () => {
  for(const a of glasses) for(const b of glasses) {
    const from={x:a.pos.x,z:a.pos.z+1.75},to={x:b.pos.x,z:b.pos.z+1.75};
    validateRoute(nav.findPath(from,to),from);
  }
});

test('the complete clerk patrol avoids reception desk and display counters', () => {
  assert.equal(patrol.length,12);
  for(let i=0;i<patrol.length;i++) {
    const a=patrol[i],b=patrol[(i+1)%patrol.length];
    assert.ok(walk(a.x,a.z),'patrol endpoint must be reachable');
    validateRoute(nav.findPath(a,b),a);
  }
});

test('door and cabinet collision use the full player radius', () => {
  assert.equal(walk(-2.8,6),false);
  assert.equal(walk(-1,6),true);
  for(const g of glasses) assert.equal(walk(g.pos.x,g.pos.z),false);
  assert.equal(walk(100,100),false);
});

test('camera detection handles sweep-angle wraparound, cone edge and range', () => {
  assert.equal(rules.inCone(.05,-4,0,0,-Math.PI+.01,5,.2),true);
  assert.equal(rules.inCone(4,0,0,0,0,5,.2),false);
  assert.equal(rules.inCone(0,6,0,0,0,5,.2),false);
  assert.equal(rules.inCone(Math.sin(.2)*4,Math.cos(.2)*4,0,0,0,5,.2),true);
  assert.equal(rules.inCone(0,0,0,0,1,5,.2),true);
});

test('being seen on the completion frame loses before the sixth item can be awarded', () => {
  assert.equal(rules.advanceSteal(.999,.05,1.35,true,false).outcome,'caught');
  assert.equal(rules.advanceSteal(.999,.05,1.35,false,false).outcome,'complete');
  assert.equal(rules.advanceSteal(.5,.05,1.35,false,true).outcome,'cancelled');
  assert.equal(rules.advanceSteal(.5,0,1.35,false,false).progress,.5);
});

test('keyboard up follows the screen and right stays perpendicular as the camera rotates', () => {
  for(const yaw of [-.65,0,.65]) {
    const up=rules.screenMove(0,-1,-14,22,yaw),right=rules.screenMove(1,0,-14,22,yaw);
    assert.ok(Math.abs(Math.hypot(up.x,up.z)-1)<1e-9);
    assert.ok(Math.abs(up.x*right.x+up.z*right.z)<1e-9);
    assert.ok(up.z<0);
  }
});

test('inline scripts compile and static UI references point to unique real elements', () => {
  for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if(m[1].trim()) new vm.Script(m[1]);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size,'duplicate UI IDs');
  for(const m of html.matchAll(/getElementById\('([^']+)'\)/g)) assert.ok(ids.includes(m[1]),'missing UI element '+m[1]);
  assert.equal(/addEventListener\(['"]wheel/.test(html),false,'wheel must never zoom');
});

test('all six published reference prices and score values are in RMB', () => {
  assert.deepEqual(Array.from(glasses,g=>g.priceRmb),[2999,3999,4999,1999,3999,2999]);
  assert.ok(glasses.every(g=>g.displayPrice.startsWith('¥')&&g.scorePoints===g.priceRmb));
  assert.equal(glasses.reduce((n,g)=>n+g.priceRmb,0),20994);
});
