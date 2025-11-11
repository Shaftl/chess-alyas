import React from "react";

/**
 * Board rendering component with drag support.
 * Props (all passed from ChessBoard):
 *  - matrix, isBlack, selected, legalMoves, legalMovesVerbose, lastMove, kingInCheckSquare
 *  - handleSquareClick(square)
 *  - getPieceImageUrl(cell)
 *  - styles (imported CSS module)
 *  - onPieceDragStart(square, event)         // NEW - called when a piece drag starts
 *  - onSquareDrop(square, event)             // NEW - called when a piece is dropped on a square
 */
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

export default function Board({
  matrix,
  isBlack,
  selected,
  legalMoves,
  legalMovesVerbose,
  lastMove,
  kingInCheckSquare,
  handleSquareClick,
  getPieceImageUrl,
  styles,
  onPieceDragStart, // NEW
  onSquareDrop, // NEW
}) {
  const boardSquares = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const rIndex = isBlack ? 7 - r : r;
      const fIndex = isBlack ? 7 - f : f;
      const cell = matrix[rIndex][fIndex];
      const square = FILES[fIndex] + RANKS[rIndex];
      const light = (rIndex + fIndex) % 2 === 0;
      const isSelected = selected === square;
      const isLegal = legalMoves.includes(square);
      const verboseMove = legalMovesVerbose.find((m) => m.to === square);
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

      // handlers for drag/drop
      const onDragOver = (e) => {
        // allow drop
        e.preventDefault();
      };

      const onDrop = (e) => {
        e.preventDefault();
        // bubble up to parent handler (ChessBoard) which will call attemptMove
        try {
          if (onSquareDrop) onSquareDrop(square, e);
        } catch (err) {
          // swallow
        }
      };

      boardSquares.push(
        <div
          key={square}
          className={classes}
          onClick={() => handleSquareClick(square)}
          data-square={square}
          onDragOver={onDragOver}
          onDrop={onDrop}
          // touch devices keep click behavior; HTML5 drag is primarily desktop
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
                    // when dragging starts, store origin square and notify parent
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", square);
                      e.currentTarget.classList?.add("dragging");
                      if (onPieceDragStart) onPieceDragStart(square, e);
                    }}
                    onDragEnd={(e) => {
                      e.currentTarget.classList?.remove("dragging");
                    }}
                    // support keyboard/mouse click fallback (already covered by onClick)
                    onMouseDown={(e) => {
                      // nothing special here — click/select still works
                    }}
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

  return <>{boardSquares}</>;
}
