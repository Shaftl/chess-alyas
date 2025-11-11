"use client";
import React from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import ProfileEditor from "@/components/ProfileEditor";

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfileEditor />
    </ProtectedRoute>
  );
}
