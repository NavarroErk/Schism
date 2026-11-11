import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./css/reset.css";
import "./css/index.css";
import "./css/react-tabs.css";
import "./css/controls.css";
import ToastProvider from "./components/ToastProvider.jsx";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  // <StrictMode>
  <BrowserRouter>
    <ToastProvider>
      <App />
    </ToastProvider>
  </BrowserRouter>,
  // </StrictMode>,
);
