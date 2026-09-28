import { describe, expect, it } from "vitest";
import { describeSceneLocally } from "../vision";
import type { SceneSummary } from "../types";

const SCENE: SceneSummary = {
  peopleCount: 2,
  people: [
    {
      id: "p1",
      label: "person",
      score: 0.92,
      box: { x: 0, y: 0, width: 10, height: 10 },
      anonymousName: "Person 1",
      positionHint: "near the center",
      postureHint: "Person standing",
    },
    {
      id: "p2",
      label: "person",
      score: 0.81,
      box: { x: 0, y: 0, width: 10, height: 10 },
      anonymousName: "Person 2",
      positionHint: "near the left side",
      postureHint: "Person sitting or farther from the camera",
    },
  ],
  objects: [
    { id: "o1", label: "laptop", score: 0.7, box: { x: 0, y: 0, width: 10, height: 10 } },
  ],
  capturedAt: 1,
};

const EMPTY: SceneSummary = {
  peopleCount: 0,
  people: [],
  objects: [],
  capturedAt: 0,
};

describe("describeSceneLocally", () => {
  it("counts people", () => {
    expect(describeSceneLocally(SCENE, "how many people")).toContain("2 people");
  });

  it("locates people without naming them", () => {
    const reply = describeSceneLocally(SCENE, "where is the person");
    expect(reply).toContain("Person 1");
    expect(reply).toContain("Person 2");
    expect(reply).not.toContain("Jacob");
  });

  it("does not invent detail for an empty scene", () => {
    const reply = describeSceneLocally(EMPTY, "describe the scene");
    expect(reply).toContain("I don't see any people");
  });

  it("is honest about a specific object that is not visible", () => {
    const reply = describeSceneLocally(SCENE, "is there a phone on the table");
    expect(reply).toMatch(/not sure/i);
  });

  it("confirms objects it can see", () => {
    const reply = describeSceneLocally(SCENE, "what objects do you see");
    expect(reply).toContain("laptop");
  });
});