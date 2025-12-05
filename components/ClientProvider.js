"use client";

import React, { useEffect } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import { store } from "@/store/store";
import { loadUserFromCookie } from "@/store/slices/authSlice";
import { backendOrigin } from "@/lib/chessUtils";

/**
 * Inner provider uses hooks (must be inside <Provider>) to:
 *  - dispatch loadUserFromCookie on startup
 *  - watch auth.user and set/remove --bg-image-url CSS var so background persists across refreshes
 *  - listen for uploader event 'user:background-updated' and update CSS var immediately
 */
function InnerProvider({ children }) {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth && s.auth.user);

  useEffect(() => {
    // attempt to load user on client startup using httpOnly cookie
    dispatch(loadUserFromCookie());

    // listen for BackgroundUploader's event (uploader already sets CSS var immediately,
    // but we also respond here so other parts can react if needed)
    const onBgUpdated = (ev) => {
      try {
        const url = ev?.detail?.url;
        if (url) {
          document.documentElement.style.setProperty(
            "--bg-image-url",
            `url("${url}")`
          );
        }
      } catch (e) {
        /* ignore */
      }
    };
    window.addEventListener("user:background-updated", onBgUpdated);
    return () =>
      window.removeEventListener("user:background-updated", onBgUpdated);
  }, [dispatch]);

  useEffect(() => {
    // when user changes (login, load from cookie, logout, profile update), sync CSS var
    try {
      if (user) {
        // prefer backgroundUrlAbsolute if provided by backend/Redeux; otherwise fallback to backgroundUrl
        let bg = user.backgroundUrlAbsolute || user.backgroundUrl || null;

        if (bg) {
          // make absolute if it's a relative path
          if (!/^https?:\/\//i.test(bg)) {
            const base = backendOrigin();
            bg = `${base.replace(/\/$/, "")}${
              bg.startsWith("/") ? "" : "/"
            }${bg}`;
          }
          document.documentElement.style.setProperty(
            "--bg-image-url",
            `url("${bg}")`
          );
        } else {
          // no user bg -> remove var so body::before uses default url("/bg.png")
          document.documentElement.style.removeProperty("--bg-image-url");
        }
      } else {
        // logged out or no user -> remove custom bg
        document.documentElement.style.removeProperty("--bg-image-url");
      }
    } catch (err) {
      // fail-safe: do nothing on errors
    }
  }, [user]);

  return <>{children}</>;
}

export default function ClientProvider({ children }) {
  return (
    <Provider store={store}>
      <InnerProvider>{children}</InnerProvider>
    </Provider>
  );
}
