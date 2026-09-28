import { describe, expect, it } from "vitest";
import { interpretCommand, isVisionQuestion, stripWakePhrase } from "../commands";

describe("stripWakePhrase", () => {
  it("removes wake phrases", () => {
    expect(stripWakePhrase("Hey StudyMate, summarize my notes")).toBe(
      "summarize my notes",
    );
    expect(stripWakePhrase("hello study mate tell me a fun fact")).toBe(
      "tell me a fun fact",
    );
  });

  it("returns the text unchanged when there is no wake phrase", () => {
    expect(stripWakePhrase("what time is it")).toBe("what time is it");
  });
});

describe("interpretCommand", () => {
  it("detects view navigation", () => {
    expect(interpretCommand("open my documents")).toMatchObject({ action: "docs" });
    expect(interpretCommand("take me home")).toMatchObject({ action: "home" });
    expect(interpretCommand("open the chat")).toMatchObject({ action: "chat" });
    expect(interpretCommand("open settings")).toMatchObject({ action: "settings" });
    expect(interpretCommand("open my settings")).toMatchObject({ action: "settings" });
    expect(interpretCommand("show the settings")).toMatchObject({ action: "settings" });
  });

  it("detects vision controls and questions", () => {
    expect(interpretCommand("start vision")).toMatchObject({ action: "start_vision" });
    expect(interpretCommand("stop camera")).toMatchObject({ action: "stop_vision" });
    expect(interpretCommand("how many people are there")).toMatchObject({
      action: "vision_question",
    });
    expect(interpretCommand("what do you see?")).toMatchObject({
      action: "vision_question",
    });
  });

  it("detects study commands and stop commands", () => {
    expect(
      interpretCommand("create a quiz about photosynthesis"),
    ).toMatchObject({ action: "create_quiz" });
    expect(interpretCommand("summarise my notes")).toMatchObject({
      action: "summarize_notes",
    });
    expect(interpretCommand("stop listening")).toMatchObject({
      action: "stop_listen",
    });
  });

  it("falls back to none for ordinary prompts", () => {
    expect(interpretCommand("explain photosynthesis")).toMatchObject({ action: "none" });
  });
});

describe("isVisionQuestion", () => {
  it("classifies vision-style questions", () => {
    expect(isVisionQuestion("is there a laptop on the table")).toBe(true);
    expect(isVisionQuestion("explain photosynthesis")).toBe(false);
  });
});