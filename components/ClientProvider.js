"use client";

import { Provider } from "react-redux";
import { store } from "@/store/store";
import { useEffect } from "react";
import { loadUserFromCookie } from "@/store/slices/authSlice";

/**
 * Wraps children in Redux Provider and loads user from cookie-based session on mount.
 */
export default function ClientProvider({ children }) {
  useEffect(() => {
    // attempt to load user on client startup using httpOnly cookie
    store.dispatch(loadUserFromCookie());
  }, []);

  return <Provider store={store}>{children}</Provider>;
}
