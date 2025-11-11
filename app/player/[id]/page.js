"use client";
import React from "react";
import { useParams } from "next/navigation";
import PlayerPublic from "@/components/PlayerPublic";

export default function PlayerPage() {
  const params = useParams();
  // next/navigation useParams returns object with keys matching segment names
  const id = params?.id;
  return <PlayerPublic id={id} />;
}
