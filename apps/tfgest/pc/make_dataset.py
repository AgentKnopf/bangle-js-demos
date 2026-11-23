#!/usr/bin/env python3
"""Generate a synthetic sample dataset of wrist gestures in the tfgest recording format.

One file per label, gest.<label>, one JSON line per recording:
  {"v":1,"label":"twist","hz":12.5,"n":19,"t":<ms>,"xyz":[x0,y0,z0,...]}
xyz = accel in g x 100, rounded and clamped to -128..127.

Recordings come in sessions (a person sitting down and recording a batch);
recordings in one session are seconds apart, sessions are hours apart, so the
training script can split by session.  Deterministic for a given --seed.

  python3 make_dataset.py --out sample-data
"""
import argparse, json, math, os
import numpy as np

LABELS = ["none", "flick-left", "flick-right", "twist", "raise", "shake"]
N, HZ = 19, 12.5


def rot(v, axis, deg):
    k = np.asarray(axis, float); k /= np.linalg.norm(k)
    a = math.radians(deg); v = np.asarray(v, float)
    return v * math.cos(a) + np.cross(k, v) * math.sin(a) + k * np.dot(k, v) * (1 - math.cos(a))


def bump(i, centre, width):
    """Smooth pulse 0..1..0 around centre (samples)."""
    x = (i - centre) / width
    return math.exp(-x * x)


class Person:
    def __init__(self, r):
        self.tilt = r.uniform(-20, 20, 2)          # how the watch sits on the wrist
        self.amp = r.uniform(0.8, 1.2)             # how hard they move
        self.speed = r.uniform(0.8, 1.2)           # how fast
        self.r = r

    def gravity(self):
        g = np.array([0.0, 0.0, -1.0])
        g = rot(g, [1, 0, 0], self.tilt[0] + self.r.normal(0, 4))
        return rot(g, [0, 1, 0], self.tilt[1] + self.r.normal(0, 4))


def gesture(label, p, r):
    """Return an (N, 3) array in g."""
    g0 = p.gravity()
    amp = p.amp * r.uniform(0.85, 1.15)
    sp = p.speed * r.uniform(0.85, 1.15)
    on = r.uniform(2.5, 4.5)                       # motion onset (sample index)
    out = np.zeros((N, 3))
    for i in range(N):
        g = g0.copy(); a = np.zeros(3)
        if label in ("flick-left", "flick-right"):
            s = -1 if label == "flick-left" else 1
            c = on + 1.5 / sp
            a[0] = s * 0.9 * amp * (bump(i, c, 1.1 / sp) - 0.8 * bump(i, c + 2.2 / sp, 1.3 / sp))
            a[1] = 0.15 * amp * bump(i, c, 1.5 / sp)
        elif label == "twist":
            ang = 85 * amp * bump(i, on + 4 / sp, 2.8 / sp)
            g = rot(g0, [1, 0, 0], ang)
        elif label == "raise":
            prog = 1 / (1 + math.exp(-(i - on - 3 / sp) * 1.3 * sp))
            g = rot(g0, [0, 1, 0], -65 * amp * prog)
            a[2] = -0.5 * amp * bump(i, on + 2 / sp, 1.5 / sp)
        elif label == "shake":
            f = 3.5 * sp / HZ
            env = 1 if i >= on else 0
            a[1] = env * 1.1 * amp * math.sin(2 * math.pi * f * (i - on))
            a[0] = env * 0.3 * amp * math.sin(2 * math.pi * f * (i - on) + 1)
        else:  # none: still, walking, or small random arm movement
            kind = getattr(p, "_none_kind", 0)
            if kind == 1:
                a += (g0 * -0.25 * math.sin(2 * math.pi * 1.9 * i / HZ + p._ph))
            elif kind == 2:
                a += r.normal(0, 0.08, 3)
        out[i] = g + a + r.normal(0, 0.03, 3)
    return out


def encode(label, xyz, t):
    q = np.clip(np.round(xyz * 100), -128, 127).astype(int).reshape(-1).tolist()
    return json.dumps({"v": 1, "label": label, "hz": HZ, "n": N, "t": int(t), "xyz": q}, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "sample-data"))
    ap.add_argument("--sessions", type=int, default=6)
    ap.add_argument("--per-label", type=int, default=12)
    ap.add_argument("--seed", type=int, default=8)
    a = ap.parse_args()
    r = np.random.default_rng(a.seed)
    os.makedirs(a.out, exist_ok=True)
    lines = {l: [] for l in LABELS}
    t = 1767258000000  # 2026-01-01 09:00 UTC
    for s in range(a.sessions):
        p = Person(r)
        for k in range(a.per_label):
            for label in LABELS:
                p._none_kind = int(r.integers(0, 3)); p._ph = r.uniform(0, 6.3)
                lines[label].append(encode(label, gesture(label, p, r), t))
                t += int(r.uniform(3000, 8000))
        t += 3 * 3600 * 1000  # next session hours later
    for label, ls in lines.items():
        with open(os.path.join(a.out, "gest." + label), "w") as f:
            f.write("\n".join(ls) + "\n")
        print(f"gest.{label}: {len(ls)} recordings")


if __name__ == "__main__":
    main()
