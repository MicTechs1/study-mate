import type { Detection, SceneSummary } from "./types";

type CocoPrediction = {
  class: string;
  score: number;
  bbox: [number, number, number, number];
};

type Detector = {
  detect: (
    source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  ) => Promise<CocoPrediction[]>;
};

let detectorPromise: Promise<Detector> | null = null;
let cameraStream: MediaStream | null = null;
let lastFrameDataUrl: string | null = null;

const SENSITIVE = /race|religion|health|gender|sexual|politic|ethnic|age|identity/i;

export function isCameraSupported() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export async function startCamera(video: HTMLVideoElement) {
  if (!isCameraSupported()) {
    throw new Error(
      "Camera access isn't available. You can continue using StudyMate without Vision Mode.",
    );
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  cameraStream = stream;
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(video?: HTMLVideoElement | null) {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => {
      track.stop();
      track.enabled = false;
    });
    cameraStream = null;
  }
  if (video) {
    video.pause();
    video.srcObject = null;
  }
  lastFrameDataUrl = null;
}

export function isCameraActive() {
  return Boolean(cameraStream?.getTracks().some((t) => t.readyState === "live"));
}

export async function loadDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      await import("@tensorflow/tfjs");
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      return cocoSsd.load({ base: "lite_mobilenet_v2" });
    })();
  }
  return detectorPromise;
}

function positionHint(box: Detection["box"], frameW: number, frameH: number) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const x =
    cx < frameW * 0.33 ? "near the left side" : cx > frameW * 0.66 ? "near the right side" : "near the center";
  const y =
    cy < frameH * 0.35 ? "toward the top" : cy > frameH * 0.7 ? "toward the bottom" : "";
  return y ? `${x}, ${y}` : x;
}

function postureHint(box: Detection["box"], frameH: number) {
  const ratio = box.height / Math.max(frameH, 1);
  if (ratio > 0.55) return "Person standing";
  if (ratio < 0.32) return "Person sitting or farther from the camera";
  return "Person in view";
}

export async function detectScene(
  video: HTMLVideoElement,
): Promise<SceneSummary> {
  if (video.readyState < 2 || video.videoWidth === 0) {
    return { peopleCount: 0, people: [], objects: [], capturedAt: Date.now() };
  }

  const model = await loadDetector();
  const preds = await model.detect(video);
  const w = video.videoWidth;
  const h = video.videoHeight;

  const peopleRaw = preds
    .filter((p) => p.class === "person" && p.score >= 0.45)
    .sort((a, b) => a.bbox[0] - b.bbox[0]);

  const people: Detection[] = peopleRaw.map((p, index) => {
    const [x, y, width, height] = p.bbox;
    const box = { x, y, width, height };
    return {
      id: `person-${index + 1}`,
      label: "person",
      score: p.score,
      box,
      anonymousName: `Person ${index + 1}`,
      positionHint: positionHint(box, w, h),
      postureHint: postureHint(box, h),
    };
  });

  const objects: Detection[] = preds
    .filter((p) => p.class !== "person" && p.score >= 0.45 && !SENSITIVE.test(p.class))
    .map((p, index) => {
      const [x, y, width, height] = p.bbox;
      return {
        id: `obj-${index}-${p.class}`,
        label: p.class.replace(/_/g, " "),
        score: p.score,
        box: { x, y, width, height },
      };
    });

  return {
    peopleCount: people.length,
    people,
    objects,
    capturedAt: Date.now(),
  };
}

export function captureFrame(video: HTMLVideoElement, maxWidth = 768) {
  if (video.readyState < 2 || video.videoWidth === 0) return null;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  lastFrameDataUrl = canvas.toDataURL("image/jpeg", 0.7);
  return lastFrameDataUrl;
}

export function getLastFrame() {
  return lastFrameDataUrl;
}

export function clearLastFrame() {
  lastFrameDataUrl = null;
}

export function describeSceneLocally(scene: SceneSummary, question: string) {
  const q = question.toLowerCase();
  const peopleLine =
    scene.peopleCount === 0
      ? "I don't see any people in the current view."
      : scene.peopleCount === 1
        ? "I can see 1 person."
        : `I can see ${scene.peopleCount} people.`;

  const peopleDetail = scene.people
    .map((p) => `${p.anonymousName}: ${p.postureHint}, ${p.positionHint}.`)
    .join(" ");

  const objectNames = [...new Set(scene.objects.map((o) => o.label))];
  const objectsLine =
    objectNames.length === 0
      ? "I don't clearly see common objects I can name."
      : `I can also see: ${objectNames.join(", ")}.`;

  if (/how many people/.test(q)) {
    return peopleLine;
  }
  if (/where is the person|where are the people|standing/.test(q)) {
    if (!scene.people.length) return "I'm not sure. I don't see a person in this frame.";
    return peopleDetail;
  }
  if (/laptop|table|phone|book|chair|bottle|cup/.test(q)) {
    const match = objectNames.find((name) => q.includes(name));
    if (/laptop/.test(q)) {
      return objectNames.includes("laptop")
        ? "Yes — I can see a laptop in the current view."
        : "I'm not sure. I don't clearly see a laptop in this frame.";
    }
    if (match) return `Yes, I can see a ${match}.`;
    return `I'm not sure about that specifically. ${objectsLine}`;
  }
  if (/what objects|on the table/.test(q)) {
    return objectsLine;
  }

  const parts = [peopleLine];
  if (peopleDetail) parts.push(peopleDetail);
  parts.push(objectsLine);
  parts.push("I only describe this camera frame, and I don't identify anyone by name.");
  return parts.join(" ");
}
