import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Panel from "../components/Panel";
import PrimaryButton from "../components/PrimaryButton";
import { useGame } from "../game/GameContext";

function formatTime(ms) {
  if (!ms && ms !== 0) {
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

function ResultPage() {
  const navigate = useNavigate();
  const {
    mode,
    resultState,
    roomState,
    playerId,
    ensureSocket,
    setResultState,
    setRoomState,
    leaveMultiplayerRoom,
  } = useGame();

  const finalData = resultState || roomState;
  const rows = useMemo(() => {
    if (!finalData?.players) {
      return [];
    }
    return [...finalData.players].sort((a, b) => {
      const placeA = a.place ?? a.rank ?? 999;
      const placeB = b.place ?? b.rank ?? 999;
      return placeA - placeB;
    });
  }, [finalData]);

  useEffect(() => {
    if (!finalData) {
      navigate("/");
    }
  }, [finalData, navigate]);

  useEffect(() => {
    if (mode !== "multiplayer") {
      return undefined;
    }

    const socket = ensureSocket();
    const handleRoomState = (state) => {
      setRoomState(state);
      if (state.phase === "lobby") {
        setResultState(null);
        navigate("/lobby");
      } else if (state.phase === "countdown" || state.phase === "racing") {
        setResultState(null);
        navigate("/race");
      }
    };

    socket.on("room:state", handleRoomState);
    return () => {
      socket.off("room:state", handleRoomState);
    };
  }, [ensureSocket, mode, navigate, setResultState, setRoomState]);

  if (!finalData) {
    return null;
  }

  const localPlayerId = mode === "multiplayer" ? playerId || ensureSocket().id : "solo-player";
  const isHost = finalData.hostId && localPlayerId === finalData.hostId;

  const restart = () => {
    if (mode === "solo") {
      setResultState(null);
      navigate("/race");
      return;
    }

    const socket = ensureSocket();
    if (!isHost) {
      navigate("/lobby");
      return;
    }

    socket.emit("race:restart", {}, (response) => {
      if (!response?.ok) {
        return;
      }
      setResultState(null);
      setRoomState(null);
      navigate("/lobby");
    });
  };

  const exit = () => {
    if (mode === "multiplayer") {
      leaveMultiplayerRoom();
    }
    setResultState(null);
    setRoomState(null);
    navigate("/");
  };

  return (
    <main className="app-bg relative min-h-screen px-4 py-8 md:px-8 md:py-12">
      <div className="relative z-10 mx-auto w-full max-w-4xl space-y-5">
        <Panel className="space-y-2 text-center">
          <p className="font-display text-sm uppercase tracking-[0.16em] text-cyan-200/85">Race Complete</p>
          <h1 className="font-display text-5xl text-white md:text-6xl">FINAL LEADERBOARD</h1>
          <p className="text-cyan-100/85">
            Room: <span className="font-display tracking-[0.1em]">{finalData.roomCode || "SOLO"}</span>
          </p>
        </Panel>

        <Panel>
          <div className="grid gap-2">
            {rows.map((player, index) => (
              <div
                key={player.id || `${player.username}-${index}`}
                className="grid grid-cols-[0.5fr_1.5fr_1fr_1fr] items-center rounded-lg border border-cyan-300/20 bg-slate-900/55 px-3 py-3 text-sm md:text-base"
              >
                <p className="font-display text-white">{player.place || index + 1}</p>
                <p className="truncate text-white">{player.username}</p>
                <p className="text-cyan-100">{formatTime(player.finishTimeMs)}</p>
                <p className="text-cyan-200">{formatTime(player.bestLapMs)}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <PrimaryButton onClick={restart}>{mode === "multiplayer" ? "Restart Lobby" : "Race Again"}</PrimaryButton>
            <PrimaryButton variant="secondary" onClick={exit}>
              Exit To Home
            </PrimaryButton>
          </div>

          {mode === "multiplayer" && !isHost && (
            <p className="mt-3 text-cyan-100/80">Only the host can reset the room. You can return to lobby anytime.</p>
          )}
        </Panel>
      </div>
    </main>
  );
}

export default ResultPage;
