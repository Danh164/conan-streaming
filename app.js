const API_BASE = String(window.CONAN_API_BASE || '').replace(/\/$/, '');
const apiUrl = path => API_BASE + path;
const $ = id => document.getElementById(id);
let channelId = '', videos = [], cursor = null, currentId = null, ascending = false, lastSaved = 0, changing = false;
const player = $('player');
let lightsOn = false, wideOn = false;
let listRequestVersion = 0, listLoading = false, modalPreviousFocus = null;
const pref = (key, fallback) => { try { return JSON.parse(localStorage.getItem('conan-'+key)) ?? fallback; } catch { return fallback; } };
const store = (key, val) => localStorage.setItem('conan-'+key, JSON.stringify(val));
$('autonext').checked = pref('autonext', true);
$('speed').value = String(pref('speed', 1));
player.playbackRate = Number($('speed').value);

async function api(url, options) { const r = await fetch(apiUrl(url), options); if (!r.ok) { let detail; try { detail = (await r.json()).detail; } catch {} throw Error(detail || `HTTP ${r.status}`); } return r.json(); }
function setStatus(s) { $('status').textContent = s; }
function durationLabel(n) { n = Math.round(n || 0); return n ? `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}` : 'Không rõ thời lượng'; }
async function loadChannels() {
  try { const channels = await api('/api/channels'); $('channel').replaceChildren(new Option('Chọn Channel...', ''));
    channels.forEach(c => $('channel').add(new Option(c.name, c.id)));
    syncModalChannel();
    const prev = localStorage.getItem('conan-channel'); if (channels.some(c => String(c.id) === prev)) { $('channel').value = prev; await selectChannel(); }
  } catch (e) { setStatus((!API_BASE && location.hostname.endsWith('vercel.app') ? 'Chưa cấu hình backend Telegram. Xem README để kết nối API. ' : '') + e.message); $('channel').replaceChildren(new Option('Không thể tải Channel', '')); }
}
async function selectChannel() {
  await saveProgress(); channelId = $('channel').value; localStorage.setItem('conan-channel', channelId);
  ++listRequestVersion; videos = []; cursor = null; currentId = null; player.pause(); player.removeAttribute('src'); player.load(); player.style.display='none'; $('empty').style.display='block'; $('current-title').textContent='Chưa chọn tập';
  render(); if (channelId) await loadMore();
}
async function fetchPage({refresh = false} = {}) {
  if (!channelId || listLoading) return;
  listLoading = true;
  const requestVersion = ++listRequestVersion;
  const requestedChannel = channelId;
  const offset = refresh ? null : cursor;
  $('more').disabled = true;
  $('modal-more').disabled = true;
  setStatus(refresh ? 'Đang làm mới thư viện, phim vẫn tiếp tục phát...' : 'Đang tải danh sách video...');
  try {
    const qs = offset ? `?offset_id=${encodeURIComponent(offset)}` : '';
    const data = await api(`/api/channels/${encodeURIComponent(requestedChannel)}/videos${qs}`);
    if (requestVersion !== listRequestVersion || requestedChannel !== channelId) return;
    const old = refresh ? [] : videos;
    const existing = new Set(old.map(v => v.id));
    videos = [...old, ...data.items.filter(v => !existing.has(v.id))];
    cursor = data.next_offset_id;
    setStatus(currentId ? `Đã cập nhật ${videos.length} video · Đang phát không bị gián đoạn.` : `Đã tải ${videos.length} video. Nhấn Play để xem tập mới nhất.`);
    render();
  } catch(e) { if (requestVersion === listRequestVersion) setStatus(`Lỗi tải danh sách: ${e.message}`); }
  finally { listLoading = false; $('more').disabled = false; $('modal-more').disabled = false; }
}
async function loadMore() { return fetchPage(); }
async function refreshList() { return fetchPage({refresh:true}); }
function newestVideo() { return videos.reduce((best, v) => !best || v.id > best.id ? v : best, null); }
async function playNewest() {
  if (!channelId) return setStatus('Vui lòng chọn Channel trước.');
  if (!videos.length) await loadMore();
  const v = newestVideo();
  if (v) await play(v); else setStatus('Channel chưa có video để phát.');
}
function ordered() { const q = $('search').value.trim().toLowerCase(); return [...videos].sort((a,b)=>ascending ? a.id-b.id : b.id-a.id).filter(v => `${v.title} ${v.filename||''} ${v.id}`.toLowerCase().includes(q)); }
function render() {
  $('count').textContent = `${videos.length} video`; $('more').hidden = !cursor;
  const frag = document.createDocumentFragment(); const list = ordered();
  if (!list.length) { const d=document.createElement('div'); d.className='placeholder'; d.textContent='Chưa có video phù hợp. Thử tải thêm hoặc đổi từ khóa.'; frag.append(d); }
  list.forEach(v => { const b=document.createElement('button'); b.className='episode'+(v.id===currentId?' active':'');
    const n=document.createElement('span'); n.className='num'; n.textContent='▶';
    const meta=document.createElement('span'); meta.className='meta'; const title=document.createElement('span'); title.className='title'; title.textContent=v.title;
    const small=document.createElement('small'); small.textContent=`${durationLabel(v.duration)} · ${(v.size/1048576).toFixed(0)} MB · #${v.id}`;
    meta.append(title,small); b.append(n,meta); b.onclick=()=>play(v); frag.append(b); });
  $('episodes').replaceChildren(frag); $('next').disabled=!currentId; renderModalEpisodes();
}
async function play(v) {
  if (changing) return; changing = true;
  closeEpisodeModal();
  try { await saveProgress(); currentId=v.id; player.pause(); player.src=apiUrl(`/api/channels/${channelId}/videos/${v.id}/stream`);
    player.style.display='block'; $('empty').style.display='none'; player.playbackRate=Number($('speed').value); $('current-title').textContent=v.title; render(); setStatus('Đang tải video từ Telegram...');
    const cid=channelId, mid=v.id; const p=await api(`/api/progress/${cid}/${mid}`);
    player.onloadedmetadata = () => { if (currentId===mid && Number.isFinite(p.seconds) && p.seconds>3 && p.seconds < player.duration-5) player.currentTime=p.seconds; };
    try { await player.play(); setStatus('Đang phát'); } catch { setStatus('Nhấn Play để bắt đầu.'); }
  } catch(e) { setStatus(`Không thể phát: ${e.message}`); } finally { changing=false; }
}
async function saveProgress() {
  if (!channelId || !currentId || !Number.isFinite(player.currentTime)) return;
  try { await api(`/api/progress/${channelId}/${currentId}`, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({seconds:player.currentTime,duration:Number.isFinite(player.duration)?player.duration:0})}); } catch(e) { console.warn('Progress save failed',e); }
}
async function next() { const list=ordered(); const i=list.findIndex(v=>v.id===currentId); if (i>=0 && i<list.length-1) await play(list[i+1]); else setStatus('Đã hết danh sách đang tải. Bạn có thể bấm Tải thêm video.'); }
player.addEventListener('timeupdate',()=>{ if(Date.now()-lastSaved>10000){lastSaved=Date.now();saveProgress();} });
player.addEventListener('pause',saveProgress); player.addEventListener('ended',()=>{ saveProgress(); if ($('autonext').checked) next(); });
player.addEventListener('error',()=>setStatus('Trình duyệt không phát được video này hoặc Telegram bị gián đoạn. Kiểm tra định dạng MP4/H.264/AAC và thử lại.'));
$('channel').onchange=selectChannel; $('more').onclick=loadMore; $('refresh').onclick=refreshList; $('search').oninput=render;
$('sort').onclick=()=>{ascending=!ascending;$('sort').textContent=ascending?'Mới → cũ':'Cũ → mới';render();}; $('next').onclick=next;
function previous(){ const list=ordered(); const i=list.findIndex(v=>v.id===currentId); if(i>0) play(list[i-1]); }
function seekBy(n){ if (player.readyState && Number.isFinite(player.duration)) player.currentTime=Math.max(0,Math.min(player.duration,player.currentTime+n)); }
function toggleLights(){ lightsOn=!lightsOn; document.body.classList.toggle('lights-off',lightsOn); $('lights').querySelector('span').textContent=lightsOn?'Bật đèn':'Tắt đèn'; $('lights').setAttribute('aria-pressed',String(lightsOn)); }
function toggleWide(){ wideOn=!wideOn; document.body.classList.toggle('wide-mode',wideOn); $('wide').querySelector('span').textContent=wideOn?'Thu nhỏ':'Màn hình rộng'; $('wide').setAttribute('aria-pressed',String(wideOn)); store('wide',wideOn); }
$('start-latest').onclick=playNewest;
$('player').addEventListener('play', () => { if (!currentId) playNewest(); });
function syncModalChannel() {
  const select = $('modal-channel');
  select.replaceChildren(...Array.from($('channel').options, o => new Option(o.text, o.value)));
  select.value = channelId;
}
function renderModalEpisodes() {
  const container = $('modal-episodes');
  const q = $('modal-search').value.trim().toLowerCase();
  const list = [...videos].sort((a,b) => ascending ? a.id-b.id : b.id-a.id)
    .filter(v => `${v.title} ${v.filename||''} ${v.id}`.toLowerCase().includes(q));
  $('modal-count').textContent = `${list.length} tập · ${videos.length} video đã tải`;
  $('modal-more').hidden = !cursor;
  const frag = document.createDocumentFragment();
  if (!list.length) { const e=document.createElement('p');e.className='placeholder';e.textContent='Không tìm thấy tập phim phù hợp.';frag.append(e); }
  for (const v of list) {
    const b=document.createElement('button');b.className='modal-episode'+(v.id===currentId?' active':'');
    const icon=document.createElement('span');icon.className='modal-episode-icon';icon.textContent=v.id===currentId?'♫':'▶';
    const info=document.createElement('span');info.className='modal-episode-info';
    const title=document.createElement('strong');title.textContent=v.title;
    const sub=document.createElement('small');sub.textContent=`${durationLabel(v.duration)} · ${(v.size/1048576).toFixed(0)} MB · #${v.id}`;
    info.append(title,sub);b.append(icon,info);b.onclick=()=>play(v);frag.append(b);
  }
  container.replaceChildren(frag);
}
function openEpisodeModal() {
  modalPreviousFocus=document.activeElement;
  syncModalChannel(); $('modal-search').value=$('search').value;
  $('episode-modal').hidden=false;document.body.classList.add('modal-open'); $('episode-picker-top').setAttribute('aria-expanded','true');
  renderModalEpisodes();$('modal-search').focus();
}
function closeEpisodeModal() {
  if ($('episode-modal').hidden) return;
  $('episode-modal').hidden=true;document.body.classList.remove('modal-open'); $('episode-picker-top').setAttribute('aria-expanded','false');
  if (modalPreviousFocus?.isConnected) modalPreviousFocus.focus();
}
$('episode-picker').onclick=openEpisodeModal;
$('episode-picker-top').onclick=openEpisodeModal;
$('episode-modal-close').onclick=closeEpisodeModal;
$('episode-modal-backdrop').onclick=closeEpisodeModal;
$('modal-search').oninput=renderModalEpisodes;
$('modal-refresh').onclick=refreshList;
$('modal-more').onclick=loadMore;
$('modal-sort').onclick=()=>{$('sort').click();$('modal-sort').textContent=$('sort').textContent;};
$('modal-channel').onchange=async()=>{const value=$('modal-channel').value; if (value===channelId)return; $('channel').value=value; await selectChannel();syncModalChannel();};
$('lights').onclick=toggleLights; $('wide').onclick=toggleWide; $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement) await document.exitFullscreen(); else await $('player').requestFullscreen();}catch(e){setStatus('Không thể bật toàn màn hình: '+e.message)}};
$('back10').onclick=()=>seekBy(-10); $('forward10').onclick=()=>seekBy(10); $('prev').onclick=previous;
$('speed').onchange=()=>{player.playbackRate=Number($('speed').value);store('speed',player.playbackRate)};
$('autonext').onchange=()=>store('autonext',$('autonext').checked);
$('pip').onclick=async()=>{try{if(!document.pictureInPictureEnabled || !player.readyState) throw Error('Trình duyệt hoặc video chưa hỗ trợ'); if(document.pictureInPictureElement) await document.exitPictureInPicture(); else await player.requestPictureInPicture();}catch(e){setStatus('Không thể bật cửa sổ nổi: '+e.message)}};
function kEscape(e){if(e.key==='Escape'&&!$('episode-modal').hidden){closeEpisodeModal();e.preventDefault();return true;}if(!$('episode-modal').hidden){if(e.key==='Tab'){const els=[...$('episode-modal').querySelectorAll('button:not([disabled]),input,select')].filter(el=>el.offsetParent!==null);const i=els.indexOf(document.activeElement);if(e.shiftKey&&i===0){els.at(-1).focus();e.preventDefault();}else if(!e.shiftKey&&i===els.length-1){els[0].focus();e.preventDefault();}}return true;}return false;}
document.addEventListener('keydown',e=>{if(kEscape(e))return;const t=e.target;if(t instanceof HTMLElement && (['INPUT','SELECT','TEXTAREA'].includes(t.tagName)||t.isContentEditable)||e.metaKey||e.ctrlKey||e.altKey)return; const k=e.key.toLowerCase(); if(k==='l'){toggleLights();e.preventDefault()}else if(k==='w'){toggleWide();e.preventDefault()}else if(k==='f'){$('fullscreen').click();e.preventDefault()}else if(k==='p'){$('pip').click();e.preventDefault()}else if(k==='arrowleft'){seekBy(-10);e.preventDefault()}else if(k==='arrowright'){seekBy(10);e.preventDefault()}else if(k===' '){if(!currentId){playNewest();e.preventDefault()}else if(player.readyState){player.paused?player.play():player.pause();e.preventDefault()}}});
if(pref('wide',false)) toggleWide();
window.addEventListener('pagehide',()=>{if(channelId&&currentId) navigator.sendBeacon && void saveProgress();});
loadChannels();
