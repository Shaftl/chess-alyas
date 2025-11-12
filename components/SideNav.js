// frontend/components/SideNav.jsx
"use client";
import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./SideNav.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

function SideNav() {
  const router = useRouter();
  const mounted = useRef(true);
  const [friendNotifs, setFriendNotifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingClick, setProcessingClick] = useState(false);

  useEffect(() => {
    mounted.current = true;
    fetchFriendNotifications();

    const refresh = () => fetchFriendNotifications();

    // listen to same events NotificationBell uses so badge stays in sync
    window.addEventListener("chessapp:notification", refresh);
    window.addEventListener("chessapp:invite-received", refresh);
    window.addEventListener("chessapp:invite-updated", refresh);
    window.addEventListener("chessapp:socket-connected", refresh);

    // underscore variants
    window.addEventListener("chessapp:friend_request_accepted", refresh);
    window.addEventListener("chessapp:friend_request_declined", refresh);

    return () => {
      mounted.current = false;
      window.removeEventListener("chessapp:notification", refresh);
      window.removeEventListener("chessapp:invite-received", refresh);
      window.removeEventListener("chessapp:invite-updated", refresh);
      window.removeEventListener("chessapp:socket-connected", refresh);
      window.removeEventListener("chessapp:friend_request_accepted", refresh);
      window.removeEventListener("chessapp:friend_request_declined", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchFriendNotifications() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/notifications`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (mounted.current) setFriendNotifs([]);
        return;
      }
      const data = await res.json();
      if (!mounted.current) return;
      const friends = (data || []).filter(
        (n) =>
          (n.type === "friend_request" ||
            n.type === "friend-request" ||
            n.type === "friend_request_suggestion") &&
          !n.read
      );
      setFriendNotifs(friends);
    } catch (err) {
      console.error("fetchFriendNotifications error", err);
      if (mounted.current) setFriendNotifs([]);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  async function handleFriendsClick(e) {
    // prevent Link default so we can mark as read first then navigate
    e && e.preventDefault();
    if (processingClick) return;
    setProcessingClick(true);

    try {
      if (!friendNotifs || friendNotifs.length === 0) {
        router.push("/friends");
        return;
      }

      // mark each friend notification read (backend endpoint used in your NotificationBell)
      await Promise.all(
        friendNotifs.map(async (n) => {
          const nid = n.id || n._id || n.inviteId;
          if (!nid) return;
          try {
            await fetch(`${API}/notifications/${nid}/read`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
            });
          } catch (err) {
            console.error("Failed to mark notification read", nid, err);
          }
        })
      );

      // optimistic UI: clear badge immediately
      if (mounted.current) setFriendNotifs([]);

      // navigate to friends page
      router.push("/friends");
    } catch (err) {
      console.error("handleFriendsClick error", err);
      router.push("/friends");
    } finally {
      if (mounted.current) setProcessingClick(false);
    }
  }

  const unreadCount = friendNotifs.length;

  // Inline badge styles so it works even if you don't yet have CSS for it.

  return (
    <div className={styles.sideNav}>
      <nav className={styles.nav}>
        <ul className={styles.navLinks}>
          <li className={styles.navItem}>
            <Link href="/play" className={styles.navLink}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                id="Chess-Queen--Streamline-Font-Awesome"
                height="16"
                width="16"
              >
                <desc>
                  Chess Queen Streamline Icon: https://streamlinehq.com
                </desc>
                <path
                  d="M8 0a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 1 1 0 -3.5zM4.190625 4.49375c0.103125 -0.40625 0.46875 -0.74375 0.94375 -0.74375 0.384375 0 0.70625 0.225 0.865625 0.53125 0.375 0.725 1.13125 1.21875 2 1.21875s1.625 -0.49375 2 -1.21875c0.159375 -0.30625 0.48125 -0.53125 0.865625 -0.53125 0.478125 0 0.84375 0.3375 0.94375 0.74375 0.21875 0.86875 1.00625 1.509375 1.940625 1.509375 0.3375 0 0.65625 -0.084375 0.93125 -0.23125 0.2625 -0.1375 0.590625 -0.140625 0.8625 0.028125 0.40625 0.25 0.534375 0.78125 0.2875 1.1875L12.490625 12.5H3.509375L0.16875 6.9875c-0.246875 -0.40625 -0.11875 -0.9375 0.2875 -1.1875 0.271875 -0.165625 0.6 -0.165625 0.8625 -0.028125 0.278125 0.146875 0.59375 0.23125 0.93125 0.23125 0.934375 0 1.721875 -0.640625 1.940625 -1.509375zM8 7zM3.5 13.5h9l1.29375 1.29375c0.13125 0.13125 0.20625 0.3125 0.20625 0.5 0 0.390625 -0.315625 0.70625 -0.70625 0.70625H2.70625C2.315625 16 2 15.684375 2 15.29375c0 -0.1875 0.075 -0.36875 0.20625 -0.5L3.5 13.5z"
                  fill="#000000"
                  strokeWidth="0.0313"
                ></path>
              </svg>

              <span className={styles.navLinkText}>Play</span>
            </Link>
          </li>

          <li className={styles.navItem}>
            {/* Friends link: intercept click to mark friend notifications read then navigate */}
            <a
              href="/friends"
              onClick={handleFriendsClick}
              className={styles.navLink}
              role="link"
              aria-label="Friends"
              title="Friends"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                id="User-Group--Streamline-Font-Awesome"
                height="16"
                width="16"
              >
                <desc>
                  User Group Streamline Icon: https://streamlinehq.com
                </desc>
                <path
                  d="M2.5120000000000005 4.864000000000001c0 -2.414095 2.6133325000000003 -3.9229025 4.704 -2.7158550000000004 0.9702825000000002 0.5601925 1.568 1.5954700000000002 1.568 2.7158550000000004 0 2.414095 -2.6133325000000003 3.9229025 -4.704 2.7158550000000004 -0.9702825000000002 -0.5601925 -1.568 -1.5954700000000002 -1.568 -2.7158550000000004ZM0.16000000000000003 13.544350000000001c0 -2.41325 1.9550999999999998 -4.36835 4.36835 -4.36835h2.2393c2.41325 0 4.36835 1.9550999999999998 4.36835 4.36835 0 0.4018 -0.32585000000000003 0.7276500000000001 -0.7276500000000001 0.7276500000000001H0.88765c-0.4018 0 -0.7276500000000001 -0.32585000000000003 -0.7276500000000001 -0.7276500000000001Zm14.927850000000001 0.7276500000000001H11.7093c0.1323 -0.2303 0.21070000000000003 -0.49734999999999996 0.21070000000000003 -0.784v-0.196c0 -1.48715 -0.66395 -2.8224 -1.7101 -3.7191000000000005 0.0588 -0.0024500000000000004 0.11515 -0.004900000000000001 0.17395000000000002 -0.004900000000000001h1.5043c2.18295 0 3.9518500000000003 1.7689000000000001 3.9518500000000003 3.9518500000000003 0 0.41650000000000004 -0.3381 0.75215 -0.75215 0.75215ZM10.744 8c-0.7595000000000001 0 -1.4455 -0.30870000000000003 -1.94285 -0.8060499999999999 0.48265 -0.6517000000000001 0.76685 -1.45775 0.76685 -2.3299499999999997 0 -0.6566000000000001 -0.1617 -1.27645 -0.44835 -1.82035 0.45570000000000005 -0.3332 1.01675 -0.53165 1.6243500000000002 -0.53165 1.51655 0 2.744 1.2274500000000002 2.744 2.744S12.260550000000002 8 10.744 8Z"
                  fill="#000000"
                  strokeWidth="0.025"
                ></path>
              </svg>

              <span className={styles.navLinkText}>Friends</span>

              {/* badge */}
              {unreadCount > 0 && (
                <span
                  aria-live="polite"
                  aria-atomic="true"
                  className={styles.badgeStyle}
                  title={`${unreadCount} new friend request${
                    unreadCount > 1 ? "s" : ""
                  }`}
                >
                  {/* {unreadCount} */}
                </span>
              )}
            </a>
          </li>

          <li className={styles.navItem}>
            <Link href="/players" className={styles.navLink}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                id="Earth-Europe--Streamline-Font-Awesome"
                height="16"
                width="16"
              >
                <desc>
                  Earth Europe Streamline Icon: https://streamlinehq.com
                </desc>
                <path
                  d="m8.321875 1.509375 -1.05625 0.790625c-0.16875 0.125 -0.265625 0.325 -0.265625 0.534375v0.284375c0 0.2125 0.171875 0.384375 0.384375 0.384375 0.075 0 0.15 -0.021875 0.2125 -0.065625l1.30625 -0.871875c0.0625 -0.040625 0.1375 -0.065625 0.2125 -0.065625h0.03125c0.19375 0 0.353125 0.159375 0.353125 0.353125 0 0.09375 -0.0375 0.184375 -0.103125 0.25l-0.621875 0.621875c-0.18125 0.18125 -0.403125 0.31875 -0.646875 0.4l-0.828125 0.275c-0.18125 0.059375 -0.3 0.228125 -0.3 0.41875 0 0.115625 -0.046875 0.228125 -0.128125 0.3125L6.3125 5.690625c-0.2 0.2 -0.309375 0.46875 -0.309375 0.75v0.134375c0 0.5125 0.425 0.928125 0.934375 0.928125 0.34375 0 0.6625 -0.19375 0.815625 -0.5l0.125 -0.253125c0.075 -0.15 0.23125 -0.246875 0.4 -0.246875 0.140625 0 0.271875 0.065625 0.35625 0.178125l0.509375 0.678125c0.065625 0.090625 0.171875 0.140625 0.284375 0.140625 0.2625 0 0.434375 -0.278125 0.315625 -0.5125l-0.034375 -0.071875c-0.109375 -0.21875 0 -0.484375 0.234375 -0.5625l0.6625 -0.221875c0.2375 -0.078125 0.396875 -0.3 0.396875 -0.55 0 -0.321875 0.259375 -0.58125 0.58125 -0.58125H12.5c0.275 0 0.5 0.225 0.5 0.5s-0.225 0.5 -0.5 0.5h-0.646875c-0.225 0 -0.44375 0.090625 -0.603125 0.25l-0.146875 0.146875c-0.065625 0.065625 -0.103125 0.15625 -0.103125 0.25 0 0.19375 0.159375 0.353125 0.353125 0.353125h0.353125c0.1875 0 0.36875 0.075 0.5 0.20625l0.203125 0.203125c0.05625 0.05625 0.0875 0.134375 0.0875 0.2125s-0.03125 0.15625 -0.0875 0.2125l-0.234375 0.234375c-0.1125 0.11875 -0.175 0.271875 -0.175 0.43125s0.0625 0.3125 0.178125 0.428125L12.75 9.5c0.31875 0.31875 0.753125 0.5 1.20625 0.5h0.23125c0.203125 -0.63125 0.3125 -1.303125 0.3125 -2 0 -3.48125 -2.7375 -6.325 -6.178125 -6.490625zm5.375 9.621875c-0.115625 -0.08125 -0.25625 -0.128125 -0.40625 -0.128125 -0.1875 0 -0.36875 -0.075 -0.5 -0.20625L12.375 10.375c-0.240625 -0.240625 -0.5625 -0.375 -0.903125 -0.375 -0.303125 0 -0.6 -0.109375 -0.83125 -0.30625L9.8125 8.98125c-0.3625 -0.309375 -0.825 -0.48125 -1.303125 -0.48125h-0.653125c-0.39375 0 -0.78125 0.115625 -1.109375 0.334375L5.890625 9.40625c-0.55625 0.371875 -0.890625 0.996875 -0.890625 1.665625v0.1c0 0.53125 0.209375 1.040625 0.584375 1.415625l0.5 0.5c0.265625 0.265625 0.625 0.415625 1 0.415625H7.75c0.415625 0 0.75 0.334375 0.75 0.75 0 0.078125 0.0125 0.15625 0.034375 0.228125 2.228125 -0.18125 4.140625 -1.4875 5.1625 -3.35zM0 8a8 8 0 1 1 16 0 8 8 0 1 1 -16 0zm5.853125 -4.853125c-0.19375 -0.19375 -0.5125 -0.19375 -0.70625 0l-1 1c-0.19375 0.19375 -0.19375 0.5125 0 0.70625s0.5125 0.19375 0.70625 0l1 -1c0.19375 -0.19375 0.19375 -0.5125 0 -0.70625z"
                  fill="#000000"
                  strokeWidth="0.0313"
                ></path>
              </svg>

              <span className={styles.navLinkText}>Players</span>
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}

export default SideNav;
