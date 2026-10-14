const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));

function makeCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}
function roomState(code) {
  if (!rooms.has(code)) rooms.set(code, {
    code, hostId: null, members: [], playlist: [], messages: [], polls: [],
    playback: { videoId: "aqz-KE-bpKQ", title: "Big Buck Bunny", playing: false, position: 0, updatedAt: Date.now() }
  });
  return rooms.get(code);
}
function publicState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    members: room.members.map(({ id, name }) => ({ id, name })),
    playlist: room.playlist,
    messages: room.messages.slice(-60),
    polls: room.polls,
    playback: room.playback
  };
}
function emitState(room) { io.to(room.code).emit("room:state", publicState(room)); }
function elapsedPosition(playback) {
  return playback.position + (playback.playing ? (Date.now() - playback.updatedAt) / 1000 : 0);
}
function cleanName(name) {
  return String(name || "Guest").trim().replace(/[<>]/g, "").slice(0, 22) || "Guest";
}

io.on("connection", socket => {
  socket.on("room:create", ({ name } = {}, reply = () => {}) => {
    let code;
    do { code = makeCode(); } while (rooms.has(code));
    const room = roomState(code);
    room.hostId = socket.id;
    room.members.push({ id: socket.id, name: cleanName(name) });
    socket.join(code);
    socket.data.roomCode = code;
    reply({ ok: true, code, state: publicState(room) });
    emitState(room);
  });

  socket.on("room:join", ({ code, name } = {}, reply = () => {}) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return reply({ ok: false, error: "Room not found. Check the code or create a new room." });
    const existing = room.members.find(m => m.id === socket.id);
    if (!existing) room.members.push({ id: socket.id, name: cleanName(name) });
    socket.join(code);
    socket.data.roomCode = code;
    reply({ ok: true, code, state: publicState(room) });
    emitState(room);
    socket.to(code).emit("chat:system", { text: `${cleanName(name)} joined the party`, at: Date.now() });
  });

  socket.on("playback:command", ({ action, position, videoId, title } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.members.some(m => m.id === socket.id)) return;
    // Host owns playback controls; all participants can still chat, react, vote and queue.
    if (room.hostId !== socket.id) return socket.emit("app:notice", "Only the host can control playback.");
    const p = room.playback;
    if (action === "play") { p.position = Number.isFinite(position) ? position : elapsedPosition(p); p.playing = true; p.updatedAt = Date.now(); }
    if (action === "pause") { p.position = Number.isFinite(position) ? position : elapsedPosition(p); p.playing = false; p.updatedAt = Date.now(); }
    if (action === "seek") { p.position = Math.max(0, Number(position) || 0); p.updatedAt = Date.now(); }
    if (action === "video") {
      p.videoId = String(videoId || "aqz-KE-bpKQ");
      p.title = String(title || "Shared video").slice(0, 100);
      p.position = 0; p.playing = false; p.updatedAt = Date.now();
    }
    io.to(room.code).emit("playback:update", { ...p, position: elapsedPosition(p), serverTime: Date.now(), by: socket.id, action });
    emitState(room);
  });

  socket.on("chat:send", ({ text } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const member = room.members.find(m => m.id === socket.id);
    const message = { id: crypto.randomUUID(), name: member?.name || "Guest", text: String(text || "").trim().slice(0, 400), at: Date.now(), type: "chat" };
    if (!message.text) return;
    room.messages.push(message);
    room.messages = room.messages.slice(-100);
    io.to(room.code).emit("chat:message", message);
  });

  socket.on("reaction:send", ({ emoji } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const member = room.members.find(m => m.id === socket.id);
    if (!["❤️", "😂", "🔥", "👏", "😮", "🍿", "💀", "✨"].includes(emoji)) return;
    io.to(room.code).emit("reaction:new", { emoji, name: member?.name || "Guest", id: crypto.randomUUID() });
  });

  socket.on("playlist:add", ({ title, videoId } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const member = room.members.find(m => m.id === socket.id);
    const item = { id: crypto.randomUUID(), title: String(title || "Untitled video").slice(0, 100), videoId: String(videoId || "aqz-KE-bpKQ"), addedBy: member?.name || "Guest" };
    room.playlist.push(item);
    emitState(room);
    io.to(room.code).emit("chat:system", { text: `${item.addedBy} added “${item.title}” to the queue`, at: Date.now() });
  });

  socket.on("playlist:play", ({ id } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;
    const item = room.playlist.find(x => x.id === id);
    if (!item) return;
    room.playback = { videoId: item.videoId, title: item.title, playing: false, position: 0, updatedAt: Date.now() };
    io.to(room.code).emit("playback:update", { ...room.playback, position: 0, serverTime: Date.now(), by: socket.id, action: "video" });
    emitState(room);
  });

  socket.on("poll:create", ({ question, options } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const q = String(question || "").trim().slice(0, 140);
    const choices = Array.isArray(options) ? options.map(x => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 4) : [];
    if (!q || choices.length < 2) return;
    const poll = { id: crypto.randomUUID(), question: q, options: choices.map((label, i) => ({ id: String(i), label, votes: [] })), createdBy: room.members.find(m => m.id === socket.id)?.name || "Guest" };
    room.polls.push(poll);
    emitState(room);
  });

  socket.on("poll:vote", ({ pollId, optionId } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const poll = room.polls.find(p => p.id === pollId);
    if (!poll) return;
    poll.options.forEach(o => { o.votes = o.votes.filter(id => id !== socket.id); });
    const option = poll.options.find(o => o.id === optionId);
    if (option) option.votes.push(socket.id);
    emitState(room);
  });

  socket.on("host:transfer", ({ memberId } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || !room.members.some(m => m.id === memberId)) return;
    room.hostId = memberId;
    emitState(room);
    io.to(room.code).emit("chat:system", { text: `${room.members.find(m => m.id === memberId)?.name || "A participant"} is now host`, at: Date.now() });
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    room.members = room.members.filter(m => m.id !== socket.id);
    if (room.hostId === socket.id) room.hostId = room.members[0]?.id || null;
    if (!room.members.length) rooms.delete(code);
    else emitState(room);
  });
});

server.listen(PORT, () => console.log(`Watch Party running at http://localhost:${PORT}`));
