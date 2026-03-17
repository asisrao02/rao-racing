import { io } from "socket.io-client";

let socketInstance = null;

function resolveServerUrl() {
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL;
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
    if (isLocal) {
      return `${protocol}//${hostname}:4000`;
    }

    return `${protocol}//${hostname}`;
  }

  return "http://localhost:4000";
}

export function getSocket() {
  if (!socketInstance) {
    socketInstance = io(resolveServerUrl(), {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 15,
      timeout: 6000,
    });
  }

  return socketInstance;
}

export function closeSocket() {
  if (!socketInstance) {
    return;
  }

  socketInstance.removeAllListeners();
  socketInstance.disconnect();
  socketInstance = null;
}
