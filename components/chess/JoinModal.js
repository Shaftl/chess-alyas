import React from "react";
import styles from "./JoinModal.module.css";

/**
 * Join modal UI component.
 * Props:
 *  - open (bool)
 *  - onClose()
 *  - joinInput, setJoinInput
 *  - checkRoomId(roomId)
 *  - joinChecking (bool)
 *  - joinResult (object)
 *  - confirmJoinRoom(roomIdOverride)
 *  - API (string)
 */
export default function JoinModal({
  open,
  onClose,
  joinInput,
  setJoinInput,
  checkRoomId,
  joinChecking,
  joinResult,
  confirmJoinRoom,
  API,
}) {
  if (!open) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-modal-title"
      >
        <div className={styles.modalHeader}>
          <div id="join-modal-title" className={styles.modalTitle}>
            Join Room
          </div>
          <button
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.modalLeft}>
            <div className={styles.joinInputWrapper}>
              <input
                className={styles.roomInput}
                value={joinInput}
                onChange={(e) => {
                  setJoinInput(e.target.value);
                }}
                placeholder="Enter room id..."
                aria-label="Room id"
              />
            </div>

            <div className={styles.spacer12} />
            <div className={styles.roomInfo}>
              {joinResult ? (
                joinResult.ok ? (
                  <div>
                    <div className={styles.roomInfoRow}>
                      <p>
                        <strong>Room</strong>
                      </p>
                      <p>{joinResult.room.roomId}</p>
                    </div>
                    <div className={styles.roomInfoRow}>
                      <p>
                        <strong>Players</strong>
                      </p>
                      <p>
                        {(joinResult.room.players || [])
                          .map((p) => p.username || p.id || "guest")
                          .join(", ") || "none"}
                      </p>
                    </div>
                    <div className={styles.roomInfoRow}>
                      <p>
                        <strong>Finished</strong>
                      </p>
                      <p>
                        {joinResult.room.finished ? (
                          <span className={styles.roomFinishedBadge}>
                            Finished
                          </span>
                        ) : (
                          "No"
                        )}
                      </p>
                    </div>
                    <p className={styles.roomInfoMeta}>
                      {joinResult.room.finished
                        ? "This room is finished — you cannot join it."
                        : "Room found — click Join to enter."}
                    </p>
                  </div>
                ) : (
                  <div className={styles.roomError}>{joinResult.error}</div>
                )
              ) : (
                <div className={styles.modalMeta}>
                  Enter a room id and click Check to validate.
                </div>
              )}
            </div>
          </div>

          <div className={styles.modalRight}>
            <div className={styles.quickActionsColumn}>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => {
                  if (joinInput && !joinResult) checkRoomId(joinInput);
                }}
                disabled={joinChecking}
              >
                {joinChecking ? "Checking..." : "Check"}
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => confirmJoinRoom(joinInput.trim())}
                disabled={
                  !joinResult ||
                  !joinResult.ok ||
                  joinResult.room?.finished ||
                  joinChecking
                }
                title={
                  joinResult?.room?.finished
                    ? "Room finished — cannot join"
                    : !joinResult
                    ? "Check room first"
                    : ""
                }
              >
                Join
              </button>
              <button className={styles.btn} onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
