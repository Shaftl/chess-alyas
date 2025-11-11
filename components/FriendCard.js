"use client";
import React from "react";
import styles from "./FriendCard.module.css";

/**
 * FriendCard
 * Props:
 *  - user: { id, username, displayName, avatarUrl, online, country, cups, lastIp }
 *  - onChallenge(user)
 *  - onUnfriend(id)
 *  - onView(id)
 */
export default function FriendCard({ user, onChallenge, onUnfriend, onView }) {
  const avatar = user?.avatarUrl || null;
  const initial = (user?.displayName || user?.username || "U")
    .charAt(0)
    .toUpperCase();

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.avatar}>
          {avatar ? (
            <img
              src={`${process.env.NEXT_PUBLIC_API_URL}${avatar}`}
              alt="avatar"
              className={styles.avatarImage}
            />
          ) : (
            <div className={styles.avatarInitial}>{initial}</div>
          )}
        </div>

        <div className={styles.userInfo}>
          <div className={styles.displayName}>
            {user.displayName || user.username}
          </div>
          <div className={styles.username}>@{user.username}</div>
          <div className={styles.stats}>
            Cups: <strong>{user.cups ?? 0}</strong>
            {user.country && (
              <span className={styles.country}>{user.country}</span>
            )}
          </div>
        </div>

        <div className={styles.status}>
          <div
            className={`${styles.onlineStatus} ${
              user.online ? styles.online : styles.offline
            }`}
          >
            {user.online ? "Online" : "Offline"}
          </div>
          {user.lastIp && <div className={styles.ipAddress}>{user.lastIp}</div>}
        </div>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.btn}
          onClick={() => onView && onView(user.id)}
        >
          View
        </button>
        <button
          className={styles.btn}
          onClick={() => onChallenge && onChallenge(user)}
          disabled={!user.online}
        >
          Challenge
        </button>
        <button
          className={`${styles.btn} ${styles.unfriendBtn}`}
          onClick={() => onUnfriend && onUnfriend(user.id)}
        >
          Unfriend
        </button>
      </div>
    </div>
  );
}
