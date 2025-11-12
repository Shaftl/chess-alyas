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

  return (
    <header className={styles.header}>
      <div className={styles.headerControls}>
        <div className={styles.headerControlsBox}>
          <button
            className={`${styles.btn} ${styles["btn-primary"]}`}
            onClick={joinRoom}
          >
            Join Room
          </button>

          <button
            className={styles.btn}
            onClick={() => setIsPlayWithFriend((v) => !v)}
          >
            Play with Friend
          </button>

          {/* NEW: Play Online */}
          <button
            className={`${styles.btn} ${styles["btn-online"]}`}
            onClick={() => {
              if (!onlineQueueing) playOnline();
              else cancelPlayOnline();
            }}
            title="Quick match vs player at your cups (expands if none available)"
          >
            {onlineQueueing ? "Cancel Play Random" : "Play with Random"}
          </button>
        </div>

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
                              src={
                                f.avatarUrlAbsolute
                                  ? `https://chess-backend-api.onrender.com/api${f.avatarUrlAbsolute}`
                                  : `https://chess-backend-api.onrender.com/api${f.avatarUrl}` ||
                                    `/api/uploads/default-avatar.png`
                              }
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
        </div>
      </div>
    </header>
  );
}
