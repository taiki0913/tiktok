import React from "react";
import { Composition } from "remotion";
import { HEIGHT, WIDTH } from "./deepsea/camera";
import { DeepSea } from "./deepsea/DeepSea";
import { DURATION_IN_FRAMES, FPS } from "./deepsea/timeline";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="DeepSeaPrototype"
    component={DeepSea}
    durationInFrames={DURATION_IN_FRAMES}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
