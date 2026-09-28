"use client";

import type { Detection } from "@/lib/types";

type Props = {
  people: Detection[];
  videoWidth: number;
  videoHeight: number;
};

export default function PeopleDetection({
  people,
  videoWidth,
  videoHeight,
}: Props) {
  if (!people.length || !videoWidth || !videoHeight) return null;
  return (
    <div className="people-overlay" aria-hidden>
      {people.map((person) => {
        const left = `${(person.box.x / videoWidth) * 100}%`;
        const top = `${(person.box.y / videoHeight) * 100}%`;
        const width = `${(person.box.width / videoWidth) * 100}%`;
        const height = `${(person.box.height / videoHeight) * 100}%`;
        return (
          <div
            key={person.id}
            className="person-box"
            style={{ left, top, width, height }}
          >
            <span>{person.anonymousName}</span>
          </div>
        );
      })}
    </div>
  );
}
