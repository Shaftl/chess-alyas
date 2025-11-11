"use client";

import React, { useEffect } from "react";
import ChessBoard from "@/components/ChessBoard";
import AccountDropdown from "@/components/AccountDropdown";

/**
 * Page wrapper for /play
 * Renders the ChessBoard; ChessBoard auto-joins if ?roomId=... or pathname /play/<roomId> is present.
 */
export default function PlayPage() {
  useEffect(() => {
    // optional: set page title
    document.title = "Play — ChessMaster Pro";
  }, []);

  return (
    <div>
      <ChessBoard
        hideSidebar={true}
        hideRightChat={true}
        hideCaptured={true}
        setTabToNewGame={true}
      />
    </div>
  );
}
