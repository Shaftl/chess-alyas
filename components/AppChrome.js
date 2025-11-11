// frontend/components/AppChrome.js
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import SideNav from "@/components/SideNav";

/**
 * AppChrome
 * - Renders Header + SideNav for most routes
 * - Hides them when pathname === "/" (root) OR pathname startsWith "/auth"
 *
 * Keeps layout markup identical to your original layout when shown:
 * <div className="gridRootBox">
 *   <Header />
 *   <div className="gridRoot">
 *     <SideNav />
 *     <div>{children}</div>
 *   </div>
 * </div>
 *
 * When hidden it simply renders children only.
 */

export default function AppChrome({ children }) {
  const pathname = usePathname() || "/";

  // hide chrome on root (/) and auth routes (/auth/*)
  const hideChrome =
    pathname === "/" || pathname === "" || pathname.startsWith("/auth");

  if (hideChrome) {
    // Render children only (no header / sidenav)
    return <>{children}</>;
  }

  // Default: render header + sidenav + content
  return (
    <div className="gridRootBox">
      <Header />
      <div className="gridRoot">
        <SideNav />
        <div>{children}</div>
      </div>
    </div>
  );
}
