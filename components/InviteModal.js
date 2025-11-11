"use client";
import React, { useEffect, useState, useRef } from "react";
import styles from "./InviteModal.module.css";
import { backendOrigin } from "@/lib/chessUtils";

export default function InviteModal() {
  const [invites, setInvites] = useState([]);
  // map of inviteId -> timeout id for client-side removal
  const removalTimersRef = useRef(new Map());

  useEffect(() => {
    function clearRemovalTimer(id) {
      try {
        const t = removalTimersRef.current.get(String(id));
        if (t) {
          clearTimeout(t);
          removalTimersRef.current.delete(String(id));
        }
      } catch (e) {}
    }

    function scheduleClientRemoval(inviteId, createdAtMillis) {
      try {
        // if already scheduled, do nothing
        if (removalTimersRef.current.has(String(inviteId))) return;
        const createdAt = Number(createdAtMillis) || Date.now();
        const removeAt = createdAt + 10_000; // 10 seconds client-side
        const delay = Math.max(0, removeAt - Date.now());
        const t = setTimeout(() => {
          setInvites((s) => s.filter((i) => i.inviteId !== inviteId));
          removalTimersRef.current.delete(String(inviteId));
        }, delay);
        removalTimersRef.current.set(String(inviteId), t);
      } catch (e) {}
    }

    function handleReceived(e) {
      const payload = (e && e.detail) || e || {};
      const inviteId =
        payload.inviteId || payload.id || `${Date.now()}-${Math.random()}`;
      const from = payload.from || {};
      const item = {
        inviteId,
        from: {
          id: from.id || from.userId || null,
          username: from.username || from.fromUsername || "guest",
          displayName: from.displayName || null,
        },
        minutes: payload.minutes || 5,
        colorPreference: payload.colorPreference || "random",
        createdAt: payload.createdAt || Date.now(),
        status: "pending",
      };
      setInvites((s) => [item, ...s.filter((i) => i.inviteId !== inviteId)]);

      // schedule removal after 10s
      scheduleClientRemoval(inviteId, item.createdAt);
    }

    function handleUpdated(e) {
      const payload = (e && e.detail) || e || {};
      const id = payload.inviteId || payload.id;
      if (!id) return;

      // If server updated (accepted/declined), clear client removal timer
      if (payload.status === "accepted" || payload.status === "declined") {
        clearRemovalTimer(id);
      }

      setInvites((s) =>
        s.map((it) =>
          it.inviteId === id
            ? {
                ...it,
                status: payload.status || it.status,
                roomId: payload.roomId || it.roomId,
              }
            : it
        )
      );

      // remove accepted/declined shortly after update
      if (payload.status === "accepted" || payload.status === "declined") {
        setTimeout(() => {
          setInvites((s) => s.filter((it) => it.inviteId !== id));
        }, 2200);
      }
    }

    window.addEventListener("chessapp:invite-received", handleReceived);
    window.addEventListener("chessapp:invite-updated", handleUpdated);

    // Also handle legacy global assigned objects if socket dispatching couldn't create a CustomEvent
    function pollLegacy() {
      if (window.__chessapp_lastInvite) {
        handleReceived({ detail: window.__chessapp_lastInvite });
        window.__chessapp_lastInvite = null;
      }
      if (window.__chessapp_lastInviteUpdated) {
        handleUpdated({ detail: window.__chessapp_lastInviteUpdated });
        window.__chessapp_lastInviteUpdated = null;
      }
    }
    const poll = setInterval(pollLegacy, 800);

    return () => {
      window.removeEventListener("chessapp:invite-received", handleReceived);
      window.removeEventListener("chessapp:invite-updated", handleUpdated);
      clearInterval(poll);
      // clear timers
      try {
        for (const t of removalTimersRef.current.values()) {
          clearTimeout(t);
        }
        removalTimersRef.current.clear();
      } catch (e) {}
    };
  }, []);

  async function acceptInvite(inviteId) {
    // clear any scheduled client removal for this invite
    try {
      const t = removalTimersRef.current.get(String(inviteId));
      if (t) {
        clearTimeout(t);
        removalTimersRef.current.delete(String(inviteId));
      }
    } catch (e) {}

    try {
      const res = await fetch(
        `${backendOrigin()}/api/invites/${encodeURIComponent(inviteId)}/accept`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        window.alert((body && body.error) || `Accept failed (${res.status})`);
        return;
      }
      // If server created a room and returned it, redirect
      if (body && body.roomId) {
        // Redirect to play (frontend route)
        window.location.href = `/play/${encodeURIComponent(body.roomId)}`;
        return;
      }
      // otherwise remove invite from list
      setInvites((s) => s.filter((i) => i.inviteId !== inviteId));
    } catch (err) {
      console.error("acceptInvite error", err);
      window.alert("Network error accepting invite");
    }
  }

  async function declineInvite(inviteId) {
    // clear any scheduled client removal for this invite
    try {
      const t = removalTimersRef.current.get(String(inviteId));
      if (t) {
        clearTimeout(t);
        removalTimersRef.current.delete(String(inviteId));
      }
    } catch (e) {}

    try {
      const res = await fetch(
        `${backendOrigin()}/api/invites/${encodeURIComponent(
          inviteId
        )}/decline`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        window.alert((body && body.error) || `Decline failed (${res.status})`);
        return;
      }
      setInvites((s) => s.filter((i) => i.inviteId !== inviteId));
    } catch (err) {
      console.error("declineInvite error", err);
      window.alert("Network error declining invite");
    }
  }

  useEffect(() => {
    console.log(invites);
  }, [invites]);

  if (!invites || invites.length === 0) return null;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.title}>Game invite</div>
          <div className={styles.subtitle}>
            Someone invited you to a game — respond below
          </div>
        </div>

        <div className={styles.list}>
          {invites.map((inv) => (
            <div key={inv.inviteId} className={styles.row}>
              <div className={styles.left}>
                <div className={styles.avatarPlaceholder} />
                <div className={styles.meta}>
                  <div className={styles.name}>
                    {inv.from.displayName || inv.from.username}
                  </div>
                  <div className={styles.info}>
                    {inv.minutes} min • {inv.colorPreference}
                  </div>
                </div>
              </div>

              <div className={styles.right}>
                {inv.status === "pending" ? (
                  <>
                    <button
                      className={styles.accept}
                      onClick={() => acceptInvite(inv.inviteId)}
                    >
                      Accept
                    </button>
                    <button
                      className={styles.decline}
                      onClick={() => declineInvite(inv.inviteId)}
                    >
                      Decline
                    </button>
                  </>
                ) : (
                  <div className={styles.status}>{inv.status}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
