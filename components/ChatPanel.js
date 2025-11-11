import React, { useEffect, useRef, useState } from "react";
import styles from "@/styles/ChatPanel.module.css";
import { useSelector, useDispatch } from "react-redux";
import { addMessage } from "@/store/slices/gameSlice";

export default function ChatPanel({ socketRef }) {
  const dispatch = useDispatch();
  const messages = useSelector((s) => s.game.messages || []);
  const auth = useSelector((s) => s.auth);
  const roomId = useSelector((s) => s.game.roomId);
  const scrollRef = useRef(null);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const send = () => {
    const t = (text || "").trim();
    if (!t || !socketRef?.current || !roomId) return;
    try {
      socketRef.current.emit("send-chat", { roomId, text: t });
      setText("");
    } catch {
      setText("");
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={styles.chatPanel}>
      {/* <div className={styles.chatHeader}>
        <small className={styles.messageCount}>
          {messages.length} messages
        </small>
      </div> */}

      <div ref={scrollRef} className={styles.messagesContainer}>
        {messages.length === 0 && (
          <div className={styles.emptyState}>No messages yet</div>
        )}

        {messages.map((m) => {
          const isMe =
            auth?.user?.id && m.user?.id && auth.user.id === m.user.id;
          const name = m.user?.displayName || m.user?.username || "Guest";
          const avatar = m.user?.avatarUrl || m.user?.avatarUrlAbsolute || null;

          return (
            <div key={m.id} className={styles.messageRow}>
              <div className={styles.avatarWrapper}>
                {avatar ? (
                  <img
                    src={`https://chess-backend-api.onrender.com/api${avatar}`}
                    alt={name}
                    className={styles.avatar}
                  />
                ) : (
                  <span className={styles.avatarLetter}>
                    {(name || "G").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className={styles.messageBody}>
                <div className={styles.messageHeader}>
                  <div className={styles.username}>{name}</div>
                  <div className={styles.timestamp}>
                    {new Date(m.ts).toLocaleTimeString()}
                  </div>
                </div>
                <div className={styles.messageText}>{m.text}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.inputSection}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Type a message and press Enter"
          className={styles.textarea}
        />
        <button onClick={send} className={styles.sendButton}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            id="Arrow-Up--Streamline-Font-Awesome"
            height="16"
            width="16"
          >
            <desc>Arrow Up Streamline Icon: https://streamlinehq.com</desc>
            <path
              d="M8.791045833333332 0.4881416666666667c-0.437525 -0.437525 -1.1480666666666666 -0.437525 -1.5855916666666667 0L1.6051416666666667 6.088454166666666c-0.437525 0.437525 -0.437525 1.1480666666666666 0 1.5855916666666667s1.1480666666666666 0.43752083333333336 1.5855916666666667 0l3.6892041666666664 -3.692708333333333v10.7386c0 0.6195333333333333 0.5005291666666667 1.1200625 1.1200625 1.1200625s1.1200625 -0.5005291666666667 1.1200625 -1.1200625V3.9813374999999995l3.6892041666666664 3.689208333333333c0.437525 0.43752083333333336 1.1480666666666666 0.43752083333333336 1.5855916666666667 0s0.43752083333333336 -1.1480666666666666 0 -1.5855916666666667L8.794545833333332 0.48464166666666664Z"
              fill="#000000"
              strokeWidth="0.0417"
            ></path>
          </svg>
        </button>
      </div>
    </div>
  );
}
