"use client";
import React, { useState, useEffect } from "react";

import ChatPanel from "@/components/ChatPanel";
import styles from "./RightPanel.module.css";
import HeaderControls from "./HeaderControls";
import JoinModal from "./JoinModal";

/**
 * Right panel container component.
 * Props:
 *  - players, clocks
 *  - moveHistory, analysisIndex, jumpToMove, startReplay, stopReplay
 *  - socketRef
 */
export default function RightPanel({
  socketRef,
  joinRoom,
  createCode,
  setCreateCode,
  createMinutes,
  setCreateMinutes,
  createColorPref,
  setCreateColorPref,
  createRoom,
  open,
  onClose,
  joinInput,
  setJoinInput,
  checkRoomId,
  joinChecking,
  joinResult,
  confirmJoinRoom,
  API,
  hideRightChat,
  children,
  playingWithBot = false,
}) {
  const [whichTabIsOpen, setWhichTabIsOpen] = useState(
    `${hideRightChat || playingWithBot ? "new-game" : "chats"}`
  );

  useEffect(() => {
    if (playingWithBot || hideRightChat) {
      setWhichTabIsOpen("new-game");
    } else {
      setWhichTabIsOpen((prev) => (prev === "new-game" ? "chats" : prev));
    }
  }, [hideRightChat, playingWithBot]);

  // Decide label: when playingWithBot we always want "New Game"
  const newGameLabel = playingWithBot
    ? "New Game"
    : hideRightChat
    ? "Play Chess"
    : "New Game";

  return (
    <aside className={styles.rightPanel}>
      <div className={styles.rightPanelContainer}>
        <div
          className={`${styles.tabs} ${
            hideRightChat ? styles.tabsHideChat : ""
          }`}
        >
          {!hideRightChat && (
            <button
              onClick={() => setWhichTabIsOpen("chats")}
              className={`${
                whichTabIsOpen === "chats" ? styles.activeTab : ""
              } ${styles.btn}`}
            >
              Chats
            </button>
          )}
          {!hideRightChat && (
            <button
              onClick={() => setWhichTabIsOpen("voice")}
              className={`${
                whichTabIsOpen === "voice" ? styles.activeTab : ""
              } ${styles.btn} ${hideRightChat ? styles.hideRightChatBtn : ""}`}
            >
              Live talk
            </button>
          )}

          <button
            onClick={() => setWhichTabIsOpen("new-game")}
            className={`${
              whichTabIsOpen === "new-game" ? styles.activeTab : ""
            } ${styles.btn}`}
          >
            {newGameLabel}
          </button>
        </div>

        {whichTabIsOpen === "chats" && <ChatPanel socketRef={socketRef} />}

        {!hideRightChat && (
          <div
            className={`${
              whichTabIsOpen !== "voice" ? styles.voiceTabClose : ""
            } ${styles.voiceTabOpen}`}
          >
            {children}
          </div>
        )}

        {whichTabIsOpen === "new-game" && (
          <div className={styles.newGame}>
            <HeaderControls
              joinRoom={joinRoom}
              createCode={createCode}
              setCreateCode={setCreateCode}
              createMinutes={createMinutes}
              setCreateMinutes={setCreateMinutes}
              createColorPref={createColorPref}
              setCreateColorPref={setCreateColorPref}
              createRoom={createRoom}
              API={API}
            />

            <JoinModal
              open={open}
              onClose={onClose}
              joinInput={joinInput}
              setJoinInput={setJoinInput}
              checkRoomId={checkRoomId}
              joinChecking={joinChecking}
              joinResult={joinResult}
              confirmJoinRoom={confirmJoinRoom}
              API={API}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
