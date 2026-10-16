/* Local showroom art: recognizable eyewear geometry, studio reflections and product references. */
(function (root) {
  'use strict';
  const products = Object.fromEntries(['air1','air2','air3','go1','go2','go3'].map(code => [code, {
    image: './assets/products/' + code + '.png',
    source: code === 'go3' ? 'https://www.inmo.com/products/inmo-go3' : code === 'air1' ? 'https://www.leiphone.com/category/industrynews/0d1ucsnmAHQrTqtO.html' : 'https://support.inmoxr.com/'
  }]));
  // Explicit paths also let the standalone build embed each original image.
  products.air1.image = './assets/products/air1.png';
  products.air2.image = './assets/products/air2.png';
  products.air3.image = './assets/products/air3.png';
  products.go1.image = './assets/products/go1.png';
  products.go2.image = './assets/products/go2.png';
  products.go3.image = './assets/products/go3.png';

  function roundedPath(T, width, height, radius) {
    const p = new T.Shape(), x = -width/2, y = -height/2, r = Math.min(radius,width/2,height/2);
    p.moveTo(x+r,y); p.lineTo(x+width-r,y); p.quadraticCurveTo(x+width,y,x+width,y+r);
    p.lineTo(x+width,y+height-r); p.quadraticCurveTo(x+width,y+height,x+width-r,y+height);
    p.lineTo(x+r,y+height); p.quadraticCurveTo(x,y+height,x,y+height-r);
    p.lineTo(x,y+r); p.quadraticCurveTo(x,y,x+r,y); p.closePath();
    return p;
  }
  function createGlasses(T, code) {
    const group = new T.Group(); group.name = 'INMO-'+code.toUpperCase();
    const round = code === 'go1', air = code.startsWith('air');
    const params = {
      air1: {width:.70,height:.44,radius:.11,frame:0x17202c,lens:0x203747,opacity:.75,arm:.14},
      air2: {width:.72,height:.48,radius:.14,frame:0x171d24,lens:0x162b36,opacity:.86,arm:.17},
      air3: {width:.73,height:.46,radius:.14,frame:0x151c23,lens:0x80aeb9,opacity:.30,arm:.15},
      go1:  {width:.66,height:.49,radius:.15,frame:0x26313e,lens:0xa2d3dd,opacity:.25,arm:.09},
      go2:  {width:.72,height:.44,radius:.09,frame:0x596973,lens:0xa3c9d3,opacity:.30,arm:.11},
      go3:  {width:.70,height:.49,radius:.19,frame:0x19252b,lens:0xb2d1db,opacity:.25,arm:.10}
    }[code];
    const frameMat = new T.MeshPhysicalMaterial({color:params.frame,roughness:.29,metalness:.18,clearcoat:.6,clearcoatRoughness:.2,envMapIntensity:1.1});
    const armMat = new T.MeshPhysicalMaterial({color:code==='air1'?0x343b46:params.frame,roughness:.34,metalness:.22,clearcoat:.45,envMapIntensity:1.1});
    const lensMat = new T.MeshPhysicalMaterial({color:params.lens,roughness:.055,metalness:.08,transparent:true,opacity:params.opacity,depthWrite:false,side:T.DoubleSide,clearcoat:1,clearcoatRoughness:.06,envMapIntensity:1.45});
    const metal = new T.MeshStandardMaterial({color:0x9daeb9,roughness:.22,metalness:.85});
    const led = new T.MeshBasicMaterial({color:0x64e5fa,toneMapped:false});
    const add = (geo,mat,x,y,z) => {const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=!mat.transparent;m.receiveShadow=true;group.add(m);return m;};
    for (const side of [-1,1]) {
      const outer=roundedPath(T,params.width,params.height,params.radius);
      const hole=roundedPath(T,params.width-.105,params.height-.105,Math.max(.045,params.radius-.05));
      outer.holes.push(hole);
      const frameGeo=new T.ExtrudeGeometry(outer,{depth:.082,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.012,bevelThickness:.012,curveSegments:12});
      add(frameGeo,frameMat,side*.385,.045,.40);
      const lensGeo=new T.ExtrudeGeometry(roundedPath(T,params.width-.11,params.height-.11,Math.max(.04,params.radius-.055)),{depth:.014,bevelEnabled:false,curveSegments:14});
      add(lensGeo,lensMat,side*.385,.045,.438);
      const templePoints=[new T.Vector3(side*.77,.16,.41),new T.Vector3(side*.82,.18,.03),new T.Vector3(side*.84,.16,-.50),new T.Vector3(side*.76,.07,-.91),new T.Vector3(side*.68,.015,-1.02)];
      add(new T.TubeGeometry(new T.CatmullRomCurve3(templePoints),24,.043,8,false),armMat,0,0,0);
      const chip=add(new T.BoxGeometry(.115,params.arm,.62),armMat,side*.80,.16,-.12);
      chip.rotation.y=side*.035;
      add(new T.BoxGeometry(.012,.026,.22),metal,side*.864,.19,-.12);
      const hinge=add(new T.CylinderGeometry(.032,.032,.018,12),metal,side*.755,.17,.493);hinge.rotation.x=Math.PI/2;
      add(new T.BoxGeometry(.018,.016,.07),led,side*.854,.18,.19);
      const nose=add(new T.SphereGeometry(.05,12,8),new T.MeshPhysicalMaterial({color:0xc2d5dc,transparent:true,opacity:.56,roughness:.2}),side*.105,-.15,.405);
      nose.scale.set(.65,1.2,.6);nose.rotation.z=side*.25;
      // A pale reflection ribbon makes the lens plane legible at the game's fixed angle.
      const gleam=add(new T.PlaneGeometry(.055,params.height*.63),new T.MeshBasicMaterial({color:0xc4f4ff,transparent:true,opacity:air?.17:.24,depthWrite:false,toneMapped:false}),side*.385-.12,.065,.459);
      gleam.rotation.z=-.38;
    }
    const bridge=new T.CatmullRomCurve3([new T.Vector3(-.11,.11,.443),new T.Vector3(0,.16,.456),new T.Vector3(.11,.11,.443)]);
    add(new T.TubeGeometry(bridge,16,round?.024:.037,8,false),frameMat,0,0,0);
    if (code === 'air3') {
      const camera=add(new T.CylinderGeometry(.053,.053,.055,16),frameMat,0,.21,.475);camera.rotation.x=Math.PI/2;
      const optic=add(new T.CylinderGeometry(.030,.030,.058,16),new T.MeshPhysicalMaterial({color:0x123e58,metalness:.55,roughness:.08,envMapIntensity:2}),0,.21,.484);optic.rotation.x=Math.PI/2;
    } else if (air || code==='go3') {
      const camera=add(new T.CylinderGeometry(.030,.030,.035,12),metal,-.74,.15,.50);camera.rotation.x=Math.PI/2;
      const pupil=add(new T.CylinderGeometry(.019,.019,.038,12),new T.MeshStandardMaterial({color:0x0a1720,roughness:.1,metalness:.45}),-.74,.15,.503);pupil.rotation.x=Math.PI/2;
    }
    if (code==='air1') add(new T.BoxGeometry(.21,.055,.065),frameMat,.46,.245,.40);
    group.rotation.x=-.38;
    group.scale.setScalar(1.16);
    return group;
  }

  function createStudioEnvironment(T, renderer) {
    const studio = new T.Scene();
    studio.background=new T.Color(0x607588).convertSRGBToLinear();
    const panel=(color,w,h,x,y,z,rx,ry)=>{
      const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(color).convertSRGBToLinear(),side:T.DoubleSide}));
      m.position.set(x,y,z);m.rotation.set(rx,ry,0);studio.add(m);
    };
    panel(0xc5e8f6,14,4,-5,5,0,0,Math.PI/2);
    panel(0xffeed8,12,5,5,4,0,0,-Math.PI/2);
    panel(0xc4d4e4,13,7,0,7,0,Math.PI/2,0);
    panel(0x0a1725,18,12,0,0,-8,0,0);
    const pmrem=new T.PMREMGenerator(renderer);
    const target=pmrem.fromScene(studio,.035,.1,40);
    studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});pmrem.dispose();
    return target.texture;
  }

  function linearizeScene(scene) {
    const materials=new Set();
    scene.traverse(object=>{for(const mat of (Array.isArray(object.material)?object.material:[object.material]))if(mat&&!materials.has(mat)){
      mat.color?.convertSRGBToLinear();mat.emissive?.convertSRGBToLinear();materials.add(mat);
    }});
  }
  root.INMOAssets={products,createGlasses,createStudioEnvironment,linearizeScene};
})(typeof window !== 'undefined' ? window : globalThis);
