import "./luma-spin.css";

// LumaSpin — Wallie's loading spinner: a ring of light with an
// orbiting spark and a softly pulsing core.
//   import { Component } from "@/components/ui/luma-spin";
export function Component({ size = 44, label = "Loading" }) {
  return (
    <span
      className="luma-spin"
      style={{ width: size, height: size }}
      role="status"
      aria-label={label}
    >
      <span className="luma-spin-ring" />
      <span className="luma-spin-orbit">
        <span className="luma-spin-dot" />
      </span>
      <span className="luma-spin-core" />
    </span>
  );
}

export default Component;
