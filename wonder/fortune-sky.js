/* World-space sky for fortune milestones. Terrain and buildings occlude it normally. */
export function initFortuneSky(ctx){
  const {T,scene,camera}=ctx;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const uniforms={
    t:{value:0}, strength:{value:0}, festival:{value:0},
    baseSky:{value:new T.Color('#9ebad0')},
    focus:{value:new T.Vector3(.85,.39,-.27).normalize()}
  };
  const mat=new T.ShaderMaterial({
    uniforms,side:T.BackSide,depthWrite:false,fog:false,
    vertexShader:`
      varying vec3 direction;
      void main(){
        direction=position;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }
    `,
    fragmentShader:`
      varying vec3 direction;
      uniform float t,strength,festival;
      uniform vec3 baseSky,focus;
      const float PI=3.14159265;

      float hash(vec2 p){
        p=fract(p*vec2(123.34,456.21));
        p+=dot(p,p+45.32);
        return fract(p.x*p.y);
      }
      float noise2(vec2 p){
        vec2 i=floor(p),f=fract(p);
        f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
                   mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
      }
      float fbm(vec2 p){
        mat2 turn=mat2(.84,.54,-.54,.84);
        return .53*noise2(p)+.27*noise2(turn*p*2.07)+
          .13*noise2(p*4.25)+.07*noise2(turn*p*8.2);
      }
      float gaussian(float x,float width){
        return exp(-pow(x/width,2.));
      }
      vec3 rainbow(float phase){
        return .53+.47*cos(6.28318*(phase+vec3(.02,.68,.42)));
      }

      vec3 clouds(vec3 d,vec3 sky){
        // Project the cloud field onto a horizontal plane, with a soft horizon.
        float h=max(.12,d.y+.17);
        vec2 p=d.xz/h;
        vec2 wind=vec2(t*.021,-t*.009);
        vec2 q=vec2(p.x*.68,p.y*2.65)+wind;
        float broad=fbm(q*.78+2.6);
        float fold=fbm(q*1.65+vec2(broad*2.5,0.));
        float veil=fbm(q*3.2+vec2(fold, broad)*1.8);
        float strata=cos(q.y*1.52+broad*3.8);
        float bank=smoothstep(.38,.69,broad*.64+fold*.36+strata*.105);
        float thread=smoothstep(.55,.79,veil+strata*.11);
        float filigree=pow(.5+.5*cos(q.y*12.+fold*19.+veil*4.),10.);
        float skyHeight=smoothstep(-.045,.145,d.y);
        float light=pow(max(0.,dot(d,focus)),5.);
        vec3 violet=vec3(.19,.12,.39), jade=vec3(.16,.49,.45);
        vec3 rose=vec3(.87,.27,.33), amber=vec3(1.,.61,.19);
        float ribbon=.5+.5*sin(q.y*.86+fold*5.+q.x*.47-t*.12);
        vec3 dye=mix(violet,jade,smoothstep(.14,.77,ribbon));
        dye=mix(dye,mix(rose,amber,light),fold*.73);
        vec3 pearl=mix(dye,vec3(1.,.79,.56),.52+light*.31);
        float edge=gaussian(bank-.32,.26)*bank;
        vec3 shadow=dye*(.75+veil*.34);
        vec3 cloud=mix(shadow,pearl,clamp(thread*.6+edge*.7,0.,1.));
        sky=mix(sky,cloud,bank*skyHeight*.88);
        sky+=pearl*(thread*(.12+.14*light)+filigree*edge*.35)*skyHeight;
        return sky;
      }

      vec3 halo(vec3 d,vec3 sky){
        float angle=acos(clamp(dot(d,focus),-1.,1.));
        vec3 tangent=normalize(cross(vec3(0.,1.,0.),focus));
        vec3 up=cross(focus,tangent);
        float polar=atan(dot(d,up),dot(d,tangent));
        float reveal=smoothstep(0.,3.0,t);
        float spread=mix(.20,1.,reveal);
        float r=angle/spread;
        float aureole=gaussian(r,.39);
        float rays=pow(.5+.5*cos(polar*36.+.43*sin(polar*11.)-t*.1),6.);
        rays+=.45*pow(.5+.5*cos(polar*17.+.9*sin(polar*4.)+t*.16),3.);
        float broken=.63+.37*fbm(vec2(polar*9.,r*9.5)+vec2(0.,t*.13));
        float fan=rays*broken*exp(-r*1.85)*smoothstep(.055,.25,r);
        float rings=gaussian(r-.31,.016)+.48*gaussian(r-.55,.009)+.34*gaussian(r-.82,.007);
        float bands=smoothstep(.24,.31,r)*(1.-smoothstep(.53,.67,r));
        vec3 spectrum=rainbow(r*3.6+.08);
        sky=mix(sky,spectrum*.77+vec3(.26,.16,.08),bands*(.30+.13*sin(r*77.)));
        sky+=vec3(1.,.63,.23)*(aureole*.36+fan*.91+rings*.23);
        sky+=spectrum*(.18*gaussian(r-.447,.07));
        sky+=vec3(1.,.89,.65)*gaussian(r,.074)*1.02;
        return sky;
      }

      void main(){
        vec3 d=normalize(direction);
        float zenith=smoothstep(-.04,.83,d.y);
        float east=pow(max(0.,dot(d,focus)),2.);
        vec3 goldSky=mix(vec3(.68,.30,.125),vec3(.066,.17,.32),zenith);
        goldSky+=vec3(.35,.21,.09)*east*(1.-zenith*.65);
        vec3 richSky=mix(vec3(.48,.17,.27),vec3(.032,.063,.20),zenith);
        richSky+=vec3(.16,.115,.20)*east*(1.-zenith*.5);
        vec3 ritual=mix(goldSky,richSky,festival);
        if(festival>.5){
          ritual=clouds(d,ritual);
          ritual+=vec3(.45,.28,.13)*pow(max(0.,dot(d,focus)),30.)*.52;
        }else{
          ritual=halo(d,ritual);
          vec2 haze=d.xz/max(.12,d.y+.39);
          ritual+=vec3(.24,.13,.055)*fbm(haze*4.8+vec2(t*.016,0.))*(1.-zenith*.65);
        }
        // Angular grid keeps scattered highlights fixed in the sky as the player turns.
        vec2 coord=vec2(atan(d.z,d.x),asin(clamp(d.y,-1.,1.)))*vec2(39.,47.);
        vec2 cell=floor(coord),uv=fract(coord);
        float n=hash(cell);
        vec2 star=vec2(.22+.52*n,.22+.52*hash(cell+4.2));
        float sparkle=gaussian(length(uv-star),.083)*step(.92,n);
        ritual+=vec3(.98,.65,.30)*sparkle*(.52+.28*sin(n*123.+t*1.7))*smoothstep(.06,.34,d.y);
        vec3 color=mix(baseSky,ritual,strength*smoothstep(-.10,.028,d.y));
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const dome=new T.Mesh(new T.SphereGeometry(365,40,24),mat);
  dome.name='福气天幕';
  dome.frustumCulled=false;
  dome.renderOrder=-90;
  dome.visible=false;
  dome.userData.noPaint=true;
  scene.add(dome);

  let start=0,duration=0,cranesAt=Infinity;
  function play(tier){
    start=performance.now();
    duration=tier===1000?20:15;
    uniforms.festival.value=tier===1000?1:0;
    cranesAt=tier===1000&&!reduced?3.2:Infinity;
    uniforms.strength.value=0;
    dome.visible=true;
    dome.position.copy(camera.position);
  }
  ctx.frames.push(now=>{
    if(!dome.visible)return;
    const age=Math.max(0,(now-start)*.001);
    if(age>=duration){dome.visible=false;return;}
    const ease=T.MathUtils.smoothstep;
    // Briefly hold the reveal and keep animations calmer in reduced-motion mode.
    uniforms.t.value=reduced?3.5:age;
    uniforms.strength.value=ease(age,0,1.8)*(1-ease(age,duration-3,duration));
    if(scene.background?.isColor)uniforms.baseSky.value.copy(scene.background);
    dome.position.copy(camera.position);
    if(age>=cranesAt&&!ctx.stage.inHall()){
      cranesAt=Infinity;
      ctx.stage.showOmen('xianhe');
    }
  });
  return {play};
}
