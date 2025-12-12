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
                width="32"
                height="32"
                fill="#000000"
                viewBox="0 0 256 256"
              >
                <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,85.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z"></path>
              </svg>
              <span> {msg.text}</span>{" "}
            </div>
          ) : (
            <div className={styles.msgBox}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                fill="#000000"
                viewBox="0 0 256 256"
              >
                <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm37.66,130.34a8,8,0,0,1-11.32,11.32L128,139.31l-26.34,26.35a8,8,0,0,1-11.32-11.32L116.69,128,90.34,101.66a8,8,0,0,1,11.32-11.32L128,116.69l26.34-26.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path>
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
                  // <div className={styles.avatarFallback}>
                  //   {(profile.displayName || profile.username || "U")
                  //     .charAt(0)
                  //     .toUpperCase()}
                  // </div>
                  <img
                    src="https://ik.imagekit.io/ehggwul6k/Chess-app-avaters/1765541858886_user-blue-gradient_78370-4692_O6GdbvkG1.avif"
                    alt="avatar"
                    className={styles.avatarImg}
                  />
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
                      width="32"
                      height="32"
                      fill="#000000"
                      viewBox="0 0 256 256"
                    >
                      <path d="M208,56H180.28L166.65,35.56A8,8,0,0,0,160,32H96a8,8,0,0,0-6.65,3.56L75.71,56H48A24,24,0,0,0,24,80V192a24,24,0,0,0,24,24H208a24,24,0,0,0,24-24V80A24,24,0,0,0,208,56Zm-44,76a36,36,0,1,1-36-36A36,36,0,0,1,164,132Z"></path>
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
                    width="32"
                    height="32"
                    fill="#000000"
                    viewBox="0 0 256 256"
                  >
                    <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm-4,48a12,12,0,1,1-12,12A12,12,0,0,1,124,72Zm12,112a16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40a8,8,0,0,1,0,16Z"></path>
                  </svg>
                  <div className={`${styles.detailItemBio}`}>
                    <span className={styles.detailLabel}>Bio - </span>{" "}
                    <span className={styles.detailValue}>{bio}</span>
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
                    <span className={styles.detailValue}>{profile.email}</span>
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
                  width="32"
                  height="32"
                  fill="#000000"
                  viewBox="0 0 256 256"
                >
                  <path d="M227.32,73.37,182.63,28.69a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31l83.67-83.66,3.48,13.9-36.8,36.79a8,8,0,0,0,11.31,11.32l40-40a8,8,0,0,0,2.11-7.6l-6.9-27.61L227.32,96A16,16,0,0,0,227.32,73.37ZM192,108.69,147.32,64l24-24L216,84.69Z"></path>
                </svg>
                <span>Edit Profile</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  fill="#000000"
                  viewBox="0 0 256 256"
                >
                  <path d="M205.66,149.66l-72,72a8,8,0,0,1-11.32,0l-72-72A8,8,0,0,1,56,136h64V40a8,8,0,0,1,16,0v96h64a8,8,0,0,1,5.66,13.66Z"></path>
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
