// frontend/components/AppChrome.js
"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import SideNav from "@/components/SideNav";
import PageSpinner from "@/components/PageSpinner";

/**
 * AppChrome
 * - Renders Header + SideNav for most routes
 * - Hides them when pathname === "/" (root) OR pathname startsWith "/auth"
 *
 * Adds:
 * - Suspense fallback (PageSpinner) for server/component loading
 * - Small client-side navigation spinner overlay when pathname changes
 */

export default function AppChrome({ children }) {
  const pathname = usePathname() || "/";

  // hide chrome on root (/) and auth routes (/auth/*)
  const hideChrome =
    pathname === "/" || pathname === "" || pathname.startsWith("/auth");

  // client-side nav indicator: when pathname changes, show spinner briefly
  const prev = useRef(pathname);
  const [isNavigating, setIsNavigating] = useState(false);
  const navTimerRef = useRef(null);

  useEffect(() => {
    // skip on initial mount
    if (!prev.current) {
      prev.current = pathname;
      return;
    }

    if (pathname !== prev.current) {
      // route changed -> show spinner
      setIsNavigating(true);

      // clear previous timer
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current);
        navTimerRef.current = null;
      }

      // hide spinner after a short delay (adjust as desired)
      navTimerRef.current = setTimeout(() => {
        setIsNavigating(false);
        navTimerRef.current = null;
      }, 700);

      prev.current = pathname;
    }
    // cleanup on unmount
    return () => {
      if (navTimerRef.current) {
        clearTimeout(navTimerRef.current);
        navTimerRef.current = null;
      }
    };
  }, [pathname]);

  // If chrome is hidden (root/auth), still wrap children in Suspense so
  // server-side loads show the spinner fallback.
  if (hideChrome) {
    return (
      <>
        <Suspense fallback={<PageSpinner />}>{children}</Suspense>
        {isNavigating ? <PageSpinner /> : null}
      </>
    );
  }

  // Default: render header + sidenav + content with Suspense fallback
  return (
    <div className="gridRootBox">
      <Header />
      <div className="gridRoot">
        <SideNav />
        <div>
          <Suspense fallback={<PageSpinner />}>{children}</Suspense>
        </div>
      </div>

      {/* show overlay spinner during short client-side navigation transitions */}
      {isNavigating ? <PageSpinner /> : null}
    </div>
  );
}
