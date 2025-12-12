"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
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

/* New imports: hooks and helpers that contain the big logic blocks */
import useChessSocket from "@/lib/chessBoardHooks/useChessSocket";
import useClockEffect from "@/lib/chessBoardHooks/useClockEffect";
import {
  normalizePromotionCharLocal,
  invokeBoolMethod,
  gameStatus,
  boardMatrix as helperBoardMatrix,
  getFenForMoveIndex as helperGetFenForMoveIndex,
  capturedPiecesImages as helperCapturedPiecesImages,
  findKingSquare as helperFindKingSquare,
} from "@/lib/chessBoardHooks/chessHelpers";
import {
  startReplayImpl,
  stopReplayImpl as stopReplayImplUtil,
  exportPGNImpl,
  copyPGNToClipboardImpl,
  jumpToMoveImpl,
  getFenForMoveIndexImpl,
} from "@/lib/chessBoardHooks/replayUtils";

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
    stopReplayImplUtil(replayRef);
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

  /* ---------- Fullscreen additions (kept here) ---------- */
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
  useChessSocket({
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
    setMoveHistory,
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
    dispatchJoinRoomSuccess: joinRoomSuccess,
    dispatchOpponentMove: opponentMove,
    dispatchLocalMove: localMove,
    dispatchAddMessage: addMessage,
    API,
    setJoinModalOpen,
    setJoinResult,
    setJoinChecking,
    setJoinInput,
    setRoomText,
  });

  /* New effect: spectator auto-seat attempt moved into useChessSocket (handled there) */

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
    return helperBoardMatrix(chessRef);
  }

  function invokeBoolMethodLocal(possibleNames = []) {
    return invokeBoolMethod(chessRef, possibleNames);
  }

  function gameStatusLocal() {
    return gameStatus(chessRef);
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
      const status = gameStatusLocal(); // uses chessRef.current
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

  /* useClockEffect: moves the clock/clocks effect logic to a separate hook */
  // Detect playingWithBot from players list (heuristic).
  const playingWithBot = useMemo(() => {
    if (!players || !players.length) return false;
    return players.some((p) => {
      if (!p) return false;
      const username = (p.username || p.displayName || p.name || "")
        .toString()
        .toLowerCase();
      if (username.includes("bot")) return true;
      if (p.isBot) return true;
      if (
        String(p.id || p.userId || "")
          .toLowerCase()
          .includes("bot")
      )
        return true;
      if (p.type && String(p.type).toLowerCase() === "bot") return true;
      return false;
    });
  }, [players]);

  useClockEffect({
    clocks,
    prevClocksRef,
    prevSecondsRef,
    prevClocksRefSetter: (v) => (prevClocksRef.current = v),
    gameOverState,
    setGameOverState,
    playTick,
    tickSoundEnabled,
    timerLowRunningRef,
    setStatusMsg,
    stopReplayImpl,
    socketRef,
    gameState,
    playingWithBot,
  });

  // Replay & export helpers (delegated to replayUtils)
  function getFenForMoveIndex(targetIndex) {
    return getFenForMoveIndexImpl({ moveHistory, targetIndex });
  }

  function jumpToMove(index) {
    return jumpToMoveImpl({
      index,
      moveHistory,
      chessRef,
      setAnalysisIndex,
      refreshUI,
    });
  }

  function startReplay(speed = 800) {
    return startReplayImpl({
      speed,
      replayRef,
      moveHistory,
      jumpToMove,
    });
  }

  function stopReplay() {
    stopReplayImpl();
  }

  function exportPGN() {
    return exportPGNImpl(moveHistory);
  }

  function copyPGNToClipboard() {
    return copyPGNToClipboardImpl(exportPGN, setStatusMsg);
  }

  function capturedPiecesImages() {
    return helperCapturedPiecesImages(chessRef);
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

  const matrix = boardMatrix();
  const lastMove =
    moveHistory && moveHistory.length
      ? moveHistory[moveHistory.length - 1]
      : null;
  const capturedImgs = capturedPiecesImages();

  const isBlack = gameState.playerColor === "b";

  function findKingSquare(color) {
    return helperFindKingSquare(chessRef, color, FILES, RANKS);
  }

  const inCheck = invokeBoolMethodLocal([
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
  // In bot mode we hide chat & live talk tabs — RightPanel will still render New Game.
  const effectiveHideRightChat =
    hideRightChat || isFullscreen || playingWithBot;
  const effectiveHideCaptured = hideCaptured || isFullscreen;

  return (
    <div className={styles.wrapper}>
      {/* Always mount ActiveRoomModal so it can listen for events */}
      <ActiveRoomModal />

      <div className={styles.playContainer}>
        <div
          className={`${styles.mainLayout} ${
            effectiveHideSidebar ? styles.mainLayoutHide : ""
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

            <div className={styles.mainContentDiv}>
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
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="36"
                    height="36"
                    fill="#000000"
                    viewBox="0 0 256 256"
                  >
                    <path d="M117.66,138.34a8,8,0,0,1,0,11.32L83.31,184l18.35,18.34A8,8,0,0,1,96,216H48a8,8,0,0,1-8-8V160a8,8,0,0,1,13.66-5.66L72,172.69l34.34-34.35A8,8,0,0,1,117.66,138.34ZM208,40H160a8,8,0,0,0-5.66,13.66L172.69,72l-34.35,34.34a8,8,0,0,0,11.32,11.32L184,83.31l18.34,18.35A8,8,0,0,0,216,96V48A8,8,0,0,0,208,40Z"></path>
                  </svg>
                </button>

                <PlayersPanel
                  players={players}
                  clocks={clocks}
                  playingWithBot={playingWithBot}
                />
              </main>
            </div>

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
            hideRightChat={effectiveHideRightChat}
            playingWithBot={playingWithBot}
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

// "use client";

// import React, {
//   useCallback,
//   useEffect,
//   useRef,
//   useState,
//   useMemo,
// } from "react";
// import { Chess } from "chess.js";
// import { initSocket } from "@/lib/socketClient";
// import styles from "@/styles/Chess.module.css";
// import { useDispatch, useSelector } from "react-redux";
// import {
//   setRoomId,
//   setPlayerColor,
//   joinRoomSuccess,
//   opponentMove,
//   localMove,
//   setFen as setFenRedux,
//   leaveRoom as leaveRoomAction,
//   addMessage,
// } from "@/store/slices/gameSlice";

// import HeaderControls from "@/components/chess/HeaderControls";
// import JoinModal from "@/components/chess/JoinModal";
// import Board from "@/components/chess/Board";
// import Sidebar from "@/components/chess/Sidebar";
// import RightPanel from "@/components/chess/RightPanel";

// import PromotionModal from "@/components/chess/PromotionModal";
// import DrawModal from "@/components/chess/DrawModal";
// import RematchModal from "@/components/chess/RematchModal";
// import VoicePanel from "@/components/VoicePanel";
// import GameOverPopup from "@/components/chess/GameOverPopup";

// import { useRouter } from "next/navigation";

// import {
//   getPieceImageUrl,
//   normalizeAvatarUrlFromAuthUser,
//   formatMs,
// } from "@/lib/chessUtils";
// import PlayersPanel from "./chess/PlayersPanel";
// import Clocks from "./chess/Clocks";
// import CapturedPieces from "./chess/CapturedPieces";

// import soundManager from "@/lib/soundManager";
// import ActiveRoomModal from "@/components/ActiveRoomModal";

// /* New imports: hooks and helpers that contain the big logic blocks */
// import useChessSocket from "@/lib/chessBoardHooks/useChessSocket";
// import useClockEffect from "@/lib/chessBoardHooks/useClockEffect";
// import {
//   normalizePromotionCharLocal,
//   invokeBoolMethod,
//   gameStatus,
//   boardMatrix as helperBoardMatrix,
//   getFenForMoveIndex as helperGetFenForMoveIndex,
//   capturedPiecesImages as helperCapturedPiecesImages,
//   findKingSquare as helperFindKingSquare,
// } from "@/lib/chessBoardHooks/chessHelpers";
// import {
//   startReplayImpl,
//   stopReplayImpl as stopReplayImplUtil,
//   exportPGNImpl,
//   copyPGNToClipboardImpl,
//   jumpToMoveImpl,
//   getFenForMoveIndexImpl,
// } from "@/lib/chessBoardHooks/replayUtils";

// /* Board coords */
// const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
// const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

// /* ---------------- Main Component ---------------- */
// export default function ChessBoard({
//   initialRoomId = null,
//   spectatorOnly = false,
//   hideSidebar = false,
//   hideRightChat = false,
//   hideCaptured = false,
//   setTabToNewGame = false,
// }) {
//   const dispatch = useDispatch();
//   const gameState = useSelector((s) => s.game);
//   const auth = useSelector((s) => s.auth);
//   const router = useRouter();

//   const chessRef = useRef(new Chess());
//   const socketRef = useRef(null);
//   const [, setTick] = useState(0);
//   const lastIndexRef = useRef(-1);
//   const [isSideBarResOpen, setSideBarResOpen] = useState(false);

//   const attemptedSeatRef = useRef(false); // guard to avoid auto-seat when spectator
//   const prevRoomRef = useRef(null);

//   // NEW: track previous players count to detect start-of-game transition
//   const prevPlayersCountRef = useRef(0);
//   // NEW: track timerLow running state so we can stop it
//   const timerLowRunningRef = useRef(false);

//   const [selected, setSelected] = useState(null);
//   const [legalMoves, setLegalMoves] = useState([]); // string squares
//   const [legalMovesVerbose, setLegalMovesVerbose] = useState([]); // verbose objects
//   const [promotionRequest, setPromotionRequest] = useState(null);
//   const [roomText, setRoomText] = useState("");
//   const [statusMsg, setStatusMsg] = useState("");

//   const [players, setPlayers] = useState([]);
//   const [clocks, setClocks] = useState({ w: null, b: null, running: null });

//   const [moveHistory, setMoveHistory] = useState([]);
//   const [analysisIndex, setAnalysisIndex] = useState(null);
//   const replayRef = useRef({ playing: false, timer: null, speed: 800 });

//   const [gameOverState, setGameOverState] = useState({
//     over: false,
//     reason: null,
//     winner: null,
//     loser: null,
//     message: null,
//   });

//   // Rematch states:
//   const [rematchPending, setRematchPending] = useState(null); // object when someone else requested
//   const [myPendingRematch, setMyPendingRematch] = useState(false); // true if I requested and waiting for opponent

//   const [drawOffer, setDrawOffer] = useState(null);
//   const [myPendingDrawOffer, setMyPendingDrawOffer] = useState(false);
//   const prevPendingRef = useRef(null);

//   const prevClocksRef = useRef({ w: null, b: null });
//   const prevSecondsRef = useRef({ w: null, b: null });

//   const [moveSoundEnabled, setMoveSoundEnabled] = useState(() => {
//     try {
//       if (typeof window === "undefined") return true;
//       const v = localStorage.getItem("moveSoundEnabled");
//       return v === null ? true : v === "1";
//     } catch (e) {
//       return true;
//     }
//   });
//   const [tickSoundEnabled, setTickSoundEnabled] = useState(() => {
//     try {
//       if (typeof window === "undefined") return true;
//       const v = localStorage.getItem("tickSoundEnabled");
//       return v === null ? true : v === "1";
//     } catch (e) {
//       return true;
//     }
//   });

//   // create-room UI state
//   const [createMinutes, setCreateMinutes] = useState(5);
//   const [createColorPref, setCreateColorPref] = useState("random");
//   const [createCode, setCreateCode] = useState("");

//   // Join modal state
//   const [joinModalOpen, setJoinModalOpen] = useState(false);
//   const [joinInput, setJoinInput] = useState("");
//   const [joinChecking, setJoinChecking] = useState(false);
//   const [joinResult, setJoinResult] = useState(null); // room info or error

//   const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

//   useEffect(() => {
//     try {
//       localStorage.setItem("moveSoundEnabled", moveSoundEnabled ? "1" : "0");
//     } catch (e) {}
//   }, [moveSoundEnabled]);

//   useEffect(() => {
//     try {
//       localStorage.setItem("tickSoundEnabled", tickSoundEnabled ? "1" : "0");
//     } catch (e) {}
//   }, [tickSoundEnabled]);

//   useEffect(() => {
//     console.log(players);
//   }, [players]);

//   function refreshUI() {
//     setTick((t) => t + 1);
//   }

//   // AUDIO: wrappers that call the SoundManager but respect existing toggles.
//   function playMoveSound(captured = false, from = null, to = null) {
//     if (!moveSoundEnabled) return;
//     try {
//       // play with positional hints when available
//       soundManager.playMove({ captured: !!captured, from, to });
//     } catch (e) {}
//   }

//   function playTick() {
//     if (!tickSoundEnabled) return;
//     try {
//       soundManager.playTick();
//     } catch (e) {}
//   }

//   // helper: read user object directly from localStorage (used in connect handler so value isn't stale)
//   function readUserFromStorage() {
//     try {
//       if (typeof window === "undefined") return null;
//       const raw = localStorage.getItem("user");
//       if (!raw) return null;
//       return JSON.parse(raw);
//     } catch {
//       return null;
//     }
//   }

//   // ---------------- Drag/drop support ----------------
//   // Called when user starts dragging a piece image
//   function handlePieceDragStart(fromSquare, event) {
//     // Keep the same behavior as selecting a piece: set selection and show legal moves
//     try {
//       // If we're viewing history or game over, don't allow drag
//       if (analysisIndex !== null) return;
//       const can = canMakeMove();
//       if (!can.ok) return;

//       const piece = chessRef.current.get(fromSquare);
//       if (!piece || piece.color !== chessRef.current.turn()) {
//         // cannot drag opponent piece
//         return;
//       }

//       setSelected(fromSquare);
//       const movesVerbose = chessRef.current.moves({
//         square: fromSquare,
//         verbose: true,
//       });
//       setLegalMovesVerbose(movesVerbose);
//       setLegalMoves(movesVerbose.map((m) => m.to));

//       // store origin in dataTransfer if available (Board already does this but be safe)
//       try {
//         if (event && event.dataTransfer) {
//           event.dataTransfer.setData("text/plain", fromSquare);
//         }
//       } catch (e) {}
//     } catch (e) {
//       // ignore
//     }
//   }

//   // Called when dropping onto a square
//   function handleSquareDrop(toSquare, event) {
//     try {
//       if (analysisIndex !== null) {
//         setStatusMsg("Exit history view to play a move");
//         return;
//       }
//       const can = canMakeMove();
//       if (!can.ok) {
//         // show any relevant message (same as click behavior)
//         if (can.reason === "waiting")
//           setStatusMsg("Waiting for second player...");
//         if (can.reason === "spectator")
//           setStatusMsg("You are a spectator and cannot move pieces.");
//         if (can.reason === "not-your-turn") setStatusMsg("Not your turn.");
//         if (can.reason === "game-over")
//           setStatusMsg("Game is over — no more moves allowed.");
//         return;
//       }

//       // Determine origin. Prefer event.dataTransfer, fallback to current selected state
//       let fromSquare = null;
//       try {
//         if (event && event.dataTransfer) {
//           const dt = event.dataTransfer.getData("text/plain");
//           if (dt) fromSquare = String(dt);
//         }
//       } catch (e) {
//         // ignore
//       }
//       if (!fromSquare) fromSquare = selected;

//       if (!fromSquare) {
//         // nothing to do
//         return;
//       }

//       // If dropped on same square, just deselect
//       if (fromSquare === toSquare) {
//         setSelected(null);
//         setLegalMoves([]);
//         setLegalMovesVerbose([]);
//         return;
//       }

//       // Try the same attemptMove path you already use
//       const res = attemptMove(fromSquare, toSquare);
//       if (!(res && res.pendingPromotion)) {
//         // clear selection after move or illegal attempt
//         setSelected(null);
//         setLegalMoves([]);
//         setLegalMovesVerbose([]);
//       }
//     } catch (e) {
//       // ignore errors
//       setSelected(null);
//       setLegalMoves([]);
//       setLegalMovesVerbose([]);
//     }
//   }

//   // Keep a small guard so we don't push route repeatedly
//   const lastPushedRoomRef = useRef(null);

//   function stopReplayImpl() {
//     stopReplayImplUtil(replayRef);
//   }

//   // Reset UI/ephemeral client state for a room transition (safe, non-destructive)
//   function resetForNewRoom(newRoomId = null) {
//     try {
//       stopReplayImpl();
//     } catch (e) {}
//     try {
//       chessRef.current = new Chess();
//     } catch {
//       chessRef.current = new Chess();
//     }
//     lastIndexRef.current = -1;
//     setMoveHistory([]);
//     setSelected(null);
//     setLegalMoves([]);
//     setLegalMovesVerbose([]);
//     setAnalysisIndex(null);
//     setGameOverState({
//       over: false,
//       reason: null,
//       winner: null,
//       loser: null,
//       message: null,
//     });
//     setRematchPending(null);
//     setMyPendingRematch(false);
//     setDrawOffer(null);
//     setMyPendingDrawOffer(false);
//     prevPendingRef.current = null;
//     setPlayers([]);
//     setClocks({ w: null, b: null, running: null });
//     prevClocksRef.current = { w: null, b: null };
//     prevSecondsRef.current = { w: null, b: null };
//     // ensure redux fen is in-sync with fresh board
//     try {
//       dispatch(setFenRedux(chessRef.current.fen()));
//     } catch (e) {}
//     refreshUI();
//     try {
//       lastPushedRoomRef.current = newRoomId;
//     } catch (e) {}

//     // also stop any timerLow sound runners when switching rooms
//     try {
//       soundManager.stopTimerLow();
//       timerLowRunningRef.current = false;
//     } catch (e) {}
//     // reset players count
//     prevPlayersCountRef.current = 0;
//   }

//   /* ---------- Fullscreen additions (kept here) ---------- */
//   const boardBoxRef = useRef(null);
//   const [isFullscreen, setIsFullscreen] = useState(false);

//   // Sync fullscreen state when user exits via ESC or browser controls
//   useEffect(() => {
//     function onFSChange() {
//       const fsElement =
//         document.fullscreenElement ||
//         document.webkitFullscreenElement ||
//         document.mozFullScreenElement ||
//         document.msFullscreenElement;
//       // if the fullscreen element is the boardBoxRef element, we consider fullscreen active
//       const isFS =
//         !!fsElement && boardBoxRef.current && fsElement === boardBoxRef.current;
//       setIsFullscreen(isFS);
//     }
//     document.addEventListener("fullscreenchange", onFSChange);
//     document.addEventListener("webkitfullscreenchange", onFSChange);
//     document.addEventListener("mozfullscreenchange", onFSChange);
//     document.addEventListener("MSFullscreenChange", onFSChange);
//     return () => {
//       document.removeEventListener("fullscreenchange", onFSChange);
//       document.removeEventListener("webkitfullscreenchange", onFSChange);
//       document.removeEventListener("mozfullscreenchange", onFSChange);
//       document.removeEventListener("MSFullscreenChange", onFSChange);
//     };
//   }, []);

//   // Toggle fullscreen using Fullscreen API
//   const toggleFullscreen = useCallback(async () => {
//     try {
//       const el = boardBoxRef.current;
//       if (!el) return;
//       const doc = document;
//       const fsElement =
//         doc.fullscreenElement ||
//         doc.webkitFullscreenElement ||
//         doc.mozFullScreenElement ||
//         doc.msFullscreenElement;
//       if (!fsElement) {
//         // request fullscreen on the board container
//         if (el.requestFullscreen) {
//           await el.requestFullscreen();
//         } else if (el.webkitRequestFullscreen) {
//           // Safari
//           // @ts-ignore
//           await el.webkitRequestFullscreen();
//         } else if (el.mozRequestFullScreen) {
//           // Firefox
//           // @ts-ignore
//           await el.mozRequestFullScreen();
//         } else if (el.msRequestFullscreen) {
//           // IE/Edge
//           // @ts-ignore
//           await el.msRequestFullscreen();
//         }
//         setIsFullscreen(true);
//       } else {
//         if (doc.exitFullscreen) {
//           await doc.exitFullscreen();
//         } else if (doc.webkitExitFullscreen) {
//           // @ts-ignore
//           await doc.webkitExitFullscreen();
//         } else if (doc.mozCancelFullScreen) {
//           // @ts-ignore
//           await doc.mozCancelFullScreen();
//         } else if (doc.msExitFullscreen) {
//           // @ts-ignore
//           await doc.msExitFullscreen();
//         }
//         setIsFullscreen(false);
//       }
//     } catch (e) {
//       // ignore fullscreen errors
//     }
//   }, []);

//   // Keyboard shortcut: press 'f' to toggle fullscreen
//   useEffect(() => {
//     function onKey(e) {
//       if (e.key === "f" || e.key === "F") {
//         // avoid typing into inputs triggering this
//         const tag = (e.target && e.target.tagName) || "";
//         if (["INPUT", "TEXTAREA"].includes(tag)) return;
//         toggleFullscreen();
//       }
//     }
//     document.addEventListener("keydown", onKey);
//     return () => document.removeEventListener("keydown", onKey);
//   }, [toggleFullscreen]);

//   /* ---------- Socket init / handlers ---------- */
//   useChessSocket({
//     initSocket,
//     socketRef,
//     chessRef,
//     gameState,
//     auth,
//     dispatch,
//     router,
//     setStatusMsg,
//     setPlayers,
//     setClocks,
//     setMoveHistory,
//     setRematchPending,
//     setMyPendingRematch,
//     setDrawOffer,
//     setMyPendingDrawOffer,
//     setGameOverState,
//     setMoveHistory,
//     lastIndexRef,
//     prevPlayersCountRef,
//     prevPendingRef,
//     lastPushedRoomRef,
//     attemptedSeatRef,
//     prevClocksRef,
//     prevSecondsRef,
//     moveSoundEnabled,
//     tickSoundEnabled,
//     timerLowRunningRef,
//     playMoveSound,
//     playTick,
//     stopReplayImpl,
//     dispatchJoinRoomSuccess: joinRoomSuccess,
//     dispatchOpponentMove: opponentMove,
//     dispatchLocalMove: localMove,
//     dispatchAddMessage: addMessage,
//     API,
//     setJoinModalOpen,
//     setJoinResult,
//     setJoinChecking,
//     setJoinInput,
//     setRoomText,
//   });

//   /* New effect: spectator auto-seat attempt moved into useChessSocket (handled there) */

//   /* Effect: reset UI when the active roomId changes (prevents leaking clocks/moves between rooms) */
//   useEffect(() => {
//     const current = gameState.roomId || null;
//     const prev = prevRoomRef.current || null;
//     if (prev !== current) {
//       try {
//         resetForNewRoom(current);
//       } catch (e) {}
//       prevRoomRef.current = current;
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [gameState.roomId]);

//   /* --- helpers / game logic / replay / UI code --- */

//   function boardMatrix() {
//     return helperBoardMatrix(chessRef);
//   }

//   function invokeBoolMethodLocal(possibleNames = []) {
//     return invokeBoolMethod(chessRef, possibleNames);
//   }

//   function gameStatusLocal() {
//     return gameStatus(chessRef);
//   }

//   function attemptMove(from, to) {
//     const moves = chessRef.current.moves({ square: from, verbose: true });
//     const found = moves.find((m) => m.to === to);
//     if (!found) return { ok: false, reason: "illegal" };
//     const needsPromotion =
//       found.promotion ||
//       (found.piece === "p" && (to[1] === "8" || to[1] === "1"));
//     if (needsPromotion) {
//       setPromotionRequest({
//         from,
//         to,
//         callback: (promotion) => finalizeMove({ from, to, promotion }),
//       });
//       return { ok: true, pendingPromotion: true };
//     }
//     return finalizeMove({ from, to, promotion: found.promotion || "q" });
//   }

//   function finalizeMove({ from, to, promotion }) {
//     const moveObj = { from, to, promotion };
//     // normalize promotion char before attempting local move
//     if (moveObj.promotion) {
//       const p = normalizePromotionCharLocal(moveObj.promotion);
//       if (p) moveObj.promotion = p;
//       else delete moveObj.promotion;
//     }

//     const result = chessRef.current.move(moveObj);
//     if (!result) {
//       setStatusMsg("Illegal move locally — requesting sync");
//       socketRef.current?.emit("request-sync", { roomId: gameState.roomId });
//       return { ok: false, reason: "illegal_local" };
//     }

//     // positional sound with from/to
//     playMoveSound(!!result.captured, from, to);

//     // NEW: if this move was a promotion or a castle, play the appropriate special sound
//     try {
//       if (moveSoundEnabled && result) {
//         if (result.promotion) {
//           try {
//             soundManager.playPromotion();
//           } catch (e) {}
//         }
//         const flags = result.flags || "";
//         const san = (result.san || "").toString();
//         if (
//           flags.toString().includes("k") ||
//           flags.toString().includes("q") ||
//           san.includes("O-O")
//         ) {
//           try {
//             soundManager.playCastle();
//           } catch (e) {}
//         }
//       }
//     } catch (e) {}

//     refreshUI();
//     const localPayload = { ...moveObj, fen: chessRef.current.fen() };
//     dispatch(localMove(localPayload));
//     setMoveHistory((mh) => [
//       ...mh,
//       {
//         index: (lastIndexRef.current ?? -1) + 1,
//         move: moveObj,
//         fen: chessRef.current.fen(),
//       },
//     ]);

//     // --- immediate local detection of checkmate/stalemate ---
//     try {
//       const status = gameStatusLocal(); // uses chessRef.current
//       if (status.over && status.text === "Checkmate") {
//         const winnerColor = result.color; // 'w' | 'b' (mover)
//         setGameOverState({
//           over: true,
//           reason: "checkmate",
//           winner: winnerColor,
//           loser: winnerColor === "w" ? "b" : "w",
//           message: `${winnerColor.toUpperCase()} wins by checkmate`,
//         });
//         setStatusMsg(`${winnerColor.toUpperCase()} wins by checkmate`);
//         stopReplayImpl();
//         try {
//           if (moveSoundEnabled) soundManager.playCheckmate();
//         } catch (e) {}
//       } else if (status.over && status.text.includes("Draw")) {
//         setGameOverState({
//           over: true,
//           reason: "draw",
//           winner: null,
//           loser: null,
//           message: status.text,
//         });
//         setStatusMsg(status.text);
//         stopReplayImpl();
//       }
//     } catch (e) {
//       // ignore detection errors (server will correct)
//     }

//     try {
//       const s = socketRef.current;
//       if (s && gameState.roomId)
//         s.emit("make-move", { roomId: gameState.roomId, move: moveObj });
//     } catch (e) {}
//     return { ok: true };
//   }

//   function handleSquareClick(square) {
//     if (analysisIndex !== null) {
//       setStatusMsg("Exit history view to play a move");
//       return;
//     }

//     const can = canMakeMove();
//     if (!can.ok) {
//       if (can.reason === "waiting")
//         setStatusMsg("Waiting for second player...");
//       if (can.reason === "spectator")
//         setStatusMsg("You are a spectator and cannot move pieces.");
//       if (can.reason === "not-your-turn") setStatusMsg("Not your turn.");
//       if (can.reason === "game-over")
//         setStatusMsg("Game is over — no more moves allowed.");
//       return;
//     }

//     const piece = chessRef.current.get(square);

//     // If there's already a selected square, handle switching/deselecting first
//     if (selected) {
//       // Clicking same square toggles deselect
//       if (selected === square) {
//         setSelected(null);
//         setLegalMoves([]);
//         setLegalMovesVerbose([]);
//         return;
//       }

//       // If the clicked square has one of your own pieces, switch selection immediately
//       // (this avoids attempting an illegal move that would clear the selection)
//       if (piece && piece.color === chessRef.current.turn()) {
//         setSelected(square);
//         const movesVerbose = chessRef.current.moves({ square, verbose: true });
//         setLegalMovesVerbose(movesVerbose);
//         setLegalMoves(movesVerbose.map((m) => m.to));
//         return;
//       }

//       // Otherwise try to move the previously selected piece to this square
//       const res = attemptMove(selected, square);
//       if (!(res && res.pendingPromotion)) {
//         setSelected(null);
//         setLegalMoves([]);
//         setLegalMovesVerbose([]);
//       }
//       return;
//     }

//     // No selection yet: select a piece if it is your color, otherwise do nothing
//     if (piece && piece.color === chessRef.current.turn()) {
//       setSelected(square);
//       const movesVerbose = chessRef.current.moves({ square, verbose: true });
//       setLegalMovesVerbose(movesVerbose);
//       const moves = movesVerbose.map((m) => m.to);
//       setLegalMoves(moves);
//     } else {
//       setSelected(null);
//       setLegalMoves([]);
//       setLegalMovesVerbose([]);
//     }
//   }

//   function canMakeMove() {
//     if (gameOverState?.over) return { ok: false, reason: "game-over" };

//     const colored = (gameState.players || []).filter(
//       (p) => p.color === "w" || p.color === "b"
//     );
//     if (colored.length < 2) return { ok: false, reason: "waiting" };
//     const myColor = gameState.playerColor;
//     if (!myColor || myColor === "spectator")
//       return { ok: false, reason: "spectator" };
//     const turn = chessRef.current.turn();
//     if (turn !== myColor) return { ok: false, reason: "not-your-turn" };
//     return { ok: true };
//   }

//   // JOIN FLOW: show modal, check room, then join if user confirms.
//   const openJoinModal = useCallback(() => {
//     setJoinModalOpen(true);
//     setJoinInput("");
//     setJoinResult(null);
//     setJoinChecking(false);
//   }, []);

//   const closeJoinModal = useCallback(() => {
//     setJoinModalOpen(false);
//     setJoinInput("");
//     setJoinResult(null);
//     setJoinChecking(false);
//   }, []);

//   async function checkRoomId(roomId) {
//     const rid = String(roomId || "").trim();
//     if (!rid) {
//       setJoinResult({ ok: false, error: "Please enter a room id" });
//       return;
//     }
//     setJoinChecking(true);
//     setJoinResult(null);
//     try {
//       const base = API.replace(/\/api\/?$/, "");
//       const res = await fetch(`${base}/api/rooms/${encodeURIComponent(rid)}`, {
//         credentials: "include",
//       });
//       if (!res.ok) {
//         const err = await res.json().catch(() => ({}));
//         setJoinResult({
//           ok: false,
//           error:
//             err && err.error
//               ? err.error
//               : `Room ${rid} not found (status ${res.status})`,
//         });
//       } else {
//         const info = await res.json();
//         setJoinResult({ ok: true, room: info });
//         // prefill roomText so UI shows the room selected
//         setRoomText(rid);
//       }
//     } catch (err) {
//       setJoinResult({ ok: false, error: "Network error while checking room" });
//     } finally {
//       setJoinChecking(false);
//     }
//   }

//   const confirmJoinRoom = useCallback(
//     async (roomIdOverride = null) => {
//       const rid = (roomIdOverride || joinInput || roomText || "").trim();
//       if (!rid) {
//         setStatusMsg("No room id specified");
//         return;
//       }
//       // ensure we have validated joinResult (quick guard)
//       if (!joinResult || !joinResult.ok || joinResult.room?.roomId !== rid) {
//         // If joinResult not present or mismatch, check first
//         await checkRoomId(rid);
//         if (!joinResult || !joinResult.ok) {
//           return;
//         }
//       }

//       // before performing join, ensure the checked room isn't finished
//       if (joinResult && joinResult.room && joinResult.room.finished) {
//         setStatusMsg("This room is already finished and cannot be joined.");
//         return;
//       }

//       // join: set redux, push canonical URL and emit join-room to socket
//       try {
//         dispatch(setRoomId(rid));
//         lastPushedRoomRef.current = rid;
//         router.push(`/play/${encodeURIComponent(rid)}`);
//       } catch (e) {}
//       // build user payload similar to existing logic
//       let userToSend = { username: "guest" };
//       if (auth && auth.user) {
//         const authUser = auth.user;
//         const avatar = normalizeAvatarUrlFromAuthUser(authUser);
//         userToSend = {
//           id: authUser.id,
//           username: authUser.username,
//           displayName: authUser.displayName,
//           avatarUrl: avatar,
//         };
//       } else {
//         const storedUser = readUserFromStorage();
//         if (storedUser) {
//           const avatar = normalizeAvatarUrlFromAuthUser(storedUser);
//           userToSend = {
//             id: storedUser.id || storedUser._id,
//             username: storedUser.username,
//             displayName: storedUser.displayName,
//             avatarUrl: avatar,
//           };
//         }
//       }
//       try {
//         socketRef.current?.emit("join-room", { roomId: rid, user: userToSend });
//         setStatusMsg("Joining room...");
//         lastIndexRef.current = -1;
//       } catch (e) {
//         setStatusMsg("Failed to join room (socket error)");
//       } finally {
//         setJoinModalOpen(false);
//       }
//     },
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//     [joinInput, joinResult, roomText, auth]
//   );

//   const joinRoom = useCallback(() => {
//     openJoinModal();
//   }, [openJoinModal]);

//   function resetLocal() {
//     chessRef.current = new Chess();
//     setMoveHistory([]);
//     setSelected(null);
//     setLegalMoves([]);
//     setLegalMovesVerbose([]);
//     setStatusMsg("Local reset");
//     setGameOverState({
//       over: false,
//       reason: null,
//       winner: null,
//       loser: null,
//       message: null,
//     });
//     refreshUI();
//   }

//   function onPromotionChoose(piece) {
//     if (!promotionRequest) return;
//     const { from, to, callback } = promotionRequest;
//     setPromotionRequest(null);
//     const p = normalizePromotionCharLocal(piece) || "q"; // fallback to queen
//     callback(p);
//     setSelected(null);
//     setLegalMoves([]);
//     setLegalMovesVerbose([]);
//   }

//   // If initialRoomId prop is provided (we are on /play/[roomId] route),
//   // validate and auto-join once on mount.
//   useEffect(() => {
//     if (!initialRoomId) return;
//     (async () => {
//       const rid = String(initialRoomId || "").trim();
//       if (!rid) return;
//       try {
//         const base = API.replace(/\/api\/?$/, "");
//         const res = await fetch(
//           `${base}/api/rooms/${encodeURIComponent(rid)}`,
//           {
//             credentials: "include",
//           }
//         );
//         if (!res.ok) {
//           // Room doesn't exist — go back to /play with message
//           setStatusMsg(`Room ${rid} not found`);
//           try {
//             router.replace("/play");
//           } catch (e) {}
//           return;
//         }
//         // room exists — set roomId
//         dispatch(setRoomId(rid));
//         lastPushedRoomRef.current = rid;
//         try {
//           // if spectatorOnly, keep the URL with spectate=1 parameter so PlayRoomPage knows
//           if (spectatorOnly) {
//             router.replace(`/play/${encodeURIComponent(rid)}?spectate=1`);
//             setStatusMsg("Viewing as spectator");
//           } else {
//             router.replace(`/play/${encodeURIComponent(rid)}`);
//             setStatusMsg("Joining room...");
//           }
//         } catch (e) {}
//         // emit join-room (unless spectatorOnly) OR request sync for spectator
//         let userToSend = { username: "guest" };
//         if (!spectatorOnly) {
//           if (auth && auth.user) {
//             const authUser = auth.user;
//             const avatar = normalizeAvatarUrlFromAuthUser(authUser);
//             userToSend = {
//               id: authUser.id,
//               username: authUser.username,
//               displayName: authUser.displayName,
//               avatarUrl: avatar,
//             };
//           } else {
//             const storedUser = readUserFromStorage();
//             if (storedUser) {
//               const avatar = normalizeAvatarUrlFromAuthUser(storedUser);
//               userToSend = {
//                 id: storedUser.id || storedUser._id,
//                 username: storedUser.username,
//                 displayName: storedUser.displayName,
//                 avatarUrl: avatar,
//               };
//             }
//           }
//           socketRef.current?.emit("join-room", {
//             roomId: rid,
//             user: userToSend,
//           });
//         } else {
//           // spectator: do not request to take a seat, just request sync so we receive room-update, moves, messages
//           try {
//             socketRef.current?.emit("request-sync", { roomId: rid });
//             attemptedSeatRef.current = true; // prevent auto-seat later
//           } catch (e) {}
//         }
//       } catch (err) {
//         setStatusMsg("Failed to auto-join room");
//       }
//     })();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [initialRoomId, spectatorOnly]);

//   useEffect(() => {
//     if (gameState.moves && gameState.moves.length !== moveHistory.length) {
//       setMoveHistory(gameState.moves);
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [gameState.moves]);

//   /* useClockEffect: moves the clock/clocks effect logic to a separate hook */
//   // Detect playingWithBot from players list (heuristic).
//   const playingWithBot = useMemo(() => {
//     if (!players || !players.length) return false;
//     return players.some((p) => {
//       if (!p) return false;
//       const username = (p.username || p.displayName || p.name || "")
//         .toString()
//         .toLowerCase();
//       if (username.includes("bot")) return true;
//       if (p.isBot) return true;
//       if (
//         String(p.id || p.userId || "")
//           .toLowerCase()
//           .includes("bot")
//       )
//         return true;
//       if (p.type && String(p.type).toLowerCase() === "bot") return true;
//       return false;
//     });
//   }, [players]);

//   useClockEffect({
//     clocks,
//     prevClocksRef,
//     prevSecondsRef,
//     prevClocksRefSetter: (v) => (prevClocksRef.current = v),
//     gameOverState,
//     setGameOverState,
//     playTick,
//     tickSoundEnabled,
//     timerLowRunningRef,
//     setStatusMsg,
//     stopReplayImpl,
//     socketRef,
//     gameState,
//     playingWithBot,
//   });

//   // Replay & export helpers (delegated to replayUtils)
//   function getFenForMoveIndex(targetIndex) {
//     return getFenForMoveIndexImpl({ moveHistory, targetIndex });
//   }

//   function jumpToMove(index) {
//     return jumpToMoveImpl({
//       index,
//       moveHistory,
//       chessRef,
//       setAnalysisIndex,
//       refreshUI,
//     });
//   }

//   function startReplay(speed = 800) {
//     return startReplayImpl({
//       speed,
//       replayRef,
//       moveHistory,
//       jumpToMove,
//     });
//   }

//   function stopReplay() {
//     stopReplayImpl();
//   }

//   function exportPGN() {
//     return exportPGNImpl(moveHistory);
//   }

//   function copyPGNToClipboard() {
//     return copyPGNToClipboardImpl(exportPGN, setStatusMsg);
//   }

//   function capturedPiecesImages() {
//     return helperCapturedPiecesImages(chessRef);
//   }

//   // Offer/accept/decline draw logic
//   const offerDraw = useCallback(() => {
//     if (gameOverState.over) return;
//     const s = socketRef.current;
//     if (!s || !gameState.roomId) return;
//     if (myPendingDrawOffer) {
//       setStatusMsg("Draw already offered");
//       return;
//     }

//     setMyPendingDrawOffer(true);
//     setStatusMsg("Draw offered — waiting for opponent response");

//     try {
//       s.emit("offer-draw", { roomId: gameState.roomId });
//     } catch (e) {
//       setMyPendingDrawOffer(false);
//       setStatusMsg("Failed to offer draw");
//     }
//   }, [gameOverState.over, gameState.roomId, myPendingDrawOffer, auth]);

//   const acceptDraw = useCallback(() => {
//     if (gameOverState.over) return;
//     const s = socketRef.current;
//     if (!s || !gameState.roomId) return;
//     s.emit("accept-draw", { roomId: gameState.roomId });
//     setDrawOffer(null);
//     setStatusMsg("Draw accepted");
//   }, [gameOverState.over, gameState.roomId]);

//   const declineDraw = useCallback(() => {
//     if (gameOverState.over) return;
//     const s = socketRef.current;
//     if (!s || !gameState.roomId) return;
//     s.emit("decline-draw", { roomId: gameState.roomId });
//     setDrawOffer(null);
//     setStatusMsg("Draw declined");
//   }, [gameOverState.over, gameState.roomId]);

//   const resign = useCallback(() => {
//     if (gameOverState.over) return;
//     const s = socketRef.current;
//     if (!s || !gameState.roomId) return;
//     s.emit("resign", { roomId: gameState.roomId });
//     setStatusMsg("You resigned");
//   }, [gameOverState.over, gameState.roomId]);

//   const leaveRoom = useCallback(() => {
//     const s = socketRef.current;
//     if (gameState.playerColor === "w" || gameState.playerColor === "b") {
//       try {
//         s?.emit("resign", { roomId: gameState.roomId });
//       } catch (e) {}
//     } else {
//       try {
//         s?.emit("leave-room", { roomId: gameState.roomId });
//       } catch (e) {}
//     }
//     dispatch(leaveRoomAction());
//     setStatusMsg("Left room");
//     try {
//       lastPushedRoomRef.current = null;
//       router.push("/play");
//     } catch (e) {}
//     // reset UI on leave to avoid stale clocks/moves
//     try {
//       resetForNewRoom(null);
//     } catch (e) {}
//   }, [gameState.playerColor, gameState.roomId, dispatch, router]);

//   // CREATE ROOM (client) - with activeRoom guard
//   async function createRoom() {
//     const s = socketRef.current;
//     if (!s) return;

//     // If auth user, check server whether they already have an activeRoom
//     try {
//       const uid = auth?.user?.id || auth?.user?._id;
//       if (uid) {
//         const base = API.replace(/\/api\/?$/, "");
//         try {
//           const res = await fetch(
//             `${base}/api/players/${encodeURIComponent(uid)}`,
//             {
//               credentials: "include",
//             }
//           );
//           if (res.ok) {
//             const data = await res.json().catch(() => null);
//             if (data && data.activeRoom) {
//               // fire the global event so ActiveRoomModal opens
//               try {
//                 window.dispatchEvent(
//                   new CustomEvent("chessapp:join-denied-active-room", {
//                     detail: {
//                       activeRoom: data.activeRoom,
//                       message: "You already have an active game.",
//                     },
//                   })
//                 );
//               } catch (e) {}
//               return;
//             }
//           }
//         } catch (e) {
//           // network error; we'll still attempt to create and let server reject if necessary
//         }
//       }
//     } catch (e) {}

//     const minutes = Number(createMinutes) || 5;
//     const colorPreference = createColorPref || "random";
//     const roomId =
//       createCode && String(createCode).trim()
//         ? String(createCode).trim()
//         : undefined;

//     let userToSend = { username: "guest" };
//     if (auth && auth.user) {
//       const authUser = auth.user;
//       const avatar = normalizeAvatarUrlFromAuthUser(authUser);
//       userToSend = {
//         id: authUser.id,
//         username: authUser.username,
//         displayName: authUser.displayName,
//         avatarUrl: avatar,
//       };
//     }

//     s.emit("create-room", {
//       roomId,
//       minutes,
//       colorPreference,
//       user: userToSend,
//     });
//   }

//   // REMATCH handlers (client-side)
//   function sendPlayAgain() {
//     const s = socketRef.current;
//     if (!s || !gameState.roomId) return;
//     setMyPendingRematch(true);
//     setStatusMsg("Requesting rematch...");
//     s.emit("play-again", { roomId: gameState.roomId });
//   }

//   function acceptPlayAgain() {
//     const s = socketRef.current;
//     if (!s || !gameState.roomId) return;
//     setStatusMsg("Accepting rematch...");
//     s.emit("accept-play-again", { roomId: gameState.roomId });
//   }

//   function declinePlayAgain() {
//     const s = socketRef.current;
//     if (!s || !gameState.roomId) return;
//     s.emit("decline-play-again", { roomId: gameState.roomId });
//     setRematchPending(null);
//     setMyPendingRematch(false);
//     setStatusMsg("Rematch declined");
//   }

//   function cancelMyRematchRequest() {
//     declinePlayAgain();
//   }

//   function capturedPiecesImages() {
//     const initial = {
//       w: { p: 8, r: 2, n: 2, b: 2, q: 1, k: 1 },
//       b: { p: 8, r: 2, n: 2, b: 2, q: 1, k: 1 },
//     };
//     const current = { w: {}, b: {} };
//     const board = chessRef.current.board();
//     board.flat().forEach((cell) => {
//       if (cell) {
//         current[cell.color][cell.type] =
//           (current[cell.color][cell.type] || 0) + 1;
//       }
//     });

//     const captured = { w: [], b: [] };
//     Object.keys(initial).forEach((color) => {
//       Object.keys(initial[color]).forEach((t) => {
//         const left = current[color][t] || 0;
//         const capturedCount = initial[color][t] - left;
//         for (let i = 0; i < capturedCount; i++) {
//           if (color === "b")
//             captured.w.push(getPieceImageUrl({ type: t, color: "b" }));
//           else captured.b.push(getPieceImageUrl({ type: t, color: "w" }));
//         }
//       });
//     });
//     return captured;
//   }

//   const matrix = boardMatrix();
//   const lastMove =
//     moveHistory && moveHistory.length
//       ? moveHistory[moveHistory.length - 1]
//       : null;
//   const capturedImgs = capturedPiecesImages();

//   const isBlack = gameState.playerColor === "b";

//   function findKingSquare(color) {
//     return helperFindKingSquare(chessRef, color, FILES, RANKS);
//   }

//   const inCheck = invokeBoolMethodLocal([
//     "in_check",
//     "inCheck",
//     "isInCheck",
//     "isCheck",
//   ]);
//   const checkedColor = inCheck ? chessRef.current.turn() : null;
//   const kingInCheckSquare = checkedColor ? findKingSquare(checkedColor) : null;

//   const myId = auth?.user?.id || null;
//   const pendingFromId = drawOffer?.from?.id || null;
//   const isOfferToMe = drawOffer && pendingFromId && pendingFromId !== myId;

//   // when fullscreen, hide sidebars/chat - user requested board-only fullscreen
//   const effectiveHideSidebar = hideSidebar || isFullscreen;
//   // In bot mode we hide chat & live talk tabs — RightPanel will still render New Game.
//   const effectiveHideRightChat =
//     hideRightChat || isFullscreen || playingWithBot;
//   const effectiveHideCaptured = hideCaptured || isFullscreen;

//   /* ------------------- NEW: persistent dismissal for GameOver popup -------------------
//      We track dismissed finished-games per-room in localStorage so the popup shows once per finished game.
//      Key format: `${roomId}:${moveHistory.length}` — moveHistory length uniquely identifies a finished game
//      instance for the room (works well for rematches).
//   ------------------------------------------------------------------------------- */

//   const DISMISS_KEY = "chessapp:dismissedGameOver_v1";

//   // map: { "<roomId>:<movesLen>": true, ... }
//   const [dismissedGameOvers, setDismissedGameOvers] = useState(() => {
//     try {
//       if (typeof window === "undefined") return {};
//       const raw = localStorage.getItem(DISMISS_KEY);
//       if (!raw) return {};
//       return JSON.parse(raw) || {};
//     } catch {
//       return {};
//     }
//   });

//   // persist map whenever it changes
//   useEffect(() => {
//     try {
//       if (typeof window === "undefined") return;
//       localStorage.setItem(
//         DISMISS_KEY,
//         JSON.stringify(dismissedGameOvers || {})
//       );
//     } catch (e) {}
//   }, [dismissedGameOvers]);

//   // build unique key for current finished-game instance
//   const currentGameKey = useMemo(() => {
//     const rid = String(gameState.roomId || "no-room");
//     const movesLen = Number(moveHistory?.length || 0);
//     return `${rid}:${movesLen}`;
//   }, [gameState.roomId, moveHistory]);

//   const isDismissedForThisFinishedGame = !!dismissedGameOvers[currentGameKey];

//   // Visible to popup should be true only when game is over and not previously dismissed
//   const popupVisible = !!(
//     gameOverState.over && !isDismissedForThisFinishedGame
//   );

//   // compute winner/loser objects & names to pass into popup
//   // NOTE: first try `players` local state, fallback to gameState.players from redux
//   const winnerObj =
//     gameOverState.winner != null
//       ? (players || []).find((p) => p && p.color === gameOverState.winner) ||
//         (gameState.players || []).find(
//           (p) => p && p.color === gameOverState.winner
//         ) ||
//         null
//       : null;

//   const loserColor =
//     gameOverState.loser != null
//       ? gameOverState.loser
//       : gameOverState.winner === "w"
//       ? "b"
//       : gameOverState.winner === "b"
//       ? "w"
//       : null;

//   const loserObj =
//     loserColor != null
//       ? (players || []).find((p) => p && p.color === loserColor) ||
//         (gameState.players || []).find((p) => p && p.color === loserColor) ||
//         null
//       : null;

//   const winnerName =
//     (winnerObj && (winnerObj.displayName || winnerObj.username)) ||
//     (gameOverState.winner ? `${gameOverState.winner.toUpperCase()}` : null);

//   const loserName =
//     (loserObj && (loserObj.displayName || loserObj.username)) ||
//     (loserColor ? `${loserColor.toUpperCase()}` : null);

//   // spectator flag: either explicitly spectatorOnly prop OR client playerColor is 'spectator'
//   const showAsSpectator =
//     spectatorOnly || gameState.playerColor === "spectator" || false;

//   // handler when popup is closed by user: mark this finished-game as dismissed so it won't auto-show again
//   function handleGameOverPopupClose() {
//     try {
//       setDismissedGameOvers((prev) => ({
//         ...(prev || {}),
//         [currentGameKey]: true,
//       }));
//     } catch (e) {
//       // swallow
//     }
//     // keep existing statusMsg behavior
//     setStatusMsg((s) => s || "");
//   }

//   // When spectator, don't expose rematch/new game handlers so popup won't render those buttons.
//   const rematchHandler = showAsSpectator ? null : sendPlayAgain;
//   const newGameHandler = showAsSpectator
//     ? null
//     : () => {
//         try {
//           router.push("/play");
//         } catch (e) {
//           window.location.href = "/play";
//         }
//       };

//   /* --------------------------------------------------------------------------------- */
//   return (
//     <div className={styles.wrapper}>
//       {/* Always mount ActiveRoomModal so it can listen for events */}
//       <ActiveRoomModal />

//       <div className={styles.playContainer}>
//         <div
//           className={`${styles.mainLayout} ${
//             effectiveHideSidebar ? styles.mainLayoutHide : ""
//           } ${isFullscreen ? styles.fullscreenActive || "" : ""}`}
//         >
//           {!effectiveHideSidebar && (
//             <div className={styles.sidebarRes}>
//               <div
//                 onClick={() => setSideBarResOpen(!isSideBarResOpen)}
//                 className={styles.menuIconBtn}
//               >
//                 {!isSideBarResOpen ? (
//                   <svg
//                     viewBox="0 0 16 16"
//                     fill="none"
//                     xmlns="http://www.w3.org/2000/svg"
//                     id="Sidebar-Minimalistic--Streamline-Solar"
//                     height="16"
//                     width="16"
//                   >
//                     <desc>
//                       Sidebar Minimalistic Streamline Icon:
//                       https://streamlinehq.com
//                     </desc>
//                     <path
//                       fillRule="evenodd"
//                       clipRule="evenodd"
//                       d="M2.1143799999999997 2.7810466666666667C1.3333333333333333 3.5620999999999996 1.3333333333333333 4.8191733333333335 1.3333333333333333 7.333333333333333v1.3333333333333333c0 2.514133333333333 0 3.7712666666666665 0.7810466666666667 4.552266666666666C2.895433333333333 14 4.152506666666667 14 6.666666666666666 14h2.6666666666666665l0.16666666666666666 0 0 -12c-0.054933333333333334 -0.00000666666666666667 -0.11046666666666666 0 -0.16666666666666666 0h-2.6666666666666665C4.152506666666667 2 2.895433333333333 2 2.1143799999999997 2.7810466666666667ZM10.5 2.0037266666666667l0 11.99254c1.7572666666666665 -0.0184 2.7360666666666664 -0.1277333333333333 3.3856 -0.7773333333333332C14.666666666666666 12.437933333333334 14.666666666666666 11.1808 14.666666666666666 8.666666666666666v-1.3333333333333333c0 -2.51416 0 -3.7712333333333334 -0.7810666666666666 -4.552286666666666 -0.6495333333333333 -0.6495533333333333 -1.6283333333333332 -0.7589066666666666 -3.3856 -0.77732Z"
//                       fill="#000000"
//                       strokeWidth="0.6667"
//                     ></path>
//                   </svg>
//                 ) : (
//                   <svg
//                     viewBox="0 0 16 16"
//                     fill="none"
//                     xmlns="http://www.w3.org/2000/svg"
//                     id="Close-Circle--Streamline-Solar"
//                     height="16"
//                     width="16"
//                   >
//                     <desc>
//                       Close Circle Streamline Icon: https://streamlinehq.com
//                     </desc>
//                     <path
//                       fillRule="evenodd"
//                       clipRule="evenodd"
//                       d="M14.666666666666666 8c0 3.6818666666666666 -2.9848 6.666666666666666 -6.666666666666666 6.666666666666666 -3.6818999999999997 0 -6.666666666666666 -2.9848 -6.666666666666666 -6.666666666666666C1.3333333333333333 4.318099999999999 4.318099999999999 1.3333333333333333 8 1.3333333333333333c3.6818666666666666 0 6.666666666666666 2.9847666666666663 6.666666666666666 6.666666666666666ZM5.979753333333333 5.9797666666666665c0.19526 -0.19526 0.51184 -0.19526 0.7071133333333333 0L8 7.292866666666666l1.3130666666666666 -1.3130866666666665c0.19526666666666664 -0.19526 0.5118666666666667 -0.19526 0.7071333333333333 0 0.19526666666666664 0.19526 0.19526666666666664 0.5118466666666666 0 0.7070866666666666L8.707066666666666 8l1.3131333333333333 1.3130666666666666c0.19526666666666664 0.19526666666666664 0.19526666666666664 0.5118666666666667 0 0.7071333333333333 -0.19526666666666664 0.19526666666666664 -0.5118666666666667 0.19526666666666664 -0.7071333333333333 0L8 8.707133333333333l-1.3131333333333333 1.3130666666666666c-0.1952533333333333 0.19526666666666664 -0.51184 0.19526666666666664 -0.7071000000000001 0 -0.19526 -0.19526666666666664 -0.19526 -0.5118666666666667 0 -0.7070666666666666L7.292866666666666 8l-1.3131133333333334 -1.3131333333333333c-0.19526666666666664 -0.1952533333333333 -0.19526666666666664 -0.51184 0 -0.7071000000000001Z"
//                       fill="#000000"
//                       strokeWidth="0.6667"
//                     ></path>
//                   </svg>
//                 )}
//               </div>
//               <Sidebar
//                 gameState={gameState}
//                 statusMsg={statusMsg}
//                 gameOverState={gameOverState}
//                 offerDraw={offerDraw}
//                 resign={resign}
//                 copyPGNToClipboard={copyPGNToClipboard}
//                 leaveRoom={leaveRoom}
//                 sendPlayAgain={sendPlayAgain}
//                 myPendingRematch={myPendingRematch}
//                 moveSoundEnabled={moveSoundEnabled}
//                 tickSoundEnabled={tickSoundEnabled}
//                 setMoveSoundEnabled={setMoveSoundEnabled}
//                 setTickSoundEnabled={setTickSoundEnabled}
//                 moveHistory={moveHistory}
//                 analysisIndex={analysisIndex}
//                 jumpToMove={jumpToMove}
//                 startReplay={startReplay}
//                 stopReplay={stopReplay}
//                 getPieceImageUrl={getPieceImageUrl}
//                 isSideBarResOpen={isSideBarResOpen}
//               />
//             </div>
//           )}

//           <div
//             className={styles.boardBox}
//             ref={boardBoxRef}
//             // When fullscreen is active we want the board container to occupy the full viewport.
//             // CSS in project may already handle fullscreen element sizing; if not, inline styles below help.
//           >
//             {/* Fullscreen toggle button — placed inside board container */}

//             <div className={styles.mainContentDiv}>
//               <main className={styles.mainContent}>
//                 <div
//                   className={`${styles.boardContainer} ${
//                     gameOverState.over ? styles.boardOver : ""
//                   }`}
//                   style={{
//                     "--board-texture": "url('/texture.jpg')",
//                     "--texture-opacity": 0.05,
//                     "--texture-scale": 1.02,
//                   }}
//                 >
//                   <Board
//                     matrix={matrix}
//                     isBlack={isBlack}
//                     selected={selected}
//                     legalMoves={legalMoves}
//                     legalMovesVerbose={legalMovesVerbose}
//                     lastMove={lastMove}
//                     kingInCheckSquare={kingInCheckSquare}
//                     handleSquareClick={handleSquareClick}
//                     getPieceImageUrl={getPieceImageUrl}
//                     styles={styles}
//                     onPieceDragStart={handlePieceDragStart}
//                     onSquareDrop={handleSquareDrop}
//                   />
//                 </div>

//                 <button
//                   onClick={toggleFullscreen}
//                   aria-label="Toggle fullscreen (F)"
//                   title="Toggle fullscreen (F)"
//                   className={styles.fullScreenBtn}
//                 >
//                   <svg
//                     xmlns="http://www.w3.org/2000/svg"
//                     width="36"
//                     height="36"
//                     fill="#000000"
//                     viewBox="0 0 256 256"
//                   >
//                     <path d="M117.66,138.34a8,8,0,0,1,0,11.32L83.31,184l18.35,18.34A8,8,0,0,1,96,216H48a8,8,0,0,1-8-8V160a8,8,0,0,1,13.66-5.66L72,172.69l34.34-34.35A8,8,0,0,1,117.66,138.34ZM208,40H160a8,8,0,0,0-5.66,13.66L172.69,72l-34.35,34.34a8,8,0,0,0,11.32,11.32L184,83.31l18.34,18.35A8,8,0,0,0,216,96V48A8,8,0,0,0,208,40Z"></path>
//                   </svg>
//                 </button>

//                 <PlayersPanel
//                   players={players}
//                   clocks={clocks}
//                   playingWithBot={playingWithBot}
//                 />
//               </main>
//             </div>

//             {!effectiveHideCaptured && (
//               <CapturedPieces
//                 capturedImgs={capturedImgs}
//                 getPieceImageUrl={getPieceImageUrl}
//               />
//             )}
//           </div>

//           <RightPanel
//             socketRef={socketRef}
//             joinRoom={joinRoom}
//             createCode={createCode}
//             setCreateCode={setCreateCode}
//             createMinutes={createMinutes}
//             setCreateMinutes={setCreateMinutes}
//             createColorPref={createColorPref}
//             setCreateColorPref={setCreateColorPref}
//             createRoom={createRoom}
//             //
//             open={joinModalOpen}
//             onClose={closeJoinModal}
//             joinInput={joinInput}
//             setJoinInput={setJoinInput}
//             checkRoomId={checkRoomId}
//             joinChecking={joinChecking}
//             joinResult={joinResult}
//             confirmJoinRoom={confirmJoinRoom}
//             API={API}
//             readOnlyChat={spectatorOnly}
//             hideRightChat={effectiveHideRightChat}
//             playingWithBot={playingWithBot}
//           >
//             <VoicePanel
//               socketRef={socketRef}
//               players={players}
//               auth={auth}
//               gameState={gameState}
//             />
//           </RightPanel>
//         </div>

//         <GameOverPopup
//           visible={popupVisible}
//           reason={gameOverState.reason}
//           message={gameOverState.message}
//           playerIsWinner={gameState.playerColor === gameOverState.winner}
//           showAsSpectator={showAsSpectator}
//           winnerName={winnerName}
//           loserName={loserName}
//           winner={winnerObj}
//           loser={loserObj}
//           onRematch={rematchHandler}
//           onNewGame={newGameHandler}
//           onClose={handleGameOverPopupClose}
//         />

//         <PromotionModal
//           promotionRequest={promotionRequest}
//           onChoose={onPromotionChoose}
//         />

//         <DrawModal
//           drawOffer={drawOffer}
//           onAccept={acceptDraw}
//           onDecline={declineDraw}
//           isOfferToYou={isOfferToMe}
//         />

//         <RematchModal
//           rematchPending={rematchPending}
//           myPendingRematch={myPendingRematch}
//           onAccept={acceptPlayAgain}
//           onDecline={declinePlayAgain}
//           onCancelRequest={cancelMyRematchRequest}
//           mySocketId={socketRef.current?.id}
//           myUserId={auth?.user?.id}
//         />

//         {/* {myPendingDrawOffer && !drawOffer && (
//           <div className={`${styles.drawBadge} ${styles.drawBadgeFixed}`}>
//             Draw offered — waiting for opponent
//           </div>
//         )} */}
//       </div>
//     </div>
//   );
// }
