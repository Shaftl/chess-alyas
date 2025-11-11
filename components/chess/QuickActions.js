// components/chess/QuickActions.js
import React from "react";
import styles from "./QuickActions.module.css";

export default function QuickActions({
  onOfferDraw,
  onResign,
  onCopyPGN,
  onLeave,
  onPlayAgain,
  myPendingRematch,
  gameState,
  gameOverState = null, // <-- accept client-side game over state
}) {
  // Determine if this room had two players seated (was a real match)
  const players = (gameState && gameState.players) || [];
  const seatedCount = (players || []).filter(
    (p) => p && (p.color === "w" || p.color === "b")
  ).length;

  // server-side finished check (tolerant)
  const serverFinished = !!(
    gameState &&
    (gameState.finished || gameState.gameOver || gameState.finishedAt)
  );

  // client-side finished check (e.g. local checkmate detection)
  const clientFinished = !!(gameOverState && gameOverState.over);

  // Final finished detection: either server or client indicates finished
  const isFinished = serverFinished || clientFinished;

  // final condition: if game finished and there were two players -> show Play Again
  const showPlayAgain = isFinished && seatedCount === 2;

  return (
    <div className={styles.sidebarSection}>
      <div className={styles.actionGrid}>
        {showPlayAgain ? (
          // Play again button (single button replaces Offer Draw + Resign)
          <div
            className={`${styles.actionButton} ${styles.rematchBtn} ${
              myPendingRematch ? styles.disabled : ""
            }`}
            onClick={() => {
              if (!myPendingRematch && typeof onPlayAgain === "function") {
                onPlayAgain();
              }
            }}
            role="button"
            aria-disabled={!!myPendingRematch}
            title={
              myPendingRematch ? "Rematch pending..." : "Request a rematch"
            }
          >
            <div className={styles.actionIcon}>🔁</div>
            <div className={styles.actionLabel}>
              {myPendingRematch ? "Rematch pending" : "Play again"}
            </div>
          </div>
        ) : (
          // Regular controls while game is ongoing / not a finished match
          <>
            {/* hide draw/resign when finished (isFinished true) */}
            {!isFinished && (
              <>
                <div
                  className={styles.actionButton}
                  onClick={() =>
                    typeof onOfferDraw === "function" && onOfferDraw()
                  }
                >
                  <div className={styles.actionIcon}>🤝</div>
                  <div className={styles.actionLabel}>Offer Draw</div>
                </div>

                <div
                  className={styles.actionButton}
                  onClick={() => typeof onResign === "function" && onResign()}
                >
                  <div className={styles.actionIcon}>🏳️</div>
                  <div className={styles.actionLabel}>Resign</div>
                </div>
              </>
            )}
          </>
        )}

        {/* Leave (always available) */}
        {/* <div className={styles.actionButton} onClick={onLeave}>
          <div className={styles.actionIcon}>🚪</div>
          <div className={styles.actionLabel}>Leave</div>
        </div> */}

        {/* optional utility: copy PGN */}
        {/* <div className={styles.actionButton} onClick={onCopyPGN}>
          <div className={styles.actionIcon}>📋</div>
          <div className={styles.actionLabel}>Copy PGN</div>
        </div> */}
      </div>
    </div>
  );
}
