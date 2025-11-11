"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./VoicePanel.module.css";

/**
 * VoicePanel - same as previous file but with a working live timer.
 *  - shows elapsed voice session time when connected
 *  - timer starts when status becomes 'connected' and resets on hangup
 *  - uses setInterval (500ms) for smooth seconds update
 *
 * All WebRTC / signalling / audio logic unchanged.
 */

/* ------------------- Emoji icons (kept simple) ------------------- */
const Emoji = ({ label, symbol }) => (
  <span role="img" aria-label={label} style={{ fontSize: "1.1rem" }}>
    {symbol}
  </span>
);

const CallStartIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    id="Microphone--Streamline-Font-Awesome"
    height="16"
    width="16"
  >
    <desc>Microphone Streamline Icon: https://streamlinehq.com</desc>
    <path
      d="M8 0.15999999999999998c-1.623125 0 -2.94 1.316875 -2.94 2.94V8c0 1.623125 1.316875 2.94 2.94 2.94s2.94 -1.316875 2.94 -2.94V3.1c0 -1.623125 -1.316875 -2.94 -2.94 -2.94ZM4.08 6.7749999999999995c0 -0.40731249999999997 -0.32768749999999996 -0.735 -0.735 -0.735s-0.735 0.32768749999999996 -0.735 0.735V8c0 2.7286875 2.0273749999999997 4.9826875 4.654999999999999 5.340999999999999v1.029h-1.47c-0.40731249999999997 0 -0.735 0.32768749999999996 -0.735 0.735s0.32768749999999996 0.735 0.735 0.735h4.41c0.40731249999999997 0 0.735 -0.32768749999999996 0.735 -0.735s-0.32768749999999996 -0.735 -0.735 -0.735h-1.47v-1.029c2.627625 -0.35831250000000003 4.654999999999999 -2.6123125 4.654999999999999 -5.340999999999999v-1.2249999999999999c0 -0.40731249999999997 -0.32768749999999996 -0.735 -0.735 -0.735s-0.735 0.32768749999999996 -0.735 0.735V8c0 2.1651875 -1.7548124999999999 3.92 -3.92 3.92S4.08 10.165187499999998 4.08 8v-1.2249999999999999Z"
      fill="#000000"
      strokeWidth="0.0417"
    ></path>
  </svg>
);

const CallEndIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    id="Circle-Xmark--Streamline-Font-Awesome"
    height="16"
    width="16"
  >
    <desc>Circle Xmark Streamline Icon: https://streamlinehq.com</desc>
    <path
      d="M8 16a8 8 0 1 0 0 -16 8 8 0 1 0 0 16zm-2.53125 -10.53125c0.29375 -0.29375 0.76875 -0.29375 1.059375 0l1.46875 1.46875 1.46875 -1.46875c0.29375 -0.29375 0.76875 -0.29375 1.059375 0s0.29375 0.76875 0 1.059375l-1.46875 1.46875 1.46875 1.46875c0.29375 0.29375 0.29375 0.76875 0 1.059375s-0.76875 0.29375 -1.059375 0l-1.46875 -1.46875 -1.46875 1.46875c-0.29375 0.29375 -0.76875 0.29375 -1.059375 0s-0.29375 -0.76875 0 -1.059375l1.46875 -1.46875 -1.46875 -1.46875c-0.29375 -0.29375 -0.29375 -0.76875 0 -1.059375z"
      fill="#000000"
      strokeWidth="0.0313"
    ></path>
  </svg>
);

const MicOnIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    id="Microphone-Lines--Streamline-Font-Awesome"
    height="16"
    width="16"
  >
    <desc>Microphone Lines Streamline Icon: https://streamlinehq.com</desc>
    <path
      d="M5.06 3.1V8c0 1.623125 1.316875 2.94 2.94 2.94s2.94 -1.316875 2.94 -2.94h-2.4499999999999997c-0.26949999999999996 0 -0.49 -0.22049999999999997 -0.49 -0.49s0.22049999999999997 -0.49 0.49 -0.49h2.4499999999999997v-0.98h-2.4499999999999997c-0.26949999999999996 0 -0.49 -0.22049999999999997 -0.49 -0.49s0.22049999999999997 -0.49 0.49 -0.49h2.4499999999999997V4.08h-2.4499999999999997c-0.26949999999999996 0 -0.49 -0.22049999999999997 -0.49 -0.49s0.22049999999999997 -0.49 0.49 -0.49h2.4499999999999997c0 -1.623125 -1.316875 -2.94 -2.94 -2.94s-2.94 1.316875 -2.94 2.94Zm6.859999999999999 4.41V8c0 2.1651875 -1.7548124999999999 3.92 -3.92 3.92S4.08 10.165187499999998 4.08 8v-1.2249999999999999c0 -0.40731249999999997 -0.32768749999999996 -0.735 -0.735 -0.735s-0.735 0.32768749999999996 -0.735 0.735V8c0 2.7286875 2.0273749999999997 4.9826875 4.654999999999999 5.340999999999999v1.029h-1.47c-0.40731249999999997 0 -0.735 0.32768749999999996 -0.735 0.735s0.32768749999999996 0.735 0.735 0.735h4.41c0.40731249999999997 0 0.735 -0.32768749999999996 0.735 -0.735s-0.32768749999999996 -0.735 -0.735 -0.735h-1.47v-1.029c2.627625 -0.35831250000000003 4.654999999999999 -2.6123125 4.654999999999999 -5.340999999999999v-1.2249999999999999c0 -0.40731249999999997 -0.32768749999999996 -0.735 -0.735 -0.735s-0.735 0.32768749999999996 -0.735 0.735v0.735Z"
      fill="#000000"
      strokeWidth="0.0417"
    ></path>
  </svg>
);

const MicOffIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    id="Microphone-Lines-Slash--Streamline-Font-Awesome"
    height="16"
    width="16"
  >
    <desc>
      Microphone Lines Slash Streamline Icon: https://streamlinehq.com
    </desc>
    <path
      d="M1.1107200000000002 1.8530575c-0.25479500000000005 -0.20089500000000002 -0.6247375000000001 -0.1543475 -0.825635 0.10044750000000001s-0.1543475 0.6247400000000001 0.10044750000000001 0.8256375l14.503747500000001 11.3678c0.25479500000000005 0.20089500000000002 0.6247375000000001 0.1543475 0.825635 -0.10045s0.1543475 -0.6247375000000001 -0.10045 -0.825635L11.726385 10.173112500000002C12.0987775 9.536122500000001 12.311925 8.793785 12.311925 8v-0.9799825000000001c0 -0.325845 -0.26214750000000003 -0.58799 -0.58799 -0.58799s-0.58799 0.262145 -0.58799 0.58799V8c0 0.51939 -0.12494749999999999 1.0069325 -0.34789500000000007 1.438125l-0.4360925 -0.34054500000000004V8h-1.3989250000000002l-0.845235 -0.6614875c0.07105 -0.07595 0.1714975 -0.12250000000000001 0.28419500000000003 -0.12250000000000001h1.9599650000000002v-0.783985h-1.9599650000000002c-0.21559499999999998 0 -0.3919925 -0.1763975 -0.3919925 -0.3919925s0.1763975 -0.3919925 0.3919925 -0.3919925h1.9599650000000002v-0.7839875000000001h-1.9599650000000002c-0.21559499999999998 0 -0.3919925 -0.1763975 -0.3919925 -0.3919925s0.1763975 -0.3919925 0.3919925 -0.3919925h1.9599650000000002c0 -1.2984775000000002 -1.0534800000000002 -2.35196 -2.3519575 -2.35196s-2.35196 1.0534825 -2.35196 2.35196v1.3303250000000002L1.1107200000000002 1.8530575Zm7.825162500000001 9.14079c-0.296445 0.0930975 -0.6100375 0.14209750000000002 -0.9358825 0.14209750000000002 -1.73212 0 -3.135945 -1.403825 -3.135945 -3.135945v-0.21314750000000002l-1.15883 -0.9138325c-0.01225 0.04655000000000001 -0.017150000000000002 0.09554750000000001 -0.017150000000000002 0.1469975V8c0 2.1829125 1.6218725 3.98608 3.7239350000000004 4.272725v0.8231850000000001h-1.17598c-0.32584250000000003 0 -0.58799 0.262145 -0.58799 0.58799s0.26214750000000003 0.58799 0.58799 0.58799h3.5279400000000005c0.32584250000000003 0 0.5879875 -0.262145 0.5879875 -0.58799s-0.262145 -0.58799 -0.5879875 -0.58799h-1.17598V12.272725000000001c0.49978999999999996 -0.06860000000000001 0.9726325 -0.222945 1.403825 -0.4458925l-1.0559325 -0.8305350000000001Z"
      fill="#000000"
      strokeWidth="0.025"
    ></path>
  </svg>
);

const VolumeOnIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    id="Volume-High--Streamline-Font-Awesome"
    height="16"
    width="16"
  >
    <desc>Volume High Streamline Icon: https://streamlinehq.com</desc>
    <path
      d="M13.2332 2.5249625000000004c1.59005 1.29115 2.6068000000000002 3.26585 2.6068000000000002 5.475750000000001s-1.01675 4.18215 -2.6068000000000002 5.475750000000001c-0.25235 0.20579999999999998 -0.6223000000000001 0.1666 -0.8281000000000001 -0.08575s-0.1666 -0.6223000000000001 0.08575 -0.8281000000000001c1.3279 -1.078 2.17315 -2.7195 2.17315 -4.5619000000000005s-0.8452500000000001 -3.4839 -2.17315 -4.56435c-0.25235 -0.20579999999999998 -0.2891 -0.5757500000000001 -0.08575 -0.8281000000000001s0.5757500000000001 -0.2891 0.8281000000000001 -0.08575Zm-1.48225 1.8252500000000003c1.0584 0.8624 1.73705 2.1780500000000003 1.73705 3.6505000000000005s-0.6786500000000001 2.7881 -1.73705 3.6505000000000005c-0.25235 0.20579999999999998 -0.6223000000000001 0.1666 -0.8281000000000001 -0.08575s-0.1666 -0.6223000000000001 0.08575 -0.8281000000000001c0.7962500000000001 -0.6468 1.3034000000000001 -1.6317000000000002 1.3034000000000001 -2.73665s-0.5071500000000001 -2.0898499999999998 -1.3034000000000001 -2.7391c-0.25235 -0.20579999999999998 -0.2891 -0.5757500000000001 -0.08575 -0.8281000000000001s0.5757500000000001 -0.2891 0.8281000000000001 -0.08575Zm-1.48225 1.8252500000000003c0.52675 0.4312 0.8673000000000001 1.0878 0.8673000000000001 1.8252500000000003s-0.34055 1.39405 -0.8673000000000001 1.8252500000000003c-0.25235 0.20579999999999998 -0.6223000000000001 0.1666 -0.8281000000000001 -0.08575s-0.1666 -0.6223000000000001 0.08575 -0.8281000000000001c0.2646 -0.2156 0.43365000000000004 -0.5439 0.43365000000000004 -0.9114000000000001s-0.16905 -0.6958000000000001 -0.43365000000000004 -0.91385c-0.25235 -0.20579999999999998 -0.2891 -0.5757500000000001 -0.08575 -0.8281000000000001s0.5757500000000001 -0.2891 0.8281000000000001 -0.08575Zm-2.73175 -3.59415c0.28175 0.1274 0.46304999999999996 0.40670000000000006 0.46304999999999996 0.7154v9.408c0 0.30870000000000003 -0.18130000000000002 0.588 -0.46304999999999996 0.7154s-0.6125 0.07595 -0.8428000000000001 -0.12985l-3.30505 -2.93755H1.7280000000000002c-0.8648500000000001 0 -1.568 -0.70315 -1.568 -1.568v-1.568c0 -0.8648500000000001 0.70315 -1.568 1.568 -1.568h1.6611000000000002l3.30505 -2.93755c0.2303 -0.20579999999999998 0.56105 -0.2548 0.8428000000000001 -0.12985Z"
      fill="#000000"
      strokeWidth="0.025"
    ></path>
  </svg>
);

const VolumeOffIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    id="Volume-Xmark--Streamline-Font-Awesome"
    height="16"
    width="16"
  >
    <desc>Volume Xmark Streamline Icon: https://streamlinehq.com</desc>
    <path
      d="M8.357322222222223 1.9773194444444442c0.3130833333333333 0.14156944444444444 0.5145444444444444 0.45193055555555556 0.5145444444444444 0.7949583333333333v10.454241666666666c0 0.34303055555555556 -0.2014611111111111 0.6533888888888888 -0.5145444444444444 0.7949583333333333s-0.6806138888888889 0.08439444444444444 -0.9365249999999999 -0.14429166666666665L3.7482 10.612958333333333H1.9023722222222221c-0.9610277777777778 0 -1.7423722222222222 -0.7813444444444444 -1.7423722222222222 -1.7423722222222222v-1.7423722222222222c0 -0.9610277777777778 0.7813444444444444 -1.7423749999999998 1.7423722222222222 -1.7423749999999998h1.8458277777777776L7.420797222222222 2.121611111111111c0.2559111111111111 -0.2286861111111111 0.6234416666666666 -0.2831361111111111 0.9365249999999999 -0.14429166666666665Zm3.3731277777777775 3.5990916666666664 1.49735 1.4973527777777778 1.4973527777777778 -1.4973527777777778c0.2559111111111111 -0.2559111111111111 0.6697249999999999 -0.2559111111111111 0.9229138888888888 0s0.2559111111111111 0.6697249999999999 0 0.9229138888888888l-1.4973527777777778 1.4973527777777778 1.4973527777777778 1.49735c0.2559111111111111 0.2559111111111111 0.2559111111111111 0.6697249999999999 0 0.9229138888888888s-0.6697249999999999 0.2559111111111111 -0.9229138888888888 0l-1.4973527777777778 -1.4973527777777778 -1.49735 1.4973527777777778c-0.2559111111111111 0.2559111111111111 -0.6697249999999999 0.2559111111111111 -0.9229138888888888 0s-0.2559111111111111 -0.6697249999999999 0 -0.9229138888888888l1.4973527777777778 -1.49735 -1.4973527777777778 -1.4973527777777778c-0.2559111111111111 -0.2559111111111111 -0.2559111111111111 -0.6697249999999999 0 -0.9229138888888888s0.6697249999999999 -0.2559111111111111 0.9229138888888888 0Z"
      fill="#000000"
      strokeWidth="0.0278"
    ></path>
  </svg>
);

const ClockIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    id="Clock--Streamline-Font-Awesome"
    height="16"
    width="16"
  >
    <desc>Clock Streamline Icon: https://streamlinehq.com</desc>
    <path
      d="M8 0a8 8 0 1 1 0 16 8 8 0 1 1 0 -16zm-0.75 3.75v4.25c0 0.25 0.125 0.484375 0.334375 0.625l3 2c0.34375 0.23125 0.809375 0.1375 1.040625 -0.209375s0.1375 -0.809375 -0.209375 -1.040625L8.75 7.6V3.75c0 -0.415625 -0.334375 -0.75 -0.75 -0.75s-0.75 0.334375 -0.75 0.75z"
      fill="#000000"
      strokeWidth="0.0313"
    ></path>
  </svg>
);

const AcceptIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    id="Circle-Check--Streamline-Font-Awesome"
    height="16"
    width="16"
  >
    <desc>Circle Check Streamline Icon: https://streamlinehq.com</desc>
    <path
      d="M8 16a8 8 0 1 0 0 -16 8 8 0 1 0 0 16zm3.53125 -9.46875L7.53125 10.53125c-0.29375 0.29375 -0.76875 0.29375 -1.059375 0l-2 -2c-0.29375 -0.29375 -0.29375 -0.76875 0 -1.059375s0.76875 -0.29375 1.059375 0l1.46875 1.46875L10.46875 5.46875c0.29375 -0.29375 0.76875 -0.29375 1.059375 0s0.29375 0.76875 0 1.059375z"
      fill="#000000"
      strokeWidth="0.0313"
    ></path>
  </svg>
);

const DeclineIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    id="Circle-Xmark--Streamline-Font-Awesome"
    height="16"
    width="16"
  >
    <desc>Circle Xmark Streamline Icon: https://streamlinehq.com</desc>
    <path
      d="M8 16a8 8 0 1 0 0 -16 8 8 0 1 0 0 16zm-2.53125 -10.53125c0.29375 -0.29375 0.76875 -0.29375 1.059375 0l1.46875 1.46875 1.46875 -1.46875c0.29375 -0.29375 0.76875 -0.29375 1.059375 0s0.29375 0.76875 0 1.059375l-1.46875 1.46875 1.46875 1.46875c0.29375 0.29375 0.29375 0.76875 0 1.059375s-0.76875 0.29375 -1.059375 0l-1.46875 -1.46875 -1.46875 1.46875c-0.29375 0.29375 -0.76875 0.29375 -1.059375 0s-0.29375 -0.76875 0 -1.059375l1.46875 -1.46875 -1.46875 -1.46875c-0.29375 -0.29375 -0.29375 -0.76875 0 -1.059375z"
      fill="#000000"
      strokeWidth="0.0313"
    ></path>
  </svg>
);

export default function VoicePanel({
  socketRef,
  players = [],
  auth = {},
  gameState = {},
}) {
  // Core refs & state
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const adjustIntervalRef = useRef(null);
  const lastStatsRef = useRef(null);
  const preferredBitrateRef = useRef(32000); // bps
  const [status, setStatus] = useState("idle"); // idle|calling|incoming|connected
  const [micEnabled, setMicEnabled] = useState(true);
  const [mutedRemote, setMutedRemote] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const isMounted = useRef(true);

  // timer refs + state
  const callStartRef = useRef(null); // timestamp ms when call started
  const timerIntervalRef = useRef(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Audio viz refs (kept)
  const audioCtxRef = useRef(null);
  const localAnalyserRef = useRef(null);
  const remoteAnalyserRef = useRef(null);
  const localSourceRef = useRef(null);
  const remoteSourceRef = useRef(null);
  const rafRef = useRef(null);

  // Canvas refs
  const localWaveRef = useRef(null);
  const localMeterRef = useRef(null);
  const remoteWaveRef = useRef(null);
  const remoteMeterRef = useRef(null);

  // RTC config
  const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  try {
    const turnUrl = process.env.NEXT_PUBLIC_TURN_URL || null;
    const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME || null;
    const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL || null;
    if (turnUrl) {
      RTC_CONFIG.iceServers.push({
        urls: turnUrl,
        username: turnUser || undefined,
        credential: turnCred || undefined,
      });
    }
  } catch (e) {}

  /* ---------------- socket wiring unchanged ---------------- */
  useEffect(() => {
    isMounted.current = true;
    const s = socketRef?.current;
    if (!s) return;

    const onOffer = async ({ fromSocketId, offer, fromUser = null }) => {
      try {
        setIncomingCall({ fromSocketId, offer, fromUser });
        setStatus("incoming");
      } catch (e) {
        console.error("webrtc onOffer error", e);
      }
    };

    const onAnswer = async ({ fromSocketId, answer }) => {
      try {
        if (!pcRef.current) return;
        await pcRef.current.setRemoteDescription(answer);
        setStatus("connected");
      } catch (e) {
        console.error("webrtc onAnswer error", e);
      }
    };

    const onIce = async ({ fromSocketId, candidate }) => {
      try {
        if (!candidate || !pcRef.current) return;
        await pcRef.current.addIceCandidate(candidate).catch(() => {});
      } catch (e) {
        console.error("webrtc onIce error", e);
      }
    };

    const onHangup = ({ fromSocketId }) => {
      hangup(false);
      setStatus("idle");
    };

    s.on("webrtc-offer", onOffer);
    s.on("webrtc-answer", onAnswer);
    s.on("webrtc-ice", onIce);
    s.on("webrtc-hangup", onHangup);

    return () => {
      try {
        s.off("webrtc-offer", onOffer);
        s.off("webrtc-answer", onAnswer);
        s.off("webrtc-ice", onIce);
        s.off("webrtc-hangup", onHangup);
      } catch (e) {}
      isMounted.current = false;
      hangup(false);
    };
  }, [socketRef?.current]);

  // helper
  function getOpponentSocketId() {
    try {
      const myColor = gameState.playerColor;
      const opponent = (players || []).find(
        (p) =>
          p.color && (p.color === "w" || p.color === "b") && p.color !== myColor
      );
      return opponent ? opponent.id : null;
    } catch {
      return null;
    }
  }

  /* ---------------- Timer logic ---------------- */
  // Start/stop the elapsed timer when `status` changes to/from 'connected'
  useEffect(() => {
    // start timer when connected
    if (status === "connected") {
      if (!callStartRef.current) callStartRef.current = Date.now();
      // set initial elapsed immediately
      setElapsedMs(Date.now() - callStartRef.current);
      // clear any previous interval
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      // update every 500ms for smooth second updates
      timerIntervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - (callStartRef.current || Date.now()));
      }, 500);
    } else {
      // not connected -> stop timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      // if we left the call (idle), reset elapsed
      if (status === "idle") {
        callStartRef.current = null;
        setElapsedMs(0);
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [status]);

  // helper to format elapsedMs -> "MM:SS" or "H:MM:SS"
  function formatElapsed(ms) {
    const totalSec = Math.floor(ms / 1000);
    const sec = totalSec % 60;
    const totalMin = Math.floor(totalSec / 60);
    const min = totalMin % 60;
    const hrs = Math.floor(totalMin / 60);
    const two = (n) => String(n).padStart(2, "0");
    if (hrs > 0) return `${hrs}:${two(min)}:${two(sec)}`;
    return `${two(min)}:${two(sec)}`;
  }

  /* ---------------- remaining audio / webrtc code kept intact ---------------- */
  function ensureAudioContext() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  }

  function createAnalyser(fftSize = 2048, smoothing = 0.8) {
    const ac = ensureAudioContext();
    const analyser = ac.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = smoothing;
    return analyser;
  }

  async function startLocalAudio() {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const constraints = {
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          sampleSize: 16,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = s;
      setMicEnabled(s.getAudioTracks().some((t) => t.enabled));

      try {
        const ac = ensureAudioContext();
        if (localSourceRef.current) {
          try {
            localSourceRef.current.disconnect();
          } catch {}
          localSourceRef.current = null;
        }
        localSourceRef.current = ac.createMediaStreamSource(s);

        if (localAnalyserRef.current) {
          try {
            localAnalyserRef.current.disconnect();
          } catch {}
          localAnalyserRef.current = null;
        }
        localAnalyserRef.current = createAnalyser(2048, 0.85);

        localSourceRef.current.connect(localAnalyserRef.current);
        startDrawing();
      } catch (e) {
        console.warn("local analyser setup failed", e);
      }

      return s;
    } catch (e) {
      console.error("getUserMedia error", e);
      throw e;
    }
  }

  async function addLocalTracksSafely(pc, stream) {
    try {
      if (!pc || !stream) return;
      const existingSenderTrackIds = new Set(
        (pc.getSenders ? pc.getSenders() : [])
          .map((s) => s.track && s.track.id)
          .filter(Boolean)
      );

      for (const t of stream.getTracks()) {
        if (!existingSenderTrackIds.has(t.id)) {
          try {
            pc.addTrack(t, stream);
          } catch (e) {
            console.warn("addTrack skipped/failed for track", t, e);
          }
        }
      }

      try {
        const senders = pc.getSenders ? pc.getSenders() : [];
        for (const sender of senders) {
          if (!sender || !sender.track || sender.track.kind !== "audio")
            continue;
          try {
            let params = sender.getParameters ? sender.getParameters() : {};
            if (!params.encodings || params.encodings.length === 0)
              params.encodings = [{}];
            params.encodings[0].maxBitrate = preferredBitrateRef.current;
            if (sender.setParameters) await sender.setParameters(params);
          } catch (e) {}
        }
      } catch (e) {}
    } catch (e) {
      console.error("addLocalTracksSafely error", e);
    }
  }

  function mungeOpus(sdp, bitrate = preferredBitrateRef.current) {
    try {
      const opusMatch = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
      if (!opusMatch) return sdp;
      const pid = opusMatch[1];
      const fmtp = `a=fmtp:${pid} minptime=10;useinbandfec=1;maxaveragebitrate=${Math.max(
        8000,
        Math.min(128000, Number(bitrate || 32000))
      )};stereo=0`;
      const fmtpRegex = new RegExp(`a=fmtp:${pid} .+`, "i");
      if (fmtpRegex.test(sdp)) {
        sdp = sdp.replace(fmtpRegex, fmtp);
      } else {
        const rtpLineRegex = new RegExp(
          `(a=rtpmap:${pid}\\s+opus\\/48000.*)`,
          "i"
        );
        sdp = sdp.replace(rtpLineRegex, `$1\r\n${fmtp}`);
      }
      return sdp;
    } catch (e) {
      return sdp;
    }
  }

  async function startAdaptiveBitrate(pc) {
    try {
      if (!pc || !pc.getStats) return;
      const POLL_MS = 3000;
      lastStatsRef.current = null;
      if (adjustIntervalRef.current) {
        clearInterval(adjustIntervalRef.current);
        adjustIntervalRef.current = null;
      }
      adjustIntervalRef.current = setInterval(async () => {
        try {
          const stats = await pc.getStats();
          let outbound = null;
          let inbound = null;
          stats.forEach((r) => {
            if (r.type === "outbound-rtp" && r.kind === "audio") outbound = r;
            if (r.type === "remote-inbound-rtp" && r.kind === "audio")
              outbound = r;
            if (r.type === "inbound-rtp" && r.kind === "audio") inbound = r;
          });

          let lossRatio = 0;
          let rtt = 0;
          if (outbound) {
            const prev = lastStatsRef.current && lastStatsRef.current.outbound;
            if (
              prev &&
              typeof outbound.packetsSent === "number" &&
              typeof prev.packetsSent === "number"
            ) {
              const sentDelta = Math.max(
                0,
                outbound.packetsSent - prev.packetsSent
              );
              const lostDelta = Math.max(
                0,
                (outbound.packetsLost || 0) - (prev.packetsLost || 0)
              );
              lossRatio = sentDelta > 0 ? lostDelta / sentDelta : 0;
            } else if (outbound.packetsLost && outbound.packetsSent) {
              lossRatio =
                outbound.packetsSent > 0
                  ? outbound.packetsLost / outbound.packetsSent
                  : 0;
            }
            if (outbound.roundTripTime) rtt = outbound.roundTripTime;
            if (
              outbound.totalRoundTripTime &&
              typeof outbound.totalRoundTripTime === "number" &&
              outbound.roundTripTime === undefined
            ) {
              rtt = outbound.totalRoundTripTime;
            }
          } else if (inbound) {
            const prev = lastStatsRef.current && lastStatsRef.current.inbound;
            if (
              prev &&
              typeof inbound.packetsLost === "number" &&
              typeof prev.packetsLost === "number"
            ) {
              const lostDelta = Math.max(
                0,
                inbound.packetsLost - prev.packetsLost
              );
              const recvDelta = Math.max(
                0,
                inbound.packetsReceived - (prev.packetsReceived || 0)
              );
              lossRatio = recvDelta > 0 ? lostDelta / recvDelta : 0;
            } else if (inbound.packetsLost && inbound.packetsReceived) {
              lossRatio =
                inbound.packetsReceived > 0
                  ? inbound.packetsLost / inbound.packetsReceived
                  : 0;
            }
            if (inbound.jitter) rtt = inbound.jitter;
          }

          const HIGH_LOSS = 0.06;
          const MED_LOSS = 0.03;
          const LOW_LOSS = 0.01;

          const current = preferredBitrateRef.current || 32000;
          let target = current;

          if (lossRatio >= HIGH_LOSS || (rtt && rtt > 0.5)) {
            target = 16000;
          } else if (lossRatio >= MED_LOSS || (rtt && rtt > 0.25)) {
            target = 24000;
          } else {
            target = Math.min(64000, Math.max(32000, current * 1.5));
          }

          if (target < 8000) target = 8000;
          if (target > 128000) target = 128000;

          if (Math.abs(target - current) / (current || 1) > 0.1) {
            preferredBitrateRef.current = target;
            try {
              const senders = pc.getSenders ? pc.getSenders() : [];
              for (const sender of senders) {
                if (!sender || !sender.track || sender.track.kind !== "audio")
                  continue;
                try {
                  const params = sender.getParameters
                    ? sender.getParameters()
                    : null;
                  if (!params) continue;
                  if (!params.encodings || params.encodings.length === 0)
                    params.encodings = [{}];
                  params.encodings[0].maxBitrate = Math.round(target);
                  if (sender.setParameters) await sender.setParameters(params);
                } catch (e) {}
              }
            } catch (e) {}
          }

          lastStatsRef.current = { outbound, inbound };
        } catch (e) {}
      }, POLL_MS);
    } catch (e) {}
  }

  function stopAdaptiveBitrate() {
    try {
      if (adjustIntervalRef.current) {
        clearInterval(adjustIntervalRef.current);
        adjustIntervalRef.current = null;
      }
      lastStatsRef.current = null;
    } catch (e) {}
  }

  // Visualization code (identical to prior)
  const smoothingState = useRef({ local: 0, remote: 0 });
  const attack = 0.6;
  const release = 0.12;

  function computeRMSFromFloatArray(arr) {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i] * arr[i];
    return Math.sqrt(sum / arr.length);
  }

  function startDrawing() {
    if (rafRef.current) return;
    const localWaveCanvas = localWaveRef.current;
    const localMeterCanvas = localMeterRef.current;
    const remoteWaveCanvas = remoteWaveRef.current;
    const remoteMeterCanvas = remoteMeterRef.current;

    let localData =
      localAnalyserRef.current && localAnalyserRef.current.fftSize
        ? new Float32Array(localAnalyserRef.current.fftSize)
        : new Float32Array(2048);

    let remoteData =
      remoteAnalyserRef.current && remoteAnalyserRef.current.fftSize
        ? new Float32Array(remoteAnalyserRef.current.fftSize)
        : new Float32Array(2048);

    function draw() {
      rafRef.current = requestAnimationFrame(draw);

      // Local
      if (localAnalyserRef.current && localWaveCanvas && localMeterCanvas) {
        try {
          const analyser = localAnalyserRef.current;
          const bufLen = analyser.fftSize;
          if (localData.length !== bufLen) localData = new Float32Array(bufLen);
          analyser.getFloatTimeDomainData(localData);

          const ctx = localWaveCanvas.getContext("2d");
          ctx.clearRect(0, 0, localWaveCanvas.width, localWaveCanvas.height);
          ctx.lineWidth = 2;
          ctx.beginPath();
          const sliceWidth = localWaveCanvas.width / bufLen;
          let x = 0;
          for (let i = 0; i < bufLen; i++) {
            const v = localData[i];
            const y = (v * 0.5 + 0.5) * localWaveCanvas.height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.strokeStyle = "#0a84ff";
          ctx.stroke();

          const rms = computeRMSFromFloatArray(localData);
          const st = smoothingState.current;
          if (rms > st.local) {
            st.local = st.local * (1 - attack) + rms * attack;
          } else {
            st.local = st.local * (1 - release) + rms * release;
          }

          const mctx = localMeterCanvas.getContext("2d");
          mctx.clearRect(0, 0, localMeterCanvas.width, localMeterCanvas.height);
          mctx.fillStyle = "#111";
          mctx.fillRect(0, 0, localMeterCanvas.width, localMeterCanvas.height);

          const bar = Math.min(1, st.local * 3);
          mctx.fillStyle = "#10b981";
          const barWidth = Math.round(localMeterCanvas.width * bar);
          mctx.fillRect(0, 0, barWidth, localMeterCanvas.height);

          if (st.local > 0.9) {
            mctx.fillStyle = "#ef4444";
            mctx.fillRect(
              localMeterCanvas.width - 6,
              0,
              6,
              localMeterCanvas.height
            );
          }
        } catch (e) {}
      }

      // Remote
      if (remoteAnalyserRef.current && remoteWaveCanvas && remoteMeterCanvas) {
        try {
          const analyser = remoteAnalyserRef.current;
          const bufLen = analyser.fftSize;
          if (remoteData.length !== bufLen)
            remoteData = new Float32Array(bufLen);
          analyser.getFloatTimeDomainData(remoteData);

          const ctx = remoteWaveCanvas.getContext("2d");
          ctx.clearRect(0, 0, remoteWaveCanvas.width, remoteWaveCanvas.height);
          ctx.lineWidth = 2;
          ctx.beginPath();
          const sliceWidth = remoteWaveCanvas.width / bufLen;
          let x = 0;
          for (let i = 0; i < bufLen; i++) {
            const v = remoteData[i];
            const y = (v * 0.5 + 0.5) * remoteWaveCanvas.height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.strokeStyle = "#f59e0b";
          ctx.stroke();

          const rms = computeRMSFromFloatArray(remoteData);
          const st = smoothingState.current;
          if (rms > st.remote) {
            st.remote = st.remote * (1 - attack) + rms * attack;
          } else {
            st.remote = st.remote * (1 - release) + rms * release;
          }

          const mctx = remoteMeterCanvas.getContext("2d");
          mctx.clearRect(
            0,
            0,
            remoteMeterCanvas.width,
            remoteMeterCanvas.height
          );
          mctx.fillStyle = "#111";
          mctx.fillRect(
            0,
            0,
            remoteMeterCanvas.width,
            remoteMeterCanvas.height
          );

          const bar = Math.min(1, st.remote * 3);
          mctx.fillStyle = "#60a5fa";
          const barWidth = Math.round(remoteMeterCanvas.width * bar);
          mctx.fillRect(0, 0, barWidth, remoteMeterCanvas.height);

          if (st.remote > 0.9) {
            mctx.fillStyle = "#ef4444";
            mctx.fillRect(
              remoteMeterCanvas.width - 6,
              0,
              6,
              remoteMeterCanvas.height
            );
          }
        } catch (e) {}
      }
    }

    draw();
  }

  function stopDrawing() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function attachRemoteAnalyserIfNeeded() {
    try {
      const audioEl = remoteAudioRef.current;
      if (!audioEl) return;
      const ac = ensureAudioContext();

      if (remoteSourceRef.current && remoteAnalyserRef.current) return;

      const createFromStream = (stream) => {
        try {
          if (remoteSourceRef.current) {
            try {
              remoteSourceRef.current.disconnect();
            } catch {}
            remoteSourceRef.current = null;
          }
          const src = ac.createMediaStreamSource(stream);
          remoteSourceRef.current = src;
          remoteAnalyserRef.current = createAnalyser(2048, 0.9);
          src.connect(remoteAnalyserRef.current);
          startDrawing();
          return true;
        } catch (err) {
          console.warn("createMediaStreamSource failed:", err);
          return false;
        }
      };

      if (audioEl.srcObject && audioEl.srcObject instanceof MediaStream) {
        const ok = createFromStream(audioEl.srcObject);
        if (ok) return;
      }

      try {
        if (remoteSourceRef.current) {
          try {
            remoteSourceRef.current.disconnect();
          } catch {}
          remoteSourceRef.current = null;
        }
        remoteSourceRef.current = ac.createMediaElementSource(audioEl);
        remoteAnalyserRef.current = createAnalyser(2048, 0.9);
        remoteSourceRef.current.connect(remoteAnalyserRef.current);
        startDrawing();
        return;
      } catch (err) {
        console.warn("createMediaElementSource failed:", err);
        remoteSourceRef.current = null;
        remoteAnalyserRef.current = null;
      }

      const onPlay = () => {
        try {
          if (audioEl.srcObject && audioEl.srcObject instanceof MediaStream) {
            createFromStream(audioEl.srcObject);
          } else {
            try {
              remoteSourceRef.current = ac.createMediaElementSource(audioEl);
              remoteAnalyserRef.current = createAnalyser(2048, 0.9);
              remoteSourceRef.current.connect(remoteAnalyserRef.current);
              startDrawing();
            } catch (e) {
              console.warn(
                "fallback createMediaElementSource on play failed",
                e
              );
            }
          }
        } catch (e) {}
        audioEl.removeEventListener("play", onPlay);
        audioEl.removeEventListener("playing", onPlay);
      };

      audioEl.addEventListener("play", onPlay);
      audioEl.addEventListener("playing", onPlay);
    } catch (e) {
      console.warn("attachRemoteAnalyserIfNeeded error", e);
    }
  }

  function createPcInstance() {
    const pc = new (window.RTCPeerConnection || window.webkitRTCPeerConnection)(
      RTC_CONFIG
    );

    pc.ontrack = (evt) => {
      try {
        const remoteStream =
          evt.streams && evt.streams[0] ? evt.streams[0] : evt.stream;
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          try {
            remoteAudioRef.current.muted = false;
            remoteAudioRef.current.volume = 1;
          } catch (e) {}
          remoteAudioRef.current.play().catch(() => {});
        }
        setTimeout(() => {
          attachRemoteAnalyserIfNeeded();
        }, 100);
      } catch (e) {
        console.error("pc.ontrack error:", e);
      }
    };

    pc.onicecandidate = (ev) => {
      if (ev && ev.candidate) {
        try {
          const toSocket = pc._targetSocketId;
          if (toSocket) {
            socketRef.current?.emit("webrtc-ice", {
              toSocketId: toSocket,
              candidate: ev.candidate,
              roomId: gameState.roomId,
            });
          }
        } catch (e) {}
      }
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState || pc.iceConnectionState;
      if (!isMounted.current) return;
      if (st === "connected" || st === "completed") {
        setStatus("connected");
      } else if (["disconnected", "failed", "closed"].includes(st)) {
        // let hangup handle cleanup
      }
    };

    return pc;
  }

  async function hangup(alsoNotify = true) {
    try {
      if (alsoNotify) {
        const target =
          (incomingCall && incomingCall.fromSocketId) || getOpponentSocketId();
        if (target) {
          try {
            socketRef.current?.emit("webrtc-hangup", {
              toSocketId: target,
              roomId: gameState.roomId,
            });
          } catch (e) {}
        }
      }
    } catch (e) {}

    try {
      stopAdaptiveBitrate();
      stopDrawing();

      if (localSourceRef.current) {
        try {
          localSourceRef.current.disconnect();
        } catch {}
        localSourceRef.current = null;
      }
      if (localAnalyserRef.current) {
        try {
          localAnalyserRef.current.disconnect();
        } catch {}
        localAnalyserRef.current = null;
      }

      if (remoteSourceRef.current) {
        try {
          remoteSourceRef.current.disconnect();
        } catch {}
        remoteSourceRef.current = null;
      }
      if (remoteAnalyserRef.current) {
        try {
          remoteAnalyserRef.current.disconnect();
        } catch {}
        remoteAnalyserRef.current = null;
      }

      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {}
        pcRef.current = null;
      }
    } catch (e) {}

    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        localStreamRef.current = null;
      }
    } catch (e) {}

    try {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = null;
      }
    } catch (e) {}

    // stop and reset timer on hangup
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    callStartRef.current = null;
    setElapsedMs(0);

    setIncomingCall(null);
    setStatus("idle");
  }

  function toggleMic() {
    try {
      const s = localStreamRef.current;
      if (!s) return;
      s.getAudioTracks().forEach((t) => {
        t.enabled = !t.enabled;
      });
      setMicEnabled(s.getAudioTracks().some((t) => t.enabled));
    } catch (e) {}
  }

  function toggleRemoteMute() {
    try {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.muted = !remoteAudioRef.current.muted;
        setMutedRemote(remoteAudioRef.current.muted);
      }
    } catch (e) {}
  }

  async function startCall() {
    try {
      const s = socketRef?.current;
      if (!s) {
        setStatus("idle");
        return;
      }
      const target = getOpponentSocketId();
      if (!target) {
        setStatus("idle");
        alert("No player found in room to join voice with.");
        return;
      }

      await startLocalAudio();
      const pc = createPcInstance();
      pcRef.current = pc;
      pc._targetSocketId = target;

      addLocalTracksSafely(pc, localStreamRef.current);

      const offer = await pc.createOffer();
      const munged = mungeOpus(offer.sdp, preferredBitrateRef.current);
      await pc.setLocalDescription({ type: offer.type, sdp: munged });

      try {
        const senders = pc.getSenders ? pc.getSenders() : [];
        for (const sender of senders) {
          if (!sender || !sender.track || sender.track.kind !== "audio")
            continue;
          try {
            const params = sender.getParameters ? sender.getParameters() : null;
            if (!params) continue;
            if (!params.encodings || params.encodings.length === 0)
              params.encodings = [{}];
            params.encodings[0].maxBitrate = preferredBitrateRef.current;
            if (sender.setParameters) await sender.setParameters(params);
          } catch (e) {}
        }
      } catch (e) {}

      socketRef.current?.emit("webrtc-offer", {
        toSocketId: target,
        offer: pc.localDescription,
        roomId: gameState.roomId,
      });
      setStatus("calling");

      startAdaptiveBitrate(pc);
    } catch (e) {
      console.error("startCall error", e);
      setStatus("idle");
    }
  }

  async function acceptIncoming() {
    try {
      if (!incomingCall) return;
      const { fromSocketId, offer } = incomingCall;

      await startLocalAudio();

      const pc = createPcInstance();
      pcRef.current = pc;
      pc._targetSocketId = fromSocketId;

      await pc.setRemoteDescription(offer);

      addLocalTracksSafely(pc, localStreamRef.current);

      const answer = await pc.createAnswer();
      const munged = mungeOpus(answer.sdp, preferredBitrateRef.current);
      await pc.setLocalDescription({ type: answer.type, sdp: munged });

      socketRef.current?.emit("webrtc-answer", {
        toSocketId: fromSocketId,
        answer: pc.localDescription,
        roomId: gameState.roomId,
      });

      setIncomingCall(null);
      setStatus("connected");

      startAdaptiveBitrate(pc);
    } catch (e) {
      console.error("acceptIncoming error", e);
      setIncomingCall(null);
      setStatus("idle");
    }
  }

  function declineIncoming() {
    try {
      if (incomingCall && incomingCall.fromSocketId) {
        socketRef.current?.emit("webrtc-hangup", {
          toSocketId: incomingCall.fromSocketId,
          roomId: gameState.roomId,
        });
      }
    } catch (e) {}
    setIncomingCall(null);
    setStatus("idle");
  }

  const callerName =
    (incomingCall && incomingCall.fromUser?.username) ||
    (incomingCall && incomingCall.fromUser?.displayName) ||
    (incomingCall && incomingCall.fromSocketId) ||
    "Player";

  /* ---------------- JSX ---------------- */
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Sound Chat</h1>
        <div className={styles.connectionIndicator}>
          <div className={`${styles.connectionDot} ${styles[status]}`} />
          <span className={styles.connectionText}>
            {status === "connected" ? "Voice: Secure" : "Voice: Ready"}
          </span>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.userSection}>
          <div className={styles.userInfo} style={{ marginLeft: 0 }}>
            <p className={styles.userStatus}>
              {status === "idle" && "Voice available"}
              {status === "calling" && "Invite sent"}
              {status === "incoming" && "Incoming voice invite"}
              {status === "connected" && "Live • In voice"}
            </p>
          </div>
        </div>

        <div
          className={`${styles.vizSection} ${
            status !== "connected" ? styles.vizSectionActive : ""
          }`}
        >
          <div className={styles.vizBlock}>
            <div className={styles.vizLabel}>You</div>
            <canvas
              ref={localWaveRef}
              width={300}
              height={80}
              className={styles.waveCanvas}
            />
            <canvas
              ref={localMeterRef}
              width={300}
              height={10}
              className={styles.meterCanvas}
            />
          </div>

          <div className={styles.vizBlock}>
            <div className={styles.vizLabel}>Teammate</div>
            <canvas
              ref={remoteWaveRef}
              width={300}
              height={80}
              className={styles.waveCanvas}
            />
            <canvas
              ref={remoteMeterRef}
              width={300}
              height={10}
              className={styles.meterCanvas}
            />
          </div>
        </div>

        {/* Live timer: uses elapsedMs */}
        {status === "connected" && (
          <div className={styles.duration}>
            <ClockIcon />
            <span style={{ marginLeft: 6 }}>{formatElapsed(elapsedMs)}</span>
          </div>
        )}

        <div className={styles.primaryControls}>
          {status === "idle" && (
            <button
              className={styles.primaryButton}
              onClick={startCall}
              title="Join sound chat"
            >
              <CallStartIcon />
              <span style={{ marginLeft: 4 }}>Join Voice</span>
            </button>
          )}

          {(status === "calling" || status === "connected") && (
            <button
              className={styles.hangupButton}
              onClick={() => hangup(true)}
              title="Leave sound chat"
            >
              <CallEndIcon />
              <span style={{ marginLeft: 4 }}>Leave Voice</span>
            </button>
          )}
        </div>

        <div className={styles.secondaryControls}>
          <button
            className={`${styles.controlButton} ${
              !micEnabled ? styles.active : ""
            }`}
            onClick={toggleMic}
            aria-pressed={!micEnabled}
            title={micEnabled ? "Turn mic off" : "Turn mic on"}
          >
            <div className={styles.buttonIcon}>
              {micEnabled ? <MicOnIcon /> : <MicOffIcon />}
            </div>
            <span className={styles.buttonLabel}>
              {micEnabled ? "Mic On" : "Mic Off"}
            </span>
          </button>

          <button
            className={`${styles.controlButton} ${
              mutedRemote ? styles.active : ""
            }`}
            onClick={toggleRemoteMute}
            aria-pressed={mutedRemote}
            title={mutedRemote ? "Unmute teammates" : "Mute teammates"}
          >
            <div className={styles.buttonIcon}>
              {mutedRemote ? <VolumeOffIcon /> : <VolumeOnIcon />}
            </div>
            <span className={styles.buttonLabel}>
              {mutedRemote ? "Sound Off" : "Sound On"}
            </span>
          </button>
        </div>
      </div>

      {incomingCall && (
        <div className={styles.overlay}>
          <div className={styles.incomingCall}>
            <div className={styles.incomingHeader}>
              <h2 className={styles.incomingTitle}>Voice Invite</h2>
              <p className={styles.incomingSubtitle}>
                {incomingCall.fromUser?.username || "Player"} invited you to
                voice
              </p>
            </div>

            <div className={styles.incomingActions}>
              <button
                className={styles.declineButton}
                onClick={declineIncoming}
                aria-label="Ignore invite"
                title="Ignore"
              >
                <DeclineIcon />
              </button>
              <button
                className={styles.acceptButton}
                onClick={acceptIncoming}
                aria-label="Join voice"
                title="Join"
              >
                <AcceptIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        className={styles.audioElement}
      />
    </div>
  );
}
