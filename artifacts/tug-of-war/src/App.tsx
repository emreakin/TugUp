import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = "/api";
const WIN_THRESHOLD_LOCAL = 10;

type Screen = "home" | "online" | "game" | "1v1";
type GameState = "playing" | "left_wins" | "right_wins";

interface Matchup {
  id: string;
  leftTeam: string;
  rightTeam: string;
  leftColor: string;
  rightColor: string;
  emoji: string;
  leftWins: number;
  rightWins: number;
  isActive: boolean;
}

interface Suggestion {
  id: number;
  leftTeam: string;
  rightTeam: string;
  votes: number;
  hasVoted: boolean;
}

interface VoteState {
  offset: number;
  leftPulls: number;
  rightPulls: number;
  winThreshold: number;
  accepted?: boolean;
  cooldownSeconds?: number | null;
}

// ─── Home Screen ─────────────────────────────────────────────────────────────

function HomeScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const modes = [
    { key: "quick" as const, label: "Quick Game", emoji: "⚡", color: "#ef4444" },
    { key: "1v1" as const, label: "1v1 Yerel", emoji: "👥", color: "#3b82f6" },
    { key: "online" as const, label: "Online", emoji: "🌐", color: "#10b981" },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-between py-16 px-7"
      style={{ background: "#0f172a" }}>
      {/* Header */}
      <div className="flex flex-col items-center gap-3 mt-8">
        <div style={{
          width: 120, height: 120, borderRadius: 28, overflow: "hidden",
          boxShadow: "0 8px 32px rgba(239,68,68,0.4)",
        }}>
          <img src="/icon.png" alt="TugUp"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }} />
        </div>
        <h1 style={{
          fontSize: 52, fontWeight: 900, color: "#f8fafc",
          letterSpacing: 4, margin: 0, lineHeight: 1,
        }}>TugUp</h1>
        <p style={{ color: "#64748b", fontSize: 13, fontWeight: 600, margin: 0 }}>
          Dünyanın en büyük gücünü belirle!
        </p>
      </div>

      {/* Mode buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 420 }}>
        {modes.map((m) => (
          <button key={m.key}
            onClick={() => {
              if (m.key === "quick") {
                alert("Çok Yakında! Bu mod henüz aktif değil.");
                return;
              }
              onNavigate(m.key);
            }}
            style={{
              backgroundColor: m.color, borderRadius: 20,
              paddingTop: 22, paddingBottom: 22, paddingLeft: 24, paddingRight: 24,
              display: "flex", alignItems: "center", gap: 14, border: "none",
              cursor: "pointer", width: "100%", boxShadow: `0 6px 20px ${m.color}55`,
              transition: "transform 0.1s ease, opacity 0.1s ease",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            onMouseDown={e => (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
          >
            <span style={{ fontSize: 28, width: 40, textAlign: "center" }}>{m.emoji}</span>
            <span style={{ flex: 1, fontSize: 20, fontWeight: 700, color: "#fff", textAlign: "left" }}>
              {m.label}
            </span>
            <span style={{ fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>›</span>
          </button>
        ))}
      </div>

      <p style={{ color: "#475569", fontSize: 11, fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>
        v0.0.3 · TugUp
      </p>
    </div>
  );
}

// ─── Online Screen ────────────────────────────────────────────────────────────

function OnlineScreen({
  onBack,
  onPlay,
}: {
  onBack: () => void;
  onPlay: (m: Matchup) => void;
}) {
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [loading, setLoading] = useState(true);
  const [leftTeam, setLeftTeam] = useState("");
  const [rightTeam, setRightTeam] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [votingId, setVotingId] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/matchups`)
      .then(r => r.json()).then(setMatchups).catch(() => {}).finally(() => setLoading(false));
    fetch(`${API_BASE}/suggestions`)
      .then(r => r.json()).then(setSuggestions).catch(() => {}).finally(() => setSuggestionsLoading(false));
  }, []);

  const handleSubmit = async () => {
    const l = leftTeam.trim(), r = rightTeam.trim();
    if (!l || !r) return alert("Her iki tarafı da doldurmalısın.");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leftTeam: l, rightTeam: r }),
      });
      if (res.ok) {
        const created = await res.json();
        setSuggestions(prev => [created, ...prev].sort((a, b) => b.votes - a.votes));
        setLeftTeam(""); setRightTeam("");
      }
    } finally { setSubmitting(false); }
  };

  const handleVote = async (id: number) => {
    const s = suggestions.find(x => x.id === id);
    if (!s || s.hasVoted) return;
    setVotingId(id);
    try {
      const res = await fetch(`${API_BASE}/suggestions/${id}/vote`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.accepted) {
          setSuggestions(prev =>
            prev.map(x => x.id === id ? { ...x, votes: x.votes + 1, hasVoted: true } : x)
              .sort((a, b) => b.votes - a.votes)
          );
        } else {
          setSuggestions(prev => prev.map(x => x.id === id ? { ...x, hasVoted: true } : x));
        }
      }
    } finally { setVotingId(null); }
  };

  const activeMatchups = matchups.filter(m => m.isActive);
  const inactiveMatchups = matchups.filter(m => !m.isActive);

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", overflowY: "auto" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "48px 20px 40px" }}>
        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: 36, position: "relative" }}>
          <button onClick={onBack} style={backBtnStyle}>
            ← Ana Menü
          </button>
          <h1 style={{ fontSize: 40, fontWeight: 900, color: "#ef4444", letterSpacing: 2, margin: 0 }}>
            TUG OF WAR
          </h1>
          <p style={{ color: "#475569", fontSize: 12, fontWeight: 600, letterSpacing: 3, margin: "6px 0 0" }}>
            MÜCADELE SEÇ
          </p>
        </div>

        {/* Active matchups */}
        {loading ? (
          <div style={{ textAlign: "center", color: "#ef4444", padding: 32 }}>Yükleniyor…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {activeMatchups.map(m => {
              const leftLeads = m.leftWins > m.rightWins;
              const rightLeads = m.rightWins > m.leftWins;
              return (
                <button key={m.id} onClick={() => onPlay(m)} style={cardStyle(true)}
                  onMouseEnter={e => Object.assign((e.currentTarget as HTMLElement).style, { opacity: "0.75", transform: "scale(0.98)" })}
                  onMouseLeave={e => Object.assign((e.currentTarget as HTMLElement).style, { opacity: "1", transform: "scale(1)" })}
                >
                  <span style={{ fontSize: 28 }}>{m.emoji}</span>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: m.leftColor }}>
                      {leftLeads ? "👑 " : ""}{m.leftTeam}
                    </span>
                    <span style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>vs</span>
                    <span style={{ fontSize: 17, fontWeight: 700, color: m.rightColor }}>
                      {m.rightTeam}{rightLeads ? " 👑" : ""}
                    </span>
                  </div>
                  <span style={{ color: "#475569", fontSize: 18 }}>›</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Inactive matchups */}
        {inactiveMatchups.length > 0 && (
          <>
            <div style={dividerStyle} />
            <p style={sectionTitleStyle}>BEKLEMEDEKİLER</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {inactiveMatchups.map(m => (
                <div key={m.id} style={cardStyle(false)}>
                  <span style={{ fontSize: 28, opacity: 0.5 }}>{m.emoji}</span>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: m.leftColor, opacity: 0.5 }}>{m.leftTeam}</span>
                    <span style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>vs</span>
                    <span style={{ fontSize: 17, fontWeight: 700, color: m.rightColor, opacity: 0.5 }}>{m.rightTeam}</span>
                  </div>
                  <span style={{ fontSize: 18 }}>⏳</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={dividerStyle} />

        {/* Suggest a matchup */}
        <p style={sectionTitleStyle}>MÜCADELE ÖNER</p>
        <div style={{ background: "#1e293b", borderRadius: 18, padding: 20, border: "1px solid #334155", display: "flex", flexDirection: "column", gap: 12 }}>
          <input value={leftTeam} onChange={e => setLeftTeam(e.target.value)} maxLength={50}
            placeholder="Takım / Kişi 1"
            style={{ ...inputStyle }} />
          <p style={{ textAlign: "center", color: "#475569", fontWeight: 600, fontSize: 13, margin: 0 }}>vs</p>
          <input value={rightTeam} onChange={e => setRightTeam(e.target.value)} maxLength={50}
            placeholder="Takım / Kişi 2"
            style={{ ...inputStyle }} />
          <button onClick={handleSubmit} disabled={submitting}
            style={{
              background: "#ef4444", color: "#fff", border: "none", borderRadius: 14,
              paddingTop: 14, paddingBottom: 14, fontSize: 15, fontWeight: 700,
              letterSpacing: 2, cursor: "pointer", marginTop: 4, opacity: submitting ? 0.6 : 1,
            }}>
            {submitting ? "…" : "TALEP ET"}
          </button>
        </div>

        {/* Suggestions list */}
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {suggestionsLoading ? (
            <p style={{ color: "#475569", textAlign: "center" }}>Yükleniyor…</p>
          ) : suggestions.length === 0 ? (
            <p style={{ color: "#475569", textAlign: "center", fontSize: 14 }}>Henüz öneri yok. İlk sen öner!</p>
          ) : suggestions.map(s => (
            <div key={s.id} style={{ background: "#1e293b", borderRadius: 18, padding: 16, border: "1px solid #334155", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{s.leftTeam}</span>
                <span style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>vs</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{s.rightTeam}</span>
              </div>
              <button onClick={() => handleVote(s.id)} disabled={s.hasVoted || votingId === s.id}
                style={{
                  background: s.hasVoted ? "#166534" : "#334155", border: "none", borderRadius: 12,
                  paddingTop: 10, paddingBottom: 10, paddingLeft: 14, paddingRight: 14,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  cursor: s.hasVoted ? "default" : "pointer", minWidth: 52,
                }}>
                <span style={{ color: "#f1f5f9", fontSize: 12, fontWeight: 700 }}>{s.hasVoted ? "✓" : "▲"}</span>
                <span style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 700 }}>{s.votes}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Game Screen (Online / API) ───────────────────────────────────────────────

function GameScreen({ matchup, onBack }: { matchup: Matchup; onBack: () => void }) {
  const [voteState, setVoteState] = useState<VoteState | null>(null);
  const [gameState, setGameState] = useState<GameState>("playing");
  const [cooldownSecs, setCooldownSecs] = useState(0);
  const [pendingSide, setPendingSide] = useState<"left" | "right">("left");
  const [isLoading, setIsLoading] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const winThreshold = voteState?.winThreshold ?? 100;
  const offset = voteState?.offset ?? 0;

  // Fetch initial vote state
  useEffect(() => {
    fetch(`${API_BASE}/votes/${matchup.id}`)
      .then(r => r.json())
      .then((data: VoteState) => {
        setVoteState(data);
        if (data.offset <= -data.winThreshold) setGameState("left_wins");
        else if (data.offset >= data.winThreshold) setGameState("right_wins");
      })
      .catch(() => {});
  }, [matchup.id]);

  // Cooldown countdown
  useEffect(() => {
    if (cooldownSecs > 0) {
      cooldownRef.current = setInterval(() => {
        setCooldownSecs(s => {
          if (s <= 1) { clearInterval(cooldownRef.current!); return 0; }
          return s - 1;
        });
      }, 1000);
    }
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, [cooldownSecs > 0]);

  const handlePull = useCallback(async (side: "left" | "right") => {
    if (gameState !== "playing" || isLoading || cooldownSecs > 0) return;
    setPendingSide(side);
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/votes/${matchup.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side }),
      });
      if (!res.ok) return;
      const data: VoteState = await res.json();
      setVoteState(data);
      if (!data.accepted && data.cooldownSeconds) {
        setCooldownSecs(data.cooldownSeconds);
      }
      if (data.offset <= -data.winThreshold) setGameState("left_wins");
      else if (data.offset >= data.winThreshold) setGameState("right_wins");
    } finally {
      setIsLoading(false);
    }
  }, [gameState, isLoading, cooldownSecs, matchup.id]);

  const resetGame = () => {
    setGameState("playing");
    setCooldownSecs(0);
    fetch(`${API_BASE}/votes/${matchup.id}`)
      .then(r => r.json()).then(setVoteState).catch(() => {});
  };

  const leftRemaining = Math.max(0, winThreshold + offset);
  const rightRemaining = Math.max(0, winThreshold - offset);
  const winner = gameState === "left_wins" ? matchup.leftTeam : matchup.rightTeam;
  const winnerColor = gameState === "left_wins" ? matchup.leftColor : matchup.rightColor;

  // Progress bar: offset goes from -winThreshold (left wins) to +winThreshold (right wins)
  const progressPct = ((offset + winThreshold) / (winThreshold * 2)) * 100;

  const formatCooldown = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={onBack} style={backBtnStyle}>← Geri</button>
        <div style={{ display: "flex", gap: 32 }}>
          <div style={{ textAlign: "left" }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: matchup.leftColor }}>
              {matchup.leftTeam}
            </span>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
              {matchup.leftWins} kazanım
            </div>
          </div>
          <div style={{ color: "#334155", fontWeight: 700, alignSelf: "center" }}>vs</div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: matchup.rightColor }}>
              {matchup.rightTeam}
            </span>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
              {matchup.rightWins} kazanım
            </div>
          </div>
        </div>
        <div style={{ width: 60 }} />
      </div>

      {/* Pull counts */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 28px 0" }}>
        <span style={{ fontSize: 28, fontWeight: 900, color: matchup.leftColor }}>
          {voteState?.leftPulls ?? 0}
        </span>
        <span style={{ fontSize: 28, fontWeight: 900, color: matchup.rightColor }}>
          {voteState?.rightPulls ?? 0}
        </span>
      </div>

      {/* Arena */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
        <div style={{ width: "100%", maxWidth: 600, display: "flex", alignItems: "center", gap: 0 }}>
          {/* Left avatar area */}
          <div style={{ width: 110, display: "flex", justifyContent: "center", flexShrink: 0 }}>
            <CharacterAvatar color={matchup.leftColor} flipped={false} />
          </div>

          {/* Rope */}
          <div style={{ flex: 1, position: "relative", height: 80, overflow: "hidden" }}>
            <img
              src="/rope.png"
              alt=""
              style={{
                position: "absolute", top: "50%",
                transform: `translateX(${(offset / winThreshold) * 40}%) translateY(-50%)`,
                transition: "transform 0.15s ease",
                height: 28, width: "100%", objectFit: "fill",
              }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
            {/* Fallback rope */}
            <div style={{
              position: "absolute", top: "50%", left: 0, right: 0,
              transform: `translateX(${(offset / winThreshold) * 40}%) translateY(-50%)`,
              transition: "transform 0.15s ease",
              height: 14,
              background: "repeating-linear-gradient(90deg, #92400e 0px, #b45309 4px, #d97706 8px, #b45309 12px, #92400e 16px)",
              borderRadius: 7,
            }} />
            {/* Center line */}
            <div style={{
              position: "absolute", top: 0, bottom: 0, left: "50%",
              transform: "translateX(-50%)", width: 4, background: "#ef4444",
              boxShadow: "0 0 10px rgba(239,68,68,0.9)", borderRadius: 2, zIndex: 10,
            }} />
          </div>

          {/* Right avatar area */}
          <div style={{ width: 110, display: "flex", justifyContent: "center", flexShrink: 0 }}>
            <CharacterAvatar color={matchup.rightColor} flipped={true} />
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ padding: "0 20px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          background: matchup.leftColor + "22", borderRadius: 12, padding: "8px 14px",
          border: `2px solid ${matchup.leftColor}`, minWidth: 60, textAlign: "center",
        }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: matchup.leftColor }}>{leftRemaining}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: matchup.leftColor }}>KALDI</div>
        </div>
        <div style={{ flex: 1, height: 14, background: "#1e293b", borderRadius: 7, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${progressPct}%`,
            background: `linear-gradient(to right, ${matchup.leftColor}, ${matchup.rightColor})`,
            borderRadius: 7, transition: "width 0.2s ease",
          }} />
        </div>
        <div style={{
          background: matchup.rightColor + "22", borderRadius: 12, padding: "8px 14px",
          border: `2px solid ${matchup.rightColor}`, minWidth: 60, textAlign: "center",
        }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: matchup.rightColor }}>{rightRemaining}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: matchup.rightColor }}>KALDI</div>
        </div>
      </div>

      {/* Pull buttons */}
      <div style={{ padding: "0 16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <PullBtn
            color={matchup.leftColor}
            label={cooldownSecs > 0 ? `⏳ ${formatCooldown(cooldownSecs)}` : "💪 ÇEK!"}
            disabled={gameState !== "playing" || isLoading || cooldownSecs > 0}
            onClick={() => handlePull("left")}
          />
          <PullBtn
            color={matchup.rightColor}
            label={cooldownSecs > 0 ? `${formatCooldown(cooldownSecs)} ⏳` : "ÇEK! 💪"}
            disabled={gameState !== "playing" || isLoading || cooldownSecs > 0}
            onClick={() => handlePull("right")}
          />
        </div>
        {cooldownSecs > 0 && (
          <p style={{ textAlign: "center", color: "#64748b", fontSize: 13, margin: 0 }}>
            Sonraki oy için {formatCooldown(cooldownSecs)} bekleniyor
          </p>
        )}
      </div>

      {/* Win modal */}
      {gameState !== "playing" && (
        <WinModal
          winner={winner}
          winnerColor={winnerColor}
          gameState={gameState}
          onReplay={resetGame}
          onBack={onBack}
        />
      )}
    </div>
  );
}

// ─── 1v1 Local Screen ─────────────────────────────────────────────────────────

function LocalGameScreen({ onBack }: { onBack: () => void }) {
  const WIN = WIN_THRESHOLD_LOCAL;
  const [offset, setOffset] = useState(0);
  const [gameState, setGameState] = useState<GameState>("playing");
  const [scoreLeft, setScoreLeft] = useState(0);
  const [scoreRight, setScoreRight] = useState(0);

  const handlePull = (side: "left" | "right") => {
    if (gameState !== "playing") return;
    const delta = side === "left" ? -1 : 1;
    setOffset(prev => {
      const next = Math.max(-WIN, Math.min(WIN, prev + delta));
      if (next <= -WIN) { setGameState("left_wins"); setScoreLeft(s => s + 1); }
      else if (next >= WIN) { setGameState("right_wins"); setScoreRight(s => s + 1); }
      return next;
    });
  };

  const resetGame = () => { setOffset(0); setGameState("playing"); };

  const leftRemaining = Math.max(0, WIN + offset);
  const rightRemaining = Math.max(0, WIN - offset);
  const progressPct = ((offset + WIN) / (WIN * 2)) * 100;

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={onBack} style={backBtnStyle}>← Ana Menü</button>
        <h2 style={{ color: "#f8fafc", fontSize: 18, fontWeight: 700, margin: 0 }}>1v1 Yerel</h2>
        <div style={{ width: 70 }} />
      </div>

      {/* Scores */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 28px 0" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#ef4444" }}>Oyuncu 1</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#ef4444" }}>{scoreLeft}</div>
        </div>
        <div style={{ color: "#334155", fontWeight: 700 }}>vs</div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6" }}>Oyuncu 2</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#3b82f6" }}>{scoreRight}</div>
        </div>
      </div>

      {/* Arena */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
        <div style={{ width: "100%", maxWidth: 600, display: "flex", alignItems: "center" }}>
          <div style={{ width: 110, display: "flex", justifyContent: "center", flexShrink: 0 }}>
            <CharacterAvatar color="#ef4444" flipped={false} />
          </div>
          <div style={{ flex: 1, position: "relative", height: 80, overflow: "hidden" }}>
            <div style={{
              position: "absolute", top: "50%", left: 0, right: 0,
              transform: `translateX(${(offset / WIN) * 40}%) translateY(-50%)`,
              transition: "transform 0.1s ease",
              height: 14,
              background: "repeating-linear-gradient(90deg, #92400e 0px, #b45309 4px, #d97706 8px, #b45309 12px, #92400e 16px)",
              borderRadius: 7,
            }} />
            <div style={{
              position: "absolute", top: 0, bottom: 0, left: "50%",
              transform: "translateX(-50%)", width: 4, background: "#ef4444",
              boxShadow: "0 0 10px rgba(239,68,68,0.9)", borderRadius: 2, zIndex: 10,
            }} />
          </div>
          <div style={{ width: 110, display: "flex", justifyContent: "center", flexShrink: 0 }}>
            <CharacterAvatar color="#3b82f6" flipped={true} />
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ padding: "0 20px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ background: "#ef444422", borderRadius: 12, padding: "8px 14px", border: "2px solid #ef4444", minWidth: 60, textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#ef4444" }}>{leftRemaining}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#ef4444" }}>KALDI</div>
        </div>
        <div style={{ flex: 1, height: 14, background: "#1e293b", borderRadius: 7, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${progressPct}%`,
            background: "linear-gradient(to right, #ef4444, #3b82f6)",
            borderRadius: 7, transition: "width 0.1s ease",
          }} />
        </div>
        <div style={{ background: "#3b82f622", borderRadius: 12, padding: "8px 14px", border: "2px solid #3b82f6", minWidth: 60, textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#3b82f6" }}>{rightRemaining}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6" }}>KALDI</div>
        </div>
      </div>

      {/* Pull buttons */}
      <div style={{ padding: "0 16px 32px", display: "flex", gap: 12 }}>
        <PullBtn color="#ef4444" label="😤 ÇEK!" disabled={gameState !== "playing"} onClick={() => handlePull("left")} />
        <PullBtn color="#3b82f6" label="ÇEK! 😤" disabled={gameState !== "playing"} onClick={() => handlePull("right")} />
      </div>

      {gameState !== "playing" && (
        <WinModal
          winner={gameState === "left_wins" ? "Oyuncu 1" : "Oyuncu 2"}
          winnerColor={gameState === "left_wins" ? "#ef4444" : "#3b82f6"}
          gameState={gameState}
          onReplay={resetGame}
          onBack={onBack}
        />
      )}
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function CharacterAvatar({ color, flipped }: { color: string; flipped: boolean }) {
  return (
    <div style={{ position: "relative", width: 96, height: 96 }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: color + "33",
        boxShadow: `0 0 20px ${color}66`,
      }} />
      <img src="/character.png" alt=""
        style={{
          width: 96, height: 96, objectFit: "contain",
          transform: flipped ? "scaleX(-1)" : "none",
          position: "relative", zIndex: 1,
        }}
        onError={e => {
          const el = e.currentTarget as HTMLImageElement;
          el.style.display = "none";
          const fallback = document.createElement("div");
          fallback.textContent = "🧑";
          fallback.style.cssText = "font-size:60px;text-align:center;line-height:96px;";
          el.parentElement?.appendChild(fallback);
        }} />
    </div>
  );
}

function PullBtn({
  color, label, disabled, onClick,
}: {
  color: string; label: string; disabled: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        flex: 1, paddingTop: 20, paddingBottom: 20,
        background: color + "22", border: `2px solid ${color}`,
        borderRadius: 18, fontSize: 18, fontWeight: 900, color,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "transform 0.08s ease",
        letterSpacing: 1,
      }}
      onMouseDown={e => { if (!disabled) (e.currentTarget as HTMLElement).style.transform = "scale(0.94)"; }}
      onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
    >
      {label}
    </button>
  );
}

function WinModal({
  winner, winnerColor, gameState, onReplay, onBack,
}: {
  winner: string; winnerColor: string; gameState: GameState;
  onReplay: () => void; onBack: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
      backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 50, padding: 24,
    }}>
      <div style={{
        background: "linear-gradient(135deg, #1e293b, #0f172a)",
        border: `2px solid ${winnerColor}`,
        boxShadow: `0 0 60px ${winnerColor}44`,
        borderRadius: 28, padding: 40, maxWidth: 360, width: "100%",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center",
      }}>
        <div style={{ fontSize: 64 }}>🏆</div>
        <div style={{ fontSize: 32, fontWeight: 900, color: winnerColor }}>{winner}</div>
        <div style={{ fontSize: 20, color: "#f8fafc", fontWeight: 600 }}>Kazandı!</div>
        <div style={{ fontSize: 48 }}>{gameState === "left_wins" ? "🎉" : "🎊"}</div>
        <div style={{ display: "flex", gap: 12, width: "100%" }}>
          <button onClick={onReplay} style={{
            flex: 1, padding: "14px 0", borderRadius: 16, border: "2px solid rgba(255,255,255,0.3)",
            background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
          }}>
            Tekrar Oyna 🔄
          </button>
          <button onClick={onBack} style={{
            flex: 1, padding: "14px 0", borderRadius: 16, border: "2px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
          }}>
            Menü ←
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const backBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12, padding: "8px 14px", color: "#94a3b8", fontSize: 13, fontWeight: 600,
  cursor: "pointer",
};

const dividerStyle: React.CSSProperties = {
  height: 1, background: "#1e293b", margin: "32px 0",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: "#475569", letterSpacing: 3,
  textTransform: "uppercase", textAlign: "center", marginBottom: 20, marginTop: 0,
};

const inputStyle: React.CSSProperties = {
  background: "#0f172a", border: "1px solid #334155", borderRadius: 12,
  padding: "12px 16px", color: "#f1f5f9", fontSize: 16, fontWeight: 600, width: "100%",
  boxSizing: "border-box", outline: "none",
};

function cardStyle(active: boolean): React.CSSProperties {
  return {
    background: "#1e293b", borderRadius: 18, padding: 20, display: "flex",
    alignItems: "center", border: "1px solid #334155", gap: 14,
    cursor: active ? "pointer" : "default",
    opacity: active ? 1 : 0.45, width: "100%", textAlign: "left",
    transition: "opacity 0.15s ease, transform 0.1s ease",
  };
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedMatchup, setSelectedMatchup] = useState<Matchup | null>(null);

  if (screen === "online") {
    return (
      <OnlineScreen
        onBack={() => setScreen("home")}
        onPlay={(m) => { setSelectedMatchup(m); setScreen("game"); }}
      />
    );
  }

  if (screen === "game" && selectedMatchup) {
    return (
      <GameScreen
        matchup={selectedMatchup}
        onBack={() => setScreen("online")}
      />
    );
  }

  if (screen === "1v1") {
    return <LocalGameScreen onBack={() => setScreen("home")} />;
  }

  return <HomeScreen onNavigate={setScreen} />;
}
