"use client";
import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import styles from "./ProtectedRoute.module.css";

/**
 * ProtectedRoute component that checks authentication
 * Waits until auth.initialized is true (we've attempted to load session).
 * If initialized && no user => redirect to /auth/login.
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render when authenticated
 */
export default function ProtectedRoute({ children }) {
  const router = useRouter();
  const auth = useSelector((s) => s.auth);

  useEffect(() => {
    // Only redirect after we've attempted session load
    if (auth.initialized && !auth.user) {
      // Small delay for better UX
      const timer = setTimeout(() => {
        router.replace("/auth/login");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [auth.initialized, auth.user, router]);

  // Show loader while we're still initializing (avoid immediate redirect)
  if (!auth.initialized) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingCard}>
          <div className={styles.spinner}></div>
          <h1 className={styles.title}>Verifying Session</h1>
          <p className={styles.message}>
            Please wait while we check your authentication status...
          </p>
        </div>
      </div>
    );
  }

  // If initialized and user exists, render children; otherwise the effect will redirect
  if (!auth.user) {
    return (
      <div className={styles.container}>
        <div className={styles.redirectCard}>
          <div className={styles.redirectIcon}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
              />
            </svg>
          </div>
          <h1 className={styles.title}>Redirecting to Login</h1>
          <p className={styles.message}>
            You need to be signed in to access this page. Redirecting to
            login...
          </p>
        </div>
      </div>
    );
  }

  // User is authenticated, render children
  return <>{children}</>;
}
