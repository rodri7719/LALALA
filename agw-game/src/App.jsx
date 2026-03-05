// ─── Following EXACTLY the official AGW docs:
// https://docs.abs.xyz/abstract-global-wallet/agw-react/native-integration
//
// KEY FACTS from official docs:
// 1. useLoginWithAbstract → { login } — call login() directly on click
// 2. useAccount (wagmi) → { address, status } — to check if connected
// 3. useSendTransaction (wagmi) → to send transactions from AGW wallet
// 4. AbstractWalletProvider handles WagmiProvider + QueryClientProvider internally

import { useEffect, useState, useRef, useCallback } from "react";
import { useLoginWithAbstract } from "@abstract-foundation/agw-react";
import { useAccount, useDisconnect, useSendTransaction } from "wagmi";
import { parseEther, encodeFunctionData } from "viem";
import { useVS } from "./useVS.js";

const ARCADE_CONTRACT = "0x024d05570022e4b82B8Efe49c3fEF935F94b7d38";
const FEE_PER_GAME = parseEther("0.00001");

const ARCADE_ABI = [
  {
    type: "function",
    name: "buyPlay",
    stateMutability: "payable",
    inputs: [{ name: "gameId", type: "uint8" }],
    outputs: [],
  },
];

const GAMES = [
  {
    id: "crush",
    title: "Pudgy Crush",
    emoji: "⚡",
    desc: "Crush combos, unleash power-ups, climb weekly points",
    src: "/pudgy-crush.html",
    color1: "#00d9ff",
    color2: "#0066ff",
    icon: "⚡",
  },
  {
    id: "derby",
    title: "Abstract Derby",
    emoji: "🏇",
    desc: "Bet smart, chase the podium, climb weekly points",
    src: "/horse-racing.html",
    color1: "#ffd700",
    color2: "#00b4ff",
    icon: "🏁",
  },
  {
    id: "chess",
    title: "Pudgy Chess",
    emoji: "♟️",
    desc: "Strategic penguin chess battles",
    src: "/ajedrez.html",
    color1: "#a855f7",
    color2: "#6366f1",
    icon: "👑",
  },
];

function encodeGameData(gameId) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(JSON.stringify({ game: gameId, ts: Date.now() }));
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function gameIdToUint8(gameId) {
  switch (gameId) {
    case "crush":
      return 1;
    case "derby":
      return 2;
    case "chess":
      return 3;
    default:
      return 0;
  }
}

// Stars computed once — deterministic, never causes re-render flicker
const STARS = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  left: Number(((i * 137.508) % 100).toFixed(2)),
  top:  Number(((i * 97.32)   % 100).toFixed(2)),
  size: (i % 3) + 1,
  dur:  2 + (i % 4),
  delay: Number(((i * 0.31) % 5).toFixed(2)),
  opacity: Number((0.2 + (i % 5) * 0.1).toFixed(1)),
}));

function Particles() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let w = canvas.width  = window.innerWidth;
    let h = canvas.height = window.innerHeight;
    const chars = ["❄", "✦", "◇", "·", "⬥"];
    const pts = Array.from({ length: 50 }, (_, i) => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .3, vy: Math.random() * .5 + .2,
      size: Math.random() * 12 + 5,
      char: chars[i % chars.length],
      op: Math.random() * .3 + .08,
      rot: Math.random() * 360, rs: (Math.random() - .5) * 1.5,
    }));
    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy; p.rot += p.rs;
        if (p.y > h + 20) { p.y = -20; p.x = Math.random() * w; }
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * Math.PI / 180);
        ctx.globalAlpha = p.op;
        ctx.font = `${p.size}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(p.char, 0, 0);
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    const onResize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, []);
  return <canvas ref={ref} style={{ position:"fixed", inset:0, zIndex:1, pointerEvents:"none" }} />;
}

const Aurora = () => (
  <div style={{ position:"fixed", inset:0, zIndex:0, overflow:"hidden", background:"#050a12" }}>
    {/* Arcade background image */}
    <div style={{
      position:"absolute", inset:0,
      backgroundImage:"url('/arcade-bg.png')",
      backgroundSize:"cover", backgroundPosition:"center center",
      backgroundRepeat:"no-repeat",
      backgroundColor:"#0a1520",
    }} />
    {/* Dark overlay for better text readability */}
    <div style={{
      position:"absolute", inset:0,
      background:"linear-gradient(180deg,rgba(5,10,18,.4) 0%,rgba(5,10,18,.6) 50%,rgba(5,10,18,.5) 100%)",
    }} />
    {/* Animated aurora glow overlay */}
    <div style={{
      position:"absolute", width:"120vw", height:"120vh", top:"-10vh", left:"-10vw",
      background:"radial-gradient(ellipse at 20% 50%,rgba(0,180,255,.08) 0%,transparent 50%),radial-gradient(ellipse at 80% 30%,rgba(100,0,255,.06) 0%,transparent 50%),radial-gradient(ellipse at 50% 80%,rgba(0,255,180,.05) 0%,transparent 50%)",
      animation:"auroraMove 20s ease-in-out infinite alternate",
      mixBlendMode:"screen",
    }} />
    {STARS.map(s => (
      <div key={s.id} style={{
        position:"absolute", left:`${s.left}%`, top:`${s.top}%`,
        width:s.size, height:s.size, borderRadius:"50%", background:"#fff",
        opacity:s.opacity * 0.6, animation:`twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
      }} />
    ))}
    <div style={{
      position:"absolute", top:0, left:0, right:0, height:"40vh",
      background:"linear-gradient(180deg,rgba(0,255,170,.03) 0%,rgba(0,150,255,.04) 30%,transparent 100%)",
      animation:"auroraShimmer 8s ease-in-out infinite alternate",
    }} />
  </div>
);

function GameCard({ game, onEnter, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position:"relative", width:300,
        background: hover ? "linear-gradient(135deg,rgba(255,255,255,.12),rgba(255,255,255,.05))"
                          : "linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.02))",
        backdropFilter:"blur(24px)",
        border:`2px solid ${hover ? `${game.color1}60` : "rgba(255,255,255,.12)"}`,
        borderRadius:28, padding:"32px 28px 24px",
        transition:"all .4s cubic-bezier(.2,1,.3,1)",
        transform: hover ? "translateY(-12px) scale(1.03)" : "none",
        boxShadow: hover
          ? `0 24px 70px rgba(0,0,0,.5),0 0 50px ${game.color1}30,inset 0 2px 0 rgba(255,255,255,.15)`
          : "0 10px 40px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.08)",
        overflow:"hidden",
      }}
    >
      <div style={{
        position:"absolute", top:-50, right:-50, width:150, height:150,
        background:`radial-gradient(circle,${game.color1}15,transparent 70%)`,
        opacity: hover ? 1 : 0.3, transition:"opacity .35s", pointerEvents:"none",
      }} />
      <div style={{
        fontSize:"4rem", textAlign:"center", lineHeight:1, marginBottom:18,
        filter: hover ? `drop-shadow(0 0 24px ${game.color1}80) drop-shadow(0 0 12px ${game.color2}40)` : `drop-shadow(0 0 8px ${game.color1}30)`,
        transition:"filter .4s, transform .4s",
        transform: hover ? "scale(1.15) rotate(5deg)" : "none",
      }}>
        {game.emoji}
      </div>
      <div style={{
        fontFamily:"'Baloo 2',cursive", fontSize:"1.65rem", fontWeight:800,
        background:`linear-gradient(135deg,#fff,${game.color1},${game.color2})`,
        WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
        textAlign:"center", marginBottom:6,
        letterSpacing:".02em",
      }}>
        {game.title}
      </div>
      <div style={{
        fontFamily:"'Baloo 2',cursive", fontSize:".88rem",
        color:"rgba(255,255,255,.55)", textAlign:"center", marginBottom:24, lineHeight:1.5,
        fontWeight:500,
      }}>
        {game.desc}
      </div>
      <button
        disabled={disabled}
        onClick={() => onEnter(game)}
        style={{
          display:"block", width:"100%", padding:"14px 0",
          background: disabled ? "rgba(255,255,255,.1)" : `linear-gradient(135deg,${game.color1},${game.color2})`,
          border:"none", borderRadius:16,
          color: disabled ? "rgba(255,255,255,.4)" : "#fff",
          fontFamily:"'Baloo 2',cursive", fontSize:"1.15rem", fontWeight:800,
          cursor: disabled ? "not-allowed" : "pointer",
          letterSpacing:".08em", transition:"all .3s",
          boxShadow: hover && !disabled ? `0 6px 24px ${game.color1}50, inset 0 1px 0 rgba(255,255,255,.3)` : "0 2px 8px rgba(0,0,0,.2)",
          textShadow: disabled ? "none" : "0 1px 2px rgba(0,0,0,.3)",
          transform: hover && !disabled ? "scale(1.02)" : "none",
        }}
      >
        {disabled ? "⏳ Processing…" : `PLAY ${game.icon}`}
      </button>
      <div style={{
        fontFamily:"'Baloo 2',cursive", fontSize:".62rem",
        color:"rgba(255,255,255,.22)", textAlign:"center", marginTop:8,
      }}>
        0.00001 ETH · Abstract Chain
      </div>
    </div>
  );
}

function Modal({ state, onClose }) {
  if (!state) return null;
  const isPending = state === "pending";
  const isError   = state.startsWith?.("error:");
  const errMsg    = isError ? state.slice(6) : "";
  return (
    <div style={{
      position:"fixed", inset:0, zIndex:99999,
      background:"rgba(0,0,0,.8)", backdropFilter:"blur(12px)",
      display:"flex", alignItems:"center", justifyContent:"center",
    }}>
      <div style={{
        background:"rgba(6,14,28,.97)",
        border:`1px solid ${isError?"rgba(255,80,80,.4)":isPending?"rgba(0,200,255,.3)":"rgba(0,255,170,.4)"}`,
        borderRadius:24, padding:"44px 52px", textAlign:"center",
        maxWidth:380, width:"90%", animation:"modalIn .22s ease-out",
      }}>
        <div style={{ fontSize:"3rem", marginBottom:14 }}>
          {isPending ? "⏳" : isError ? "❌" : "✅"}
        </div>
        <div style={{
          fontFamily:"'Baloo 2',cursive", fontSize:"1.2rem", fontWeight:800,
          color: isError ? "#ff9090" : isPending ? "#0ff" : "#a8f0c6", marginBottom:8,
        }}>
          {isPending ? "Sending Payment…" : isError ? "Transaction Failed" : "Confirmed!"}
        </div>
        <div style={{
          fontFamily:"'Baloo 2',cursive", fontSize:".84rem",
          color:"rgba(255,255,255,.42)", lineHeight:1.5, marginBottom: isError ? 24 : 0,
        }}>
          {isPending ? "Confirm in your Abstract wallet…"
            : isError ? (errMsg || "Something went wrong. Try again.")
            : "Starting your game…"}
        </div>
        {isError && (
          <button onClick={onClose} style={{
            background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.18)",
            borderRadius:12, padding:"10px 32px", color:"#fff",
            fontFamily:"'Baloo 2',cursive", fontSize:".88rem", fontWeight:700, cursor:"pointer",
          }}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════
export default function App() {
  // Official AGW docs pattern:
  const { login }              = useLoginWithAbstract();
  const { address, status }    = useAccount();           // wagmi hook — works inside AbstractWalletProvider
  const { disconnect }         = useDisconnect();
  const { sendTransaction, isPending } = useSendTransaction(); // wagmi hook — correct way per docs

  const [currentGame, setCurrentGame] = useState(null);
  const [modal,       setModal]       = useState(null);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [nickModalOpen, setNickModalOpen] = useState(false);
  const [preGame, setPreGame] = useState(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const menuMusicRef = useRef(null);
  const menuMusicStartedRef = useRef(false);
  const [menuMusicPausedForGame, setMenuMusicPausedForGame] = useState(false);
  const [menuMusicMuted, setMenuMusicMuted] = useState(() => {
    try { return localStorage.getItem('MENU_MUSIC_MUTED') === '1'; } catch { return false; }
  });
  const [menuMusicVol, setMenuMusicVol] = useState(() => {
    try {
      const v = parseFloat(localStorage.getItem('MENU_MUSIC_VOL') || '0.55');
      if (!Number.isFinite(v)) return 0.55;
      return Math.max(0, Math.min(1, v));
    } catch {
      return 0.55;
    }
  });

  const hubSnowCanvasRef = useRef(null);

  const isConnected = status === "connected";
  const playerAddress = address || null;
  const vs = useVS(playerAddress);
  const vsBridgeRef = useRef({ win: null, gameId: null });
  const iframeRef                     = useRef(null);
  const pendingGame                   = useRef(null); // game to launch after wallet connects

  const [weeklyLocalVer, setWeeklyLocalVer] = useState(0);

  const friday00UtcKey = useCallback((ts = Date.now()) => {
    const d = new Date(ts);
    const day = d.getUTCDay();
    const diff = (day - 5 + 7) % 7;
    d.setUTCDate(d.getUTCDate() - diff);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }, []);

  const getWeeklyKeyForLocal = useCallback(() => {
    const k = vs.weeklyLeaderboard?.weeklyKey;
    if (k) return String(k);
    return friday00UtcKey();
  }, [vs.weeklyLeaderboard, friday00UtcKey]);

  const addLocalWeeklyPoints = useCallback((points) => {
    const a = String(address || '').toLowerCase();
    if (!a) return;
    const pts = Number(points || 0);
    if (!Number.isFinite(pts) || pts <= 0) return;
    const wk = getWeeklyKeyForLocal();
    const key = `WEEKLY_LOCAL_${wk}_${a}`;
    try {
      const prev = Number(localStorage.getItem(key) || '0') || 0;
      localStorage.setItem(key, String(prev + pts));
      setWeeklyLocalVer(v => v + 1);
    } catch {}
  }, [address, getWeeklyKeyForLocal]);

  const getLocalWeeklyPoints = useCallback(() => {
    const a = String(address || '').toLowerCase();
    if (!a) return 0;
    const wk = getWeeklyKeyForLocal();
    const key = `WEEKLY_LOCAL_${wk}_${a}`;
    try { return Number(localStorage.getItem(key) || '0') || 0; } catch { return 0; }
  }, [address, getWeeklyKeyForLocal]);

  const myWeeklyPoints = useCallback(() => {
    const a = String(address || '').toLowerCase();
    if (!a) return 0;
    const top = vs.weeklyLeaderboard?.top || null;
    if (Array.isArray(top) && top.length > 0) {
      const row = top.find(r => String(r.address || '').toLowerCase() === a);
      const v = Number(row?.points || 0) || 0;
      if (v > 0) return v;
    }
    return getLocalWeeklyPoints();
  }, [address, vs.weeklyLeaderboard, getLocalWeeklyPoints, weeklyLocalVer]);

  const myLifetimeDerbyPoints = useCallback(() => {
    try { return Number(localStorage.getItem('DERBY_LIFE_POINTS') || '0') || 0; } catch { return 0; }
  }, []);

  const shortAddr = useCallback((a) => {
    if (!a) return "";
    const s = String(a);
    if (s.length <= 14) return s;
    return s.slice(0, 6) + "..." + s.slice(-4);
  }, []);

  const ensureMenuMusic = useCallback(async () => {
    try {
      if (!menuMusicRef.current) {
        const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ? import.meta.env.BASE_URL : '/';
        const src = (base.endsWith('/') ? base : (base + '/')) + 'PIOPIOPIO.mp3';
        const a = new Audio(src);
        a.loop = true;
        a.preload = 'auto';
        a.volume = menuMusicVol;
        a.muted = !!menuMusicMuted;
        menuMusicRef.current = a;
      }
      if (menuMusicPausedForGame) {
        menuMusicRef.current.pause();
        return;
      }
      if (menuMusicStartedRef.current) return;
      menuMusicStartedRef.current = true;
      await menuMusicRef.current.play();
    } catch {
      // ignore autoplay restrictions
    }
  }, [menuMusicMuted, menuMusicPausedForGame, menuMusicVol]);

  useEffect(() => {
    const a = menuMusicRef.current;
    if (!a) return;
    a.volume = menuMusicVol;
    a.muted = !!menuMusicMuted;
    try {
      localStorage.setItem('MENU_MUSIC_MUTED', menuMusicMuted ? '1' : '0');
      localStorage.setItem('MENU_MUSIC_VOL', String(menuMusicVol));
    } catch {}

    if (menuMusicPausedForGame) {
      a.pause();
    } else {
      if (menuMusicStartedRef.current) {
        a.play().catch(() => {});
      }
    }
  }, [menuMusicMuted, menuMusicPausedForGame, menuMusicVol]);

  useEffect(() => {
    if (currentGame) return;
    const onFirstGesture = () => {
      ensureMenuMusic();
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
    window.addEventListener('pointerdown', onFirstGesture, { passive: true });
    window.addEventListener('keydown', onFirstGesture);
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
  }, [currentGame, ensureMenuMusic]);

  useEffect(() => {
    if (!currentGame) {
      setMenuMusicPausedForGame(false);
    }
  }, [currentGame]);

  useEffect(() => {
    setIframeLoaded(false);
  }, [currentGame?.src]);

  useEffect(() => {
    if (currentGame) return;

    const cv = hubSnowCanvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    let flakes = [];

    const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const MAX_FLAKES = 120;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = Math.floor(w * DPR);
      cv.height = Math.floor(h * DPR);
      cv.style.width = w + 'px';
      cv.style.height = h + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      const targetCount = Math.max(45, Math.min(MAX_FLAKES, Math.floor((w * h) / 18000)));
      if (flakes.length > targetCount) flakes = flakes.slice(0, targetCount);
      while (flakes.length < targetCount) {
        flakes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 1 + Math.random() * 2.6,
          vy: 0.6 + Math.random() * 1.9,
          vx: -0.35 + Math.random() * 0.7,
          a: 0.15 + Math.random() * 0.35,
          sway: Math.random() * Math.PI * 2,
        });
      }
    };

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      for (const f of flakes) {
        f.sway += 0.01;
        f.x += f.vx + Math.sin(f.sway) * 0.25;
        f.y += f.vy;
        if (f.y > h + 8) {
          f.y = -10;
          f.x = Math.random() * w;
        }
        if (f.x < -10) f.x = w + 10;
        if (f.x > w + 10) f.x = -10;
        ctx.moveTo(f.x + f.r, f.y);
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();

      raf = window.requestAnimationFrame(tick);
    };

    resize();
    raf = window.requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [currentGame]);

  // ── Enter game — FREE to enter. Payment requested by the game itself on PLAY click ──
  const handleEnter = useCallback((game) => {
    ensureMenuMusic();
    if (!isConnected) {
      pendingGame.current = game;
      login(); // synchronous user gesture — required by browser popup rules
      return;
    }
    if (game?.id === 'derby') {
      setPreGame(game);
      return;
    }
    setCurrentGame(game);
  }, [isConnected, login, ensureMenuMusic]);

  // ── Auto-enter after wallet connects ──
  useEffect(() => {
    if (isConnected && pendingGame.current) {
      const g = pendingGame.current;
      pendingGame.current = null;
      if (g?.id === 'derby') setPreGame(g);
      else setCurrentGame(g);
    }
  }, [isConnected]);

  const PreMenu = preGame ? (
    <div
      onClick={() => setPreGame(null)}
      style={{
        position:"fixed",
        inset:0,
        zIndex:100002,
        background:"rgba(0,0,0,.82)",
        backdropFilter:"blur(14px)",
        display:"flex",
        alignItems:"center",
        justifyContent:"center",
        padding:18,
      }}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        style={{
          width:640,
          maxWidth:"100%",
          borderRadius:22,
          padding:"22px 22px",
          background:"linear-gradient(160deg,rgba(8,16,30,.96),rgba(6,10,18,.96))",
          border:`1px solid ${preGame.color1}55`,
          boxShadow:`0 26px 70px rgba(0,0,0,.75),0 0 40px ${preGame.color1}22`,
          color:"#fff",
          fontFamily:"'Baloo 2',cursive",
        }}
      >
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:14 }}>
          <div>
            <div style={{ fontSize:"2.3rem", lineHeight:1 }}>{preGame.emoji}</div>
            <div style={{ fontWeight:900, fontSize:"1.25rem", letterSpacing:".03em" }}>{preGame.title}</div>
            <div style={{ color:"rgba(255,255,255,.55)", fontSize:".88rem", marginTop:2 }}>{preGame.desc}</div>
          </div>
          <div style={{ textAlign:"right", fontSize:".72rem", color:"rgba(255,255,255,.45)" }}>
            Entry per race
            <div style={{ fontWeight:900, color:"rgba(255,255,255,.8)" }}>0.00001 ETH + fee</div>
            <div style={{ marginTop:6, color:"rgba(255,255,255,.35)" }}>Weekly resets Fri 00:00 UTC</div>
            <div style={{ marginTop:10, fontSize:".74rem", color:"rgba(255,255,255,.62)" }}>
              Lifetime Points
              <span style={{ marginLeft:8, fontWeight:900, color:"#ffd700" }}>{myLifetimeDerbyPoints().toLocaleString()}</span>
            </div>
            {isConnected && address && (
              <div style={{ marginTop:6, fontSize:".74rem", color:"rgba(255,255,255,.62)" }}>
                Weekly Points
                <span style={{ marginLeft:8, fontWeight:900, color:"#a8f0c6" }}>{myWeeklyPoints().toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop:14, padding:"12px 12px", borderRadius:16, background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.10)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
            <div style={{ fontWeight:900, letterSpacing:".08em", fontSize:".78rem", color:"rgba(255,255,255,.85)" }}>WEEKLY TOP 10</div>
            <div style={{ fontSize:".7rem", color:"rgba(255,255,255,.35)" }}>live</div>
          </div>
          <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6 }}>
            {(vs.weeklyLeaderboard?.top || []).slice(0, 5).map((r, i) => (
              <div key={String(r.address || i)} style={{ display:"flex", justifyContent:"space-between", gap:10, fontSize:".78rem" }}>
                <div style={{ color:"rgba(255,255,255,.65)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {i+1}. {r.nick ? String(r.nick) : String(r.address || '').slice(0,6)+'…'+String(r.address||'').slice(-4)}
                </div>
                <div style={{ fontWeight:900, color:"rgba(255,255,255,.9)" }}>{Number(r.points||0).toLocaleString()}</div>
              </div>
            ))}
            {(!vs.weeklyLeaderboard?.top || vs.weeklyLeaderboard.top.length === 0) && (
              <div style={{ fontSize:".78rem", color:"rgba(255,255,255,.35)" }}>No scores yet.</div>
            )}
          </div>
        </div>

        <div style={{ marginTop:14, display:"flex", gap:10 }}>
          <button
            onClick={() => setPreGame(null)}
            style={{
              flex:1,
              padding:"12px 0",
              borderRadius:14,
              border:"1px solid rgba(255,255,255,.14)",
              background:"transparent",
              color:"rgba(255,255,255,.7)",
              cursor:"pointer",
              fontWeight:900,
              letterSpacing:".08em",
              fontSize:".9rem",
            }}
          >
            BACK
          </button>
          <button
            onClick={() => {
              // Stop hub music only when actually entering the game iframe
              setMenuMusicPausedForGame(true);
              setCurrentGame(preGame);
              setPreGame(null);
            }}
            style={{
              flex:1.4,
              padding:"12px 0",
              borderRadius:14,
              border:`1px solid ${preGame.color1}66`,
              background:`linear-gradient(135deg,${preGame.color1},${preGame.color2})`,
              color:"#061018",
              cursor:"pointer",
              fontWeight:900,
              letterSpacing:".1em",
              fontSize:".95rem",
              boxShadow:`0 10px 30px ${preGame.color1}30`,
            }}
          >
            ENTER 🏁
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // ── Send player identity to iframe (nick should work even before wallet connects) ──
  useEffect(() => {
    if (!iframeRef.current) return;
    const t = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        { type:"AGW_SET_PLAYER", address: address || null, nick: vs.nick || "" },
        "*"
      );
    }, 600);
    return () => clearTimeout(t);
  }, [address, currentGame, vs.nick]);

  // ── iframe messages — pay-to-play from inside the game ──
  useEffect(() => {
    const onMsg = (e) => {
      if (e?.source && iframeRef.current?.contentWindow && e.source === iframeRef.current.contentWindow) {
        if (!vsBridgeRef.current?.win) {
          vsBridgeRef.current = { ...vsBridgeRef.current, win: e.source };
        }
      }

      if (e.data?.type === "AGW_PLAY") {
        setMenuMusicPausedForGame(true);
        if (!isConnected) {
          iframeRef.current?.contentWindow?.postMessage(
            { type:"AGW_TX_ERROR", msg:"Wallet not connected" }, "*"
          );
          return;
        }
        const gid = gameIdToUint8(currentGame?.id || "crush");
        if (!gid) {
          iframeRef.current?.contentWindow?.postMessage(
            { type:"AGW_TX_ERROR", msg:"Unknown game" }, "*"
          );
          return;
        }
        const data = encodeFunctionData({
          abi: ARCADE_ABI,
          functionName: "buyPlay",
          args: [gid],
        });
        // Fire tx, reply to iframe with result
        sendTransaction(
          { to: ARCADE_CONTRACT, value: FEE_PER_GAME, data },
          {
            onSuccess: () => {
              iframeRef.current?.contentWindow?.postMessage({ type:"AGW_START_GAME" }, "*");
            },
            onError: (err) => {
              const msg = err?.shortMessage || err?.message || "Rejected";
              iframeRef.current?.contentWindow?.postMessage({ type:"AGW_TX_ERROR", msg }, "*");
            },
          }
        );
      }

      if (e.data?.type === "AGW_WALLET_MENU") {
        setWalletMenuOpen(true);
      }

      if (e.data?.type === "AGW_NICK_MENU") {
        setNickModalOpen(true);
      }

      if (e.data?.type === "VS_FIND_MATCH") {
        if (!isConnected) {
          pendingGame.current = currentGame;
          login();
          return;
        }
        vsBridgeRef.current = { win: e.source || iframeRef.current?.contentWindow || null, gameId: e?.data?.gameId || null };
        vs.findMatch();
      }

      if (e.data?.type === "VS_CANCEL_FIND") {
        vs.cancelFind();
      }

      if (e.data?.type === "VS_CONFIRM_PAYMENT") {
        vs.confirmPayment();
      }

      if (e.data?.type === "VS_CHESS_MOVE") {
        const uci = String(e.data?.uci || "");
        if (uci) vs.sendChessMove(uci);
      }

      if (e.data?.type === "VS_CHAT_SEND") {
        const text = String(e.data?.text || "");
        if (text.trim()) vs.sendChat(text);
      }

      if (e.data?.type === "VS_RESIGN") {
        vs.resign();
      }

      if (e.data?.type === "VS_CANCEL_MATCH") {
        vs.cancelMatch();
      }

      if (e.data?.type === "LOBBY_CHAT_SEND") {
        const text = String(e.data?.text || "");
        if (text.trim()) vs.sendLobbyChat(text);
      }

      if (e.data?.type === "VS_CHALLENGE") {
        const to = String(e.data?.to || "");
        if (to) vs.challenge(to);
      }

      if (e.data?.type === "VS_CHALLENGE_RESPONSE") {
        const from = String(e.data?.from || "");
        const accept = !!e.data?.accept;
        if (from) vs.respondChallenge(from, accept);
      }

      if (e.data?.type === "CHESS_WEEKLY_POINTS") {
        const pts = Number(e.data?.points || 0);
        if (Number.isFinite(pts) && pts > 0) {
          console.log('[CHESS_WEEKLY_POINTS]', pts);
          vs.addWeeklyPoints(pts);
        }
      }

      if (e.data?.type === "DERBY_WEEKLY_POINTS") {
        const pts = Number(e.data?.points || 0);
        if (Number.isFinite(pts) && pts > 0) {
          console.log('[DERBY_WEEKLY_POINTS]', pts);
          vs.addWeeklyPoints(pts);
          addLocalWeeklyPoints(pts);
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [sendTransaction, isPending, currentGame, vs, address, addLocalWeeklyPoints]);


  useEffect(() => {
    const win = vsBridgeRef.current?.win;
    if (!win) return;

    if (vs.vsState === "finding") {
      win.postMessage({ type: "VS_FINDING" }, "*");
    }

    if (vs.vsState === "matched" && vs.matchData) {
      win.postMessage(
        { type: "VS_MATCHED", roomId: vs.matchData.roomId, opponent: vs.matchData.opponent, opponentNick: vs.matchData.opponentNick, seed: vs.matchData.seed },
        "*"
      );
    }

    if (vs.vsState === "playing") {
      win.postMessage({ type: "VS_GAME_START" }, "*");
    }

    if (vs.vsState === "idle") {
      win.postMessage({ type: "VS_IDLE" }, "*");
    }

    if (vs.vsState === "matched" && vs.matchData?.roomId) {
      if (typeof vs.matchData?.p1Paid === "boolean" || typeof vs.matchData?.p2Paid === "boolean") {
        win.postMessage({ type: "VS_PAYMENT_UPDATE", p1Paid: vs.matchData.p1Paid, p2Paid: vs.matchData.p2Paid, paid: vs.matchData.paid, paidBy: vs.matchData.paidBy }, "*");
      }
    }
  }, [vs.vsState, vs.matchData]);

  useEffect(() => {
    const win = vsBridgeRef.current?.win;
    if (!win) return;
    if (!vs.lastChessMove?.uci) return;
    win.postMessage({ type: "VS_CHESS_MOVE", uci: vs.lastChessMove.uci, from: vs.lastChessMove.from, ts: vs.lastChessMove.ts }, "*");
  }, [vs.lastChessMove]);

  useEffect(() => {
    const win = vsBridgeRef.current?.win;
    if (!win) return;
    if (!vs.lastChat?.text) return;
    win.postMessage({ type: "VS_CHAT_RECV", from: vs.lastChat.from, fromNick: vs.lastChat.fromNick, text: vs.lastChat.text, ts: vs.lastChat.ts }, "*");
  }, [vs.lastChat]);

  useEffect(() => {
    const win = vsBridgeRef.current?.win;
    if (!win) return;
    if (!vs.lastLobbyChat?.text) return;
    win.postMessage({ type: "LOBBY_CHAT_RECV", from: vs.lastLobbyChat.from, fromNick: vs.lastLobbyChat.fromNick, text: vs.lastLobbyChat.text, ts: vs.lastLobbyChat.ts }, "*");
  }, [vs.lastLobbyChat]);

  useEffect(() => {
    const win = vsBridgeRef.current?.win;
    if (!win) return;
    win.postMessage({ type: "LOBBY_USERS", users: vs.lobbyUsers }, "*");
  }, [vs.lobbyUsers]);

  useEffect(() => {
    const win = vsBridgeRef.current?.win;
    if (!win) return;
    if (!vs.lastChallengeInvite?.from) return;
    win.postMessage({ type: "VS_CHALLENGE_INVITE", from: vs.lastChallengeInvite.from, fromNick: vs.lastChallengeInvite.fromNick }, "*");
  }, [vs.lastChallengeInvite]);

  useEffect(() => {
    const win = vsBridgeRef.current?.win;
    if (!win) return;
    if (!vs.lastChallengeEvent?.type) return;
    win.postMessage({ type: "VS_CHALLENGE_EVENT", event: vs.lastChallengeEvent }, "*");
  }, [vs.lastChallengeEvent]);

  useEffect(() => {
    const win = vsBridgeRef.current?.win;
    if (!win) return;
    if (!vs.weeklyLeaderboard?.weeklyKey) return;
    win.postMessage({ type: "WEEKLY_LEADERBOARD", weeklyKey: vs.weeklyLeaderboard.weeklyKey, top: vs.weeklyLeaderboard.top }, "*");
  }, [vs.weeklyLeaderboard]);

  useEffect(() => {
    const win = vsBridgeRef.current?.win;
    if (!win) return;
    if (!vs.lastOpponentEvent?.type) return;
    win.postMessage({ type: "VS_OPPONENT_EVENT", event: vs.lastOpponentEvent }, "*");
  }, [vs.lastOpponentEvent]);

  const WalletMenu = (
    <div
      onClick={() => setWalletMenuOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "rgba(0,0,0,.78)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        style={{
          background: "rgba(5,20,15,.97)",
          border: "1px solid rgba(0,255,170,.28)",
          borderRadius: 18,
          padding: "26px 24px",
          maxWidth: 360,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 28px 56px rgba(0,0,0,.75)",
        }}
      >
        <div
          style={{
            fontFamily: "'Baloo 2',cursive",
            fontWeight: 900,
            fontSize: "1.06rem",
            color: "#a8f0c6",
            marginBottom: 8,
          }}
        >
          {isConnected && address ? (vs.nick ? `${vs.nick} (${shortAddr(address)})` : shortAddr(address)) : "Not connected"}
        </div>

        {isConnected && address && (
          <></>
        )}

        {isConnected && address ? (
          <>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(String(address));
                } catch {}
              }}
              style={{
                width: "100%",
                padding: "12px 0",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(255,255,255,.08)",
                color: "#fff",
                cursor: "pointer",
                fontFamily: "'Baloo 2',cursive",
                fontSize: ".88rem",
                fontWeight: 800,
                marginBottom: 10,
              }}
            >
              Copy Address
            </button>
            <button
              onClick={() => {
                disconnect();
                setWalletMenuOpen(false);
              }}
              style={{
                width: "100%",
                padding: "12px 0",
                borderRadius: 12,
                border: "1px solid rgba(255,80,80,.35)",
                background: "rgba(255,80,80,.10)",
                color: "#ffb3b3",
                cursor: "pointer",
                fontFamily: "'Baloo 2',cursive",
                fontSize: ".88rem",
                fontWeight: 900,
              }}
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              login();
              setWalletMenuOpen(false);
            }}
            style={{
              width: "100%",
              padding: "12px 0",
              borderRadius: 12,
              border: "1px solid rgba(0,255,170,.28)",
              background: "linear-gradient(135deg,rgba(0,255,170,.18),rgba(0,150,255,.18))",
              color: "#a8f0c6",
              cursor: "pointer",
              fontFamily: "'Baloo 2',cursive",
              fontSize: ".9rem",
              fontWeight: 900,
              backdropFilter: "blur(10px)",
            }}
          >
            Connect Wallet
          </button>
        )}

        <button
          onClick={() => setWalletMenuOpen(false)}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "10px 0",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.14)",
            background: "transparent",
            color: "rgba(255,255,255,.55)",
            cursor: "pointer",
            fontFamily: "'Baloo 2',cursive",
            fontSize: ".82rem",
            fontWeight: 800,
          }}
        >
          Close
        </button>
      </div>
    </div>
  );

  // ════════════ GAME VIEW ════════════
  if (currentGame) {
    return (
      <div style={{ position:"fixed", inset:0, zIndex:9999, background:"#050a06" }}>
        {walletMenuOpen && WalletMenu}
        <Modal
          state={modal}
          onClose={() => { setModal(null); setCurrentGame(null); }}
        />
        <button
          onClick={() => { setCurrentGame(null); setModal(null); }}
          style={{
            position:"fixed", top:12, right:12, zIndex:10000,
            background:"rgba(0,0,0,.75)", backdropFilter:"blur(10px)",
            border:"1px solid rgba(255,255,255,.15)", color:"#fff", borderRadius:12,
            padding:"6px 14px", cursor:"pointer",
            fontFamily:"'Baloo 2',cursive", fontSize:".78rem", fontWeight:700,
          }}
        >
          ← Back
        </button>

        {!iframeLoaded && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9998,
              background: 'radial-gradient(1200px 800px at 50% 35%, rgba(0,255,170,.12), rgba(0,0,0,.92) 70%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'opacity .18s ease',
              opacity: 1,
              pointerEvents: 'none',
            }}
          >
            <div style={{
              fontFamily:"'Baloo 2',cursive",
              fontWeight: 900,
              letterSpacing: '.12em',
              color: 'rgba(255,255,255,.72)',
              fontSize: '.95rem',
              textTransform: 'uppercase',
            }}>
              Loading…
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={currentGame.src}
          style={{ width:"100%", height:"100dvh", border:"none", display:"block", background:"transparent" }}
          onLoad={() => {
            setIframeLoaded(true);
            if (address) setTimeout(() =>
              iframeRef.current?.contentWindow?.postMessage({ type:"AGW_SET_PLAYER", address, nick: vs.nick }, "*")
            , 500);

            vsBridgeRef.current = { ...vsBridgeRef.current, win: iframeRef.current?.contentWindow || null };

            const win = iframeRef.current?.contentWindow;
            if (win) {
              win.postMessage({ type: "LOBBY_USERS", users: vs.lobbyUsers }, "*");
            }
          }}
        />
      </div>
    );
  }

  // ════════════ HUB VIEW ════════════
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;600;700;800&family=Righteous&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        html, body, #root { width:100%; height:100%; overflow-x:hidden; }
        @keyframes auroraMove    { to { transform:translate(-5vw,3vh) rotate(2deg); } }
        @keyframes auroraShimmer { to { opacity:1; transform:scaleY(1.2); } }
        @keyframes twinkle       { 0%,100%{opacity:.12} 50%{opacity:.85} }
        @keyframes penguinFloat  { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-12px) rotate(2deg)} }
        @keyframes titleGlow     { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.18)} }
        @keyframes fadeInUp      { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideIn       { from{opacity:0;transform:translateY(34px) scale(.95)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes modalIn       { from{opacity:0;transform:scale(.9)} to{opacity:1;transform:scale(1)} }
        button { outline:none; }
        button:focus-visible { outline:2px solid rgba(0,255,170,.55); outline-offset:3px; }
      `}</style>

      <Aurora />
      <Particles />

      {PreMenu}

      <canvas
        ref={hubSnowCanvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          opacity: 0.75,
          mixBlendMode: 'screen',
        }}
      />

      {walletMenuOpen && WalletMenu}

      {nickModalOpen && (
        <div
          onClick={() => setNickModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100001,
            background: "rgba(0,0,0,.78)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            style={{
              background: "rgba(5,20,15,.97)",
              border: "1px solid rgba(0,255,170,.28)",
              borderRadius: 18,
              padding: "22px 20px",
              maxWidth: 360,
              width: "100%",
              boxShadow: "0 28px 56px rgba(0,0,0,.75)",
              textAlign: "left",
            }}
          >
            <div style={{
              fontFamily: "'Baloo 2',cursive",
              fontWeight: 900,
              fontSize: "1.05rem",
              color: "#a8f0c6",
              marginBottom: 10,
            }}>Nickname</div>

            <input
              value={vs.nick || ""}
              onChange={(e) => vs.setNickname(e.target.value)}
              placeholder="Your nick"
              style={{
                width: "100%",
                borderRadius: 12,
                padding: "12px 12px",
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(0,0,0,.25)",
                color: "#fff",
                outline: "none",
                fontFamily: "'Baloo 2',cursive",
                fontSize: ".92rem",
              }}
            />

            <button
              onClick={() => setNickModalOpen(false)}
              style={{
                marginTop: 12,
                width: "100%",
                padding: "10px 0",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,.14)",
                background: "transparent",
                color: "rgba(255,255,255,.7)",
                cursor: "pointer",
                fontFamily: "'Baloo 2',cursive",
                fontSize: ".82rem",
                fontWeight: 800,
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div style={{
        position:"relative", zIndex:2, minHeight:"100vh",
        display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        padding:"40px 20px", gap:16,
      }}>

        <div style={{
          position:"fixed",
          left:16,
          bottom:16,
          zIndex:120,
          display:"flex",
          alignItems:"center",
          gap:10,
          padding:"10px 12px",
          borderRadius:14,
          background:"rgba(0,0,0,.55)",
          border:"1px solid rgba(255,255,255,.14)",
          backdropFilter:"blur(10px)",
          fontFamily:"'Baloo 2',cursive",
          color:"rgba(255,255,255,.85)",
        }}>
          <button
            onClick={() => setMenuMusicMuted(v => !v)}
            style={{
              background:"rgba(255,255,255,.06)",
              border:"1px solid rgba(255,255,255,.12)",
              color:"#fff",
              borderRadius:12,
              padding:"8px 10px",
              cursor:"pointer",
              fontWeight:900,
              fontSize:".8rem",
              letterSpacing:".06em",
            }}
          >
            {menuMusicMuted ? 'MUTED' : 'MUSIC'}
          </button>

          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={menuMusicVol}
            onChange={(e) => setMenuMusicVol(parseFloat(e.target.value))}
            style={{ width: 140 }}
          />
        </div>

        {/* Wallet connect button — only shown when not connected, top right */}
        {!isConnected && (
          <div style={{ position:"fixed", top:16, right:16, zIndex:100, animation:"fadeInUp .5s ease-out" }}>
            <button
              onClick={login}
              style={{
                background:"linear-gradient(135deg,rgba(0,255,170,.15),rgba(0,150,255,.15))",
                border:"1px solid rgba(0,255,170,.3)", borderRadius:14, padding:"10px 22px",
                fontFamily:"'Baloo 2',cursive", fontSize:".85rem", fontWeight:700,
                color:"#a8f0c6", cursor:"pointer", backdropFilter:"blur(10px)",
              }}
            >
              🔗 Connect Wallet
            </button>
          </div>
        )}

        {isConnected && (
          <div style={{ position:"fixed", top:16, right:16, zIndex:100, display:"flex", gap:10, animation:"fadeInUp .5s ease-out" }}>
            <button
              onClick={() => setNickModalOpen(true)}
              style={{
                background:"rgba(255,255,255,.06)",
                border:"1px solid rgba(255,255,255,.14)",
                color:"#fff",
                padding:"10px 14px",
                borderRadius:14,
                cursor:"pointer",
                fontFamily:"'Baloo 2',cursive",
                fontWeight:800,
                fontSize:".8rem",
                letterSpacing:".08em",
              }}
            >
              {vs.nick ? vs.nick.toUpperCase() : 'SET NICK'}
            </button>
            <button
              onClick={() => setWalletMenuOpen(true)}
              style={{
                background:"linear-gradient(135deg,rgba(0,255,170,.15),rgba(0,150,255,.15))",
                border:"1px solid rgba(0,255,170,.3)",
                borderRadius:14,
                padding:"10px 16px",
                fontFamily:"'Baloo 2',cursive",
                fontSize:".8rem",
                fontWeight:900,
                color:"#a8f0c6",
                cursor:"pointer",
                backdropFilter:"blur(10px)",
              }}
            >
              WALLET
            </button>
          </div>
        )}

        {/* Logo - NO PENGUIN */}
        <div style={{ textAlign:"center", animation:"fadeInUp .7s ease-out", marginBottom:12 }}>
          <h1 style={{
            fontFamily:"'Righteous',cursive",
            fontSize:"clamp(2.8rem,7vw,5.2rem)", fontWeight:400,
            background:"linear-gradient(135deg,#fff 0%,#00d9ff 35%,#a855f7 65%,#fff 100%)",
            WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
            animation:"titleGlow 4s ease-in-out infinite",
            letterSpacing:".04em", lineHeight:1.1,
            textShadow:"0 0 60px rgba(0,217,255,.3)",
          }}>
            PUDGY ARCADE
          </h1>
          <p style={{
            fontFamily:"'Baloo 2',cursive", fontSize:"clamp(.85rem,2.2vw,1.1rem)",
            color:"rgba(255,255,255,.4)", marginTop:10, letterSpacing:".15em",
            fontWeight:600,
          }}>
            PLAY · EARN · COLLECT
          </p>
        </div>

        <div style={{
          width:100, height:1,
          background:"linear-gradient(90deg,transparent,rgba(0,255,170,.3),transparent)",
        }} />

        {!isConnected ? (
  <p style={{
    fontFamily:"'Baloo 2',cursive", fontSize:".8rem",
    color:"rgba(0,255,170,.45)", animation:"fadeInUp .6s ease-out",
  }}>
    ↗ Connect your Abstract wallet to play
  </p>
) : address && (
  <p style={{
    fontFamily:"'Baloo 2',cursive", fontSize:".72rem",
    color:"rgba(168,240,198,.35)", animation:"fadeInUp .5s ease-out",
    letterSpacing:".04em",
  }}>
    🔗 {address.slice(0,6)}…{address.slice(-4)}
  </p>
)}

        {/* Game Cards */}
        <div style={{ display:"flex", flexWrap:"wrap", gap:28, justifyContent:"center", marginTop:16, maxWidth:1000 }}>
          {GAMES.map((game, i) => (
            <div key={game.id} style={{ animation:`slideIn .7s ease-out ${.1+i*.15}s both` }}>
              <GameCard
                game={game}
                disabled={false}
                onEnter={handleEnter}
              />
            </div>
          ))}
        </div>

        <p style={{
          marginTop:24, fontFamily:"'Baloo 2',cursive", fontSize:".6rem",
          color:"rgba(255,255,255,.1)", textAlign:"center",
          animation:"fadeInUp 1s ease-out .5s both",
        }}>
          Built on Abstract Chain · Powered by Pudgy Penguins
        </p>
      </div>
    </>
  );
}
