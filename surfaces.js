const T = window.THREE;
let state=1703;
const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
const maps=new Map();
export function surface(type){
  if(maps.has(type))return maps.get(type);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d'), pixels=ctx.createImageData(256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const i=(y*256+x)*4;
    const grain=type==='wood'?16*Math.sin(1.2*x+Math.sin(y*.031)*2.2)+9*Math.cos(x*.37+y*.017):0;
    const mineral=13*Math.sin(x*.083+y*.123)*Math.cos(y*.051-x*.036)+7*Math.sin(y*.182+x*.25);
    const tone=213+grain+mineral+(random()-.5)*31;
    pixels.data[i]=tone;pixels.data[i+1]=tone-3;pixels.data[i+2]=tone-7;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  if(type==='stone'){
    for(let i=0;i<110;i++){
      const x=random()*256,y=random()*256,r=1+random()*13;
      const wash=ctx.createRadialGradient(x,y,0,x,y,r);
      wash.addColorStop(0,i%3?'#58604042':'#352e2448');wash.addColorStop(1,'#43392900');
      ctx.fillStyle=wash;ctx.fillRect(x-r,y-r,2*r,2*r);
    }
    for(let i=0;i<10;i++){
      let x=random()*256,y=random()*256;
      ctx.beginPath();ctx.moveTo(x,y);
      for(let k=0;k<4;k++){x+=random()*8-2;y+=random()*7;ctx.lineTo(x,y);}
      ctx.strokeStyle='#50473759';ctx.lineWidth=.45;ctx.stroke();
    }
  }
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
  maps.set(type,map);return map;
}
