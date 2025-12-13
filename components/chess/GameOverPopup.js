"use client";

import React, { useEffect, useState, useRef } from "react";
import styles from "./GameOverPopup.module.css";

/**
 * GameOverPopup (confetti: more realistic)
 *
 * - Still: shows only for players (spectators => null)
 * - Adds a full-screen canvas used by canvas-confetti for better visuals
 * - Fires multiple gentle rain waves for a realistic look (no fireworks)
 */
export default function GameOverPopup({
  visible = false,
  reason = "",
  message = "",
  playerIsWinner = false,
  winnerName = null,
  loserName = null,
  winner = null,
  loser = null,
  showAsSpectator = false,
  onRematch = null,
  onNewGame = null,
  onClose = null,
}) {
  // If user is a spectator — do not show anything at all.
  if (showAsSpectator) return null;

  const [internalShow, setInternalShow] = useState(!!visible);
  const canvasRef = useRef(null);

  useEffect(() => {
    setInternalShow(!!visible);
  }, [visible]);

  // realistic confetti routine (gentle rain, no fireworks)
  useEffect(() => {
    let fired = false;
    let cancelled = false;

    function sleep(ms) {
      return new Promise((res) => setTimeout(res, ms));
    }

    async function fireRealisticConfetti() {
      if (!internalShow || fired || !playerIsWinner) return;
      fired = true;

      try {
        const confettiModule = await import("canvas-confetti");
        const confetti = confettiModule.default || confettiModule;

        // create a confetti instance that draws to our canvas (resize enabled)
        const myConfetti = confetti.create(canvasRef.current, {
          resize: true,
          useWorker: true,
        });

        const colors = [
          "#FFD700", // gold
          "#FF5E3A", // orange
          "#8EFFC1", // mint
          "#5AD0FF", // sky
          "#C27BFF", // purple
          "#FFFFFF", // white sparkle
        ];

        // Gentle rain: a few soft waves emitted from random x origins across the top.
        const waves = 3 + Math.floor(Math.random() * 2); // 3 or 4 waves
        for (let w = 0; w < waves && !cancelled; w++) {
          const originX = 0.12 + Math.random() * 0.76; // 0.12..0.88
          myConfetti({
            particleCount: 28 + Math.round(Math.random() * 20), // 28..48
            angle: 90, // straight down
            spread: 50 + Math.round(Math.random() * 60), // 50..110
            startVelocity: 10 + Math.round(Math.random() * 18), // low-ish
            ticks: 350 + Math.round(Math.random() * 120),
            gravity: 0.28 + Math.random() * 0.32, // soft fall
            scalar: 0.6 + Math.random() * 0.8,
            drift: (Math.random() - 0.5) * 0.25,
            colors,
            shapes: ["square", "circle"],
            origin: { x: originX, y: 0 },
          });

          // short randomized pause between waves for organic feel
          // keeps the rain continuous but not mechanical
          await sleep(140 + Math.round(Math.random() * 140));
        }

        // Light finishing drizzle (smaller particles)
        for (let j = 0; j < 2 && !cancelled; j++) {
          myConfetti({
            particleCount: 12 + Math.round(Math.random() * 10),
            angle: 90,
            spread: 80 + Math.round(Math.random() * 40),
            startVelocity: 8 + Math.round(Math.random() * 12),
            ticks: 300 + Math.round(Math.random() * 100),
            gravity: 0.24 + Math.random() * 0.3,
            scalar: 0.45 + Math.random() * 0.6,
            drift: (Math.random() - 0.5) * 0.18,
            colors,
            shapes: ["circle"],
            origin: { x: 0.3 + Math.random() * 0.4, y: 0 },
          });
          await sleep(160 + Math.round(Math.random() * 100));
        }
      } catch (e) {
        // visual-only; ignore failures
      }
    }

    fireRealisticConfetti();

    return () => {
      cancelled = true;
    };
  }, [internalShow, playerIsWinner]);

  // prefer real username/displayName; if raw is single-letter color, ignore it
  function deriveDisplayName(rawName, obj) {
    if (obj && (obj.displayName || obj.username))
      return obj.displayName || obj.username;
    if (!rawName) return null;
    if (typeof rawName === "string" && /^[wbWB]$/.test(rawName.trim())) {
      return null; // treat color as "no name"
    }
    return rawName;
  }

  const displayWinnerName = deriveDisplayName(winnerName, winner);

  const headline = playerIsWinner ? "You won!" : "You lost";

  const shortReason = reason || message || "";
  const subtitle = playerIsWinner
    ? shortReason
      ? `Won by ${shortReason}`
      : "Good game — congrats!"
    : displayWinnerName
    ? shortReason
      ? `${displayWinnerName} won by ${shortReason}`
      : `${displayWinnerName} won`
    : shortReason
    ? `Opponent won by ${shortReason}`
    : "Game finished";

  function handleBackdropClick() {
    setInternalShow(false);
    if (typeof onClose === "function") onClose();
  }
  function stopProp(e) {
    e.stopPropagation();
  }

  if (!internalShow) return null;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      onClick={handleBackdropClick}
      style={{ position: "fixed", inset: 0 }}
    >
      {/* confetti canvas (pointer-events none so clicks pass through to backdrop) */}
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 9998,
        }}
      />

      <div
        className={styles.card}
        onClick={stopProp}
        // ensure modal card sits above confetti canvas
        style={{ zIndex: 9999 }}
      >
        <div className={styles.header}>
          <div
            className={`${styles.badge} ${
              playerIsWinner ? styles.badgeWinner : ""
            }`}
            aria-hidden
          >
            {playerIsWinner ? (
              <img src="/winner.png" width={50} />
            ) : (
              <img src="/loser.png" width={40} />
            )}
          </div>

          <div className={styles.titleWrap}>
            <div className={styles.title}>{headline}</div>
            <div className={styles.subtitle}>{subtitle}</div>
          </div>
        </div>

        <div className={styles.actions}>
          {typeof onRematch === "function" && (
            <button
              onClick={() => {
                try {
                  onRematch();
                } catch (e) {}
              }}
              className={`${styles.btn} ${styles.btnPrimary}`}
            >
              Play again
            </button>
          )}

          {typeof onNewGame === "function" && (
            <button
              onClick={() => {
                try {
                  onNewGame();
                } catch (e) {}
              }}
              className={`${styles.btn} ${styles.btnSecondary}`}
            >
              New game
            </button>
          )}

          <button
            onClick={() => {
              setInternalShow(false);
              if (typeof onClose === "function") onClose();
            }}
            className={` ${styles.btnClose}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              fill="#000000"
              viewBox="0 0 256 256"
            >
              <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm37.66,130.34a8,8,0,0,1-11.32,11.32L128,139.31l-26.34,26.35a8,8,0,0,1-11.32-11.32L116.69,128,90.34,101.66a8,8,0,0,1,11.32-11.32L128,116.69l26.34-26.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
