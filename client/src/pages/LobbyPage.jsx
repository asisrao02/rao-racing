import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Panel from "../components/Panel";
import PrimaryButton from "../components/PrimaryButton";
import { useGame } from "../game/GameContext";

function LobbyPage() {
  const navigate = useNavigate();
  const {
    username,
    mode,
    setMode,
    ensureSocket,
    setRoomState,
    roomState,
    setRoomCode,
    roomCode,
    setPlayerId,
    playerId,
    setResultState,
    leaveMultiplayerRoom,
  } = useGame();
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("Create a room or join one with a code.");
  const [busy, setBusy] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (mode !== "multiplayer") {
      setMode("multiplayer");
    }
  }, [mode, setMode]);

  useEffect(() => {
    const socket = ensureSocket();
    setIsConnected(socket.connected);
    if (!socket.connected) {
      socket.connect();
    }

    const handleRoomState = (state) => {
      setRoomState(state);
      setRoomCode(state.roomCode);
      if (!playerId) {
        setPlayerId(socket.id);
      }

      if (state.phase === "countdown" || state.phase === "racing") {
        navigate("/race");
        return;
      }

      if (state.phase === "finished") {
        setResultState({
          mode: "multiplayer",
          roomCode: state.roomCode,
          hostId: state.hostId,
          players: state.players,
        });
        navigate("/results");
      }
    };

    const handleConnect = () => {
      setIsConnected(true);
      setMessage((current) =>
        current.includes("Create a room") || current.includes("disconnected")
          ? "Connected. Create a room or join one with a code."
          : current
      );
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setMessage("Socket disconnected. Check server and retry.");
    };

    const handleConnectError = (error) => {
      setIsConnected(false);
      setMessage(`Server connection failed: ${error.message}`);
    };

    socket.on("room:state", handleRoomState);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    return () => {
      socket.off("room:state", handleRoomState);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
    };
  }, [ensureSocket, navigate, playerId, setPlayerId, setResultState, setRoomCode, setRoomState]);

  const players = roomState?.players || [];
  const socket = ensureSocket();
  const currentPlayerId = playerId || socket.id;
  const isHost = roomState?.hostId && roomState.hostId === currentPlayerId;

  const hostName = useMemo(() => {
    if (!roomState?.hostId) {
      return null;
    }
    return players.find((player) => player.id === roomState.hostId)?.username || "Host";
  }, [players, roomState]);

  const emitWithTimeout = (eventName, payload, onResponse) => {
    setBusy(true);
    let handled = false;
    const timeoutId = setTimeout(() => {
      if (handled) {
        return;
      }
      handled = true;
      setBusy(false);
      setMessage("Server did not respond. Confirm your Render backend is online.");
    }, 7000);

    socket.emit(eventName, payload, (response) => {
      if (handled) {
        return;
      }
      handled = true;
      clearTimeout(timeoutId);
      setBusy(false);
      onResponse(response);
    });
  };

  const runWhenConnected = (onReady) => {
    if (socket.connected) {
      onReady();
      return;
    }

    setBusy(true);
    setMessage("Connecting to server...");
    socket.connect();

    let done = false;
    const cleanup = () => {
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      clearTimeout(timeoutId);
    };

    const handleConnect = () => {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      setBusy(false);
      onReady();
    };

    const handleConnectError = (error) => {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      setBusy(false);
      setMessage(`Server connection failed: ${error.message}`);
    };

    const timeoutId = setTimeout(() => {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      setBusy(false);
      setMessage("Unable to reach server. Check Render status and retry.");
    }, 9000);

    socket.once("connect", handleConnect);
    socket.once("connect_error", handleConnectError);
  };

  const createRoom = () => {
    runWhenConnected(() => {
      emitWithTimeout("room:create", { username }, (response) => {
        if (!response?.ok) {
          setMessage(response?.error || "Unable to create room.");
          return;
        }
        setPlayerId(response.playerId);
        setRoomCode(response.roomCode);
        setMessage(`Room ${response.roomCode} created. Share the code and wait for racers.`);
      });
    });
  };

  const joinRoom = () => {
    const nextCode = joinCode.trim().toUpperCase();
    if (!nextCode) {
      setMessage("Enter a room code first.");
      return;
    }

    runWhenConnected(() => {
      emitWithTimeout("room:join", { roomCode: nextCode, username }, (response) => {
        if (!response?.ok) {
          setMessage(response?.error || "Unable to join room.");
          return;
        }
        setPlayerId(response.playerId);
        setRoomCode(response.roomCode);
        setMessage(`Joined room ${response.roomCode}.`);
      });
    });
  };

  const startRace = () => {
    runWhenConnected(() => {
      emitWithTimeout("race:start", {}, (response) => {
        if (!response?.ok) {
          setMessage(response?.error || "Unable to start race.");
        }
      });
    });
  };

  const leaveRoom = () => {
    leaveMultiplayerRoom();
    setMessage("Left room. You can create or join another room.");
  };

  return (
    <main className="app-bg relative min-h-screen px-4 py-8 md:px-8 md:py-12">
      <div className="relative z-10 mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel className="space-y-5">
          <div>
            <p className="font-display text-sm uppercase tracking-[0.15em] text-cyan-200/80">Multiplayer Lobby</p>
            <h1 className="font-display text-4xl font-bold text-white md:text-5xl">RAO RACING ROOMS</h1>
            <p className="mt-2 text-cyan-100/85">{message}</p>
            <p className={`mt-1 text-sm ${isConnected ? "text-emerald-300" : "text-amber-300"}`}>
              Server status: {isConnected ? "Connected" : "Disconnected"}
            </p>
          </div>

          {!roomState && (
            <div className="space-y-4 rounded-xl border border-cyan-300/25 bg-slate-900/55 p-4">
              <PrimaryButton onClick={createRoom} disabled={busy}>
                Create Room
              </PrimaryButton>
              <div className="grid gap-2">
                <label className="font-display text-sm uppercase tracking-[0.13em] text-cyan-200/80">Room Code</label>
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase().slice(0, 5))}
                  className="rounded-lg border border-cyan-300/30 bg-slate-900/75 px-3 py-2 text-lg text-white outline-none focus:border-orange-400"
                  placeholder="ABCDE"
                />
              </div>
              <PrimaryButton onClick={joinRoom} disabled={busy} variant="secondary">
                Join Room
              </PrimaryButton>
            </div>
          )}

          {roomState && (
            <div className="space-y-4 rounded-xl border border-cyan-300/25 bg-slate-900/55 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-cyan-100/75">Room Code</p>
                  <p className="font-display text-3xl tracking-[0.2em] text-white">{roomCode}</p>
                </div>
                <p className="text-cyan-100/90">
                  Host: <span className="font-semibold text-white">{hostName}</span>
                </p>
              </div>

              <div className="grid gap-2">
                <p className="font-display text-sm uppercase tracking-[0.13em] text-cyan-200/80">Player List</p>
                {players.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between rounded-lg border border-cyan-300/20 bg-slate-900/60 px-3 py-2"
                  >
                    <span className="text-lg text-white">
                      {player.username}
                      {player.id === currentPlayerId ? " (You)" : ""}
                    </span>
                    <span className="text-sm text-cyan-100/80">{player.id === roomState.hostId ? "Host" : "Racer"}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <PrimaryButton onClick={leaveRoom} variant="secondary">
                  Exit Room
                </PrimaryButton>
                {isHost && (
                  <PrimaryButton onClick={startRace} disabled={busy}>
                    Start Game
                  </PrimaryButton>
                )}
              </div>
            </div>
          )}

          <PrimaryButton onClick={() => navigate("/")} variant="secondary" className="w-fit">
            Back Home
          </PrimaryButton>
        </Panel>

        <Panel className="space-y-3">
          <h2 className="font-display text-2xl uppercase tracking-[0.12em] text-white">How To Play</h2>
          <ul className="space-y-2 text-cyan-100/90">
            <li>W / Arrow Up: Accelerate</li>
            <li>S / Arrow Down: Brake</li>
            <li>A / D or Arrow Left / Right: Steer</li>
            <li>Shift: Nitro boost</li>
            <li>Space / F: Fire projectile</li>
            <li>Collect glowing boxes for ammo and score</li>
            <li>Battle takes place on a long Neo City GP circuit</li>
            <li>Host starts 3...2...1...GO countdown</li>
          </ul>
        </Panel>
      </div>
    </main>
  );
}

export default LobbyPage;
