import React from "react";
import styles from "@/styles/Chess.module.css";

export default function PromotionModal({ promotionRequest, onChoose }) {
  if (!promotionRequest) return null;

  return (
    <div className={styles.promotionModal}>
      <div className={styles.promoBox}>
        <div className={styles.promoTitle}>Promotion</div>
        <div className={styles.promoDescription}>
          Choose a piece to promote to:
        </div>
        <div className={styles.promoChoices}>
          {["q", "r", "b", "n"].map((p) => (
            <div
              key={p}
              className={styles.promoChoice}
              onClick={() => onChoose(p)}
            >
              {p.toUpperCase()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
