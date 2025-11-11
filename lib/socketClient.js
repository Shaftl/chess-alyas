// frontend/lib/socketClient.js
import { io } from "socket.io-client";

let socket = null;
let _lastToken = null;

/**
 * Read token from localStorage safely.
 */
function readToken() {
  try {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token");
  } catch (e) {
    return null;
  }
}

/**
 * Helper to dispatch a stable window CustomEvent (best-effort)
 */
function dispatchEvent(name, payload) {
  try {
    if (typeof window === "undefined") return;
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: payload }));
    } catch (e) {
      // fallback attach to a global var for simple debugging
      window.__chessapp_lastEvent = { name, payload };
    }
  } catch (e) {}
}

/**
 * initSocket()
 * - Creates a singleton socket.
 * - If socket already exists but token changed, update handshake and reconnect.
 */
export function initSocket() {
  const token = readToken();

  // If socket exists already
  if (socket) {
    // If token changed, update handshake auth and reconnect so server receives new auth
    if (token !== _lastToken) {
      _lastToken = token;
      socket.auth = token ? { token } : {};
      try {
        if (socket.connected) {
          socket.disconnect();
        }
        socket.connect();
      } catch (e) {
        // ignore
      }
    }
    return socket;
  }

  // create new socket
  _lastToken = token;

  // IMPORTANT: DO NOT force websocket-only transport here.
  // Allow socket.io to negotiate transports so cookies are handled reliably.
  socket = io(
    process.env.NEXT_PUBLIC_SOCKET_URL ||
      "https://chess-backend-api.onrender.com",
    {
      reconnection: true,
      auth: token ? { token } : {},
      withCredentials: true,
    }
  );

  socket.on("connect_error", (err) => {
    console.warn("Socket connect_error:", err?.message || err);
  });

  socket.on("connect", () => {
    console.log("Socket connected:", socket.id);
    dispatchEvent("chessapp:socket-connected", { socketId: socket.id });
  });

  socket.on("disconnect", (reason) => {
    console.log("Socket disconnected:", reason);
    dispatchEvent("chessapp:socket-disconnected", { reason });
  });

  // === explicit known listeners (kept for compatibility / debugging) ===
  socket.on("invite-received", (payload) => {
    console.log("invite-received -> relay", payload);
    dispatchEvent("chessapp:invite-received", payload);
  });

  socket.on("invite-updated", (payload) => {
    console.log("invite-updated -> relay", payload);
    dispatchEvent("chessapp:invite-updated", payload);
  });

  socket.on("notification", (payload) => {
    console.log("notification -> relay", payload);
    dispatchEvent("chessapp:notification", payload);
  });

  socket.on("challenge-received", (payload) => {
    console.log("challenge-received -> relay", payload);
    dispatchEvent("chessapp:challenge-received", payload);
  });

  socket.on("challenge-accepted", (payload) => {
    console.log("challenge-accepted -> relay", payload);
    dispatchEvent("chessapp:challenge-accepted", payload);
    dispatchEvent("chessapp:notification", {
      type: "challenge_accepted",
      ...payload,
    });
  });

  socket.on("challenge-declined", (payload) => {
    console.log("challenge-declined -> relay", payload);
    dispatchEvent("chessapp:challenge-declined", payload);
    dispatchEvent("chessapp:notification", {
      type: "challenge_declined",
      ...payload,
    });
  });

  socket.on("rematch-offered", (payload) => {
    console.log("rematch-offered -> relay", payload);
    dispatchEvent("chessapp:rematch-offered", payload);
    dispatchEvent("chessapp:notification", { type: "rematch", ...payload });
  });

  socket.on("play-again", (payload) => {
    console.log("play-again -> relay", payload);
    dispatchEvent("chessapp:play-again", payload);
    dispatchEvent("chessapp:notification", payload);
  });

  socket.on("rematch-declined", (payload) => {
    console.log("rematch-declined -> relay", payload);
    dispatchEvent("chessapp:rematch-declined", payload);
    dispatchEvent("chessapp:notification", payload);
  });

  socket.on("draw-offered", (payload) => {
    console.log("draw-offered -> relay", payload);
    dispatchEvent("chessapp:draw-offered", payload);
    dispatchEvent("chessapp:notification", payload);
  });

  socket.on("draw-accepted", (payload) => {
    console.log("draw-accepted -> relay", payload);
    dispatchEvent("chessapp:draw-accepted", payload);
    dispatchEvent("chessapp:notification", {
      type: "draw_accepted",
      ...payload,
    });
  });

  socket.on("draw-declined", (payload) => {
    console.log("draw-declined -> relay", payload);
    dispatchEvent("chessapp:draw-declined", payload);
    dispatchEvent("chessapp:notification", {
      type: "draw_declined",
      ...payload,
    });
  });

  socket.on("friend-request-accepted", (payload) => {
    console.log("friend-request-accepted -> relay", payload);
    dispatchEvent("chessapp:friend-request-accepted", payload);
    dispatchEvent("chessapp:notification", {
      type: "friend_request_accepted",
      ...payload,
    });
  });

  socket.on("friend-request-declined", (payload) => {
    console.log("friend-request-declined -> relay", payload);
    dispatchEvent("chessapp:friend-request-declined", payload);
    dispatchEvent("chessapp:notification", {
      type: "friend_request_declined",
      ...payload,
    });
  });

  // fallback: also accept underscore variants
  socket.on("friend_request_accepted", (payload) => {
    console.log("friend_request_accepted -> relay", payload);
    dispatchEvent("chessapp:friend_request_accepted", payload);
    dispatchEvent("chessapp:notification", payload);
  });
  socket.on("friend_request_declined", (payload) => {
    console.log("friend_request_declined -> relay", payload);
    dispatchEvent("chessapp:friend_request_declined", payload);
    dispatchEvent("chessapp:notification", payload);
  });

  // ----------------------------
  // NEW: Global ANY relay (critical)
  // ----------------------------
  // For every socket event (any name) forward a CustomEvent chessapp:<eventName>.
  // Also, for events that usually imply a notification/update, forward a chessapp:notification as well.
  const NOTIFICATION_LIKE = new Set([
    "invite-updated",
    "invite-received",
    "friend-request-accepted",
    "friend-request-declined",
    "friend_request_accepted",
    "friend_request_declined",
    "challenge-accepted",
    "challenge-declined",
    "challenge_declined",
    "challenge_accepted",
    "draw-accepted",
    "draw-declined",
    "draw_accepted",
    "draw_declined",
    "rematch-offered",
    "rematch-declined",
    "play-again",
    "notification",
  ]);

  // socket.io client supports onAny
  if (typeof socket.onAny === "function") {
    socket.onAny((event, ...args) => {
      const payload = args && args.length > 0 ? args[0] : undefined;
      try {
        // dispatch the specific event
        dispatchEvent(`chessapp:${event}`, payload);
      } catch (e) {}

      try {
        // dispatch a generic notification event for "notification-like" events
        if (NOTIFICATION_LIKE.has(event)) {
          // prefer to include a type so NotificationBell can easily map
          const enhanced =
            payload && typeof payload === "object"
              ? {
                  ...payload,
                  __socket_event: event,
                  type: payload.type || event,
                }
              : { payload, __socket_event: event, type: event };
          dispatchEvent("chessapp:notification", enhanced);
        }
      } catch (e) {}
    });
  }

  return socket;
}

/**
 * Returns the current socket instance
 */
export function getSocket() {
  return socket;
}

/**
 * Disconnects and resets the socket instance
 */
export function disconnectSocket() {
  if (socket) {
    try {
      socket.disconnect();
    } catch (e) {}
    socket = null;
    _lastToken = null;
  }
}
