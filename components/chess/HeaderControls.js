"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import styles from "./HeaderControls.module.css";
import { backendOrigin } from "@/lib/chessUtils";
import { initSocket } from "@/lib/socketClient";
import { useSelector } from "react-redux";
import { useRouter } from "next/navigation";

/**
 * Header controls: Join Room button + Create room inputs + friends invite UI + Play Online
 * Props:
 *  - joinRoom()
 *  - createCode, setCreateCode
 *  - createMinutes, setCreateMinutes
 *  - createColorPref, setCreateColorPref
 *  - createRoom()
 */
export default function HeaderControls({
  joinRoom,
  createCode,
  setCreateCode,
  createMinutes,
  setCreateMinutes,
  createColorPref,
  setCreateColorPref,
  createRoom,
}) {
  const [isPlayWithFriend, setIsPlayWithFriend] = useState(false);

  // Friends list & invite state
  const [friends, setFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [inviteStatusById, setInviteStatusById] = useState({}); // { [friendId]: { ok, message, inviteId, sending } }

  // Play-online state
  const [onlineQueueing, setOnlineQueueing] = useState(false);
  const [onlineStatusMsg, setOnlineStatusMsg] = useState("");
  const [lastMatchInfo, setLastMatchInfo] = useState(null);

  // Play-with-bot state
  const [botLevel, setBotLevel] = useState(2);
  const [botCreating, setBotCreating] = useState(false);
  const [playWithBotMsg, setPlayWithBotMsg] = useState("");

  const auth = useSelector((s) => s.auth);
  const router = useRouter();

  // timeout ref for matchmaking
  const matchmakingTimerRef = useRef(null);
  // how long to wait before auto-dequeue (ms)
  const MATCHMAKING_TIMEOUT_MS = 60_000; // 1 minute

  useEffect(() => {
    if (!isPlayWithFriend) return;

    let mounted = true;
    async function loadFriends() {
      setLoadingFriends(true);
      setFriends([]);
      try {
        const base = backendOrigin();
        const res = await fetch(`${base}/api/friends`, {
          credentials: "include",
        });
        if (!mounted) return;
        if (!res.ok) {
          if (res.status === 401) {
            setFriends([]);
            setLoadingFriends(false);
            return;
          }
          setFriends([]);
          setLoadingFriends(false);
          return;
        }
        const data = await res.json();
        setFriends(Array.isArray(data) ? data : []);
      } catch (e) {
        setFriends([]);
      } finally {
        if (mounted) setLoadingFriends(false);
      }
    }

    loadFriends();
    return () => {
      mounted = false;
    };
  }, [isPlayWithFriend]);

  // Invite-updated events listener (same as before)
  useEffect(() => {
    function handleInviteUpdated(e) {
      const payload = (e && e.detail) || e || {};
      const inviteId = payload.inviteId || payload.id;
      if (!inviteId) return;

      let matchedFriendId = null;
      setInviteStatusById((prev) => {
        const next = { ...prev };
        for (const fid of Object.keys(prev)) {
          const st = prev[fid];
          if (st && st.inviteId && String(st.inviteId) === String(inviteId)) {
            matchedFriendId = fid;
            next[fid] = {
              ...st,
              status: payload.status || st.status,
              message:
                payload.status === "accepted"
                  ? "Accepted — joining…"
                  : payload.status === "declined"
                  ? "Declined"
                  : st.message,
              ok: payload.status === "accepted" ? true : st.ok,
            };
            break;
          }
        }
        return next;
      });

      if (matchedFriendId && payload.status === "accepted" && payload.roomId) {
        try {
          setTimeout(() => {
            window.location.href = `/play/${encodeURIComponent(
              payload.roomId
            )}`;
          }, 250);
        } catch (e) {
          console.error("redirect after invite accepted failed", e);
        }
      }
    }

    window.addEventListener("chessapp:invite-updated", handleInviteUpdated);

    return () => {
      window.removeEventListener(
        "chessapp:invite-updated",
        handleInviteUpdated
      );
    };
  }, []);

  // MATCHMAKING (Play Online) client listeners
  useEffect(() => {
    const s = initSocket();
    if (!s) return;

    function clearMatchTimer() {
      if (matchmakingTimerRef.current) {
        try {
          clearTimeout(matchmakingTimerRef.current);
        } catch (e) {}
        matchmakingTimerRef.current = null;
      }
    }

    function onQueued(payload) {
      clearMatchTimer();
      setOnlineQueueing(true);
      setOnlineStatusMsg("Searching for an opponent...");

      // start/refresh client timeout: if no match found in X ms, auto-dequeue and tell user
      matchmakingTimerRef.current = setTimeout(() => {
        try {
          // emit dequeue
          s.emit("dequeue-match");
        } catch (e) {}
        setOnlineQueueing(false);
        setOnlineStatusMsg("No opponents found — please try again later");
        matchmakingTimerRef.current = null;
      }, MATCHMAKING_TIMEOUT_MS);
    }

    function onDequeued(payload) {
      // server confirmed dequeued or we manually dequeued
      if (matchmakingTimerRef.current) {
        try {
          clearTimeout(matchmakingTimerRef.current);
        } catch (e) {}
        matchmakingTimerRef.current = null;
      }
      setOnlineQueueing(false);
      // If server told us why, pick friendly message
      if (payload && payload.removed) {
        setOnlineStatusMsg("Matchmaking stopped");
      } else {
        setOnlineStatusMsg("Matchmaking stopped");
      }
    }

    function onFound(payload) {
      // got a match — clear timer, update UI and redirect to room
      if (matchmakingTimerRef.current) {
        try {
          clearTimeout(matchmakingTimerRef.current);
        } catch (e) {}
        matchmakingTimerRef.current = null;
      }
      setOnlineQueueing(false);
      setOnlineStatusMsg("Match found — joining room...");
      setLastMatchInfo(payload || null);
      if (payload && payload.roomId) {
        try {
          setTimeout(() => {
            window.location.href = `/play/${encodeURIComponent(
              payload.roomId
            )}`;
          }, 200);
        } catch (e) {}
      }
    }

    function onError(payload) {
      if (matchmakingTimerRef.current) {
        try {
          clearTimeout(matchmakingTimerRef.current);
        } catch (e) {}
        matchmakingTimerRef.current = null;
      }
      setOnlineQueueing(false);
      setOnlineStatusMsg(
        (payload && payload.error) || "Matchmaking error — please try again"
      );
    }

    s.on("match-queued", onQueued);
    s.on("match-dequeued", onDequeued);
    s.on("match-found", onFound);
    s.on("match-queue-error", onError);

    return () => {
      try {
        if (matchmakingTimerRef.current) {
          clearTimeout(matchmakingTimerRef.current);
          matchmakingTimerRef.current = null;
        }
      } catch (e) {}
      try {
        s.off("match-queued", onQueued);
        s.off("match-dequeued", onDequeued);
        s.off("match-found", onFound);
        s.off("match-queue-error", onError);
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Invite friend
  async function inviteFriendToGame(friend) {
    try {
      setInviteStatusById((s) => ({ ...s, [friend.id]: { sending: true } }));
      const base = backendOrigin();
      const payload = {
        toUserId: friend.id,
        minutes: Number(createMinutes) || 5,
        colorPreference: createColorPref || "random",
      };
      const res = await fetch(`${base}/api/invites`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let body = null;
        try {
          body = await res.json();
        } catch {}
        const msg = (body && body.error) || `Invite failed (${res.status})`;
        // <-- FIX: return object (not array) when updating state
        setInviteStatusById((s) => ({
          ...s,
          [friend.id]: { ok: false, message: msg },
        }));
        setTimeout(() => {
          setInviteStatusById((s) => ({ ...s, [friend.id]: null }));
        }, 3500);
        return;
      }

      const data = await res.json();
      // <-- FIX: return object (not array) when updating state
      setInviteStatusById((s) => ({
        ...s,
        [friend.id]: {
          ok: true,
          message: "Invite sent",
          inviteId: data.inviteId,
        },
      }));
      setTimeout(() => {
        setInviteStatusById((s) => ({ ...s, [friend.id]: null }));
      }, 3500);
    } catch (err) {
      // <-- FIX: return object (not array) when updating state
      setInviteStatusById((s) => ({
        ...s,
        [friend.id]: { ok: false, message: "Network error" },
      }));
      setTimeout(() => {
        setInviteStatusById((s) => ({ ...s, [friend.id]: null }));
      }, 3500);
    } finally {
      setInviteStatusById((s) => ({
        ...s,
        [friend.id]: { ...(s[friend.id] || {}), sending: false },
      }));
    }
  }

  // PLAY ONLINE: enqueue
  const playOnline = useCallback(() => {
    const s = initSocket();
    if (!s) {
      setOnlineStatusMsg("Socket not available");
      return;
    }
    const cups =
      (auth && auth.user && (auth.user.cups || auth.user.cups === 0)
        ? Number(auth.user.cups)
        : null) || 1200;
    try {
      s.emit("enqueue-match", { cups, minutes: Number(createMinutes) || 5 });
      setOnlineStatusMsg("Searching for an opponent...");
      setOnlineQueueing(true);

      // client-side safety: if server doesn't send match-queued, still auto-timeout after MATCHMAKING_TIMEOUT_MS
      if (matchmakingTimerRef.current) {
        try {
          clearTimeout(matchmakingTimerRef.current);
        } catch (e) {}
        matchmakingTimerRef.current = null;
      }
      matchmakingTimerRef.current = setTimeout(() => {
        try {
          s.emit("dequeue-match");
        } catch (e) {}
        matchmakingTimerRef.current = null;
        setOnlineQueueing(false);
        setOnlineStatusMsg("No opponents found — please try again later");
      }, MATCHMAKING_TIMEOUT_MS);
    } catch (e) {
      setOnlineQueueing(false);
      setOnlineStatusMsg("Failed to start matchmaking");
    }
  }, [auth, createMinutes]);

  const cancelPlayOnline = useCallback(() => {
    const s = initSocket();
    if (!s) {
      setOnlineStatusMsg("Socket not available");
      setOnlineQueueing(false);
      // clear timeout if any
      if (matchmakingTimerRef.current) {
        try {
          clearTimeout(matchmakingTimerRef.current);
        } catch (e) {}
        matchmakingTimerRef.current = null;
      }
      return;
    }
    try {
      s.emit("dequeue-match");
      // clear timeout if any
      if (matchmakingTimerRef.current) {
        try {
          clearTimeout(matchmakingTimerRef.current);
        } catch (e) {}
        matchmakingTimerRef.current = null;
      }
      setOnlineQueueing(false);
      setOnlineStatusMsg("Stopped searching");
    } catch (e) {
      setOnlineStatusMsg("Failed to cancel matchmaking");
    }
  }, []);

  // --- NEW: client-side guard before creating a room
  async function ensureNoActiveRoomBeforeCreate() {
    try {
      const uid = auth?.user?.id || auth?.user?._id;
      if (!uid) return true; // not logged in — let server decide
      const base = backendOrigin();
      const res = await fetch(
        `${base}/api/players/${encodeURIComponent(uid)}`,
        {
          credentials: "include",
        }
      );
      if (!res.ok) return true; // can't fetch — allow create (server will deny if needed)
      const data = await res.json().catch(() => null);
      if (data && data.activeRoom) {
        // dispatch global event so modal opens
        try {
          window.dispatchEvent(
            new CustomEvent("chessapp:join-denied-active-room", {
              detail: {
                activeRoom: data.activeRoom,
                message: "You already have an active game.",
              },
            })
          );
        } catch (e) {}
        return false;
      }
    } catch (e) {
      // network error -> allow (server will deny if necessary)
    }
    return true;
  }

  // --- Avatar normalization helpers for friend list ---
  function normalizeAvatarRaw(raw) {
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = backendOrigin().replace(/\/$/, "");
    const path = raw.startsWith("/") ? raw : `/${raw}`;
    return `${base}${path}`;
  }

  function avatarForFriend(f) {
    if (!f) return null;
    const candidate = f.avatarUrlAbsolute || f.avatarUrl || f.avatar || null;
    if (!candidate)
      return `${backendOrigin().replace(
        /\/$/,
        ""
      )}/api/uploads/default-avatar.png`;
    return normalizeAvatarRaw(candidate);
  }

  // --- NEW: Play with Bot handlers ---
  async function createRoomWithBot() {
    try {
      const ok = await ensureNoActiveRoomBeforeCreate();
      if (!ok) return;
      setBotCreating(true);
      setPlayWithBotMsg("Creating bot game…");

      const s = initSocket();
      if (!s) {
        setPlayWithBotMsg("Socket not available");
        setBotCreating(false);
        return;
      }

      // Create a unique bot id so server can detect it (roomManager looks for id starting with 'bot:')
      const botId = `bot:${Number(botLevel) || 2}-${Date.now()}`;

      // Send create-room request directly to server socket (most server socket handlers accept same options your createRoom prop would)
      const opts = {
        minutes: Number(createMinutes) || 5,
        colorPreference: createColorPref || "random",
        userB: { id: botId, username: "Bot" },
        botLevel: Number(botLevel) || 2,
      };

      // Wait for acknowledgement with roomId (server should emit room-created or similar).
      // We'll listen once for 'room-created' on our socket to redirect when successful.
      const onRoomCreated = (payload) => {
        try {
          if (payload && payload.ok && payload.roomId) {
            setPlayWithBotMsg("Bot game started — joining...");
            // small delay for UX
            setTimeout(() => {
              window.location.href = `/play/${encodeURIComponent(
                payload.roomId
              )}`;
            }, 150);
          } else if (payload && payload.error) {
            setPlayWithBotMsg(payload.error || "Failed to create bot room");
            setBotCreating(false);
          } else {
            setPlayWithBotMsg("Failed to create bot room");
            setBotCreating(false);
          }
        } catch (e) {
          setBotCreating(false);
        } finally {
          try {
            s.off("room-created", onRoomCreated);
          } catch (e) {}
        }
      };

      // fallback: some servers reply via 'room-created' event, others via 'create-room-result'
      const onCreateRoomResult = (payload) => {
        try {
          if (payload && payload.ok && payload.roomId) {
            setPlayWithBotMsg("Bot game started — joining...");
            setTimeout(() => {
              window.location.href = `/play/${encodeURIComponent(
                payload.roomId
              )}`;
            }, 150);
          } else {
            setPlayWithBotMsg(
              payload && payload.error ? payload.error : "Failed to create room"
            );
            setBotCreating(false);
          }
        } catch (e) {
          setBotCreating(false);
        } finally {
          try {
            s.off("create-room-result", onCreateRoomResult);
          } catch (e) {}
        }
      };

      s.once("room-created", onRoomCreated);
      s.once("create-room-result", onCreateRoomResult);

      // emit create-room (your server-side socket handlers already understand these options)
      try {
        s.emit("create-room", opts);
      } catch (e) {
        setPlayWithBotMsg("Failed to send create request");
        setBotCreating(false);
        try {
          s.off("room-created", onRoomCreated);
          s.off("create-room-result", onCreateRoomResult);
        } catch (e2) {}
      }

      // safety: if no response after X seconds, clear state
      setTimeout(() => {
        if (botCreating) {
          setBotCreating(false);
          setPlayWithBotMsg("");
          try {
            s.off("room-created", onRoomCreated);
            s.off("create-room-result", onCreateRoomResult);
          } catch (e) {}
        }
      }, 8000);
    } catch (e) {
      console.error("createRoomWithBot error", e);
      setBotCreating(false);
      setPlayWithBotMsg("Failed to create bot room");
    }
  }

  return (
    <header className={styles.header}>
      <div className={styles.headerControls}>
        <div className={styles.headerControlsBox}>
          <button
            className={`${styles.btn} ${styles["btn-primary"]}`}
            onClick={joinRoom}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="36"
              height="36"
              fill="#000000"
              viewBox="0 0 256 256"
            >
              <path d="M232,216H208V40a16,16,0,0,0-16-16H64A16,16,0,0,0,48,40V216H24a8,8,0,0,0,0,16H232a8,8,0,0,0,0-16Zm-64,0H64V40H168Zm-40-84a12,12,0,1,1,12,12A12,12,0,0,1,128,132Z"></path>
            </svg>
            Join Room
          </button>

          <button
            className={styles.btn}
            onClick={() => setIsPlayWithFriend((v) => !v)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="36"
              height="36"
              fill="#000000"
              viewBox="0 0 256 256"
            >
              <path d="M216,32H152a8,8,0,0,0-6.34,3.12l-64,83.21L72,108.69a16,16,0,0,0-22.64,0l-8.69,8.7a16,16,0,0,0,0,22.63l22,22-32,32a16,16,0,0,0,0,22.63l8.69,8.68a16,16,0,0,0,22.62,0l32-32,22,22a16,16,0,0,0,22.64,0l8.69-8.7a16,16,0,0,0,0-22.63l-9.64-9.64,83.21-64A8,8,0,0,0,224,104V40A8,8,0,0,0,216,32Zm-8,68.06-81.74,62.88L115.32,152l50.34-50.34a8,8,0,0,0-11.32-11.31L104,140.68,93.07,129.74,155.94,48H208Z"></path>
            </svg>
            Play with Friend
          </button>

          {isPlayWithFriend && (
            <div className={styles.isPlayWithFriend}>
              <input
                className={`${styles.roomInput} ${styles.createCodeInput}`}
                value={createCode}
                onChange={(e) => setCreateCode(e.target.value)}
                placeholder="Optional custom code"
              />

              <div className={styles.selectGroup}>
                <select
                  value={createMinutes}
                  onChange={(e) => setCreateMinutes(Number(e.target.value))}
                  className={styles.roomInput}
                >
                  <option value={1}>1 min</option>
                  <option value={3}>3 min</option>
                  <option value={5}>5 min</option>
                  <option value={10}>10 min</option>
                  <option value={15}>15 min</option>
                </select>

                <select
                  value={createColorPref}
                  onChange={(e) => setCreateColorPref(e.target.value)}
                  className={styles.roomInput}
                >
                  <option value="random">Random</option>
                  <option value="white">White</option>
                  <option value="black">Black</option>
                </select>
              </div>

              <div className={styles.createActions}>
                <button
                  className={`${styles.btn} btn-secondary ${styles.headerControlsbtn}`}
                  onClick={async () => {
                    const ok = await ensureNoActiveRoomBeforeCreate();
                    if (ok) {
                      createRoom();
                    }
                  }}
                >
                  Create Room
                </button>

                <div className={styles.inviteColumn}>
                  <div className={styles.friendsListContainer}>
                    <div className={styles.friendsHeader}>Your friends</div>

                    {loadingFriends && <div>Loading friends…</div>}
                    {!loadingFriends && friends.length === 0 && (
                      <div className={styles.noFriends}>No friends found</div>
                    )}

                    <div className={styles.friendsList}>
                      {friends.map((f) => {
                        const st = inviteStatusById[f.id] || null;
                        return (
                          <div key={f.id} className={styles.friendRow}>
                            <div className={styles.friendInfo}>
                              <img
                                alt={f.username}
                                src={avatarForFriend(f)}
                                className={styles.friendAvatar}
                              />
                              <div className={styles.friendTitle}>
                                <div className={styles.friendName}>
                                  {f.displayName || f.username}
                                </div>
                                <div className={styles.friendMeta}>
                                  {f.country ? f.country : ""}
                                  {f.online ? " • online" : ""}
                                </div>
                              </div>
                            </div>

                            <div className={styles.friendActions}>
                              <button
                                className={`${styles.btn} ${styles.btnInvite}`}
                                onClick={() => inviteFriendToGame(f)}
                                disabled={st && st.sending}
                              >
                                {st && st.sending ? "Inviting…" : "Invite"}
                              </button>
                              {st && st.message && (
                                <div
                                  className={
                                    st.ok ? styles.inviteOk : styles.inviteError
                                  }
                                >
                                  {st.message}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* NEW: Play Online */}
          <button
            className={`${styles.btn} ${styles["btn-online"]}`}
            onClick={() => {
              if (!onlineQueueing) playOnline();
              else cancelPlayOnline();
            }}
            title="Quick match vs player at your cups (expands if none available)"
          >
            {onlineQueueing ? (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="36"
                  height="36"
                  fill="#000000"
                  viewBox="0 0 256 256"
                >
                  <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm37.66,130.34a8,8,0,0,1-11.32,11.32L128,139.31l-26.34,26.35a8,8,0,0,1-11.32-11.32L116.69,128,90.34,101.66a8,8,0,0,1,11.32-11.32L128,116.69l26.34-26.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path>
                </svg>
                Cancel Play Random
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="36"
                  height="36"
                  fill="#000000"
                  viewBox="0 0 256 256"
                >
                  <path d="M245.11,60.68c-7.65-13.19-27.85-16.16-58.5-8.66A96,96,0,0,0,32.81,140.3C5.09,169,5.49,186,10.9,195.32,16,204.16,26.64,208,40.64,208a124.11,124.11,0,0,0,28.79-4,96,96,0,0,0,153.78-88.25c12.51-13,20.83-25.35,23.66-35.92C248.83,72.51,248.24,66.07,245.11,60.68Zm-13.69,15c-6.11,22.78-48.65,57.31-87.52,79.64-67.81,39-113.62,41.52-119.16,32-1.46-2.51-.65-7.24,2.22-13a80.06,80.06,0,0,1,10.28-15.05,95.53,95.53,0,0,0,6.23,14.18,4,4,0,0,0,4,2.12,122.14,122.14,0,0,0,16.95-3.32c21.23-5.55,46.63-16.48,71.52-30.78s47-30.66,62.45-46.15A122.74,122.74,0,0,0,209.7,82.45a4,4,0,0,0,.17-4.52,96.26,96.26,0,0,0-9.1-12.46c14.21-2.35,27.37-2.17,30.5,3.24C232.19,70.28,232.24,72.63,231.42,75.69Z"></path>
                </svg>
                Play with Random
              </>
            )}
          </button>

          {/* NEW: Play with Bot */}
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <select
              value={botLevel}
              onChange={(e) => setBotLevel(Number(e.target.value))}
              className={styles.roomInput}
              title="Bot strength"
              style={{ width: 120 }}
            >
              <option value={1}>Bot: Easy</option>
              <option value={2}>Bot: Medium</option>
              <option value={3}>Bot: Hard</option>
              <option value={4}>Bot: Very Hard</option>
            </select>

            <button
              className={`${styles.btn} ${styles["btn-bot"]}`}
              onClick={() => createRoomWithBot()}
              disabled={botCreating}
              title="Create a private match vs an AI bot"
            >
              {botCreating ? (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2a1 1 0 011 1v1h2a2 2 0 012 2v2h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v2a2 2 0 01-2 2h-2v1a1 1 0 01-1 1h-2a1 1 0 01-1-1v-1H8a2 2 0 01-2-2v-2H5a1 1 0 01-1-1V9a1 1 0 011-1h1V6a2 2 0 012-2h2V3a1 1 0 011-1h2z" />
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2a1 1 0 011 1v1h2a2 2 0 012 2v2h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v2a2 2 0 01-2 2h-2v1a1 1 0 01-1 1h-2a1 1 0 01-1-1v-1H8a2 2 0 01-2-2v-2H5a1 1 0 01-1-1V9a1 1 0 011-1h1V6a2 2 0 012-2h2V3a1 1 0 011-1h2z" />
                  </svg>
                  Play with Bot
                </>
              )}
            </button>
          </div>
        </div>

        {/* Online matchmaking status */}
        <div className={styles.onlineStatus}>
          {onlineStatusMsg && <div>{onlineStatusMsg}</div>}
          {lastMatchInfo && lastMatchInfo.roomId && (
            <div>
              Matched — joining{" "}
              <button
                className={styles.btn}
                onClick={() =>
                  (window.location.href = `/play/${encodeURIComponent(
                    lastMatchInfo.roomId
                  )}`)
                }
              >
                Open
              </button>
            </div>
          )}
          {playWithBotMsg && (
            <div style={{ marginTop: 8 }}>{playWithBotMsg}</div>
          )}
        </div>
      </div>
    </header>
  );
}
