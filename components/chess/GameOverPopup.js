// "use client";

// import React, { useEffect, useState } from "react";
// import styles from "./GameOverPopup.module.css";

// /**
//  * GameOverPopup
//  */
// export default function GameOverPopup({
//   visible = false,
//   reason = "",
//   message = "",
//   playerIsWinner = false,
//   winnerName = null,
//   loserName = null,
//   winner = null,
//   loser = null,
//   showAsSpectator = false,
//   onRematch = null,
//   onNewGame = null,
//   onClose = null,
// }) {
//   const [internalShow, setInternalShow] = useState(!!visible);

//   useEffect(() => {
//     if (visible) setInternalShow(true);
//   }, [visible]);

//   function getCupsInfo(p) {
//     if (!p) return null;
//     const current = p.cups ?? p.rating ?? p.elo ?? null;
//     const delta =
//       p.cupsDelta ??
//       p.cupsChange ??
//       p.deltaCups ??
//       (p.delta && p.delta.cups) ??
//       p.ratingDelta ??
//       p.delta;
//     if (typeof current !== "number" && typeof delta !== "number") return null;
//     if (typeof delta === "number") {
//       const sign = delta >= 0 ? `+${delta}` : `${delta}`;
//       const val = typeof current === "number" ? String(current) : null;
//       if (val) return `${val} (${sign})`;
//       return `${sign}`;
//     }
//     if (typeof current === "number") return String(current);
//     return null;
//   }

//   useEffect(() => {
//     let fired = false;
//     async function maybeConfetti() {
//       if (!internalShow || fired || !playerIsWinner) return;
//       fired = true;
//       try {
//         const confettiModule = await import("canvas-confetti");
//         const confetti = confettiModule.default || confettiModule;
//         confetti({ particleCount: 60, spread: 90, origin: { y: 0.2 } });
//         setTimeout(
//           () =>
//             confetti({ particleCount: 30, spread: 120, origin: { y: 0.2 } }),
//           220
//         );
//       } catch (e) {}
//     }
//     maybeConfetti();
//   }, [internalShow, playerIsWinner]);

//   if (!visible && !internalShow) return null;

//   // prefer real username/displayName; if raw is single-letter color, ignore it
//   function deriveDisplayName(rawName, obj) {
//     if (obj && (obj.displayName || obj.username))
//       return obj.displayName || obj.username;
//     if (!rawName) return null;
//     if (typeof rawName === "string" && /^[wbWB]$/.test(rawName.trim())) {
//       return null; // treat color as "no name"
//     }
//     return rawName;
//   }

//   const displayWinnerName = deriveDisplayName(winnerName, winner);
//   const displayLoserName = deriveDisplayName(loserName, loser);

//   const headline = playerIsWinner
//     ? "You won!"
//     : showAsSpectator
//     ? `${displayWinnerName || "Winner"} won`
//     : displayWinnerName
//     ? "You lost"
//     : "Game finished";

//   const subtitleSpectator = showAsSpectator
//     ? `${displayWinnerName || "Winner"} — ${displayLoserName || "Loser"}`
//     : message ||
//       reason ||
//       (playerIsWinner ? "Good game — congrats!" : "Good game");

//   const winnerCups = getCupsInfo(winner);
//   const loserCups = getCupsInfo(loser);

//   function handleBackdropClick() {
//     setInternalShow(false);
//     if (typeof onClose === "function") onClose();
//   }
//   function stopProp(e) {
//     e.stopPropagation();
//   }

//   return (
//     <div
//       className={styles.backdrop}
//       role="dialog"
//       aria-modal="true"
//       onClick={handleBackdropClick}
//     >
//       <div className={styles.card} onClick={stopProp}>
//         <div className={styles.header}>
//           <div
//             className={`${styles.badge} ${
//               playerIsWinner ? styles.badgeWinner : ""
//             }`}
//             aria-hidden
//           >
//             {playerIsWinner ? "🎉" : "♟️"}
//           </div>

//           <div className={styles.titleWrap}>
//             <div className={styles.title}>{headline}</div>
//             <div className={styles.subtitle}>
//               {showAsSpectator ? subtitleSpectator : subtitleSpectator}
//             </div>
//           </div>
//         </div>

//         {/* ALWAYS show labels for clarity; show real names only if available */}
//         <div className={styles.namesRow}>
//           <div className={styles.playerCard}>
//             <div className={styles.playerLabel}>Winner</div>
//             {displayWinnerName ? (
//               <div className={styles.playerName}>{displayWinnerName}</div>
//             ) : null}
//             {winnerCups ? (
//               <div className={`${styles.cups} ${styles.cupsWinner}`}>
//                 cups: {winnerCups}
//               </div>
//             ) : null}
//           </div>

//           <div className={styles.playerCard}>
//             <div className={styles.playerLabel}>Loser</div>
//             {displayLoserName ? (
//               <div className={styles.playerName}>{displayLoserName}</div>
//             ) : null}
//             {loserCups ? (
//               <div className={`${styles.cups} ${styles.cupsLoser}`}>
//                 cups: {loserCups}
//               </div>
//             ) : null}
//           </div>
//         </div>

//         {reason && (
//           <div className={styles.reason}>Reason: {String(reason)}</div>
//         )}

//         <div className={styles.actions}>
//           {typeof onRematch === "function" && (
//             <button
//               onClick={() => {
//                 try {
//                   onRematch();
//                 } catch (e) {}
//               }}
//               className={`${styles.btn} ${styles.btnPrimary}`}
//             >
//               Play again
//             </button>
//           )}

//           {typeof onNewGame === "function" && (
//             <button
//               onClick={() => {
//                 try {
//                   onNewGame();
//                 } catch (e) {}
//               }}
//               className={`${styles.btn} ${styles.btnSecondary}`}
//             >
//               New game
//             </button>
//           )}

//           <button
//             onClick={() => {
//               setInternalShow(false);
//               if (typeof onClose === "function") onClose();
//             }}
//             className={`${styles.btn} ${styles.btnSecondary}`}
//           >
//             Close
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }
