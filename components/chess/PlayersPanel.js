"use client";

import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import styles from "./PlayersPanel.module.css";
import { normalizeAvatarUrlFromAuthUser } from "@/lib/chessUtils";
import BtnSpinner from "../BtnSpinner";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

/* ---------- NEW: compute backend base (no trailing slash) ---------- */
const BACKEND_BASE =
  (process.env.NEXT_PUBLIC_BACKEND_BASE_URL &&
    process.env.NEXT_PUBLIC_BACKEND_BASE_URL.replace(/\/$/, "")) ||
  API.replace(/\/api\/?$/, "");

/* ---------- NEW: normalize backend/url -> rewrite localhost to production base
   Preserves absolute external URLs (CDN) but rewrites dev hostnames to BACKEND_BASE.
*/
function normalizeBackendUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const url = rawUrl.trim();

  // If it's an absolute URL, parse and potentially rewrite localhost -> BACKEND_BASE
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url);
      if (
        u.hostname === "localhost" ||
        u.hostname === "127.0.0.1" ||
        u.hostname.endsWith(".local")
      ) {
        // rewrite to production backend base keeping path + query + hash
        return `${BACKEND_BASE}${u.pathname}${u.search}${u.hash}`;
      }
      // otherwise return as-is (CDN or already production)
      return url;
    } catch (e) {
      // fall through to treat as a relative path if parsing fails
    }
  }

  // Not absolute — treat as relative path and prefix BACKEND_BASE
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${BACKEND_BASE}${path}`;
}

/* Resolve avatar: prefer normalize helper which handles absolute/relative,
   then ensure final URL is normalized to backend base when appropriate.
*/
function avatarForUser(user) {
  if (!user) return null;
  try {
    const helperUrl = normalizeAvatarUrlFromAuthUser
      ? normalizeAvatarUrlFromAuthUser(user)
      : null;
    if (helperUrl) {
      const n = normalizeBackendUrl(helperUrl);
      if (n) return n;
      return helperUrl;
    }
  } catch (e) {
    // ignore
  }

  // fallback fields
  if (user.avatarUrlAbsolute) {
    const n = normalizeBackendUrl(user.avatarUrlAbsolute);
    return n || user.avatarUrlAbsolute;
  }
  if (user.avatarUrl) {
    const n = normalizeBackendUrl(user.avatarUrl);
    return n || user.avatarUrl;
  }
  return null;
}

/* tiny helper to format disconnectedAt -> "2m 5s ago" */
function formatAgo(ts) {
  if (!ts) return null;
  const diff = Date.now() - Number(ts);
  if (diff < 5000) return "just now";
  const sec = Math.floor(diff / 1000);
  const mins = Math.floor(sec / 60);
  if (mins < 60) {
    const s = sec % 60;
    return `${mins}m${s ? ` ${s}s` : ""} ago`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    const m = mins % 60;
    return `${hrs}h${m ? ` ${m}m` : ""} ago`;
  }
  try {
    return new Date(Number(ts)).toLocaleString();
  } catch {
    return null;
  }
}

/* Local fallback to format ms -> mm:ss */
function formatMsLocal(ms) {
  if (ms === null || typeof ms === "undefined") return "--:--";
  const s = Math.max(0, Math.ceil(Number(ms) / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function PlayersPanel({
  players = [],
  clocks = { w: null, b: null, running: null },
  playingWithBot = false,
}) {
  const auth = useSelector((s) => s.auth);
  const gamePlayerColor = useSelector((s) => s.game?.playerColor) || null;

  // local copy of authenticated user
  const [myAuthUserLocal, setMyAuthUserLocal] = useState(
    () => auth?.user || null
  );
  const [hydrating, setHydrating] = useState(false);

  useEffect(() => {
    if (auth && auth.user) {
      setMyAuthUserLocal(auth.user);
      return;
    }

    try {
      const stored =
        typeof window !== "undefined" ? localStorage.getItem("user") : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed) {
          // NORMALIZE any stored avatar URLs so they won't point to localhost
          try {
            if (parsed.avatarUrl)
              parsed.avatarUrl = normalizeBackendUrl(parsed.avatarUrl);
            if (parsed.avatarUrlAbsolute)
              parsed.avatarUrlAbsolute = normalizeBackendUrl(
                parsed.avatarUrlAbsolute
              );
          } catch (err) {
            /* ignore normalization errors */
          }
          setMyAuthUserLocal(parsed);
          return;
        }
      }
    } catch (e) {
      // ignore
    }

    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    let cancelled = false;
    (async () => {
      setHydrating(true);
      try {
        const res = await fetch(`${API}/auth/me`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        });
        if (res.ok) {
          const data = await res.json();

          // NORMALIZE avatar/flag/country fields here:
          let finalAvatar = null;
          if (
            data.avatarUrlAbsolute &&
            /^https?:\/\//i.test(data.avatarUrlAbsolute)
          ) {
            finalAvatar = normalizeBackendUrl(data.avatarUrlAbsolute);
          } else if (data.avatarUrl && /^https?:\/\//i.test(data.avatarUrl)) {
            finalAvatar = normalizeBackendUrl(data.avatarUrl);
          } else if (data.avatarUrl) {
            // relative path like "/uploads/..." — prefix backend base
            finalAvatar = normalizeBackendUrl(data.avatarUrl);
          }
          data.avatarUrl = finalAvatar;
          data.flagUrl = data.flagUrl || null;
          data.country = data.country || data.countryCode || null;
          data.countryName = data.countryName || null;
          if (!data.flagUrl && data.country) {
            data.flagUrl = `https://flagcdn.com/w40/${data.country.toLowerCase()}.png`;
          }
          if (!cancelled) {
            setMyAuthUserLocal(data);
            try {
              localStorage.setItem("user", JSON.stringify(data));
            } catch (e) {}
          }
        }
      } catch (err) {
        // ignore
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.user]);

  // seated players (only white/black)
  const seated = (players || []).filter(
    (p) => p?.color === "w" || p?.color === "b"
  );

  const myPlayer = seated.find((p) => {
    const uid = p?.user?.id || p?.user?._id || null;
    const authUid =
      (myAuthUserLocal && (myAuthUserLocal.id || myAuthUserLocal._id)) || null;
    if (!uid || !authUid) return false;
    return String(uid) === String(authUid);
  });

  // Determine top / bottom player ordering:
  let topPlayer = null;
  let bottomPlayer = null;

  if (seated.length === 2) {
    // if I'm playing, keep me at bottom
    if (myPlayer) {
      bottomPlayer = myPlayer;
      topPlayer = seated.find((p) => p !== myPlayer) || null;
    } else {
      // I'm spectator: show white on top and black on bottom for predictability
      topPlayer = seated.find((p) => p.color === "w") || seated[0] || null;
      bottomPlayer = seated.find((p) => p.color === "b") || seated[1] || null;
    }
  } else if (seated.length === 1) {
    if (myPlayer) {
      bottomPlayer = myPlayer;
      topPlayer = null;
    } else {
      topPlayer = seated[0];
      bottomPlayer = null;
    }
  } else {
    topPlayer = null;
    bottomPlayer = myPlayer || null;
  }

  const myDisplayUser = myAuthUserLocal || auth?.user || myPlayer?.user || null;

  const renderAvatar = (user, size = 48) => {
    const src = avatarForUser(user);
    const sizeClass =
      size === 64 ? styles.size64 : size === 36 ? styles.size36 : styles.size48;

    if (src) {
      return (
        <img
          src={src}
          alt={user?.displayName || "avatar"}
          className={`${styles.avatarImg} ${sizeClass}`}
        />
      );
    }

    return (
      <div className={`${styles.avatarFallback} ${sizeClass}`} aria-hidden>
        <svg
          viewBox="0 0 24 24"
          className={styles.fallbackSvg}
          role="img"
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-5 0-8 3-8 5v1h16v-1c0-2-3-5-8-5z"
          />
        </svg>
      </div>
    );
  };

  // Only show displayName or a friendly fallback — do NOT show emails/usernames
  const nameOrLabel = (user, alt) => {
    if (!user) return alt || "-";
    return user.displayName || alt || "Player";
  };

  const getCountry = (user) => user?.country || user?.countryCode || null;

  const OnlineDot = ({ online }) => (
    <span
      aria-hidden
      title={online ? "Online" : "Offline"}
      className={`${styles.onlineDot} ${
        online ? styles.online : styles.offline
      }`}
    />
  );

  /* ========== Cups badge helper ========== */
  const CupsBadge = ({ user, hideZero = false }) => {
    const cups =
      user && user.cups !== undefined && user.cups !== null
        ? Number(user.cups)
        : 0;
    if (hideZero && !cups) return null;
    return (
      <span
        className={styles.cupsBadge}
        title={`${cups} cups`}
        aria-hidden="false"
      >
        <span className={styles.cupsIcon}>
          <img src="/trophy.png" width={16} alt="Cup icon" />
        </span>
        <span className={styles.cupsNumber}>{cups}</span>
      </span>
    );
  };

  /* render flag image helper */
  const renderFlag = (userOrCode, size = 16) => {
    if (!userOrCode) return null;
    const maybeUser = typeof userOrCode === "object" ? userOrCode : null;
    const rawCode = maybeUser
      ? maybeUser.country || maybeUser.countryCode || null
      : userOrCode;
    const cc =
      typeof rawCode === "string" && rawCode.trim().length === 2
        ? rawCode.trim().toLowerCase()
        : null;
    const flagUrlFromUser =
      maybeUser && maybeUser.flagUrl ? maybeUser.flagUrl : null;
    if (!cc && !flagUrlFromUser) return null;
    const sizeKey = size <= 20 ? "w20" : size <= 40 ? "w40" : "w80";
    const src = flagUrlFromUser
      ? flagUrlFromUser
      : `https://flagcdn.com/${sizeKey}/${cc}.png`;
    const alt = maybeUser?.countryName || (cc ? cc.toUpperCase() : "flag");
    return (
      <img
        src={src}
        alt={`${alt} flag`}
        className={styles.flagImg}
        width={size}
        height={Math.round(size * 0.7)}
        loading="lazy"
        onError={(e) => {
          try {
            e.target.style.display = "none";
          } catch (err) {}
        }}
      />
    );
  };

  /* render truncated name + tooltip */
  const renderName = (user, alt) => {
    const full = nameOrLabel(user, alt);
    return (
      <span className={styles.nameWrapper} tabIndex={0} aria-label={full}>
        <span className={styles.nameText} title={full}>
          {full}
        </span>
        <span className={styles.nameTooltip} role="tooltip" aria-hidden="true">
          {full}
        </span>
      </span>
    );
  };

  const clockForColor = (color) => {
    if (!clocks) return null;
    return color === "w" ? clocks.w : clocks.b;
  };

  // Clock display
  const ClockDisplay = ({ color, ms }) => {
    // If bot-mode requested, do not show clocks at all
    if (playingWithBot) return null;
    const isActive =
      clocks && clocks.running && String(clocks.running) === String(color);
    const displayLabel = color === "w" ? "White" : color === "b" ? "Black" : "";
    return (
      <div className={styles.clockContainer} aria-hidden>
        <span
          className={`${styles.clockText} ${
            isActive ? styles.clockTextActive : styles.clockTextInactive
          }`}
        >
          {formatMsLocal(ms)}
        </span>

        {displayLabel && (
          <span
            className={`${styles.clockBadge} ${
              color === "w" ? styles.badgeWhite : styles.badgeBlack
            }`}
          >
            {displayLabel}
          </span>
        )}
      </div>
    );
  };

  // Render
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {/* TOP: other player (or white if spectator) */}
        {topPlayer ? (
          <Link
            href={`/player/${topPlayer.user.id}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className={styles.playerRow}>
              <div className={styles.avatarContainer}>
                {renderAvatar(topPlayer.user)}
              </div>

              <div className={styles.playerInfo}>
                <div className={styles.playerName}>
                  {getCountry(topPlayer.user) && (
                    <span className={styles.flag}>
                      {renderFlag(topPlayer.user, 18)}
                    </span>
                  )}
                  <span className={styles.nameContainer}>
                    {renderName(topPlayer.user, "Waiting...")}
                  </span>
                </div>
                <CupsBadge user={topPlayer.user} />

                <div className={styles.playerSub}>
                  {topPlayer.online ? (
                    <div
                      className={`${styles.onlineDot} ${styles.online}`}
                    ></div>
                  ) : (
                    <span className={`${styles.onlineDot} ${styles.offline}`} />
                  )}
                </div>
              </div>
            </div>
          </Link>
        ) : (
          <div className={styles.waitingState}>
            <div className={styles.waitingAvatar}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                id="User-Circle--Streamline-Solar-Ar"
                height="24"
                width="24"
              >
                <desc>
                  User Circle Streamline Icon: https://streamlinehq.com
                </desc>
                <path
                  stroke="#000000"
                  d="M9 9a3 3 0 1 0 6 0 3 3 0 1 0 -6 0"
                  strokeWidth="1.5"
                ></path>
                <path
                  stroke="#000000"
                  d="M2 12a10 10 0 1 0 20 0 10 10 0 1 0 -20 0"
                  strokeWidth="1.5"
                ></path>
                <path
                  d="M17.9692 20c-0.1591 -2.8915 -1.0444 -5 -5.9692 -5 -4.92473 0 -5.81003 2.1085 -5.96918 5"
                  stroke="#000000"
                  strokeLinecap="round"
                  strokeWidth="1.5"
                ></path>
              </svg>
            </div>
            {/* <BtnSpinner /> */}
          </div>
        )}

        {/* MIDDLE: clocks (hidden entirely in bot mode) */}
        {!playingWithBot && (
          <div className={`${styles.clockMeta}`}>
            <div className={`${styles.playerMeta} `}>
              <ClockDisplay
                color={topPlayer?.color}
                ms={clockForColor(topPlayer?.color)}
              />
            </div>

            <div className={styles.devider}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="36"
                height="36"
                fill="#000000"
                viewBox="0 0 256 256"
              >
                <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm56,112H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48a8,8,0,0,1,0,16Z"></path>
              </svg>
            </div>

            <div className={`${styles.playerMeta}`}>
              <ClockDisplay
                color={myPlayer?.color}
                ms={clockForColor(myPlayer?.color)}
              />
            </div>
          </div>
        )}

        {/* BOTTOM: current player (you) */}
        {myPlayer ? (
          <div className={styles.playerRow}>
            <div className={styles.avatarContainer}>
              {renderAvatar(myDisplayUser)}
            </div>

            <div className={styles.playerInfo}>
              <div className={styles.playerName}>
                {getCountry(myDisplayUser) && (
                  <span className={styles.flag}>
                    {renderFlag(myDisplayUser, 18)}
                  </span>
                )}
                {/* keep "You" as before */}
                <span className={styles.youIndicator}>You</span>
              </div>
              <CupsBadge user={myDisplayUser} />

              <div className={styles.playerSub}>
                {myPlayer.online ? (
                  <div className={`${styles.onlineDot} ${styles.online}`}></div>
                ) : (
                  <span className={`${styles.onlineDot} ${styles.offline}`} />
                )}
              </div>
            </div>
          </div>
        ) : bottomPlayer ? (
          <div className={styles.playerRow}>
            <div className={styles.avatarContainer}>
              {renderAvatar(bottomPlayer.user)}
            </div>

            <div className={styles.playerInfo}>
              <div className={styles.playerName}>
                <span className={styles.nameContainer}>
                  {renderName(bottomPlayer.user, "Waiting...")}
                </span>
                <CupsBadge user={bottomPlayer.user} />
                {bottomPlayer.color && (
                  <span
                    className={`${styles.colorBadge} ${
                      styles[bottomPlayer.color]
                    }`}
                  >
                    {bottomPlayer.color === "w" ? "White" : "Black"}
                  </span>
                )}
              </div>

              <div className={styles.playerMeta}>
                {getCountry(bottomPlayer.user) && (
                  <span className={styles.flag}>
                    {renderFlag(bottomPlayer.user, 18)}
                  </span>
                )}
                {!playingWithBot && (
                  <ClockDisplay
                    color={bottomPlayer.color}
                    ms={clockForColor(bottomPlayer.color)}
                  />
                )}
              </div>

              <div className={styles.playerSub}>
                {bottomPlayer.online ? (
                  <>
                    Connected{" "}
                    <span className={`${styles.onlineDot} ${styles.online}`} />
                  </>
                ) : (
                  <>
                    Disconnected{" "}
                    <span className={`${styles.onlineDot} ${styles.offline}`} />
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
