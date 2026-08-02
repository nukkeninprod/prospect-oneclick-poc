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
  const bodyRef = useRef<HTMLDivElement>(null);

  // Ne fait défiler QUE le corps du chat — jamais la page (sur mobile, le
  // panneau est sous la liste : scrollIntoView sauterait à chaque message).
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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
      <div className="chat-body" ref={bodyRef}>
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.from}`}>
            {m.text}
          </div>
        ))}
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
