// frontend/components/PlayerPublic.js
"use client";
import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useSelector } from "react-redux";
import { format } from "date-fns";
import { initSocket } from "@/lib/socketClient";
import styles from "./ProfileEditor.module.css";

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://chess-backend-api.onrender.com/api";

/**
 * PlayerPublic
 * Props:
 *   - id: player id or username (the param passed in route)
 *
 * Fetches GET /api/players/:id (public) and renders a read-only profile.
 * Does NOT require authentication; still shows Edit button if viewer === user.
 */
export default function PlayerPublic({ id }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // game history state (added to match ProfileEditor)
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesErr, setGamesErr] = useState(null);
  const [games, setGames] = useState([]);
  const [totalGames, setTotalGames] = useState(0);
  const [opponentsCount, setOpponentsCount] = useState(0);
  const [totalMoves, setTotalMoves] = useState(0);
  const [lastPlayed, setLastPlayed] = useState(null);

  // logged-in user from auth slice (if any)
  const authUser = useSelector((s) => s.auth.user);

  // socket for realtime actions (send friend request + challenge)
  const socketRef = useRef(null);

  // optimistic pending state for friend request sent from this page
  const [requestPending, setRequestPending] = useState(false);

  // busy indicator (id of user being acted on)
  const [busyId, setBusyId] = useState(null);

  // incoming challenge (if user receives a challenge while on profile)
  const [incomingChallenge, setIncomingChallenge] = useState(null);

  useEffect(() => {
    if (!id) return;
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!profile || !profile.id) return;
    fetchGamesForProfile(profile.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  useEffect(() => {
    // initialize socket once for this component (reuses underlying client implementation)
    const s = initSocket();
    socketRef.current = s;

    s.on("connect", () => {
      // no-op; socket ready to emit
    });

    // keep ability to show incoming challenge modal when we are on a player's page
    s.on("challenge-received", (payload) => {
      setIncomingChallenge(payload);
    });

    // handle challenge accepted (redirect to room if payload.roomId provided)
    s.on("challenge-accepted", (payload) => {
      if (payload && payload.roomId) {
        const path =
          (payload.redirectPath || "/play") +
          `/${encodeURIComponent(payload.roomId)}`;
        window.location.href = path;
      }
    });

    // challenge declined feedback
    s.on("challenge-declined", (payload) => {
      if (payload?.reason) alert(`Challenge declined: ${payload.reason}`);
    });

    return () => {
      try {
        s.off("connect");
        s.off("challenge-received");
        s.off("challenge-accepted");
        s.off("challenge-declined");
      } catch (e) {}
    };
  }, []);

  async function fetchProfile() {
    setLoading(true);
    setMsg(null);
    setProfile(null);
    try {
      // public endpoint - do not include credentials for profile
      const res = await fetch(`${API}/players/${encodeURIComponent(id)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg(j.error || `Player not found`);
        setLoading(false);
        return;
      }
      const data = await res.json();

      // Normalize avatar -> prefer absolute
      let finalAvatar = null;
      if (
        data.avatarUrlAbsolute &&
        /^https?:\/\//i.test(data.avatarUrlAbsolute)
      ) {
        finalAvatar = data.avatarUrlAbsolute;
      } else if (data.avatarUrl && /^https?:\/\//i.test(data.avatarUrl)) {
        finalAvatar = data.avatarUrl;
      } else if (data.avatarUrl) {
        const backendOrigin =
          process.env.NEXT_PUBLIC_BACKEND_BASE_URL ||
          (
            process.env.NEXT_PUBLIC_API_URL ||
            "https://chess-backend-api.onrender.com"
          ).replace(/\/api\/?$/, "");
        finalAvatar = `${backendOrigin}${data.avatarUrl}`;
      }
      data.avatarUrl = finalAvatar;

      // flag / country enrichment (non-blocking)
      data.flagUrl = data.flagUrl || null;
      data.country = data.country || null;
      data.countryName = data.countryName || null;

      if (!data.flagUrl && data.country) {
        data.flagUrl = `https://flagcdn.com/w40/${data.country.toLowerCase()}.png`;
      }

      setProfile(data);
    } catch (err) {
      setMsg("Network error");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Helper to produce canonical room id (strip "-<timestamp>" suffix when present)
   * (copied from ProfileEditor)
   */
  function canonicalRoomId(roomIdRaw) {
    if (!roomIdRaw) return "";
    const r = String(roomIdRaw);
    const idx = r.indexOf("-");
    if (idx === -1) return r;
    const suffix = r.slice(idx + 1);
    if (/^\d+$/.test(suffix)) return r.slice(0, idx);
    return r;
  }

  // fetch games for profile id (mirrors ProfileEditor)
  async function fetchGamesForProfile(userId) {
    setGamesLoading(true);
    setGamesErr(null);
    try {
      const base = API.replace(/\/api\/?$/, "");
      const res = await fetch(
        `${base}/api/game?userId=${encodeURIComponent(userId)}`,
        {
          credentials: "include",
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setGamesErr(j.error || `Failed to load games (${res.status})`);
        setGames([]);
        setTotalGames(0);
        setOpponentsCount(0);
        setTotalMoves(0);
        setLastPlayed(null);
        return;
      }
      const list = await res.json();

      // -------------------------
      // NORMALIZE AVATAR FIELDS
      // Ensure each player.user and message.user has avatarUrlAbsolute (frontend-only)
      // -------------------------
      const backendOrigin = API.replace(/\/api\/?$/, ""); // e.g. https://chess-backend-api.onrender.com

      const normalizedList = (Array.isArray(list) ? list : []).map((g) => {
        // normalize players
        const players = (g.players || []).map((p) => {
          const pu = p.user || {};
          // candidate avatar fields (check common places)
          let avatar =
            pu.avatarUrlAbsolute || pu.avatarUrl || p.avatarUrl || null;

          if (avatar && !/^https?:\/\//i.test(avatar)) {
            avatar = `${backendOrigin}${avatar}`;
          }

          // ensure user object fields exist and attach absolute url
          return {
            ...p,
            user: {
              ...pu,
              avatarUrl: pu.avatarUrl || p.avatarUrl || null,
              avatarUrlAbsolute: avatar || null,
            },
          };
        });

        // normalize messages' user avatars (if any)
        const messages = (g.messages || []).map((m) => {
          const mu = m.user || {};
          let avatar = mu.avatarUrlAbsolute || mu.avatarUrl || null;
          if (avatar && !/^https?:\/\//i.test(avatar)) {
            avatar = `${backendOrigin}${avatar}`;
          }
          return {
            ...m,
            user: {
              ...mu,
              avatarUrl: mu.avatarUrl || null,
              avatarUrlAbsolute: avatar || null,
            },
          };
        });

        return {
          ...g,
          players,
          messages,
        };
      });

      setGames(normalizedList);

      // compute summary (based on normalizedList)
      const opponents = new Set();
      let movesSum = 0;
      let lastTs = null;
      const myIdOrUsername = profile?.id || profile?.username || null;

      (normalizedList || []).forEach((g) => {
        const players = Array.isArray(g.players) ? g.players : [];
        // count opponent(s)
        for (const p of players) {
          const pid = p.id || (p.user && p.user.id) || null;
          const pusername = (p.user && p.user.username) || p.username || null;
          // skip me
          if (
            (myIdOrUsername && String(pid) === String(myIdOrUsername)) ||
            (myIdOrUsername && String(pusername) === String(myIdOrUsername))
          ) {
            continue;
          }
          if (pid) opponents.add(String(pid));
          else if (pusername) opponents.add(String(pusername));
        }
        movesSum += Array.isArray(g.moves) ? g.moves.length : 0;
        const ts = g.createdAt ? new Date(g.createdAt).getTime() : 0;
        if (!lastTs || ts > lastTs) lastTs = ts;
      });

      setTotalGames(Array.isArray(normalizedList) ? normalizedList.length : 0);
      setOpponentsCount(opponents.size);
      setTotalMoves(movesSum);
      setLastPlayed(lastTs ? new Date(lastTs).toISOString() : null);
    } catch (err) {
      setGamesErr("Network error while loading games");
      setGames([]);
      setTotalGames(0);
      setOpponentsCount(0);
      setTotalMoves(0);
      setLastPlayed(null);
    } finally {
      setGamesLoading(false);
    }
  }

  const isSelf =
    authUser &&
    profile &&
    String(authUser.id || authUser._id) === String(profile.id || profile._id);

  // derive friend state (best-effort): if profile.friends contains authUser -> they are friends
  const isFriend = React.useMemo(() => {
    if (!authUser || !profile || !Array.isArray(profile.friends)) return false;
    const idStr = String(authUser.id || authUser._id);
    return profile.friends.some((f) => String(f.id) === idStr);
  }, [authUser, profile]);

  // check if target is online (profile.online provided by backend)
  const isOnline = !!(profile && profile.online);

  // Send friend request: prefer socket with ack, fallback REST
  async function sendFriendRequest() {
    if (!authUser) {
      alert("You must be signed in to add friends");
      return;
    }
    if (!profile || !profile.id) {
      alert("Cannot add friend: missing target id");
      return;
    }
    if (String(profile.id) === String(authUser.id || authUser._id)) {
      alert("Cannot friend yourself");
      return;
    }
    if (isFriend) {
      alert("Already friends");
      return;
    }
    // optimistic
    setRequestPending(true);
    setBusyId(profile.id);

    const s = socketRef.current;
    if (s && s.connected) {
      try {
        s.emit("send-friend-request", { toUserId: profile.id }, (resp) => {
          if (!resp || !resp.ok) {
            alert(`Failed: ${resp?.error || "unknown"}`);
            setRequestPending(false);
          } else {
            alert("Friend request sent");
            // backend will notify /players list - but we can keep optimistic state until next refresh
          }
          setBusyId(null);
        });
      } catch (err) {
        console.error("socket send-friend-request error", err);
        alert("Friend request failed (socket)");
        setRequestPending(false);
        setBusyId(null);
      }
    } else {
      // fallback REST
      try {
        const resp = await fetch(`${API}/friends/request`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toUserId: profile.id }),
        });
        const j = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          alert(`Failed: ${j.error || resp.status}`);
          setRequestPending(false);
        } else {
          alert("Friend request sent");
        }
      } catch (err) {
        console.error("sendFriendRequest error", err);
        alert("Friend request failed (network)");
        setRequestPending(false);
      } finally {
        setBusyId(null);
      }
    }
  }

  // Challenge: prefer socket with ack (server will create room and notify recipient)
  function openChallengeModal() {
    // For PlayerPublic we want the modal like players page, but for now keep a quick prompt UX
    if (!authUser) return alert("Sign in to challenge");
    if (!profile || !profile.id) return alert("Missing target");
    if (!isOnline) return alert("Player is offline");
    if (isSelf) return alert("Cannot challenge yourself");

    const minutesStr = prompt("Minutes (e.g. 5):", "5");
    if (minutesStr === null) return;
    let minutes = parseInt(minutesStr, 10);
    if (!isFinite(minutes) || minutes < 1) minutes = 5;
    const color = prompt(
      'Color preference ("random", "white", "black"):',
      "random"
    );
    const colorPreference =
      color === "white" || color === "black" ? color : "random";

    sendChallenge({ minutes, colorPreference });
  }

  function sendChallenge({ minutes = 5, colorPreference = "random" } = {}) {
    if (!authUser) return alert("Sign in to challenge");
    if (!profile || !profile.id) return alert("Missing target");

    const s = socketRef.current;
    setBusyId(profile.id);

    if (s && s.connected) {
      try {
        s.emit(
          "challenge",
          { toUserId: profile.id, minutes, colorPreference },
          (resp) => {
            if (!resp || !resp.ok) {
              alert(`Failed to send challenge: ${resp?.error || "unknown"}`);
            } else {
              alert("Challenge sent");
            }
            setBusyId(null);
          }
        );
      } catch (err) {
        console.error("challenge emit error", err);
        alert("Challenge failed (socket)");
        setBusyId(null);
      }
    } else {
      // No socket — fallback (server may not accept challenge over REST; try POST to /api/challenge if you have one)
      alert("Not connected to realtime server; challenge not sent.");
      setBusyId(null);
    }
  }

  // incoming challenge modal handlers
  function acceptIncomingChallenge() {
    const s = socketRef.current;
    if (!s || !incomingChallenge) return;
    s.emit("accept-challenge", { challengeId: incomingChallenge.challengeId });
    setIncomingChallenge(null);
  }
  function declineIncomingChallenge() {
    const s = socketRef.current;
    if (!s || !incomingChallenge) return;
    s.emit("decline-challenge", { challengeId: incomingChallenge.challengeId });
    setIncomingChallenge(null);
  }

  return (
    <div className={styles.container}>
      {loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingSpinner}></div>
          <span>Loading player…</span>
        </div>
      )}

      {msg && (
        <div className={styles.message}>
          <div className={styles.msgBox}>{msg}</div>
        </div>
      )}

      {!profile && !loading && !msg && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>👤</div>
          <h3>No player data</h3>
        </div>
      )}

      {profile && (
        <div className={styles.profileContainer}>
          <div className={styles.profileCard}>
            <div className={styles.avatarSection}>
              <div className={styles.avatarContainer}>
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt="avatar"
                    className={styles.avatarImage}
                  />
                ) : (
                  <div className={styles.avatarFallback}>
                    {(profile.displayName || profile.username || "U")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.profileInfo}>
              <div className={styles.nameSection}>
                <div className={styles.location}>
                  {profile.flagUrl && (
                    <img
                      src={profile.flagUrl}
                      alt={profile.country}
                      className={styles.flag}
                    />
                  )}
                </div>

                <h2 className={styles.displayName}>
                  {profile.displayName || profile.username}
                </h2>
              </div>

              <div className={styles.details}>
                <div className={`${styles.detailItem}`}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    id="Circle-Info--Streamline-Font-Awesome"
                    height="16"
                    width="16"
                  >
                    <desc>
                      Circle Info Streamline Icon: https://streamlinehq.com
                    </desc>
                    <path
                      d="M8 16a8 8 0 1 0 0 -16 8 8 0 1 0 0 16zm-1.25 -5.5h0.75v-2h-0.75c-0.415625 0 -0.75 -0.334375 -0.75 -0.75s0.334375 -0.75 0.75 -0.75h1.5c0.415625 0 0.75 0.334375 0.75 0.75v2.75h0.25c0.415625 0 0.75 0.334375 0.75 0.75s-0.334375 0.75 -0.75 0.75h-2.5c-0.415625 0 -0.75 -0.334375 -0.75 -0.75s0.334375 -0.75 0.75 -0.75zm1.25 -6.5a1 1 0 1 1 0 2 1 1 0 1 1 0 -2z"
                      fill="#000000"
                      strokeWidth="0.0313"
                    ></path>
                  </svg>
                  <div className={`${styles.detailItemBio}`}>
                    <span className={styles.detailLabel}>Bio - </span>{" "}
                    <span className={styles.detailValue}>
                      {profile.bio || "This player has not added a bio yet."}
                    </span>
                  </div>
                </div>

                <div className={styles.detailItem}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    id="Envelope--Streamline-Font-Awesome"
                    height="16"
                    width="16"
                  >
                    <desc>
                      Envelope Streamline Icon: https://streamlinehq.com
                    </desc>
                    <path
                      d="M1.5 2C0.671875 2 0 2.671875 0 3.5c0 0.471875 0.221875 0.915625 0.6 1.2l6.8 5.1c0.35625 0.265625 0.84375 0.265625 1.2 0l6.8 -5.1c0.378125 -0.284375 0.6 -0.728125 0.6 -1.2 0 -0.828125 -0.671875 -1.5 -1.5 -1.5H1.5zM0 5.5v6.5c0 1.103125 0.896875 2 2 2h12c1.103125 0 2 -0.896875 2 -2V5.5L9.2 10.6c-0.7125 0.534375 -1.6875 0.534375 -2.4 0L0 5.5z"
                      fill="#000000"
                      strokeWidth="0.0313"
                    ></path>
                  </svg>
                  <div>
                    <span className={styles.detailLabel}>Email - </span>{" "}
                    <span className={styles.detailValue}>
                      {profile.email || "Hidden"}
                    </span>
                  </div>
                </div>

                <div className={styles.detailItem}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    id="Calendar-Days--Streamline-Font-Awesome"
                    height="16"
                    width="16"
                  >
                    <desc>
                      Calendar Days Streamline Icon: https://streamlinehq.com
                    </desc>
                    <path
                      d="M5.06 0.16c0.5420642857142857 0 0.98 0.4379392857142857 0.98 0.98v0.98h3.92V1.14c0 -0.5420607142857142 0.4379392857142857 -0.98 0.98 -0.98s0.98 0.4379392857142857 0.98 0.98v0.98h1.4699999999999998c0.8115642857142857 0 1.4699999999999998 0.6584392857142857 1.4699999999999998 1.4699999999999998v1.4699999999999998H1.14v-1.4699999999999998c0 -0.8115607142857143 0.6584392857142857 -1.4699999999999998 1.4699999999999998 -1.4699999999999998h1.4699999999999998V1.14c0 -0.5420607142857142 0.4379392857142857 -0.98 0.98 -0.98ZM1.14 6.04h13.72v8.33c0 0.8115642857142857 -0.6584357142857142 1.4699999999999998 -1.4699999999999998 1.4699999999999998H2.61c-0.8115607142857143 0 -1.4699999999999998 -0.6584357142857142 -1.4699999999999998 -1.4699999999999998V6.04Zm1.96 2.4499999999999997v0.98c0 0.2695 0.2205 0.49 0.49 0.49h0.98c0.2695 0 0.49 -0.2205 0.49 -0.49v-0.98c0 -0.2695 -0.2205 -0.49 -0.49 -0.49h-0.98c-0.2695 0 -0.49 0.2205 -0.49 0.49Zm3.92 0v0.98c0 0.2695 0.2205 0.49 0.49 0.49h0.98c0.2695 0 0.49 -0.2205 0.49 -0.49v-0.98c0 -0.2695 -0.2205 -0.49 -0.49 -0.49h-0.98c-0.2695 0 -0.49 0.2205 -0.49 0.49ZM11.43 8c-0.2695 0 -0.49 0.2205 -0.49 0.49v0.98c0 0.2695 0.2205 0.49 0.49 0.49h0.98c0.2695 0 0.49 -0.2205 0.49 -0.49v-0.98c0 -0.2695 -0.2205 -0.49 -0.49 -0.49h-0.98ZM3.0999999999999996 12.41v0.98c0 0.2695 0.2205 0.49 0.49 0.49h0.98c0.2695 0 0.49 -0.2205 0.49 -0.49v-0.98c0 -0.2695 -0.2205 -0.49 -0.49 -0.49h-0.98c-0.2695 0 -0.49 0.2205 -0.49 0.49Zm4.41 -0.49c-0.2695 0 -0.49 0.2205 -0.49 0.49v0.98c0 0.2695 0.2205 0.49 0.49 0.49h0.98c0.2695 0 0.49 -0.2205 0.49 -0.49v-0.98c0 -0.2695 -0.2205 -0.49 -0.49 -0.49h-0.98Zm3.43 0.49v0.98c0 0.2695 0.2205 0.49 0.49 0.49h0.98c0.2695 0 0.49 -0.2205 0.49 -0.49v-0.98c0 -0.2695 -0.2205 -0.49 -0.49 -0.49h-0.98c-0.2695 0 -0.49 0.2205 -0.49 0.49Z"
                      fill="#000000"
                      strokeWidth="0.0357"
                    ></path>
                  </svg>
                  <div>
                    <span className={styles.detailLabel}>Date of Birth - </span>{" "}
                    <span className={styles.detailValue}>
                      {profile.dob
                        ? format(new Date(profile.dob), "dd MMMM yyyy")
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.cupsBadge}>
              <div className={styles.cupsIcon}>🏆</div>
              <div className={styles.cupsContent}>
                <div className={styles.cupsLabel}>Cups: </div>
                <div className={styles.cupsValue}>({profile.cups ?? 0})</div>
              </div>
            </div>
          </div>

          {/* Public view: show player's game history similar to ProfileEditor */}
          <div
            className={`${styles.formCard} ${styles.formCardGame} ${styles.formCardPublic}`}
          >
            <div className={styles.gameHistory}>
              <h3>Player Game History</h3>

              <div className={styles.gameHistoryBody}>
                {gamesLoading ? (
                  <div className={styles.loadingText}>
                    Loading game history...
                  </div>
                ) : gamesErr ? (
                  <div className={styles.errorText}>{gamesErr}</div>
                ) : totalGames === 0 ? (
                  <div className={styles.emptyText}>No games found yet.</div>
                ) : (
                  <div className={styles.gameHistoryContainer}>
                    <div className={styles.gameStatsContainer}>
                      <div className={styles.statItem}>
                        <div className={styles.statLabel}>Games played</div>
                        <div className={styles.statValue}>{totalGames}</div>
                      </div>

                      <div className={styles.statItem}>
                        <div className={styles.statLabel}>Unique opponents</div>
                        <div className={styles.statValue}>{opponentsCount}</div>
                      </div>

                      <div className={styles.statItem}>
                        <div className={styles.statLabel}>Total moves</div>
                        <div className={styles.statValue}>{totalMoves}</div>
                      </div>

                      <div className={styles.statItem}>
                        <div className={styles.statLabel}>Last played</div>
                        <div className={styles.statValue}>
                          {lastPlayed
                            ? format(new Date(lastPlayed), "dd MMM yyyy HH:mm")
                            : "—"}
                        </div>
                      </div>
                    </div>

                    <div className={styles.gamesList}>
                      {games.map((g) => {
                        const players = g.players || [];
                        const you =
                          players.find((p) => {
                            const pid = p.id || (p.user && p.user.id);
                            const pusername = p.user && p.user.username;
                            if (String(pid) === String(profile.id)) return true;
                            if (
                              profile.username &&
                              String(pusername) === String(profile.username)
                            )
                              return true;
                            return false;
                          }) || {};
                        const opp =
                          players.find((p) => {
                            const pid = p.id || (p.user && p.user.id);
                            const pusername = p.user && p.user.username;
                            if (profile) {
                              if (String(pid) === String(profile.id))
                                return false;
                              if (
                                profile.username &&
                                String(pusername) === String(profile.username)
                              )
                                return false;
                            }
                            return true;
                          }) || {};
                        const opponentName =
                          opp.user?.displayName ||
                          opp.user?.username ||
                          opp.username ||
                          opp.id ||
                          "—";

                        // NORMALIZED opponent avatar (frontend-normalized in fetchGamesForProfile)
                        const oppUser = opp.user || {};
                        const opponentAvatar =
                          oppUser.avatarUrlAbsolute ||
                          oppUser.avatarUrl ||
                          null;

                        const yourColor = you.color || "—";
                        const movesCount = Array.isArray(g.moves)
                          ? g.moves.length
                          : 0;
                        const dateStr = g.createdAt
                          ? format(new Date(g.createdAt), "dd MMM yyyy HH:mm")
                          : "—";
                        const roomLinkRaw = g.roomId || g._id || "";
                        const canonical = canonicalRoomId(roomLinkRaw);
                        const linkHref = canonical
                          ? `/play/${encodeURIComponent(canonical)}?spectate=1`
                          : null;

                        return (
                          <div
                            key={g._id || g.roomId || Math.random()}
                            className={styles.gameCard}
                          >
                            <div className={styles.gameHeader}>
                              <div className={styles.gameMoves}>
                                {movesCount} moves
                              </div>
                              <div className={styles.gameDate}>{dateStr}</div>
                            </div>
                            <div className={styles.gameContent}>
                              <div className={styles.opponentInfo}>
                                <div className={styles.opponentLabel}>
                                  Opponent
                                </div>
                                <div className={styles.opponentName}>
                                  {opponentAvatar ? (
                                    <img
                                      src={opponentAvatar}
                                      alt={`${opponentName} avatar`}
                                      style={{
                                        width: 28,
                                        height: 28,
                                        objectFit: "cover",
                                        marginLeft: 8,
                                        borderRadius: "50%",
                                      }}
                                    />
                                  ) : null}
                                  {opponentName}
                                </div>
                              </div>
                              <div className={styles.gameMeta}>
                                <div className={styles.metaLabel}>Color</div>
                                <div
                                  className={`${styles.colorBadge} ${
                                    styles[yourColor.toLowerCase()]
                                  }`}
                                >
                                  {yourColor}
                                </div>
                              </div>
                              <div className={styles.roomLink}>
                                <div className={styles.roomLabel}>Game</div>
                                {linkHref ? (
                                  <Link
                                    className={styles.roomLinkAnchor}
                                    href={linkHref}
                                  >
                                    {canonical}
                                  </Link>
                                ) : (
                                  <div className={styles.roomLinkAnchor}>—</div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div
              className={`${styles.editProfile} ${styles.editProfilePublic}`}
            >
              {/* Add Friend button */}
              <button
                className={`${styles.btn} ${styles.btnChallenge}`}
                onClick={sendFriendRequest}
                disabled={
                  requestPending || busyId === profile.id || isSelf || isFriend
                }
                title={
                  isSelf
                    ? "This is your profile"
                    : isFriend
                    ? "Already friends"
                    : requestPending
                    ? "Request pending"
                    : "Add Friend"
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  id="User-Plus--Streamline-Font-Awesome"
                  height="16"
                  width="16"
                >
                  <desc>
                    User Plus Streamline Icon: https://streamlinehq.com
                  </desc>
                  <path
                    d="M2.5120000000000005 4.864000000000001c0 -2.414095 2.6133325000000003 -3.9229025 4.704 -2.7158550000000004 0.9702825000000002 0.5601925 1.568 1.5954700000000002 1.568 2.7158550000000004 0 2.414095 -2.6133325000000003 3.9229025 -4.704 2.7158550000000004 -0.9702825000000002 -0.5601925 -1.568 -1.5954700000000002 -1.568 -2.7158550000000004ZM0.16000000000000003 13.544350000000001c0 -2.41325 1.9550999999999998 -4.36835 4.36835 -4.36835h2.2393c2.41325 0 4.36835 1.9550999999999998 4.36835 4.36835 0 0.4018 -0.32585000000000003 0.7276500000000001 -0.7276500000000001 0.7276500000000001H0.88765c-0.4018 0 -0.7276500000000001 -0.32585000000000003 -0.7276500000000001 -0.7276500000000001ZM12.508000000000001 9.372v-1.568H10.940000000000001c-0.32585000000000003 0 -0.588 -0.26215000000000005 -0.588 -0.588s0.26215000000000005 -0.588 0.588 -0.588h1.568V5.0600000000000005c0 -0.32585000000000003 0.26215000000000005 -0.588 0.588 -0.588s0.588 0.26215000000000005 0.588 0.588v1.568h1.568c0.32585000000000003 0 0.588 0.26215000000000005 0.588 0.588s-0.26215000000000005 0.588 -0.588 0.588h-1.568v1.568c0 0.32585000000000003 -0.26215000000000005 0.588 -0.588 0.588s-0.588 -0.26215000000000005 -0.588 -0.588Z"
                    fill="#000000"
                    strokeWidth="0.025"
                  ></path>
                </svg>
                <span>
                  {isSelf
                    ? "You"
                    : isFriend
                    ? "Friends"
                    : requestPending
                    ? "Request sent"
                    : "Add Friend"}
                </span>
              </button>

              {/* Challenge button */}
              <button
                className={`${styles.btn} ${styles.primaryButton}`}
                onClick={openChallengeModal}
                disabled={!isOnline || isSelf || busyId === profile.id}
                title={
                  !isOnline
                    ? "Player offline"
                    : isSelf
                    ? "Cannot challenge yourself"
                    : "Challenge"
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  id="Chess-King--Streamline-Font-Awesome"
                  height="16"
                  width="16"
                >
                  <desc>
                    Chess King Streamline Icon: https://streamlinehq.com
                  </desc>
                  <path
                    d="M8 0.16c0.5420642857142857 0 0.98 0.4379392857142857 0.98 0.98v0.49h0.49c0.5420642857142857 0 0.98 0.4379392857142857 0.98 0.98s-0.43793571428571426 0.98 -0.98 0.98h-0.49v1.4699999999999998h4.655c0.6768107142857143 0 1.2249999999999999 0.5481892857142857 1.2249999999999999 1.2249999999999999 0 0.16231428571428572 -0.030625 0.3215642857142857 -0.09493928571428571 0.471625L12.41 12.41H3.59L1.2349357142857142 6.756625c-0.06431071428571428 -0.15006071428571427 -0.09493571428571428 -0.30931071428571427 -0.09493571428571428 -0.471625 0 -0.6768107142857143 0.5481857142857143 -1.2249999999999999 1.2249999999999999 -1.2249999999999999h4.655v-1.4699999999999998h-0.49c-0.5420642857142857 0 -0.98 -0.43793571428571426 -0.98 -0.98s0.43793571428571426 -0.98 0.98 -0.98h0.49V1.14c0 -0.5420607142857142 0.43793571428571426 -0.98 0.98 -0.98h0.49V1.14c0 -0.5420607142857142 0.43793571428571426 -0.98 0.98 -0.98z"
                    fill="#000000"
                    strokeWidth="0.0357"
                  ></path>
                </svg>
                <span>Challenge</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incoming challenge modal */}
      {incomingChallenge && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalBox}>
            <h3 className={styles.modalTitle}>
              Challenge from {incomingChallenge.from?.username}
            </h3>
            <div className={styles.challengeInfo}>
              <div>Time: {incomingChallenge.minutes} min</div>
              <div>Color preference: {incomingChallenge.colorPreference}</div>
            </div>
            <div className={styles.modalActions}>
              <button
                className={`${styles.btn} ${styles.primary}`}
                onClick={acceptIncomingChallenge}
              >
                Accept
              </button>
              <button className={styles.btn} onClick={declineIncomingChallenge}>
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
