"""アカウントごとのBGMをプログラムで作曲して書き出す。

自作の曲なので、利用規約の確認やクレジット表記は不要で、著作権の申し立ての心配もない。
作り直すとき（開発者向け）:
    python -m venv .venv && .venv/bin/pip install numpy scipy
    .venv/bin/python scripts/bgm/generate_bgm.py public/bgm               … すべての曲
    .venv/bin/python scripts/bgm/generate_bgm.py public/bgm --moods-only  … 続きもの用の雰囲気ごとの曲だけ
ffmpeg があれば mp3 に、無ければ wav で書き出す。
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt

SR = 44100


# ---------------------------------------------------------------- 基本の道具

def midi_hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def t_axis(n: int) -> np.ndarray:
    return np.arange(n) / SR


def lowpass(x: np.ndarray, hz: float, order: int = 2) -> np.ndarray:
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x)


def highpass(x: np.ndarray, hz: float, order: int = 2) -> np.ndarray:
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x)


def bandpass(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return sosfilt(butter(2, [lo, hi], "band", fs=SR, output="sos"), x)


def envelope(n: int, attack: float, release: float) -> np.ndarray:
    """立ち上がり attack 秒・終わり release 秒の台形エンベロープ"""
    env = np.ones(n)
    a = min(n, int(attack * SR))
    r = min(n - a, int(release * SR))
    if a:
        env[:a] = np.linspace(0, 1, a) ** 2
    if r:
        env[n - r:] *= np.linspace(1, 0, r) ** 2
    return env


def comb(x: np.ndarray, delay: int, g: float) -> np.ndarray:
    """フィードバック・コム（y[n] = x[n] + g*y[n-delay]）。delay ごとにまとめて計算する"""
    y = x.copy()
    for start in range(delay, len(y), delay):
        end = min(start + delay, len(y))
        y[start:end] += g * y[start - delay:end - delay]
    return y


def allpass(x: np.ndarray, delay: int, g: float) -> np.ndarray:
    y = np.zeros_like(x)
    y[:delay] = -g * x[:delay]
    for start in range(delay, len(x), delay):
        end = min(start + delay, len(x))
        y[start:end] = -g * x[start:end] + x[start - delay:end - delay] + g * y[start - delay:end - delay]
    return y


def reverb(x: np.ndarray, room: float = 0.84, spread: int = 0) -> np.ndarray:
    """Schroeder 型の残響（コム8本＋オールパス4本）。残響だけを返す"""
    combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
    out = sum(comb(x, d + spread, room) for d in combs) / len(combs)
    for d in [556, 441, 341, 225]:
        out = allpass(out, d + spread, 0.5)
    return lowpass(out, 5000)


def place(buf: np.ndarray, sound: np.ndarray, at_sec: float, gain: float = 1.0, pan: float = 0.0) -> None:
    """ステレオのバッファ buf（2×n）の at_sec 秒目に sound を重ねる。pan は -1（左）〜1（右）"""
    i = int(at_sec * SR)
    if i >= buf.shape[1]:
        return
    s = sound[: buf.shape[1] - i] * gain
    buf[0, i:i + len(s)] += s * np.sqrt((1 - pan) / 2)
    buf[1, i:i + len(s)] += s * np.sqrt((1 + pan) / 2)


# ---------------------------------------------------------------- 音色

def pluck(freq: float, dur: float, rng: np.random.Generator, decay: float = 0.996, softness: float = 4000) -> np.ndarray:
    """弦をはじいた音（Karplus-Strong）。琴・ピチカートに使う"""
    n = int(dur * SR)
    period = max(2, int(round(SR / freq)))
    y = np.zeros(n + period + 1)
    burst = lowpass(rng.uniform(-1, 1, period), softness)
    y[1:period + 1] = burst
    c = decay * 0.5
    for start in range(period + 1, len(y), period):
        end = min(start + period, len(y))
        y[start:end] = c * (y[start - period:end - period] + y[start - period - 1:end - period - 1])
    out = y[1:n + 1]
    return out * envelope(n, 0.002, 0.05)


def fm_bell(freq: float, dur: float, ratio: float = 3.5, index: float = 3.0, decay: float = 1.6) -> np.ndarray:
    """鐘・鉄琴のような音（FM合成）"""
    n = int(dur * SR)
    t = t_axis(n)
    idx = index * np.exp(-t / (decay * 0.4))
    sig = np.sin(2 * np.pi * freq * t + idx * np.sin(2 * np.pi * freq * ratio * t))
    return sig * np.exp(-t / decay) * envelope(n, 0.003, 0.2)


def epiano(freq: float, dur: float) -> np.ndarray:
    """やわらかいエレピ（FM＋トレモロ）"""
    n = int(dur * SR)
    t = t_axis(n)
    idx = 1.2 * np.exp(-t / 0.3)
    sig = np.sin(2 * np.pi * freq * t + idx * np.sin(2 * np.pi * freq * t))
    sig += 0.25 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t / 0.4)
    trem = 1 - 0.15 * (0.5 + 0.5 * np.sin(2 * np.pi * 4.5 * t))
    return sig * trem * np.exp(-t / 1.8) * envelope(n, 0.005, 0.3)


def marimba(freq: float, dur: float = 0.8) -> np.ndarray:
    n = int(dur * SR)
    t = t_axis(n)
    sig = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 4 * t) * np.exp(-t / 0.05)
    return sig * np.exp(-t / 0.35) * envelope(n, 0.002, 0.05)


def pad(freqs: list[float], dur: float, cutoff: float, attack: float, release: float, rng: np.random.Generator) -> np.ndarray:
    """ゆっくり膨らむ和音（少しずらしたのこぎり波を重ねて柔らかくする）"""
    n = int(dur * SR)
    t = t_axis(n)
    sig = np.zeros(n)
    for f in freqs:
        for cents in (-7, 0, 6):
            ph = rng.uniform(0, 1)
            fr = f * 2 ** (cents / 1200)
            sig += 2 * ((t * fr + ph) % 1) - 1
    sig = lowpass(sig / (len(freqs) * 3), cutoff, order=4)
    return sig * envelope(n, attack, release)


def sine_tone(freq: float, dur: float, attack: float, release: float) -> np.ndarray:
    n = int(dur * SR)
    return np.sin(2 * np.pi * freq * t_axis(n)) * envelope(n, attack, release)


def kick(dur: float = 0.4) -> np.ndarray:
    n = int(dur * SR)
    t = t_axis(n)
    f = 45 + 70 * np.exp(-t / 0.04)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12)


def hat(rng: np.random.Generator, dur: float = 0.06) -> np.ndarray:
    n = int(dur * SR)
    return highpass(rng.uniform(-1, 1, n), 7000) * np.exp(-t_axis(n) / 0.015)


def wind(n: int, rng: np.random.Generator, lo: float, hi: float, rate: float) -> np.ndarray:
    noise = bandpass(rng.uniform(-1, 1, n), lo, hi)
    t = t_axis(n)
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * rate * t + rng.uniform(0, 6)) * np.sin(2 * np.pi * rate * 0.37 * t)
    return noise * swell


def chord(root: int, kind: str) -> list[int]:
    shapes = {
        "maj7": [0, 4, 7, 11],
        "m7": [0, 3, 7, 10],
        "m9": [0, 3, 7, 10, 14],
        "add9": [0, 4, 7, 14],
        "6": [0, 4, 7, 9],
        "sus4": [0, 5, 7],
        "maj": [0, 4, 7],
        "min": [0, 3, 7],
    }
    return [root + i for i in shapes[kind]]


# ---------------------------------------------------------------- 仕上げ

def master(buf: np.ndarray, wet: float, room: float = 0.84, tone: float = 12000) -> np.ndarray:
    out = np.empty_like(buf)
    for ch in range(2):
        dry = highpass(buf[ch], 35)
        out[ch] = dry + wet * reverb(dry, room, spread=ch * 23)
        out[ch] = lowpass(out[ch], tone)
    rms = np.sqrt(np.mean(out ** 2))
    out *= 10 ** (-16 / 20) / max(rms, 1e-9)  # 平均の音量を -16dBFS にそろえる
    out = np.tanh(out * 1.1) / 1.1  # ピークをやわらかく抑える
    out *= 10 ** (-1 / 20) / max(np.max(np.abs(out)), 1e-9) if np.max(np.abs(out)) > 10 ** (-1 / 20) else 1
    n = out.shape[1]
    out *= envelope(n, 1.5, 3.0)
    return out


# ---------------------------------------------------------------- 曲

def history(seed: int, root: int, bpm: float, dur: float) -> np.ndarray:
    """和の音階（都節）の琴と、笙のような持続音"""
    rng = np.random.default_rng(seed)
    buf = np.zeros((2, int(dur * SR)))
    scale = [0, 1, 5, 7, 8]
    notes = [root + 12 * o + s for o in (1, 2) for s in scale] + [root + 36]
    beat = 60 / bpm
    place(buf, pad([midi_hz(root), midi_hz(root + 7), midi_hz(root + 12)], dur, 900, 6, 6, rng), 0, 0.22)
    t = 1.0
    pos = rng.integers(2, len(notes) - 3)
    while t < dur - 4:
        if rng.random() < 0.18:  # 間（ま）
            t += beat * rng.choice([1, 2])
            continue
        pos = int(np.clip(pos + rng.choice([-2, -1, -1, 1, 1, 2]), 0, len(notes) - 1))
        f = midi_hz(notes[pos])
        place(buf, pluck(f, 3.0, rng, 0.997, 3500), t + rng.normal(0, 0.008), rng.uniform(0.45, 0.7), rng.uniform(-0.3, 0.3))
        if rng.random() < 0.15:  # 装飾音
            place(buf, pluck(midi_hz(notes[max(0, pos - 1)]), 2.0, rng, 0.996, 3000), t + beat * 0.25, 0.35, 0.1)
        t += beat * rng.choice([0.5, 1, 1, 1.5, 2])
    for bar in np.arange(0.5, dur - 4, beat * 8):  # 低い琴の音を2小節ごとに
        place(buf, pluck(midi_hz(root + 12), 4.0, rng, 0.998, 2000), bar, 0.5, -0.2)
    return master(buf, wet=0.28)


def cosmos(seed: int, progression: list[tuple[int, str]], dur: float) -> np.ndarray:
    """宇宙・深海：ゆっくり移り変わる和音と、まばらな鐘の音"""
    rng = np.random.default_rng(seed)
    buf = np.zeros((2, int(dur * SR)))
    seg = 8.0
    t = 0.0
    i = 0
    while t < dur:
        r, kind = progression[i % len(progression)]
        freqs = [midi_hz(m) for m in chord(r, kind)]
        place(buf, pad(freqs, seg + 3, 1400, 3, 3, rng), t, 0.32)
        place(buf, sine_tone(midi_hz(r - 12), seg + 3, 3, 3), t, 0.25)
        t += seg
        i += 1
    t = 2.0
    penta = [0, 2, 4, 7, 9]
    base = progression[0][0] + 24
    while t < dur - 3:
        m = base + rng.choice(penta) + 12 * rng.choice([0, 0, 1])
        place(buf, fm_bell(midi_hz(m), 4.0, ratio=3.5, index=2.0, decay=1.8), t, rng.uniform(0.12, 0.22), rng.uniform(-0.6, 0.6))
        t += rng.uniform(1.2, 3.5)
    return master(buf, wet=0.5, room=0.88)


def future(seed: int, progression: list[tuple[int, str]], bpm: float, dur: float) -> np.ndarray:
    """未来・データ：控えめなアルペジオとパッド、小さめのリズム"""
    rng = np.random.default_rng(seed)
    buf = np.zeros((2, int(dur * SR)))
    beat = 60 / bpm
    bar = beat * 4
    t = 0.0
    i = 0
    while t < dur:
        r, kind = progression[i % len(progression)]
        tones = chord(r, kind)
        place(buf, pad([midi_hz(m) for m in tones], bar * 2 + 1, 1800, 0.8, 1.0, rng), t, 0.2)
        place(buf, sine_tone(midi_hz(r - 12), bar * 2, 0.05, 0.3), t, 0.3)
        arp = [tones[k % len(tones)] + 12 * (k // len(tones)) for k in range(8)]
        for step in range(32):  # 16分音符で2小節
            m = arp[[0, 1, 2, 3, 4, 3, 2, 1][step % 8]] + 12
            place(buf, pluck(midi_hz(m), 0.6, rng, 0.99, 6000), t + step * beat / 4, 0.18 + 0.06 * (step % 4 == 0), 0.35 * np.sin(step))
        if t > bar * 2:  # 少し経ってからリズムを入れる
            for b in range(8):
                if b % 2 == 0:
                    place(buf, kick(), t + b * beat, 0.35)
                place(buf, hat(rng), t + b * beat + beat / 2, 0.08, 0.3)
        t += bar * 2
        i += 1
    return master(buf, wet=0.3)


def psychology(seed: int, progression: list[tuple[int, str]], bpm: float, dur: float) -> np.ndarray:
    """やさしいエレピの和音と、ゆったりしたリズム"""
    rng = np.random.default_rng(seed)
    buf = np.zeros((2, int(dur * SR)))
    beat = 60 / bpm
    bar = beat * 4
    t = 0.0
    i = 0
    swing = beat * 0.08
    while t < dur:
        r, kind = progression[i % len(progression)]
        tones = chord(r, kind)
        for k, m in enumerate(tones):  # 少しずつずらして弾く
            place(buf, epiano(midi_hz(m), bar * 1.2), t + k * 0.012, 0.22, -0.2 + 0.13 * k)
        place(buf, epiano(midi_hz(tones[1] + 12), beat * 1.5), t + beat * 2.5, 0.12, 0.3)
        place(buf, sine_tone(midi_hz(r - 12), bar * 0.9, 0.02, 0.4), t, 0.35)
        for b in range(4):
            if b in (0, 2):
                place(buf, kick(0.3), t + b * beat, 0.25)
            place(buf, hat(rng, 0.08), t + b * beat + beat / 2 + swing, 0.06, 0.25)
        t += bar
        i += 1
    crackle = np.zeros(buf.shape[1])
    pops = rng.integers(0, len(crackle), int(dur * 6))
    crackle[pops] = rng.uniform(-0.5, 0.5, len(pops))
    buf += highpass(crackle, 2000) * 0.25
    return master(buf, wet=0.22, tone=6500)


def urban_legend(seed: int, root: int, dur: float) -> np.ndarray:
    """不穏な低い持続音・風・オルゴールのような高い音"""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    buf = np.zeros((2, n))
    place(buf, pad([midi_hz(root), midi_hz(root + 1), midi_hz(root + 7)], dur, 500, 8, 6, rng), 0, 0.35)
    place(buf, sine_tone(midi_hz(root - 12), dur, 6, 6), 0, 0.3)
    buf[0] += wind(n, rng, 300, 1500, 0.07) * 0.18
    buf[1] += wind(n, rng, 300, 1500, 0.06) * 0.18
    scale = [0, 1, 3, 6, 7, 10]
    t = 3.0
    while t < dur - 4:
        m = root + 36 + rng.choice(scale) + 12 * rng.choice([0, 1])
        detuned = fm_bell(midi_hz(m), 3.0, ratio=4.0, index=1.2, decay=1.2) + 0.5 * fm_bell(midi_hz(m) * 1.004, 3.0, 4.0, 1.0, 1.2)
        place(buf, detuned, t, rng.uniform(0.08, 0.15), rng.uniform(-0.7, 0.7))
        t += rng.uniform(1.0, 4.0)
    for boom in np.arange(10, dur - 5, rng.uniform(11, 15)):
        place(buf, kick(1.5) * 0.8 + lowpass(rng.uniform(-1, 1, int(1.5 * SR)), 200) * np.exp(-t_axis(int(1.5 * SR)) / 0.4), boom, 0.4)
    return master(buf, wet=0.55, room=0.9, tone=7000)


def manga(seed: int, root: int, bpm: float, dur: float) -> np.ndarray:
    """日常の軽いマリンバと、ピチカートのベース"""
    rng = np.random.default_rng(seed)
    buf = np.zeros((2, int(dur * SR)))
    beat = 60 / bpm
    scale = [0, 2, 4, 7, 9]
    prog = [0, 5, 7, 5]  # I - IV - V - IV
    t = 0.0
    i = 0
    pos = 5
    notes = [root + 12 + 12 * o + s for o in (1, 2) for s in scale]
    while t < dur - 2:
        r = root + prog[i % len(prog)]
        for b in range(4):
            place(buf, pluck(midi_hz(r - 12 + (7 if b % 2 else 0)), 0.5, rng, 0.985, 1500), t + b * beat, 0.5, -0.1)
        for s in range(8):
            if rng.random() < 0.72:
                pos = int(np.clip(pos + rng.choice([-2, -1, 1, 1, 2]), 0, len(notes) - 1))
                place(buf, marimba(midi_hz(notes[pos])), t + s * beat / 2 + rng.normal(0, 0.005), rng.uniform(0.25, 0.4), 0.2)
            place(buf, hat(rng, 0.04), t + s * beat / 2, 0.05 if s % 2 else 0.03, 0.4)
        t += beat * 4
        i += 1
    return master(buf, wet=0.2)


# ---------------------------------------------------------------- 続きもの用：場面の雰囲気ごとの曲

def tension(seed: int, root: int, bpm: float, dur: float) -> np.ndarray:
    """緊迫：ぶつかり合う低い持続音、心臓の鼓動のような低音、時計のような刻み"""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    buf = np.zeros((2, n))
    place(buf, pad([midi_hz(root), midi_hz(root + 1), midi_hz(root + 7)], dur, 700, 5, 4, rng), 0, 0.3)
    place(buf, sine_tone(midi_hz(root - 12), dur, 4, 4), 0, 0.32)
    place(buf, sine_tone(midi_hz(root + 30), dur, 10, 4) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.11 * t_axis(n))), 0, 0.05)
    beat = 60 / bpm
    t = 2.0
    while t < dur - 2:
        grow = min(1.0, 0.55 + t / dur)  # 少しずつ強くなる
        place(buf, kick(0.5), t, 0.5 * grow)
        place(buf, kick(0.4), t + beat * 0.32, 0.32 * grow)
        for k in range(4):
            place(buf, hat(rng, 0.03), t + k * beat / 2 + beat / 4, 0.05, 0.5 * (-1) ** k)
        t += beat * 2
    return master(buf, wet=0.35, room=0.86, tone=7000)


def danger(seed: int, root: int, bpm: float, dur: float) -> np.ndarray:
    """危険：速く刻む低音の反復、強い和音、警報のような高い音"""
    rng = np.random.default_rng(seed)
    buf = np.zeros((2, int(dur * SR)))
    beat = 60 / bpm
    bar = beat * 4
    riff = [0, 0, 12, 0, 3, 0, 10, 7]
    prog = [0, 0, -4, -2]
    t = 0.0
    i = 0
    while t < dur - 1:
        r = root + prog[i % len(prog)]
        for s_, step in enumerate(riff):
            place(buf, pluck(midi_hz(r - 12 + step), 0.4, rng, 0.985, 1800), t + s_ * beat / 2, 0.42, -0.15)
        place(buf, pad([midi_hz(m) for m in chord(r, "min")], bar, 1600, 0.02, 0.6, rng), t, 0.22)
        for b in range(4):
            place(buf, kick(0.3), t + b * beat, 0.45)
            place(buf, hat(rng, 0.05), t + b * beat + beat / 2, 0.08, 0.3)
        if i % 2 == 1:
            place(buf, fm_bell(midi_hz(r + 31), 1.2, ratio=1.5, index=4.0, decay=0.6), t + beat * 3, 0.1, 0.5)
        t += bar
        i += 1
    return master(buf, wet=0.2, tone=9000)


def sad(seed: int, progression: list[tuple[int, str]], bpm: float, dur: float) -> np.ndarray:
    """切ない：ゆっくりのエレピの和音と、まばらな旋律"""
    rng = np.random.default_rng(seed)
    buf = np.zeros((2, int(dur * SR)))
    beat = 60 / bpm
    bar = beat * 4
    t = 0.0
    i = 0
    while t < dur - 2:
        r, kind = progression[i % len(progression)]
        tones = chord(r, kind)
        for k, m in enumerate(tones):
            place(buf, epiano(midi_hz(m), bar * 1.4), t + k * 0.05, 0.18, -0.25 + 0.15 * k)
        place(buf, sine_tone(midi_hz(r - 12), bar, 0.3, 1.0), t, 0.25)
        melody = [tones[-1] + 12, tones[1] + 12, tones[2] + 12]
        for k, m in enumerate(melody):
            if rng.random() < 0.7:
                place(buf, fm_bell(midi_hz(m), 3.0, ratio=2.0, index=1.2, decay=2.0), t + beat * (1 + k), 0.12, 0.3)
        t += bar
        i += 1
    return master(buf, wet=0.45, room=0.88, tone=6000)


def hope(seed: int, progression: list[tuple[int, str]], bpm: float, dur: float) -> np.ndarray:
    """希望：明るい和音、上がっていくアルペジオ、少しずつ加わるリズム"""
    rng = np.random.default_rng(seed)
    buf = np.zeros((2, int(dur * SR)))
    beat = 60 / bpm
    bar = beat * 4
    t = 0.0
    i = 0
    while t < dur - 2:
        r, kind = progression[i % len(progression)]
        tones = chord(r, kind)
        place(buf, pad([midi_hz(m) for m in tones], bar + 1, 2200, 0.6, 1.0, rng), t, 0.22)
        place(buf, sine_tone(midi_hz(r - 12), bar, 0.05, 0.4), t, 0.3)
        arp = [tones[k % len(tones)] + 12 * (1 + k // len(tones)) for k in range(8)]
        for step in range(8):
            place(buf, pluck(midi_hz(arp[step]), 1.0, rng, 0.993, 5000), t + step * beat / 2, 0.2, 0.4 * np.sin(step))
        if i >= 2:
            for b in range(4):
                if b % 2 == 0:
                    place(buf, kick(0.35), t + b * beat, 0.28)
                place(buf, hat(rng, 0.06), t + b * beat + beat / 2, 0.06, 0.3)
        t += bar
        i += 1
    return master(buf, wet=0.3, tone=10000)


# 場面の雰囲気（台本エージェントが場面ごとに選ぶ）→ 曲。public/bgm/<アカウント>/moods/<雰囲気>.mp3 に書き出す
MOOD_TRACKS = {
    "cosmos": {
        "calm": lambda: cosmos(71, [(50, "sus4"), (48, "add9"), (45, "m7"), (47, "sus4")], 72),
        "wonder": lambda: cosmos(72, [(48, "maj7"), (52, "m7"), (45, "maj7"), (50, "add9")], 72),
        "tension": lambda: tension(73, 38, 62, 72),
        "danger": lambda: danger(74, 40, 126, 72),
        "sad": lambda: sad(75, [(45, "m7"), (41, "maj7"), (48, "maj7"), (43, "6")], 64, 72),
        "hope": lambda: hope(76, [(48, "maj"), (43, "maj"), (45, "min"), (41, "maj")], 96, 72),
    },
}


TRACKS = {
    "history": [
        ("koto-miyako-d", lambda: history(11, 50, 72, 100)),
        ("koto-miyako-e", lambda: history(12, 52, 64, 100)),
    ],
    "cosmos": [
        ("deep-space-c", lambda: cosmos(21, [(48, "maj7"), (45, "m9"), (41, "maj7"), (43, "6")], 100)),
        ("deep-sea-d", lambda: cosmos(22, [(50, "m9"), (46, "maj7"), (43, "m9"), (45, "sus4")], 100)),
    ],
    "future": [
        ("data-arp-a", lambda: future(31, [(45, "min"), (41, "maj"), (48, "maj"), (43, "maj")], 96, 96)),
        ("data-arp-e", lambda: future(32, [(52, "min"), (48, "maj"), (43, "maj"), (50, "maj")], 100, 96)),
    ],
    "psychology": [
        ("soft-keys-f", lambda: psychology(41, [(53, "maj7"), (52, "m7"), (50, "m7"), (48, "maj7")], 78, 98)),
        ("soft-keys-g", lambda: psychology(42, [(55, "maj7"), (52, "m7"), (57, "m7"), (50, "6")], 74, 98)),
    ],
    "urban_legend": [
        ("night-drone-e", lambda: urban_legend(51, 40, 100)),
        ("night-drone-g", lambda: urban_legend(52, 43, 100)),
    ],
    "manga_story": [
        ("everyday-c", lambda: manga(61, 48, 112, 96)),
        ("everyday-f", lambda: manga(62, 53, 104, 96)),
    ],
}


def write_wav(path: Path, stereo: np.ndarray) -> None:
    data = (np.clip(stereo.T, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def export(folder: Path, name: str, audio: np.ndarray, label: str) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    wav = folder / f"{name}.wav"
    write_wav(wav, audio)
    if shutil.which("ffmpeg"):
        mp3 = folder / f"{name}.mp3"
        # 曲ごとの音量差をなくすため、ラウドネスを -16 LUFS にそろえる
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-af", "loudnorm=I=-16:TP=-2:LRA=11", "-ar", str(SR), "-b:a", "160k", str(mp3)],
            check=True,
        )
        wav.unlink()
        print(f"{label}/{mp3.name}")
    else:
        print(f"{label}/{wav.name}")


def main(out_dir: str, moods_only: bool) -> None:
    if not moods_only:
        for account, tracks in TRACKS.items():
            for name, make in tracks:
                export(Path(out_dir) / account, name, make(), account)
    for account, moods in MOOD_TRACKS.items():
        for mood, make in moods.items():
            export(Path(out_dir) / account / "moods", mood, make(), f"{account}/moods")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(args[0] if args else "public/bgm", "--moods-only" in sys.argv)
