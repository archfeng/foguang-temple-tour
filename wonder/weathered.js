// Real surface colors are shared across meshes. Existing materials render immediately
// and stay in use if a file fails; the texture request never blocks the loading screen.
import {Q} from '../quality.js?v=20261112h';
const T = window.THREE;
const loader = new T.TextureLoader();
const cache = new Map();
const tracked = new Set();
let mode = 'detail';
/* 三轮P0-3：顾问点名"base color 高频对比再降40~50%，只保留宽色带"。
 * weathered 的 detail 乘性贴图与高对比树皮是底色噪声主源——整体减半，
 * bark 压到 25%、wood 50%、石/砖 45%。tint=原色保留比例，越大越素。
 * 注意：这里用线性插值，比 update() 里的 sRGB 感知 lerp 更保守，
 * 实际降噪幅度会略小于字面值，宁保守勿过灰。 */
const R3_TINT = { wood:.50, bark:.25, tile:.62, stone:.45, brick:.45, plaster:.62, damp:.45, paving:.50 };
const profiles = {
  wood:    { bump: .010, rough: .94, tint: .32 },
  tile:    { bump: .012, rough: .91, tint: .20, repeat: [1.7,1.7] },
  stone:   { bump: .017, rough: .97, tint: .30 },
  brick:   { bump: .014, rough: .97, tint: .30, repeat: [2.0,2.0] },
  plaster: { bump: .009, rough: .99, tint: .22, repeat: [.8,.8] },
  damp:    { bump: .020, rough: .98, tint: .64, source: 'stone' },
  paving:  { bump: .013, rough: .95, tint: .25 },
  bark:    { bump: .016, rough: .97, tint: .18 },
  needles: { bump: 0, rough: .96, tint: .18, repeat: [1.6,1.6] },
  forest:  { bump: 0, rough: 1, tint: 1, repeat: [1,1] }
};
function load(name, kind, repeat) {
  const key = name + '/' + kind;
  if (!cache.has(key)){
    const suffix = kind === 'height' ? '-height' : Q.low ? '-512' : '';
    const url = new URL('../tex/weathered/' + name + suffix + '.webp?v=weathered2', import.meta.url);
    cache.set(key, new Promise(resolve => loader.load(url.href, map => {
      map.wrapS = map.wrapT = T.RepeatWrapping;
      map.repeat.set(...repeat);
      if (kind === 'color') map.colorSpace = T.SRGBColorSpace;
      map.anisotropy = Q.low ? 2 : 8;
      resolve(map);
    }, undefined, () => resolve(null))));
  }
  return cache.get(key);
}
/* 四轮P0-2（顾问）：`最终色 = 基色 × lerp(1.0, 归一化纹理, k)`，k≈0.12~0.20。
 * 用 onBeforeCompile 在 diffuseColor 上直接做线性混合，替代旧的整体乘白：
 * 高频污点被 k 压到 20% 以下，基色本身不再被拉灰。 */
const R3_MIX = { wood:.18, bark:.16, needles:.22, tile:.26, stone:.22, brick:.22,
                 damp:.20, plaster:.24, paving:.24, paint:.26, forest:.30 };
function patchMix(m){
  // 安全护栏：instanceStoneUV 的 customProgramCacheKey 是固定字符串，
  // 若在它之后再追加 patch，两套缓存键会错位复用坏程序（Unexpected token '}'）。
  // 对这类材质跳过混合补丁——石作贴图对比由全局 detailFlat（-45%）兜底。
  if (m.userData.r3Skip) return false;
  const prevKey = m.customProgramCacheKey ? String(m.customProgramCacheKey()) : '';
  if (prevKey === 'weathered-box-v1'){ m.userData.r3Skip = true; return false; }
  const prev = m.onBeforeCompile || null;
  m.userData.r3PatchPrev = prev;
  m.customProgramCacheKey = () => (m.userData.weathered || '') + '-mix2' + (prevKey || '');
  m.onBeforeCompile = shader => {
    if (m.userData.r3PatchPrev) m.userData.r3PatchPrev(shader);   // 保留既有 patch
    shader.uniforms.r3Mix = m.userData.r3Mix;
    shader.fragmentShader = 'uniform float r3Mix;\n' + shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 r3t = texture2D( map, vMapUv );
        diffuseColor.rgb *= mix( vec3(1.0), max(r3t.rgb, vec3(0.05)), r3Mix );
      #endif`);
  };
  return true;
}
function update(record){
  const {m, p, original} = record;
  const show = mode !== 'off' && record.map;
  m.map = show ? record.map : original.map;
  m.bumpMap = show ? record.bump : original.bumpMap;
  m.bumpScale = show ? p.bump : original.bumpScale;
  m.roughness = show ? p.rough : original.roughness;
  if (record.worldUV) record.worldUV.value = show ? 1 : 0;
  // 四轮P0-2：基色一律用**原始色**——旧代码把基色向白 lerp，再乘上半透明
  // 乘性彩图，结果整体发灰、高频污点对比还留着（顾问："把贴图乘暗不等于降噪"）。
  const original0 = original.color;
  m.color.copy(original0);
  if (show){
    // detail 模式：贴图存在感压到 ~18%（乘性混合等效量级，顾问 0.12~0.20 档），
    // 变化由 shader 里的 r3Mix 线性混合完成；基色保持原色，不再拉白。
    const mixK = R3_MIX[record.name] ?? .22;
    if (!record.r3checked){
      record.r3checked = true;
      record.r3patched = !m.userData.r3Skip && patchMix(m);
    }
    if (record.r3patched){
      m.userData.r3Mix = m.userData.r3Mix || { value: mixK };
      m.userData.r3Mix.value = mode === 'color' ? Math.min(1, mixK * 2.6) : mixK;
    }
  } else if (m.userData.r3Mix) {
    m.userData.r3Mix.value = 0;
  }
  // color 模式沿用旧 tint 保留逻辑（原彩视图，允许更浓）
  if (show && mode === 'color') m.color.lerp(new T.Color(0xffffff), 1 - p.tint * .35);
  m.needsUpdate = true;
}
export function setWeatheredMode(next){
  mode = next;
  for (const record of tracked) update(record);
}
// Instanced boxes share one geometry. Size their stone grain in meters on each face
// without splitting the batch or stretching a texture from the stair to the plinth.
function instanceStoneUV(m){
  const enabled = {value:0};
  m.customProgramCacheKey = () => 'weathered-box-v1';
  m.onBeforeCompile = shader => {
    shader.uniforms.weatheredWorldUV = enabled;
    shader.vertexShader = 'uniform float weatheredWorldUV;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_INSTANCING
        vec3 dimensions = vec3(length(instanceMatrix[0].xyz),
          length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec3 face = abs(normal);
        vec2 spans = face.x > .5 ? dimensions.zy :
          (face.y > .5 ? dimensions.xz : dimensions.xy);
        vec3 seed = instanceMatrix[3].xyz;
        vec2 drift = fract(vec2(dot(seed, vec3(.47,.31,.17)),dot(seed,vec3(.29,.53,.43))));
        vec2 surfaceUV = uv * max(spans * 1.16, vec2(.13)) + drift;
        #ifdef USE_MAP
          vMapUv = mix(vMapUv, (mapTransform * vec3(surfaceUV,1.)).xy, weatheredWorldUV);
        #endif
        #ifdef USE_BUMPMAP
          vBumpMapUv = mix(vBumpMapUv, (bumpMapTransform * vec3(surfaceUV,1.)).xy, weatheredWorldUV);
        #endif
      #endif
    `);
  };
  return enabled;
}
export function weathered(m, name, instanceBox = false){
  const p = profiles[name];
  if (!p) return m;
  m.userData.weathered = name;
  const original = {map:m.map, bumpMap:m.bumpMap, bumpScale:m.bumpScale,
    roughness:m.roughness, color:m.color.clone()};
  const worldUV = instanceBox && ['stone','paving','brick','plaster','damp'].includes(name) ? instanceStoneUV(m) : null;
  const record = {m, name, p, original, map:null, bump:null, worldUV};
  tracked.add(record);
  const repeat = p.repeat || [1,1];
  load(p.source || name, 'color', repeat).then(map => {record.map=map; if(map)update(record);});
  if (p.bump && !Q.low) load(p.source || name,'height',repeat).then(bump => {
    record.bump=bump; if(bump && record.map)update(record);
  });
  return m;
}

export function loadPineSprays(mesh){
  const size = Q.low ? 256 : 512;
  const url = new URL('../tex/weathered/pine-spray-' + size + '.webp?v=weathered2',import.meta.url);
  loader.load(url.href, map => {
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = Q.low ? 2 : 4;
    mesh.material.map = map;
    mesh.material.emissiveMap = map;
    mesh.material.needsUpdate = true;
    mesh.visible = true;
  },undefined,()=>{ /* Solid foliage remains visible if the extra texture is unavailable. */ });
}
