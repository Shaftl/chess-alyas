import React from "react";
import styles from "./RematchModal.module.css";

export default function RematchModal({
  rematchPending,
  myPendingRematch,
  onAccept = () => {},
  onDecline = () => {},
  onCancelRequest = () => {},
  mySocketId,
  myUserId,
}) {
  // Nothing to show
  if (!rematchPending && !myPendingRematch) return null;

  const initiatorSocketId = rematchPending?.initiatorSocketId;
  const initiatorUserId =
    rematchPending?.initiatorUserId || rematchPending?.from?.id;

  // If myPendingRematch is true we consider the current user the initiator.
  const initiatorIsMe =
    !!myPendingRematch ||
    (!!initiatorSocketId && !!mySocketId && initiatorSocketId === mySocketId) ||
    (!!initiatorUserId && !!myUserId && initiatorUserId === myUserId);

  // Display friendly name for initiator
  const initiatorName =
    rematchPending?.from?.displayName ||
    rematchPending?.from?.username ||
    "Opponent";

  if (initiatorIsMe) {
    return (
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Rematch requested"
      >
        <div className={styles.modalContent}>
          <div className={styles.modalTitle}>Rematch requested</div>
          <div className={styles.modalDescription}>
            Waiting for opponent to accept...
          </div>

          <div className={styles.actions}>
            <button
              className={`${styles.btn} ${styles["btn-secondary"]}`}
              onClick={onCancelRequest}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.modal}
      role="dialog"
      aria-modal="true"
      aria-label="Rematch request"
    >
      <div className={styles.modalContent}>
        <div className={styles.modalTitle}>Rematch Request</div>
        <div className={styles.modalDescription}>
          {initiatorName} requested a rematch.
        </div>

        <div className={styles.actions}>
          <button
            className={`${styles.btn} ${styles["btn-success"]}`}
            onClick={onAccept}
            type="button"
          >
            Accept
          </button>
          <button
            className={`${styles.btn} ${styles["btn-secondary"]}`}
            onClick={onDecline}
            type="button"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
