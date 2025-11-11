// frontend/components/MoveHistory.jsx
import React, { useEffect, useRef, useMemo } from "react";
import { Chess } from "chess.js";
import styles from "./MoveHistory.module.css";

function countPiecesOnBoard(chess) {
  const counts = {
    w: { p: 0, r: 0, n: 0, b: 0, q: 0, k: 0 },
    b: { p: 0, r: 0, n: 0, b: 0, q: 0, k: 0 },
  };
  try {
    const board = chess.board();
    board.flat().forEach((cell) => {
      if (cell) {
        counts[cell.color][cell.type] =
          (counts[cell.color][cell.type] || 0) + 1;
      }
    });
  } catch (e) {
    // ignore
  }
  return counts;
}

function detectCapturedFromCounts(before, after) {
  for (const color of ["w", "b"]) {
    for (const t of ["p", "r", "n", "b", "q", "k"]) {
      const b = (before[color] && before[color][t]) || 0;
      const a = (after[color] && after[color][t]) || 0;
      if (a < b) {
        return { type: t, color };
      }
    }
  }
  return null;
}

export default function MoveHistory({
  moveHistory = [],
  analysisIndex = null,
  onJumpToMove,
  onStartReplay,
  onStopReplay,
  getPieceImageUrl, // optional - passed from parent for piece images
}) {
  const listRef = useRef(null);
  const rafRef = useRef(null);

  // auto-scroll to bottom when moves change (safe guards + cancel on cleanup)
  useEffect(() => {
    if (!listRef.current) return;
    // schedule rAF and keep id so we can cancel if unmounted
    rafRef.current = requestAnimationFrame(() => {
      const el = listRef.current;
      if (!el) return;
      try {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      } catch {
        // fallback
        try {
          el.scrollTop = el.scrollHeight;
        } catch {
          // ignore
        }
      }
    });
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [moveHistory?.length]);

  // Annotate moves with capture info using chess.js + counts fallback
  const annotated = useMemo(() => {
    const c = new Chess();
    const out = [];

    for (const rec of moveHistory || []) {
      const before = countPiecesOnBoard(c);

      let res = null;
      try {
        // try applying move as-is (could be SAN string or verbose object)
        res = c.move(rec.move);
      } catch (e) {
        res = null;
      }

      // if not applied, and rec.move looks like verbose {from, to}, try explicitly
      if (
        !res &&
        rec &&
        rec.move &&
        typeof rec.move === "object" &&
        rec.move.from &&
        rec.move.to
      ) {
        try {
          res = c.move({
            from: rec.move.from,
            to: rec.move.to,
            promotion: rec.move.promotion,
          });
        } catch (e) {
          res = null;
        }
      }

      const after = countPiecesOnBoard(c);

      let captured = res?.captured || null;
      let capturedColor = null;
      if (res && typeof res.color === "string") {
        capturedColor = res ? (res.color === "w" ? "b" : "w") : null;
      }

      if (!captured) {
        const det = detectCapturedFromCounts(before, after);
        if (det) {
          captured = det.type;
          capturedColor = det.color;
        }
      }

      out.push({
        ...rec,
        san: res?.san || (typeof rec.move === "string" ? rec.move : null),
        captured: captured || null,
        moverColor: res?.color || null,
        capturedColor: capturedColor || null,
      });
    }

    return out;
  }, [moveHistory]);

  return (
    <div className={styles.sidebarSection}>
      <div className={styles.moveHistory}>
        <div className={styles.historyHeader}>
          <div className={styles.historyControls}>
            <button
              className={`${styles.btn} ${styles["btn-sm"]} ${styles["btn-secondary"]}`}
              onClick={() => {
                onStopReplay();
                onJumpToMove(null);
              }}
            >
              Live
            </button>
            <button
              className={`${styles.btn} ${styles["btn-sm"]} ${styles["btn-secondary"]}`}
              onClick={() => {
                onStopReplay();
                onStartReplay(700);
              }}
            >
              Play
            </button>
            <button
              className={`${styles.btn} ${styles["btn-sm"]} ${styles["btn-secondary"]}`}
              onClick={onStopReplay}
            >
              Pause
            </button>
          </div>
        </div>

        <div className={styles.moveList} ref={listRef}>
          {annotated.length === 0 && (
            <div className={styles.emptyMove}>No moves yet</div>
          )}

          {annotated.map((rec, idx) => {
            const moveNumber = Math.floor(idx / 2) + 1;
            const isWhite = idx % 2 === 0;
            const label = rec.san
              ? rec.san
              : `${rec.move?.from || ""}-${rec.move?.to || ""}${
                  rec.move?.promotion ? "=" + rec.move.promotion : ""
                }`;

            const active =
              analysisIndex === idx ||
              (analysisIndex === null && idx === annotated.length - 1);

            return (
              <div
                key={idx}
                className={`${styles.moveRow} ${
                  active ? styles.moveActive : ""
                }`}
                onClick={() => {
                  onStopReplay();
                  onJumpToMove(idx);
                }}
              >
                {isWhite ? (
                  <div className={styles.moveNumber}>{moveNumber}.</div>
                ) : (
                  <div style={{ width: 28 }} />
                )}

                <div className={styles.moveText}>{label}</div>

                {/* captured piece indicator on the right */}
                <div className={styles.moveCaptured}>
                  {rec.captured ? (
                    getPieceImageUrl ? (
                      <img
                        src={getPieceImageUrl({
                          type: rec.captured,
                          color: rec.capturedColor || "b",
                        })}
                        alt={rec.captured}
                        className={styles.capturedImg}
                      />
                    ) : (
                      <div className={styles.capturedBadge}>
                        {rec.captured.toUpperCase()}
                      </div>
                    )
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
