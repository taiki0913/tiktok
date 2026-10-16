/** 指定タイムゾーンでの日付を YYYY-MM-DD で返す */
export function dateInTz(d: Date, timeZone: string): string {
  // en-CA ロケールは YYYY-MM-DD 形式で出力される
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** YYYY-MM-DD を「10/16(木)」形式にする */
export function formatJpDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const dow = "日月火水木金土"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}(${dow})`;
}

/** YYYY-MM-DD の n 日前を返す */
export function daysBefore(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d - n));
  return t.toISOString().slice(0, 10);
}

/** 指定タイムゾーンでの現在の時（0〜23） */
export function hourInTz(d: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(d),
  );
}
