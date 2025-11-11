"use client";

import React, { useEffect, useRef } from "react";
import styles from "./DrawModal.module.css";

export default function DrawModal({
  drawOffer,
  onAccept,
  onDecline,
  isOfferToYou,
}) {
  if (!drawOffer || !isOfferToYou) return null;

  const name =
    drawOffer?.from?.displayName || drawOffer?.from?.username || "Opponent";

  const acceptRef = useRef(null);

  useEffect(() => {
    // focus primary action for keyboard users
    acceptRef.current?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") {
        onDecline && onDecline();
      } else if (e.key === "Enter") {
        onAccept && onAccept();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onAccept, onDecline]);

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawModalTitle"
    >
      <div className={styles.modal} tabIndex={-1}>
        <header className={styles.header}>
          <h2 id="drawModalTitle" className={styles.title}>
            Draw Offer
          </h2>
        </header>

        <div className={styles.content}>
          <p className={styles.message}>
            <span className={styles.playerName}>{name}</span> offered a draw
          </p>
        </div>

        <footer className={styles.actions}>
          <button
            ref={acceptRef}
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onAccept}
            aria-label="Accept draw offer"
          >
            Accept
          </button>

          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={onDecline}
            aria-label="Decline draw offer"
          >
            Decline
          </button>
        </footer>
      </div>
    </div>
  );
}
