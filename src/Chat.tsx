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
  onSend,
}: {
  messages: ChatMsg[];
  suggestions: string[];
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  const send = (t: string) => {
    const v = t.trim();
    if (!v) return;
    onSend(v);
    setText("");
  };

  return (
    <aside className="chat-panel" aria-label="Copilote">
      <div className="chat-head">
        <span className="pulse-dot" aria-hidden="true" />
        Copilote
        <span className="muted-tag">démo scriptée</span>
      </div>
      <div className="chat-body">
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.from}`}>
            {m.text}
          </div>
        ))}
        <div ref={endRef} />
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
