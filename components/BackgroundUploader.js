// frontend/src/components/BackgroundUploader.jsx
"use client";

import React, { useRef, useState } from "react";
import BtnSpinner from "./BtnSpinner";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

/**
 * BackgroundUploader props:
 * - children (optional): node to render inside button/trigger
 * - className (optional)
 * - onDone(url) optional callback called with absolute url after upload
 */
export default function BackgroundUploader({ children, className, onDone }) {
  const fileRef = useRef(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);

  function openDialog() {
    if (fileRef.current) fileRef.current.click();
  }

  function handleChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    uploadBackground(f);
  }

  function uploadBackground(file) {
    setLoading(true);
    setProgress(0);

    const form = new FormData();
    form.append("background", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/auth/upload-background`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        setProgress(pct);
      }
    };

    xhr.onload = () => {
      let j = {};
      try {
        j = JSON.parse(xhr.responseText || "{}");
      } catch (err) {}
      setLoading(false);
      setProgress(null);

      if (xhr.status >= 200 && xhr.status < 300) {
        let url = j.backgroundUrlAbsolute || j.backgroundUrl || null;
        if (url) {
          const absolute = String(url);
          document.documentElement.style.setProperty(
            "--bg-image-url",
            `url("${absolute}")`
          );
          // emit event so other parts can respond if needed
          window.dispatchEvent(
            new CustomEvent("user:background-updated", {
              detail: { url: absolute },
            })
          );
          if (typeof onDone === "function") onDone(absolute);
        }
      } else {
        const errMsg = j.error || "Upload failed";
        alert(errMsg);
      }
    };

    xhr.onerror = () => {
      setLoading(false);
      setProgress(null);
      alert("Upload error");
    };

    xhr.send(form);
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        style={{ display: "none" }}
      />
      <button
        type="button"
        onClick={openDialog}
        disabled={loading}
        className={className}
      >
        {progress !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: "1.6rem" }}>
            <BtnSpinner /> Uploading...
          </div>
        )}

        {progress === null && (children || "Upload background")}
      </button>
    </div>
  );
}
