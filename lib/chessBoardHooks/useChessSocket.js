// frontend/lib/chessBoardHooks/useChessSocket.js
import { useEffect } from "react";
import { Chess } from "chess.js"; // <-- FIX: import Chess

/**
 * useChessSocket
 * params: { ... } (same as before)
 */
export default function useChessSocket(params) {
  useEffect(() => {
    const {
      initSocket,
      socketRef,
      chessRef,
      gameState,
      auth,
      dispatch,
      router,
      setStatusMsg,
      setPlayers,
      setClocks,
      setMoveHistory,
      setRematchPending,
      setMyPendingRematch,
      setDrawOffer,
      setMyPendingDrawOffer,
      setGameOverState,
      lastIndexRef,
      prevPlayersCountRef,
      prevPendingRef,
      lastPushedRoomRef,
      attemptedSeatRef,
      prevClocksRef,
      prevSecondsRef,
      moveSoundEnabled,
      tickSoundEnabled,
      timerLowRunningRef,
      playMoveSound,
      playTick,
      stopReplayImpl,
      dispatchJoinRoomSuccess,
      dispatchOpponentMove,
      dispatchLocalMove,
      dispatchAddMessage,
      API,
      setJoinModalOpen,
      setJoinResult,
      setJoinChecking,
      setJoinInput,
      setRoomText,
      // optional helpers (may be passed)
      resetForNewRoom,
      refreshUI,
      normalizeAvatarUrlFromAuthUser,
      setSelected,
      setLegalMoves,
      setLegalMovesVerbose,
      setAnalysisIndex,
    } = params || {};

    const s = initSocket();
    socketRef.current = s;

    // resume audio on gesture helper (same idea as original)
    const resumeAudioOnGesture = () => {
      try {
        const sm = typeof window !== "undefined" ? window.soundManager : null;
        if (sm && typeof sm.ensureContextOnGesture === "function") {
          try {
            sm.ensureContextOnGesture();
          } catch (e) {}
          if (sm.ctx && sm.ctx.state === "suspended") {
            sm.ctx.resume().catch(() => {});
          }
        }
      } catch (e) {}
      document.removeEventListener("click", resumeAudioOnGesture);
      document.removeEventListener("keydown", resumeAudioOnGesture);
    };
    document.addEventListener("click", resumeAudioOnGesture);
    document.addEventListener("keydown", resumeAudioOnGesture);

    try {
      const sm = typeof window !== "undefined" ? window.soundManager : null;
      if (sm && sm.ensureContextOnGesture) sm.ensureContextOnGesture();
    } catch (e) {}

    s.on("connect", () => {
      if (gameState.roomId) {
        try {
          s.emit("request-sync", { roomId: gameState.roomId });
        } catch (e) {}
      }
    });

    s.on("player-assigned", ({ color }) => {
      try {
        dispatch({ type: "game/setPlayerColor", payload: color });
      } catch (e) {}
      try {
        if (color === "spectator") {
          setStatusMsg("You are a spectator");
        } else {
          setStatusMsg(`You are ${color === "w" ? "White" : "Black"}`);
        }
      } catch (e) {}
    });

    s.on("room-update", (r) => {
      const priorPending = prevPendingRef.current;

      if (r && r.pendingRematch) {
        const pr = r.pendingRematch;
        let initiatorPlayer =
          (r.players || []).find(
            (p) =>
              (p.user && p.user.id && p.user.id === pr.initiatorUserId) ||
              p.id === pr.initiatorSocketId
          ) || null;

        const fromObj =
          initiatorPlayer && initiatorPlayer.user
            ? { ...initiatorPlayer.user, id: initiatorPlayer.user.id || null }
            : {
                username:
                  (initiatorPlayer && initiatorPlayer.user?.username) ||
                  (typeof pr.initiatorUserId === "string"
                    ? pr.initiatorUserId
                    : "Opponent"),
                id: pr.initiatorUserId || pr.initiatorSocketId || null,
              };

        setRematchPending(
          pr
            ? {
                from: fromObj,
                initiatorSocketId: pr.initiatorSocketId,
                initiatorUserId: pr.initiatorUserId,
                acceptedBy: pr.acceptedBy || [],
              }
            : null
        );
      } else {
        setRematchPending(null);
      }

      // dispatch the room update immediately so UI responds fast
      try {
        dispatch(dispatchJoinRoomSuccess(r));
      } catch (e) {}

      if (r && r.fen) {
        try {
          const ok = chessRef.current.load(r.fen);
          if (!ok) chessRef.current = new Chess(r.fen);
        } catch {
          chessRef.current = new Chess(r.fen || undefined);
        }
      }
      lastIndexRef.current =
        typeof r.lastIndex === "number" ? r.lastIndex : lastIndexRef.current;

      setPlayers(r.players || []);
      setClocks(r.clocks || { w: null, b: null, running: null });
      setMoveHistory(r.moves || []);
      if (typeof setAnalysisIndex === "function") setAnalysisIndex(null);

      const pending = r.pendingDrawOffer || null;
      setDrawOffer(pending ? { from: pending.from } : null);

      const myId = auth?.user?.id || null;
      const offererId = pending?.from?.id || null;

      setMyPendingDrawOffer(!!(pending && offererId === myId));

      if (!pending && priorPending) {
        const priorOffererId = priorPending.from?.id || null;
        if (priorOffererId === myId) {
          if (r.finished && r.finished.reason === "draw-agreed") {
            setStatusMsg("Your draw offer was accepted — game drawn");
          } else {
            setStatusMsg("Your draw offer was declined");
          }
          setMyPendingDrawOffer(false);
        } else {
          if (r.finished && r.finished.reason === "draw-agreed") {
            setStatusMsg("Draw accepted");
          } else {
            setStatusMsg("Draw declined");
          }
        }
      }

      prevPendingRef.current = pending;

      if (r.finished) {
        setGameOverState({
          over: true,
          reason: r.finished.reason || "game-over",
          winner:
            r.finished.winner ?? (r.finished.result === "draw" ? "draw" : null),
          loser: r.finished.loser ?? null,
          message: r.finished.message ?? null,
        });
        setStatusMsg(r.finished.message || "Game finished");
      } else {
        setGameOverState((prev) =>
          prev.over ? { ...prev, over: false } : prev
        );
      }

      try {
        refreshUI && refreshUI();
      } catch (e) {}

      const colored = (r.players || []).filter(
        (p) => p.color === "w" || p.color === "b"
      );

      try {
        const prevCount = prevPlayersCountRef.current || 0;
        const newCount = colored.length || 0;
        if (newCount >= 2 && prevCount < 2 && !r.finished) {
          try {
            if (moveSoundEnabled) {
              const sm =
                typeof window !== "undefined" ? window.soundManager : null;
              if (sm && sm.playStart) sm.playStart();
            }
          } catch (e) {}
        }
        prevPlayersCountRef.current = newCount;
      } catch (e) {}

      if (r.finished) {
        setStatusMsg(r.finished.message || "Game finished");
      } else if (colored.length < 2) {
        setStatusMsg("Waiting for second player...");
      } else {
        setStatusMsg("Game ready");
      }

      (async () => {
        try {
          const rawPlayers = r.players || [];
          const needFetchIds = rawPlayers
            .map((p) => p?.user?.id || p?.user?._id || p?.id)
            .filter(Boolean)
            .filter((id) => {
              const pl = rawPlayers.find(
                (x) =>
                  (x.user && (x.user.id === id || x.user._id === id)) ||
                  x.id === id
              );
              if (!pl) return false;
              const u = pl.user || {};
              const missingProfile =
                !u.username || !u.displayName || !u.avatarUrl;
              const missingCups =
                typeof u.cups === "undefined" || u.cups === null;
              return missingProfile || missingCups;
            });

          if (!needFetchIds.length) return;

          const uniqueIds = [...new Set(needFetchIds)];
          const base = API.replace(/\/api\/?$/, "");
          const fetches = uniqueIds.map((id) =>
            fetch(`${base}/api/players/${encodeURIComponent(id)}`, {
              credentials: "include",
            })
              .then((res) => (res.ok ? res.json() : null))
              .catch(() => null)
          );

          const results = await Promise.all(fetches);
          const byId = {};
          results.forEach((res) => {
            if (!res) return;
            const uid = res.id || res._id;
            if (uid) {
              const normalizedAvatar =
                (typeof normalizeAvatarUrlFromAuthUser === "function"
                  ? normalizeAvatarUrlFromAuthUser(res)
                  : null) ||
                res.avatarUrlAbsolute ||
                res.avatarUrl ||
                res.avatar ||
                null;
              byId[String(uid)] = { ...res, avatarUrl: normalizedAvatar };
            }
          });

          const enriched = rawPlayers.map((pl) => {
            const uid =
              pl?.user?.id ||
              pl?.user?._id ||
              pl?.id ||
              (pl.user && pl.user.id);
            if (uid && byId[String(uid)]) {
              return { ...pl, user: { ...(byId[String(uid)] || {}), id: uid } };
            }
            return pl;
          });

          try {
            dispatch(dispatchJoinRoomSuccess({ ...r, players: enriched }));
          } catch (e) {}
          setPlayers(enriched);
        } catch (e) {}
      })();

      try {
        const rid =
          (r && (r.roomId || r.roomId === 0 ? r.roomId : null)) || null;
        if (rid) {
          const target = `/play/${encodeURIComponent(rid)}`;
          const alreadyOnPath =
            router.asPath && router.asPath.split("?")[0] === target;
          if (!alreadyOnPath && lastPushedRoomRef.current !== String(rid)) {
            lastPushedRoomRef.current = String(rid);
            try {
              router.replace(target);
            } catch (e) {}
          }
        }
      } catch (e) {}
    });

    s.on("no-such-room", ({ roomId: rid }) => {
      setStatusMsg(`No room with id ${rid}`);
      try {
        lastPushedRoomRef.current = null;
        router.replace("/play");
      } catch (e) {}

      try {
        const m =
          router.asPath &&
          router.asPath.split("?")[0].match(/^\/play\/([^/]+)/);
        const currentRid = m ? decodeURIComponent(m[1]) : null;
        if (currentRid && currentRid === String(rid)) {
          try {
            dispatch({ type: "game/setRoomId", payload: null });
          } catch (e) {}
        }
      } catch (e) {}

      try {
        resetForNewRoom && resetForNewRoom(null);
      } catch (e) {}
    });

    s.on("room-created", (payload) => {
      if (!payload) return;
      if (payload.ok) {
        setRoomText(payload.roomId || "");
        try {
          dispatch({ type: "game/setRoomId", payload: payload.roomId || "" });
        } catch (e) {}
        setStatusMsg(`Room ${payload.roomId} created`);
        try {
          lastPushedRoomRef.current = payload.roomId;
          router.push(`/play/${encodeURIComponent(payload.roomId)}`);
        } catch (e) {}
      } else {
        setStatusMsg(payload.error || "Failed to create room");
      }
    });

    s.on("clock-update", (c) => c && setClocks(c));

    s.on("opponent-move", (record) => {
      if (!record || typeof record.index === "undefined") {
        s.emit("request-sync", { roomId: gameState.roomId });
        return;
      }
      if (record.index <= lastIndexRef.current) return;
      try {
        const res = chessRef.current.move(record.move);
        if (res) {
          lastIndexRef.current = record.index;
          setMoveHistory((mh) => [
            ...mh,
            { index: record.index, move: record.move, fen: record.fen },
          ]);
          try {
            dispatch(dispatchOpponentMove(record));
          } catch (e) {}
          if (record.fen) {
            try {
              chessRef.current.load(record.fen);
            } catch {}
          }
          if (record.clocks) setClocks(record.clocks);
          try {
            const from = record.move?.from || null;
            const to = record.move?.to || null;
            playMoveSound(!!res.captured, from, to);
          } catch (e) {
            playMoveSound(!!res.captured);
          }

          try {
            if (moveSoundEnabled && res) {
              if (res.promotion) {
                try {
                  const sm =
                    typeof window !== "undefined" ? window.soundManager : null;
                  if (sm && sm.playPromotion) sm.playPromotion();
                } catch (e) {}
              }
              const flags = res.flags || "";
              const san = (res.san || "").toString();
              if (
                flags.toString().includes("k") ||
                flags.toString().includes("q") ||
                san.includes("O-O")
              ) {
                try {
                  const sm =
                    typeof window !== "undefined" ? window.soundManager : null;
                  if (sm && sm.playCastle) sm.playCastle();
                } catch (e) {}
              }
            }
          } catch (e) {}

          try {
            refreshUI && refreshUI();
          } catch (e) {}
        } else {
          s.emit("request-sync", { roomId: gameState.roomId });
        }
      } catch (e) {
        s.emit("request-sync", { roomId: gameState.roomId });
      }
    });

    s.on("chat-message", (msg) => {
      try {
        dispatch(dispatchAddMessage(msg));
      } catch (e) {}
    });

    s.on("invalid-move", (payload) => {
      setStatusMsg(payload.reason || "Invalid move");
      s.emit("request-sync", { roomId: gameState.roomId });
    });

    s.on("not-your-turn", (payload) =>
      setStatusMsg(payload.error || "Not your turn")
    );
    s.on("not-enough-players", (payload) =>
      setStatusMsg(payload.error || "Waiting for another player")
    );
    s.on("auth-required", () =>
      setStatusMsg(
        "Log in to take a playing seat (only authenticated users can play)."
      )
    );

    s.on("draw-offered", ({ from }) => {
      const myId = auth?.user?.id || null;
      if (from && from.id && from.id === myId) return;
      setDrawOffer({ from });
      setStatusMsg("Opponent offered a draw");
    });

    s.on("rematch-offered", ({ from }) => {
      setRematchPending({ from });
      setStatusMsg("Rematch requested");
    });

    s.on("rematch-declined", (payload) => {
      setRematchPending(null);
      setMyPendingRematch(false);
      setStatusMsg(payload?.message || "Rematch declined");
    });

    s.on("play-again", (payload) => {
      if (!payload) return;
      if (payload.started) {
        try {
          chessRef.current = new Chess();
        } catch {
          chessRef.current = new Chess();
        }
        lastIndexRef.current = -1;
        setMoveHistory([]);
        try {
          setSelected && setSelected(null);
          setLegalMoves && setLegalMoves([]);
          setLegalMovesVerbose && setLegalMovesVerbose([]);
          setAnalysisIndex && setAnalysisIndex(null);
        } catch (e) {}
        setGameOverState({
          over: false,
          reason: null,
          winner: null,
          loser: null,
          message: null,
        });
        setRematchPending(null);
        setMyPendingRematch(false);
        setDrawOffer(null);
        setStatusMsg(payload.message || "Rematch started");
        try {
          dispatch({ type: "game/setFen", payload: chessRef.current.fen() });
        } catch (e) {}
        try {
          refreshUI && refreshUI();
        } catch (e) {}

        try {
          if (moveSoundEnabled) {
            const sm =
              typeof window !== "undefined" ? window.soundManager : null;
            if (sm && sm.playStart) sm.playStart();
          }
        } catch (e) {}

        try {
          const newRoomId = payload.roomId || null;
          if (
            newRoomId &&
            String(newRoomId).trim() &&
            lastPushedRoomRef.current !== newRoomId
          ) {
            dispatch({ type: "game/setRoomId", payload: newRoomId });
            lastPushedRoomRef.current = newRoomId;
            try {
              router.push(`/play/${encodeURIComponent(newRoomId)}`);
            } catch (e) {}
            try {
              socketRef.current?.emit("request-sync", { roomId: newRoomId });
            } catch (e) {}
          }
        } catch (e) {}
      } else {
        setMyPendingRematch(true);
        setStatusMsg(payload.message || "Rematch requested");
      }
    });

    s.on("game-over", (payload) => {
      if (payload?.reason === "timeout")
        setStatusMsg(`Game over — ${payload.winner} wins by timeout`);
      else if (payload?.reason === "resign")
        setStatusMsg(`Game over — ${payload.winner} wins (resignation)`);
      else if (payload?.reason === "opponent-disconnected")
        setStatusMsg(payload.message || "Game over — opponent disconnected");
      else if (payload?.reason === "first-move-timeout")
        setStatusMsg(payload.message || "Game drawn (no first move)");
      else if (payload?.reason === "draw-agreed")
        setStatusMsg("Game drawn by agreement");
      else setStatusMsg(payload.message || "Game over");

      setGameOverState({
        over: true,
        reason: payload?.reason || "game-over",
        winner: payload?.winner ?? null,
        loser: payload?.loser ?? null,
        message: payload?.message ?? null,
      });

      try {
        if (payload?.reason === "checkmate") {
          if (moveSoundEnabled) {
            const sm =
              typeof window !== "undefined" ? window.soundManager : null;
            if (sm && sm.playCheckmate) sm.playCheckmate();
          }
        }
      } catch (e) {}

      try {
        const sm = typeof window !== "undefined" ? window.soundManager : null;
        if (sm && sm.stopTimerLow) sm.stopTimerLow();
        timerLowRunningRef.current = false;
      } catch (e) {}

      stopReplayImpl();
    });

    return () => {
      if (!s) return;
      s.off("connect");
      s.off("player-assigned");
      s.off("room-update");
      s.off("opponent-move");
      s.off("invalid-move");
      s.off("not-your-turn");
      s.off("not-enough-players");
      s.off("clock-update");
      s.off("game-over");
      s.off("auth-required");
      s.off("draw-offered");
      s.off("room-created");
      s.off("chat-message");
      s.off("rematch-offered");
      s.off("rematch-declined");
      s.off("play-again");
      s.off("no-such-room");
      try {
        document.removeEventListener("click", resumeAudioOnGesture);
        document.removeEventListener("keydown", resumeAudioOnGesture);
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
