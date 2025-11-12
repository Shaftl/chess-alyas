// frontend/components/ActiveRoomModal.jsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { backendOrigin } from "@/lib/chessUtils";
import styles from "./ActiveRoomModal.module.css";

export default function ActiveRoomModal() {
  const router = useRouter();
  const auth = useSelector((s) => s.auth);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState(null);

  function openWith(p = {}) {
    const activeRoom =
      p.activeRoom ||
      p.roomId ||
      p.activeRoomId ||
      p.active_room ||
      p?.data?.activeRoom ||
      null;
    setPayload({ ...p, activeRoom });
    setOpen(true);
  }

  useEffect(() => {
    function handler(e) {
      const p = (e && e.detail) || e || {};
      openWith(p);
    }
    window.addEventListener("chessapp:join-denied-active-room", handler);
    return () =>
      window.removeEventListener("chessapp:join-denied-active-room", handler);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function checkActive() {
      try {
        const uid = auth?.user?.id || auth?.user?._id;
        if (!uid) return;
        const base = backendOrigin();
        const res = await fetch(
          `${base}/api/players/${encodeURIComponent(uid)}`,
          {
            credentials: "include",
          }
        );
        if (!mounted) return;
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (data && data.activeRoom) {
          openWith({
            activeRoom: data.activeRoom,
            message: "You already have an active game.",
          });
        }
      } catch (e) {
        // ignore network errors
      }
    }
    checkActive();
    return () => {
      mounted = false;
    };
  }, [auth?.user?.id]);

  const handleDismiss = () => {
    setOpen(false);
    setPayload(null);
  };

  const handleGoToGame = () => {
    setOpen(false);
    try {
      router.push(`/play/${encodeURIComponent(roomId)}`);
    } catch (e) {
      window.location.href = `/play/${encodeURIComponent(roomId)}`;
    }
  };

  if (!open) return null;

  const roomId = payload?.activeRoom || null;
  const message =
    payload?.message ||
    payload?.error ||
    (payload?.data && payload.data.message) ||
    "You already have an active game. Go to that game or dismiss this message.";

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Active Game Found</h3>
          <button
            className={styles.modalClose}
            onClick={handleDismiss}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.modalLeft}>
            <p className={styles.message}>{message}</p>

            {roomId && (
              <div className={styles.roomInfo}>
                <div className={styles.roomInfoRow}>
                  <p>Room ID</p>
                  <p className={styles.roomId}>{roomId}</p>
                </div>
              </div>
            )}
          </div>

          <div className={styles.modalRight}>
            <div className={styles.quickActionsColumn}>
              {roomId && (
                <button
                  onClick={handleGoToGame}
                  className={`${styles.btn} ${styles.btnPrimary}`}
                >
                  Go to Active Game
                </button>
              )}

              <button
                onClick={handleDismiss}
                className={`${styles.btn} ${styles.btnSecondary}`}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
