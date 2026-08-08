#!/usr/bin/env python3
"""
根据 MANIFEST.md 生成 citadels-online 所需音效。
所有音效均为程序化生成（原创 / public domain），使用 Python + ffmpeg 输出 MP3/OGG。
"""
import os
import subprocess
import struct
import wave
import math
import random

SR = 44100
OUT_DIR = r"H:\LearningAgain\citadels-online\client-react\public\sfx"
TMP_DIR = r"c:\Users\zerg5\.trae-cn\work\6a778221409f55b5d0e76b85\sfx_wav"
FFMPEG = r"C:\Users\zerg5\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\vm\tools\app\ffmpeg\ffmpeg.exe"

random.seed(42)
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(TMP_DIR, exist_ok=True)


def to_int16(samples):
    """将浮点样本 (-1..1) 转换为 16-bit PCM bytes"""
    clipped = [max(-1.0, min(1.0, s)) for s in samples]
    return b"".join(struct.pack("<h", int(s * 32767)) for s in clipped)


def save_wav(path, samples):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(to_int16(samples))


def run_ffmpeg(src, dst):
    subprocess.run([FFMPEG, "-y", "-i", src, "-q:a", "4", dst], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def silence(sec):
    return [0.0] * int(SR * sec)


def white_noise(sec, amp=1.0):
    return [amp * random.uniform(-1, 1) for _ in range(int(SR * sec))]


def pink_noise(sec, amp=1.0):
    # 简单粉红噪声：对白噪声做 1/f 衰减
    n = int(SR * sec)
    out = []
    b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0
    for _ in range(n):
        white = random.uniform(-1, 1)
        b0 = 0.99886 * b0 + white * 0.0555179
        b1 = 0.99332 * b1 + white * 0.0750759
        b2 = 0.96900 * b2 + white * 0.1538520
        b3 = 0.86650 * b3 + white * 0.3104856
        b4 = 0.55000 * b4 + white * 0.5329522
        b5 = -0.7616 * b5 - white * 0.0168980
        pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
        b6 = white * 0.115926
        out.append(pink * amp)
    return out


def env_adsr(samples, attack=0.0, decay=0.0, sustain=1.0, release=0.0):
    n = len(samples)
    a_samp = int(SR * attack)
    d_samp = int(SR * decay)
    r_samp = int(SR * release)
    out = []
    for i, s in enumerate(samples):
        if i < a_samp and a_samp > 0:
            e = i / a_samp
        elif i < a_samp + d_samp and d_samp > 0:
            e = 1.0 - (1.0 - sustain) * (i - a_samp) / d_samp
        elif i >= n - r_samp and r_samp > 0:
            e = sustain * (n - i) / r_samp
        else:
            e = sustain
        out.append(s * e)
    return out


def exp_decay(samples, tau=0.1):
    out = []
    for i, s in enumerate(samples):
        out.append(s * math.exp(-i / (SR * tau)))
    return out


def lowpass(samples, cutoff=1000):
    # 一阶低通
    rc = 1.0 / (2 * math.pi * cutoff)
    dt = 1.0 / SR
    alpha = dt / (rc + dt)
    out = []
    y = samples[0] if samples else 0.0
    for s in samples:
        y += alpha * (s - y)
        out.append(y)
    return out


def highpass(samples, cutoff=500):
    rc = 1.0 / (2 * math.pi * cutoff)
    dt = 1.0 / SR
    alpha = rc / (rc + dt)
    out = []
    y = samples[0] if samples else 0.0
    x_prev = samples[0] if samples else 0.0
    for s in samples:
        y = alpha * (y + s - x_prev)
        out.append(y)
        x_prev = s
    return out


def bandpass(samples, low, high):
    return lowpass(highpass(samples, low), high)


def sine(freq, sec, amp=1.0):
    return [amp * math.sin(2 * math.pi * freq * t / SR) for t in range(int(SR * sec))]


def square(freq, sec, amp=1.0):
    return [amp * (1 if math.sin(2 * math.pi * freq * t / SR) > 0 else -1) for t in range(int(SR * sec))]


def triangle(freq, sec, amp=1.0):
    out = []
    for t in range(int(SR * sec)):
        phase = (freq * t / SR) % 1.0
        if phase < 0.25:
            v = phase / 0.25
        elif phase < 0.75:
            v = 1.0 - (phase - 0.25) / 0.25
        else:
            v = -1.0 + (phase - 0.75) / 0.25
        out.append(amp * v)
    return out


def sawtooth(freq, sec, amp=1.0):
    return [amp * (2 * ((freq * t / SR) % 1.0) - 1) for t in range(int(SR * sec))]


def sweep(start, end, sec, amp=1.0, waveform="sine"):
    n = int(SR * sec)
    out = []
    for t in range(n):
        f = start + (end - start) * (t / n)
        phase = (f * t / SR) % 1.0
        if waveform == "sine":
            v = math.sin(2 * math.pi * phase)
        elif waveform == "triangle":
            if phase < 0.25:
                v = phase / 0.25
            elif phase < 0.75:
                v = 1.0 - (phase - 0.25) / 0.25
            else:
                v = -1.0 + (phase - 0.75) / 0.25
        else:
            v = math.sin(2 * math.pi * phase)
        out.append(amp * v)
    return out


def mix(*tracks):
    if not tracks:
        return []
    n = max(len(t) for t in tracks)
    out = [0.0] * n
    for t in tracks:
        for i, s in enumerate(t):
            out[i] += s
    return out


def pad(samples, total_sec):
    n = int(SR * total_sec)
    if len(samples) < n:
        samples = samples + [0.0] * (n - len(samples))
    return samples[:n]


def normalize(samples, target=0.9):
    peak = max(abs(s) for s in samples) if samples else 0
    if peak == 0:
        return samples
    return [s * target / peak for s in samples]


# ============================================================
# 具体音效生成
# ============================================================

def gen_hover():
    # 轻摩擦：短促低频噪声脉冲 0.05s
    samples = pink_noise(0.05, amp=0.6)
    samples = lowpass(samples, 1200)
    samples = exp_decay(samples, tau=0.02)
    return samples


def gen_click():
    # 清脆点按：短方波 click 0.03s
    samples = square(1200, 0.03, amp=0.5)
    samples = mix(samples, white_noise(0.01, amp=0.2))
    samples = env_adsr(samples, attack=0.0, decay=0.005, sustain=0.0, release=0.02)
    samples = highpass(samples, 800)
    return samples


def gen_panel_open():
    # 面板展开：上行 sweep 0.12s
    samples = sweep(400, 1200, 0.12, amp=0.5, waveform="triangle")
    samples = env_adsr(samples, attack=0.01, decay=0.08, sustain=0.0, release=0.03)
    return samples


def gen_error():
    # 错误提示：下行双音 buzz 0.2s
    s1 = sweep(400, 200, 0.2, amp=0.4, waveform="sawtooth")
    s2 = sweep(300, 150, 0.2, amp=0.3, waveform="square")
    samples = mix(s1, s2)
    samples = env_adsr(samples, attack=0.0, decay=0.15, sustain=0.0, release=0.05)
    return samples


def gen_countdown_tick():
    # 短脆 tick 0.04s
    samples = sine(1800, 0.04, amp=0.6)
    samples = mix(samples, white_noise(0.01, amp=0.15))
    samples = env_adsr(samples, attack=0.0, decay=0.01, sustain=0.0, release=0.03)
    samples = highpass(samples, 1000)
    return samples


def gen_earn(variant=1, distant=False):
    # 拿金币；按 amount 选变体
    if distant:
        # muffled 低通 distant
        samples = sine(800, 0.08, amp=0.15)
        samples = env_adsr(samples, attack=0.0, decay=0.06, sustain=0.0, release=0.02)
        samples = lowpass(samples, 600)
        return samples
    # variant 1: 单枚
    # variant 2: 滚动 2-3 枚
    # variant 3: 级联 4+
    coins = []
    if variant == 1:
        times = [0.0]
    elif variant == 2:
        times = [0.0, 0.06, 0.12]
    else:
        times = [0.0, 0.04, 0.08, 0.12, 0.16]
    for t in times:
        freq = 1000 + random.uniform(-100, 100)
        coin = sine(freq, 0.06, amp=0.5)
        coin = env_adsr(coin, attack=0.0, decay=0.02, sustain=0.0, release=0.04)
        coin = highpass(coin, 800)
        # mix at offset t
        start = int(SR * t)
        while len(coins) < start + len(coin):
            coins.append(0.0)
        for i, s in enumerate(coin):
            coins[start + i] += s
    return coins


def gen_draw(distant=False):
    # 摸牌滑入：短促纸张摩擦噪声 0.08s
    samples = pink_noise(0.08, amp=0.7)
    samples = bandpass(samples, 800, 4000)
    samples = env_adsr(samples, attack=0.01, decay=0.05, sustain=0.0, release=0.02)
    if distant:
        samples = lowpass(samples, 800)
        samples = [s * 0.3 for s in samples]
    return samples


def gen_build_cheap(distant=False):
    # 廉价建造落地：轻叩木质 0.1s
    samples = pink_noise(0.03, amp=0.8)
    samples = bandpass(samples, 600, 2500)
    samples = env_adsr(samples, attack=0.0, decay=0.02, sustain=0.0, release=0.08)
    samples = mix(samples, sine(300, 0.08, amp=0.2))
    samples = exp_decay(samples, tau=0.04)
    if distant:
        samples = lowpass(samples, 700)
        samples = [s * 0.3 for s in samples]
    return samples


def gen_role_reveal():
    # 庄严双音 chord 0.25s
    c1 = sine(523.25, 0.25, amp=0.35)  # C5
    c2 = sine(659.25, 0.25, amp=0.35)  # E5
    samples = mix(c1, c2)
    samples = env_adsr(samples, attack=0.03, decay=0.15, sustain=0.0, release=0.07)
    return samples


def gen_stamp_kill():
    # 重砸低频 thud 0.15s
    samples = pink_noise(0.15, amp=1.0)
    samples = lowpass(samples, 250)
    samples = env_adsr(samples, attack=0.0, decay=0.05, sustain=0.3, release=0.1)
    return samples


def gen_stamp_rob():
    # 金属叮 + thud 0.15s
    ding = sine(1200, 0.08, amp=0.4)
    ding = env_adsr(ding, attack=0.0, decay=0.03, sustain=0.0, release=0.05)
    ding = highpass(ding, 1000)
    thud = lowpass(pink_noise(0.1, amp=0.8), 300)
    thud = env_adsr(thud, attack=0.0, decay=0.05, sustain=0.0, release=0.05)
    samples = mix(pad(ding, 0.15), thud)
    return samples


def gen_kill_victim():
    # 受害=心悸警报（低频脉冲 2 次）
    p1 = lowpass(sine(180, 0.25, amp=1.0), 300)
    p1 = env_adsr(p1, attack=0.02, decay=0.1, sustain=0.0, release=0.1)
    p2 = lowpass(sine(150, 0.25, amp=1.0), 250)
    p2 = env_adsr(p2, attack=0.02, decay=0.1, sustain=0.0, release=0.1)
    samples = [0.0] * int(SR * 0.55)
    for i, s in enumerate(p1):
        samples[i] += s
    offset = int(SR * 0.3)
    for i, s in enumerate(p2):
        if offset + i < len(samples):
            samples[offset + i] += s
    return samples


def gen_kill_neutral():
    # 他人=中性基础
    samples = sine(300, 0.2, amp=0.4)
    samples = env_adsr(samples, attack=0.02, decay=0.12, sustain=0.0, release=0.06)
    return samples


def gen_rob_base():
    # 基础扒窃
    samples = pink_noise(0.15, amp=0.6)
    samples = bandpass(samples, 800, 3000)
    samples = env_adsr(samples, attack=0.01, decay=0.1, sustain=0.0, release=0.04)
    return samples


def gen_rob_perp():
    # 施害成功收尾
    samples = sine(900, 0.12, amp=0.5)
    samples = mix(samples, sine(1200, 0.1, amp=0.3))
    samples = env_adsr(samples, attack=0.0, decay=0.08, sustain=0.0, release=0.04)
    return samples


def gen_rob_victim():
    # 受害金库被掏收尾
    samples = sine(500, 0.15, amp=0.5)
    samples = env_adsr(samples, attack=0.0, decay=0.1, sustain=0.0, release=0.05)
    samples = mix(samples, lowpass(pink_noise(0.1, amp=0.4), 600))
    return samples


def gen_build_expensive():
    # 高价/紫区建造：重落地 + 回响 0.3s
    impact = lowpass(pink_noise(0.1, amp=1.0), 400)
    impact = env_adsr(impact, attack=0.0, decay=0.05, sustain=0.0, release=0.05)
    # 回响
    reverb = [0.0] * int(SR * 0.3)
    for i, s in enumerate(impact):
        reverb[i] += s
    # 简单延迟回响
    delay_samps = int(SR * 0.06)
    for r in range(1, 5):
        for i, s in enumerate(impact):
            idx = i + delay_samps * r
            if idx < len(reverb):
                reverb[idx] += s * (0.4 ** r) * 0.5
    reverb = lowpass(reverb, 1200)
    return reverb


def gen_destroy_victim():
    # 受害=受击
    samples = lowpass(pink_noise(0.25, amp=1.0), 500)
    samples = env_adsr(samples, attack=0.0, decay=0.1, sustain=0.2, release=0.15)
    return samples


def gen_destroy_perp():
    # 军阀=成功
    samples = mix(sine(400, 0.2, amp=0.5), lowpass(pink_noise(0.15, amp=0.7), 400))
    samples = env_adsr(samples, attack=0.0, decay=0.12, sustain=0.0, release=0.08)
    return samples


def gen_destroy_neutral():
    # 他人=中性
    samples = lowpass(pink_noise(0.15, amp=0.7), 600)
    samples = env_adsr(samples, attack=0.0, decay=0.08, sustain=0.0, release=0.07)
    return samples


def gen_turn_handoff():
    # 回合交接：短过渡音 0.1s
    samples = sweep(600, 900, 0.1, amp=0.4, waveform="sine")
    samples = env_adsr(samples, attack=0.01, decay=0.06, sustain=0.0, release=0.03)
    return samples


def gen_win():
    # 胜利 stinger：上行 major chord 0.5s
    c1 = sine(523.25, 0.5, amp=0.3)   # C5
    c2 = sine(659.25, 0.5, amp=0.3)   # E5
    c3 = sine(783.99, 0.5, amp=0.3)   # G5
    c4 = sine(1046.50, 0.5, amp=0.25) # C6
    samples = mix(c1, c2, c3, c4)
    samples = env_adsr(samples, attack=0.05, decay=0.35, sustain=0.0, release=0.1)
    return samples


def gen_lose():
    # 失败 stinger：下行 minor chord 0.5s
    c1 = sweep(523.25, 440.00, 0.5, amp=0.3)   # C5 -> A4
    c2 = sweep(622.25, 523.25, 0.5, amp=0.3)   # Eb5 -> C5
    c3 = sweep(783.99, 659.25, 0.5, amp=0.3)   # G5 -> E5
    samples = mix(c1, c2, c3)
    samples = env_adsr(samples, attack=0.05, decay=0.35, sustain=0.0, release=0.1)
    return samples


# ============================================================
# 主流程
# ============================================================
SFX = [
    ("hover", gen_hover(), True),
    ("click", gen_click(), True),
    ("panel_open", gen_panel_open(), True),
    ("error", gen_error(), True),
    ("countdown_tick", gen_countdown_tick(), True),
    ("earn_1", gen_earn(1), False),
    ("earn_2", gen_earn(2), False),
    ("earn_3", gen_earn(3), False),
    ("earn_distant", gen_earn(distant=True), False),
    ("draw", gen_draw(), False),
    ("draw_distant", gen_draw(distant=True), False),
    ("build_cheap", gen_build_cheap(), False),
    ("build_cheap_distant", gen_build_cheap(distant=True), False),
    ("role_reveal", gen_role_reveal(), True),
    ("stamp_kill", gen_stamp_kill(), True),
    ("stamp_rob", gen_stamp_rob(), True),
    ("kill_victim", gen_kill_victim(), False),
    ("kill_neutral", gen_kill_neutral(), False),
    ("rob_base", gen_rob_base(), False),
    ("rob_perp", gen_rob_perp(), False),
    ("rob_victim", gen_rob_victim(), False),
    ("build_expensive", gen_build_expensive(), True),
    ("destroy_victim", gen_destroy_victim(), False),
    ("destroy_perp", gen_destroy_perp(), False),
    ("destroy_neutral", gen_destroy_neutral(), False),
    ("turn_handoff", gen_turn_handoff(), True),
    ("win", gen_win(), True),
    ("lose", gen_lose(), True),
]


def main():
    print("Starting SFX generation...")
    generated = []
    for name, samples, has_ogg in SFX:
        samples = normalize(samples, target=0.9)
        wav_path = os.path.join(TMP_DIR, f"{name}.wav")
        save_wav(wav_path, samples)
        mp3_path = os.path.join(OUT_DIR, f"{name}.mp3")
        run_ffmpeg(wav_path, mp3_path)
        if has_ogg:
            ogg_path = os.path.join(OUT_DIR, f"{name}.ogg")
            run_ffmpeg(wav_path, ogg_path)
        generated.append(name + (".mp3 + .ogg" if has_ogg else ".mp3"))
        print(f"generated: {name}")
    print("\nAll generated:")
    for g in generated:
        print(g)


if __name__ == "__main__":
    main()
