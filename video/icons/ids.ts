/** アカウントID → 書き出し用の名前。Remotion の ID に「_」は使えないので「-」に置き換える */
export const iconCompositionId = (accountId: string): string => `icon-${accountId.replace(/_/g, "-")}`;
