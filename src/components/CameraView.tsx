"use client";

import { forwardRef } from "react";

type Props = {
  active: boolean;
};

const CameraView = forwardRef<HTMLVideoElement, Props>(function CameraView(
  { active },
  ref,
) {
  return (
    <div className={`camera-stage ${active ? "on" : ""}`}>
      <video
        ref={ref}
        className="camera-feed"
        playsInline
        muted
        autoPlay
        aria-hidden={!active}
      />
      {active && <div className="vision-veil" />}
    </div>
  );
});

export default CameraView;
