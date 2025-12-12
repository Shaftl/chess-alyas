"use client";
import React, { useEffect, useRef, useState, useMemo } from "react";
import axios from "axios";
import { initSocket, getSocket } from "@/lib/socketClient";
import styles from "./Players.module.css";
import ProtectedRoute from "@/components/ProtectedRoute";

// Normalize environment URL so we never end up with double "/api"
const RAW_API = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
).replace(/\/$/, "");
const API_PREFIX = RAW_API.endsWith("/api") ? RAW_API : `${RAW_API}/api`;
const PLAYERS_URL = `${API_PREFIX}/players`;
const FRIENDS_REQUEST_URL = `${API_PREFIX}/friends/request`;
const FRIENDS_RESPOND_URL = `${API_PREFIX}/friends/respond`;
const FRIENDS_DELETE_URL = `${API_PREFIX}/friends`; // DELETE /friends/:id
const AUTH_ME_URL = `${API_PREFIX}/auth/me`;

// client-side backend origin for turning relative avatar paths into absolute URLs
const backendOrigin = RAW_API.replace(/\/api\/?$/, "");

function resolveAvatarFrom(candidate) {
  if (!candidate) return null;
  if (typeof candidate === "string") {
    if (/^https?:\/\//i.test(candidate)) return candidate;
    return `${backendOrigin}${candidate}`;
  }
  const alt =
    candidate.avatarUrlAbsolute ||
    candidate.avatarUrl ||
    candidate.fromAvatarUrl ||
    candidate.fromAvatarUrlAbsolute ||
    candidate.avatar;
  if (!alt) return null;
  if (/^https?:\/\//i.test(alt)) return alt;
  return `${backendOrigin}${alt}`;
}

function flagUrlForCountry(countryCode, size = 20) {
  if (!countryCode) return null;
  try {
    return `https://flagcdn.com/w${size}/${String(
      countryCode
    ).toLowerCase()}.png`;
  } catch {
    return null;
  }
}

export default function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const socketRef = useRef(null);
  const [incomingChallenge, setIncomingChallenge] = useState(null);
  const [challengeModal, setChallengeModal] = useState({
    open: false,
    target: null,
    minutes: 5,
    color: "random",
  });
  const [errorMsg, setErrorMsg] = useState(null);

  // search state
  const [searchQuery, setSearchQuery] = useState("");
  const searchDebounceRef = useRef(null);

  // current user id (discovered via cookie -> /api/auth/me)
  const [currentUserId, setCurrentUserId] = useState(null);
  const [meLoaded, setMeLoaded] = useState(false);

  // signed-in user's profile
  const [myProfile, setMyProfile] = useState(null);

  // optimistic pending set while REST or socket call is in-flight
  const [pendingOptimistic, setPendingOptimistic] = useState(new Set());
  const pendingOptimisticRef = useRef(pendingOptimistic);
  useEffect(() => {
    pendingOptimisticRef.current = pendingOptimistic;
  }, [pendingOptimistic]);

  // attempt to discover current user via cookie session
  const fetchMe = async () => {
    try {
      const res = await axios.get(AUTH_ME_URL, { withCredentials: true });
      if (res && res.data && res.data.id) {
        setCurrentUserId(String(res.data.id));
      } else {
        setCurrentUserId(null);
      }
    } catch (err) {
      setCurrentUserId(null);
    } finally {
      setMeLoaded(true);
    }
  };

  // fetch current user's profile by id (GET /api/players/:id)
  const fetchMyProfile = async (id) => {
    if (!id) {
      setMyProfile(null);
      return;
    }
    try {
      const res = await axios.get(`${PLAYERS_URL}/${encodeURIComponent(id)}`, {
        withCredentials: true,
      });
      const raw = res.data || null;
      if (raw) {
        const avatar =
          raw.avatarUrlAbsolute ||
          raw.avatarUrl ||
          raw.avatar ||
          (raw.user && (raw.user.avatarUrlAbsolute || raw.user.avatarUrl)) ||
          null;
        const avatarUrlAbsolute =
          avatar && !/^https?:\/\//i.test(avatar)
            ? `${backendOrigin}${avatar}`
            : avatar;

        // flag enrichment (frontend-only)
        const flagUrl =
          raw.flagUrl ||
          (raw.country ? flagUrlForCountry(raw.country, 40) : null);
        const countryName = raw.countryName || raw.country || null;

        setMyProfile({ ...raw, avatarUrlAbsolute, flagUrl, countryName });
      } else {
        setMyProfile(null);
      }
    } catch (err) {
      console.error("fetchMyProfile error", err);
      setMyProfile(null);
    }
  };

  // fetch players
  const fetchPlayers = async (q) => {
    const query = typeof q === "string" ? q : searchQuery;
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = {};
      if (query && String(query).trim() !== "") params.q = String(query).trim();
      const res = await axios.get(PLAYERS_URL, {
        params,
        withCredentials: true,
      });
      const playersArr = Array.isArray(res.data) ? res.data : [];

      const normalized = playersArr.map((p) => {
        const avatar =
          p.avatarUrlAbsolute ||
          p.avatarUrl ||
          p.avatar ||
          (p.user && (p.user.avatarUrlAbsolute || p.user.avatarUrl)) ||
          null;
        const avatarUrlAbsolute =
          avatar && !/^https?:\/\//i.test(avatar)
            ? `${backendOrigin}${avatar}`
            : avatar;

        // flag enrichment (frontend-only)
        const flagUrl =
          p.flagUrl || (p.country ? flagUrlForCountry(p.country, 20) : null);
        const countryName = p.countryName || p.country || null;

        return { ...p, avatarUrlAbsolute, flagUrl, countryName };
      });

      setPlayers(normalized);
    } catch (err) {
      console.error("fetch players error", {
        message: err.message,
        url: err.config?.url,
        method: err.config?.method,
        status: err.response?.status,
        responseData: err.response?.data,
      });
      setErrorMsg(
        err.response
          ? `Server returned ${err.response.status}`
          : `Network: ${err.message}`
      );
    } finally {
      setLoading(false);
    }
  };

  // initial load: detect current user then fetch players once me resolved.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchMe();
      if (!cancelled) {
        await fetchPlayers();
      }
    })();

    // keep polling players list every 12s (keeps UI in sync even if server misses a presence event)
    const id = setInterval(fetchPlayers, 12000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // when currentUserId changes, fetch the user's profile so it's always available
  useEffect(() => {
    if (currentUserId) {
      fetchMyProfile(currentUserId);
    } else {
      setMyProfile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // when searchQuery changes we debounce and refresh the list
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      fetchPlayers(searchQuery);
    }, 400);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // socket & realtime listeners (defensive)
  useEffect(() => {
    // use singleton init
    const s = initSocket();
    socketRef.current = s;

    // defensive: ensure we don't double-register handlers by first removing them
    try {
      s.off && s.off("connect");
      s.off && s.off("presence-changed");
      s.off && s.off("challenge-received");
      s.off && s.off("challenge-sent");
      s.off && s.off("challenge-declined");
      s.off && s.off("challenge-accepted");
      s.off && s.off("friend-request-received");
      s.off && s.off("friend-request-accepted");
      s.off && s.off("friend-request-declined");
      s.off && s.off("friend-removed");
    } catch (e) {}

    // connect handler -> refresh players
    s.on("connect", () => {
      fetchPlayers();
    });

    // presence event: refresh players when someone goes online/offline
    s.on("presence-changed", (payload) => {
      fetchPlayers();
    });

    // challenge events
    s.on("challenge-received", (payload) => setIncomingChallenge(payload));
    s.on("challenge-sent", () => fetchPlayers());
    s.on("challenge-declined", (payload) => {
      fetchPlayers();
      if (payload?.reason) alert(`Challenge declined: ${payload.reason}`);
    });
    s.on("challenge-accepted", (payload) => {
      if (payload && payload.roomId) {
        const path =
          (payload.redirectPath || "/play") +
          `/${encodeURIComponent(payload.roomId)}`;
        window.location.href = path;
      }
    });

    // friend real-time events
    s.on("friend-request-received", (payload) => {
      fetchPlayers();
    });

    s.on("friend-request-accepted", (payload) => {
      fetchPlayers();
      try {
        const byId = payload?.by?.id;
        if (byId) {
          setPendingOptimistic((prev) => {
            const next = new Set(prev);
            next.delete(String(byId));
            return next;
          });
        }
      } catch {}
      if (payload?.by?.username)
        alert(`Friend request accepted by ${payload.by.username}`);
    });

    s.on("friend-request-declined", (payload) => {
      fetchPlayers();
      try {
        const byId = payload?.by?.id;
        if (byId) {
          setPendingOptimistic((prev) => {
            const next = new Set(prev);
            next.delete(String(byId));
            return next;
          });
        }
      } catch {}
      if (payload?.by?.username)
        alert(`Friend request declined by ${payload.by.username}`);
    });

    s.on("friend-removed", (payload) => {
      fetchPlayers();
    });

    // when leaving the page, try to force a refresh to get accurate presence for next visits
    const onPageHide = () => {
      try {
        // best-effort fetch that uses keepalive (may help server record last-seen via REST)
        if (navigator && navigator.sendBeacon) {
          try {
            // it's okay if this endpoint doesn't exist; this is best-effort
            const url = `${API_PREFIX}/presence/poke`;
            const body = JSON.stringify({ ts: Date.now() });
            navigator.sendBeacon(url, body);
          } catch (e) {}
        }
      } catch (e) {}
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      // cleanup listeners
      try {
        s.off && s.off("connect");
        s.off && s.off("presence-changed");
        s.off && s.off("challenge-received");
        s.off && s.off("challenge-sent");
        s.off && s.off("challenge-declined");
        s.off && s.off("challenge-accepted");
        s.off && s.off("friend-request-received");
        s.off && s.off("friend-request-accepted");
        s.off && s.off("friend-request-declined");
        s.off && s.off("friend-removed");
      } catch (e) {}
      window.removeEventListener("pagehide", onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sorting & derived sets
  const sortedPlayers = useMemo(() => {
    if (!players || players.length === 0) return [];
    const curId = currentUserId;
    let friendIds = new Set();
    if (curId) {
      const selfEntry = players.find((p) => String(p.id) === String(curId));
      if (selfEntry && Array.isArray(selfEntry.friends)) {
        selfEntry.friends.forEach((f) => {
          if (f && f.id) friendIds.add(String(f.id));
        });
      }
    }
    const cmp = (a, b) => {
      const aIsFriend = friendIds.has(String(a.id));
      const bIsFriend = friendIds.has(String(b.id));
      if (aIsFriend !== bIsFriend) return aIsFriend ? -1 : 1;
      if ((a.online ? 1 : 0) !== (b.online ? 1 : 0)) return a.online ? -1 : 1;
      const aName = (a.displayName || a.username || "").toLowerCase();
      const bName = (b.displayName || b.username || "").toLowerCase();
      return aName.localeCompare(bName);
    };
    return [...players].sort(cmp);
  }, [players, currentUserId]);

  function openChallengeModal(player) {
    setChallengeModal({
      open: true,
      target: player,
      minutes: 5,
      color: "random",
    });
  }
  function closeChallengeModal() {
    setChallengeModal({
      open: false,
      target: null,
      minutes: 5,
      color: "random",
    });
  }
  function sendChallenge() {
    const s = socketRef.current || getSocket();
    if (!s) return;
    const { target, minutes, color } = challengeModal;
    s.emit("challenge", {
      toUserId: target.id,
      minutes,
      colorPreference: color,
    });
    closeChallengeModal();
  }
  function acceptIncomingChallenge() {
    const s = socketRef.current || getSocket();
    if (!s || !incomingChallenge) return;
    s.emit("accept-challenge", {
      challengeId: incomingChallenge.challengeId,
    });
    setIncomingChallenge(null);
  }
  function declineIncomingChallenge() {
    const s = socketRef.current || getSocket();
    if (!s || !incomingChallenge) return;
    s.emit("decline-challenge", {
      challengeId: incomingChallenge.challengeId,
    });
    setIncomingChallenge(null);
  }

  // derived set: friends only
  const friendsIdSet = useMemo(() => {
    const friends = new Set();
    if (!players || !Array.isArray(players)) {
      return friends;
    }
    for (const p of players) {
      if (Array.isArray(p.friends)) {
        for (const f of p.friends) {
          if (String(f.id) === String(currentUserId)) {
            friends.add(String(p.id));
            break;
          }
        }
      }
    }
    return friends;
  }, [players, currentUserId]);

  // effective pending set now only includes optimistic entries
  const effectivePendingSentSet = useMemo(() => {
    const out = new Set();
    for (const id of pendingOptimistic) out.add(String(id));
    return out;
  }, [pendingOptimistic]);

  // send friend request: prefer socket for realtime, fallback to REST
  async function sendFriendRequest(toUserId) {
    if (!toUserId) return;
    if (String(toUserId) === String(currentUserId))
      return alert("Cannot friend yourself");
    if (friendsIdSet.has(String(toUserId))) return alert("Already friends");
    if (effectivePendingSentSet.has(String(toUserId)))
      return alert("Friend request already pending");

    setPendingOptimistic((prev) => {
      const next = new Set(prev);
      next.add(String(toUserId));
      return next;
    });

    const s = socketRef.current || getSocket();
    if (s && s.connected) {
      try {
        s.emit("send-friend-request", { toUserId }, (resp) => {
          if (!resp || !resp.ok) {
            alert(`Failed: ${resp?.error || "unknown"}`);
            setPendingOptimistic((prev) => {
              const next = new Set(prev);
              next.delete(String(toUserId));
              return next;
            });
            return;
          }
          fetchPlayers();
        });
      } catch (err) {
        console.error("socket send-friend-request error", err);
        setPendingOptimistic((prev) => {
          const next = new Set(prev);
          next.delete(String(toUserId));
          return next;
        });
        alert("Friend request failed (socket)");
      }
    } else {
      try {
        const resp = await axios.post(
          FRIENDS_REQUEST_URL,
          { toUserId },
          { withCredentials: true }
        );
        if (resp.data && resp.data.ok) {
          await fetchPlayers();
        } else {
          alert(`Failed: ${resp.data?.error || "unknown"}`);
          setPendingOptimistic((prev) => {
            const next = new Set(prev);
            next.delete(String(toUserId));
            return next;
          });
        }
      } catch (err) {
        console.error("sendFriendRequest error", err);
        alert(
          `Friend request failed: ${err.response?.data?.error || err.message}`
        );
        setPendingOptimistic((prev) => {
          const next = new Set(prev);
          next.delete(String(toUserId));
          return next;
        });
      }
    }
  }

  // unfriend: call REST then notify other user via socket so they update in realtime
  async function unfriend(targetId) {
    if (!confirm("Remove friend?")) return;
    try {
      const resp = await axios.delete(
        `${FRIENDS_DELETE_URL}/${encodeURIComponent(targetId)}`,
        {
          withCredentials: true,
        }
      );
      if (resp.data && resp.data.ok) {
        alert("Removed friend");
        await fetchPlayers();
        const s = socketRef.current || getSocket();
        if (s && s.connected) {
          try {
            s.emit("remove-friend", { targetId }, (ack) => {});
          } catch (e) {}
        }
      } else {
        alert(`Failed: ${resp.data?.error || "unknown"}`);
      }
    } catch (err) {
      console.error("unfriend", err);
      alert(`Remove failed: ${err.response?.data?.error || err.message}`);
    }
  }

  // UI helpers
  const currentUserEntry =
    myProfile || players.find((p) => String(p.id) === String(currentUserId));
  const friendsCount = currentUserEntry?.friends?.length || 0;
  const friendIdsSet = new Set(
    (currentUserEntry?.friends || []).map((f) => String(f.id))
  );
  const friendsList = sortedPlayers.filter(
    (p) =>
      friendIdsSet.has(String(p.id)) && String(p.id) !== String(currentUserId)
  );
  const othersList = sortedPlayers.filter(
    (p) =>
      !friendIdsSet.has(String(p.id)) && String(p.id) !== String(currentUserId)
  );

  function isFriend(p) {
    return friendIdsSet.has(String(p.id));
  }
  function hasPendingSent(p) {
    return effectivePendingSentSet.has(String(p.id));
  }
  function openProfile(p) {
    window.location.href = `/player/${encodeURIComponent(p.id)}`;
  }

  if (!meLoaded) {
    return <div className={styles.loading}>Checking session…</div>;
  }

  // small inline style for flag images (keeps CSS changes minimal)
  const flagImgStyle = {
    width: 20,
    height: "auto",
    verticalAlign: "middle",
    marginRight: 6,
    borderRadius: 2,
  };

  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Players</h2>

          <div className={styles.controls}>
            <input
              type="search"
              placeholder="Search players by name or username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.input}
            />
            <button
              onClick={() => fetchPlayers(searchQuery)}
              disabled={loading}
              className={styles.btn}
              style={{ display: "none" }}
            >
              Search
            </button>
            <button
              onClick={() => {
                setSearchQuery("");
                fetchPlayers("");
              }}
              disabled={loading || !searchQuery}
              className={styles.btn}
            >
              Clear
            </button>

            <button
              onClick={() => fetchPlayers()}
              disabled={loading}
              className={styles.btn}
            >
              Refresh
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className={styles.error}>
            Error fetching players: {errorMsg}
            <div className={styles.errorUrl}>Requested URL: {PLAYERS_URL}</div>
          </div>
        )}

        {/* Current user summary card */}
        {currentUserEntry ? (
          <div className={styles.currentUserCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div>
                {currentUserEntry.avatarUrlAbsolute ? (
                  <img
                    src={currentUserEntry.avatarUrlAbsolute}
                    alt="you avatar"
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  // <div
                  //   style={{
                  //     width: 56,
                  //     height: 56,
                  //     borderRadius: "50%",
                  //     background: "#eee",
                  //     display: "flex",
                  //     alignItems: "center",
                  //     justifyContent: "center",
                  //     fontWeight: 600,
                  //   }}
                  // >
                  //   {(
                  //     currentUserEntry.displayName ||
                  //     currentUserEntry.username ||
                  //     "U"
                  //   )
                  //     .charAt(0)
                  //     .toUpperCase()}
                  // </div>

                  <img
                    src="https://ik.imagekit.io/ehggwul6k/Chess-app-avaters/1765541858886_user-blue-gradient_78370-4692_O6GdbvkG1.avif"
                    alt="avatar"
                    className={styles.avatarImgU}
                  />
                )}
              </div>

              <div className={styles.currentUserInfo}>
                <div className={styles.currentUserName}>
                  {currentUserEntry.displayName || currentUserEntry.username}
                  <span className={styles.youBadge}>You</span>
                </div>
                <div className={styles.currentUserHandle}>
                  @{currentUserEntry.username}
                </div>
                <div className={styles.currentUserMeta}>
                  <span>
                    <span
                      className={
                        currentUserEntry.online
                          ? styles.onlineDot
                          : styles.offlineDot
                      }
                    ></span>
                    {currentUserEntry.online ? "Online" : "Offline"}
                  </span>
                  •{" "}
                  <span
                    style={{ display: "inline-flex", alignItems: "center" }}
                  >
                    {currentUserEntry.flagUrl ? (
                      <img
                        src={currentUserEntry.flagUrl}
                        alt={currentUserEntry.country || "country"}
                        style={flagImgStyle}
                      />
                    ) : null}
                    {currentUserEntry.countryName ||
                      currentUserEntry.country ||
                      "Unknown country"}
                  </span>
                  • {friendsCount} friends
                </div>
              </div>
            </div>

            <div className={styles.playerActions}>
              <button
                className={styles.btn}
                onClick={() => openProfile(currentUserEntry)}
              >
                View Profile
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.notSignedIn}>
            Not signed in — sign in to see your profile here
          </div>
        )}

        {/* Friends */}
        <div>
          <h3 className={styles.sectionHeader}>
            Friends{" "}
            <span className={styles.sectionCount}>({friendsCount})</span>
          </h3>
          {friendsList.length === 0 && (
            <div className={styles.emptyState}>No friends to show</div>
          )}
          <div className={styles.playersGrid}>
            {friendsList.map((p) => (
              <div key={p.id} className={styles.playerCard}>
                <div className={styles.playerHeader}>
                  <div
                    className={styles.playerInfo}
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <div>
                      {p.avatarUrlAbsolute ? (
                        <img
                          src={p.avatarUrlAbsolute}
                          alt={`${p.displayName || p.username} avatar`}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: "50%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        // <div
                        //   style={{
                        //     width: 44,
                        //     height: 44,
                        //     borderRadius: "50%",
                        //     background: "#eee",
                        //     display: "flex",
                        //     alignItems: "center",
                        //     justifyContent: "center",
                        //     fontWeight: 600,
                        //   }}
                        // >
                        //   {(p.displayName || p.username || "U")
                        //     .charAt(0)
                        //     .toUpperCase()}
                        // </div>

                        <img
                          src="https://ik.imagekit.io/ehggwul6k/Chess-app-avaters/1765541858886_user-blue-gradient_78370-4692_O6GdbvkG1.avif"
                          alt="avatar"
                          className={styles.avatarImgUF}
                        />
                      )}
                    </div>

                    <div>
                      <div className={styles.playerName}>
                        {p.displayName || p.username}
                      </div>
                      <div className={styles.playerHandle}>@{p.username}</div>
                      {p.friends && p.friends.length > 0 && (
                        <div className={styles.playerFriends}>
                          Friends:{" "}
                          {p.friends
                            .map((f) => f.username)
                            .slice(0, 3)
                            .join(", ")}
                          {p.friends.length > 3 ? "…" : ""}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={styles.playerStatus}>
                    <div
                      className={`${styles.onlineStatus} ${
                        p?.online ? styles.online : styles.offline
                      }`}
                    >
                      {p.online ? "Online" : "Offline"}
                    </div>
                    <div className={styles.playerCountry}>
                      {p.flagUrl ? (
                        <img
                          src={p.flagUrl}
                          alt={p.country || ""}
                          style={flagImgStyle}
                        />
                      ) : null}
                      <span>{p.countryName || p.country || ""}</span>
                    </div>
                  </div>
                </div>

                <div className={styles.playerActions}>
                  <button
                    className={styles.btn}
                    onClick={() => openChallengeModal(p)}
                    disabled={!p.online}
                  >
                    Challenge
                  </button>
                  <button
                    className={styles.btn}
                    onClick={() => sendFriendRequest(p.id)}
                    disabled={isFriend(p) || hasPendingSent(p)}
                  >
                    {isFriend(p)
                      ? "Friends"
                      : hasPendingSent(p)
                      ? "Request sent"
                      : "Friend"}
                  </button>
                  <button
                    className={`${styles.btn} ${styles.unfriendBtn}`}
                    onClick={() => unfriend(p.id)}
                  >
                    Unfriend
                  </button>
                  <button className={styles.btn} onClick={() => openProfile(p)}>
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Others */}
        <div>
          <h3 className={styles.sectionHeader}>
            Others{" "}
            <span className={styles.sectionCount}>({othersList.length})</span>
          </h3>
          {othersList.length === 0 && (
            <div className={styles.emptyState}>No other players</div>
          )}
          <div className={styles.playersGrid}>
            {othersList.map((p) => (
              <div key={p.id} className={styles.playerCard}>
                <div className={styles.playerHeader}>
                  <div
                    className={styles.playerInfo}
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <div>
                      {p.avatarUrlAbsolute ? (
                        <img
                          src={p.avatarUrlAbsolute}
                          alt={`${p.displayName || p.username} avatar`}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: "50%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        // <div
                        //   style={{
                        //     width: 44,
                        //     height: 44,
                        //     borderRadius: "50%",
                        //     background: "#eee",
                        //     display: "flex",
                        //     alignItems: "center",
                        //     justifyContent: "center",
                        //     fontWeight: 600,
                        //   }}
                        // >
                        //   {(p.displayName || p.username || "U")
                        //     .charAt(0)
                        //     .toUpperCase()}
                        // </div>

                        <img
                          src="https://ik.imagekit.io/ehggwul6k/Chess-app-avaters/1765541858886_user-blue-gradient_78370-4692_O6GdbvkG1.avif"
                          alt="avatar"
                          className={styles.avatarImgUF}
                        />
                      )}
                    </div>

                    <div>
                      <div className={styles.playerName}>
                        {p.displayName || p.username}
                      </div>
                      <div className={styles.playerHandle}>@{p.username}</div>
                    </div>
                  </div>

                  <div className={styles.playerStatus}>
                    <div
                      className={`${styles.onlineStatus} ${
                        p.online ? styles.online : styles.offline
                      }`}
                    >
                      {p.online ? "Online" : "Offline"}
                    </div>
                    <div className={styles.playerCountry}>
                      {p.flagUrl ? (
                        <img
                          src={p.flagUrl}
                          alt={p.country || ""}
                          style={flagImgStyle}
                        />
                      ) : null}
                      <span>{p.countryName || p.country || ""}</span>
                    </div>
                  </div>
                </div>

                <div className={styles.playerActions}>
                  <button
                    className={styles.btn}
                    onClick={() => openChallengeModal(p)}
                    disabled={!p.online}
                  >
                    Challenge
                  </button>
                  <button
                    className={styles.btn}
                    onClick={() => sendFriendRequest(p.id)}
                    disabled={isFriend(p) || hasPendingSent(p)}
                  >
                    {isFriend(p)
                      ? "Friends"
                      : hasPendingSent(p)
                      ? "Request sent"
                      : "Friend"}
                  </button>
                  <button className={styles.btn} onClick={() => openProfile(p)}>
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Challenge modal */}
        {challengeModal.open && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalBox}>
              <h3 className={styles.modalTitle}>
                Challenge{" "}
                {challengeModal.target?.displayName ||
                  challengeModal.target?.username}
              </h3>
              <div className={styles.formRow}>
                <label className={styles.label}>Minutes:</label>
                <input
                  type="number"
                  value={challengeModal.minutes}
                  onChange={(e) =>
                    setChallengeModal((s) => ({
                      ...s,
                      minutes: Number(e.target.value) || 1,
                    }))
                  }
                  className={styles.input}
                  min={1}
                />
              </div>
              <div className={styles.formRow}>
                <label className={styles.label}>Color preference:</label>
                <select
                  value={challengeModal.color}
                  onChange={(e) =>
                    setChallengeModal((s) => ({ ...s, color: e.target.value }))
                  }
                  className={styles.select}
                >
                  <option value="random">Random</option>
                  <option value="white">Prefer White</option>
                  <option value="black">Prefer Black</option>
                </select>
              </div>
              <div className={styles.modalActions}>
                <button
                  className={`${styles.btn} ${styles.primary}`}
                  onClick={sendChallenge}
                >
                  Send Challenge
                </button>
                <button className={styles.btn} onClick={closeChallengeModal}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Incoming challenge modal - show avatar if present */}
        {incomingChallenge && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalBox}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                {resolveAvatarFrom(incomingChallenge.from) ? (
                  <img
                    src={resolveAvatarFrom(incomingChallenge.from)}
                    alt={`${incomingChallenge.from.username} avatar`}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      objectFit: "cover",
                    }}
                  />
                ) : null}
                <h3 className={styles.modalTitle}>
                  Challenge from {incomingChallenge.from.username}
                </h3>
              </div>
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
                <button
                  className={styles.btn}
                  onClick={declineIncomingChallenge}
                >
                  Decline
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
