import React from "react";
import ReactDOM from "react-dom/client";
import { AbstractWalletProvider } from "@abstract-foundation/agw-react";
import { abstract } from "viem/chains";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AbstractWalletProvider chain={abstract}>
      <App />
    </AbstractWalletProvider>
  </React.StrictMode>
);
