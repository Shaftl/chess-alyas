import { useEffect } from "react";

/**
 * useClockEffect params:
 * {
 *  clocks,
 *  prevClocksRef,
 *  prevSecondsRef,
 *  prevClocksRefSetter, // optional
 *  gameOverState,
 *  setGameOverState,
 *  playTick,
 *  tickSoundEnabled,
 *  timerLowRunningRef,
 *  setStatusMsg,
 *  stopReplayImpl,
 *  socketRef,
 *  gameState,
 *  playingWithBot // optional boolean - when true, disable clock behavior
 * }
 */
export default function useClockEffect(params) {
  useEffect(() => {
    try {
      const {
        clocks,
        prevClocksRef,
        prevSecondsRef,
        prevClocksRefSetter,
        gameOverState,
        setGameOverState,
        playTick,
        tickSoundEnabled,
        timerLowRunningRef,
        setStatusMsg,
        stopReplayImpl,
        socketRef,
        gameState,
        playingWithBot,
      } = params || {};

      // If playing with a bot, disable clock behavior entirely.
      if (playingWithBot) {
        try {
          const sm = typeof window !== "undefined" ? window.soundManager : null;
          if (sm && sm.stopTimerLow) sm.stopTimerLow();
          timerLowRunningRef.current = false;
        } catch (e) {}
        return;
      }

      const prev = prevClocksRef.current || { w: null, b: null };
      const curr = clocks || { w: null, b: null };

      const checkAndHandle = (color) => {
        const prevVal = prev[color];
        const currVal = curr[color];
        if (
          (prevVal === null || prevVal > 0) &&
          typeof currVal === "number" &&
          currVal <= 0
        ) {
          if (!gameOverState.over) {
            const loser = color;
            const winner = loser === "w" ? "Black" : "White";

            setGameOverState({ over: true, reason: "timeout", winner, loser });
            setStatusMsg(`Game over — ${winner} wins by timeout`);
            stopReplayImpl();
            try {
              socketRef.current?.emit("player-timeout", {
                roomId: gameState.roomId,
                loser,
              });
            } catch (e) {}
          }
        }
      };

      checkAndHandle("w");
      checkAndHandle("b");

      try {
        const running = clocks.running;
        if (running) {
          const secKey = running;
          const prevSec = prevSecondsRef.current[secKey];
          const currSec =
            typeof clocks[secKey] === "number"
              ? Math.ceil(clocks[secKey] / 1000)
              : null;

          if (prevSec !== null && currSec !== null && currSec < prevSec) {
            playTick();
          }

          // last-10s warning
          try {
            if (tickSoundEnabled) {
              if (
                currSec !== null &&
                currSec <= 10 &&
                currSec > 0 &&
                !timerLowRunningRef.current
              ) {
                const count = Math.min(currSec, 10);
                const sm =
                  typeof window !== "undefined" ? window.soundManager : null;
                if (sm && sm.playTimerLow)
                  sm.playTimerLow(count, { interval: 1000 });
                timerLowRunningRef.current = true;
              } else if (
                (currSec !== null &&
                  currSec > 10 &&
                  timerLowRunningRef.current) ||
                (currSec !== null && currSec <= 0 && timerLowRunningRef.current)
              ) {
                const sm =
                  typeof window !== "undefined" ? window.soundManager : null;
                if (sm && sm.stopTimerLow) sm.stopTimerLow();
                timerLowRunningRef.current = false;
              }
            } else {
              if (timerLowRunningRef.current) {
                const sm =
                  typeof window !== "undefined" ? window.soundManager : null;
                if (sm && sm.stopTimerLow) sm.stopTimerLow();
                timerLowRunningRef.current = false;
              }
            }
          } catch (e) {}

          prevSecondsRef.current[secKey] = currSec;
        }
      } catch (e) {}

      if (typeof prevClocksRefSetter === "function") {
        prevClocksRefSetter({ w: curr.w, b: curr.b });
      } else {
        prevClocksRef.current = { w: curr.w, b: curr.b };
      }
    } catch (e) {}
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    params && params.clocks,
    params && params.gameOverState && params.gameOverState.over,
    params && params.gameState && params.gameState.roomId,
    params && params.tickSoundEnabled,
    params && params.playingWithBot,
  ]);
}
