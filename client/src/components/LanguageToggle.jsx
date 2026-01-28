import React from "react";
import { useLanguage } from "../context/LanguageContext";

export default function LanguageToggle({ className = "" }) {
  const { language, setLanguage } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "id" : "en");
  };

  return (
    <button
      onClick={toggleLanguage}
      className={`btn btn-sm d-flex align-items-center gap-2 ${className}`}
      style={{
        background: "rgba(255, 215, 0, 0.1)",
        border: "1px solid rgba(255, 215, 0, 0.3)",
        color: "#f5c97a",
        borderRadius: "6px",
        padding: "6px 12px",
        fontSize: "12px",
        fontWeight: "600",
        letterSpacing: "0.5px",
        transition: "all 0.2s ease",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.background = "rgba(255, 215, 0, 0.2)";
        e.currentTarget.style.borderColor = "rgba(255, 215, 0, 0.5)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = "rgba(255, 215, 0, 0.1)";
        e.currentTarget.style.borderColor = "rgba(255, 215, 0, 0.3)";
      }}
    >
      <span style={{ fontSize: "14px" }}>🌐</span>
      <span>{language === "en" ? "EN" : "ID"}</span>
    </button>
  );
}
