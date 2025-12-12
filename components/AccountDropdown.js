// frontend/components/AccountDropdown.jsx
"use client";
import React, { useEffect, useRef, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { logoutUser } from "@/store/slices/authSlice";
import { useRouter } from "next/navigation";
import styles from "./AccountDropdown.module.css";
import BackgroundUploader from "./BackgroundUploader";
import { disconnectSocket } from "@/lib/socketClient"; // <<-- ADDED

/**
 * AccountDropdown
 * - shows avatar or initial
 * - menu: Profile -> /profile, Logout -> clears server cookie via logoutUser thunk
 *
 * Usage: place <AccountDropdown /> in your header.
 */

// compute backend base (no trailing slash)
const BACKEND_BASE =
  (process.env.NEXT_PUBLIC_BACKEND_BASE_URL &&
    process.env.NEXT_PUBLIC_BACKEND_BASE_URL.replace(/\/$/, "")) ||
  (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/api\/?$/, "");

function normalizeBackendUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const url = rawUrl.trim();

  // absolute URL -> if it's pointing to localhost rewrite to BACKEND_BASE; otherwise return as-is
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url);
      if (
        u.hostname === "localhost" ||
        u.hostname === "127.0.0.1" ||
        u.hostname.endsWith(".local")
      ) {
        // rewrite to BACKEND_BASE keeping path/search/hash
        return `${BACKEND_BASE}${u.pathname}${u.search}${u.hash}`;
      }
      return url;
    } catch (e) {
      // fall through
    }
  }

  // relative path -> prefix BACKEND_BASE
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

export default function AccountDropdown() {
  const auth = useSelector((s) => s.auth);
  const user = auth?.user || null;
  const dispatch = useDispatch();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  // close on outside click
  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // small helper to navigate and close
  function go(path) {
    setOpen(false);
    router.push(path);
  }

  async function handleLogout() {
    setBusy(true);
    try {
      // dispatch thunk that calls /api/auth/logout and clears server cookie
      await dispatch(logoutUser());
    } catch (err) {
      // ignore — we still redirect/clear UI
    } finally {
      // ensure socket is disconnected so server receives the disconnect
      try {
        disconnectSocket();
      } catch (e) {
        console.warn("disconnectSocket failed during logout:", e);
      }

      setBusy(false);
      setOpen(false);
      // ensure client navigates to login
      router.push("/auth/login");
    }
  }

  // avatar/initial rendering
  const avatar = avatarUrlFromUser(user) || null;

  const initial = (user?.displayName || user?.username || "U")
    .charAt(0)
    .toUpperCase();

  return (
    <div ref={ref} className={styles.container}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className={styles.trigger}
      >
        <div className={styles.avatarSmall}>
          {avatar ? (
            <img src={avatar} alt="avatar" className={styles.avatarImg} />
          ) : (
            <img
              src="https://ik.imagekit.io/ehggwul6k/Chess-app-avaters/1765541858886_user-blue-gradient_78370-4692_O6GdbvkG1.avif"
              alt="avatar"
              className={styles.avatarImg}
            />
          )}
        </div>
      </button>

      {open && (
        <div role="menu" aria-label="Account menu" className={styles.menu}>
          <div className={styles.menuHeader}>
            <div className={styles.menuUserRow}>
              <div className={styles.avatarLarge}>
                {avatar ? (
                  <img src={avatar} alt="avatar" className={styles.avatarImg} />
                ) : (
                  <img
                    src="https://ik.imagekit.io/ehggwul6k/Chess-app-avaters/1765541858886_user-blue-gradient_78370-4692_O6GdbvkG1.avif"
                    alt="avatar"
                    className={styles.avatarImg}
                  />
                )}
              </div>

              <div className={styles.userInfo}>
                <div className={styles.userName}>
                  {user?.displayName || user?.username}
                </div>
                <div className={styles.userEmail}>{user?.email}</div>
              </div>
            </div>
          </div>

          <button
            onClick={() => go("/profile")}
            className={`${styles.profileButton} flexWG`}
            role="menuitem"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              fill="#000000"
              viewBox="0 0 256 256"
            >
              <path d="M230.93,220a8,8,0,0,1-6.93,4H32a8,8,0,0,1-6.92-12c15.23-26.33,38.7-45.21,66.09-54.16a72,72,0,1,1,73.66,0c27.39,8.95,50.86,27.83,66.09,54.16A8,8,0,0,1,230.93,220Z"></path>
            </svg>
            Profile
          </button>

          <BackgroundUploader className={`${styles.profileButton} flexWG`}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              fill="#000000"
              viewBox="0 0 256 256"
            >
              <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM156,88a12,12,0,1,1-12,12A12,12,0,0,1,156,88Zm60,112H40V160.69l46.34-46.35a8,8,0,0,1,11.32,0h0L165,181.66a8,8,0,0,0,11.32-11.32l-17.66-17.65L173,138.34a8,8,0,0,1,11.31,0L216,170.07V200Z"></path>
            </svg>
            Change Background
          </BackgroundUploader>

          <div className={styles.spacer} />

          <button
            onClick={handleLogout}
            disabled={busy}
            className={`${styles.signOutButton} flexWG`}
            role="menuitem"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              fill="#000000"
              viewBox="0 0 256 256"
            >
              <path d="M120,216a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V40a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H56V208h56A8,8,0,0,1,120,216Zm109.66-93.66-40-40A8,8,0,0,0,176,88v32H112a8,8,0,0,0,0,16h64v32a8,8,0,0,0,13.66,5.66l40-40A8,8,0,0,0,229.66,122.34Z"></path>
            </svg>
            {busy ? "Signing out..." : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
