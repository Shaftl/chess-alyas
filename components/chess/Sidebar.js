import React from "react";
import QuickActions from "@/components/chess/QuickActions";
import styles from "./Sidebar.module.css";
import MoveHistory from "./MoveHistory";

/**
 * Sidebar: game status, quick actions, and sound toggles.
 * Props:
 *  - gameState, statusMsg, gameOverState
 *  - offerDraw, resign, copyPGNToClipboard, leaveRoom, sendPlayAgain, myPendingRematch
 *  - moveSoundEnabled, tickSoundEnabled, setMoveSoundEnabled, setTickSoundEnabled
 */
export default function Sidebar({
  gameState,
  statusMsg,
  gameOverState,
  offerDraw,
  resign,
  copyPGNToClipboard,
  leaveRoom,
  sendPlayAgain,
  myPendingRematch,
  moveSoundEnabled,
  tickSoundEnabled,
  setMoveSoundEnabled,
  setTickSoundEnabled,

  moveHistory,
  analysisIndex,
  jumpToMove,
  startReplay,
  stopReplay,
  getPieceImageUrl,
}) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarSection}>
        <div className={styles.gameStatus}>
          <div className={styles.sidebarTitle}>Game Status</div>

          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>Room</span>
            <span className={styles.statusValue}>
              {gameState.roomId || "-"}
            </span>
          </div>
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>Status</span>
            <span className={styles.statusValue}>{statusMsg}</span>
          </div>
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>Game State</span>
            <span className={styles.statusValue}>
              {gameOverState.over
                ? "Finished"
                : gameOverState.text || "Ongoing"}
            </span>
          </div>
        </div>
      </div>

      <QuickActions
        onOfferDraw={offerDraw}
        onResign={resign}
        onCopyPGN={copyPGNToClipboard}
        onLeave={leaveRoom}
        onPlayAgain={sendPlayAgain}
        myPendingRematch={myPendingRematch}
        gameState={gameState}
        gameOverState={gameOverState} // <-- added this prop
      />

      <MoveHistory
        moveHistory={moveHistory}
        analysisIndex={analysisIndex}
        onJumpToMove={jumpToMove}
        onStartReplay={startReplay}
        onStopReplay={stopReplay}
        getPieceImageUrl={getPieceImageUrl}
      />

      {/* <div className={styles.sidebarSection}>
        <div className={styles.sidebarTitle}>Sound Settings</div>
        <div className={styles.soundControls}>
          <label className={styles.soundToggle}>
            <div className={styles.toggleInfo}>
              <div className={styles.toggleLabel}>Move Sounds</div>
              <div className={styles.toggleDescription}>
                Play sound on moves
              </div>
            </div>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={moveSoundEnabled}
                onChange={(e) => setMoveSoundEnabled(e.target.checked)}
              />
              <span className={styles.slider}></span>
            </label>
          </label>

          <label className={styles.soundToggle}>
            <div className={styles.toggleInfo}>
              <div className={styles.toggleLabel}>Timer Tick</div>
              <div className={styles.toggleDescription}>
                Clock countdown sound
              </div>
            </div>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={tickSoundEnabled}
                onChange={(e) => setTickSoundEnabled(e.target.checked)}
              />
              <span className={styles.slider}></span>
            </label>
          </label>
        </div>
      </div> */}
    </aside>
  );
}
