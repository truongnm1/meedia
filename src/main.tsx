import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { setupDevToolsBlocker } from "./utils/security";

// Globally disable default Chromium/WebView context menu (right click)
document.addEventListener("contextmenu", (e) => e.preventDefault(), { capture: true });

// Globally disable DevTools and inspection shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U, Shift+F10)
setupDevToolsBlocker();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
