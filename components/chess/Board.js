"use client";

import React, { useCallback, useEffect, useRef } from "react";

/**
 * Board component — preserves original DOM structure and classnames.
 * Adds pointer-based drag preview (mobile friendly) while keeping
 * HTML5 dragstart/drop behavior the same (so your handlers continue to work).
 *
 * Props:
 *  - matrix, isBlack, selected, legalMoves, legalMovesVerbose, lastMove, kingInCheckSquare
 *  - handleSquareClick(square)
 *  - getPieceImageUrl(cell)
 *  - styles (css module)
 *  - onPieceDragStart(square, event)
 *  - onSquareDrop(square, event)
 */

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

export default function Board({
  matrix,
  isBlack,
  selected,
  legalMoves = [],
  legalMovesVerbose = [],
  lastMove,
  kingInCheckSquare,
  handleSquareClick,
  getPieceImageUrl,
  styles,
  onPieceDragStart,
  onSquareDrop,
}) {
  const dragStateRef = useRef({
    active: false,
    fromSquare: null,
    pointerId: null,
    previewEl: null,
    offsetX: 0,
    offsetY: 0,
    originImgEl: null,
    imgSrc: null,
  });

  // create preview element appended to body
  const createPreview = useCallback(
    (src, widthPx, heightPx, startX, startY, offsetX, offsetY) => {
      try {
        const layer = document.createElement("div");
        layer.className = (styles && styles.dragLayer) || "dragLayer";
        layer.style.position = "fixed";
        layer.style.left = "0";
        layer.style.top = "0";
        layer.style.width = "0";
        layer.style.height = "0";
        layer.style.pointerEvents = "none";
        layer.style.zIndex = "99999";

        const img = document.createElement("img");
        img.src = src;
        img.alt = "drag";
        img.style.width = `${Math.max(28, Math.min(120, widthPx))}px`;
        img.style.height = `${Math.max(28, Math.min(120, heightPx))}px`;
        img.style.objectFit = "contain";
        img.style.pointerEvents = "none";
        img.style.userSelect = "none";
        img.style.willChange = "transform, opacity";
        img.className = (styles && styles.dragPreview) || "dragPreview";

        const left = startX - offsetX;
        const top = startY - offsetY;
        img.style.transform = `translate3d(${left}px, ${top}px, 0)`;

        layer.appendChild(img);
        document.body.appendChild(layer);
        return layer;
      } catch (e) {
        return null;
      }
    },
    [styles]
  );

  // pointermove handler (clamped to board rect so preview cannot leave the board)
  function pointerMoveHandler(e) {
    const st = dragStateRef.current;
    if (!st.active || e.pointerId !== st.pointerId) return;
    try {
      e.preventDefault();
    } catch (e) {}
    const pX = e.clientX;
    const pY = e.clientY;
    if (st.previewEl) {
      const img = st.previewEl.querySelector("img");
      const previewRect = img
        ? img.getBoundingClientRect()
        : { width: 48, height: 48 };
      // find board container using your boardContainer class (CSS module)
      let boardEl = null;
      try {
        if (styles && styles.boardContainer) {
          boardEl = document.querySelector(`.${styles.boardContainer}`);
        }
        if (!boardEl) {
          boardEl =
            document.querySelector("[class*='boardContainer']") ||
            document.body;
        }
      } catch (err) {
        boardEl = document.body;
      }
      const rect = boardEl.getBoundingClientRect();
      // clamp so preview stays within board rectangle
      let left = pX - st.offsetX;
      let top = pY - st.offsetY;
      const minLeft = rect.left;
      const minTop = rect.top;
      const maxLeft = rect.right - previewRect.width;
      const maxTop = rect.bottom - previewRect.height;
      if (left < minLeft) left = minLeft;
      if (left > maxLeft) left = maxLeft;
      if (top < minTop) top = minTop;
      if (top > maxTop) top = maxTop;
      if (img) img.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    }
  }

  // pointerup handler
  function pointerUpHandler(e) {
    const st = dragStateRef.current;
    if (!st.active || e.pointerId !== st.pointerId) return;
    try {
      e.preventDefault();
    } catch (e) {}

    // find board container using your boardContainer class (CSS module)
    let boardEl = null;
    try {
      if (styles && styles.boardContainer) {
        boardEl = document.querySelector(`.${styles.boardContainer}`);
      }
      if (!boardEl) {
        boardEl =
          document.querySelector("[class*='boardContainer']") || document.body;
      }
    } catch (e) {
      boardEl = document.body;
    }

    let targetSquare = null;
    let insideBoard = false;
    try {
      const rect = boardEl.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      insideBoard =
        x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

      if (insideBoard) {
        const relX = x - rect.left;
        const relY = y - rect.top;
        const cellW = rect.width / 8;
        const cellH = rect.height / 8;
        let col = Math.floor(relX / cellW);
        let row = Math.floor(relY / cellH);
        col = Math.max(0, Math.min(7, col));
        row = Math.max(0, Math.min(7, row));
        const fIndex = isBlack ? 7 - col : col;
        const rIndex = isBlack ? 7 - row : row;
        targetSquare = FILES[fIndex] + RANKS[rIndex];
      } else {
        targetSquare = null;
      }
    } catch (e) {
      targetSquare = null;
    }

    // build synthetic event (dataTransfer.getData returns origin)
    const syntheticEvent = {
      dataTransfer: {
        getData: () => st.fromSquare || "",
      },
      nativeEvent: e,
      clientX: e.clientX,
      clientY: e.clientY,
    };

    try {
      // only call onSquareDrop when released inside board; otherwise treat as cancel
      if (insideBoard) {
        if (targetSquare && typeof onSquareDrop === "function") {
          onSquareDrop(targetSquare, syntheticEvent);
        }
      } else {
        // cancel: do nothing (no move emitted). simply restore origin visually.
      }
    } catch (err) {
      // swallow errors from handler
    } finally {
      // cleanup preview and restore original piece visibility
      try {
        if (st.originImgEl) {
          const origin = st.originImgEl;
          const clsHashed = (styles && styles.draggingOrigin) || null;
          if (clsHashed) origin.classList.remove(clsHashed);
          origin.classList.remove("dragging-origin");
          // fallback inline restore
          origin.style.visibility = "";
        }
      } catch (e) {}
      try {
        if (st.previewEl && st.previewEl.parentNode)
          st.previewEl.parentNode.removeChild(st.previewEl);
      } catch (e) {}
      dragStateRef.current = {
        active: false,
        fromSquare: null,
        pointerId: null,
        previewEl: null,
        offsetX: 0,
        offsetY: 0,
        originImgEl: null,
        imgSrc: null,
      };
      try {
        window.removeEventListener("pointermove", pointerMoveHandler, {
          passive: false,
        });
        window.removeEventListener("pointerup", pointerUpHandler, {
          passive: false,
        });
        window.removeEventListener("pointercancel", pointerUpHandler, {
          passive: false,
        });
      } catch (e) {}
      try {
        document.body.style.cursor = "";
      } catch (e) {}
    }
  }

  // start pointer drag
  const onPointerStart = useCallback(
    (e, square, src) => {
      try {
        // only left button; onPointerDown some devices don't have e.button, so allow missing check
        if (typeof e.button === "number" && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const imgEl = e.currentTarget || e.target;
        const rect = imgEl.getBoundingClientRect();
        const widthPx = rect.width || 64;
        const heightPx = rect.height || 64;
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        const previewEl = createPreview(
          src,
          widthPx,
          heightPx,
          e.clientX,
          e.clientY,
          offsetX,
          offsetY
        );

        // hide original piece so we don't show duplicates (add both hashed and global classname and inline fallback)
        try {
          const clsHashed = (styles && styles.draggingOrigin) || null;
          if (clsHashed) imgEl.classList.add(clsHashed);
          imgEl.classList.add("dragging-origin");
          // inline fallback in case CSS-module wasn't applied or specificity issues
          imgEl.style.visibility = "hidden";
        } catch (err) {}

        dragStateRef.current = {
          active: true,
          fromSquare: square,
          pointerId: e.pointerId,
          previewEl,
          offsetX,
          offsetY,
          originImgEl: imgEl,
          imgSrc: src,
        };

        window.addEventListener("pointermove", pointerMoveHandler, {
          passive: false,
        });
        window.addEventListener("pointerup", pointerUpHandler, {
          passive: false,
        });
        window.addEventListener("pointercancel", pointerUpHandler, {
          passive: false,
        });

        try {
          if (typeof imgEl.setPointerCapture === "function")
            imgEl.setPointerCapture(e.pointerId);
        } catch (err) {}

        try {
          document.body.style.cursor = "grabbing";
        } catch (e) {}

        // call existing onPieceDragStart so your original handlers run
        try {
          if (typeof onPieceDragStart === "function") {
            const synth = {
              dataTransfer: {
                setData: () => {},
                getData: () => square,
              },
              nativeEvent: e,
            };
            onPieceDragStart(square, synth);
          }
        } catch (err) {}
      } catch (err) {
        // fallback cleanup
        try {
          if (
            dragStateRef.current.previewEl &&
            dragStateRef.current.previewEl.parentNode
          )
            dragStateRef.current.previewEl.parentNode.removeChild(
              dragStateRef.current.previewEl
            );
        } catch (e) {}
        dragStateRef.current = {
          active: false,
          fromSquare: null,
          pointerId: null,
          previewEl: null,
          offsetX: 0,
          offsetY: 0,
          originImgEl: null,
          imgSrc: null,
        };
        try {
          document.body.style.cursor = "";
        } catch (e) {}
      }
    },
    [createPreview, onPieceDragStart, styles, isBlack]
  );

  // HTML5 native dragstart: preserve transfer and hide original piece + hide default ghost image
  const onNativeDragStart = useCallback(
    (e, square) => {
      try {
        try {
          e.dataTransfer &&
            e.dataTransfer.setData &&
            e.dataTransfer.setData("text/plain", square);
          // hide default browser ghost image by supplying a tiny transparent image
          try {
            const ghost = new Image();
            ghost.src =
              "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
            e.dataTransfer.setDragImage(ghost, 0, 0);
          } catch (err) {}
        } catch (err) {}
        // hide original piece to avoid duplicate visual while dragging
        try {
          const imgEl = e.currentTarget || e.target;
          const clsHashed = (styles && styles.draggingOrigin) || null;
          if (clsHashed) imgEl.classList.add(clsHashed);
          imgEl.classList.add("dragging-origin");
          imgEl.style.visibility = "hidden";
        } catch (err) {}
        if (typeof onPieceDragStart === "function") {
          onPieceDragStart(square, e);
        }
        try {
          document.body.style.cursor = "grabbing";
        } catch (e) {}
      } catch (err) {}
    },
    [onPieceDragStart, styles]
  );

  // HTML5 dragend: cleanup origin piece & preview (if any)
  const onNativeDragEnd = useCallback(
    (e) => {
      try {
        const imgEl = e.currentTarget || e.target;
        const clsHashed = (styles && styles.draggingOrigin) || null;
        if (clsHashed) imgEl.classList.remove(clsHashed);
        imgEl.classList.remove("dragging-origin");
        imgEl.style.visibility = "";
      } catch (err) {}

      // also cleanup any leftover preview created by pointer system (defensive)
      try {
        if (
          dragStateRef.current.previewEl &&
          dragStateRef.current.previewEl.parentNode
        ) {
          dragStateRef.current.previewEl.parentNode.removeChild(
            dragStateRef.current.previewEl
          );
        }
      } catch (e) {}
      dragStateRef.current = {
        active: false,
        fromSquare: null,
        pointerId: null,
        previewEl: null,
        offsetX: 0,
        offsetY: 0,
        originImgEl: null,
        imgSrc: null,
      };
      try {
        window.removeEventListener("pointermove", pointerMoveHandler, {
          passive: false,
        });
        window.removeEventListener("pointerup", pointerUpHandler, {
          passive: false,
        });
        window.removeEventListener("pointercancel", pointerUpHandler, {
          passive: false,
        });
      } catch (e) {}
      try {
        document.body.style.cursor = "";
      } catch (e) {}
    },
    [styles]
  );

  // cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        if (
          dragStateRef.current.previewEl &&
          dragStateRef.current.previewEl.parentNode
        )
          dragStateRef.current.previewEl.parentNode.removeChild(
            dragStateRef.current.previewEl
          );
      } catch (e) {}
      try {
        window.removeEventListener("pointermove", pointerMoveHandler, {
          passive: false,
        });
        window.removeEventListener("pointerup", pointerUpHandler, {
          passive: false,
        });
        window.removeEventListener("pointercancel", pointerUpHandler, {
          passive: false,
        });
      } catch (e) {}
      try {
        document.body.style.cursor = "";
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build the 64 squares exactly like your original implementation
  const boardSquares = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const rIndex = isBlack ? 7 - r : r;
      const fIndex = isBlack ? 7 - f : f;
      const cell = matrix[rIndex][fIndex];
      const square = FILES[fIndex] + RANKS[rIndex];
      const light = (rIndex + fIndex) % 2 === 0;
      const isSelected = selected === square;
      const isLegal = Array.isArray(legalMoves) && legalMoves.includes(square);
      const verboseMove = (legalMovesVerbose || []).find(
        (m) => m.to === square
      );
      const isCapture = !!(
        verboseMove &&
        (verboseMove.captured ||
          (verboseMove.flags && verboseMove.flags.indexOf("c") !== -1))
      );
      const isLastFrom =
        lastMove && lastMove.move && lastMove.move.from === square;
      const isLastTo = lastMove && lastMove.move && lastMove.move.to === square;
      const classesArr = [styles.square, light ? styles.light : styles.dark];
      if (isSelected) classesArr.push(styles.selected);
      if (isLegal) classesArr.push(styles.legal);
      if (isCapture) classesArr.push(styles.capture);
      if (kingInCheckSquare === square) classesArr.push(styles.inCheck);
      if (isLastFrom || isLastTo) classesArr.push(styles.lastMove);
      const classes = classesArr.join(" ").trim();

      const showFileLabel = isBlack ? rIndex === 0 : rIndex === 7;
      const showRankLabel = isBlack ? fIndex === 7 : fIndex === 0;

      const onDragOver = (e) => {
        try {
          e.preventDefault();
        } catch (e) {}
      };

      const onDrop = (e) => {
        try {
          e.preventDefault();
          if (typeof onSquareDrop === "function") onSquareDrop(square, e);
        } catch (err) {}
      };

      boardSquares.push(
        <div
          key={square}
          className={classes}
          onClick={() => handleSquareClick(square)}
          data-square={square}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {cell
            ? (() => {
                const src = getPieceImageUrl(cell);
                return src ? (
                  <img
                    src={src}
                    alt={`${cell.color}-${cell.type}`}
                    className={styles.pieceImg}
                    draggable={true}
                    onDragStart={(e) => onNativeDragStart(e, square)}
                    onDragEnd={(e) => onNativeDragEnd(e)}
                    onPointerDown={(e) => onPointerStart(e, square, src)}
                  />
                ) : (
                  <div className={styles.pieceFallback}>
                    {cell.type.toUpperCase()}
                  </div>
                );
              })()
            : null}

          {showFileLabel && <div className={styles.fileLabel}>{square[0]}</div>}
          {showRankLabel && <div className={styles.rankLabel}>{square[1]}</div>}
        </div>
      );
    }
  }

  // preserve original behavior: return fragment of squares (so your container .boardContainer continues to apply)
  return <>{boardSquares}</>;
}
