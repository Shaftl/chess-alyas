// File: frontend/components/Header.jsx
"use client";
import React, { useState } from "react";
import Link from "next/link";
import styles from "./Header.module.css";
import AccountDropdown from "./AccountDropdown";
import Notifications from "./Notifications";
import BackgroundUploader from "./BackgroundUploader";

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
              {/* <img src="/logo.png" alt="logo" /> */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                fill="#000000"
                viewBox="0 0 256 256"
              >
                <path d="M202.05,55A103.24,103.24,0,0,0,128,24h-8a8,8,0,0,0-8,8V59.53L11.81,121.19a8,8,0,0,0-2.59,11.05l13.78,22,.3.43a31.84,31.84,0,0,0,31.34,12.83c13.93-2.36,38.62-6.54,61.4,3.29l-26.6,36.57A84.71,84.71,0,0,1,69.34,194,8,8,0,1,0,58.67,206a103.32,103.32,0,0,0,69.26,26l2.17,0a104,104,0,0,0,72-177ZM124,112a12,12,0,1,1,12-12A12,12,0,0,1,124,112Z"></path>
              </svg>
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
        <BackgroundUploader>Hi</BackgroundUploader>
      </div>
    </header>
  );
}
