import { AbsoluteFill } from "remotion";

interface Props {
  headline: string;
  source: string;
}

// M1 stub composition. Full audio + b-roll + caption sync lands in M3.
export const NewsReel: React.FC<Props> = ({ headline, source }) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0a",
        color: "white",
        fontFamily: "system-ui, sans-serif",
        padding: 64,
        justifyContent: "center",
      }}
    >
      <div style={{ fontSize: 28, color: "#999", marginBottom: 16 }}>{source}</div>
      <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.1 }}>{headline}</div>
    </AbsoluteFill>
  );
};
