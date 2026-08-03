import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { setStoredKey } from "./llm";
import "./styles.css";

// Lien magique : ...#k=sk-ant-... → la clé s'installe dans CE navigateur
// (le fragment ne part jamais au serveur) puis disparaît de l'URL.
const keyMatch = window.location.hash.match(/[#&]k=([^&]+)/);
if (keyMatch) {
  setStoredKey(decodeURIComponent(keyMatch[1]));
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
