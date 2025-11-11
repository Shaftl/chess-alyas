"use client";
import React, { useState } from "react";

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
}) {
  const [whichTabIsOpen, setWhichTabIsOpen] = useState(
    `${hideRightChat ? "new-game" : "chats"}`
  );

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
            {hideRightChat ? "Play Chess" : "New Game"}
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
