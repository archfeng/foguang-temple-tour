import {progress} from './progress.js?v=20261125wishes';
const archive = document.querySelector('#archive');
const photos = [
  {file:'gate', title:'松荫中的山门', caption:'从院内回望山门，松枝掩着灰瓦，远山隐在屋脊之后。', source:'Wutai_Foguang_Si_2013.08.28_10-58-46.jpg'},
  {file:'court', title:'下院的唐代经幢', caption:'唐乾符四年经幢的石刻细部。石缝里的青草和院里的老石板相接。', source:'Wutai_Foguang_Si_2013.08.28_10-55-25.jpg'},
  {file:'hall', title:'东大殿前檐', caption:'朴素的红褐板门、直棂窗与灰瓦。檐影下的斗栱比日照下的门板更深。', source:'佛光寺东殿-流浪的狗狗_-_panoramio_-_aisccd.jpg', author:'aisccd', license:'by'}
];
const photoTabs = archive.querySelector('.photo-tabs[aria-label="选择照片"]');
const film = document.querySelector('#archive-film');
const video = document.querySelector('#history-video');
const chronicle = 'https://www.tup.tsinghua.edu.cn/upload/books/yz/071133-01.pdf';
const report = 'https://m.thepaper.cn/newsDetail_forward_13478440';
const modes = [...document.querySelectorAll('[data-archive-mode]')];
const field = id => document.querySelector('#photo-'+id);
const historyPhotos = [
  {file:'lin.jpg', label:'1937 · 林徽因', title:'林徽因在佛光寺测绘经幢', caption:'1937 年，山西五台山。林徽因与梁思成、莫宗江、纪玉堂同赴佛光寺调查。调查队结合经幢纪年和梁上墨书题记，为东大殿断代至唐大中十一年（857）。', source:'林徽因在五台山佛光寺测绘经幢.jpg', credit:'中国国家图书馆原档'},
  {file:'archive/liang1937.png', label:'1937 · 梁思成', title:'梁思成在佛光寺东大殿内', caption:'从殿内一侧拍摄，可以看到柱列和檐下的木构。', url:chronicle+'#page=36', credit:'清华大学出版社 · 第 36 页'},
  {file:'archive/lin-sculpture.jpg', label:'1937 · 殿内彩塑', title:'林徽因与殿内供养人像', caption:'《梁思成年谱》收录的考察照。书中图注将像标为“功德主”宁公遇。', url:chronicle+'#page=37', credit:'清华大学出版社 · 第 37 页'},
  {file:'archive/inscription.jpg', label:'报告图版 · 梁底题字', title:'佛殿槽内明栿下唐人题字', caption:'营造学社调查报告第十九图，为梁底墨书的记录图版。', url:report, credit:'中国营造学社'},
  {file:'archive/pillar.jpg', label:'报告图版 · 经幢', title:'唐大中十一年幢', caption:'营造学社调查报告第二十图，东大殿前石经幢的测绘图。', url:report, credit:'中国营造学社'},
  {file:'liang.jpg', label:'1930 年代 · 梁思成', title:'梁思成调查蓟县独乐寺', caption:'照片摄于独乐寺，现属天津蓟州。梁思成于 1932 年开展独乐寺调查，随后发表观音阁和山门的测绘研究。这项工作早于营造学社的佛光寺调查。', source:'调查独乐寺时的梁思成.jpg', credit:'摄影者未详'},
  {file:'foguang-1952.png', label:'1952 · 佛光寺', title:'《人民画报》里的佛光寺', caption:'1952 年 1 月刊载的五台山佛光寺照片。可和「今日实景」里的建筑照片对照观看。', source:'195201_五台山佛光寺.png', credit:'《人民画报》1952 年 1 月'}
];
let mode = 'scenes';
const entries = () => mode === 'history' ? historyPhotos : photos;
function showPhoto(i) {
  const historical = mode === 'history';
  const photo = entries()[i];
  field('image').src = 'photos/'+photo.file+(historical?'':'.jpg');
  if(historical){
    const image=field('image');
    const credit=()=>progress.reward('archive-'+photo.file,1);
    if(image.complete&&image.naturalWidth)credit();
    else image.addEventListener('load',()=>{ if(mode==='history'&&image.alt===photo.title)credit(); },{once:true});
  }
  field('image').alt = photo.title;
  field('title').textContent = photo.title;
  field('caption').textContent = photo.caption;
  field('source').href = photo.url ?? 'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(photo.source);
  field('source').textContent = historical ? photo.credit+' · 原图档案' : '摄影：'+(photo.author??'Zhangzhugang');
  field('license').parentElement.classList.toggle('historical-credit', historical);
  field('license').hidden = historical;
  if (!historical) {
    field('license').href = 'https://creativecommons.org/licenses/'+(photo.license??'by-sa')+'/3.0/';
    field('license').textContent = photo.license ? 'CC BY 3.0' : 'CC BY-SA 3.0';
  }
  Array.from(photoTabs.children).forEach((b,j) => b.setAttribute('aria-pressed',String(i===j)));
}
function selectMode(next) {
  mode = next;
  const watching = mode === 'film';
  const historical = mode === 'history';
  if (!watching) video.pause();
  film.hidden = !watching;
  archive.querySelector('figure').hidden = watching;
  photoTabs.hidden = watching;
  modes.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.archiveMode===next)));
  document.querySelector('#archive-kicker').textContent = historical || watching ? '营造学社 · 田野调查' : '五台山 · 现场摄影';
  document.querySelector('#archive-title').textContent = watching ? '一幅壁画，一座唐殿' : historical ? '从独乐寺到佛光寺' : '松荫里的佛光寺';
  document.querySelector('#history-references').hidden = !historical;
  archive.classList.toggle('history-mode',historical);
  if (watching) return;
  photoTabs.replaceChildren(...entries().map((photo,i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.photo = i;
    b.textContent = historical ? photo.label : ['山门','下院经幢','东大殿'][i];
    b.addEventListener('click', () => showPhoto(i));
    return b;
  }));
  showPhoto(0);
}
for (const button of modes) button.addEventListener('click', () => selectMode(button.dataset.archiveMode));
film.querySelectorAll('[data-film-time]').forEach(button => button.addEventListener('click', () => {
  video.currentTime = Number(button.dataset.filmTime);
  video.play().catch(() => {}); // Native controls stay available if autoplay is restricted.
}));
document.querySelector('#film-to-history').addEventListener('click', () => selectMode('history'));
archive.addEventListener('close', () => video.pause());
document.querySelector('#photos').addEventListener('click', () => archive.showModal());
archive.addEventListener('foguang:open-film', () => {
  selectMode('film');
  if (!archive.open) archive.showModal();
});
selectMode('scenes');

video.addEventListener('ended',()=>progress.reward('archive-film',3));
