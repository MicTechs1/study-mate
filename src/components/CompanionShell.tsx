"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AIOrb from "./AIOrb";
import ConversationPanel from "./ConversationPanel";
import DocumentUpload from "./DocumentUpload";
import Navigation from "./Navigation";
import Onboarding from "./Onboarding";
import QuizGenerator from "./QuizGenerator";
import ReviewQueue from "./ReviewQueue";
import Settings from "./Settings";
import StreakTile from "./StreakTile";
import VisionMode from "./VisionMode";
import VoiceInput from "./VoiceInput";
import VoiceOutput from "./VoiceOutput";
import { askStudyMate, generateQuizQuestions, localReply } from "@/lib/ai";
import { interpretCommand } from "@/lib/commands";
import {
  listDocuments,
  loadSettings,
} from "@/lib/database";
import { useIsClient, useSettings } from "@/lib/hooks";
import { useRetention } from "@/lib/useRetention";
import {
  createRecognizer,
  isSpeechRecognitionSupported,
  requestMicrophonePermission,
  speakText,
  stopSpeaking,
} from "@/lib/speech";
import {
  captureFrame,
  clearLastFrame,
  describeSceneLocally,
  detectScene,
  isCameraSupported,
  startCamera,
  stopCamera,
} from "@/lib/vision";
import type {
  AppView,
  Detection,
  Message,
  OrbState,
  SceneSummary,
} from "@/lib/types";

function uid() {
  return crypto.randomUUID();
}

const STATUS: Record<OrbState, string> = {
  idle: "Tap the orb to talk",
  listening: "Listening...",
  processing: "Thinking...",
  speaking: "StudyMate is speaking...",
  error: "Sorry, I couldn't hear you. Try again.",
};

export default function CompanionShell() {
  const [view, setView] = useState<AppView>("home");
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [status, setStatus] = useState(STATUS.idle);
  const [interim, setInterim] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [expandedChat, setExpandedChat] = useState(false);
  const [typed, setTyped] = useState("");
  const [visionActive, setVisionActive] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [people, setPeople] = useState<Detection[]>([]);
  const [peopleCount, setPeopleCount] = useState(0);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [scene, setScene] = useState<SceneSummary | null>(null);
  const [voiceFallback, setVoiceFallback] = useState(false);
  const [quizDraft, setQuizDraft] = useState<{
    id: string;
    questions: import("@/lib/types").QuizQuestion[];
  } | null>(null);

  const isClient = useIsClient();
  const [settings, updateSettings] = useSettings();
  const retention = useRetention();

  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const listeningRef = useRef(false);
  const visionRef = useRef(false);
  const sceneRef = useRef<SceneSummary | null>(null);
  const detectTimer = useRef<number | null>(null);
  const handlePromptRef = useRef<(raw: string) => Promise<void>>(async () => {});

  const speechUnavailable = isClient && !isSpeechRecognitionSupported();
  const showOnboarding = view === "home" && settings.onboarded === false;

  const stopListen = useCallback(() => {
    listeningRef.current = false;
    recognitionRef.current?.stop();
    setOrbState((s) => (s === "listening" ? "idle" : s));
    setStatus((current) =>
      current === STATUS.listening ? STATUS.idle : current,
    );
  }, []);

  const startVision = useCallback(async () => {
    setVisionError(null);
    if (!isCameraSupported()) {
      setVisionError(
        "Camera access isn't available. You can continue using StudyMate without Vision Mode.",
      );
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    try {
      await startCamera(video);
      visionRef.current = true;
      setVisionActive(true);
      setVideoSize({ width: video.videoWidth, height: video.videoHeight });
    } catch {
      visionRef.current = false;
      setVisionActive(false);
      setVisionError(
        "Camera access isn't available. You can continue using StudyMate without Vision Mode.",
      );
    }
  }, []);

  const stopVision = useCallback(async () => {
    visionRef.current = false;
    setVisionActive(false);
    setPeople([]);
    setPeopleCount(0);
    setScene(null);
    sceneRef.current = null;
    if (detectTimer.current) {
      window.clearInterval(detectTimer.current);
      detectTimer.current = null;
    }
    stopCamera(videoRef.current);
    clearLastFrame();
  }, []);

  const speakReply = useCallback((text: string) => {
    const settings = loadSettings();
    if (!settings.voiceEnabled || !settings.autoSpeak) {
      setOrbState("idle");
      setStatus(STATUS.idle);
      return;
    }
    setOrbState("speaking");
    setStatus(STATUS.speaking);
    speakText(text, {
      rate: settings.voiceRate,
      onend: () => {
        setOrbState("idle");
        setStatus(STATUS.idle);
      },
    });
  }, []);

  const pushMessages = useCallback((userText: string, assistantText: string) => {
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", content: userText, createdAt: Date.now() },
      {
        id: uid(),
        role: "assistant",
        content: assistantText,
        createdAt: Date.now() + 1,
      },
    ]);
  }, []);

  const handlePrompt = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) {
        setOrbState("error");
        setStatus(STATUS.error);
        return;
      }

      const command = interpretCommand(text);
      setOrbState("processing");
      setStatus(STATUS.processing);
      setInterim(text);

      if (command.action === "stop_listen") {
        stopSpeaking();
        stopListen();
        const reply = "Okay, I'll stop listening.";
        pushMessages(text, reply);
        speakReply(reply);
        return;
      }
      if (command.action === "stop_vision") {
        await stopVision();
        const reply = "Camera is off. Your camera is no longer in use.";
        pushMessages(text, reply);
        speakReply(reply);
        return;
      }
      if (command.action === "home") {
        setView("home");
        const reply = "Back home. I'm here whenever you want to talk.";
        pushMessages(text, reply);
        speakReply(reply);
        return;
      }
      if (command.action === "docs") {
        setView("docs");
        const reply = "Opening your documents.";
        pushMessages(text, reply);
        speakReply(reply);
        return;
      }
      if (command.action === "chat") {
        setView("chat");
        setExpandedChat(true);
        const reply = "Here's our conversation.";
        pushMessages(text, reply);
        speakReply(reply);
        return;
      }
      if (command.action === "settings") {
        setView("settings");
        const reply = "Settings is open.";
        pushMessages(text, reply);
        speakReply(reply);
        return;
      }
      if (command.action === "create_quiz") {
        setView("quiz");
        const docs = await listDocuments();
        const questions = await generateQuizQuestions({
          documents: docs,
          topic: command.remainder,
        });
        setQuizDraft({ id: crypto.randomUUID(), questions });
        void retention.scheduleQuiz(questions);
        const reply = questions.length
          ? `Quiz ready — ${questions.length} questions built from your notes. Check your answers when you're done.`
          : "I opened Quiz, but I need notes or a topic first. Add some notes and try again.";
        pushMessages(text, reply);
        speakReply(reply);
        return;
      }
      if (command.action === "start_vision") {
        await startVision();
        const reply = visionRef.current
          ? "Vision is on. Ask me what I see."
          : "I couldn't start the camera.";
        pushMessages(text, reply);
        speakReply(reply);
        return;
      }

      const docs = await listDocuments();
      let visionAnswer: string | null = null;
      let imageDataUrl: string | null = null;
      const currentScene = sceneRef.current;

      if (command.action === "vision_question" || /explain this/i.test(text)) {
        if (!visionRef.current) {
          visionAnswer =
            "Vision isn't on. Tap Vision first so I can look through the camera.";
        } else if (videoRef.current) {
          imageDataUrl = captureFrame(videoRef.current);
          const snap = currentScene || (await detectScene(videoRef.current));
          visionAnswer = describeSceneLocally(snap, text);
          try {
            const res = await fetch("/api/vision", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: text,
                imageDataUrl,
                scene: {
                  peopleCount: snap.peopleCount,
                  people: snap.people.map((p) => ({
                    name: p.anonymousName,
                    posture: p.postureHint,
                    position: p.positionHint,
                  })),
                  objects: snap.objects.map((o) => o.label),
                },
              }),
            });
            const data = (await res.json()) as { text?: string | null };
            if (data.text?.trim()) visionAnswer = data.text.trim();
          } catch {
            // keep on-device answer
          }
        }
      }

      if (command.action === "summarize_notes") {
        const reply = await askStudyMate({
          messages,
          prompt: "Summarize my notes.",
          documents: docs,
        });
        pushMessages(text, reply);
        speakReply(reply);
        return;
      }

      const reply = await askStudyMate({
        messages,
        prompt: command.remainder || text,
        documents: docs,
        scene: currentScene,
        visionAnswer,
        imageDataUrl:
          command.action === "vision_question" ? imageDataUrl : null,
      });
      const finalReply = reply || localReply({ prompt: text, documents: docs, visionAnswer });
      pushMessages(text, finalReply);
      speakReply(finalReply);
    },
    [messages, pushMessages, speakReply, retention, startVision, stopListen, stopVision],
  );

  useEffect(() => {
    handlePromptRef.current = handlePrompt;
  }, [handlePrompt]);

  const startListen = useCallback(async () => {
    if (!isSpeechRecognitionSupported()) {
      setVoiceFallback(true);
      setStatus("Voice input isn't supported in this browser. You can type instead.");
      setOrbState("error");
      return;
    }
    try {
      await requestMicrophonePermission();
    } catch {
      setOrbState("error");
      setStatus("Microphone permission is needed to talk. You can type instead.");
      return;
    }

    stopSpeaking();
    const recognition = createRecognizer({
      onResult: (text, isFinal) => {
        setInterim(text);
        if (isFinal) {
          listeningRef.current = false;
          recognitionRef.current?.stop();
          void handlePromptRef.current(text);
        }
      },
      onEnd: () => {
        if (listeningRef.current) {
          listeningRef.current = false;
          setOrbState("error");
          setStatus(STATUS.error);
        }
      },
      onError: (message) => {
        listeningRef.current = false;
        setOrbState("error");
        setStatus(message);
      },
    });
    if (!recognition) return;
    recognitionRef.current = recognition;
    listeningRef.current = true;
    setOrbState("listening");
    setStatus(STATUS.listening);
    setInterim("");
    recognition.start();
  }, []);

  useEffect(() => {
    if (!visionActive) return;
    const tick = async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        const snap = await detectScene(video);
        sceneRef.current = snap;
        setScene(snap);
        setPeople(snap.people);
        setPeopleCount(snap.peopleCount);
        setVideoSize({ width: video.videoWidth, height: video.videoHeight });
      } catch {
        // model still loading
      }
    };
    void tick();
    detectTimer.current = window.setInterval(() => void tick(), 900);
    return () => {
      if (detectTimer.current) window.clearInterval(detectTimer.current);
    };
  }, [visionActive]);

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      recognitionRef.current?.abort();
      stopSpeaking();
      stopCamera(video);
    };
  }, []);

  const onOrbPress = () => {
    if (orbState === "listening") {
      stopListen();
      return;
    }
    if (orbState === "speaking") {
      stopSpeaking();
      setOrbState("idle");
      setStatus(STATUS.idle);
      return;
    }
    void startListen();
  };

  return (
    <div className={`shell view-${view} ${visionActive ? "has-vision" : ""}`}>
      {showOnboarding && (
        <Onboarding
          onDone={() => updateSettings({ ...settings, onboarded: true })}
        />
      )}
      <Navigation
        view={view}
        onNavigate={setView}
        dueCount={retention.dueCount}
      />

      <main className="stage">
        <div className={`orb-stage ${visionActive ? "with-cam" : ""}`}>
          <VisionMode
            active={visionActive}
            videoRef={videoRef}
            people={people}
            peopleCount={peopleCount}
            videoSize={videoSize}
            onStop={() => void stopVision()}
            error={visionError}
          />
          <AIOrb
            state={orbState}
            visionActive={visionActive}
            onPress={onOrbPress}
            size={view === "home" ? "hero" : "mini"}
          />
        </div>

        {view === "home" && (
          <div className="hero-copy">
            <h1>Hi, I&apos;m StudyMate.</h1>
            <p>Talk to me or show me something.</p>
            <p className={`status state-${orbState}`}>{status}</p>
            {interim && <p className="heard">You: “{interim}”</p>}
            <div className="hero-actions">
              <VoiceInput
                onTalk={onOrbPress}
                listening={orbState === "listening"}
              />
              {!visionActive ? (
                <button
                  type="button"
                  className="pill-btn"
                  onClick={() => void startVision()}
                >
                  <span aria-hidden>👁</span> Vision
                </button>
              ) : (
                <button
                  type="button"
                  className="pill-btn danger"
                  onClick={() => void stopVision()}
                >
                  Stop Camera
                </button>
              )}
            </div>
            <VoiceOutput
              speaking={orbState === "speaking"}
              onStop={() => {
                stopSpeaking();
                setOrbState("idle");
                setStatus(STATUS.idle);
              }}
            />
            <button
              type="button"
              className="text-link"
              onClick={() => setVoiceFallback(true)}
            >
              Type instead
            </button>
            {(voiceFallback || speechUnavailable || orbState === "error") && (
              <form
                className="type-fallback"
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = typed.trim();
                  if (!value) return;
                  setTyped("");
                  void handlePrompt(value);
                }}
              >
                <input
                  className="field"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="Type to StudyMate…"
                />
                <button type="submit" className="pill-btn ghost">
                  Send
                </button>
              </form>
            )}
            <div className="mini-links">
              <button type="button" onClick={() => { setView("chat"); setExpandedChat(true); }}>
                Chat
              </button>
              <button type="button" onClick={() => setView("docs")}>
                Documents
              </button>
              <button type="button" onClick={() => setView("quiz")}>
                Quiz
              </button>
              <button type="button" onClick={() => setView("settings")}>
                Settings
              </button>
            </div>
            {retention.ready && (
              <StreakTile
                streak={retention.streak}
                activeSec={retention.day?.activeSec ?? 0}
                goalMinutes={settings.dailyGoalMinutes}
                dueCount={retention.dueCount}
              />
            )}
            <ReviewQueue due={retention.dueCards} onGrade={retention.grade} />
          </div>
        )}

        {view === "docs" && <DocumentUpload />}
        {view === "quiz" && (
          <QuizGenerator
            key={quizDraft?.id ?? "manual"}
            draft={quizDraft?.questions}
            onReady={(questions) => void retention.scheduleQuiz(questions)}
          />
        )}
        {view === "settings" && <Settings />}
        {view === "chat" && (
          <ConversationPanel
            messages={messages}
            expanded
            onToggle={() => setView("home")}
            compact={false}
          />
        )}
      </main>

      <div className="right-rail">
        {view !== "chat" && (
          <ConversationPanel
            messages={messages}
            expanded={expandedChat}
            onToggle={() => {
              if (expandedChat) setExpandedChat(false);
              else {
                setExpandedChat(true);
                setView("chat");
              }
            }}
          />
        )}
        {visionActive && scene && (
          <div className="panel-card slim">
            <h2>Vision</h2>
            <p>Vision active</p>
            <p>{peopleCount} people detected</p>
            <ul>
              {scene.people.map((p) => (
                <li key={p.id}>
                  {p.anonymousName}: {p.postureHint}, {p.positionHint}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
