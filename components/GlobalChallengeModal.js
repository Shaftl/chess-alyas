// frontend/components/GlobalChallengeModal.js
"use client";
import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { initSocket } from "@/lib/socketClient";
import {
  clearIncomingChallenge,
  setIncomingChallenge,
} from "@/store/slices/challengeSlice";
import styles from "./GlobalChallengeModal.module.css";

// Helper to resolve relative avatar path to absolute
function resolveAvatarFrom(candidate) {
  if (!candidate) return null;
  const RAW_API = (
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
  ).replace(/\/$/, "");
  const backendOrigin = RAW_API.replace(/\/api\/?$/, "");
  if (typeof candidate === "string") {
    if (/^https?:\/\//i.test(candidate)) return candidate;
    return candidate.startsWith("/")
      ? `${backendOrigin}${candidate}`
      : `${backendOrigin}/${candidate}`;
  }
  const alt =
    candidate.avatarUrlAbsolute ||
    candidate.avatarUrl ||
    candidate.fromAvatarUrl ||
    candidate.avatar ||
    null;
  if (!alt) return null;
  if (/^https?:\/\//i.test(alt)) return alt;
  return alt.startsWith("/")
    ? `${backendOrigin}${alt}`
    : `${backendOrigin}/${alt}`;
}

export default function GlobalChallengeModal() {
  const dispatch = useDispatch();
  const incoming = useSelector((s) => s.challenge?.incoming || null);

  const avatarUrl = useMemo(() => {
    if (!incoming) return null;
    const avatarSource =
      incoming.from || incoming.fromAvatar || incoming.fromAvatarUrl || null;
    return resolveAvatarFrom(avatarSource);
  }, [incoming]);

  if (!incoming) return null;

  const s = initSocket();

  async function accept() {
    try {
      s.emit(
        "accept-challenge",
        { challengeId: incoming.challengeId },
        (ack) => {
          if (ack && ack.ok && ack.roomId) {
            const path =
              (ack.redirectPath || "/play") +
              `/${encodeURIComponent(ack.roomId)}`;
            window.location.href = path;
          }
        }
      );
    } catch (err) {
      console.error("accept challenge emit error", err);
    } finally {
      dispatch(clearIncomingChallenge());
    }
  }

  async function decline() {
    try {
      s.emit(
        "decline-challenge",
        { challengeId: incoming.challengeId },
        (ack) => {
          // ack optional
        }
      );
    } catch (err) {
      console.error("decline challenge emit error", err);
    } finally {
      dispatch(clearIncomingChallenge());
    }
  }

  const displayName =
    incoming.from?.displayName || incoming.from?.username || "Player";

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalBox}>
        <div className={styles.modalHeader}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${displayName} avatar`}
              className={styles.avatar}
              onError={(e) => {
                e.target.style.display = "none";
                e.target.nextSibling.style.display = "flex";
              }}
            />
          ) : null}
          {!avatarUrl && (
            <div className={styles.avatarPlaceholder}>
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <h3 className={styles.modalTitle}>Challenge from {displayName}</h3>
        </div>

        <div className={styles.challengeDetails}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Time:</span>
            <span className={styles.detailValue}>
              {incoming.minutes} minutes
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Color:</span>
            <span className={styles.detailValue}>
              {incoming.colorPreference || "random"}
            </span>
          </div>
        </div>

        <div className={styles.modalActions}>
          <button
            className={`${styles.btn} ${styles.primary}`}
            onClick={accept}
          >
            Accept Challenge
          </button>
          <button className={styles.btn} onClick={decline}>
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
