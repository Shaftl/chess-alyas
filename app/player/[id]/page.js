"use client";
import React from "react";
import { useParams } from "next/navigation";
import PlayerPublic from "@/components/PlayerPublic";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function PlayerPage() {
  const params = useParams();
  // next/navigation useParams returns object with keys matching segment names
  const id = params?.id;
  return (
    <ProtectedRoute>
      <PlayerPublic id={id} />
    </ProtectedRoute>
  );
}
