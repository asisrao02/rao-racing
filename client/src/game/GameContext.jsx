import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { closeSocket, getSocket } from "./socketClient";

const USERNAME_KEY = "rao_racing_username";
const SOUND_KEY = "rao_racing_sound";

function getInitialUsername() {
  if (typeof window === "undefined") {
    return "Racer";
  }

  return window.localStorage.getItem(USERNAME_KEY) || "Racer";
}

function getInitialSound() {
  if (typeof window === "undefined") {
    return true;
  }

  const raw = window.localStorage.getItem(SOUND_KEY);
  if (raw === null) {
    return true;
  }

  return raw === "true";
}

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [username, setUsernameState] = useState(getInitialUsername);
  const [soundEnabled, setSoundEnabledState] = useState(getInitialSound);
  const [mode, setMode] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [resultState, setResultState] = useState(null);
  const socketRef = useRef(null);

  const ensureSocket = useCallback(() => {
    if (socketRef.current) {
      return socketRef.current;
    }

    socketRef.current = getSocket();
    return socketRef.current;
  }, []);

  const setUsername = useCallback((value) => {
    const nextValue = String(value || "Racer").slice(0, 24);
    setUsernameState(nextValue || "Racer");
    if (typeof window !== "undefined") {
      window.localStorage.setItem(USERNAME_KEY, nextValue || "Racer");
    }
  }, []);

  const setSoundEnabled = useCallback((enabled) => {
    setSoundEnabledState(enabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SOUND_KEY, String(enabled));
    }
  }, []);

  const leaveMultiplayerRoom = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit("room:leave");
    }
    setRoomCode(null);
    setRoomState(null);
    setPlayerId(null);
  }, []);

  const resetSession = useCallback(() => {
    setMode(null);
    setRoomCode(null);
    setRoomState(null);
    setPlayerId(null);
    setResultState(null);
  }, []);

  useEffect(() => {
    return () => {
      closeSocket();
      socketRef.current = null;
    };
  }, []);

  const contextValue = useMemo(
    () => ({
      username,
      setUsername,
      soundEnabled,
      setSoundEnabled,
      mode,
      setMode,
      socket: socketRef.current,
      ensureSocket,
      roomCode,
      setRoomCode,
      roomState,
      setRoomState,
      playerId,
      setPlayerId,
      resultState,
      setResultState,
      leaveMultiplayerRoom,
      resetSession,
    }),
    [
      username,
      setUsername,
      soundEnabled,
      setSoundEnabled,
      mode,
      ensureSocket,
      roomCode,
      roomState,
      playerId,
      resultState,
      leaveMultiplayerRoom,
      resetSession,
    ]
  );

  return <GameContext.Provider value={contextValue}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error("useGame must be used inside GameProvider");
  }
  return context;
}
