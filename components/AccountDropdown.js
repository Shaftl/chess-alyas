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

  const avatar = `${process.env.NEXT_PUBLIC_API_URL}${user?.avatarUrl}` || null;

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
