"use client";

import React, { useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import ChessBoard from "@/components/ChessBoard";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function PlayRoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomId = params?.roomId || null;

  // spectate query param: ?spectate=1 or ?spectate=true triggers spectator/read-only mode
  const spectateParam = searchParams?.get("spectate") || "";
  const spectatorOnly = spectateParam === "1" || spectateParam === "true";

  useEffect(() => {
    document.title = roomId
      ? `Play — ${roomId} — ChessMaster Pro`
      : "Play — ChessMaster Pro";
  }, [roomId]);

  return (
    <ProtectedRoute>
      <ChessBoard initialRoomId={roomId} spectatorOnly={spectatorOnly} />
    </ProtectedRoute>
  );
}
