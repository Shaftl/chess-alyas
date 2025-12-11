// frontend/lib/socketClient.js
import { io } from "socket.io-client";

let socket = null;
let _lastToken = null;
let _heartbeatId = null;
let _unloadHandlersRegistered = false;

/** read token from localStorage */
function readToken() {
  try {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token");
  } catch (e) {
    return null;
  }
}

function dispatchEvent(name, payload) {
  try {
    if (typeof window === "undefined") return;
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: payload }));
    } catch (e) {
      window.__chessapp_lastEvent = { name, payload };
    }
  } catch (e) {}
}

/**
 * Start a lightweight heartbeat that emits a presence ping periodically.
 * This is harmless if the server doesn't handle it, and helps servers that
 * update last-seen / presence from explicit heartbeats.
 */
function startHeartbeat() {
  stopHeartbeat();
  if (typeof window === "undefined") return;
  _heartbeatId = setInterval(() => {
    try {
      if (socket && socket.connected) {
        // lightweight event — server may ignore it (safe)
        socket.emit("presence-heartbeat", { ts: Date.now() });
      }
    } catch (e) {}
  }, 15000);
}

function stopHeartbeat() {
  try {
    if (_heartbeatId) {
      clearInterval(_heartbeatId);
    }
  } catch (e) {}
  _heartbeatId = null;
}

/**
 * Best-effort unload handler: attempt to notify server and force-close the transport.
 * Uses multiple strategies to increase probability server observes the disconnect:
 *  - emit a short socket event ('client-unload') (may fail on abrupt close)
 *  - try to close engine transport and disconnect the socket
 *
 * NOTE: we do NOT force-close on visibilitychange anymore (tab hide) because
 * that produced premature disconnects. We only do pagehide / beforeunload.
 */
function registerUnloadHandlers() {
  if (typeof window === "undefined" || _unloadHandlersRegistered) return;
  _unloadHandlersRegistered = true;

  const doUnload = () => {
    try {
      // If socket exists, try to emit a final event (non-blocking)
      if (socket && socket.connected) {
        try {
          socket.emit("client-unload", { ts: Date.now() });
        } catch (e) {}
      }
    } catch (e) {}

    try {
      // Try to close underlying engine transport quickly (force)
      if (socket && socket.io && socket.io.engine) {
        try {
          // close transport to make server detect disconnect faster
          socket.io.engine.close();
        } catch (e) {}
      }
    } catch (e) {}

    try {
      if (socket) {
        try {
          // ensure socket is disconnected
          socket.disconnect();
        } catch (e) {}
      }
    } catch (e) {}

    // stop heartbeat if any
    stopHeartbeat();

    // finally clear local references
    socket = null;
    _lastToken = null;
  };

  // pagehide runs reliably on mobile/bfcache contexts
  window.addEventListener(
    "pagehide",
    () => {
      try {
        doUnload();
      } catch (e) {}
    },
    { capture: true }
  );

  // beforeunload as a fallback (runs earlier)
  window.addEventListener(
    "beforeunload",
    () => {
      try {
        doUnload();
      } catch (e) {}
    },
    { capture: true }
  );
}

/* exported API */
export function initSocket() {
  const token = readToken();

  // register unload handlers once globally
  registerUnloadHandlers();

  if (socket) {
    // if token changed, update auth and reconnect safely
    if (token !== _lastToken) {
      _lastToken = token;
      socket.auth = token ? { token } : {};
      try {
        if (socket.connected) socket.disconnect();
        // ensure previous socket closed completely before reconnecting
      } catch (e) {}
      try {
        socket.connect();
      } catch (e) {}
    }
    // start heartbeat for existing socket
    startHeartbeat();
    return socket;
  }

  _lastToken = token;

  // IMPORTANT: ensure NEXT_PUBLIC_SOCKET_URL is set in Vercel to your backend URL (https://...)
  const SOCKET_URL =
    process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

  socket = io(SOCKET_URL, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    withCredentials: true,
    secure: /^https:\/\//i.test(SOCKET_URL),
    auth: token ? { token } : {},
    // keep default reconnection behavior (socket.io will try reconnects)
  });

  // start heartbeat once connected
  startHeartbeat();

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

    // stop heartbeat to avoid emitting on a dead socket
    stopHeartbeat();

    // leave socket reference intact for reconnect attempts (initSocket reconnect logic)
  });

  // === explicit known listeners ===
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

    try {
      const type =
        (payload &&
          (payload.type || payload.data?.type || payload.__socket_event)) ||
        null;

      if (
        type === "join_denied_active_room" ||
        type === "join-denied-active-room" ||
        type === "join_denied_active_room"
      ) {
        dispatchEvent("chessapp:join-denied-active-room", payload);
      }

      if (payload && payload.data && payload.data.activeRoom) {
        dispatchEvent("chessapp:join-denied-active-room", payload);
      }
    } catch (e) {}
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

  socket.on("join-denied-active-room", (payload) => {
    console.log("join-denied-active-room -> relay", payload);
    dispatchEvent("chessapp:join-denied-active-room", payload);
    try {
      dispatchEvent("chessapp:notification", {
        type: "join_denied_active_room",
        ...payload,
      });
    } catch (e) {}
  });

  // fallback underscore variants
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

  if (typeof socket.onAny === "function") {
    socket.onAny((event, ...args) => {
      const payload = args && args.length > 0 ? args[0] : undefined;
      try {
        dispatchEvent(`chessapp:${event}`, payload);
      } catch (e) {}

      try {
        if (NOTIFICATION_LIKE.has(event)) {
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

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  try {
    // stop heartbeat first
    stopHeartbeat();

    if (socket) {
      try {
        // try to emit a final message (best effort)
        if (socket.connected) {
          try {
            socket.emit("client-logout", { ts: Date.now() });
          } catch (e) {}
        }
      } catch (e) {}

      try {
        // close engine transport to speed up detection on server
        if (socket.io && socket.io.engine) {
          try {
            socket.io.engine.close();
          } catch (e) {}
        }
      } catch (e) {}

      try {
        socket.disconnect();
      } catch (e) {}
    }
  } finally {
    socket = null;
    _lastToken = null;
  }
}
