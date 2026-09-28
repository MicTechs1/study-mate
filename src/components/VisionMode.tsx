"use client";

import CameraView from "./CameraView";
import PeopleDetection from "./PeopleDetection";
import type { Detection } from "@/lib/types";
import { RefObject } from "react";

type Props = {
  active: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  people: Detection[];
  peopleCount: number;
  videoSize: { width: number; height: number };
  onStop: () => void;
  error?: string | null;
};

export default function VisionMode({
  active,
  videoRef,
  people,
  peopleCount,
  videoSize,
  onStop,
  error,
}: Props) {
  return (
    <div className={`vision-mode ${active ? "on" : ""}`}>
      <CameraView ref={videoRef} active={active} />
      {active && (
        <>
          <PeopleDetection
            people={people}
            videoWidth={videoSize.width}
            videoHeight={videoSize.height}
          />
          <div className="vision-status">
            <span className="dot" />
            Vision active
            <span className="sep">·</span>
            {peopleCount} {peopleCount === 1 ? "person" : "people"} detected
          </div>
          <button type="button" className="pill-btn danger stop-cam" onClick={onStop}>
            Stop Camera
          </button>
        </>
      )}
      {error && <p className="fallback-note overlay-note">{error}</p>}
    </div>
  );
}
