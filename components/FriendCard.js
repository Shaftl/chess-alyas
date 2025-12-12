"use client";

import React from "react";
import styles from "./FriendCard.module.css";

/**
 * FriendCard
 * Props:
 *  - user: { id, username, displayName, avatarUrl, online, country, cups, lastIp, flagUrl, countryName }
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

function flagUrlForCountryCode(countryCode, size = 20) {
  if (!countryCode) return null;
  try {
    return `https://flagcdn.com/w${size}/${String(
      countryCode
    ).toLowerCase()}.png`;
  } catch {
    return null;
  }
}

function resolveFlagUrl(user) {
  if (!user) return null;
  // prefer explicit flagUrl if provided by backend (and normalize relative paths)
  if (user.flagUrl) {
    if (/^https?:\/\//i.test(user.flagUrl)) return user.flagUrl;
    const n = normalizeBackendUrl(user.flagUrl);
    return n || user.flagUrl;
  }

  // try fallback from country / countryCode fields
  const cc = user.country || user.countryCode;
  if (cc && typeof cc === "string") {
    return flagUrlForCountryCode(cc, 20);
  }
  return null;
}

export default function FriendCard({ user, onChallenge, onUnfriend, onView }) {
  const avatar = avatarUrlFromUser(user);
  const initial = (user?.displayName || user?.username || "U")
    .charAt(0)
    .toUpperCase();

  const flagUrl = resolveFlagUrl(user);
  const countryLabel =
    user?.countryName || user?.country || user?.countryCode || "";

  // inline small styling for the flag so it fits your existing layout without requiring CSS changes
  const flagStyle = {
    width: 18,
    height: "auto",
    marginLeft: 8,
    borderRadius: 3,
    verticalAlign: "middle",
    boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
    display: "inline-block",
  };

  // Build status class safely to avoid "undefined" tokens when CSS module keys are missing
  const statusClassNames = [
    styles.onlineStatus || "",
    user?.online ? styles.online || "" : styles.offline || "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.avatar}>
          {avatar ? (
            <img src={avatar} alt="avatar" className={styles.avatarImage} />
          ) : (
            // <div className={styles.avatarInitial}>{initial}</div>
            <img
              src="https://ik.imagekit.io/ehggwul6k/Chess-app-avaters/1765541858886_user-blue-gradient_78370-4692_O6GdbvkG1.avif"
              alt="avatar"
              className={styles.avatarImg}
            />
          )}
        </div>

        <div className={styles.userInfo}>
          <div className={styles.displayName}>
            {user.displayName || user.username}
          </div>
          <div className={styles.username}>@{user.username}</div>
          <div className={styles.stats}>
            <div className={styles.statsCups}>
              <img src="/trophy.png" width={20} alt="cups" />
              <strong>{user.cups ?? 0}</strong>
            </div>
            {/* Replace plain country code with flag image when possible (falls back to text) */}
            {user.country && (
              <span
                className={styles.country}
                aria-label={countryLabel || user.country}
              >
                {flagUrl ? (
                  <img
                    src={flagUrl}
                    alt={countryLabel || user.country}
                    style={flagStyle}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <span style={{ marginLeft: 8 }}>
                    {String(user.country).toUpperCase()}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className={styles.status}>
          <div className={statusClassNames}>
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
