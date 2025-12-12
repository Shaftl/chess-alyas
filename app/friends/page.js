"use client";
import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import { initSocket } from "@/lib/socketClient";
import ProtectedRoute from "@/components/ProtectedRoute";
import FriendCard from "@/components/FriendCard";
import { useRouter } from "next/navigation";
import styles from "./Friends.module.css";

// API prefix (normalized)
const RAW_API = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
).replace(/\/$/, "");
const API_PREFIX = RAW_API.endsWith("/api") ? RAW_API : `${RAW_API}/api`;

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

export default function FriendsPageWrapper() {
  return (
    <ProtectedRoute>
      <FriendsPage />
    </ProtectedRoute>
  );
}

function FriendsPage() {
  const authUser = useSelector((s) => s.auth.user);
  const router = useRouter();

  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const [challengeModal, setChallengeModal] = useState({
    open: false,
    target: null,
    minutes: 5,
    color: "random",
  });

  // incoming challenge state (for realtime incoming)
  const [incomingChallenge, setIncomingChallenge] = useState(null);

  const socketRef = useRef(null);

  useEffect(() => {
    fetchAll();
    const s = initSocket();
    socketRef.current = s;

    s.on("connect", () => fetchAll());

    // presence changes -> refresh friends (so the `online` flags from backend update)
    s.on("presence-changed", (payload) => {
      // payload: { userId, online, sockets }
      fetchFriends().catch(() => {});
    });

    s.on("friend-request-received", (payload) => {
      fetchRequests().catch(() => {});
    });

    s.on("friend-request-accepted", (payload) => {
      fetchFriends();
      fetchRequests();
      if (payload?.by?.username)
        alert(`Friend request accepted by ${payload.by.username}`);
    });

    s.on("friend-request-declined", (payload) => {
      fetchRequests();
      if (payload?.by?.username)
        alert(`Friend request declined by ${payload.by.username}`);
    });

    s.on("friend-removed", (payload) => {
      // update lists when someone removes friendship
      fetchFriends();
      fetchRequests();
    });

    // challenge events
    s.on("challenge-received", (payload) => {
      // payload shape typically: { challengeId, from: { id, username }, minutes, colorPreference }
      setIncomingChallenge(payload);
    });

    s.on("challenge-sent", (payload) => {
      // another client sent a challenge (maybe to someone in our view) -> refresh lists
      fetchFriends();
    });

    s.on("challenge-declined", (payload) => {
      if (payload?.reason) alert(`Challenge declined: ${payload.reason}`);
      fetchFriends();
    });

    s.on("challenge-accepted", (payload) => {
      if (payload && payload.roomId) {
        const path =
          (payload.redirectPath || "/play") +
          `/${encodeURIComponent(payload.roomId)}`;
        window.location.href = path;
      }
    });

    return () => {
      try {
        s.off("connect");
        s.off("presence-changed");
        s.off("friend-request-received");
        s.off("friend-request-accepted");
        s.off("friend-request-declined");
        s.off("friend-removed");
        s.off("challenge-received");
        s.off("challenge-sent");
        s.off("challenge-declined");
        s.off("challenge-accepted");
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchAll() {
    setError(null);
    setLoading(true);
    try {
      await Promise.all([fetchFriends(), fetchRequests()]);
    } catch (err) {
      console.error("fetchAll error", err);
      setError("Failed to load friends data");
    } finally {
      setLoading(false);
    }
  }

  async function fetchFriends() {
    try {
      const res = await axios.get(`${API_PREFIX}/friends`, {
        withCredentials: true,
      });
      // normalize avatar fields client-side and enrich with flag info
      const arr = Array.isArray(res.data) ? res.data : [];
      const normalized = arr.map((f) => {
        const avatar =
          f.avatarUrlAbsolute ||
          f.avatarUrl ||
          (f.user && (f.user.avatarUrlAbsolute || f.user.avatarUrl)) ||
          null;
        const avatarUrlAbsolute =
          avatar && !/^https?:\/\//i.test(avatar)
            ? `${backendOrigin}${avatar}`
            : avatar;

        // add flagUrl and countryName (frontend-only) — prefer existing flagUrl if backend provided
        const flagUrl =
          f.flagUrl || (f.country ? flagUrlForCountry(f.country, 20) : null);
        const countryName = f.countryName || f.country || null;

        return { ...f, avatarUrlAbsolute, flagUrl, countryName };
      });
      setFriends(normalized);
    } catch (err) {
      console.error("fetchFriends", err);
      setFriends([]);
    }
  }

  async function fetchRequests() {
    try {
      const res = await axios.get(
        `${API_PREFIX}/friends/requests?status=pending`,
        {
          withCredentials: true,
        }
      );
      const arr = Array.isArray(res.data) ? res.data : [];
      // try to normalize "from" avatar fields if present on the request and enrich with flag info
      const normalized = arr.map((req) => {
        // check various possible fields
        let fromAvatar =
          req.fromAvatarUrlAbsolute ||
          req.fromAvatarUrl ||
          req.fromAvatar ||
          req.from?.avatarUrlAbsolute ||
          req.from?.avatarUrl ||
          null;
        let fromAvatarAbsolute = null;
        if (fromAvatar) {
          fromAvatarAbsolute = /^https?:\/\//i.test(fromAvatar)
            ? fromAvatar
            : `${backendOrigin}${fromAvatar}`;
        }

        // flag enrichment for the request sender (frontend-only)
        const fromCountry = req.from?.country || req.fromCountry || null;
        const fromFlagUrl =
          req.fromFlagUrl ||
          (fromCountry ? flagUrlForCountry(fromCountry, 20) : null);
        const fromCountryName =
          req.from?.countryName || req.fromCountryName || fromCountry || null;

        // also attach unified field for template use
        return {
          ...req,
          fromAvatarAbsolute,
          fromFlagUrl,
          fromCountryName,
        };
      });
      setRequests(normalized);
    } catch (err) {
      console.error("fetchRequests", err);
      setRequests([]);
    }
  }

  // prefer socket for realtime send
  async function sendFriendRequest(toUserId) {
    if (!socketRef.current || !authUser) {
      alert("Not connected or not logged in");
      return;
    }
    setBusyId(toUserId);
    try {
      socketRef.current.emit(
        "send-friend-request",
        { toUserId },
        async (resp) => {
          if (!resp || !resp.ok) {
            alert(`Failed: ${resp?.error || "unknown"}`);
          } else {
            alert("Friend request sent");
            await fetchRequests();
          }
          setBusyId(null);
        }
      );
    } catch (err) {
      console.error("sendFriendRequest socket error", err);
      alert("Send friend request failed (socket)");
      setBusyId(null);
    }
  }

  async function respondFriendRequest(reqId, accept) {
    setBusyId(reqId);
    try {
      const resp = await axios.post(
        `${API_PREFIX}/friends/respond`,
        { reqId, accept },
        { withCredentials: true }
      );
      if (resp.data && resp.data.ok) {
        alert(accept ? "Friend request accepted" : "Friend request declined");
        await Promise.all([fetchFriends(), fetchRequests()]);
      } else {
        alert(`Failed: ${resp.data?.error || "unknown"}`);
      }
    } catch (err) {
      console.error("respondFriendRequest", err);
      alert(`Respond failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function unfriend(targetId) {
    if (!confirm("Remove friend?")) return;
    setBusyId(targetId);
    try {
      const resp = await axios.delete(
        `${API_PREFIX}/friends/${encodeURIComponent(targetId)}`,
        {
          withCredentials: true,
        }
      );
      if (resp.data && resp.data.ok) {
        alert("Removed friend");
        await fetchFriends();
        // notify server to broadcast to other user
        try {
          socketRef.current?.emit("remove-friend", { targetId }, (ack) => {});
        } catch (e) {}
      } else {
        alert(`Failed: ${resp.data?.error || "unknown"}`);
      }
    } catch (err) {
      console.error("unfriend", err);
      alert(`Remove failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  function openChallengeModal(user) {
    setChallengeModal({
      open: true,
      target: user,
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

  // send challenge with optional callback ack; set busy state to button target
  function sendChallenge() {
    const s = socketRef.current;
    if (!s || !challengeModal.target) return alert("Socket not connected");
    const { target, minutes, color } = challengeModal;
    setBusyId(target.id);
    try {
      s.emit(
        "challenge",
        { toUserId: target.id, minutes, colorPreference: color },
        (resp) => {
          if (!resp || !resp.ok) {
            alert(`Failed to send challenge: ${resp?.error || "unknown"}`);
          } else {
            alert("Challenge sent");
            fetchFriends();
          }
          setBusyId(null);
        }
      );
    } catch (err) {
      console.error("challenge emit error", err);
      alert("Challenge failed (socket)");
      setBusyId(null);
    }
    closeChallengeModal();
  }

  // incoming challenge handlers
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

  function viewProfile(id) {
    router.push(`/player/${encodeURIComponent(id)}`);
  }

  const friendsCount = friends.length;
  const incomingCount = requests.length;

  // small inline style for flag images (keeps CSS changes minimal)
  const flagImgStyle = {
    width: 20,
    height: "auto",
    verticalAlign: "middle",
    marginRight: 6,
    borderRadius: 2,
  };

  return (
    <div className={styles.container}>
      <header className={styles.headerRow}>
        <h2 className={styles.title}>Friends</h2>

        <div className={styles.controls}>
          <button
            className={styles.btn}
            onClick={fetchAll}
            disabled={loading}
            aria-disabled={loading}
          >
            Refresh
          </button>

          <button
            className={styles.btn}
            onClick={() => router.push("/players")}
          >
            Browse Players
          </button>

          <div className={styles.signedIn}>
            Signed in as{" "}
            <strong>{authUser?.displayName || authUser?.username}</strong>
          </div>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          Incoming Friend Requests{" "}
          <span className={styles.muted}>({incomingCount})</span>
        </h3>

        <div className={styles.requestsList}>
          {requests.length === 0 && (
            <div className={styles.emptyState}>No incoming requests</div>
          )}

          {requests.map((req) => (
            <div key={req.reqId} className={styles.requestCard}>
              <div
                className={styles.requestInfo}
                style={{ display: "flex", gap: 12, alignItems: "center" }}
              >
                {req.fromAvatarAbsolute ? (
                  <img
                    src={req.fromAvatarAbsolute}
                    alt={`${req.fromDisplayName || req.fromUsername} avatar`}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <img
                    src="https://ik.imagekit.io/ehggwul6k/Chess-app-avaters/1765541858886_user-blue-gradient_78370-4692_O6GdbvkG1.avif"
                    alt="avatar"
                    className={styles.avatarImg}
                  />
                )}

                <div>
                  <div
                    className={styles.requestName}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    {req.fromFlagUrl ? (
                      <img
                        src={req.fromFlagUrl}
                        alt={req.fromCountryName || req.from?.country || ""}
                        style={flagImgStyle}
                      />
                    ) : null}
                    <span>{req.fromDisplayName || req.fromUsername}</span>
                  </div>
                  <div className={styles.requestHandle}>
                    @{req.fromUsername}
                  </div>
                  <div className={styles.requestTs}>
                    Sent: {new Date(req.ts || Date.now()).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className={styles.requestActions}>
                <button
                  className={styles.btn}
                  onClick={() => respondFriendRequest(req.reqId, true)}
                  disabled={busyId === req.reqId}
                >
                  Accept
                </button>
                <button
                  className={styles.btn}
                  onClick={() => respondFriendRequest(req.reqId, false)}
                  disabled={busyId === req.reqId}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          Your Friends <span className={styles.muted}>({friendsCount})</span>
        </h3>

        {friendsCount === 0 && (
          <div className={styles.emptyState}>
            You have no friends yet — browse players to add friends
          </div>
        )}

        <div className={styles.friendsGrid}>
          {friends.map((f) => (
            <FriendCard
              key={f.id}
              user={f}
              onChallenge={openChallengeModal}
              onUnfriend={unfriend}
              onView={viewProfile}
              // pass busyId so child can render disabled state if needed
              busyId={busyId}
            />
          ))}
        </div>
      </section>

      {/* Challenge Modal (styled via CSS module) */}
      {challengeModal.open && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalBox}>
            <h3 className={styles.modalTitle}>
              Challenge{" "}
              {challengeModal.target?.displayName ||
                challengeModal.target?.username}
            </h3>

            <div className={styles.formRow}>
              <label className={styles.label}>Minutes:</label>
              <input
                className={styles.input}
                type="number"
                value={challengeModal.minutes}
                onChange={(e) =>
                  setChallengeModal((s) => ({
                    ...s,
                    minutes: Number(e.target.value) || 1,
                  }))
                }
                min={1}
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.label}>Color preference:</label>
              <select
                className={styles.select}
                value={challengeModal.color}
                onChange={(e) =>
                  setChallengeModal((s) => ({ ...s, color: e.target.value }))
                }
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
                disabled={
                  !challengeModal.target || busyId === challengeModal.target?.id
                }
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

      {/* Incoming challenge modal */}
      {incomingChallenge && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
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
                  alt={`${incomingChallenge.from?.username} avatar`}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              ) : null}
              <h3 className={styles.modalTitle}>
                Challenge from {incomingChallenge.from?.username}
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
