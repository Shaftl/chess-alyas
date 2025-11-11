import React from "react";
import styles from "./Clock.module.css";
import { formatMs } from "@/lib/chessUtils";

export default function Clocks({
  clocks = { w: null, b: null, running: null },
}) {
  return (
    <div className={styles.sidebarSection}>
      <div className={styles.sidebarTitle}>Clocks</div>

      <div className={styles.clockRow}>
        <div
          className={`${styles.clock} ${
            clocks.running === "w" ? styles.active : ""
          }`}
        >
          <div className={styles.clockTime}>{formatMs(clocks.w)}</div>
          <div className={styles.clockLabel}>White</div>
        </div>

        <div
          className={`${styles.clock} ${
            clocks.running === "b" ? styles.active : ""
          }`}
        >
          <div className={styles.clockTime}>{formatMs(clocks.b)}</div>
          <div className={styles.clockLabel}>Black</div>
        </div>
      </div>
    </div>
  );
}
