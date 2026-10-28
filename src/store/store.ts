// 企画・承認状況をJSONファイルで保存する。
//   data/days/YYYY-MM-DD.json … その日の6アカウント分の企画と承認状況
//   data/references.json      … Slack に貼られた参考動画
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AccountDayState, DayState, Lesson, ReferenceVideo } from "../domain.js";
import { Mutex } from "../util/concurrency.js";

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, path);
}

/** アカウントごとに覚えておく学びの数（多すぎると指示がぼやけるので、新しいものだけ残す） */
const MAX_LESSONS = 12;

export class Store {
  private readonly mutex = new Mutex();
  private readonly daysDir: string;
  private readonly referencesPath: string;
  private readonly lessonsPath: string;

  constructor(dataDir: string) {
    this.daysDir = join(dataDir, "days");
    this.referencesPath = join(dataDir, "references.json");
    this.lessonsPath = join(dataDir, "lessons.json");
  }

  private dayPath(date: string): string {
    return join(this.daysDir, `${date}.json`);
  }

  async getDay(date: string): Promise<DayState | undefined> {
    return readJson<DayState>(this.dayPath(date));
  }

  /** その日のデータを読み、fn で書き換えて保存する（同時更新しても壊れないよう直列化） */
  updateDay(date: string, fn: (day: DayState) => void): Promise<DayState> {
    return this.mutex.run(async () => {
      await mkdir(this.daysDir, { recursive: true });
      const day = (await this.getDay(date)) ?? { date, accounts: {} };
      fn(day);
      await writeJsonAtomic(this.dayPath(date), day);
      return day;
    });
  }

  async updateAccount(
    date: string,
    accountId: string,
    fn: (state: AccountDayState) => void,
  ): Promise<AccountDayState> {
    const day = await this.updateDay(date, (d) => {
      const state = (d.accounts[accountId] ??= {
        accountId,
        status: "planning",
        revisions: [],
        updatedAt: new Date().toISOString(),
      });
      fn(state);
      state.updatedAt = new Date().toISOString();
    });
    return day.accounts[accountId]!;
  }

  /** date より前の直近 n 日分（新しい順） */
  async recentDays(date: string, n: number): Promise<DayState[]> {
    let files: string[];
    try {
      files = await readdir(this.daysDir);
    } catch {
      return [];
    }
    const dates = files
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.slice(0, 10))
      .filter((d) => d < date)
      .sort()
      .reverse()
      .slice(0, n);
    const days = await Promise.all(dates.map((d) => this.getDay(d)));
    return days.filter((d): d is DayState => d !== undefined);
  }

  /** レビューで得た学び（アカウントごと、新しい順に MAX_LESSONS 件まで） */
  async getLessons(accountId: string): Promise<Lesson[]> {
    return (await readJson<Record<string, Lesson[]>>(this.lessonsPath))?.[accountId] ?? [];
  }

  addLessons(accountId: string, lessons: Lesson[]): Promise<void> {
    return this.mutex.run(async () => {
      const all = (await readJson<Record<string, Lesson[]>>(this.lessonsPath)) ?? {};
      const known = new Set((all[accountId] ?? []).map((l) => l.text));
      const fresh = lessons.filter((l) => !known.has(l.text));
      all[accountId] = [...fresh, ...(all[accountId] ?? [])].slice(0, MAX_LESSONS);
      await mkdir(join(this.lessonsPath, ".."), { recursive: true });
      await writeJsonAtomic(this.lessonsPath, all);
    });
  }

  async listReferences(): Promise<ReferenceVideo[]> {
    return (await readJson<ReferenceVideo[]>(this.referencesPath)) ?? [];
  }

  addReference(ref: ReferenceVideo): Promise<void> {
    return this.mutex.run(async () => {
      const refs = await this.listReferences();
      if (refs.some((r) => r.accountId === ref.accountId && r.url === ref.url)) return;
      refs.push(ref);
      await mkdir(join(this.referencesPath, ".."), { recursive: true });
      await writeJsonAtomic(this.referencesPath, refs);
    });
  }
}
