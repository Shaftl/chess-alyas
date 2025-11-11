// File: frontend/components/Header.jsx
"use client";
import React from "react";
import Link from "next/link";
import styles from "./Header.module.css";
import AccountDropdown from "./AccountDropdown";
import Notifications from "./Notifications";

export default function Header() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logoLink}>
        <div className={styles.logoContainer}>
          <div className={styles.logoIcon}>
            <img src="/logo.png" alt="logo" />
          </div>
          <div className={styles.logoText}>
            Chess<span>Master</span>
          </div>
        </div>
      </Link>

      <div className={styles.accountSection}>
        {/* Notifications placed before account dropdown */}
        <Notifications />
        <AccountDropdown />
      </div>
    </header>
  );
}
