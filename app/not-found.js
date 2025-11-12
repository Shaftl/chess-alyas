"use client";

// app/not-found.jsx
import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* <div className={styles.illustration}>
          <div className={styles.chessIcon}></div>
        </div> */}

        <div className={styles.errorCode}>404</div>

        <h1 className={styles.title}>Checkmate - Page Not Found</h1>

        <p className={styles.message}>
          The page you're looking for seems to have been captured or moved. It
          might have been retired or the URL could be incorrect.
        </p>

        <div className={styles.actions}>
          <Link href="/" className={`${styles.btn} ${styles.primary}`}>
            🏠 Return Home
          </Link>
          <Link href="/play" className={styles.btn}>
            ♟️ Play Chess
          </Link>
          <button onClick={() => window.history.back()} className={styles.btn}>
            ↩️ Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
