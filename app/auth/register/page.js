// frontend/app/auth/RegisterPage.jsx
"use client";
import { useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useDispatch, useSelector } from "react-redux";
import { registerUser } from "../../../store/slices/authSlice";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "@/styles/Auth.module.css";
import BtnSpinner from "@/components/BtnSpinner";
import { initSocket, disconnectSocket } from "@/lib/socketClient";

export default function RegisterPage() {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
  });
  const dispatch = useDispatch();
  const auth = useSelector((s) => s.auth);
  const router = useRouter();
  const [serverGeo, setServerGeo] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [dob, setDob] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setDetecting(true);

    // client-side detection: fetch ipapi.co/json to get the real public IP & country from the browser
    let clientInfo = null;
    try {
      const r = await fetch("https://ipapi.co/json/");
      if (r.ok) {
        clientInfo = await r.json();
        // clientInfo contains ip, country_code, etc
      }
    } catch (err) {
      // ignore detection failure — registration will still proceed using server detection
    }

    const clientIp = clientInfo?.ip || null;

    // basic DOB validation: not in the future
    if (dob && dob > new Date()) {
      setDetecting(false);
      alert("Date of birth cannot be in the future.");
      return;
    }

    // dispatch register with clientIp and dob (ISO string or null)
    const res = await dispatch(
      registerUser({
        username: form.username,
        email: form.email,
        password: form.password,
        clientIp,
        dob: dob ? dob.toISOString() : null,
      })
    );

    setDetecting(false);

    if (res.meta.requestStatus === "fulfilled") {
      // backend sets cookie; user state updated in slice
      // store convenience fields returned by server
      const { country, flagUrl, ip } = res.payload || {};
      if (country || flagUrl || ip) {
        setServerGeo({ country, flagUrl, ip });
      }

      // reconnect socket so the server receives the auth cookie on handshake
      try {
        disconnectSocket();
        initSocket();
      } catch (err) {
        console.warn("Socket re-init after register failed:", err);
      }

      router.push("/");
    }
  };

  return (
    <div className={`${styles.container} ${styles.register}`}>
      {/* Main Content */}
      <div className={styles.content}>
        <div className={styles.authCard}>
          {/* Logo */}
          <div className={styles.logoContainer}>
            <div className={styles.logo}>
              <img src="/logo.png" alt="logo" />
            </div>
            <h1 className={styles.brand}>
              Chess<span>Master</span>
            </h1>
            <p className={styles.tagline}>Create your account</p>
          </div>

          {/* Register Form */}
          <form onSubmit={onSubmit} className={styles.form}>
            <div className={styles.formS}>
              <div className={`${styles.inputGroup} ${styles.username}`}>
                <div className={styles.icon}>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    id="User-Circle--Streamline-Solar-Ar"
                    height="24"
                    width="24"
                  >
                    <desc>
                      User Circle Streamline Icon: https://streamlinehq.com
                    </desc>
                    <path
                      stroke="#000000"
                      d="M9 9a3 3 0 1 0 6 0 3 3 0 1 0 -6 0"
                      strokeWidth="1.5"
                    ></path>
                    <path
                      stroke="#000000"
                      d="M2 12a10 10 0 1 0 20 0 10 10 0 1 0 -20 0"
                      strokeWidth="1.5"
                    ></path>
                    <path
                      d="M17.9692 20c-0.1591 -2.8915 -1.0444 -5 -5.9692 -5 -4.92473 0 -5.81003 2.1085 -5.96918 5"
                      stroke="#000000"
                      strokeLinecap="round"
                      strokeWidth="1.5"
                    ></path>
                  </svg>
                </div>

                <input
                  className={styles.input}
                  placeholder="Choose a username"
                  value={form.username}
                  onChange={(e) =>
                    setForm({ ...form, username: e.target.value })
                  }
                  required
                />
              </div>
              <div className={`${styles.inputGroup} ${styles.birthday}`}>
                <div className={styles.icon}>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    id="Calendar--Streamline-Solar-Ar"
                    height="24"
                    width="24"
                  >
                    <desc>
                      Calendar Streamline Icon: https://streamlinehq.com
                    </desc>
                    <path
                      d="M2 12c0 -3.77124 0 -5.65685 1.17157 -6.82843C4.34315 4 6.22876 4 10 4h4c3.7712 0 5.6569 0 6.8284 1.17157C22 6.34315 22 8.22876 22 12v2c0 3.7712 0 5.6569 -1.1716 6.8284C19.6569 22 17.7712 22 14 22h-4c-3.77124 0 -5.65685 0 -6.82843 -1.1716C2 19.6569 2 17.7712 2 14v-2Z"
                      stroke="#000000"
                      strokeWidth="1.5"
                    ></path>
                    <path
                      d="M7 4V2.5"
                      stroke="#000000"
                      strokeLinecap="round"
                      strokeWidth="1.5"
                    ></path>
                    <path
                      d="M17 4V2.5"
                      stroke="#000000"
                      strokeLinecap="round"
                      strokeWidth="1.5"
                    ></path>
                    <path
                      d="M2.5 9h19"
                      stroke="#000000"
                      strokeLinecap="round"
                      strokeWidth="1.5"
                    ></path>
                    <path
                      d="M18 17c0 0.5523 -0.4477 1 -1 1s-1 -0.4477 -1 -1 0.4477 -1 1 -1 1 0.4477 1 1Z"
                      fill="#000000"
                      strokeWidth="1.5"
                    ></path>
                    <path
                      d="M18 13c0 0.5523 -0.4477 1 -1 1s-1 -0.4477 -1 -1 0.4477 -1 1 -1 1 0.4477 1 1Z"
                      fill="#000000"
                      strokeWidth="1.5"
                    ></path>
                    <path
                      d="M13 17c0 0.5523 -0.4477 1 -1 1s-1 -0.4477 -1 -1 0.4477 -1 1 -1 1 0.4477 1 1Z"
                      fill="#000000"
                      strokeWidth="1.5"
                    ></path>
                    <path
                      d="M13 13c0 0.5523 -0.4477 1 -1 1s-1 -0.4477 -1 -1 0.4477 -1 1 -1 1 0.4477 1 1Z"
                      fill="#000000"
                      strokeWidth="1.5"
                    ></path>
                    <path
                      d="M8 17c0 0.5523 -0.44772 1 -1 1s-1 -0.4477 -1 -1 0.44772 -1 1 -1 1 0.4477 1 1Z"
                      fill="#000000"
                      strokeWidth="1.5"
                    ></path>
                    <path
                      d="M8 13c0 0.5523 -0.44772 1 -1 1s-1 -0.4477 -1 -1 0.44772 -1 1 -1 1 0.4477 1 1Z"
                      fill="#000000"
                      strokeWidth="1.5"
                    ></path>
                  </svg>
                </div>

                <DatePicker
                  selected={dob}
                  onChange={(date) => setDob(date)}
                  dateFormat="dd/MM/yyyy"
                  placeholderText="Date of birth"
                  className={styles.input}
                  maxDate={new Date()}
                  showMonthDropdown
                  showYearDropdown
                  dropdownMode="select"
                />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <div className={styles.icon}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  id="Letter--Streamline-Solar-Ar"
                  height="24"
                  width="24"
                >
                  <desc>Letter Streamline Icon: https://streamlinehq.com</desc>
                  <path
                    d="M2 12c0 -3.77124 0 -5.65685 1.17157 -6.82843C4.34315 4 6.22876 4 10 4h4c3.7712 0 5.6569 0 6.8284 1.17157C22 6.34315 22 8.22876 22 12c0 3.7712 0 5.6569 -1.1716 6.8284C19.6569 20 17.7712 20 14 20h-4c-3.77124 0 -5.65685 0 -6.82843 -1.1716C2 17.6569 2 15.7712 2 12Z"
                    stroke="#000000"
                    strokeWidth="1.5"
                  ></path>
                  <path
                    d="m6 8 2.1589 1.79908C9.99553 11.3296 10.9139 12.0949 12 12.0949s2.0045 -0.7653 3.8411 -2.29582L18 8"
                    stroke="#000000"
                    strokeLinecap="round"
                    strokeWidth="1.5"
                  ></path>
                </svg>
              </div>

              <input
                className={styles.input}
                placeholder="Enter your email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                type="email"
                required
              />
            </div>

            <div className={styles.inputGroup}>
              <div className={styles.icon}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  id="Lock-Keyhole--Streamline-Solar-Ar"
                  height="24"
                  width="24"
                >
                  <desc>
                    Lock Keyhole Streamline Icon: https://streamlinehq.com
                  </desc>
                  <path
                    d="M2 16c0 -2.8284 0 -4.2426 0.87868 -5.1213C3.75736 10 5.17157 10 8 10h8c2.8284 0 4.2426 0 5.1213 0.8787C22 11.7574 22 13.1716 22 16s0 4.2426 -0.8787 5.1213C20.2426 22 18.8284 22 16 22H8c-2.82843 0 -4.24264 0 -5.12132 -0.8787C2 20.2426 2 18.8284 2 16Z"
                    stroke="#000000"
                    strokeWidth="1.5"
                  ></path>
                  <path
                    stroke="#000000"
                    d="M10 16a2 2 0 1 0 4 0 2 2 0 1 0 -4 0"
                    strokeWidth="1.5"
                  ></path>
                  <path
                    d="M6 10V8c0 -3.31371 2.68629 -6 6 -6 3.3137 0 6 2.68629 6 6v2"
                    stroke="#000000"
                    strokeLinecap="round"
                    strokeWidth="1.5"
                  ></path>
                </svg>
              </div>

              {/* ✅ Password input with toggle */}
              <input
                className={styles.input}
                placeholder="Create a password"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />

              <div
                className={styles.passwordHideAndShow}
                onClick={() => setShowPassword((prev) => !prev)}
                style={{ cursor: "pointer" }}
              >
                {/* 👁️ Eye Open */}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  id="Eye--Streamline-Solar-Ar"
                  height="24"
                  width="24"
                  style={{ display: showPassword ? "none" : "block" }}
                >
                  <desc>Eye Streamline Icon: https://streamlinehq.com</desc>
                  <path
                    d="M3.27489 15.2957C2.42496 14.1915 2 13.6394 2 12s0.42496 -2.19147 1.27489 -3.29567C4.97196 6.49956 7.81811 4 12 4c4.1819 0 7.028 2.49956 8.7251 4.70433C21.575 9.80853 22 10.3606 22 12s-0.425 2.1915 -1.2749 3.2957C19.028 17.5004 16.1819 20 12 20c-4.18189 0 -7.02804 -2.4996 -8.72511 -4.7043Z"
                    stroke="#000000"
                    strokeWidth="1.5"
                  ></path>
                  <path
                    d="M15 12c0 1.6569 -1.3431 3 -3 3s-3 -1.3431 -3 -3 1.3431 -3 3 -3 3 1.3431 3 3Z"
                    stroke="#000000"
                    strokeWidth="1.5"
                  ></path>
                </svg>

                {/* 🙈 Eye Closed */}
                <svg
                  viewBox="-0.75 -0.75 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  id="Eye-Closed--Streamline-Solar-Ar"
                  height="24"
                  width="24"
                  style={{ display: showPassword ? "block" : "none" }}
                >
                  <desc>
                    Eye Closed Streamline Icon: https://streamlinehq.com
                  </desc>
                  <path
                    d="M2.521275 6.285525c-0.152971875 -0.356925 -0.566325 -0.5222718749999999 -0.92325 -0.3693 -0.356925 0.152971875 -0.5222718749999999 0.566325 -0.3693 0.92325l1.2925499999999999 -0.5539499999999999ZM14.613 12.49565625l-0.25753125 -0.6542812499999999 0.25753125 0.6542812499999999Zm-6.136640625 0.3834375c0.211790625 -0.32540625 0.119615625 -0.76096875 -0.205875 -0.9727500000000001 -0.325490625 -0.21178124999999998 -0.761034375 -0.119625 -0.9728249999999999 0.205875l1.1786999999999999 0.766875ZM5.97315 14.147812499999999c-0.211790625 0.32540625 -0.119615625 0.76096875 0.205875 0.9727500000000001 0.325490625 0.21178124999999998 0.761034375 0.119625 0.9728249999999999 -0.205875l-1.1786999999999999 -0.766875ZM21.2713125 6.839475c0.15290625 -0.356925 -0.012375 -0.7702781249999999 -0.369375 -0.92325 -0.35690625 -0.152971875 -0.77025 0.012375 -0.92325 0.3693l1.2926250000000001 0.5539499999999999ZM17.8125 10.43325l-0.48121875 -0.512625 0.48121875 0.512625Zm0.90909375 1.9035000000000002c0.27459374999999997 0.27459374999999997 0.7197187500000001 0.27459374999999997 0.9943124999999999 0 0.27459374999999997 -0.27459374999999997 0.27459374999999997 -0.7198125000000001 0 -0.9944062499999999l-0.9943124999999999 0.9944062499999999ZM10.546875 15.46875c0 0.3883125 0.3148125 0.703125 0.703125 0.703125s0.703125 -0.3148125 0.703125 -0.703125h-1.40625Zm4.801312500000001 -0.5540625c0.21178124999999998 0.3255 0.64734375 0.41765625 0.9727500000000001 0.205875 0.3255 -0.21178124999999998 0.41765625 -0.64734375 0.205875 -0.9727500000000001l-1.178625 0.766875ZM5.184684375 10.9305c0.274584375 -0.27459374999999997 0.274584375 -0.7198125000000001 0 -0.9944062499999999 -0.274584375 -0.27459374999999997 -0.7197843749999999 -0.27459374999999997 -0.9943687499999999 0l0.9943687499999999 0.9944062499999999Zm-2.40061875 0.41184375c-0.274584375 0.27459374999999997 -0.274584375 0.7198125000000001 0 0.9944062499999999 0.274584375 0.27459374999999997 0.7197843749999999 0.27459374999999997 0.9943687499999999 0l-0.9943687499999999 -0.9944062499999999ZM11.25 12.421875c-3.022396875 0 -5.192503125 -1.5050625 -6.6331875 -3.05656875 -0.720140625 -0.775528125 -1.248140625 -1.55326875 -1.595634375 -2.1370500000000003 -0.17334375000000002 -0.291225 -0.300675 -0.53233125 -0.383615625 -0.698221875 -0.041446875 -0.082884375 -0.07172812499999999 -0.14683125 -0.09104999999999999 -0.18868125 -0.009665625 -0.020915625 -0.016584375000000002 -0.036290625 -0.020784374999999997 -0.045731249999999994 -0.0021 -0.004715624999999999 -0.0035156249999999997 -0.007959375 -0.00425625 -0.00965625 -0.000375 -0.00084375 -0.000571875 -0.0013125 -0.000609375 -0.0013875 -0.000009375 -0.0000375 0.000009375 0.00001875 0.000084375 0.000178125 0.000028125 0.00007500000000000001 0.0001125 0.000271875 0.00013125 0.00030937499999999997C2.521171875 6.28528125 2.521275 6.285525 1.875 6.5625c-0.6462749999999999 0.27697499999999997 -0.646153125 0.277265625 -0.6460125 0.277584375 0.00005625 0.000140625 0.00020625 0.00047812500000000003 0.000328125 0.000759375 0.000234375 0.000553125 0.000525 0.00121875 0.000853125 0.00196875 0.000646875 0.00151875 0.00148125 0.0034312500000000003 0.002484375 0.0057374999999999995 0.002015625 0.0046031250000000004 0.004734375 0.01078125 0.00815625 0.018478124999999998 0.00684375 0.015393750000000001 0.01651875 0.0368625 0.029062499999999998 0.0640125 0.02506875 0.054290625 0.061621875 0.131334375 0.109903125 0.2278875 0.096496875 0.193003125 0.24016875000000001 0.4645875 0.43303125 0.788596875 0.384928125 0.6466875 0.970209375 1.5095999999999998 1.77350625 2.37463125C5.192503125 12.0519375 7.709896875000001 13.828125 11.25 13.828125v-1.40625Zm3.10546875 -0.5805c-0.9097500000000001 0.358125 -1.9413750000000003 0.5805 -3.10546875 0.5805v1.40625c1.3483125 0 2.5543125 -0.2585625 3.62053125 -0.6781875l-0.5150625 -1.3085624999999999Zm-7.057809375000001 0.27084375L5.97315 14.147812499999999l1.1786999999999999 0.766875 1.3245093749999999 -2.03559375 -1.1786999999999999 -0.766875ZM20.625 6.5625c-0.6463125000000001 -0.27697499999999997 -0.6462187500000001 -0.27711562500000003 -0.6461250000000001 -0.277246875 0 -0.0000375 0 -0.000159375 0.00009375 -0.000234375 0 -0.00013125 0.00009375 -0.00024375 0.00009375 -0.00031875 0.00009375 -0.00015000000000000001 0.00009375 -0.000178125 0.00009375 -0.00007500000000000001 -0.00009375 0.0001875 -0.000375 0.0008625 -0.0009375 0.002025 -0.00103125 0.002315625 -0.00290625 0.006553125 -0.005625 0.012637500000000001 -0.0054375 0.012178125 -0.01425 0.031734374999999995 -0.02653125 0.058134375 -0.02465625 0.0528 -0.063 0.13284374999999998 -0.1155 0.23570624999999998 -0.105 0.205875 -0.26587500000000003 0.5021625 -0.484875 0.853621875 -0.43921875000000005 0.7049624999999999 -1.1054062500000001 1.6207218749999999 -2.01440625 2.4738749999999996l0.9624375 1.02534375c1.0209375 -0.9583125 1.7610000000000001 -1.9779656250000002 2.2455 -2.7555375 0.24290625 -0.38979375 0.42328125 -0.72155625 0.544125 -0.958415625 0.060375 -0.11850000000000001 0.10603125 -0.2134875 0.13725 -0.2803875 0.0155625 -0.03345 0.0275625 -0.059896875 0.036 -0.07877812499999999 0.004218749999999999 -0.009440625000000001 0.00759375 -0.0169875 0.01003125 -0.022575 0.00121875 -0.0027937500000000002 0.00215625 -0.005090625 0.003 -0.0069 0.000375 -0.0009 0.00065625 -0.001678125 0.0009375 -0.002325 0.0001875 -0.000328125 0.00028125 -0.0006187499999999999 0.000375 -0.00088125 0.00009375 -0.00013125 0.0001875 -0.00030937499999999997 0.0001875 -0.000375 0.00009375 -0.000159375 0.0001875 -0.00031875 -0.6461250000000001 -0.27729375Zm-3.29371875 3.358125c-0.8053125 0.7558125 -1.79325 1.45528125 -2.9758125 1.92075l0.5150625 1.3085624999999999c1.3815 -0.54375 2.51690625 -1.353375 3.4231875 -2.20396875l-0.9624375 -1.02534375Zm-0.0159375 1.0098749999999999 1.40625 1.40625 0.9943124999999999 -0.9944062499999999 -1.40625 -1.40625 -0.9943124999999999 0.9944062499999999ZM10.546875 13.125v2.34375h1.40625V13.125h-1.40625Zm3.4768125000000003 -0.24590625 1.3245 2.03559375 1.178625 -0.766875 -1.3245 -2.03559375 -1.178625 0.766875ZM4.190315625 9.93609375l-1.40625 1.40625 0.9943687499999999 0.9944062499999999 1.40625 -1.40625 -0.9943687499999999 -0.9944062499999999Z"
                    fill="#000000"
                    strokeWidth="1.5"
                  ></path>
                </svg>
              </div>
            </div>

            <div className="btnBox">
              <button
                type="submit"
                className={`${styles.btn} ${styles.primary}`}
                disabled={detecting || auth.loading}
              >
                <div className={styles.btnBackground}></div>
                <div className={styles.btnGlow}></div>
                {detecting ? (
                  // ? "Detecting location..."
                  <BtnSpinner />
                ) : auth.loading ? (
                  // ? "Creating Account..."
                  <BtnSpinner />
                ) : (
                  "Create Account"
                )}
              </button>
            </div>

            {auth.error && (
              <div className={styles.error}>
                {typeof auth.error === "string"
                  ? auth.error
                  : "Registration failed"}
              </div>
            )}

            {/* Location Detection Result */}
            {serverGeo && (
              <div className={styles.geoInfo}>
                <div className={styles.geoTitle}>Detected location:</div>

                <div className={styles.geoDetails}>
                  {serverGeo.flagUrl && (
                    <img
                      src={serverGeo.flagUrl}
                      alt={serverGeo.country || "flag"}
                      className={styles.flag}
                    />
                  )}
                </div>
              </div>
            )}
          </form>

          {/* Secondary Actions */}
          <div className={styles.secondaryText}>
            <span>
              Already have an account?{" "}
              <Link href="/auth/login" className={styles.link}>
                Sign in
              </Link>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
