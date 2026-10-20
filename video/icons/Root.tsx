import React from "react";
import { Composition } from "remotion";
import { MangaStoryIcon, PsychologyIcon } from "./flatIcons";
import { iconCompositionId } from "./ids";
import { CosmosIcon, FutureIcon, HistoryIcon, ICON_SIZE, UrbanLegendIcon } from "./polygonIcons";

/** アカウントID → プロフィール画像 */
export const ICONS: Record<string, React.FC> = {
  history: HistoryIcon,
  urban_legend: UrbanLegendIcon,
  cosmos: CosmosIcon,
  manga_story: MangaStoryIcon,
  psychology: PsychologyIcon,
  future: FutureIcon,
};

export const Root: React.FC = () => (
  <>
    {Object.entries(ICONS).map(([id, Icon]) => (
      <Composition key={id} id={iconCompositionId(id)} component={Icon} durationInFrames={1} fps={30} width={ICON_SIZE} height={ICON_SIZE} />
    ))}
  </>
);
