import { useEffect, useRef, useState } from "react";

/**
 * Copilote (démo) — panneau de chat à gauche de la vue.
 * Les messages « bot » sont poussés par l'app (fiches prêtes, écartés, échecs,
 * fin de lot) ; l'input comprend quelques commandes scriptées.
 */

export interface ChatMsg {
  id: number;
  from: "bot" | "user";
  text: string;
}

export function Chat({
  messages,
  suggestions,
  busy,
  llmActive,
  onSend,
  onSetKey,
}: {
  messages: ChatMsg[];
  suggestions: string[];
  busy: boolean;
  llmActive: boolean;
  onSend: (text: string) => void;
  onSetKey: (key: string | null) => void;
}) {
  const [text, setText] = useState("");
  const [showKeyRow, setShowKeyRow] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  // Ne fait défiler QUE le corps du chat — jamais la page (sur mobile, le
  // panneau est sous la liste : scrollIntoView sauterait à chaque message).
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = (t: string) => {
    const v = t.trim();
    if (!v || busy) return;
    onSend(v);
    setText("");
  };

  return (
    <aside className="chat-panel" aria-label="Copilote">
      <div className="chat-head">
        <span className="pulse-dot" aria-hidden="true" />
        Copilote
        <button
          type="button"
          className={`chip llm-chip ${llmActive ? "active" : ""}`}
          onClick={() => setShowKeyRow((v) => !v)}
          title={llmActive ? "Claude est branché — clé stockée dans CE navigateur uniquement" : "Coller une clé API Anthropic (stockée dans ce navigateur uniquement)"}
        >
          {llmActive ? "Claude ●" : "Brancher Claude"}
        </button>
      </div>
      {showKeyRow && (
        <form
          className="chat-keyrow"
          onSubmit={(e) => {
            e.preventDefault();
            const v = keyDraft.trim();
            if (v) onSetKey(v);
            setKeyDraft("");
            setShowKeyRow(false);
          }}
        >
          <input
            type="password"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="sk-ant-… (reste dans ce navigateur)"
            aria-label="Clé API Anthropic"
          />
          <button type="submit" className="btn-secondary">OK</button>
          {llmActive && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                onSetKey(null);
                setShowKeyRow(false);
              }}
            >
              Retirer
            </button>
          )}
        </form>
      )}
      <div className="chat-body" ref={bodyRef}>
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.from}`}>
            {m.text}
          </div>
        ))}
        {busy && (
          <div className="chat-msg bot typing" aria-label="Le copilote réfléchit">
            <span /><span /><span />
          </div>
        )}
      </div>
      <div className="chat-suggestions">
        {suggestions.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => send(s)}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Écrire au copilote…"
          aria-label="Message au copilote"
        />
        <button type="submit" className="btn-primary">↑</button>
      </form>
    </aside>
  );
}
