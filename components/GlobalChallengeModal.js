// frontend/components/GlobalChallengeModal.js
"use client";
import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { initSocket } from "@/lib/socketClient";
import {
  clearIncomingChallenge,
  setIncomingChallenge,
} from "@/store/slices/challengeSlice";
import styles from "./GlobalChallengeModal.module.css"; // optional: create minimal css or reuse existing module

// Helper to resolve relative avatar path to absolute (mirrors your players/friends logic)
function resolveAvatarFrom(candidate) {
  if (!candidate) return null;
  // candidate may be a string (url or path) or object { avatarUrl, avatarUrlAbsolute }
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
    return resolveAvatarFrom(
      incoming.from || incoming.fromAvatar || incoming.fromAvatarUrl || null
    );
  }, [incoming]);

  if (!incoming) return null;

  const s = initSocket();

  async function accept() {
    try {
      s.emit(
        "accept-challenge",
        { challengeId: incoming.challengeId },
        (ack) => {
          // server may respond with { ok, roomId, redirectPath }
          if (ack && ack.ok && ack.roomId) {
            // redirect user into room
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

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1200,
      }}
    >
      <div
        className={styles.modalBox}
        style={{
          width: 420,
          maxWidth: "95%",
          padding: 18,
          borderRadius: 10,
          background: "#fff",
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 8,
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${incoming.from?.username || "player"} avatar`}
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "#eee",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
              }}
            >
              {(incoming.from?.displayName || incoming.from?.username || "U")
                .charAt(0)
                .toUpperCase()}
            </div>
          )}

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              Challenge from{" "}
              {incoming.from?.displayName || incoming.from?.username}
            </div>
            <div style={{ fontSize: 13, color: "#555" }}>
              {incoming.minutes} min • {incoming.colorPreference || "random"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            className={styles.btn}
            onClick={decline}
            style={{ padding: "8px 12px" }}
          >
            Decline
          </button>
          <button
            className={`${styles.btn} ${styles.primary}`}
            onClick={accept}
            style={{ padding: "8px 12px" }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
