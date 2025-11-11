// frontend/components/NotificationBell/NotificationBell.js
"use client";
import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./Notifications.module.css";

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://chess-backend-api.onrender.com/api";

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState({});
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
        <span className={styles.bellIcon}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            id="Bell--Streamline-Font-Awesome"
            height="16"
            width="16"
          >
            <desc>Bell Streamline Icon: https://streamlinehq.com</desc>
            <path
              d="M7.999325 0.16c-0.5420642857142857 0 -0.98 0.4379392857142857 -0.98 0.98v0.588c-2.2356249999999998 0.45325 -3.92 2.431625 -3.92 4.802v0.5757499999999999c0 1.439375 -0.5298142857142857 2.82975 -1.4853142857142856 3.90775l-0.226625 0.25418928571428573c-0.25725 0.28787499999999994 -0.31849999999999995 0.7013107142857143 -0.16231071428571428 1.0534999999999999S1.73345 12.899999999999999 2.119325 12.899999999999999h11.759999999999998c0.385875 0 0.7349999999999999 -0.226625 0.89425 -0.5788107142857143s0.09493571428571428 -0.765625 -0.16231428571428572 -1.0534999999999999l-0.226625 -0.25418928571428573c-0.9555 -1.078 -1.4853107142857143 -2.4653107142857142 -1.4853107142857143 -3.90775V6.529999999999999c0 -2.370375 -1.684375 -4.34875 -3.92 -4.802V1.14c0 -0.5420607142857142 -0.4379392857142857 -0.98 -0.98 -0.98Zm1.3873107142857144 15.107314285714285c0.36749999999999994 -0.36749999999999994 0.5726892857142857 -0.8666892857142856 0.5726892857142857 -1.3873142857142857h-3.92c0 0.520625 0.20518571428571425 1.0198142857142856 0.5726857142857142 1.3873142857142857s0.8666892857142856 0.5726857142857142 1.3873142857142857 0.5726857142857142 1.0198107142857142 -0.20518571428571425 1.3873107142857144 -0.5726857142857142Z"
              fill="#000000"
              strokeWidth="0.0357"
            ></path>
          </svg>
        </span>
        {unreadCount() > 0 && (
          <span className={styles.badge}>{unreadCount()}</span>
        )}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.headerRow}>
            <h2 className={styles.title}>Notifications</h2>
            <div className={styles.controls}>
              <button onClick={() => fetchList()} className={styles.btn}>
                Refresh
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
