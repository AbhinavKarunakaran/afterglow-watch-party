const socket = io();
const $ = id => document.getElementById(id);
const movies = [
  {title:"Big Buck Bunny",genre:"Animation",mood:"Feel-good · Short film",videoId:"aqz-KE-bpKQ",poster:1},
  {title:"Sintel",genre:"Adventure",mood:"Fantasy · Adventure",videoId:"eRsGyueVLvQ",poster:2},
  {title:"Tears of Steel",genre:"Sci-Fi",mood:"Sci-fi · Action",videoId:"R6MlUcmOul8",poster:3},
  {title:"Elephants Dream",genre:"Drama",mood:"Surreal · Art film",videoId:"TLkA0RELQ1g",poster:4},
  {title:"Cosmos Laundromat",genre:"Comedy",mood:"Quirky · Comedy",videoId:"Y-rmzh0PI3c",poster:5},
  {title:"Spring",genre:"Drama",mood:"Fantasy · Romance",videoId:"WhWc3b3KhnY",poster:6},
  {title:"Agent 327",genre:"Comedy",mood:"Comedy · Spy",videoId:"mN0zPOpADL4",poster:7},
  {title:"The OceanMaker",genre:"Adventure",mood:"Adventure · Short film",videoId:"u3z7xQ1f3o0",poster:8}
];
let myName = "Guest", roomCode = null, state = null, isHost = false;
let player = null, playerReady = false, pendingSeek = null, lastSyncAt = 0;
let fakePosition = 0, fakeDuration = 600, fakePlaying = false, clockTimer = null;

function toast(message) { const t=$("toast"); t.textContent=message; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2400); }
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function formatTime(seconds) { if(!Number.isFinite(seconds)||seconds<0) seconds=0; return `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(Math.floor(seconds%60)).padStart(2,"0")}`; }
function currentPosition() {
  if (playerReady && player && typeof player.getCurrentTime==="function") { try { return player.getCurrentTime() || 0; } catch(e) {} }
  return fakePosition;
}
function loadVideo(videoId, title, startAt=0, autoplay=false) {
  $("now-title").textContent = title || "Shared video";
  const frame = $("video-frame");
  frame.innerHTML = `<iframe id="yt-player" title="Shared video player" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?enablejsapi=1&autoplay=${autoplay?1:0}&start=${Math.floor(startAt)}&controls=0&rel=0&origin=${encodeURIComponent(location.origin)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  playerReady = false; player = null; fakePosition = startAt; fakePlaying = autoplay;
  // YouTube IFrame API gives real playback control where the selected video permits embedding.
  if (!window.YT) {
    const script=document.createElement("script"); script.src="https://www.youtube.com/iframe_api"; document.head.appendChild(script);
  }
  window.onYouTubeIframeAPIReady = () => initYT(videoId, startAt, autoplay);
  if (window.YT && window.YT.Player) initYT(videoId, startAt, autoplay);
}
function initYT(videoId, startAt, autoplay) {
  const el=$("yt-player"); if(!el || !window.YT || !YT.Player) return;
  try {
    player = new YT.Player("yt-player", {events:{
      onReady: e => { playerReady=true; if(startAt>0)e.target.seekTo(startAt,true); if(autoplay)e.target.playVideo(); },
      onStateChange: e => {
        if(e.data===YT.PlayerState.PLAYING) fakePlaying=true;
        if(e.data===YT.PlayerState.PAUSED || e.data===YT.PlayerState.ENDED) fakePlaying=false;
      },
      onError: () => toast("This video may not allow embedding. Try another pick.")
    }});
  } catch(e) { /* The iframe remains usable even if the API is unavailable. */ }
}
function renderMovies() {
  const query=$("movie-search").value.trim().toLowerCase(), genre=$("genre-filter").value;
  const filtered=movies.filter(m=>(genre==="All"||m.genre===genre)&&`${m.title} ${m.genre} ${m.mood}`.toLowerCase().includes(query));
  $("movie-grid").innerHTML=filtered.map(m=>`<article class="movie-card"><div class="poster poster-${m.poster}"><span>${escapeHTML(m.title)}</span></div><div class="movie-info"><h4 title="${escapeHTML(m.title)}">${escapeHTML(m.title)}</h4><div class="movie-meta">${escapeHTML(m.mood)}</div><button class="add-queue" data-add="${escapeHTML(m.title)}">＋ Add to queue</button></div></article>`).join("") || '<div class="empty-state">No matches yet. Try another search or mood.</div>';
  document.querySelectorAll("[data-add]").forEach(b=>b.addEventListener("click",()=>{const m=movies.find(x=>x.title===b.dataset.add);if(m)socket.emit("playlist:add",{title:m.title,videoId:m.videoId});toast("Added to the shared queue ✨");}));
}
function renderMembers() {
  if(!state)return;
  $("people-count").textContent=state.members.length;
  $("member-list").innerHTML=state.members.map(m=>`<div class="member"><div class="avatar">${escapeHTML(m.name.slice(0,1).toUpperCase())}</div><span class="member-name">${escapeHTML(m.name)}${m.id===socket.id?" (you)":""}</span>${m.id===state.hostId?'<span class="member-tag">HOST ✦</span>':""}</div>`).join("");
  isHost=state.hostId===socket.id;
  $("host-label").textContent=isHost?"YOU'RE THE HOST":"HOST CONTROLS PLAYBACK";
  $("play-pause").disabled=!isHost;$("back-10").disabled=!isHost;$("forward-10").disabled=!isHost;
  $("play-pause").style.opacity=isHost?"1":".55";
}
function renderPlaylist() {
  if(!state)return;
  $("queue-count").textContent=state.playlist.length;
  $("playlist").innerHTML=state.playlist.length?state.playlist.map(item=>`<div class="queue-item"><div class="queue-thumb">▶</div><div class="queue-details"><strong>${escapeHTML(item.title)}</strong><span>Added by ${escapeHTML(item.addedBy)}</span></div>${isHost?`<button class="queue-play" data-play="${item.id}">Play next</button>`:""}</div>`).join(""):'<div class="empty-state">Your queue is a blank canvas. Add a movie above ✨</div>';
  document.querySelectorAll("[data-play]").forEach(b=>b.addEventListener("click",()=>socket.emit("playlist:play",{id:b.dataset.play})));
}
function renderPolls() {
  if(!state)return;
  $("poll-list").innerHTML=state.polls.length?state.polls.slice().reverse().map(p=>{
    const total=p.options.reduce((n,o)=>n+o.votes.length,0);
    return `<div class="poll"><div class="poll-question">${escapeHTML(p.question)}</div>${p.options.map(o=>`<button class="poll-choice" data-vote="${p.id}" data-option="${o.id}">${escapeHTML(o.label)}<span>${o.votes.length}</span></button><div class="poll-bar"><div style="width:${total?o.votes.length/total*100:0}%"></div></div>`).join("")}<div class="muted small" style="margin-top:8px">${total} vote${total===1?"":"s"} · by ${escapeHTML(p.createdBy)}</div></div>`;
  }).join(""):'<p class="empty-poll">Settle the eternal question: what next?</p>';
  document.querySelectorAll("[data-vote]").forEach(b=>b.addEventListener("click",()=>socket.emit("poll:vote",{pollId:b.dataset.vote,optionId:b.dataset.option})));
}
function renderMessages(messages) {
  $("chat-messages").innerHTML=messages.map(m=>m.type==="system"?`<div class="system-message">${escapeHTML(m.text)}</div>`:`<div class="chat-message"><div class="message-meta">${escapeHTML(m.name)} · ${new Date(m.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div><div class="message-text">${escapeHTML(m.text)}</div></div>`).join("")||'<div class="chat-welcome">Welcome in! Drop a hello or a hot take. 🍿</div>';
  $("chat-messages").scrollTop=$("chat-messages").scrollHeight;
}
function renderState() { if(!state)return; renderMembers();renderPlaylist();renderPolls();renderMessages((state.messages||[]).map(m=>({...m,type:"chat"}))); }
function enterParty(code, roomState) {
  roomCode=code;state=roomState;
  $("lobby").classList.add("hidden");$("party").classList.remove("hidden");$("copy-invite").hidden=false;
  $("code-display").textContent=code;$("room-title").textContent="Movie night is on";$("connection-label").textContent="You're in the room";
  renderState();
  if(state.playback) { $("now-title").textContent=state.playback.title;loadVideo(state.playback.videoId,state.playback.title,state.playback.position,state.playback.playing); }
  if(!clockTimer) clockTimer=setInterval(updateClock,500);
}
function joinByCode(code) {
  socket.emit("room:join",{code,name:myName},res=>{if(!res?.ok){$("lobby-error").textContent=res?.error||"Could not join room.";return;}$("lobby-error").textContent="";enterParty(res.code,res.state);});
}
$("create-room").addEventListener("click",()=>{myName=$("display-name").value.trim()||"Guest";socket.emit("room:create",{name:myName},res=>{if(res?.ok)enterParty(res.code,res.state);});});
$("join-room").addEventListener("click",()=>{myName=$("display-name").value.trim()||"Guest";const code=$("room-code").value.trim();if(!code){$("lobby-error").textContent="Enter the room code your friend shared.";return;}joinByCode(code);});
$("room-code").addEventListener("keydown",e=>{if(e.key==="Enter")$("join-room").click();});
$("movie-search").addEventListener("input",renderMovies);$("genre-filter").addEventListener("change",renderMovies);
$("copy-code").addEventListener("click",()=>copyText(roomCode));
$("copy-invite").addEventListener("click",()=>copyText(`${location.origin}/?room=${roomCode}`));
async function copyText(value){try{await navigator.clipboard.writeText(value);toast("Copied! Send it to your crew.");}catch(e){toast("Room code: "+value);}}
$("play-pause").addEventListener("click",()=>{if(!isHost)return;const pos=currentPosition();const action=fakePlaying?"pause":"play";socket.emit("playback:command",{action,position:pos});});
$("back-10").addEventListener("click",()=>{if(isHost)socket.emit("playback:command",{action:"seek",position:Math.max(0,currentPosition()-10)});});
$("forward-10").addEventListener("click",()=>{if(isHost)socket.emit("playback:command",{action:"seek",position:currentPosition()+10});});
function applyPlayback(p) {
  if(!p)return;
  const target=p.position||0, drift=Math.abs(currentPosition()-target);
  if(p.action==="video" || !$("yt-player")) { loadVideo(p.videoId,p.title,target,p.playing);return; }
  $("now-title").textContent=p.title||$("now-title").textContent;
  if(playerReady && player) {
    try {
      if(drift>.5 && Date.now()-lastSyncAt>800) { player.seekTo(target,true);lastSyncAt=Date.now(); }
      if(p.playing && player.getPlayerState()!==YT.PlayerState.PLAYING)player.playVideo();
      if(!p.playing && player.getPlayerState()!==YT.PlayerState.PAUSED)player.pauseVideo();
    } catch(e) {}
  } else { fakePosition=target;fakePlaying=p.playing; }
}
function updateClock() {
  if(fakePlaying)fakePosition+=.5;
  const pos=currentPosition();$("current-time").textContent=formatTime(pos);
  if(playerReady&&player){try{const d=player.getDuration();if(d>0){fakeDuration=d;$("duration-time").textContent=formatTime(d);$("timeline-fill").style.width=`${Math.min(100,pos/d*100)}%`;}}catch(e){}}
  else {$("duration-time").textContent="--:--";$("timeline-fill").style.width=`${Math.min(100,pos/fakeDuration*100)}%`;}
  $("play-pause").textContent=fakePlaying?"Ⅱ":"▶";
}
$("chat-form").addEventListener("submit",e=>{e.preventDefault();const input=$("chat-input");if(input.value.trim())socket.emit("chat:send",{text:input.value});input.value="";});
document.querySelectorAll("[data-emoji]").forEach(b=>b.addEventListener("click",()=>socket.emit("reaction:send",{emoji:b.dataset.emoji})));
socket.on("room:state",s=>{if(roomCode!==s.code)return;state=s;renderState();});
socket.on("playback:update",p=>{applyPlayback(p);fakePlaying=!!p.playing;if(Number.isFinite(p.position))fakePosition=p.position;});
socket.on("chat:message",m=>{if(!state)return;state.messages.push(m);state.messages=state.messages.slice(-60);renderMessages(state.messages);});
socket.on("chat:system",m=>{if(!state)return;state.messages.push({...m,type:"system"});state.messages=state.messages.slice(-60);renderMessages(state.messages);});
socket.on("reaction:new",r=>{const el=document.createElement("span");el.className="floating-emoji";el.textContent=r.emoji;$("reaction-float").appendChild(el);setTimeout(()=>el.remove(),2400);});
socket.on("app:notice",toast);
socket.on("connect",()=>{$("connection-label").textContent=roomCode?"Reconnected":"Ready for movie night";if(roomCode&&state)joinByCode(roomCode);});
socket.on("disconnect",()=>{$("connection-label").textContent="Reconnecting…";toast("Connection lost. Trying to reconnect…");});
$("transfer-host").addEventListener("click",()=>{if(!isHost){toast("Only the host can transfer the role.");return;}const others=state.members.filter(m=>m.id!==socket.id);if(!others.length){toast("Invite a friend first.");return;}const choice=prompt("Transfer host role to which participant?\n"+others.map((m,i)=>`${i+1}. ${m.name}`).join("\n")+"\nEnter their number:");const member=others[Number(choice)-1];if(member)socket.emit("host:transfer",{memberId:member.id});});
$("new-poll").addEventListener("click",()=>{if(!$("poll-dialog").showModal){toast("Your browser doesn't support polls.");return;}$("poll-dialog").showModal();});
$("poll-form").addEventListener("submit",e=>{e.preventDefault();const inputs=[...document.querySelectorAll(".poll-option")];socket.emit("poll:create",{question:$("poll-question").value,options:inputs.map(i=>i.value).filter(Boolean)});$("poll-dialog").close();$("poll-question").value="";inputs.forEach(i=>i.value="");toast("Vote is live!");});
$("leave-room").addEventListener("click",()=>{location.href=location.pathname;});
renderMovies();
const roomFromUrl=new URLSearchParams(location.search).get("room");if(roomFromUrl){$("room-code").value=roomFromUrl;$("lobby-error").textContent="Enter your name, then join the shared room.";}
