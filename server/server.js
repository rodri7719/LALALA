import http from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';

const PORT = Number(process.env.PORT || 8787);
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const TRUST_PROXY = String(process.env.TRUST_PROXY || '').toLowerCase() === 'true';

function setSecurityHeaders(res) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('cross-origin-opener-policy', 'same-origin');
  res.setHeader('cross-origin-resource-policy', 'same-site');
  res.setHeader('cross-origin-embedder-policy', 'credentialless');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");

  // Enable HSTS only when you're sure traffic is HTTPS at the edge.
  if (String(process.env.ENABLE_HSTS || '').toLowerCase() === 'true') {
    res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }
}

function getReqIp(req) {
  if (TRUST_PROXY) {
    const xff = String(req.headers['x-forwarded-for'] || '');
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isOriginAllowed(origin) {
  if (!ALLOWED_ORIGINS.length) return true;
  const o = String(origin || '').trim();
  if (!o) return false;
  return ALLOWED_ORIGINS.includes(o);
}

const wsConnCountByIp = new Map();
const wsRateByIp = new Map();
const WS_MAX_CONNECTIONS_PER_IP = Number(process.env.WS_MAX_CONNECTIONS_PER_IP || 6);
const WS_MAX_MSG_BYTES = Number(process.env.WS_MAX_MSG_BYTES || 64 * 1024);
const WS_RATE_WINDOW_MS = Number(process.env.WS_RATE_WINDOW_MS || 10_000);
const WS_RATE_MAX_MSGS = Number(process.env.WS_RATE_MAX_MSGS || 120);

const RPC_URL = String(process.env.RPC_URL || '').trim();
const ARCADE_CONTRACT = String(process.env.ARCADE_CONTRACT || '0x024d05570022e4b82B8Efe49c3fEF935F94b7d38').toLowerCase();
const FEE_WEI_MIN = BigInt(process.env.FEE_WEI_MIN || '10000000000000'); // 0.00001 ETH
const usedTx = new Map(); // txHash -> { address, usedAt }

async function rpc(method, params) {
  if (!RPC_URL) throw new Error('RPC_URL not configured');
  const body = { jsonrpc: '2.0', id: 1, method, params };
  const r = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`RPC ${method} failed: HTTP ${r.status}`);
  const j = await r.json();
  if (j?.error) throw new Error(`RPC ${method} error: ${j.error?.message || 'unknown'}`);
  return j.result;
}

function hexToBigInt(v) {
  const s = String(v || '0x0');
  try { return BigInt(s); } catch { return 0n; }
}

async function verifyPaymentTx({ txHash, expectedFrom }) {
  const h = String(txHash || '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(h)) return { ok: false, reason: 'bad_txhash' };

  const prev = usedTx.get(h);
  if (prev) return { ok: false, reason: 'tx_already_used' };

  const tx = await rpc('eth_getTransactionByHash', [h]);
  if (!tx) return { ok: false, reason: 'tx_not_found' };

  const from = String(tx.from || '').toLowerCase();
  const to = String(tx.to || '').toLowerCase();
  if (!from || !to) return { ok: false, reason: 'tx_missing_fields' };
  if (String(expectedFrom || '').toLowerCase() !== from) return { ok: false, reason: 'tx_from_mismatch' };
  if (to !== ARCADE_CONTRACT) return { ok: false, reason: 'tx_to_mismatch' };

  const value = hexToBigInt(tx.value);
  if (value < FEE_WEI_MIN) return { ok: false, reason: 'tx_value_too_low' };

  const receipt = await rpc('eth_getTransactionReceipt', [h]);
  const status = String(receipt?.status || '').toLowerCase();
  if (status !== '0x1') return { ok: false, reason: 'tx_failed' };

  usedTx.set(h, { address: from, usedAt: Date.now() });
  return { ok: true };
}

function wsConnInc(ip) {
  const cur = wsConnCountByIp.get(ip) || 0;
  wsConnCountByIp.set(ip, cur + 1);
  return cur + 1;
}

function wsConnDec(ip) {
  const cur = wsConnCountByIp.get(ip) || 0;
  const next = Math.max(0, cur - 1);
  if (next === 0) wsConnCountByIp.delete(ip);
  else wsConnCountByIp.set(ip, next);
}

function wsRateAllow(ip) {
  const now = Date.now();
  const cur = wsRateByIp.get(ip);
  if (!cur || now > cur.resetAt) {
    wsRateByIp.set(ip, { count: 1, resetAt: now + WS_RATE_WINDOW_MS });
    return true;
  }
  cur.count += 1;
  if (cur.count > WS_RATE_MAX_MSGS) return false;
  return true;
}

const server = http.createServer((req, res) => {
  setSecurityHeaders(res);
  if (ALLOWED_ORIGINS.length) {
    const origin = String(req.headers.origin || '');
    if (origin && isOriginAllowed(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
    }
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('pudgy-vs-server');
});

const wss = new WebSocketServer({ server });

const clients = new Map(); // socket -> { id, address, state, room, lastPing, ip, game }
const queue = new Set(); // waiting for match
const rooms = new Map(); // roomId -> { p1, p2, state, seed, startTime }
const credits = new Map(); // address -> number of paid credits usable for future matches
const nicks = new Map(); // address -> nickname

const weeklyScores = new Map(); // address -> { points, nick, updatedAt }
const DATA_DIR = path.join(process.cwd(), 'data');
const WEEKLY_FILE = path.join(DATA_DIR, 'weekly-leaderboard.json');

function friday00UtcWeekKey(ts = Date.now()) {
  const d = new Date(ts);
  const day = d.getUTCDay();
  const diff = (day - 5 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

let weeklyKey = friday00UtcWeekKey();

function weeklyResetIfNeeded() {
  const k = friday00UtcWeekKey();
  if (k === weeklyKey) return;
  weeklyKey = k;
  weeklyScores.clear();
  weeklyPersist();
}

function weeklyPersist() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const obj = {
      weeklyKey,
      scores: Array.from(weeklyScores.entries()).map(([address, v]) => ({ address, ...v })),
    };
    fs.writeFileSync(WEEKLY_FILE, JSON.stringify(obj));
  } catch (e) {
    console.warn('[WEEKLY] persist failed', e);
  }
}

function weeklyLoad() {
  try {
    if (!fs.existsSync(WEEKLY_FILE)) return;
    const raw = fs.readFileSync(WEEKLY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    if (parsed.weeklyKey) weeklyKey = String(parsed.weeklyKey);
    const cur = friday00UtcWeekKey();
    if (weeklyKey !== cur) {
      weeklyKey = cur;
      weeklyScores.clear();
      weeklyPersist();
      return;
    }
    const arr = Array.isArray(parsed.scores) ? parsed.scores : [];
    for (const it of arr) {
      const a = String(it.address || '').toLowerCase();
      if (!a) continue;
      const pts = Number(it.points || 0);
      weeklyScores.set(a, { points: Number.isFinite(pts) ? pts : 0, nick: it.nick || null, updatedAt: Number(it.updatedAt || Date.now()) });
    }
  } catch (e) {
    console.warn('[WEEKLY] load failed', e);
  }
}

weeklyLoad();

function getWeeklyTop10() {
  weeklyResetIfNeeded();
  const rows = Array.from(weeklyScores.entries()).map(([address, v]) => ({ address, points: v.points || 0, nick: v.nick || getNick(address) || null }));
  rows.sort((a, b) => (b.points || 0) - (a.points || 0));
  return rows.slice(0, 10);
}

function broadcastWeeklyLeaderboard() {
  broadcastAll('weekly_leaderboard', { weeklyKey, top: getWeeklyTop10() });
}

let roomCounter = 0;

function broadcast(socket, type, data) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify({ type, ...data }));
  }
}

function broadcastAll(type, data) {
  for (const s of clients.keys()) {
    broadcast(s, type, data);
  }
}

function broadcastToRoom(roomId, type, data, exclude = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  [room.p1, room.p2].forEach(addr => {
    const client = Array.from(clients.entries()).find(([_, c]) => String(c.address || '').toLowerCase() === String(addr || '').toLowerCase());
    if (client && client[0] !== exclude) {
      broadcast(client[0], type, data);
    }
  });
}

function getSocketByAddress(address) {
  const a = String(address || '').toLowerCase();
  const entry = Array.from(clients.entries()).find(([_, c]) => String(c.address || '').toLowerCase() === a);
  return entry ? entry[0] : null;
}

function creditGet(address) {
  return credits.get(address) || 0;
}

function creditAdd(address, amount) {
  if (!address) return;
  const next = Math.max(0, (credits.get(address) || 0) + amount);
  credits.set(address, next);
}

function normNick(n) {
  const s = String(n || '').trim();
  if (!s) return null;
  const cleaned = s.replace(/\s+/g, ' ').slice(0, 16);
  return cleaned || null;
}

function getNick(address) {
  if (!address) return null;
  return nicks.get(address) || null;
}

function getLobbyUsers() {
  const byAddr = new Map();
  for (const c of clients.values()) {
    if (!c.address) continue;
    const a = String(c.address || '').toLowerCase();
    if (!a) continue;
    byAddr.set(a, { address: a, nick: getNick(a), game: c.game || null });
  }
  return Array.from(byAddr.values());
}

function broadcastLobbyUsers() {
  broadcastAll('lobby_users', { users: getLobbyUsers() });
}

function requeueSocket(socket) {
  const c = clients.get(socket);
  if (!c) return;
  c.state = 'finding';
  c.room = null;
  queue.add(socket);
  broadcast(socket, 'finding', { requeued: true });
  broadcastStats();
  tryMatchmaking();
}

function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const p1Socket = getSocketByAddress(room.p1);
  const p2Socket = getSocketByAddress(room.p2);
  const p1 = p1Socket ? clients.get(p1Socket) : null;
  const p2 = p2Socket ? clients.get(p2Socket) : null;
  if (p1) p1.room = null;
  if (p2) p2.room = null;
  rooms.delete(roomId);
  broadcastStats();
}

function getStats() {
  const online = clients.size;
  const inQueue = queue.size;
  const inMatches = rooms.size * 2;
  return { online, inQueue, inMatches };
}

function broadcastStats() {
  const stats = getStats();
  clients.forEach((_, socket) => {
    broadcast(socket, 'stats', stats);
  });
}

function tryMatchmaking() {
  console.log(`[MATCHMAKING] Queue size: ${queue.size}`);
  if (queue.size < 2) {
    console.log(`[MATCHMAKING] Not enough players (need 2, have ${queue.size})`);
    return;
  }

  const [p1Socket, p2Socket] = Array.from(queue).slice(0, 2);
  queue.delete(p1Socket);
  queue.delete(p2Socket);

  const p1 = clients.get(p1Socket);
  const p2 = clients.get(p2Socket);

  console.log(`[MATCH] Creating match between ${p1.address} and ${p2.address}`);

  const roomId = `room_${++roomCounter}`;
  const seed = Math.floor(Math.random() * 1000000);

  rooms.set(roomId, {
    p1: p1.address,
    p2: p2.address,
    state: 'waiting_payment',
    seed,
    createdAt: Date.now(),
    startTime: null,
    p1Paid: creditGet(p1.address) > 0,
    p2Paid: creditGet(p2.address) > 0,
    p1Progress: { level: 1, score: 0, combo: 0, alive: true },
    p2Progress: { level: 1, score: 0, combo: 0, alive: true },
  });

  p1.room = roomId;
  p2.room = roomId;
  p1.state = 'matched';
  p2.state = 'matched';

  broadcast(p1Socket, 'matched', {
    roomId,
    opponent: p2.address,
    opponentNick: getNick(p2.address),
    seed,
  });

  broadcast(p2Socket, 'matched', {
    roomId,
    opponent: p1.address,
    opponentNick: getNick(p1.address),
    seed,
  });

  const room = rooms.get(roomId);
  if (room && (room.p1Paid || room.p2Paid)) {
    broadcastToRoom(roomId, 'payment_update', {
      p1Paid: room.p1Paid,
      p2Paid: room.p2Paid,
      paid: { [room.p1]: room.p1Paid, [room.p2]: room.p2Paid },
      paidBy: null,
      creditInfo: true,
    });
  }

  broadcastStats();
}

function createDirectMatch(p1Socket, p2Socket) {
  const p1 = clients.get(p1Socket);
  const p2 = clients.get(p2Socket);
  if (!p1 || !p2 || !p1.address || !p2.address) return null;

  const roomId = `room_${++roomCounter}`;
  const seed = Math.floor(Math.random() * 1000000);

  rooms.set(roomId, {
    p1: p1.address,
    p2: p2.address,
    state: 'waiting_payment',
    seed,
    createdAt: Date.now(),
    startTime: null,
    p1Paid: creditGet(p1.address) > 0,
    p2Paid: creditGet(p2.address) > 0,
    p1Progress: { level: 1, score: 0, combo: 0, alive: true },
    p2Progress: { level: 1, score: 0, combo: 0, alive: true },
  });

  queue.delete(p1Socket);
  queue.delete(p2Socket);

  p1.room = roomId;
  p2.room = roomId;
  p1.state = 'matched';
  p2.state = 'matched';

  broadcast(p1Socket, 'matched', {
    roomId,
    opponent: p2.address,
    opponentNick: getNick(p2.address),
    seed,
    direct: true,
  });

  broadcast(p2Socket, 'matched', {
    roomId,
    opponent: p1.address,
    opponentNick: getNick(p1.address),
    seed,
    direct: true,
  });

  const room = rooms.get(roomId);
  if (room && (room.p1Paid || room.p2Paid)) {
    broadcastToRoom(roomId, 'payment_update', {
      p1Paid: room.p1Paid,
      p2Paid: room.p2Paid,
      paid: { [room.p1]: room.p1Paid, [room.p2]: room.p2Paid },
      paidBy: null,
      creditInfo: true,
    });
  }

  broadcastStats();
  return roomId;
}

wss.on('connection', (socket, req) => {
  const ip = req ? getReqIp(req) : 'unknown';
  const origin = req?.headers?.origin;
  if (!isOriginAllowed(origin)) {
    console.log('[WS] rejected connection (origin not allowed)', { ip, origin });
    try { socket.close(1008, 'origin_not_allowed'); } catch (e) {}
    return;
  }

  const nConns = wsConnInc(ip);
  if (Number.isFinite(WS_MAX_CONNECTIONS_PER_IP) && nConns > WS_MAX_CONNECTIONS_PER_IP) {
    console.log('[WS] rejected connection (too many connections)', { ip, nConns, max: WS_MAX_CONNECTIONS_PER_IP });
    wsConnDec(ip);
    try { socket.close(1013, 'too_many_connections'); } catch (e) {}
    return;
  }

  const clientId = Math.random().toString(36).slice(2);

  clients.set(socket, {
    id: clientId,
    address: null,
    ip,
    state: 'idle',
    room: null,
    lastPing: Date.now(),
    game: null,
  });

  console.log(`[CONNECTION] New client connected. ID: ${clientId}. Total clients: ${clients.size}`);

  broadcast(socket, 'connected', { id: clientId });
  broadcastStats();

  socket.on('message', async (raw) => {
    try {
      const b = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw || ''));
      if (b.length > WS_MAX_MSG_BYTES) {
        console.log('[WS] closing socket (message too large)', { ip, bytes: b.length, max: WS_MAX_MSG_BYTES });
        try { socket.close(1009, 'message_too_large'); } catch (e) {}
        return;
      }

      if (!wsRateAllow(ip)) {
        console.log('[WS] closing socket (rate limit)', { ip, windowMs: WS_RATE_WINDOW_MS, maxMsgs: WS_RATE_MAX_MSGS });
        try { socket.close(1013, 'rate_limited'); } catch (e) {}
        return;
      }

      const msg = JSON.parse(raw.toString());
      const client = clients.get(socket);
      if (!client) return;

      console.log(`[MSG] ${msg.type} from ${client.address || 'unknown'}`);

      switch (msg.type) {
        case 'register':
          client.address = String(msg.address || '').toLowerCase();
          client.game = String(msg.game || client.game || 'hub');
          {
            const nn = normNick(msg.nick);
            if (nn) nicks.set(client.address, nn);
          }

          // If the same wallet reconnects, ensure only one active socket exists.
          // This prevents stale/busy ghost sessions that make challenges fail.
          for (const [s, c] of clients.entries()) {
            if (s === socket) continue;
            if (!c?.address) continue;
            if (String(c.address).toLowerCase() !== client.address) continue;
            try {
              console.log(`[DEDUP] Closing previous socket for ${client.address} (id=${c.id})`);
              s.close(4000, 'dedup_same_wallet');
            } catch (e) {}
          }

          broadcast(socket, 'registered', { address: client.address });
          console.log(`[REGISTER] ${msg.address} - Total clients: ${clients.size}`);
          broadcastLobbyUsers();
          break;

        case 'set_game':
          {
            if (!client.address) return;
            client.game = String(msg.game || 'hub');
            broadcastLobbyUsers();
          }
          break;

        case 'get_lobby_users':
          {
            broadcast(socket, 'lobby_users', { users: getLobbyUsers() });
          }
          break;

        case 'set_nick':
          {
            if (!client.address) return;
            const nn = normNick(msg.nick);
            if (nn) nicks.set(client.address, nn);
            broadcast(socket, 'nick_updated', { nick: getNick(client.address) });
            broadcastLobbyUsers();
          }
          break;

        case 'lobby_chat':
          {
            if (!client.address) return;
            const text = String(msg.text || '').slice(0, 200);
            if (!text.trim()) return;
            broadcastAll('lobby_chat', { from: client.address, fromNick: getNick(client.address), text, ts: Date.now() });
          }
          break;

        case 'weekly_points':
          {
            if (!client.address) return;
            weeklyResetIfNeeded();
            const pts = Number(msg.points || 0);
            if (!Number.isFinite(pts) || pts <= 0) return;
            const a = String(client.address).toLowerCase();
            const prev = weeklyScores.get(a) || { points: 0, nick: getNick(a) || null, updatedAt: Date.now() };
            const next = { points: (prev.points || 0) + pts, nick: getNick(a) || prev.nick || null, updatedAt: Date.now() };
            weeklyScores.set(a, next);
            weeklyPersist();
            broadcastWeeklyLeaderboard();
          }
          break;

        case 'get_weekly_leaderboard':
          {
            weeklyResetIfNeeded();
            broadcast(socket, 'weekly_leaderboard', { weeklyKey, top: getWeeklyTop10() });
          }
          break;

        case 'challenge':
          {
            if (!client.address) return;
            const to = String(msg.to || '').toLowerCase();
            if (!to) return;
            const targetSocket = getSocketByAddress(to);
            if (!targetSocket) {
              broadcast(socket, 'challenge_error', { reason: 'not_online', to });
              return;
            }
            const targetClient = clients.get(targetSocket);
            if (!targetClient || targetClient.state !== 'idle') {
              broadcast(socket, 'challenge_error', { reason: 'busy', to });
              return;
            }
            if (client.state !== 'idle') {
              broadcast(socket, 'challenge_error', { reason: 'you_busy', to });
              return;
            }
            broadcast(targetSocket, 'challenge_invite', { from: client.address, fromNick: getNick(client.address) });
            broadcast(socket, 'challenge_sent', { to });
          }
          break;

        case 'challenge_response':
          {
            if (!client.address) return;
            const from = String(msg.from || '').toLowerCase();
            const accept = !!msg.accept;
            if (!from) return;
            const fromSocket = getSocketByAddress(from);
            if (!fromSocket) return;
            const fromClient = clients.get(fromSocket);
            if (!fromClient) return;

            if (!accept) {
              broadcast(fromSocket, 'challenge_rejected', { by: client.address, byNick: getNick(client.address) });
              return;
            }

            if (client.state !== 'idle' || fromClient.state !== 'idle') {
              broadcast(fromSocket, 'challenge_error', { reason: 'busy' });
              return;
            }

            createDirectMatch(fromSocket, socket);
          }
          break;

        case 'chat':
          {
            const chatRoom = rooms.get(client.room);
            if (!chatRoom) return;
            const text = String(msg.text || '').slice(0, 200);
            if (!text.trim()) return;
            broadcastToRoom(client.room, 'chat', { from: client.address, fromNick: getNick(client.address), text, ts: Date.now() });
          }
          break;

        case 'find_match':
          if (client.state !== 'idle') {
            console.log(`[FIND_MATCH] Rejected - client state: ${client.state}`);
            return;
          }
          client.state = 'finding';
          queue.add(socket);
          broadcast(socket, 'finding', {});
          broadcastStats();
          console.log(`[QUEUE] Added to queue. Queue size: ${queue.size}`);
          tryMatchmaking();
          break;

        case 'cancel_find':
          queue.delete(socket);
          client.state = 'idle';
          broadcast(socket, 'cancelled', {});
          broadcastStats();
          break;

        case 'cancel_match':
          {
            const roomId = client.room;
            const room = rooms.get(roomId);
            if (!room) return;
            if (room.state === 'playing') return;

            const opponentAddr = client.address === room.p1 ? room.p2 : room.p1;
            const opponentSocket = getSocketByAddress(opponentAddr);
            if (opponentSocket) {
              broadcast(opponentSocket, 'opponent_cancelled', { opponent: client.address, phase: room.state });
              broadcast(opponentSocket, 'cancelled', {});
              const oc = clients.get(opponentSocket);
              if (oc) { oc.state = 'idle'; oc.room = null; }
            }

            client.state = 'idle';
            client.room = null;
            broadcast(socket, 'cancelled', {});
            cleanupRoom(roomId);
            broadcastStats();
          }
          break;

        case 'payment_confirmed':
          {
            const roomId = client.room || String(msg.roomId || '');
            const room = rooms.get(roomId);
            if (!room) return;

            const txHash = String(msg.txHash || '').trim();
            if (!txHash) {
              broadcast(socket, 'payment_rejected', { roomId, reason: 'missing_txhash' });
              return;
            }

            try {
              const v = await verifyPaymentTx({ txHash, expectedFrom: client.address });
              if (!v.ok) {
                broadcast(socket, 'payment_rejected', { roomId, reason: v.reason });
                return;
              }
            } catch (e) {
              broadcast(socket, 'payment_rejected', { roomId, reason: 'rpc_verify_failed' });
              return;
            }

            // If we recovered the room by msg.roomId, re-associate this socket.
            if (!client.room) client.room = roomId;
            if (client.state === 'idle') client.state = 'matched';

            if (client.address === room.p1) room.p1Paid = true;
            if (client.address === room.p2) room.p2Paid = true;

            creditAdd(client.address, 1);

            broadcastToRoom(client.room, 'payment_update', {
              p1Paid: room.p1Paid,
              p2Paid: room.p2Paid,
              paid: { [room.p1]: room.p1Paid, [room.p2]: room.p2Paid },
              paidBy: client.address,
            });

            if (room.p1Paid && room.p2Paid) {
              room.state = 'playing';
              room.startTime = Date.now();
              const p1Socket = getSocketByAddress(room.p1);
              const p2Socket = getSocketByAddress(room.p2);
              if (p1Socket) clients.get(p1Socket).state = 'playing';
              if (p2Socket) clients.get(p2Socket).state = 'playing';

              creditAdd(room.p1, -1);
              creditAdd(room.p2, -1);

              broadcastToRoom(client.room, 'game_start', {
                seed: room.seed,
                countdown: 3,
              });
            }
          }
          break;

        case 'resign':
          {
            const resignRoom = rooms.get(client.room);
            if (!resignRoom) return;
            const opponentAddr = client.address === resignRoom.p1 ? resignRoom.p2 : resignRoom.p1;
            const opponentSocket = getSocketByAddress(opponentAddr);
            if (opponentSocket) {
              broadcast(opponentSocket, 'opponent_resigned', { opponent: client.address, phase: resignRoom.state });
              if (resignRoom.state === 'playing') {
                broadcast(opponentSocket, 'game_over', { result: 'win', reason: 'opponent_resigned', opponent: client.address });
              }
            }

            if (resignRoom.state !== 'playing' && opponentSocket) {
              requeueSocket(opponentSocket);
            }
            cleanupRoom(client.room);
          }
          break;

        case 'progress_update':
          {
            const progressRoom = rooms.get(client.room);
            if (!progressRoom || progressRoom.state !== 'playing') return;

            if (client.address === progressRoom.p1) {
              progressRoom.p1Progress = { ...progressRoom.p1Progress, ...msg.data };
            } else if (client.address === progressRoom.p2) {
              progressRoom.p2Progress = { ...progressRoom.p2Progress, ...msg.data };
            }

            broadcastToRoom(client.room, 'opponent_progress', {
              opponent: client.address,
              progress: msg.data,
            }, socket);
          }
          break;

        case 'chess_move':
          {
            const chessRoom = rooms.get(client.room);
            if (!chessRoom || chessRoom.state !== 'playing') return;
            const uci = String(msg.uci || '');
            if (!uci || uci.length < 4) return;
            broadcastToRoom(client.room, 'chess_move', { uci, from: client.address, ts: Date.now() });
          }
          break;

        case 'game_end':
          {
            const endRoom = rooms.get(client.room);
            if (!endRoom) return;

            broadcastToRoom(client.room, 'opponent_finished', {
              opponent: client.address,
              finalScore: msg.score,
              time: Date.now() - endRoom.startTime,
            });
          }
          break;

        case 'ping':
          client.lastPing = Date.now();
          broadcast(socket, 'pong', {});
          break;
      }
    } catch (err) {
      console.error('Message error:', err);
    }
  });

  socket.on('close', () => {
    const client = clients.get(socket);
    if (!client) return;

    console.log(`[DISCONNECT] Client ${client.address || client.id} disconnected. Total clients: ${clients.size - 1}`);

    queue.delete(socket);

    if (client.room) {
      const room = rooms.get(client.room);
      if (room) {
        const opponentAddr = client.address === room.p1 ? room.p2 : room.p1;
        const opponentSocket = getSocketByAddress(opponentAddr);
        if (opponentSocket) {
          broadcast(opponentSocket, 'opponent_disconnected', {
            opponent: client.address,
            phase: room.state,
          });

          if (room.state === 'playing') {
            broadcast(opponentSocket, 'game_over', { result: 'win', reason: 'opponent_disconnected', opponent: client.address });
          } else {
            requeueSocket(opponentSocket);
          }
        }
        cleanupRoom(client.room);
      }
    }

    clients.delete(socket);
    wsConnDec(ip);
    broadcastStats();
    broadcastLobbyUsers();
  });
});

setInterval(() => {
  const now = Date.now();
  clients.forEach((client, socket) => {
    if (now - client.lastPing > 30000) {
      socket.terminate();
    }
  });
}, 10000);

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (room.state !== 'waiting_payment') continue;
    if (now - room.createdAt < 90000) continue;

    const p1Socket = getSocketByAddress(room.p1);
    const p2Socket = getSocketByAddress(room.p2);
    if (p1Socket) broadcast(p1Socket, 'match_timeout', { roomId, reason: 'waiting_payment_timeout' });
    if (p2Socket) broadcast(p2Socket, 'match_timeout', { roomId, reason: 'waiting_payment_timeout' });
    if (p1Socket) requeueSocket(p1Socket);
    if (p2Socket) requeueSocket(p2Socket);
    cleanupRoom(roomId);
  }
}, 5000);

server.listen(PORT, () => {
  console.log(`🎮 VS Server listening on :${PORT}`);
});
