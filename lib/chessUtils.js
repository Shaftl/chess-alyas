// File: frontend/lib/chessUtils.js
export function formatMs(ms) {
  if (typeof ms !== "number") return "--:--";
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function getPieceImageUrl(piece) {
  if (!piece) return null;
  const p = piece.type.toLowerCase();
  const colorLetter = piece.color === "w" ? "l" : "d";
  const bgLetter = "t";
  const fname = `Chess_${p}${colorLetter}${bgLetter}45.png`;

  // Use local public folder (correct path)
  return `/peices/${fname}`;
}

export function backendOrigin() {
  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  return (
    process.env.NEXT_PUBLIC_BACKEND_BASE_URL || API.replace(/\/api\/?$/, "")
  );
}

export function normalizeAvatarUrlFromAuthUser(authUser) {
  if (!authUser) return null;
  // prefer server-provided absolute URL first
  const cand =
    authUser.avatarUrlAbsolute || authUser.avatarUrl || authUser.avatar || null;
  if (!cand) return null;
  if (/^https?:\/\//i.test(cand)) return cand;
  // build absolute from backend origin
  return `${backendOrigin()}${cand.startsWith("/") ? "" : "/"}${cand}`;
}
