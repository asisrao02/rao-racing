import { io } from "socket.io-client";

let socketInstance = null;

const SOCKET_SERVER_URL = "https://rao-racing-server.onrender.com";

export function getSocket() {
  if (!socketInstance) {
    socketInstance = io(SOCKET_SERVER_URL, {
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 15,
      timeout: 10000,
    });

    socketInstance.on("connect", () => {
      console.info(`[socket] connected: ${socketInstance.id}`);
    });

    socketInstance.on("connect_error", (error) => {
      console.error("[socket] connect_error:", error.message, {
        url: SOCKET_SERVER_URL,
      });
    });

    socketInstance.on("disconnect", (reason) => {
      console.warn("[socket] disconnected:", reason);
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
