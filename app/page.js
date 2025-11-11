"use client";

import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  const router = useRouter();
  const auth = useSelector((s) => s.auth);

  useEffect(() => {
    if (auth.initialized && auth.user) {
      router.replace("/play");
    }
  }, [auth.initialized, auth.user, router]);

  // While checking auth, show nothing or a small loader
  if (!auth.initialized) return null;

  // If already logged in, we'll redirect, so don't render the home UI
  if (auth.user) return null;

  return (
    <div className={styles.page}>
      <img src="/bg.jpg" alt="Chess background" />
      <main className={styles.main}>
        <div className={styles.brand}>
          {/* <div className={styles.logo} aria-hidden /> */}
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>
              <span className={styles.titleMain}>Chess</span>
              <span className={styles.titleAccent}>Master</span>
            </h1>
            <p className={styles.subtitle}>
              Fast, clean, and modern online chess — real-time matches and
              spectator mode.
            </p>
          </div>
        </div>

        <section className={styles.features}>
          <div className={styles.feature}>
            <div className={styles.featureIcon}>⚡</div>
            <h4>Real-time Play</h4>
            <p>Low-latency matches and smooth gameplay.</p>
          </div>

          <div className={styles.feature}>
            <div className={styles.featureIcon}>👀</div>
            <h4>Spectator Mode</h4>
            <p>Watch live games with move history and chat.</p>
          </div>

          <div className={styles.feature}>
            <div className={styles.featureIcon}>🔐</div>
            <h4>Secure Auth</h4>
            <p>Simple and safe login — save progress and avatars.</p>
          </div>
        </section>

        <nav className={styles.nav}>
          <Link href="/auth/login" className={styles.ctaPrimary}>
            Sign In
          </Link>
          <Link href="/auth/register" className={styles.btn}>
            Create Account
          </Link>
        </nav>
      </main>
    </div>
  );
}
