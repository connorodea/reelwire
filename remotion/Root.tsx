import { Composition } from "remotion";
import { NewsReel } from "./compositions/NewsReel";

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="NewsReel"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={NewsReel as any}
        durationInFrames={60 * 30}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          headline: "Sample headline",
          source: "Reelwire",
        }}
      />
    </>
  );
};
