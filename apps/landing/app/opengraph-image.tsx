import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Enclave — Your agents. Your rules. Out of sight.";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "80px",
          background:
            "radial-gradient(circle at 12% 8%, rgba(212,160,23,0.20) 0%, transparent 42%), radial-gradient(circle at 92% 96%, rgba(212,160,23,0.14) 0%, transparent 46%), #F5F0E8",
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            fontSize: 24,
            color: "#6B7280",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 24,
          }}
        >
          Enclave
        </div>
        <div
          style={{
            fontSize: 88,
            color: "#1A1A1A",
            lineHeight: 1.05,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>Your agents.</span>
          <span>Your rules.</span>
          <span>Out of sight.</span>
        </div>
        <div style={{ marginTop: 48, fontSize: 22, color: "#6B7280" }}>
          Shielded organizations for autonomous agents on Stellar.
        </div>
      </div>
    ),
    { ...size }
  );
}
