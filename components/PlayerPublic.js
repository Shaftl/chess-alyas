"use client";
import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useSelector } from "react-redux";
import { format } from "date-fns";
import { initSocket } from "@/lib/socketClient";
import styles from "./ProfileEditor.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

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

      // -------------------------
      // FIXED: Normalize avatar -> prefer absolute
      // - prefer avatarUrlAbsolute if provided
      // - accept avatarUrl / avatar when already absolute
      // - if relative path (e.g. "/uploads/abc.jpg" or "uploads/abc.jpg")
      //   prepend backend origin derived from env
      // -------------------------
      const backendOrigin =
        process.env.NEXT_PUBLIC_BACKEND_BASE_URL ||
        (
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
        ).replace(/\/api\/?$/, "");

      let finalAvatar = null;

      // prefer explicit absolute field if present
      if (
        data.avatarUrlAbsolute &&
        /^https?:\/\//i.test(data.avatarUrlAbsolute)
      ) {
        finalAvatar = data.avatarUrlAbsolute;
      } else if (data.avatarUrl && /^https?:\/\//i.test(data.avatarUrl)) {
        finalAvatar = data.avatarUrl;
      } else if (data.avatar && /^https?:\/\//i.test(data.avatar)) {
        finalAvatar = data.avatar;
      } else {
        // fallback: if any relative avatar field exists, convert to absolute
        const candidate = data.avatarUrl || data.avatar || null;
        if (candidate) {
          // avoid double-slash: if candidate already starts with '/', just concat
          finalAvatar = candidate.startsWith("/")
            ? `${backendOrigin}${candidate}`
            : `${backendOrigin}/${candidate}`;
        } else {
          finalAvatar = null;
        }
      }

      // assign normalized avatar URL back to profile (frontend-only)
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
      const backendOrigin = API.replace(/\/api\/?$/, ""); // e.g. http://localhost:4000

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
                    width="32"
                    height="32"
                    fill="#000000"
                    viewBox="0 0 256 256"
                  >
                    <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm-4,48a12,12,0,1,1-12,12A12,12,0,0,1,124,72Zm12,112a16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40a8,8,0,0,1,0,16Z"></path>
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
                    width="32"
                    height="32"
                    fill="#000000"
                    viewBox="0 0 256 256"
                  >
                    <path d="M232,128c0,.51,0,1,0,1.52-.34,14.26-5.63,30.48-28,30.48-23.14,0-28-17.4-28-32V88a8,8,0,0,0-8.53-8A8.17,8.17,0,0,0,160,88.27v4a48,48,0,1,0,6.73,64.05,40.19,40.19,0,0,0,3.38,5C175.48,168,185.71,176,204,176a54.81,54.81,0,0,0,9.22-.75,4,4,0,0,1,4.09,6A104.05,104.05,0,0,1,125.91,232C71.13,230.9,26.2,186.86,24.08,132.11A104,104,0,1,1,232,128ZM96,128a32,32,0,1,0,32-32A32,32,0,0,0,96,128Z"></path>
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
                    width="32"
                    height="32"
                    fill="#000000"
                    viewBox="0 0 256 256"
                  >
                    <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM112,184a8,8,0,0,1-16,0V132.94l-4.42,2.22a8,8,0,0,1-7.16-14.32l16-8A8,8,0,0,1,112,120Zm56-8a8,8,0,0,1,0,16H136a8,8,0,0,1-6.4-12.8l28.78-38.37A8,8,0,1,0,145.07,132a8,8,0,1,1-13.85-8A24,24,0,0,1,176,136a23.76,23.76,0,0,1-4.84,14.45L152,176ZM48,80V48H72v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80Z"></path>
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
              <div className={styles.cupsIcon}>
                {/* <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  fill="#000000"
                  viewBox="0 0 256 256"
                >
                  <path d="M232,64H208V48a8,8,0,0,0-8-8H56a8,8,0,0,0-8,8V64H24A16,16,0,0,0,8,80V96a40,40,0,0,0,40,40h3.65A80.13,80.13,0,0,0,120,191.61V216H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16H136V191.58c31.94-3.23,58.44-25.64,68.08-55.58H208a40,40,0,0,0,40-40V80A16,16,0,0,0,232,64ZM48,120A24,24,0,0,1,24,96V80H48v32q0,4,.39,8ZM232,96a24,24,0,0,1-24,24h-.5a81.81,81.81,0,0,0,.5-8.9V80h24Z"></path>
                </svg> */}

                <img src="/trophy.png" width={26} />
              </div>
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
                              <div className={styles.gameHeaderMoves}>
                                <div className={styles.gameMoves}>
                                  {movesCount} moves
                                </div>
                                <div className={styles.gameDate}>{dateStr}</div>
                              </div>
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
                              {/* <div className={styles.gameMeta}>
                                <div className={styles.metaLabel}>Color</div>
                                <div
                                  className={`${styles.colorBadge} ${
                                    styles[yourColor.toLowerCase()]
                                  }`}
                                >
                                  {yourColor}
                                </div>
                              </div> */}
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
                  width="16"
                  height="16"
                  fill="#000000"
                  viewBox="0 0 256 256"
                >
                  <path d="M239.75,90.81c0,.11,0,.21-.07.32L217,195a16,16,0,0,1-15.72,13H54.71A16,16,0,0,1,39,195L16.32,91.13c0-.11-.05-.21-.07-.32A16,16,0,0,1,44,77.39l33.67,36.29,35.8-80.29a1,1,0,0,0,0-.1,16,16,0,0,1,29.06,0,1,1,0,0,0,0,.1l35.8,80.29L212,77.39a16,16,0,0,1,27.71,13.42Z"></path>
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
