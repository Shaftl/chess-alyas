// frontend/components/PageSpinner.jsx
"use client";

import React from "react";
import styles from "./PageSpinner.module.css";

export default function PageSpinner() {
  return (
    <div className={styles.pageSpinnerOverlay} role="status" aria-live="polite">
      <div className={styles.spinnerBox}>
        <span className={styles.loader} />
      </div>
    </div>
  );
}
