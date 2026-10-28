// レビューで得た学びを、企画・台本・映像のエージェントに渡す文章にする。
import type { Lesson } from "../domain.js";

export const LESSON_LABELS: Record<Lesson["target"], string> = { plan: "企画", script: "台本", visual: "映像", post: "投稿" };

/** 学びのうち、targets に関わるものを並べる（なければ空文字） */
export function lessonsText(lessons: Lesson[], targets: Lesson["target"][]): string {
  const picked = lessons.filter((l) => targets.includes(l.target));
  if (picked.length === 0) return "";
  return `# これまでのレビューからの学び（必ず守る）\n${picked.map((l) => `- [${LESSON_LABELS[l.target]}] ${l.text}`).join("\n")}`;
}
