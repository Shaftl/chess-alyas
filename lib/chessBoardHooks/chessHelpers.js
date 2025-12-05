// frontend/lib/chessBoardUtils/chessHelpers.js
import { Chess } from "chess.js";

/* Local promotion normalization (client-side) */
export function normalizePromotionCharLocal(p) {
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

export function invokeBoolMethod(chessRef, possibleNames = []) {
  try {
    if (!chessRef || !chessRef.current) return false;
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

export function gameStatus(chessRef) {
  if (
    invokeBoolMethod(chessRef, ["in_checkmate", "inCheckmate", "isCheckmate"])
  )
    return { text: "Checkmate", over: true };
  if (
    invokeBoolMethod(chessRef, ["in_stalemate", "inStalemate", "isStalemate"])
  )
    return { text: "Stalemate", over: true };
  if (invokeBoolMethod(chessRef, ["in_draw", "inDraw", "isDraw"]))
    return { text: "Draw", over: true };
  if (
    invokeBoolMethod(chessRef, [
      "in_threefold_repetition",
      "inThreefoldRepetition",
      "isThreefoldRepetition",
    ])
  )
    return { text: "Draw (3-fold repetition)", over: true };
  if (
    invokeBoolMethod(chessRef, [
      "insufficient_material",
      "insufficientMaterial",
      "isInsufficientMaterial",
    ])
  )
    return { text: "Draw (insufficient material)", over: true };
  if (
    invokeBoolMethod(chessRef, ["in_check", "inCheck", "isInCheck", "isCheck"])
  )
    return { text: "Check", over: false };
  return { text: "Ongoing", over: false };
}

export function boardMatrix(chessRef) {
  try {
    return chessRef.current.board();
  } catch {
    return Array.from({ length: 8 }, () => Array(8).fill(null));
  }
}

export function getFenForMoveIndex({ moveHistory, targetIndex }) {
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

export function capturedPiecesImages(chessRef, getPieceImageUrl) {
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
          captured.w.push(
            (typeof getPieceImageUrl === "function"
              ? getPieceImageUrl({ type: t, color: "b" })
              : null) || `/pieces/b_${t}.png`
          );
        else
          captured.b.push(
            (typeof getPieceImageUrl === "function"
              ? getPieceImageUrl({ type: t, color: "w" })
              : null) || `/pieces/w_${t}.png`
          );
      }
    });
  });
  return captured;
}

/**
 * findKingSquare
 * - chessRef: ref to Chess()
 * - color: 'w'|'b' (required)
 * - FILES, RANKS: optional arrays (defaults included)
 */
export function findKingSquare(
  chessRef,
  color,
  FILES = ["a", "b", "c", "d", "e", "f", "g", "h"],
  RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"]
) {
  if (!chessRef || !chessRef.current) return null;
  if (!color) return null;
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
