// components/chess/BoardDrag.jsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./BoardDrag.module.css"; // I'll include CSS suggestions below

// props:
// matrix: chessRef.current.board()  (8x8 array)
// isBlack: boolean (flip board)
// selected, legalMoves, lastMove,
// handleSquareClick(square)
// getPieceImageUrl(squarePieceObject)
// onDrop(fromSquare, toSquare) -> should call finalizeMove / attemptMove in parent
export default function BoardDrag({
  matrix = [],
  isBlack = false,
  selected = null,
  legalMoves = [],
  legalMovesVerbose = [],
  lastMove = null,
  kingInCheckSquare = null,
  handleSquareClick = () => {},
  getPieceImageUrl = () => null,
  styles: extStyles = {},
  onDrop = () => {},
}) {
  const boardRef = useRef(null);
  const dragRef = useRef({
    dragging: false,
    fromSquare: null,
    pieceElem: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  });

  // helper: file/rank arrays
  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

  // compute coordinates for square under clientX, clientY
  function pointToSquare(clientX, clientY) {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    const squareSize = rect.width / 8;
    // compute file & rank indexes depending on rotation
    let fileIndex = Math.floor(x / squareSize);
    let rankIndex = Math.floor(y / squareSize);
    if (isBlack) {
      fileIndex = 7 - fileIndex;
      rankIndex = 7 - rankIndex;
    }
    const file = FILES[fileIndex];
    const rank = RANKS[rankIndex];
    return file + rank;
  }

  // convert board matrix index (r,f) to square like 'e4'
  function idxToSquare(r, f) {
    const file = FILES[f];
    const rank = RANKS[r];
    return file + rank;
  }

  // pointer handlers
  function onPointerDownPiece(e, r, f, piece) {
    // only left button or primary pointer
    try {
      if (e.button && e.button !== 0) return;
      const el = e.currentTarget;
      el.setPointerCapture?.(e.pointerId);
      const rect = el.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      dragRef.current = {
        dragging: true,
        fromSquare: idxToSquare(r, f),
        pieceElem: el,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        offsetX,
        offsetY,
      };

      // make piece absolute and top-layer
      el.style.position = "fixed";
      el.style.zIndex = 9999;
      el.style.left = `${e.clientX - offsetX}px`;
      el.style.top = `${e.clientY - offsetY}px`;
      el.style.pointerEvents = "none"; // avoid capturing further events on the element
      document.addEventListener("pointermove", globalPointerMove);
      document.addEventListener("pointerup", globalPointerUp);
    } catch (err) {
      console.error("pointerdown err", err);
    }
  }

  function globalPointerMove(e) {
    const d = dragRef.current;
    if (!d.dragging || d.pointerId !== e.pointerId) return;
    const el = d.pieceElem;
    if (!el) return;
    const x = e.clientX - d.offsetX;
    const y = e.clientY - d.offsetY;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  function globalPointerUp(e) {
    try {
      const d = dragRef.current;
      if (!d.dragging || d.pointerId !== e.pointerId) {
        cleanupDrag();
        return;
      }
      const el = d.pieceElem;
      // compute target square
      const toSquare = pointToSquare(e.clientX, e.clientY);
      const from = d.fromSquare;
      // restore piece element to normal (remove inline styles)
      if (el) {
        el.style.position = "";
        el.style.left = "";
        el.style.top = "";
        el.style.zIndex = "";
        el.style.pointerEvents = "";
      }

      // cleanup listeners
      cleanupDrag();

      // If dropped on a valid square and it's different, call onDrop
      if (toSquare && from && toSquare !== from) {
        onDrop(from, toSquare);
      } else {
        // otherwise treat as a click on the original square to keep click behavior
        handleSquareClick(from);
      }
    } catch (err) {
      console.error("pointerup err", err);
      cleanupDrag();
    }
  }

  function cleanupDrag() {
    try {
      const d = dragRef.current;
      if (d.pieceElem) {
        try {
          d.pieceElem.releasePointerCapture?.(d.pointerId);
        } catch {}
      }
      dragRef.current = {
        dragging: false,
        fromSquare: null,
        pieceElem: null,
        pointerId: null,
        startX: 0,
        startY: 0,
        offsetX: 0,
        offsetY: 0,
      };
      document.removeEventListener("pointermove", globalPointerMove);
      document.removeEventListener("pointerup", globalPointerUp);
    } catch (e) {}
  }

  // if user taps an empty square or a piece and doesn't drag, keep click selection
  function onSquareClick(square) {
    handleSquareClick(square);
  }

  // Render helpers: board rotation
  const rows = matrix || [];
  // matrix is [rankIndex (0..7), fileIndex (0..7)]
  // if isBlack, we flip rows and files when rendering so pointer coords mapping above match.
  return (
    <div className={extStyles.boardContainer || "boardContainer"}>
      <div
        className={extStyles.board || "board"}
        ref={boardRef}
        style={{ touchAction: "none", userSelect: "none" }}
      >
        {rows.map((row, rIdx) => {
          // render in visual order (0 = top '8'). If board rotated we flip indices for render only.
          const r = rIdx;
          const files = row;
          return (
            <div key={`r-${rIdx}`} className={extStyles.rankRow || "rankRow"}>
              {files.map((cell, fIdx) => {
                // compute visual square
                const visualFile = fIdx;
                const square = idxToSquare(r, visualFile);
                // compute displayed square name depending on rotation
                let displaySquare = square;
                if (isBlack) {
                  // visually the UI is rotated, but we still use idxToSquare as canonical value
                  // when mapping pointer -> square we used isBlack logic so this is consistent.
                }

                const piece = cell; // piece object or null
                const pieceImg =
                  piece && getPieceImageUrl ? getPieceImageUrl(piece) : null;

                const isSelected = selected === displaySquare;
                const isLastMove =
                  lastMove &&
                  (lastMove.from === displaySquare ||
                    lastMove.to === displaySquare);

                return (
                  <div
                    key={`${rIdx}-${fIdx}`}
                    className={`${extStyles.square || "square"} ${
                      isSelected ? "selected" : ""
                    } ${isLastMove ? "lastmove" : ""}`}
                    onClick={() => onSquareClick(displaySquare)}
                    role="button"
                    aria-label={displaySquare}
                  >
                    {/* piece element (if any) */}
                    {piece && (
                      <div
                        className={extStyles.piece || "piece"}
                        onPointerDown={(e) =>
                          onPointerDownPiece(e, rIdx, fIdx, piece)
                        }
                        style={{
                          touchAction: "none",
                          userSelect: "none",
                          WebkitUserDrag: "none",
                          cursor: "grab",
                          display: "inline-block",
                        }}
                      >
                        {pieceImg ? (
                          <img
                            src={pieceImg}
                            draggable={false}
                            alt={`${piece.color}${piece.type}`}
                            style={{
                              width: "100%",
                              height: "100%",
                              display: "block",
                            }}
                          />
                        ) : (
                          // fallback: simple unicode pieces (optional)
                          <span style={{ fontSize: 28 }}>
                            {getUnicodeForPiece(piece)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// small helper for fallback unicode rendering
function getUnicodeForPiece(piece) {
  if (!piece) return "";
  const map = {
    p: { w: "♙", b: "♟︎" },
    r: { w: "♖", b: "♜" },
    n: { w: "♘", b: "♞" },
    b: { w: "♗", b: "♝" },
    q: { w: "♕", b: "♛" },
    k: { w: "♔", b: "♚" },
  };
  try {
    return map[piece.type][piece.color] || "";
  } catch {
    return "";
  }
}
