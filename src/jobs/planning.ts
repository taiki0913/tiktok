// 毎朝の企画づくり：競合調査 → 企画 → 保存 → 通知 を6アカウント分まわす。
import { isPlanningDay, type Account } from "../config/accounts.js";
import type { AccountDayState, DayState } from "../domain.js";
import { runPlanner } from "../planning/plannerAgent.js";
import { runResearch } from "../research/researchAgent.js";
import { lessonsText } from "../review/lessons.js";
import { loadEpisodes, pendingEpisode, seriesBrief } from "../series/series.js";
import type { Store } from "../store/store.js";
import { mapWithLimit } from "../util/concurrency.js";
import { daysBefore } from "../util/date.js";

/** 企画の状態が変わったことを伝える先（Slack、またはお試し実行時のコンソール） */
export interface PlanNotifier {
  /** 当日の一覧メッセージと、アカウントごとの「作成中」メッセージを用意する */
  prepareDay(day: DayState, accounts: Account[]): Promise<void>;
  accountUpdated(date: string, account: Account, state: AccountDayState): Promise<void>;
  summaryUpdated(day: DayState, accounts: Account[]): Promise<void>;
}

const HISTORY_DAYS = 14;
const REFERENCE_DAYS = 14;
const CONCURRENCY = 2;

export interface PlanningDeps {
  store: Store;
  notifier: PlanNotifier;
  accounts: Account[];
}

/** 1アカウント分の企画を作る。revision があれば、前回の調査結果を使って作り直す */
export async function planAccount(
  deps: PlanningDeps,
  account: Account,
  date: string,
  revision?: string,
): Promise<AccountDayState> {
  const { store, notifier } = deps;

  // 続きもの：前回の話のコメントの結果をまだ聞いていなければ、先にオーナーに聞く（企画は結果を受け取ってから作る）
  let brief: string | undefined;
  if (account.series) {
    const episodes = await loadEpisodes(store, account, date);
    const pending = pendingEpisode(episodes);
    if (pending && revision === undefined) {
      const asked = await store.updateAccount(date, account.id, (s) => {
        s.status = "awaiting_choice";
        s.seriesAsk = { episode: pending.number, date: pending.date, choices: pending.choices };
        delete s.error;
      });
      await notifier.accountUpdated(date, account, asked);
      return asked;
    }
    brief = seriesBrief(account, episodes);
  }

  const before = await store.updateAccount(date, account.id, (s) => {
    s.status = "planning";
    delete s.error;
    if (revision !== undefined) s.revisions.push({ instruction: revision, at: new Date().toISOString() });
  });
  await notifier.accountUpdated(date, account, before);

  try {
    let research = before.research;
    if (!research || revision === undefined) {
      const since = daysBefore(date, REFERENCE_DAYS);
      const refs = (await store.listReferences()).filter(
        (r) => r.accountId === account.id && r.addedAt.slice(0, 10) >= since,
      );
      research = await runResearch(account, date, refs);
      await store.updateAccount(date, account.id, (s) => {
        s.research = research;
      });
    }

    const proposals = await runPlanner({
      account,
      date,
      research,
      history: await store.recentDays(date, HISTORY_DAYS),
      seriesBrief: brief,
      lessons: lessonsText(await store.getLessons(account.id), ["plan"]),
      revision:
        revision !== undefined && before.proposals
          ? { instruction: revision, previous: before.proposals }
          : undefined,
    });

    const after = await store.updateAccount(date, account.id, (s) => {
      s.status = "awaiting_approval";
      s.proposals = proposals;
      delete s.selectedIndex;
    });
    await notifier.accountUpdated(date, account, after);
    return after;
  } catch (e) {
    console.error(`[planning:${account.id}]`, e);
    const failed = await store.updateAccount(date, account.id, (s) => {
      s.status = "error";
      s.error = (e as Error).message;
    });
    await notifier.accountUpdated(date, account, failed);
    return failed;
  }
}

/**
 * 毎朝の一括実行。
 * すでに企画ができているアカウント（承認待ち・決定済み・スキップ）は、force でない限り作り直さない。
 */
export async function runMorningPlanning(
  deps: PlanningDeps,
  date: string,
  opts: { onlyAccountIds?: string[]; force?: boolean } = {},
): Promise<DayState> {
  const existing = await deps.store.getDay(date);
  const targets = deps.accounts.filter((a) => {
    // アカウントを指定したとき（お試し実行など）は、作る日でなくても作る
    if (opts.onlyAccountIds) {
      if (!opts.onlyAccountIds.includes(a.id)) return false;
    } else if (!isPlanningDay(a, date) && existing?.accounts[a.id] === undefined) {
      return false;
    }
    const status = existing?.accounts[a.id]?.status;
    return opts.force || status === undefined || status === "planning" || status === "error";
  });

  const day = await deps.store.updateDay(date, (d) => {
    for (const a of targets) {
      d.accounts[a.id] ??= {
        accountId: a.id,
        status: "planning",
        revisions: [],
        updatedAt: new Date().toISOString(),
      };
    }
  });
  await deps.notifier.prepareDay(day, deps.accounts);

  await mapWithLimit(targets, CONCURRENCY, (a) => planAccount(deps, a, date));

  const done = (await deps.store.getDay(date))!;
  await deps.notifier.summaryUpdated(done, deps.accounts);
  return done;
}
