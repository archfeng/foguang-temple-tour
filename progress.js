const key = 'foguang-merit-v1';
const defaults = { merit:0, fortune:0, incense:1, feed:3, treats:3, grain:3, claims:{} };
let data = {...defaults, claims:{}, wishes:{}};
try {
  const saved = JSON.parse(localStorage.getItem(key));
  for (const name of Object.keys(defaults)) {
    if (name !== 'claims' && Number.isSafeInteger(saved?.[name]) && saved[name] >= 0) data[name] = saved[name];
  }
    if (saved?.wishes && typeof saved.wishes === 'object') data.wishes = saved.wishes;
  if (saved?.claims && typeof saved.claims === 'object') data.claims = saved.claims;
} catch {}
const levels = [
  [0,'入山客',4.2], [3,'松下行者',6], [9,'山寺善客',8.5], [18,'云檐行者',12],
  [100,'好运锦鲤',14], [1000,'气运之子',17]
];
export const progress = {
  data,
  level: () => levels.findLast(([threshold]) => data.fortune >= threshold),
  reward(id, amount, cooldown = Infinity) {
    const last = data.claims[id];
    if (last != null && Date.now()-last < cooldown) return 0;
    data.claims[id] = Date.now();
    progress.add(amount);
    return amount;
  },
  add(amount) { data.merit += amount; progress.save(); },
  spend(amount) {
    if (data.merit < amount) return false;
    data.merit -= amount;
    return true;
  },
  bow() {
    if (!progress.spend(2)) return false;
    const previous = data.fortune++;
    progress.save();
    dispatchEvent(new CustomEvent('foguang:fortune',{detail:{previous,fortune:data.fortune}}));
    return true;
  },
  save() {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
    const label = '功德 '+data.merit;
    const rank = '福气 '+data.fortune+' · '+progress.level()[1];
    const merit = document.querySelector('#merit');
    if (merit) merit.textContent = label;
    document.querySelectorAll('#tour-progress,#roam-progress').forEach(hud => { hud.textContent = label+' ｜ '+rank; });
    if (merit) window.__wonder?.refreshStat?.();
  }
};
progress.save();

export function meditation(place, onFinish) {
  const timer = setTimeout(() => onFinish(progress.reward('sit-'+place,place==='roof'?6:3,60000)),12000);
  return () => clearTimeout(timer);
}
