// frontend/components/ChessBoard.js
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { initSocket } from "@/lib/socketClient";
import styles from "@/styles/Chess.module.css";
import { useDispatch, useSelector } from "react-redux";
import {
  setRoomId,
  setPlayerColor,
  joinRoomSuccess,
  opponentMove,
  localMove,
  setFen as setFenRedux,
  leaveRoom as leaveRoomAction,
  addMessage,
} from "@/store/slices/gameSlice";

import HeaderControls from "@/components/chess/HeaderControls";
import JoinModal from "@/components/chess/JoinModal";
import Board from "@/components/chess/Board";
import Sidebar from "@/components/chess/Sidebar";
import RightPanel from "@/components/chess/RightPanel";

import PromotionModal from "@/components/chess/PromotionModal";
import DrawModal from "@/components/chess/DrawModal";
import RematchModal from "@/components/chess/RematchModal";
import VoicePanel from "@/components/VoicePanel";

import { useRouter } from "next/navigation";

import {
  getPieceImageUrl,
  normalizeAvatarUrlFromAuthUser,
  formatMs,
} from "@/lib/chessUtils";
import PlayersPanel from "./chess/PlayersPanel";
import Clocks from "./chess/Clocks";
import CapturedPieces from "./chess/CapturedPieces";

import soundManager from "@/lib/soundManager";
import ActiveRoomModal from "@/components/ActiveRoomModal";

/* Board coords */
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

/* ---------------- Main Component ---------------- */
export default function ChessBoard({
  initialRoomId = null,
  spectatorOnly = false,
  hideSidebar = false,
  hideRightChat = false,
  hideCaptured = false,
  setTabToNewGame = false,
}) {
  const dispatch = useDispatch();
  const gameState = useSelector((s) => s.game);
  const auth = useSelector((s) => s.auth);
  const router = useRouter();

  const chessRef = useRef(new Chess());
  const socketRef = useRef(null);
  const [, setTick] = useState(0);
  const lastIndexRef = useRef(-1);
  const [isSideBarResOpen, setSideBarResOpen] = useState(false);

  const attemptedSeatRef = useRef(false); // guard to avoid auto-seat when spectator
  const prevRoomRef = useRef(null);

  // NEW: track previous players count to detect start-of-game transition
  const prevPlayersCountRef = useRef(0);
  // NEW: track timerLow running state so we can stop it
  const timerLowRunningRef = useRef(false);

  const [selected, setSelected] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]); // string squares
  const [legalMovesVerbose, setLegalMovesVerbose] = useState([]); // verbose objects
  const [promotionRequest, setPromotionRequest] = useState(null);
  const [roomText, setRoomText] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const [players, setPlayers] = useState([]);
  const [clocks, setClocks] = useState({ w: null, b: null, running: null });

  const [moveHistory, setMoveHistory] = useState([]);
  const [analysisIndex, setAnalysisIndex] = useState(null);
  const replayRef = useRef({ playing: false, timer: null, speed: 800 });

  const [gameOverState, setGameOverState] = useState({
    over: false,
    reason: null,
    winner: null,
    loser: null,
    message: null,
  });

  // Rematch states:
  const [rematchPending, setRematchPending] = useState(null); // object when someone else requested
  const [myPendingRematch, setMyPendingRematch] = useState(false); // true if I requested and waiting for opponent

  const [drawOffer, setDrawOffer] = useState(null);
  const [myPendingDrawOffer, setMyPendingDrawOffer] = useState(false);
  const prevPendingRef = useRef(null);

  const prevClocksRef = useRef({ w: null, b: null });
  const prevSecondsRef = useRef({ w: null, b: null });

  const [moveSoundEnabled, setMoveSoundEnabled] = useState(() => {
    try {
      if (typeof window === "undefined") return true;
      const v = localStorage.getItem("moveSoundEnabled");
      return v === null ? true : v === "1";
    } catch (e) {
      return true;
    }
  });
  const [tickSoundEnabled, setTickSoundEnabled] = useState(() => {
    try {
      if (typeof window === "undefined") return true;
      const v = localStorage.getItem("tickSoundEnabled");
      return v === null ? true : v === "1";
    } catch (e) {
      return true;
    }
  });

  // create-room UI state
  const [createMinutes, setCreateMinutes] = useState(5);
  const [createColorPref, setCreateColorPref] = useState("random");
  const [createCode, setCreateCode] = useState("");

  // Join modal state
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [joinChecking, setJoinChecking] = useState(false);
  const [joinResult, setJoinResult] = useState(null); // room info or error

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    try {
      localStorage.setItem("moveSoundEnabled", moveSoundEnabled ? "1" : "0");
    } catch (e) {}
  }, [moveSoundEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem("tickSoundEnabled", tickSoundEnabled ? "1" : "0");
    } catch (e) {}
  }, [tickSoundEnabled]);

  useEffect(() => {
    console.log(players);
  }, [players]);

  function refreshUI() {
    setTick((t) => t + 1);
  }

  // AUDIO: wrappers that call the SoundManager but respect existing toggles.
  function playMoveSound(captured = false, from = null, to = null) {
    if (!moveSoundEnabled) return;
    try {
      // play with positional hints when available
      soundManager.playMove({ captured: !!captured, from, to });
    } catch (e) {}
  }

  function playTick() {
    if (!tickSoundEnabled) return;
    try {
      soundManager.playTick();
    } catch (e) {}
  }

  // helper: read user object directly from localStorage (used in connect handler so value isn't stale)
  function readUserFromStorage() {
    try {
      if (typeof window === "undefined") return null;
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // ---------------- Drag/drop support ----------------
  // Called when user starts dragging a piece image
  function handlePieceDragStart(fromSquare, event) {
    // Keep the same behavior as selecting a piece: set selection and show legal moves
    try {
      // If we're viewing history or game over, don't allow drag
      if (analysisIndex !== null) return;
      const can = canMakeMove();
      if (!can.ok) return;

      const piece = chessRef.current.get(fromSquare);
      if (!piece || piece.color !== chessRef.current.turn()) {
        // cannot drag opponent piece
        return;
      }

      setSelected(fromSquare);
      const movesVerbose = chessRef.current.moves({
        square: fromSquare,
        verbose: true,
      });
      setLegalMovesVerbose(movesVerbose);
      setLegalMoves(movesVerbose.map((m) => m.to));

      // store origin in dataTransfer if available (Board already does this but be safe)
      try {
        if (event && event.dataTransfer) {
          event.dataTransfer.setData("text/plain", fromSquare);
        }
      } catch (e) {}
    } catch (e) {
      // ignore
    }
  }

  // Called when dropping onto a square
  function handleSquareDrop(toSquare, event) {
    try {
      if (analysisIndex !== null) {
        setStatusMsg("Exit history view to play a move");
        return;
      }
      const can = canMakeMove();
      if (!can.ok) {
        // show any relevant message (same as click behavior)
        if (can.reason === "waiting")
          setStatusMsg("Waiting for second player...");
        if (can.reason === "spectator")
          setStatusMsg("You are a spectator and cannot move pieces.");
        if (can.reason === "not-your-turn") setStatusMsg("Not your turn.");
        if (can.reason === "game-over")
          setStatusMsg("Game is over — no more moves allowed.");
        return;
      }

      // Determine origin. Prefer event.dataTransfer, fallback to current selected state
      let fromSquare = null;
      try {
        if (event && event.dataTransfer) {
          const dt = event.dataTransfer.getData("text/plain");
          if (dt) fromSquare = String(dt);
        }
      } catch (e) {
        // ignore
      }
      if (!fromSquare) fromSquare = selected;

      if (!fromSquare) {
        // nothing to do
        return;
      }

      // If dropped on same square, just deselect
      if (fromSquare === toSquare) {
        setSelected(null);
        setLegalMoves([]);
        setLegalMovesVerbose([]);
        return;
      }

      // Try the same attemptMove path you already use
      const res = attemptMove(fromSquare, toSquare);
      if (!(res && res.pendingPromotion)) {
        // clear selection after move or illegal attempt
        setSelected(null);
        setLegalMoves([]);
        setLegalMovesVerbose([]);
      }
    } catch (e) {
      // ignore errors
      setSelected(null);
      setLegalMoves([]);
      setLegalMovesVerbose([]);
    }
  }

  // Keep a small guard so we don't push route repeatedly
  const lastPushedRoomRef = useRef(null);

  function stopReplayImpl() {
    replayRef.current.playing = false;
    if (replayRef.current.timer) {
      clearTimeout(replayRef.current.timer);
      replayRef.current.timer = null;
    }
  }

  // Reset UI/ephemeral client state for a room transition (safe, non-destructive)
  function resetForNewRoom(newRoomId = null) {
    try {
      stopReplayImpl();
    } catch (e) {}
    try {
      chessRef.current = new Chess();
    } catch {
      chessRef.current = new Chess();
    }
    lastIndexRef.current = -1;
    setMoveHistory([]);
    setSelected(null);
    setLegalMoves([]);
    setLegalMovesVerbose([]);
    setAnalysisIndex(null);
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
    setMyPendingDrawOffer(false);
    prevPendingRef.current = null;
    setPlayers([]);
    setClocks({ w: null, b: null, running: null });
    prevClocksRef.current = { w: null, b: null };
    prevSecondsRef.current = { w: null, b: null };
    // ensure redux fen is in-sync with fresh board
    try {
      dispatch(setFenRedux(chessRef.current.fen()));
    } catch (e) {}
    refreshUI();
    try {
      lastPushedRoomRef.current = newRoomId;
    } catch (e) {}

    // also stop any timerLow sound runners when switching rooms
    try {
      soundManager.stopTimerLow();
      timerLowRunningRef.current = false;
    } catch (e) {}
    // reset players count
    prevPlayersCountRef.current = 0;
  }

  /* ---------- Fullscreen additions ---------- */
  const boardBoxRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync fullscreen state when user exits via ESC or browser controls
  useEffect(() => {
    function onFSChange() {
      const fsElement =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement;
      // if the fullscreen element is the boardBoxRef element, we consider fullscreen active
      const isFS =
        !!fsElement && boardBoxRef.current && fsElement === boardBoxRef.current;
      setIsFullscreen(isFS);
    }
    document.addEventListener("fullscreenchange", onFSChange);
    document.addEventListener("webkitfullscreenchange", onFSChange);
    document.addEventListener("mozfullscreenchange", onFSChange);
    document.addEventListener("MSFullscreenChange", onFSChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFSChange);
      document.removeEventListener("webkitfullscreenchange", onFSChange);
      document.removeEventListener("mozfullscreenchange", onFSChange);
      document.removeEventListener("MSFullscreenChange", onFSChange);
    };
  }, []);

  // Toggle fullscreen using Fullscreen API
  const toggleFullscreen = useCallback(async () => {
    try {
      const el = boardBoxRef.current;
      if (!el) return;
      const doc = document;
      const fsElement =
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement;
      if (!fsElement) {
        // request fullscreen on the board container
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          // Safari
          // @ts-ignore
          await el.webkitRequestFullscreen();
        } else if (el.mozRequestFullScreen) {
          // Firefox
          // @ts-ignore
          await el.mozRequestFullScreen();
        } else if (el.msRequestFullscreen) {
          // IE/Edge
          // @ts-ignore
          await el.msRequestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          // @ts-ignore
          await doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          // @ts-ignore
          await doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          // @ts-ignore
          await doc.msExitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (e) {
      // ignore fullscreen errors
    }
  }, []);

  // Keyboard shortcut: press 'f' to toggle fullscreen
  useEffect(() => {
    function onKey(e) {
      if (e.key === "f" || e.key === "F") {
        // avoid typing into inputs triggering this
        const tag = (e.target && e.target.tagName) || "";
        if (["INPUT", "TEXTAREA"].includes(tag)) return;
        toggleFullscreen();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  /* ---------- Socket init / handlers ---------- */
  useEffect(() => {
    const s = initSocket();
    socketRef.current = s;

    // if spectatorOnly, mark attemptedSeatRef so we don't auto-seat later
    attemptedSeatRef.current = spectatorOnly;

    const resumeAudioOnGesture = () => {
      try {
        soundManager.ensureContextOnGesture();
        if (soundManager.ctx && soundManager.ctx.state === "suspended") {
          soundManager.ctx.resume().catch(() => {});
        }
      } catch (e) {}
      document.removeEventListener("click", resumeAudioOnGesture);
      document.removeEventListener("keydown", resumeAudioOnGesture);
    };
    document.addEventListener("click", resumeAudioOnGesture);
    document.addEventListener("keydown", resumeAudioOnGesture);

    // Ensure SoundManager listens for gesture if not already
    try {
      soundManager.ensureContextOnGesture();
    } catch (e) {}

    // Important: DO NOT auto-join from URL here.
    // If Redux already has a roomId, request sync so UI updates.
    s.on("connect", () => {
      if (gameState.roomId) {
        try {
          s.emit("request-sync", { roomId: gameState.roomId });
        } catch (e) {}
      }
    });

    // handle server-assigned color
    s.on("player-assigned", ({ color }) => {
      dispatch(setPlayerColor(color));
      setStatusMsg(
        color === "spectator"
          ? "You are a spectator"
          : `You are ${color === "w" ? "White" : "Black"}`
      );
    });

    // room-update: dispatch joinRoomSuccess and UI updates
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
      dispatch(joinRoomSuccess(r));
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

      // keep original flow
      setPlayers(r.players || []);
      setClocks(r.clocks || { w: null, b: null, running: null });
      setMoveHistory(r.moves || []);
      if (analysisIndex !== null) setAnalysisIndex(null);

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

      refreshUI();
      const colored = (r.players || []).filter(
        (p) => p.color === "w" || p.color === "b"
      );

      // NEW: detect start-of-game transition: previously <2 players, now >=2 and not finished
      try {
        const prevCount = prevPlayersCountRef.current || 0;
        const newCount = colored.length || 0;
        if (newCount >= 2 && prevCount < 2 && !r.finished) {
          // play game start sound (respect moveSoundEnabled)
          try {
            if (moveSoundEnabled) soundManager.playStart();
          } catch (e) {}
        }
        prevPlayersCountRef.current = newCount;
      } catch (e) {}

      if (r.finished) {
        // game finished — keep finished message
        setStatusMsg(r.finished.message || "Game finished");
      } else if (colored.length < 2) {
        setStatusMsg("Waiting for second player...");
      } else {
        setStatusMsg("Game ready");
      }

      // client-side enrichment unchanged (fetch missing user profiles)
      (async () => {
        try {
          const rawPlayers = r.players || [];
          const needFetchIds = rawPlayers
            // consider explicit user id (p.user.id) OR top-level p.id from rooms endpoint
            .map((p) => p?.user?.id || p?.user?._id || p?.id)
            .filter(Boolean)
            .filter((id) => {
              // find the player record that referred to this id (either nested user or top-level)
              const pl = rawPlayers.find(
                (x) =>
                  (x.user && (x.user.id === id || x.user._id === id)) ||
                  x.id === id
              );
              if (!pl) return false;
              const u = pl.user || {};
              // If essential profile fields are missing OR cups is missing (undefined/null), fetch.
              // Note: allow cups === 0 (a valid value), only fetch when cups is undefined or null.
              const missingProfile =
                !u.username || !u.displayName || !u.avatarUrl;
              const missingCups =
                typeof u.cups === "undefined" || u.cups === null;
              return missingProfile || missingCups;
            });

          if (!needFetchIds.length) return;

          const uniqueIds = [...new Set(needFetchIds)];
          // call /api/players/:id (server exposes players routes, not /api/users)
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
                normalizeAvatarUrlFromAuthUser(res) ||
                res.avatarUrlAbsolute ||
                res.avatarUrl ||
                res.avatar ||
                null;
              byId[String(uid)] = { ...res, avatarUrl: normalizedAvatar };
            }
          });

          const enriched = rawPlayers.map((pl) => {
            // support both nested user and top-level id
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

          // update redux + local state with enriched players
          dispatch(joinRoomSuccess({ ...r, players: enriched }));
          setPlayers(enriched);
        } catch (e) {
          // ignore enrichment errors
        }
      })();

      // If redux roomId exists, ensure canonical URL
      try {
        const rid = gameState.roomId || r?.roomId || null;
        if (rid && lastPushedRoomRef.current !== rid) {
          lastPushedRoomRef.current = rid;
          router.replace(`/play/${encodeURIComponent(rid)}`);
        }
      } catch (e) {}
    });

    // When server notifies no such room
    s.on("no-such-room", ({ roomId: rid }) => {
      setStatusMsg(`No room with id ${rid}`);
      try {
        lastPushedRoomRef.current = null;
        router.replace("/play");
      } catch (e) {}
      try {
        if (gameState.roomId === rid) {
          dispatch(setRoomId(null));
        }
      } catch (e) {}
      // reset UI state so clocks/moves don't leak from previous room
      try {
        resetForNewRoom(null);
      } catch (e) {}
    });

    s.on("room-created", (payload) => {
      if (!payload) return;
      if (payload.ok) {
        setRoomText(payload.roomId || "");
        dispatch(setRoomId(payload.roomId || ""));
        setStatusMsg(`Room ${payload.roomId} created`);
        // push to route /play/<roomId>
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
          dispatch(opponentMove(record));
          if (record.fen) {
            try {
              chessRef.current.load(record.fen);
            } catch {}
          }
          if (record.clocks) setClocks(record.clocks);
          // try to use positional playback sound if possible
          try {
            const from = record.move?.from || null;
            const to = record.move?.to || null;
            playMoveSound(!!res.captured, from, to);
          } catch (e) {
            playMoveSound(!!res.captured);
          }

          // NEW: special-case sounds for opponent move (promotion / castle)
          try {
            if (moveSoundEnabled && res) {
              // promotion (res.promotion is usually present for promotions)
              if (res.promotion) {
                try {
                  soundManager.playPromotion();
                } catch (e) {}
              }
              // castle: chess.js flags often contain 'k' (kingside) or 'q' (queenside)
              const flags = res.flags || "";
              const san = (res.san || "").toString();
              if (
                flags.toString().includes("k") ||
                flags.toString().includes("q") ||
                san.includes("O-O")
              ) {
                try {
                  soundManager.playCastle();
                } catch (e) {}
              }
            }
          } catch (e) {}

          refreshUI();
        } else {
          s.emit("request-sync", { roomId: gameState.roomId });
        }
      } catch (e) {
        s.emit("request-sync", { roomId: gameState.roomId });
      }
    });

    s.on("chat-message", (msg) => {
      try {
        dispatch(addMessage(msg));
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
        setSelected(null);
        setLegalMoves([]);
        setLegalMovesVerbose([]);
        setAnalysisIndex(null);
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
          dispatch(setFenRedux(chessRef.current.fen()));
        } catch (e) {}
        refreshUI();

        // NEW: play start sound for rematch started (respect user toggle)
        try {
          if (moveSoundEnabled) soundManager.playStart();
        } catch (e) {}

        // NEW: if server started a rematch in a NEW room, redirect client to that room and request sync.
        try {
          const newRoomId = payload.roomId || null;
          // Only navigate if we actually received a new room id and we're not already on it.
          if (
            newRoomId &&
            String(newRoomId).trim() &&
            lastPushedRoomRef.current !== newRoomId
          ) {
            dispatch(setRoomId(newRoomId));
            lastPushedRoomRef.current = newRoomId;
            try {
              router.push(`/play/${encodeURIComponent(newRoomId)}`);
            } catch (e) {}
            try {
              socketRef.current?.emit("request-sync", { roomId: newRoomId });
            } catch (e) {}
          }
        } catch (e) {
          // non-fatal
        }
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

      // play a sound for checkmate if reason indicates checkmate
      try {
        if (payload?.reason === "checkmate") {
          if (moveSoundEnabled) soundManager.playCheckmate();
        }
      } catch (e) {}

      // stop any timerLow sequence if running
      try {
        soundManager.stopTimerLow();
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

  /* New effect: if we are in a room but currently a spectator, and auth.user becomes available,
     attempt a single join-room to let server seat us (avoids spamming). */
  useEffect(() => {
    try {
      const s = socketRef.current;
      const roomId = gameState.roomId;
      const myColor = gameState.playerColor;
      const hasAuthUser = !!(
        auth &&
        auth.user &&
        (auth.user.id || auth.user._id)
      );
      if (!s || !s.connected || !roomId) return;

      // If already a player, nothing to do
      if (myColor === "w" || myColor === "b") {
        attemptedSeatRef.current = false;
        return;
      }

      // Try only once after auth becomes available
      if (attemptedSeatRef.current) return;

      // If component was mounted in spectatorOnly mode, do not attempt to take a seat
      if (spectatorOnly) {
        attemptedSeatRef.current = true;
        return;
      }

      // prefer fresh localStorage user if present
      let userToSend = { username: "guest" };
      const storedUser = (() => {
        try {
          return typeof window !== "undefined" && localStorage.getItem("user")
            ? JSON.parse(localStorage.getItem("user"))
            : null;
        } catch {
          return null;
        }
      })();
      if (storedUser) {
        const avatar = normalizeAvatarUrlFromAuthUser(storedUser);
        userToSend = {
          id: storedUser.id || storedUser._id,
          username: storedUser.username,
          displayName: storedUser.displayName,
          avatarUrl: avatar,
        };
      } else if (hasAuthUser) {
        const a = auth.user;
        const avatar = normalizeAvatarUrlFromAuthUser(a);
        userToSend = {
          id: a.id || a._id,
          username: a.username,
          displayName: a.displayName,
          avatarUrl: avatar,
        };
      }

      try {
        s.emit("join-room", { roomId, user: userToSend });
        setStatusMsg("Attempting to take a seat in the room...");
        attemptedSeatRef.current = true;

        // ensure URL path is canonical
        try {
          if (lastPushedRoomRef.current !== roomId) {
            lastPushedRoomRef.current = roomId;
            router.push(`/play/${encodeURIComponent(roomId)}`);
          }
        } catch (e) {}
      } catch (e) {
        // ignore
      }
    } catch (e) {
      // ignore
    }
  }, [auth?.user?.id, gameState.roomId, gameState.playerColor]);

  /* Effect: reset UI when the active roomId changes (prevents leaking clocks/moves between rooms) */
  useEffect(() => {
    const current = gameState.roomId || null;
    const prev = prevRoomRef.current || null;
    if (prev !== current) {
      try {
        resetForNewRoom(current);
      } catch (e) {}
      prevRoomRef.current = current;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.roomId]);

  /* --- helpers / game logic / replay / UI code --- */
  function boardMatrix() {
    try {
      return chessRef.current.board();
    } catch {
      return Array.from({ length: 8 }, () => Array(8).fill(null));
    }
  }

  function invokeBoolMethod(possibleNames = []) {
    try {
      if (!chessRef.current) return false;
      for (const name of possibleNames) {
        const fn = chessRef.current[name];
        if (typeof fn === "function") {
          try {
            const res = fn.call(chessRef.current);
            return !!res;
          } catch {
            continue;
          }
        }
      }
    } catch {}
    return false;
  }

  function gameStatus() {
    if (invokeBoolMethod(["in_checkmate", "inCheckmate", "isCheckmate"]))
      return { text: "Checkmate", over: true };
    if (invokeBoolMethod(["in_stalemate", "inStalemate", "isStalemate"]))
      return { text: "Stalemate", over: true };
    if (invokeBoolMethod(["in_draw", "inDraw", "isDraw"]))
      return { text: "Draw", over: true };
    if (
      invokeBoolMethod([
        "in_threefold_repetition",
        "inThreefoldRepetition",
        "isThreefoldRepetition",
      ])
    )
      return { text: "Draw (3-fold repetition)", over: true };
    if (
      invokeBoolMethod([
        "insufficient_material",
        "insufficientMaterial",
        "isInsufficientMaterial",
      ])
    )
      return { text: "Draw (insufficient material)", over: true };
    if (invokeBoolMethod(["in_check", "inCheck", "isInCheck", "isCheck"]))
      return { text: "Check", over: false };
    return { text: "Ongoing", over: false };
  }

  // Local promotion normalization (client-side)
  function normalizePromotionCharLocal(p) {
    if (!p) return null;
    try {
      const s = String(p).trim().toLowerCase();
      if (!s) return null;
      if (s === "q" || s.includes("queen")) return "q";
      if (s === "r" || s.includes("rook")) return "r";
      if (s === "n" || s.includes("knight") || s === "k") return "n";
      if (
        s === "b" ||
        s.includes("bishop") ||
        s.includes("eleph") ||
        s.includes("elephant")
      )
        return "b";
      const first = s[0];
      if (["q", "r", "n", "b"].includes(first)) return first;
      return null;
    } catch (e) {
      return null;
    }
  }

  function attemptMove(from, to) {
    const moves = chessRef.current.moves({ square: from, verbose: true });
    const found = moves.find((m) => m.to === to);
    if (!found) return { ok: false, reason: "illegal" };
    const needsPromotion =
      found.promotion ||
      (found.piece === "p" && (to[1] === "8" || to[1] === "1"));
    if (needsPromotion) {
      setPromotionRequest({
        from,
        to,
        callback: (promotion) => finalizeMove({ from, to, promotion }),
      });
      return { ok: true, pendingPromotion: true };
    }
    return finalizeMove({ from, to, promotion: found.promotion || "q" });
  }

  function finalizeMove({ from, to, promotion }) {
    const moveObj = { from, to, promotion };
    // normalize promotion char before attempting local move
    if (moveObj.promotion) {
      const p = normalizePromotionCharLocal(moveObj.promotion);
      if (p) moveObj.promotion = p;
      else delete moveObj.promotion;
    }

    const result = chessRef.current.move(moveObj);
    if (!result) {
      setStatusMsg("Illegal move locally — requesting sync");
      socketRef.current?.emit("request-sync", { roomId: gameState.roomId });
      return { ok: false, reason: "illegal_local" };
    }

    // positional sound with from/to
    playMoveSound(!!result.captured, from, to);

    // NEW: if this move was a promotion or a castle, play the appropriate special sound
    try {
      if (moveSoundEnabled && result) {
        if (result.promotion) {
          try {
            soundManager.playPromotion();
          } catch (e) {}
        }
        const flags = result.flags || "";
        const san = (result.san || "").toString();
        if (
          flags.toString().includes("k") ||
          flags.toString().includes("q") ||
          san.includes("O-O")
        ) {
          try {
            soundManager.playCastle();
          } catch (e) {}
        }
      }
    } catch (e) {}

    refreshUI();
    const localPayload = { ...moveObj, fen: chessRef.current.fen() };
    dispatch(localMove(localPayload));
    setMoveHistory((mh) => [
      ...mh,
      {
        index: (lastIndexRef.current ?? -1) + 1,
        move: moveObj,
        fen: chessRef.current.fen(),
      },
    ]);

    // --- immediate local detection of checkmate/stalemate ---
    try {
      const status = gameStatus(); // uses chessRef.current
      if (status.over && status.text === "Checkmate") {
        const winnerColor = result.color; // 'w' | 'b' (mover)
        setGameOverState({
          over: true,
          reason: "checkmate",
          winner: winnerColor,
          loser: winnerColor === "w" ? "b" : "w",
          message: `${winnerColor.toUpperCase()} wins by checkmate`,
        });
        setStatusMsg(`${winnerColor.toUpperCase()} wins by checkmate`);
        stopReplayImpl();
        try {
          if (moveSoundEnabled) soundManager.playCheckmate();
        } catch (e) {}
      } else if (status.over && status.text.includes("Draw")) {
        setGameOverState({
          over: true,
          reason: "draw",
          winner: null,
          loser: null,
          message: status.text,
        });
        setStatusMsg(status.text);
        stopReplayImpl();
      }
    } catch (e) {
      // ignore detection errors (server will correct)
    }

    try {
      const s = socketRef.current;
      if (s && gameState.roomId)
        s.emit("make-move", { roomId: gameState.roomId, move: moveObj });
    } catch (e) {}
    return { ok: true };
  }

  function handleSquareClick(square) {
    if (analysisIndex !== null) {
      setStatusMsg("Exit history view to play a move");
      return;
    }

    const can = canMakeMove();
    if (!can.ok) {
      if (can.reason === "waiting")
        setStatusMsg("Waiting for second player...");
      if (can.reason === "spectator")
        setStatusMsg("You are a spectator and cannot move pieces.");
      if (can.reason === "not-your-turn") setStatusMsg("Not your turn.");
      if (can.reason === "game-over")
        setStatusMsg("Game is over — no more moves allowed.");
      return;
    }

    const piece = chessRef.current.get(square);

    // If there's already a selected square, handle switching/deselecting first
    if (selected) {
      // Clicking same square toggles deselect
      if (selected === square) {
        setSelected(null);
        setLegalMoves([]);
        setLegalMovesVerbose([]);
        return;
      }

      // If the clicked square has one of your own pieces, switch selection immediately
      // (this avoids attempting an illegal move that would clear the selection)
      if (piece && piece.color === chessRef.current.turn()) {
        setSelected(square);
        const movesVerbose = chessRef.current.moves({ square, verbose: true });
        setLegalMovesVerbose(movesVerbose);
        setLegalMoves(movesVerbose.map((m) => m.to));
        return;
      }

      // Otherwise try to move the previously selected piece to this square
      const res = attemptMove(selected, square);
      if (!(res && res.pendingPromotion)) {
        setSelected(null);
        setLegalMoves([]);
        setLegalMovesVerbose([]);
      }
      return;
    }

    // No selection yet: select a piece if it is your color, otherwise do nothing
    if (piece && piece.color === chessRef.current.turn()) {
      setSelected(square);
      const movesVerbose = chessRef.current.moves({ square, verbose: true });
      setLegalMovesVerbose(movesVerbose);
      const moves = movesVerbose.map((m) => m.to);
      setLegalMoves(moves);
    } else {
      setSelected(null);
      setLegalMoves([]);
      setLegalMovesVerbose([]);
    }
  }

  function canMakeMove() {
    if (gameOverState?.over) return { ok: false, reason: "game-over" };

    const colored = (gameState.players || []).filter(
      (p) => p.color === "w" || p.color === "b"
    );
    if (colored.length < 2) return { ok: false, reason: "waiting" };
    const myColor = gameState.playerColor;
    if (!myColor || myColor === "spectator")
      return { ok: false, reason: "spectator" };
    const turn = chessRef.current.turn();
    if (turn !== myColor) return { ok: false, reason: "not-your-turn" };
    return { ok: true };
  }

  // JOIN FLOW: show modal, check room, then join if user confirms.
  const openJoinModal = useCallback(() => {
    setJoinModalOpen(true);
    setJoinInput("");
    setJoinResult(null);
    setJoinChecking(false);
  }, []);

  const closeJoinModal = useCallback(() => {
    setJoinModalOpen(false);
    setJoinInput("");
    setJoinResult(null);
    setJoinChecking(false);
  }, []);

  async function checkRoomId(roomId) {
    const rid = String(roomId || "").trim();
    if (!rid) {
      setJoinResult({ ok: false, error: "Please enter a room id" });
      return;
    }
    setJoinChecking(true);
    setJoinResult(null);
    try {
      const base = API.replace(/\/api\/?$/, "");
      const res = await fetch(`${base}/api/rooms/${encodeURIComponent(rid)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setJoinResult({
          ok: false,
          error:
            err && err.error
              ? err.error
              : `Room ${rid} not found (status ${res.status})`,
        });
      } else {
        const info = await res.json();
        setJoinResult({ ok: true, room: info });
        // prefill roomText so UI shows the room selected
        setRoomText(rid);
      }
    } catch (err) {
      setJoinResult({ ok: false, error: "Network error while checking room" });
    } finally {
      setJoinChecking(false);
    }
  }

  const confirmJoinRoom = useCallback(
    async (roomIdOverride = null) => {
      const rid = (roomIdOverride || joinInput || roomText || "").trim();
      if (!rid) {
        setStatusMsg("No room id specified");
        return;
      }
      // ensure we have validated joinResult (quick guard)
      if (!joinResult || !joinResult.ok || joinResult.room?.roomId !== rid) {
        // If joinResult not present or mismatch, check first
        await checkRoomId(rid);
        if (!joinResult || !joinResult.ok) {
          return;
        }
      }

      // before performing join, ensure the checked room isn't finished
      if (joinResult && joinResult.room && joinResult.room.finished) {
        setStatusMsg("This room is already finished and cannot be joined.");
        return;
      }

      // join: set redux, push canonical URL and emit join-room to socket
      try {
        dispatch(setRoomId(rid));
        lastPushedRoomRef.current = rid;
        router.push(`/play/${encodeURIComponent(rid)}`);
      } catch (e) {}
      // build user payload similar to existing logic
      let userToSend = { username: "guest" };
      if (auth && auth.user) {
        const authUser = auth.user;
        const avatar = normalizeAvatarUrlFromAuthUser(authUser);
        userToSend = {
          id: authUser.id,
          username: authUser.username,
          displayName: authUser.displayName,
          avatarUrl: avatar,
        };
      } else {
        const storedUser = readUserFromStorage();
        if (storedUser) {
          const avatar = normalizeAvatarUrlFromAuthUser(storedUser);
          userToSend = {
            id: storedUser.id || storedUser._id,
            username: storedUser.username,
            displayName: storedUser.displayName,
            avatarUrl: avatar,
          };
        }
      }
      try {
        socketRef.current?.emit("join-room", { roomId: rid, user: userToSend });
        setStatusMsg("Joining room...");
        lastIndexRef.current = -1;
      } catch (e) {
        setStatusMsg("Failed to join room (socket error)");
      } finally {
        setJoinModalOpen(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [joinInput, joinResult, roomText, auth]
  );

  const joinRoom = useCallback(() => {
    openJoinModal();
  }, [openJoinModal]);

  function resetLocal() {
    chessRef.current = new Chess();
    setMoveHistory([]);
    setSelected(null);
    setLegalMoves([]);
    setLegalMovesVerbose([]);
    setStatusMsg("Local reset");
    setGameOverState({
      over: false,
      reason: null,
      winner: null,
      loser: null,
      message: null,
    });
    refreshUI();
  }

  function onPromotionChoose(piece) {
    if (!promotionRequest) return;
    const { from, to, callback } = promotionRequest;
    setPromotionRequest(null);
    const p = normalizePromotionCharLocal(piece) || "q"; // fallback to queen
    callback(p);
    setSelected(null);
    setLegalMoves([]);
    setLegalMovesVerbose([]);
  }

  // If initialRoomId prop is provided (we are on /play/[roomId] route),
  // validate and auto-join once on mount.
  useEffect(() => {
    if (!initialRoomId) return;
    (async () => {
      const rid = String(initialRoomId || "").trim();
      if (!rid) return;
      try {
        const base = API.replace(/\/api\/?$/, "");
        const res = await fetch(
          `${base}/api/rooms/${encodeURIComponent(rid)}`,
          {
            credentials: "include",
          }
        );
        if (!res.ok) {
          // Room doesn't exist — go back to /play with message
          setStatusMsg(`Room ${rid} not found`);
          try {
            router.replace("/play");
          } catch (e) {}
          return;
        }
        // room exists — set roomId
        dispatch(setRoomId(rid));
        lastPushedRoomRef.current = rid;
        try {
          // if spectatorOnly, keep the URL with spectate=1 parameter so PlayRoomPage knows
          if (spectatorOnly) {
            router.replace(`/play/${encodeURIComponent(rid)}?spectate=1`);
            setStatusMsg("Viewing as spectator");
          } else {
            router.replace(`/play/${encodeURIComponent(rid)}`);
            setStatusMsg("Joining room...");
          }
        } catch (e) {}
        // emit join-room (unless spectatorOnly) OR request sync for spectator
        let userToSend = { username: "guest" };
        if (!spectatorOnly) {
          if (auth && auth.user) {
            const authUser = auth.user;
            const avatar = normalizeAvatarUrlFromAuthUser(authUser);
            userToSend = {
              id: authUser.id,
              username: authUser.username,
              displayName: authUser.displayName,
              avatarUrl: avatar,
            };
          } else {
            const storedUser = readUserFromStorage();
            if (storedUser) {
              const avatar = normalizeAvatarUrlFromAuthUser(storedUser);
              userToSend = {
                id: storedUser.id || storedUser._id,
                username: storedUser.username,
                displayName: storedUser.displayName,
                avatarUrl: avatar,
              };
            }
          }
          socketRef.current?.emit("join-room", {
            roomId: rid,
            user: userToSend,
          });
        } else {
          // spectator: do not request to take a seat, just request sync so we receive room-update, moves, messages
          try {
            socketRef.current?.emit("request-sync", { roomId: rid });
            attemptedSeatRef.current = true; // prevent auto-seat later
          } catch (e) {}
        }
      } catch (err) {
        setStatusMsg("Failed to auto-join room");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoomId, spectatorOnly]);

  useEffect(() => {
    if (gameState.moves && gameState.moves.length !== moveHistory.length) {
      setMoveHistory(gameState.moves);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.moves]);

  useEffect(() => {
    const prev = prevClocksRef.current || { w: null, b: null };
    const curr = clocks || { w: null, b: null };

    const checkAndHandle = (color) => {
      const prevVal = prev[color];
      const currVal = curr[color];
      if (
        (prevVal === null || prevVal > 0) &&
        typeof currVal === "number" &&
        currVal <= 0
      ) {
        if (!gameOverState.over) {
          const loser = color;
          const winner = loser === "w" ? "Black" : "White";

          setGameOverState({ over: true, reason: "timeout", winner, loser });
          setStatusMsg(`Game over — ${winner} wins by timeout`);
          stopReplayImpl();
          try {
            socketRef.current?.emit("player-timeout", {
              roomId: gameState.roomId,
              loser,
            });
          } catch (e) {}
        }
      }
    };

    checkAndHandle("w");
    checkAndHandle("b");

    try {
      const running = clocks.running;
      if (running) {
        const secKey = running;
        const prevSec = prevSecondsRef.current[secKey];
        const currSec =
          typeof clocks[secKey] === "number"
            ? Math.ceil(clocks[secKey] / 1000)
            : null;

        if (prevSec !== null && currSec !== null && currSec < prevSec) {
          playTick();
        }

        // NEW: start/stop last-10s warning
        try {
          // if tick sounds are disabled, don't start the timerLow sequence
          if (tickSoundEnabled) {
            if (
              currSec !== null &&
              currSec <= 10 &&
              currSec > 0 &&
              !timerLowRunningRef.current
            ) {
              // start countdown sequence: play as many ticks as remain or up to 10
              const count = Math.min(currSec, 10);
              soundManager.playTimerLow(count, { interval: 1000 });
              timerLowRunningRef.current = true;
            } else if (
              (currSec !== null &&
                currSec > 10 &&
                timerLowRunningRef.current) ||
              (currSec !== null && currSec <= 0 && timerLowRunningRef.current)
            ) {
              soundManager.stopTimerLow();
              timerLowRunningRef.current = false;
            }
          } else {
            // if user disabled tick sounds, ensure nothing is running
            if (timerLowRunningRef.current) {
              soundManager.stopTimerLow();
              timerLowRunningRef.current = false;
            }
          }
        } catch (e) {}

        prevSecondsRef.current[secKey] = currSec;
      }
    } catch (e) {}

    prevClocksRef.current = { w: curr.w, b: curr.b };
  }, [clocks, gameOverState.over, gameState.roomId, tickSoundEnabled]);

  function getFenForMoveIndex(targetIndex) {
    if (!moveHistory || moveHistory.length === 0) return new Chess().fen();
    const chess = new Chess();
    for (let i = 0; i <= targetIndex && i < moveHistory.length; i++) {
      const rec = moveHistory[i];
      try {
        chess.move(rec.move);
      } catch {}
    }
    return chess.fen();
  }

  function jumpToMove(index) {
    if (index === null) {
      chessRef.current = new Chess(gameState.fen || undefined);
      setAnalysisIndex(null);
      refreshUI();
      return;
    }
    const fen = getFenForMoveIndex(index);
    try {
      chessRef.current.load(fen);
    } catch {
      chessRef.current = new Chess(fen);
    }
    setAnalysisIndex(index);
    refreshUI();
  }

  function startReplay(speed = 800) {
    stopReplayImpl();
    replayRef.current.playing = true;
    replayRef.current.speed = speed;
    let idx = -1;
    const playNext = () => {
      idx++;
      if (idx >= moveHistory.length) {
        stopReplayImpl();
        return;
      }
      jumpToMove(idx);
      replayRef.current.timer = setTimeout(
        playNext,
        replayRef.current.speed || speed
      );
    };
    playNext();
  }

  function stopReplay() {
    stopReplayImpl();
  }

  function exportPGN() {
    const chess = new Chess();
    moveHistory.forEach((m) => {
      try {
        chess.move(m.move);
      } catch {}
    });
    return chess.pgn();
  }

  function copyPGNToClipboard() {
    const pgn = exportPGN();
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(pgn).then(() => {
      setStatusMsg("PGN copied to clipboard");
      setTimeout(() => setStatusMsg(""), 1800);
    });
  }

  function capturedPiecesImages() {
    const initial = {
      w: { p: 8, r: 2, n: 2, b: 2, q: 1, k: 1 },
      b: { p: 8, r: 2, n: 2, b: 2, q: 1, k: 1 },
    };
    const current = { w: {}, b: {} };
    const board = chessRef.current.board();
    board.flat().forEach((cell) => {
      if (cell) {
        current[cell.color][cell.type] =
          (current[cell.color][cell.type] || 0) + 1;
      }
    });

    const captured = { w: [], b: [] };
    Object.keys(initial).forEach((color) => {
      Object.keys(initial[color]).forEach((t) => {
        const left = current[color][t] || 0;
        const capturedCount = initial[color][t] - left;
        for (let i = 0; i < capturedCount; i++) {
          if (color === "b")
            captured.w.push(getPieceImageUrl({ type: t, color: "b" }));
          else captured.b.push(getPieceImageUrl({ type: t, color: "w" }));
        }
      });
    });
    return captured;
  }

  // Offer/accept/decline draw logic
  const offerDraw = useCallback(() => {
    if (gameOverState.over) return;
    const s = socketRef.current;
    if (!s || !gameState.roomId) return;
    if (myPendingDrawOffer) {
      setStatusMsg("Draw already offered");
      return;
    }

    setMyPendingDrawOffer(true);
    setStatusMsg("Draw offered — waiting for opponent response");

    try {
      s.emit("offer-draw", { roomId: gameState.roomId });
    } catch (e) {
      setMyPendingDrawOffer(false);
      setStatusMsg("Failed to offer draw");
    }
  }, [gameOverState.over, gameState.roomId, myPendingDrawOffer, auth]);

  const acceptDraw = useCallback(() => {
    if (gameOverState.over) return;
    const s = socketRef.current;
    if (!s || !gameState.roomId) return;
    s.emit("accept-draw", { roomId: gameState.roomId });
    setDrawOffer(null);
    setStatusMsg("Draw accepted");
  }, [gameOverState.over, gameState.roomId]);

  const declineDraw = useCallback(() => {
    if (gameOverState.over) return;
    const s = socketRef.current;
    if (!s || !gameState.roomId) return;
    s.emit("decline-draw", { roomId: gameState.roomId });
    setDrawOffer(null);
    setStatusMsg("Draw declined");
  }, [gameOverState.over, gameState.roomId]);

  const resign = useCallback(() => {
    if (gameOverState.over) return;
    const s = socketRef.current;
    if (!s || !gameState.roomId) return;
    s.emit("resign", { roomId: gameState.roomId });
    setStatusMsg("You resigned");
  }, [gameOverState.over, gameState.roomId]);

  const leaveRoom = useCallback(() => {
    const s = socketRef.current;
    if (gameState.playerColor === "w" || gameState.playerColor === "b") {
      try {
        s?.emit("resign", { roomId: gameState.roomId });
      } catch (e) {}
    } else {
      try {
        s?.emit("leave-room", { roomId: gameState.roomId });
      } catch (e) {}
    }
    dispatch(leaveRoomAction());
    setStatusMsg("Left room");
    try {
      lastPushedRoomRef.current = null;
      router.push("/play");
    } catch (e) {}
    // reset UI on leave to avoid stale clocks/moves
    try {
      resetForNewRoom(null);
    } catch (e) {}
  }, [gameState.playerColor, gameState.roomId, dispatch, router]);

  // CREATE ROOM (client) - with activeRoom guard
  async function createRoom() {
    const s = socketRef.current;
    if (!s) return;

    // If auth user, check server whether they already have an activeRoom
    try {
      const uid = auth?.user?.id || auth?.user?._id;
      if (uid) {
        const base = API.replace(/\/api\/?$/, "");
        try {
          const res = await fetch(
            `${base}/api/players/${encodeURIComponent(uid)}`,
            {
              credentials: "include",
            }
          );
          if (res.ok) {
            const data = await res.json().catch(() => null);
            if (data && data.activeRoom) {
              // fire the global event so ActiveRoomModal opens
              try {
                window.dispatchEvent(
                  new CustomEvent("chessapp:join-denied-active-room", {
                    detail: {
                      activeRoom: data.activeRoom,
                      message: "You already have an active game.",
                    },
                  })
                );
              } catch (e) {}
              return;
            }
          }
        } catch (e) {
          // network error; we'll still attempt to create and let server reject if necessary
        }
      }
    } catch (e) {}

    const minutes = Number(createMinutes) || 5;
    const colorPreference = createColorPref || "random";
    const roomId =
      createCode && String(createCode).trim()
        ? String(createCode).trim()
        : undefined;

    let userToSend = { username: "guest" };
    if (auth && auth.user) {
      const authUser = auth.user;
      const avatar = normalizeAvatarUrlFromAuthUser(authUser);
      userToSend = {
        id: authUser.id,
        username: authUser.username,
        displayName: authUser.displayName,
        avatarUrl: avatar,
      };
    }

    s.emit("create-room", {
      roomId,
      minutes,
      colorPreference,
      user: userToSend,
    });
  }

  // REMATCH handlers (client-side)
  function sendPlayAgain() {
    const s = socketRef.current;
    if (!s || !gameState.roomId) return;
    setMyPendingRematch(true);
    setStatusMsg("Requesting rematch...");
    s.emit("play-again", { roomId: gameState.roomId });
  }

  function acceptPlayAgain() {
    const s = socketRef.current;
    if (!s || !gameState.roomId) return;
    setStatusMsg("Accepting rematch...");
    s.emit("accept-play-again", { roomId: gameState.roomId });
  }

  function declinePlayAgain() {
    const s = socketRef.current;
    if (!s || !gameState.roomId) return;
    s.emit("decline-play-again", { roomId: gameState.roomId });
    setRematchPending(null);
    setMyPendingRematch(false);
    setStatusMsg("Rematch declined");
  }

  function cancelMyRematchRequest() {
    declinePlayAgain();
  }

  const matrix = boardMatrix();
  const lastMove =
    moveHistory && moveHistory.length
      ? moveHistory[moveHistory.length - 1]
      : null;
  const capturedImgs = capturedPiecesImages();

  const isBlack = gameState.playerColor === "b";

  function findKingSquare(color) {
    const board = chessRef.current.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const cell = board[r][f];
        if (cell && cell.type === "k" && cell.color === color) {
          return FILES[f] + RANKS[r];
        }
      }
    }
    return null;
  }

  const inCheck = invokeBoolMethod([
    "in_check",
    "inCheck",
    "isInCheck",
    "isCheck",
  ]);
  const checkedColor = inCheck ? chessRef.current.turn() : null;
  const kingInCheckSquare = checkedColor ? findKingSquare(checkedColor) : null;

  const myId = auth?.user?.id || null;
  const pendingFromId = drawOffer?.from?.id || null;
  const isOfferToMe = drawOffer && pendingFromId && pendingFromId !== myId;

  // when fullscreen, hide sidebars/chat - user requested board-only fullscreen
  const effectiveHideSidebar = hideSidebar || isFullscreen;
  const effectiveHideRightChat = hideRightChat || isFullscreen;
  const effectiveHideCaptured = hideCaptured || isFullscreen;

  return (
    <div className={styles.wrapper}>
      {/* Always mount ActiveRoomModal so it can listen for events */}

      <div className={styles.playContainer}>
        <div
          className={`${styles.mainLayout} ${
            effectiveHideRightChat ? styles.mainLayoutHide : ""
          } ${isFullscreen ? styles.fullscreenActive || "" : ""}`}
        >
          {!effectiveHideSidebar && (
            <div className={styles.sidebarRes}>
              <div
                onClick={() => setSideBarResOpen(!isSideBarResOpen)}
                className={styles.menuIconBtn}
              >
                {!isSideBarResOpen ? (
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    id="Sidebar-Minimalistic--Streamline-Solar"
                    height="16"
                    width="16"
                  >
                    <desc>
                      Sidebar Minimalistic Streamline Icon:
                      https://streamlinehq.com
                    </desc>
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M2.1143799999999997 2.7810466666666667C1.3333333333333333 3.5620999999999996 1.3333333333333333 4.8191733333333335 1.3333333333333333 7.333333333333333v1.3333333333333333c0 2.514133333333333 0 3.7712666666666665 0.7810466666666667 4.552266666666666C2.895433333333333 14 4.152506666666667 14 6.666666666666666 14h2.6666666666666665l0.16666666666666666 0 0 -12c-0.054933333333333334 -0.00000666666666666667 -0.11046666666666666 0 -0.16666666666666666 0h-2.6666666666666665C4.152506666666667 2 2.895433333333333 2 2.1143799999999997 2.7810466666666667ZM10.5 2.0037266666666667l0 11.99254c1.7572666666666665 -0.0184 2.7360666666666664 -0.1277333333333333 3.3856 -0.7773333333333332C14.666666666666666 12.437933333333334 14.666666666666666 11.1808 14.666666666666666 8.666666666666666v-1.3333333333333333c0 -2.51416 0 -3.7712333333333334 -0.7810666666666666 -4.552286666666666 -0.6495333333333333 -0.6495533333333333 -1.6283333333333332 -0.7589066666666666 -3.3856 -0.77732Z"
                      fill="#000000"
                      strokeWidth="0.6667"
                    ></path>
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    id="Close-Circle--Streamline-Solar"
                    height="16"
                    width="16"
                  >
                    <desc>
                      Close Circle Streamline Icon: https://streamlinehq.com
                    </desc>
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M14.666666666666666 8c0 3.6818666666666666 -2.9848 6.666666666666666 -6.666666666666666 6.666666666666666 -3.6818999999999997 0 -6.666666666666666 -2.9848 -6.666666666666666 -6.666666666666666C1.3333333333333333 4.318099999999999 4.318099999999999 1.3333333333333333 8 1.3333333333333333c3.6818666666666666 0 6.666666666666666 2.9847666666666663 6.666666666666666 6.666666666666666ZM5.979753333333333 5.9797666666666665c0.19526 -0.19526 0.51184 -0.19526 0.7071133333333333 0L8 7.292866666666666l1.3130666666666666 -1.3130866666666665c0.19526666666666664 -0.19526 0.5118666666666667 -0.19526 0.7071333333333333 0 0.19526666666666664 0.19526 0.19526666666666664 0.5118466666666666 0 0.7070866666666666L8.707066666666666 8l1.3131333333333333 1.3130666666666666c0.19526666666666664 0.19526666666666664 0.19526666666666664 0.5118666666666667 0 0.7071333333333333 -0.19526666666666664 0.19526666666666664 -0.5118666666666667 0.19526666666666664 -0.7071333333333333 0L8 8.707133333333333l-1.3131333333333333 1.3130666666666666c-0.1952533333333333 0.19526666666666664 -0.51184 0.19526666666666664 -0.7071000000000001 0 -0.19526 -0.19526666666666664 -0.19526 -0.5118666666666667 0 -0.7070666666666666L7.292866666666666 8l-1.3131133333333334 -1.3131333333333333c-0.19526666666666664 -0.1952533333333333 -0.19526666666666664 -0.51184 0 -0.7071000000000001Z"
                      fill="#000000"
                      strokeWidth="0.6667"
                    ></path>
                  </svg>
                )}
              </div>
              <Sidebar
                gameState={gameState}
                statusMsg={statusMsg}
                gameOverState={gameOverState}
                offerDraw={offerDraw}
                resign={resign}
                copyPGNToClipboard={copyPGNToClipboard}
                leaveRoom={leaveRoom}
                sendPlayAgain={sendPlayAgain}
                myPendingRematch={myPendingRematch}
                moveSoundEnabled={moveSoundEnabled}
                tickSoundEnabled={tickSoundEnabled}
                setMoveSoundEnabled={setMoveSoundEnabled}
                setTickSoundEnabled={setTickSoundEnabled}
                moveHistory={moveHistory}
                analysisIndex={analysisIndex}
                jumpToMove={jumpToMove}
                startReplay={startReplay}
                stopReplay={stopReplay}
                getPieceImageUrl={getPieceImageUrl}
                isSideBarResOpen={isSideBarResOpen}
              />
            </div>
          )}

          <div
            className={styles.boardBox}
            ref={boardBoxRef}
            // When fullscreen is active we want the board container to occupy the full viewport.
            // CSS in project may already handle fullscreen element sizing; if not, inline styles below help.
          >
            {/* Fullscreen toggle button — placed inside board container */}

            <main className={styles.mainContent}>
              <div
                className={`${styles.boardContainer} ${
                  gameOverState.over ? styles.boardOver : ""
                }`}
                style={{
                  "--board-texture": "url('/texture.jpg')",
                  "--texture-opacity": 0.05,
                  "--texture-scale": 1.02,
                }}
              >
                <Board
                  matrix={matrix}
                  isBlack={isBlack}
                  selected={selected}
                  legalMoves={legalMoves}
                  legalMovesVerbose={legalMovesVerbose}
                  lastMove={lastMove}
                  kingInCheckSquare={kingInCheckSquare}
                  handleSquareClick={handleSquareClick}
                  getPieceImageUrl={getPieceImageUrl}
                  styles={styles}
                  onPieceDragStart={handlePieceDragStart}
                  onSquareDrop={handleSquareDrop}
                />
              </div>

              <button
                onClick={toggleFullscreen}
                aria-label="Toggle fullscreen (F)"
                title="Toggle fullscreen (F)"
                className={styles.fullScreenBtn}
              >
                ⤢
              </button>

              <PlayersPanel players={players} clocks={clocks} />
            </main>

            {!effectiveHideCaptured && (
              <CapturedPieces
                capturedImgs={capturedImgs}
                getPieceImageUrl={getPieceImageUrl}
              />
            )}
          </div>

          <RightPanel
            socketRef={socketRef}
            joinRoom={joinRoom}
            createCode={createCode}
            setCreateCode={setCreateCode}
            createMinutes={createMinutes}
            setCreateMinutes={setCreateMinutes}
            createColorPref={createColorPref}
            setCreateColorPref={setCreateColorPref}
            createRoom={createRoom}
            //
            open={joinModalOpen}
            onClose={closeJoinModal}
            joinInput={joinInput}
            setJoinInput={setJoinInput}
            checkRoomId={checkRoomId}
            joinChecking={joinChecking}
            joinResult={joinResult}
            confirmJoinRoom={confirmJoinRoom}
            API={API}
            readOnlyChat={spectatorOnly}
            hideRightChat={hideRightChat}
          >
            <VoicePanel
              socketRef={socketRef}
              players={players}
              auth={auth}
              gameState={gameState}
            />
          </RightPanel>
        </div>

        <PromotionModal
          promotionRequest={promotionRequest}
          onChoose={onPromotionChoose}
        />

        <DrawModal
          drawOffer={drawOffer}
          onAccept={acceptDraw}
          onDecline={declineDraw}
          isOfferToYou={isOfferToMe}
        />

        <RematchModal
          rematchPending={rematchPending}
          myPendingRematch={myPendingRematch}
          onAccept={acceptPlayAgain}
          onDecline={declinePlayAgain}
          onCancelRequest={cancelMyRematchRequest}
          mySocketId={socketRef.current?.id}
          myUserId={auth?.user?.id}
        />

        {/* {myPendingDrawOffer && !drawOffer && (
          <div className={`${styles.drawBadge} ${styles.drawBadgeFixed}`}>
            Draw offered — waiting for opponent
          </div>
        )} */}
      </div>
    </div>
  );
}
