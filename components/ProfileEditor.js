"use client";
import React, { useEffect, useState, useRef } from "react";
import { format } from "date-fns";
import styles from "./ProfileEditor.module.css";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export default function ProfileEditor() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // percent 0-100 (null when not uploading)
  const [bio, setBio] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [cups, setCups] = useState(0);
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState(null);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState("");

  // game history state
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesErr, setGamesErr] = useState(null);
  const [games, setGames] = useState([]);
  const [totalGames, setTotalGames] = useState(0);
  const [opponentsCount, setOpponentsCount] = useState(0);
  const [totalMoves, setTotalMoves] = useState(0);
  const [lastPlayed, setLastPlayed] = useState(null);

  // ref to hold object URL preview so we can revoke it later
  const previewUrlRef = useRef(null);
  const msgRef = useRef(null);

  useEffect(() => {
    fetchProfile();
    // cleanup on unmount: revoke any created object URL
    return () => {
      if (previewUrlRef.current) {
        try {
          URL.revokeObjectURL(previewUrlRef.current);
        } catch (e) {
          // ignore
        }
        previewUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (msg && msgRef.current) {
      // scroll message into view and focus it so the user sees it
      msgRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      try {
        msgRef.current.focus();
      } catch (e) {
        /* ignore */
      }
    }
  }, [msg]);

  // when profile loads, fetch game history
  useEffect(() => {
    if (!profile || !profile.id) return;
    fetchGamesForProfile(profile.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function fetchProfile() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`${API}/auth/me`, {
        credentials: "include",
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMsg({ type: "error", text: j.error || "Unable to fetch profile" });
        setLoading(false);
        return;
      }
      const data = await res.json();

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
          API.replace(/\/api\/?$/, "");
        finalAvatar = `${backendOrigin}${data.avatarUrl}`;
      }
      data.avatarUrl = finalAvatar;

      data.flagUrl = data.flagUrl || null;
      data.country = data.country || null;
      data.countryName = data.countryName || null;

      if (!data.flagUrl && data.country) {
        data.flagUrl = `https://flagcdn.com/w40/${data.country.toLowerCase()}.png`;
      }

      try {
        if (!data.countryName && data.country) {
          const cca = data.country.toLowerCase();
          const rr = await fetch(`https://restcountries.com/v3.1/alpha/${cca}`);
          if (rr.ok) {
            const j = await rr.json();
            if (Array.isArray(j) && j[0]) {
              data.countryName =
                j[0].name?.common || j[0].name?.official || data.country;
              if (!data.flagUrl && j[0].cca2) {
                data.flagUrl = `https://flagcdn.com/w40/${j[0].cca2.toLowerCase()}.png`;
              }
            }
          }
        } else if (!data.countryName && !data.country && data.lastIp) {
          const ip = data.lastIp;
          const r = await fetch(`https://ipapi.co/${ip}/json/`);
          if (r.ok) {
            const j = await r.json();
            const code = j.country_code || null;
            const name = j.country_name || j.country || null;
            if (code) {
              data.country = code;
              data.flagUrl = `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
            }
            if (name) {
              data.countryName = name;
            }
          }
        }
      } catch (err) {
        // ignore enrichment errors
      }

      setProfile(data);
      setBio(data.bio || "");
      setDisplayName(data.displayName || "");
      setCups(data.cups || 0);
    } catch (err) {
      setMsg({ type: "error", text: "Network error" });
    } finally {
      setLoading(false);
    }
  }

  // fetch games for profile id
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

  // handle file input change: show preview immediately and start upload
  function handleFileChange(e) {
    const selected = e.target.files?.[0] || null;
    if (!selected) return;

    // revoke previous preview if any
    if (previewUrlRef.current) {
      try {
        URL.revokeObjectURL(previewUrlRef.current);
      } catch (err) {
        // ignore
      }
      previewUrlRef.current = null;
    }

    const previewUrl = URL.createObjectURL(selected);
    previewUrlRef.current = previewUrl;

    setFile(selected);

    // show the image right away in UI
    setProfile((p) => ({ ...(p || {}), avatarUrl: previewUrl }));

    // start upload immediately
    uploadAvatar(selected);
  }

  // uploadAvatar now accepts either an Event (from a form submit) or a File (from handleFileChange)
  // we use XMLHttpRequest to provide upload progress reporting (fetch has no upload progress)
  function uploadAvatar(eOrFile) {
    // allow calling from a form submit or directly with a File
    if (eOrFile && typeof eOrFile.preventDefault === "function") {
      eOrFile.preventDefault();
    }

    const fileToUse =
      eOrFile instanceof File
        ? eOrFile
        : eOrFile && eOrFile.target && eOrFile.target.files
        ? eOrFile.target.files[0]
        : file;

    if (!fileToUse) {
      setMsg({ type: "error", text: "Choose a file first" });
      return;
    }

    setLoading(true);
    setMsg(null);
    setUploadProgress(0);

    const form = new FormData();
    form.append("avatar", fileToUse);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API}/auth/upload-avatar`);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          setUploadProgress(pct);
        }
      };

      xhr.onload = () => {
        let j = {};
        try {
          j = JSON.parse(xhr.responseText || "{}");
        } catch (err) {
          // ignore parse error
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          let avatarUrl = null;
          if (
            j.avatarUrlAbsolute &&
            /^https?:\/\//i.test(j.avatarUrlAbsolute)
          ) {
            avatarUrl = j.avatarUrlAbsolute;
          } else if (j.avatarUrl && /^https?:\/\//i.test(j.avatarUrl)) {
            avatarUrl = j.avatarUrl;
          } else if (j.avatarUrl) {
            const backendOrigin =
              process.env.NEXT_PUBLIC_BACKEND_BASE_URL ||
              API.replace(/\/api\/?$/, "");
            avatarUrl = `${backendOrigin}${j.avatarUrl}`;
          }

          // update profile everywhere
          setProfile((p) => ({ ...(p || {}), avatarUrl }));
          setMsg({ type: "success", text: "Avatar uploaded successfully" });

          // if we had a blob preview (created with URL.createObjectURL), revoke it now
          const hadPreviewBlob =
            previewUrlRef.current &&
            String(previewUrlRef.current).startsWith("blob:");
          if (hadPreviewBlob && previewUrlRef.current) {
            try {
              URL.revokeObjectURL(previewUrlRef.current);
            } catch (err) {
              // ignore
            }
            previewUrlRef.current = null;
          }
        } else {
          setMsg({ type: "error", text: j.error || "Upload failed" });
        }

        setLoading(false);
        setUploadProgress(null);
        setFile(null);
      };

      xhr.onerror = () => {
        setMsg({ type: "error", text: "Upload error" });
        setLoading(false);
        setUploadProgress(null);
      };

      xhr.send(form);
    } catch (err) {
      setMsg({ type: "error", text: "Upload error" });
      setLoading(false);
      setUploadProgress(null);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`${API}/auth/profile`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ displayName, bio, cups }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: "error", text: j.error || "Save failed" });
      } else {
        let avatarUrl = null;
        if (j.avatarUrlAbsolute && /^https?:\/\//i.test(j.avatarUrlAbsolute)) {
          avatarUrl = j.avatarUrlAbsolute;
        } else if (j.avatarUrl && /^https?:\/\//i.test(j.avatarUrl)) {
          avatarUrl = j.avatarUrl;
        } else if (j.avatarUrl) {
          const backendOrigin =
            process.env.NEXT_PUBLIC_BACKEND_BASE_URL ||
            API.replace(/\/api\/?$/, "");
          avatarUrl = `${backendOrigin}${j.avatarUrl}`;
        }
        j.avatarUrl = avatarUrl;

        const updated = {
          ...profile,
          ...j,
        };

        if (j.country && !updated.countryName) {
          try {
            const cca = j.country.toLowerCase();
            const rr = await fetch(
              `https://restcountries.com/v3.1/alpha/${cca}`
            );
            if (rr.ok) {
              const jj = await rr.json();
              if (Array.isArray(jj) && jj[0]) {
                updated.countryName =
                  jj[0].name?.common || jj[0].name?.official || j.country;
                if (!updated.flagUrl && jj[0].cca2) {
                  updated.flagUrl = `https://flagcdn.com/w40/${jj[0].cca2.toLowerCase()}.png`;
                }
              }
            }
          } catch (err) {
            // ignore
          }
        }

        setProfile(updated);
        setMsg({ type: "success", text: "Profile updated successfully" });
        setIsEditProfileOpen(false);

        // scroll to the message so the user sees the success/error box
        if (msgRef.current) {
          msgRef.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          try {
            msgRef.current.focus();
          } catch (e) {
            /* ignore */
          }
        }
      }
    } catch (err) {
      setMsg({ type: "error", text: "Save error" });
    } finally {
      setLoading(false);
    }
  }

  const flagUrl =
    profile &&
    (profile.flagUrl ||
      (profile.country
        ? `https://flagcdn.com/w40/${profile.country.toLowerCase()}.png`
        : null));

  /* Helper to produce canonical room id (strip "-<timestamp>" suffix when present) */
  function canonicalRoomId(roomIdRaw) {
    if (!roomIdRaw) return "";
    const r = String(roomIdRaw);
    // if it matches pattern like ABCDEF-1234567890, return prefix
    const idx = r.indexOf("-");
    if (idx === -1) return r;
    // if suffix is numeric timestamp, strip it
    const suffix = r.slice(idx + 1);
    if (/^\d+$/.test(suffix)) return r.slice(0, idx);
    // otherwise keep original (some roomIds may legitimately contain '-')
    return r;
  }

  return (
    <div className={styles.container}>
      {loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingSpinner}></div>
          <span>Loading...</span>
        </div>
      )}

      {msg && (
        <div
          ref={msgRef}
          tabIndex={-1} // allows focus()
          className={`${styles.message} ${styles[msg.type]}`}
        >
          {msg.type === "success" ? (
            <div className={styles.msgBox}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                id="Circle-Check--Streamline-Font-Awesome"
                height="16"
                width="16"
              >
                <desc>
                  Circle Check Streamline Icon: https://streamlinehq.com
                </desc>
                <path
                  d="M8 16a8 8 0 1 0 0 -16 8 8 0 1 0 0 16zm3.53125 -9.46875L7.53125 10.53125c-0.29375 0.29375 -0.76875 0.29375 -1.059375 0l-2 -2c-0.29375 -0.29375 -0.29375 -0.76875 0 -1.059375s0.76875 -0.29375 1.059375 0l1.46875 1.46875L10.46875 5.46875c0.29375 -0.29375 0.76875 -0.29375 1.059375 0s0.29375 0.76875 0 1.059375z"
                  fill="#000000"
                  strokeWidth="0.0313"
                ></path>
              </svg>{" "}
              <span> {msg.text}</span>{" "}
            </div>
          ) : (
            <div className={styles.msgBox}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                id="Circle-Xmark--Streamline-Font-Awesome"
                height="16"
                width="16"
              >
                <desc>
                  Circle Xmark Streamline Icon: https://streamlinehq.com
                </desc>
                <path
                  d="M8 16a8 8 0 1 0 0 -16 8 8 0 1 0 0 16zm-2.53125 -10.53125c0.29375 -0.29375 0.76875 -0.29375 1.059375 0l1.46875 1.46875 1.46875 -1.46875c0.29375 -0.29375 0.76875 -0.29375 1.059375 0s0.29375 0.76875 0 1.059375l-1.46875 1.46875 1.46875 1.46875c0.29375 0.29375 0.29375 0.76875 0 1.059375s-0.76875 0.29375 -1.059375 0l-1.46875 -1.46875 -1.46875 1.46875c0.29375 0.29375 0.76875 0.29375 1.059375 0s0.29375 -0.76875 0 -1.059375l1.46875 -1.46875 -1.46875 -1.46875c-0.29375 -0.29375 -0.29375 -0.76875 0 -1.059375z"
                  fill="#000000"
                  strokeWidth="0.0313"
                ></path>
              </svg>
              <span> {msg.text}</span>{" "}
            </div>
          )}
        </div>
      )}

      {!profile && !loading && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>👤</div>
          <h3>No Profile Found</h3>
          <p>Unable to load your profile information</p>
          <button onClick={fetchProfile} className={styles.primaryButton}>
            Try Again
          </button>
        </div>
      )}

      {profile && (
        <div className={styles.profileContainer}>
          {/* Profile Header Card */}
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

                {/* spinner overlay while uploading */}
                {uploadProgress !== null && (
                  <div
                    className={styles.avatarUploadingOverlay}
                    aria-live="polite"
                    aria-label="Uploading avatar"
                  >
                    <div className={styles.avatarUploadingText}>
                      Uploading...
                    </div>
                    <div className={styles.spinner} role="status" aria-hidden />
                  </div>
                )}

                <label htmlFor="avatar-upload" className={styles.fileLabel}>
                  <div className={styles.avatarOverlay}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      id="Camera--Streamline-Font-Awesome"
                      height="16"
                      width="16"
                    >
                      <desc>
                        Camera Streamline Icon: https://streamlinehq.com
                      </desc>
                      <path
                        d="M4.659375 2.025 4.334375 3H2c-1.103125 0 -2 0.896875 -2 2v8c0 1.103125 0.896875 2 2 2h12c1.103125 0 2 -0.896875 2 -2V5c0 -1.103125 -0.896875 -2 -2 -2h-2.334375l-0.325 -0.975C11.1375 1.4125 10.565625 1 9.91875 1H6.08125c-0.646875 0 -1.21875 0.4125 -1.421875 1.025zM8 6a3 3 0 1 1 0 6 3 3 0 1 1 0 -6z"
                        fill="#000000"
                        strokeWidth="0.0313"
                      ></path>
                    </svg>
                  </div>
                </label>
              </div>

              <div className={styles.avatarUpload}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className={styles.fileInput}
                  id="avatar-upload"
                  style={{ display: "none" }}
                  disabled={loading}
                />
              </div>

              {/* previous textual progress UI intentionally removed in favor of spinner overlay */}
            </div>

            <div className={styles.profileInfo}>
              <div className={styles.nameSection}>
                <div className={styles.location}>
                  {flagUrl && (
                    <img
                      src={flagUrl}
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
                    <span className={styles.detailValue}>{bio}</span>
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
                    <span className={styles.detailValue}>{profile.email}</span>
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
                <div className={styles.cupsValue}>({profile.cups})</div>
              </div>
            </div>
          </div>
          {/* Edit Form + Game History */}

          <div className={styles.formCard}>
            <div className={styles.gameHistory}>
              <h3>Game History</h3>

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
                                <div className={styles.gameDate}>{dateStr}</div>
                                <div className={styles.gameMoves}>
                                  {movesCount} moves
                                </div>
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
                              {/* <div
                                className={`${styles.gameMeta} ${styles.gameMetaColor}`}
                              >
                                <div className={styles.metaLabel}>
                                  Your Color
                                </div>
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

            <div className={styles.editProfile}>
              <h3
                className={`${styles.formTitle} ${
                  !isEditProfileOpen && styles.formTitleNonMargin
                }`}
                onClick={() => setIsEditProfileOpen((e) => !e)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  id="User-Pen--Streamline-Font-Awesome"
                  height="16"
                  width="16"
                >
                  <desc>
                    User Pen Streamline Icon: https://streamlinehq.com
                  </desc>
                  <path
                    d="M5.6488575 8c2.4144725000000005 0 3.923515 -2.6137425000000003 2.7162800000000002 -4.704735 -0.56028 -0.9704325000000001 -1.59572 -1.5682450000000001 -2.7162800000000002 -1.5682450000000001 -2.41447 0 -3.923515 2.6137425000000003 -2.7162800000000002 4.704735C3.4928575000000004 7.4021875 4.5282975 8 5.6488575 8Zm-1.119825 1.176185C2.1154050000000004 9.176185 0.16000000000000003 11.131590000000001 0.16000000000000003 13.545217500000001c0 0.4018625 0.3259 0.7277625 0.7277625 0.7277625h7.1820725c-0.07596000000000001 -0.2156325 -0.09066250000000001 -0.45087000000000005 -0.034305 -0.6812075000000001l0.3675575 -1.4726800000000002c0.0686125 -0.2768925 0.210735 -0.52683 0.411665 -0.7277625l0.9875050000000001 -0.9875050000000001c-0.786575 -0.7596175000000001 -1.85494 -1.22764 -3.0360250000000004 -1.22764h-2.2372Zm10.6714175 -1.6736125000000002c-0.38226000000000004 -0.38226000000000004 -1.0022075 -0.38226000000000004 -1.3869175 0l-0.7204125000000001 0.7204125000000001 1.7397725000000002 1.7397725000000002 0.7204125000000001 -0.7204125000000001c0.38226000000000004 -0.38226000000000004 0.38226000000000004 -1.0022075 0 -1.3869175l-0.35285500000000003 -0.35285500000000003ZM9.37099 11.945117500000002c-0.1004675 0.10046500000001 -0.17152750000000003 0.22543500000002 -0.2058325 0.365105l-0.3675575 1.4726800000000002c-0.034305 0.13477250000000002 0.004900000000000001 0.274445 0.102915 0.37246s0.23768750000000002 0.13722 0.37246 0.102915l1.4726800000000002 -0.3675575c0.13722 -0.034305 0.26464 -0.1053675 0.365105 -0.2058325l3.1658950000000003 -3.1683450000000004 -1.73977 -1.7397725000000002 -3.1658950000000003 3.1683475000000003Z"
                    fill="#000000"
                    strokeWidth="0.025"
                  ></path>
                </svg>{" "}
                <span>Edit Profile</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  id="Arrow-Down--Streamline-Font-Awesome"
                  height="16"
                  width="16"
                >
                  <desc>
                    Arrow Down Streamline Icon: https://streamlinehq.com
                  </desc>
                  <path
                    d="M7.2089541666666666 15.511858333333333c0.437525 0.43752083333333336 1.1480666666666666 0.43752083333333336 1.5855916666666667 0l5.600312499999999 -5.600312499999999c0.43752083333333336 -0.437525 0.43752083333333336 -1.1480666666666666 0 -1.5855916666666667s-1.1480666666666666 -0.437525 -1.5855916666666667 0l-3.6892041666666664 3.692708333333333V1.2800624999999999C9.1200625 0.6605291666666666 8.619533333333333 0.15999999999999998 8 0.15999999999999998s-1.1200625 0.5005291666666667 -1.1200625 1.1200625v10.7351l-3.6892041666666664 -3.685708333333333c-0.437525 -0.437525 -1.1480666666666666 -0.437525 -1.5855916666666667 0s-0.437525 1.1480666666666666 0 1.5855916666666667l5.600312499999999 5.600312499999999Z"
                    fill="#000000"
                    strokeWidth="0.0417"
                  ></path>
                </svg>
              </h3>

              {isEditProfileOpen && (
                <form onSubmit={saveProfile} className={styles.form}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Display Name</label>

                    <input
                      className={styles.input}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter your display name"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>
                      Bio
                      <textarea
                        className={styles.textarea}
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={4}
                        placeholder="Tell us something about yourself..."
                      />
                    </label>
                  </div>

                  <div className={styles.formActions}>
                    <button
                      type="submit"
                      className={`${styles.primaryButton} ${styles.btn}`}
                      disabled={loading}
                    >
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={fetchProfile}
                      className={`${styles.secondaryButton} ${styles.btn}`}
                      disabled={loading}
                    >
                      Discard Changes
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
