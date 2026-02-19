import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx"; 
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Failed to find the root element. Check index.html for <div id='root'></div>");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);