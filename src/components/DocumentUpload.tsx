"use client";

import { useEffect, useRef, useState } from "react";
import {
  deleteDocument,
  listDocuments,
  saveDocument,
  subscribeDataChanges,
} from "@/lib/database";
import type { StudyDocument } from "@/lib/types";

function uid() {
  return crypto.randomUUID();
}

export default function DocumentUpload() {
  const [docs, setDocs] = useState<StudyDocument[]>([]);
  const [note, setNote] = useState("");
  const [name, setName] = useState("Untitled note");
  const [notice, setNotice] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const load = () => {
      void listDocuments()
        .then((loaded) => {
          if (mountedRef.current) setDocs(loaded);
        })
        .catch(() => {
          if (mountedRef.current) {
            setNotice("Couldn't load your documents. Try again.");
          }
        });
    };
    load();
    const unsubscribe = subscribeDataChanges(load);
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  async function addTextNote() {
    if (!note.trim()) return;
    setNotice(null);
    try {
      await saveDocument({
        id: uid(),
        name: name.trim() || "Untitled note",
        type: "text/plain",
        text: note.trim(),
        createdAt: Date.now(),
      });
      setNote("");
    } catch {
      setNotice("Couldn't save that note. Your browser storage may be full.");
    }
  }

  async function onFile(file: File) {
    setNotice(null);
    try {
      await saveDocument({
        id: uid(),
        name: file.name,
        type: file.type || "text/plain",
        text: (await file.text()).slice(0, 80_000),
        createdAt: Date.now(),
      });
    } catch {
      setNotice(`Couldn't read ${file.name}. Try a smaller text file.`);
    }
  }

  return (
    <section className="panel-card">
      <h2>Documents</h2>
      <p className="muted">
        Add notes StudyMate can summarize or turn into a quiz. Files stay on this device.
      </p>
      <input
        className="field"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Note title"
      />
      <textarea
        className="field area"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Paste lecture notes…"
      />
      <div className="row">
        <button type="button" className="pill-btn" onClick={() => void addTextNote()}>
          Save note
        </button>
        <label className="pill-btn ghost">
          Upload file
          <input
            type="file"
            accept=".txt,.md,.json,.csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {notice && <p className="fallback-note" role="status">{notice}</p>}
      <ul className="doc-list">
        {docs.map((d) => (
          <li key={d.id}>
            <div>
              <strong>{d.name}</strong>
              <p>{d.text.slice(0, 140)}{d.text.length > 140 ? "…" : ""}</p>
            </div>
            <button
              type="button"
              className="text-link"
              onClick={() =>
                void deleteDocument(d.id).catch(() =>
                  setNotice("Couldn't remove that document."),
                )
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}