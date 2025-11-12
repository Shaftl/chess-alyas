"use client";
import React, { useEffect, useRef, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { logoutUser } from "@/store/slices/authSlice";
import { useRouter } from "next/navigation";
import styles from "./AccountDropdown.module.css";

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
      setBusy(false);
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
              src="https://ik.imagekit.io/ehggwul6k/User-Circle-Single--Streamline-Flex%20(1).png?updatedAt=1762626281362"
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
                    src="https://ik.imagekit.io/ehggwul6k/User-Circle-Single--Streamline-Flex%20(1).png?updatedAt=1762626281362"
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
            className={styles.profileButton}
            role="menuitem"
          >
            Profile
          </button>

          <div className={styles.spacer} />

          <button
            onClick={handleLogout}
            disabled={busy}
            className={styles.signOutButton}
            role="menuitem"
          >
            {busy ? "Signing out..." : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
