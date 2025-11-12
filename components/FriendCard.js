"use client";

import React from "react";
import styles from "./FriendCard.module.css";

/**
 * FriendCard
 * Props:
 *  - user: { id, username, displayName, avatarUrl, online, country, cups, lastIp }
 *  - onChallenge(user)
 *  - onUnfriend(id)
 *  - onView(id)
 */

// compute backend base (no trailing slash)
const BACKEND_BASE =
  (process.env.NEXT_PUBLIC_BACKEND_BASE_URL &&
    process.env.NEXT_PUBLIC_BACKEND_BASE_URL.replace(/\/$/, "")) ||
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api").replace(
    /\/api\/?$/,
    ""
  );

function normalizeBackendUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const url = rawUrl.trim();
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url);
      if (
        u.hostname === "localhost" ||
        u.hostname === "127.0.0.1" ||
        u.hostname.endsWith(".local")
      ) {
        return `${BACKEND_BASE}${u.pathname}${u.search}${u.hash}`;
      }
      return url;
    } catch (e) {
      // fall through
    }
  }
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${BACKEND_BASE}${path}`;
}

function avatarUrlFromUser(user) {
  if (!user) return null;
  if (user.avatarUrlAbsolute) {
    const n = normalizeBackendUrl(user.avatarUrlAbsolute);
    return n || user.avatarUrlAbsolute;
  }
  if (user.avatarUrl) {
    const n = normalizeBackendUrl(user.avatarUrl);
    return n || user.avatarUrl;
  }
  if (user.avatar) {
    const n = normalizeBackendUrl(user.avatar);
    return n || user.avatar;
  }
  return null;
}

export default function FriendCard({ user, onChallenge, onUnfriend, onView }) {
  const avatar = avatarUrlFromUser(user);
  const initial = (user?.displayName || user?.username || "U")
    .charAt(0)
    .toUpperCase();

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.avatar}>
          {avatar ? (
            <img src={avatar} alt="avatar" className={styles.avatarImage} />
          ) : (
            <div className={styles.avatarInitial}>{initial}</div>
          )}
        </div>

        <div className={styles.userInfo}>
          <div className={styles.displayName}>
            {user.displayName || user.username}
          </div>
          <div className={styles.username}>@{user.username}</div>
          <div className={styles.stats}>
            Cups: <strong>{user.cups ?? 0}</strong>
            {user.country && (
              <span className={styles.country}>{user.country}</span>
            )}
          </div>
        </div>

        <div className={styles.status}>
          <div
            className={`${styles.onlineStatus} ${
              user.online ? styles.online : styles.offline
            }`}
          >
            {user.online ? "Online" : "Offline"}
          </div>
          {user.lastIp && <div className={styles.ipAddress}>{user.lastIp}</div>}
        </div>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.btn}
          onClick={() => onView && onView(user.id)}
        >
          View
        </button>
        <button
          className={styles.btn}
          onClick={() => onChallenge && onChallenge(user)}
          disabled={!user.online}
        >
          Challenge
        </button>
        <button
          className={`${styles.btn} ${styles.unfriendBtn}`}
          onClick={() => onUnfriend && onUnfriend(user.id)}
        >
          Unfriend
        </button>
      </div>
    </div>
  );
}
