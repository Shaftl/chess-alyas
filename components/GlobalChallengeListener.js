// frontend/components/GlobalChallengeListener.js
"use client";
import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { initSocket } from "@/lib/socketClient";
import {
  setIncomingChallenge,
  clearIncomingChallenge,
} from "@/store/slices/challengeSlice";

/**
 * GlobalChallengeListener
 * - Initializes (or reuses) socket via initSocket()
 * - Dispatches incoming challenge payloads into redux so the rest of app can render the modal
 *
 * Put this once in your client chrome (AppChrome)
 */
export default function GlobalChallengeListener() {
  const dispatch = useDispatch();
  const socketRef = useRef(null);

  useEffect(() => {
    const s = initSocket();
    socketRef.current = s;

    const onChallengeReceived = (payload) => {
      // payload usually: { challengeId, from: { id, username, avatarUrl... }, minutes, colorPreference }
      // add timestamp if missing (useful for UI)
      const normalized = { ...payload, ts: payload.ts || Date.now() };
      dispatch(setIncomingChallenge(normalized));
    };

    const onChallengeDeclined = (payload) => {
      // if server wants to communicate decline to recipient UI, you can clear incoming
      // we won't clear global incoming unless this event matches; keep simple: clear any incoming if it's the same id
      try {
        if (payload?.challengeId) {
          const current = socketRef.current;
        }
      } catch {}
    };

    const onChallengeAccepted = (payload) => {
      // if the user accepted somewhere else, clear incoming
      dispatch(clearIncomingChallenge());
    };

    s.on("challenge-received", onChallengeReceived);
    s.on("challenge-declined", onChallengeDeclined);
    s.on("challenge-accepted", onChallengeAccepted);

    return () => {
      try {
        s.off("challenge-received", onChallengeReceived);
        s.off("challenge-declined", onChallengeDeclined);
        s.off("challenge-accepted", onChallengeAccepted);
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null; // invisible
}
