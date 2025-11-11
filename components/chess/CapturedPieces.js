// frontend/components/chess/CapturedPieces.jsx
"use client";

import React, { useMemo } from "react";
import styles from "./CapturedPieces.module.css";

/**
 * Props:
 *  - capturedImgs: { w: [url,...], b: [url,...] }
 *  - getPieceImageUrl: function({type, color}) => url  (optional but recommended)
 */
export default function CapturedPieces({
  capturedImgs = { w: [], b: [] },
  getPieceImageUrl = null,
}) {
  // Standard piece values used for the material tally.
  const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const TYPES = ["p", "n", "b", "r", "q", "k"];

  function detectTypeFromUrl(url, color) {
    if (!url) return null;
    try {
      if (getPieceImageUrl && typeof getPieceImageUrl === "function") {
        for (const t of TYPES) {
          const u1 = getPieceImageUrl({ type: t, color: color || "b" });
          if (u1 && u1 === url) return t;
          const u2 = getPieceImageUrl({
            type: t,
            color: color === "w" ? "b" : "w",
          });
          if (u2 && u2 === url) return t;
        }
      }
    } catch (e) {}

    try {
      const file = url.split("/").pop() || url;
      const lower = file.toLowerCase();
      for (const t of TYPES) {
        if (
          lower.includes(`${t}.`) ||
          lower.includes(`_${t}`) ||
          lower.includes(`-${t}`) ||
          lower.includes(`${t}_`) ||
          lower.includes(`${t}-`) ||
          lower.includes(`${t}piece`) ||
          lower.includes(
            t === "p"
              ? "pawn"
              : t === "n"
              ? "knight"
              : t === "b"
              ? "bishop"
              : t === "r"
              ? "rook"
              : t === "q"
              ? "queen"
              : "king"
          )
        ) {
          return t;
        }
      }
    } catch (e) {}

    return null;
  }

  // Build simple arrays of items (one entry per captured image instance)
  function buildList(urls = [], colorHint = "b") {
    const out = [];
    for (const u of urls || []) {
      const t = detectTypeFromUrl(u, colorHint) || "p";
      out.push({ type: t, src: u });
    }
    return out;
  }

  const topCapturedList = useMemo(
    () => buildList(capturedImgs.w || [], "w"),
    [capturedImgs]
  );
  const bottomCapturedList = useMemo(
    () => buildList(capturedImgs.b || [], "b"),
    [capturedImgs]
  );

  const topMaterial = topCapturedList.reduce(
    (s, it) => s + (PIECE_VALUES[it.type] || 0),
    0
  );
  const bottomMaterial = bottomCapturedList.reduce(
    (s, it) => s + (PIECE_VALUES[it.type] || 0),
    0
  );

  // compute visible per-row indicator: show diff only on the side that's ahead
  const topIndicator =
    topMaterial > bottomMaterial ? `+${topMaterial - bottomMaterial}` : "";
  const bottomIndicator =
    bottomMaterial > topMaterial ? `+${bottomMaterial - topMaterial}` : "";

  const renderCapturedRow = (items = []) => {
    if (!items || items.length === 0)
      return <div className={styles.emptyCaptured}>—</div>;

    const MAX_SHOW = 16;
    const shown = items.slice(0, MAX_SHOW);
    const overflow = items.length - shown.length;

    return (
      <div className={styles.capturedRowInner}>
        <div className={styles.capturedList}>
          {shown.map((it, i) => (
            <div
              key={i}
              className={styles.capturedItem}
              title={`${it.type.toUpperCase()}`}
            >
              <img src={it.src} alt={it.type} className={styles.capturedImg} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container} aria-hidden>
      <div className={styles.row}>
        <div className={styles.rowLabel}>White captured</div>

        <div className={styles.rowContent}>
          {renderCapturedRow(topCapturedList)}
          <div className={styles.rowMaterial}>{topIndicator}</div>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.rowLabel}>Black captured</div>

        <div className={styles.rowContent}>
          {renderCapturedRow(bottomCapturedList)}
          <div className={styles.rowMaterial}>{bottomIndicator}</div>
        </div>
      </div>
    </div>
  );
}
