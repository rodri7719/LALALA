import { useState, useEffect, useRef } from 'react';

const WS_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_WS_URL)
  ? String(import.meta.env.VITE_WS_URL)
  : (() => {
      try {
        const host = (typeof window !== 'undefined' && window.location && window.location.hostname)
          ? window.location.hostname
          : 'localhost';
        return `ws://${host}:8787`;
      } catch {
        return 'ws://localhost:8787';
      }
    })();

export function useVS(address) {
  const wsRef = useRef(null);
  const pendingFind = useRef(false);
  const failedReconnects = useRef(0);
  const loggedWsError = useRef(false);
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState({ online: 0, inQueue: 0, inMatches: 0 });
  const [vsState, setVsState] = useState('idle');
  const [matchData, setMatchData] = useState(null);
  const [opponentProgress, setOpponentProgress] = useState(null);
  const [lastChessMove, setLastChessMove] = useState(null); // { uci, from, ts }
  const [lastChat, setLastChat] = useState(null); // { from, text, ts }
  const [lastOpponentEvent, setLastOpponentEvent] = useState(null); // { type, ...payload }
  const [lobbyUsers, setLobbyUsers] = useState([]); // [{ address, nick }]
  const [lastLobbyChat, setLastLobbyChat] = useState(null); // { from, fromNick, text, ts }
  const [lastChallengeInvite, setLastChallengeInvite] = useState(null); // { from, fromNick }
  const [lastChallengeEvent, setLastChallengeEvent] = useState(null); // { type, ...payload }
  const [weeklyLeaderboard, setWeeklyLeaderboard] = useState(null); // { weeklyKey, top }
  const [lastPaymentRejected, setLastPaymentRejected] = useState(null); // { roomId, reason, ts }
  const gameRef = useRef('hub');
  const [nick, setNick] = useState(() => {
    try { return localStorage.getItem('pudgy_nick') || ''; } catch (e) { return ''; }
  });
  const reconnectTimer = useRef(null);
  const activeRef = useRef(false);

  useEffect(() => {
    if (!address) {
      activeRef.current = false;
      pendingFind.current = false;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        try {
          if (wsRef.current._pingInterval) clearInterval(wsRef.current._pingInterval);
          wsRef.current.close();
        } catch (e) {}
        wsRef.current = null;
      }
      setConnected(false);
      setVsState('idle');
      setMatchData(null);
      setOpponentProgress(null);
      setLastChessMove(null);
      setLastChat(null);
      setLastOpponentEvent(null);
      setLobbyUsers([]);
      setLastLobbyChat(null);
      setLastChallengeInvite(null);
      setLastChallengeEvent(null);
      return;
    }

    activeRef.current = true;

    const connect = () => {
      if (failedReconnects.current >= 6) {
        return;
      }
      const socket = new WebSocket(WS_URL);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('[useVS] WebSocket connected');
        failedReconnects.current = 0;
        setConnected(true);
        socket.send(JSON.stringify({ type: 'register', address, nick, game: gameRef.current || 'hub' }));
        console.log('[useVS] Registered with address:', address);

        socket.send(JSON.stringify({ type: 'get_weekly_leaderboard' }));

        if (pendingFind.current) {
          pendingFind.current = false;
          socket.send(JSON.stringify({ type: 'find_match' }));
        }
        
        const pingInterval = setInterval(() => {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({ type: 'ping' }));
          }
        }, 15000);

        socket._pingInterval = pingInterval;
      };

  const setGame = (game) => {
    const g = String(game || 'hub');
    gameRef.current = g;
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'set_game', game: g }));
    }
  };

  const requestLobbyUsers = () => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'get_lobby_users' }));
    }
  };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'stats':
              setStats({ online: msg.online, inQueue: msg.inQueue, inMatches: msg.inMatches });
              break;
            case 'lobby_users':
              setLobbyUsers(Array.isArray(msg.users) ? msg.users : []);
              break;
            case 'lobby_chat':
              setLastLobbyChat({ from: msg.from, fromNick: msg.fromNick, text: msg.text, ts: msg.ts });
              break;
            case 'finding':
              setVsState('finding');
              break;
            case 'matched':
              setVsState('matched');
              setMatchData({ roomId: msg.roomId, opponent: msg.opponent, opponentNick: msg.opponentNick, seed: msg.seed });
              break;
            case 'payment_update':
              setMatchData(prev => prev ? ({ ...prev, p1Paid: msg.p1Paid, p2Paid: msg.p2Paid, paid: msg.paid, paidBy: msg.paidBy }) : prev);
              break;
            case 'payment_rejected':
              setLastPaymentRejected({ roomId: msg.roomId || null, reason: msg.reason || 'rejected', ts: Date.now() });
              break;
            case 'game_start':
              setVsState('playing');
              break;
            case 'opponent_progress':
              setOpponentProgress(msg.progress);
              break;
            case 'opponent_finished':
              setOpponentProgress(prev => ({ ...prev, finished: true, finalScore: msg.finalScore }));
              break;
            case 'opponent_disconnected':
            case 'opponent_resigned':
            case 'match_timeout':
            case 'game_over':
            case 'opponent_cancelled':
              setLastOpponentEvent({ type: msg.type, ...msg });
              setVsState('idle');
              setMatchData(null);
              break;
            case 'cancelled':
              setVsState('idle');
              setMatchData(null);
              break;

            case 'chess_move':
              setLastChessMove({ uci: msg.uci, from: msg.from, ts: msg.ts });
              break;

            case 'chat':
              setLastChat({ from: msg.from, fromNick: msg.fromNick, text: msg.text, ts: msg.ts });
              break;

            case 'challenge_invite':
              setLastChallengeInvite({ from: msg.from, fromNick: msg.fromNick });
              break;
            case 'challenge_sent':
            case 'challenge_rejected':
            case 'challenge_error':
              setLastChallengeEvent({ type: msg.type, ...msg });
              break;

            case 'weekly_leaderboard':
              setWeeklyLeaderboard({ weeklyKey: msg.weeklyKey, top: Array.isArray(msg.top) ? msg.top : [] });
              break;

            case 'nick_updated':
              setNick(String(msg.nick || ''));
              try { localStorage.setItem('pudgy_nick', String(msg.nick || '')); } catch (e) {}
              break;
          }
        } catch (err) {
          console.warn('[useVS] Invalid WS message', err);
        }
      };

      socket.onclose = (ev) => {
        console.log('[useVS] WebSocket closed', {
          code: ev?.code,
          reason: ev?.reason,
          wasClean: ev?.wasClean,
          url: WS_URL,
        });
        setConnected(false);
        if (socket._pingInterval) clearInterval(socket._pingInterval);
        if (!activeRef.current) return;
        failedReconnects.current = (failedReconnects.current || 0) + 1;
        reconnectTimer.current = setTimeout(() => {
          if (!activeRef.current) return;
          console.log('[useVS] Reconnecting...');
          connect();
        }, 3000);
      };

      socket.onerror = (err) => {
        if (!loggedWsError.current) {
          loggedWsError.current = true;
          console.warn('[useVS] WebSocket error (server likely offline).');
          console.warn('[useVS] WS URL:', WS_URL);
        }
        console.warn('[useVS] WebSocket error event:', err);
      };
    };

    connect();

    return () => {
      activeRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        if (wsRef.current._pingInterval) clearInterval(wsRef.current._pingInterval);
        wsRef.current.close();
      }
    };
  }, [address]);

  const setNickname = (next) => {
    const v = String(next || '').slice(0, 16);
    setNick(v);
    try { localStorage.setItem('pudgy_nick', v); } catch (e) {}
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'set_nick', nick: v }));
    }
  };

  const findMatch = () => {
    console.log('[useVS] findMatch called, ws state:', wsRef.current?.readyState);
    if (wsRef.current && wsRef.current.readyState === 1) {
      console.log('[useVS] Sending find_match message');
      wsRef.current.send(JSON.stringify({ type: 'find_match' }));
    } else {
      console.log('[useVS] WebSocket not ready — queueing find request');
      pendingFind.current = true;
    }
  };

  const cancelFind = () => {
    pendingFind.current = false;
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'cancel_find' }));
      setVsState('idle');
    }
  };

  const confirmPayment = (txHash) => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: 'payment_confirmed',
        roomId: matchData?.roomId || null,
        txHash: txHash || null,
      }));
    }
  };

  const sendProgress = (progress) => {
    if (wsRef.current && wsRef.current.readyState === 1 && vsState === 'playing') {
      wsRef.current.send(JSON.stringify({ type: 'progress_update', data: progress }));
    }
  };

  const sendGameEnd = (score) => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'game_end', score }));
    }
  };

  const sendChessMove = (uci) => {
    if (wsRef.current && wsRef.current.readyState === 1 && vsState === 'playing') {
      wsRef.current.send(JSON.stringify({ type: 'chess_move', uci }));
    }
  };

  const sendChat = (text) => {
    if (wsRef.current && wsRef.current.readyState === 1 && (vsState === 'matched' || vsState === 'playing')) {
      wsRef.current.send(JSON.stringify({ type: 'chat', text }));
    }
  };

  const resign = () => {
    if (wsRef.current && wsRef.current.readyState === 1 && (vsState === 'matched' || vsState === 'playing')) {
      wsRef.current.send(JSON.stringify({ type: 'resign' }));
    }
  };

  const cancelMatch = () => {
    if (wsRef.current && wsRef.current.readyState === 1 && vsState === 'matched') {
      wsRef.current.send(JSON.stringify({ type: 'cancel_match' }));
    }
  };

  const sendLobbyChat = (text) => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'lobby_chat', text }));
    }
  };

  const challenge = (to) => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'challenge', to }));
    }
  };

  const respondChallenge = (from, accept) => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'challenge_response', from, accept }));
    }
  };

  const addWeeklyPoints = (points) => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      const pts = Number(points || 0);
      if (Number.isFinite(pts) && pts > 0) wsRef.current.send(JSON.stringify({ type: 'weekly_points', points: pts }));
    }
  };

  const requestWeeklyLeaderboard = () => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'get_weekly_leaderboard' }));
    }
  };

  return {
    connected,
    stats,
    vsState,
    matchData,
    opponentProgress,
    lastChessMove,
    lastChat,
    lastOpponentEvent,
    lobbyUsers,
    lastLobbyChat,
    lastChallengeInvite,
    lastChallengeEvent,
    weeklyLeaderboard,
    lastPaymentRejected,
    nick,
    findMatch,
    cancelFind,
    confirmPayment,
    sendProgress,
    sendGameEnd,
    sendChessMove,
    sendChat,
    resign,
    cancelMatch,
    sendLobbyChat,
    challenge,
    respondChallenge,
    addWeeklyPoints,
    requestWeeklyLeaderboard,
    setGame,
    requestLobbyUsers,
    setNickname,
  };
}
