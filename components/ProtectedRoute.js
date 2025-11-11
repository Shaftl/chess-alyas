"use client";
import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { useRouter } from "next/navigation";

/**
 * Waits until auth.initialized is true (we've attempted to load session).
 * If initialized && no user => redirect to /auth/login.
 */
export default function ProtectedRoute({ children }) {
  const router = useRouter();
  const auth = useSelector((s) => s.auth);

  useEffect(() => {
    // Only redirect after we've attempted session load
    if (auth.initialized && !auth.user) {
      router.replace("/auth/login");
    }
  }, [auth.initialized, auth.user, router]);

  // Show loader while we're still initializing (avoid immediate redirect)
  if (!auth.initialized) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div>Checking authentication…</div>
      </div>
    );
  }

  // If initialized and user exists, render children; otherwise the effect will redirect
  if (!auth.user) {
    // optionally show a small fallback while redirect happens
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div>Redirecting to sign in…</div>
      </div>
    );
  }

  return <>{children}</>;
}
