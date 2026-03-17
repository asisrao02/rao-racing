import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CountdownBanner from "../components/CountdownBanner";
import HudOverlay from "../components/HudOverlay";
import MobileControls from "../components/MobileControls";
import PrimaryButton from "../components/PrimaryButton";
import { useGame } from "../game/GameContext";
import { DEFAULT_CONTROLS, KEY_TO_CONTROL, LAPS_TO_WIN } from "../game/constants";
import { EngineAudio } from "../game/engineAudio";
import { getSoloSnapshot, createSoloRace, stepSoloRace } from "../game/physics";
import { RaceScene } from "../game/RaceScene";

function buildHudFromSnapshot(snapshot, currentPlayerId) {
  const players = snapshot?.players ?? [];
  const leaderboard = [...players].sort((a, b) => a.rank - b.rank);
  const fallbackPlayer = leaderboard[0];
  const localPlayer = players.find((player) => player.id === currentPlayerId) || fallbackPlayer;

  return {
    speed: Math.abs(localPlayer?.speed ?? 0) * 3.6,
    lap: localPlayer?.lap ?? 0,
    lapsToWin: snapshot?.lapsToWin ?? LAPS_TO_WIN,
    position: localPlayer?.rank ?? 1,
    totalPlayers: players.length || 1,
    nitro: localPlayer?.nitro ?? 0,
    leaderboard,
    isBoosting: Boolean(localPlayer?.isBoosting),
  };
}

function getCountdownText(snapshot) {
  if (!snapshot) {
    return "";
  }
  if (snapshot.phase === "countdown") {
    const seconds = Math.ceil((snapshot.countdownMs ?? 0) / 1000);
    return seconds > 0 ? String(seconds) : "GO!";
  }
  return "";
}

function GamePage() {
  const navigate = useNavigate();
  const {
    mode,
    username,
    soundEnabled,
    ensureSocket,
    roomState,
    setRoomState,
    setRoomCode,
    playerId,
    setPlayerId,
    setResultState,
    leaveMultiplayerRoom,
  } = useGame();
  const renderHostRef = useRef(null);
  const sceneRef = useRef(null);
  const controlsRef = useRef({ ...DEFAULT_CONTROLS });
  const raceFinishedRef = useRef(false);
  const soloRaceRef = useRef(null);
  const engineAudioRef = useRef(null);
  const goUntilRef = useRef(0);
  const [hud, setHud] = useState({
    speed: 0,
    lap: 0,
    lapsToWin: LAPS_TO_WIN,
    position: 1,
    totalPlayers: 1,
    nitro: 100,
    leaderboard: [],
    isBoosting: false,
  });
  const [countdownText, setCountdownText] = useState("");
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    if (!mode) {
      navigate("/");
    }
  }, [mode, navigate]);

  useEffect(() => {
    raceFinishedRef.current = false;
  }, [mode]);

  useEffect(() => {
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    setIsTouchDevice(coarsePointer.matches);
  }, []);

  useEffect(() => {
    engineAudioRef.current = new EngineAudio();
    return () => {
      engineAudioRef.current?.stop();
      engineAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!renderHostRef.current) {
      return undefined;
    }

    const scene = new RaceScene(renderHostRef.current);
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyChange = (event, isPressed) => {
      const control = KEY_TO_CONTROL[event.code];
      if (!control) {
        return;
      }
      event.preventDefault();
      controlsRef.current[control] = isPressed;
      if (isPressed && soundEnabled) {
        engineAudioRef.current?.start();
      }
    };

    const onKeyDown = (event) => onKeyChange(event, true);
    const onKeyUp = (event) => onKeyChange(event, false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [soundEnabled]);

  useEffect(() => {
    if (mode !== "multiplayer") {
      return undefined;
    }

    const socket = ensureSocket();
    const handleRoomState = (state) => {
      setRoomState(state);
      setRoomCode(state.roomCode);
      if (!playerId) {
        setPlayerId(socket.id);
      }
    };

    socket.on("room:state", handleRoomState);
    return () => {
      socket.off("room:state", handleRoomState);
    };
  }, [ensureSocket, mode, playerId, setPlayerId, setRoomCode, setRoomState]);

  useEffect(() => {
    if (mode !== "multiplayer") {
      return undefined;
    }

    const socket = ensureSocket();
    const timer = setInterval(() => {
      socket.emit("player:input", controlsRef.current);
    }, 50);

    return () => clearInterval(timer);
  }, [ensureSocket, mode]);

  useEffect(() => {
    if (mode !== "multiplayer") {
      return;
    }

    if (!roomState) {
      const redirectTimer = setTimeout(() => {
        navigate("/lobby");
      }, 1200);
      return () => clearTimeout(redirectTimer);
    }

    const currentPlayerId = playerId || ensureSocket().id;
    sceneRef.current?.setLocalPlayer(currentPlayerId);
    sceneRef.current?.setSnapshot(roomState.players || []);

    const nextHud = buildHudFromSnapshot(roomState, currentPlayerId);
    setHud(nextHud);

    if (soundEnabled) {
      engineAudioRef.current?.setIntensity(Math.min(1.4, nextHud.speed / 140), nextHud.isBoosting);
    }

    const countdown = getCountdownText(roomState);
    if (countdown === "GO!") {
      goUntilRef.current = performance.now() + 850;
    }

    if (countdown) {
      setCountdownText(countdown);
    } else if (roomState.phase === "racing" && performance.now() < goUntilRef.current) {
      setCountdownText("GO!");
    } else {
      setCountdownText("");
    }

    if (roomState.phase === "finished" && !raceFinishedRef.current) {
      raceFinishedRef.current = true;
      setResultState({
        mode: "multiplayer",
        roomCode: roomState.roomCode,
        hostId: roomState.hostId,
        players: roomState.players,
      });
      navigate("/results");
    }
  }, [ensureSocket, mode, navigate, playerId, roomState, setResultState, soundEnabled]);

  useEffect(() => {
    if (mode !== "solo") {
      return undefined;
    }

    raceFinishedRef.current = false;
    const race = createSoloRace(username);
    soloRaceRef.current = race;

    let rafId = null;
    let lastTimestamp = performance.now();
    let hudAccumulator = 0;

    const step = (timestamp) => {
      const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
      lastTimestamp = timestamp;

      stepSoloRace(race, controlsRef.current, dt, Date.now());
      const snapshot = getSoloSnapshot(race);
      sceneRef.current?.setLocalPlayer("solo-player");
      sceneRef.current?.setSnapshot(snapshot.players);

      hudAccumulator += dt;
      if (hudAccumulator > 0.05) {
        const nextHud = buildHudFromSnapshot(snapshot, "solo-player");
        setHud(nextHud);
        hudAccumulator = 0;
        if (soundEnabled) {
          engineAudioRef.current?.setIntensity(Math.min(1.4, nextHud.speed / 140), nextHud.isBoosting);
        }
      }

      const countdown = getCountdownText(snapshot);
      if (countdown === "GO!") {
        goUntilRef.current = performance.now() + 850;
      }

      if (countdown) {
        setCountdownText(countdown);
      } else if (race.phase === "racing" && performance.now() < goUntilRef.current) {
        setCountdownText("GO!");
      } else {
        setCountdownText("");
      }

      if (race.phase === "finished" && !raceFinishedRef.current) {
        raceFinishedRef.current = true;
        setResultState({
          mode: "solo",
          roomCode: "SOLO",
          hostId: "solo-player",
          players: snapshot.players,
        });
        navigate("/results");
        return;
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [mode, navigate, setResultState, soundEnabled, username]);

  const handleMobileControl = (control, pressed) => {
    controlsRef.current[control] = pressed;
    if (pressed && soundEnabled) {
      engineAudioRef.current?.start();
    }
  };

  const exitRace = () => {
    if (mode === "multiplayer") {
      leaveMultiplayerRoom();
      navigate("/lobby");
      return;
    }
    navigate("/");
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <div ref={renderHostRef} className="game-canvas-wrap" />

      <div className="absolute left-4 top-4 z-30 pointer-events-auto">
        <PrimaryButton variant="secondary" onClick={exitRace} className="px-4 py-2 text-xs">
          Exit Race
        </PrimaryButton>
      </div>

      <HudOverlay
        speed={hud.speed}
        lap={hud.lap}
        lapsToWin={hud.lapsToWin}
        position={hud.position}
        totalPlayers={hud.totalPlayers}
        nitro={hud.nitro}
        leaderboard={hud.leaderboard}
      />
      <CountdownBanner text={countdownText} />

      {isTouchDevice && <MobileControls onControl={handleMobileControl} />}
    </main>
  );
}

export default GamePage;
