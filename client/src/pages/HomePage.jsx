import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Panel from "../components/Panel";
import PrimaryButton from "../components/PrimaryButton";
import { useGame } from "../game/GameContext";

function serverBaseUrl() {
  return import.meta.env.VITE_SERVER_URL || "https://rao-racing-server.onrender.com";
}

function formatBestLap(ms) {
  if (!ms) {
    return "--";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  const centiseconds = Math.floor((ms % 1000) / 10)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}.${centiseconds}`;
}

function HomePage() {
  const navigate = useNavigate();
  const {
    username,
    setUsername,
    setMode,
    setResultState,
    setRoomState,
    setRoomCode,
    leaveMultiplayerRoom,
    soundEnabled,
    setSoundEnabled,
  } = useGame();
  const [nameInput, setNameInput] = useState(username);
  const [showSettings, setShowSettings] = useState(true);
  const [leaders, setLeaders] = useState([]);

  useEffect(() => {
    let mounted = true;
    fetch(`${serverBaseUrl()}/api/leaderboard`)
      .then((response) => response.json())
      .then((payload) => {
        if (mounted) {
          setLeaders(payload.leaders ?? []);
        }
      })
      .catch(() => {
        if (mounted) {
          setLeaders([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const startSolo = () => {
    leaveMultiplayerRoom();
    setMode("solo");
    setRoomCode("SOLO");
    setRoomState(null);
    setResultState(null);
    navigate("/race");
  };

  const startMultiplayer = () => {
    setMode("multiplayer");
    setRoomState(null);
    setResultState(null);
    navigate("/lobby");
  };

  const saveSettings = () => {
    setUsername(nameInput || "Racer");
  };

  return (
    <main className="app-bg relative overflow-hidden px-4 py-8 md:px-8 md:py-12">
      <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel className="space-y-6">
          <p className="font-display text-sm uppercase tracking-[0.22em] text-cyan-200/85">Browser Multiplayer Kart Battle</p>
          <h1 className="font-display text-5xl font-black tracking-[0.08em] text-white md:text-7xl">RAO RACING</h1>
          <p className="max-w-xl text-lg text-cyan-100/90">
            Smash-style real-time kart combat on a massive Neo City GP circuit with lobbies, ammo pickups, projectile
            fights, nitro boosts, and smooth third-person camera follow.
          </p>

          <div className="flex flex-wrap gap-3">
            <PrimaryButton onClick={startSolo}>Play Solo</PrimaryButton>
            <PrimaryButton variant="secondary" onClick={startMultiplayer}>
              Multiplayer
            </PrimaryButton>
            <PrimaryButton variant="secondary" onClick={() => setShowSettings((current) => !current)}>
              Settings
            </PrimaryButton>
          </div>

          {showSettings && (
            <div className="grid gap-4 rounded-2xl border border-cyan-300/25 bg-slate-950/45 p-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="font-display text-sm uppercase tracking-[0.13em] text-cyan-200/80">Driver Name</span>
                <input
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value.slice(0, 24))}
                  className="rounded-lg border border-cyan-300/30 bg-slate-900/75 px-3 py-2 text-lg text-white outline-none focus:border-orange-400"
                  placeholder="Racer"
                />
              </label>

              <div className="flex items-end justify-between gap-4 rounded-lg border border-cyan-300/25 bg-slate-900/65 px-4 py-3">
                <div>
                  <p className="font-display text-sm uppercase tracking-[0.13em] text-cyan-200/80">Engine Sound</p>
                  <p className="text-cyan-50">{soundEnabled ? "Enabled" : "Disabled"}</p>
                </div>
                <button
                  type="button"
                  className="rounded-full border border-cyan-300/40 bg-slate-800 px-4 py-1 font-display uppercase tracking-[0.08em]"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                >
                  Toggle
                </button>
              </div>
            </div>
          )}

          <PrimaryButton variant="secondary" onClick={saveSettings}>
            Save Settings
          </PrimaryButton>
        </Panel>

        <Panel className="space-y-3">
          <h2 className="font-display text-2xl uppercase tracking-[0.12em] text-white">Global Leaderboard</h2>
          <p className="text-sm text-cyan-100/80">Stored in MongoDB from multiplayer race results.</p>
          <ol className="space-y-2">
            {leaders.length === 0 && (
              <li className="rounded-lg border border-dashed border-cyan-200/35 bg-slate-900/45 px-3 py-2 text-cyan-100/70">
                No leaderboard entries yet.
              </li>
            )}
            {leaders.slice(0, 10).map((entry) => (
              <li
                key={`${entry.username}-${entry.rank}`}
                className="flex items-center justify-between rounded-lg border border-cyan-300/20 bg-slate-900/55 px-3 py-2"
              >
                <div>
                  <p className="font-display text-lg text-white">
                    {entry.rank}. {entry.username}
                  </p>
                  <p className="text-sm text-cyan-100/80">
                    Wins: {entry.wins} | Races: {entry.races}
                  </p>
                </div>
                <p className="font-display text-cyan-100">{formatBestLap(entry.bestLapMs)}</p>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </main>
  );
}

export default HomePage;
