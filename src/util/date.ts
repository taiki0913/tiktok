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

/** UTC の時刻と、指定タイムゾーンでの同じ瞬間の「時計の表示」との差（ミリ秒） */
function tzOffsetMs(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return asUtc - at.getTime();
}

/** 指定タイムゾーンでの「YYYY-MM-DD の HH:MM」が、実際にはいつの瞬間かを返す */
export function zonedTimeToUtc(ymd: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess - tzOffsetMs(new Date(first), timeZone));
}

/** ISO の時刻を、指定タイムゾーンで「10/16(木) 19:00」形式にする */
export function formatJpDateTime(iso: string, timeZone: string): string {
  const at = new Date(iso);
  const hm = new Intl.DateTimeFormat("ja-JP", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  return `${formatJpDate(dateInTz(at, timeZone))} ${hm}`;
}
