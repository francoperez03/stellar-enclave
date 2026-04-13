import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #D4A017 0%, #B8890F 100%)",
          borderRadius: 6,
          color: "white",
          fontFamily: "serif",
          fontSize: 18,
          fontWeight: 700,
        }}
      >
        E
      </div>
    ),
    { ...size }
  );
}
