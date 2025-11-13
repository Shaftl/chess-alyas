// File: frontend/components/Header.jsx
"use client";
import React, { useState } from "react";
import Link from "next/link";
import styles from "./Header.module.css";
import AccountDropdown from "./AccountDropdown";
import Notifications from "./Notifications";

export default function Header({ onMenuToggle, isSideNavOpen }) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <button
          className={styles.menuButton}
          onClick={onMenuToggle}
          aria-label="Toggle menu"
          aria-expanded={isSideNavOpen}
        >
          <span className={styles.hamburger}>
            <span
              className={`${styles.hamburgerLine} ${
                isSideNavOpen ? styles.hamburgerLineActive : ""
              }`}
            ></span>
            <span
              className={`${styles.hamburgerLine} ${
                isSideNavOpen ? styles.hamburgerLineActive : ""
              }`}
            ></span>
            <span
              className={`${styles.hamburgerLine} ${
                isSideNavOpen ? styles.hamburgerLineActive : ""
              }`}
            ></span>
          </span>
        </button>

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
      </div>

      <div className={styles.accountSection}>
        <Notifications />
        <AccountDropdown />
      </div>
    </header>
  );
}
