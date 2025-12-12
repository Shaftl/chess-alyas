// frontend/components/NotificationBell/NotificationBell.js
"use client";
import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./Notifications.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState({});
  const [allProcessing, setAllProcessing] = useState(false); // NEW: state for mark-all action
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    fetchList();

    function upsertOrRefresh(payload) {
      try {
        const id = payload?.id || payload?._id || payload?.inviteId;
        if (!id) {
          fetchList();
          return;
        }
        setItems((prev) => {
          const idx = prev.findIndex((x) => (x.id || x._id) === id);
          if (idx === -1) {
            return [payload, ...prev].slice(0, 200);
          }
          const next = [...prev];
          next[idx] = { ...next[idx], ...payload };
          return next;
        });
      } catch (e) {
        fetchList();
      }
    }

    const onNotification = (e) => {
      const payload = (e && e.detail) || e;
      upsertOrRefresh(payload);
    };

    const onInviteUpdated = (e) => {
      fetchList();
    };

    const onInviteReceived = (e) => {
      upsertOrRefresh((e && e.detail) || e);
    };

    const onChallengeAccepted = (e) => {
      const payload = (e && e.detail) || e;
      const roomId =
        payload && (payload.roomId || payload.room || payload.room_id);
      if (roomId) {
        try {
          router.push(`/play/${roomId}`);
        } catch (err) {
          window.location.href = `/play/${roomId}`;
        }
      }
      upsertOrRefresh(payload);
      setTimeout(fetchList, 300);
    };

    // generic handlers
    const onFriendAccepted = (e) => {
      upsertOrRefresh((e && e.detail) || e);
      setTimeout(fetchList, 300);
    };
    const onFriendDeclined = (e) => {
      upsertOrRefresh((e && e.detail) || e);
      setTimeout(fetchList, 300);
    };
    const onDrawAccepted = (e) => {
      upsertOrRefresh((e && e.detail) || e);
      setTimeout(fetchList, 300);
    };
    const onDrawDeclined = (e) => {
      upsertOrRefresh((e && e.detail) || e);
      setTimeout(fetchList, 300);
    };
    const onRematchOffered = (e) => {
      upsertOrRefresh((e && e.detail) || e);
      setTimeout(fetchList, 300);
    };
    const onRematchDeclined = (e) => {
      upsertOrRefresh((e && e.detail) || e);
      setTimeout(fetchList, 300);
    };
    const onChallengeDeclined = (e) => {
      upsertOrRefresh((e && e.detail) || e);
      setTimeout(fetchList, 300);
    };
    const onChallengeReceived = (e) => {
      upsertOrRefresh((e && e.detail) || e);
      setTimeout(fetchList, 300);
    };

    // Refresh on socket connect (ensures missed events are pulled in)
    const onSocketConnected = () => fetchList();

    // register
    window.addEventListener("chessapp:notification", onNotification);
    window.addEventListener("chessapp:invite-updated", onInviteUpdated);
    window.addEventListener("chessapp:invite-received", onInviteReceived);
    window.addEventListener("chessapp:challenge-accepted", onChallengeAccepted);
    window.addEventListener("chessapp:challenge-received", onChallengeReceived);

    window.addEventListener(
      "chessapp:friend-request-accepted",
      onFriendAccepted
    );
    window.addEventListener(
      "chessapp:friend-request-declined",
      onFriendDeclined
    );
    window.addEventListener("chessapp:draw-accepted", onDrawAccepted);
    window.addEventListener("chessapp:draw-declined", onDrawDeclined);
    window.addEventListener("chessapp:rematch-offered", onRematchOffered);
    window.addEventListener("chessapp:rematch-declined", onRematchDeclined);
    window.addEventListener("chessapp:challenge-declined", onChallengeDeclined);

    window.addEventListener("chessapp:socket-connected", onSocketConnected);

    // underscore variants
    window.addEventListener(
      "chessapp:friend_request_accepted",
      onFriendAccepted
    );
    window.addEventListener(
      "chessapp:friend_request_declined",
      onFriendDeclined
    );
    window.addEventListener("chessapp:draw_accepted", onDrawAccepted);
    window.addEventListener("chessapp:draw_declined", onDrawDeclined);

    return () => {
      mounted.current = false;
      window.removeEventListener("chessapp:notification", onNotification);
      window.removeEventListener("chessapp:invite-updated", onInviteUpdated);
      window.removeEventListener("chessapp:invite-received", onInviteReceived);
      window.removeEventListener(
        "chessapp:challenge-accepted",
        onChallengeAccepted
      );
      window.removeEventListener(
        "chessapp:challenge-received",
        onChallengeReceived
      );

      window.removeEventListener(
        "chessapp:friend-request-accepted",
        onFriendAccepted
      );
      window.removeEventListener(
        "chessapp:friend-request-declined",
        onFriendDeclined
      );
      window.removeEventListener("chessapp:draw-accepted", onDrawAccepted);
      window.removeEventListener("chessapp:draw-declined", onDrawDeclined);
      window.removeEventListener("chessapp:rematch-offered", onRematchOffered);
      window.removeEventListener(
        "chessapp:rematch-declined",
        onRematchDeclined
      );
      window.removeEventListener(
        "chessapp:challenge-declined",
        onChallengeDeclined
      );

      window.removeEventListener(
        "chessapp:socket-connected",
        onSocketConnected
      );

      window.removeEventListener(
        "chessapp:friend_request_accepted",
        onFriendAccepted
      );
      window.removeEventListener(
        "chessapp:friend_request_declined",
        onFriendDeclined
      );
      window.removeEventListener("chessapp:draw_accepted", onDrawAccepted);
      window.removeEventListener("chessapp:draw_accepted", onDrawAccepted);
      window.removeEventListener("chessapp:draw_declined", onDrawDeclined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchList() {
    try {
      setLoading(true);
      const res = await fetch(`${API}/notifications`, {
        credentials: "include",
      });
      if (!res.ok) {
        setItems([]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setItems(data || []);
    } catch (e) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function unreadCount() {
    return (items || []).filter((i) => !i.read).length;
  }

  async function markRead(notificationId) {
    try {
      if (!notificationId) return;
      setProcessing((s) => ({ ...s, [notificationId]: true }));
      await fetch(`${API}/notifications/${notificationId}/read`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      setItems((prev) =>
        prev.map((p) =>
          p.id === notificationId || p._id === notificationId
            ? { ...p, read: true }
            : p
        )
      );
    } catch (e) {
      console.error("markRead error", e);
    } finally {
      setProcessing((s) => ({ ...s, [notificationId]: false }));
    }
  }

  // NEW: Mark all notifications as read
  async function markAllRead() {
    try {
      if (!items || items.length === 0) return;
      setAllProcessing(true);
      const res = await fetch(`${API}/notifications/mark-all-read`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        // fallback: optimistically mark local items as read
        setItems((prev) => prev.map((p) => ({ ...p, read: true })));
        return;
      }
      const json = await res.json();
      // server returns notifications list — if present, use it; otherwise fallback to marking locally
      if (json && Array.isArray(json.notifications)) {
        setItems(json.notifications);
      } else {
        setItems((prev) => prev.map((p) => ({ ...p, read: true })));
      }
    } catch (e) {
      console.error("markAllRead error", e);
      // optimistic fallback
      setItems((prev) => prev.map((p) => ({ ...p, read: true })));
    } finally {
      setAllProcessing(false);
    }
  }

  async function actionOnNotification(notificationId, action) {
    if (!notificationId || !action) return null;
    try {
      setProcessing((s) => ({ ...s, [notificationId]: true }));
      const res = await fetch(`${API}/notifications/${notificationId}/action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();

      const roomId = json && (json.roomId || json.room_id || json.room);
      if (roomId) {
        try {
          router.push(`/play/${roomId}`);
        } catch (err) {
          window.location.href = `/play/${roomId}`;
        }
      }

      if (json && json.notification) {
        const n = json.notification;
        setItems((prev) =>
          prev.map((p) =>
            p.id === (n.id || n._id) || p._id === (n.id || n._id)
              ? { ...p, ...n }
              : p
          )
        );
      } else {
        setTimeout(fetchList, 300);
      }

      return json;
    } catch (e) {
      console.error("actionOnNotification error", e);
      return null;
    } finally {
      setProcessing((s) => ({ ...s, [notificationId]: false }));
    }
  }

  function renderActions(n) {
    const typ = n.type || "";
    const nid = n.id || n._id;
    const isProcessing = !!processing[nid];
    const actions = [];
    if (typ === "friend_request") {
      if (!n.read && n.status !== "accepted" && n.status !== "declined") {
        actions.push(
          <button
            key="acc"
            disabled={isProcessing}
            onClick={() => actionOnNotification(nid, "accept_friend")}
            className={`${styles.btn} ${styles.primary}`}
          >
            Accept
          </button>
        );
        actions.push(
          <button
            key="dec"
            disabled={isProcessing}
            onClick={() => actionOnNotification(nid, "decline_friend")}
            className={styles.btn}
          >
            Decline
          </button>
        );
      } else {
        actions.push(
          <div key="status" className={styles.statusText}>
            {n.status || "handled"}
          </div>
        );
      }
    } else if (typ === "rematch" || typ === "rematch_offered") {
      if (!n.read && n.status !== "accepted" && n.status !== "declined") {
        actions.push(
          <button
            key="acc"
            disabled={isProcessing}
            onClick={() => actionOnNotification(nid, "accept_rematch")}
            className={`${styles.btn} ${styles.primary}`}
          >
            Accept
          </button>
        );
        actions.push(
          <button
            key="dec"
            disabled={isProcessing}
            onClick={() => actionOnNotification(nid, "decline_rematch")}
            className={styles.btn}
          >
            Decline
          </button>
        );
      } else {
        actions.push(
          <div key="status" className={styles.statusText}>
            {n.status || "handled"}
          </div>
        );
      }
    } else if (typ === "draw_offer") {
      if (!n.read && n.status !== "accepted" && n.status !== "declined") {
        actions.push(
          <button
            key="acc"
            disabled={isProcessing}
            onClick={() => actionOnNotification(nid, "accept_draw")}
            className={`${styles.btn} ${styles.primary}`}
          >
            Accept
          </button>
        );
        actions.push(
          <button
            key="dec"
            disabled={isProcessing}
            onClick={() => actionOnNotification(nid, "decline_draw")}
            className={styles.btn}
          >
            Decline
          </button>
        );
      } else {
        actions.push(
          <div key="status" className={styles.statusText}>
            {n.status || "handled"}
          </div>
        );
      }
    } else if (typ === "challenge") {
      if (!n.read && n.status !== "accepted" && n.status !== "declined") {
        actions.push(
          <button
            key="acc"
            disabled={isProcessing}
            onClick={() => actionOnNotification(nid, "accept_challenge")}
            className={`${styles.btn} ${styles.primary}`}
          >
            Accept
          </button>
        );
        actions.push(
          <button
            key="dec"
            disabled={isProcessing}
            onClick={() => actionOnNotification(nid, "decline_challenge")}
            className={styles.btn}
          >
            Decline
          </button>
        );
      } else {
        actions.push(
          <div key="status" className={styles.statusText}>
            {n.status || "handled"}
          </div>
        );
      }
    }
    return actions;
  }

  // new: render different bell svg when there are unread notifications
  function renderBellIcon() {
    const hasUnread = unreadCount() > 0;
    if (hasUnread) {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="36"
          height="36"
          fill="#000000"
          viewBox="0 0 256 256"
        >
          <path d="M224,71.1a8,8,0,0,1-10.78-3.42,94.13,94.13,0,0,0-33.46-36.91,8,8,0,1,1,8.54-13.54,111.46,111.46,0,0,1,39.12,43.09A8,8,0,0,1,224,71.1ZM35.71,72a8,8,0,0,0,7.1-4.32A94.13,94.13,0,0,1,76.27,30.77a8,8,0,1,0-8.54-13.54A111.46,111.46,0,0,0,28.61,60.32,8,8,0,0,0,35.71,72Zm186.1,103.94A16,16,0,0,1,208,200H167.2a40,40,0,0,1-78.4,0H48a16,16,0,0,1-13.79-24.06C43.22,160.39,48,138.28,48,112a80,80,0,0,1,160,0C208,138.27,212.78,160.38,221.81,175.94ZM150.62,200H105.38a24,24,0,0,0,45.24,0Z"></path>
        </svg>
      );
    }

    // default (no unread) - keep same visual as before but match original sizing
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="32"
        height="32"
        fill="#000000"
        viewBox="0 0 256 256"
      >
        <path d="M221.8,175.94C216.25,166.38,208,139.33,208,104a80,80,0,1,0-160,0c0,35.34-8.26,62.38-13.81,71.94A16,16,0,0,0,48,200H88.81a40,40,0,0,0,78.38,0H208a16,16,0,0,0,13.8-24.06ZM128,216a24,24,0,0,1-22.62-16h45.24A24,24,0,0,1,128,216Z"></path>
      </svg>
    );
  }

  return (
    <div className={styles.container}>
      <button
        aria-label="Notifications"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) fetchList();
        }}
        className={styles.bellButton}
      >
        <span className={styles.bellIcon}>{renderBellIcon()}</span>
        {unreadCount() > 0 && (
          <span className={styles.badge}>{unreadCount()}</span>
        )}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.headerRow}>
            <h2 className={styles.title}>Notifications</h2>
            <div className={styles.controls}>
              <button
                onClick={() => fetchList()}
                className={`${styles.btn} ${styles.btnReferesh}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  fill="#000000"
                  viewBox="0 0 256 256"
                >
                  <path d="M224,48V96a8,8,0,0,1-8,8H168a8,8,0,0,1-5.66-13.66L180.65,72a79.48,79.48,0,0,0-54.72-22.09h-.45A79.52,79.52,0,0,0,69.59,72.71,8,8,0,0,1,58.41,61.27,96,96,0,0,1,192,60.7l18.36-18.36A8,8,0,0,1,224,48ZM186.41,183.29A80,80,0,0,1,75.35,184l18.31-18.31A8,8,0,0,0,88,152H40a8,8,0,0,0-8,8v48a8,8,0,0,0,13.66,5.66L64,195.3a95.42,95.42,0,0,0,66,26.76h.53a95.36,95.36,0,0,0,67.07-27.33,8,8,0,0,0-11.18-11.44Z"></path>
                </svg>
              </button>
              {/* NEW: Mark all as read; disabled while processing */}
              <button
                onClick={() => markAllRead()}
                className={styles.btn}
                disabled={allProcessing}
                title="Mark all notifications as read"
              >
                {allProcessing ? "Marking…" : "Mark all read"}
              </button>
            </div>
          </div>

          {loading && <div className={styles.loading}>Loading…</div>}
          {!loading && items.length === 0 && (
            <div className={styles.emptyState}>No notifications</div>
          )}

          <div className={styles.notificationsList}>
            {items.map((n) => {
              const nid = n.id || n._id || n.inviteId;
              return (
                <div
                  key={nid}
                  className={`${styles.notificationCard} ${
                    !n.read ? styles.unread : ""
                  }`}
                >
                  <div className={styles.notificationContent}>
                    <div className={styles.notificationMain}>
                      <div className={styles.notificationTitle}>
                        {n.title || n.type || "Notification"}
                      </div>
                      <div className={styles.notificationBody}>{n.body}</div>

                      <div className={styles.notificationLinks}>
                        {n.data && n.data.fromUserId && (
                          <div className={styles.linkContainer}>
                            <Link href={`/player/${n.data.fromUserId}`}>
                              <span
                                onClick={() => markRead(nid)}
                                className={styles.link}
                              >
                                View player
                              </span>
                            </Link>
                          </div>
                        )}

                        {n.data && n.data.roomId && (
                          <div className={styles.linkContainer}>
                            <Link href={`/play/${n.data.roomId}`}>
                              <span
                                onClick={() => markRead(nid)}
                                className={styles.link}
                              >
                                Open room
                              </span>
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className={styles.notificationMeta}>
                      <div className={styles.timestamp}>
                        <span className={styles.timestampIcon}>⏱</span>
                        {new Date(
                          n.createdAt || n.ts || Date.now()
                        ).toLocaleString()}
                      </div>
                      <div className={styles.notificationActions}>
                        <div className={styles.actions}>
                          {!n.read && (
                            <button
                              disabled={!!processing[nid]}
                              onClick={() => markRead(nid)}
                              className={styles.btn}
                            >
                              Mark read
                            </button>
                          )}
                          {renderActions(n)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
