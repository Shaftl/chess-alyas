import { Chess } from "chess.js";

export function getFenForMoveIndexImpl({ moveHistory, targetIndex }) {
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

export function jumpToMoveImpl({
  index,
  moveHistory,
  chessRef,
  setAnalysisIndex,
  refreshUI,
}) {
  if (index === null) {
    chessRef.current = new Chess(
      moveHistory && moveHistory.length ? moveHistory[0]?.fen : undefined
    );
    setAnalysisIndex(null);
    refreshUI();
    return;
  }
  const fen = getFenForMoveIndexImpl({ moveHistory, targetIndex: index });
  try {
    chessRef.current.load(fen);
  } catch {
    chessRef.current = new Chess(fen);
  }
  setAnalysisIndex(index);
  refreshUI();
}

export function startReplayImpl({
  speed = 800,
  replayRef,
  moveHistory,
  jumpToMove,
}) {
  try {
    if (!replayRef) return;
    // stop previous
    if (replayRef.current && replayRef.current.timer) {
      clearTimeout(replayRef.current.timer);
      replayRef.current.timer = null;
    }
    replayRef.current.playing = true;
    replayRef.current.speed = speed;
    let idx = -1;
    const playNext = () => {
      idx++;
      if (idx >= moveHistory.length) {
        // stop
        replayRef.current.playing = false;
        if (replayRef.current.timer) {
          clearTimeout(replayRef.current.timer);
          replayRef.current.timer = null;
        }
        return;
      }
      jumpToMove(idx);
      replayRef.current.timer = setTimeout(
        playNext,
        replayRef.current.speed || speed
      );
    };
    playNext();
  } catch (e) {}
}

export function stopReplayImpl(replayRef) {
  try {
    if (!replayRef) return;
    replayRef.current.playing = false;
    if (replayRef.current.timer) {
      clearTimeout(replayRef.current.timer);
      replayRef.current.timer = null;
    }
  } catch (e) {}
}

export function exportPGNImpl(moveHistory) {
  const chess = new Chess();
  moveHistory.forEach((m) => {
    try {
      chess.move(m.move);
    } catch {}
  });
  return chess.pgn();
}

export function copyPGNToClipboardImpl(exportPGNFn, setStatusMsg) {
  try {
    const pgn = exportPGNFn();
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(pgn).then(() => {
      setStatusMsg("PGN copied to clipboard");
      setTimeout(() => setStatusMsg(""), 1800);
    });
  } catch (e) {}
}
