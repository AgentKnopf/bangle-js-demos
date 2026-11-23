#!/usr/bin/env python3
"""Train, evaluate and convert the tfgest wrist-gesture model.

  python3 train.py --data sample-data --out ../model

1. Load all gest.* recordings (JSON lines; bad or cut-off lines are skipped).
2. Split by recording session (a gap of > 10 min between recordings starts a
   new session), never by sample: train / validation / test sessions.
3. Augment the training set: time shifts (+/-2 samples), amplitude (+/-10 %), noise,
   and small rotations (+/-20 degrees: the watch sits differently on each wrist).
4. Train a tiny CNN with Keras; print per-class precision/recall and confusion matrices.
5. Convert to TensorFlow Lite: int8 weights and activations (representative
   dataset), float32 input/output; also a float model for comparison.
6. Check the op list against the ops built into Espruino's TensorFlow Lite Micro,
   the size budget (<= 20 KB) and the test accuracy (>= 85 %); exit 1 if any fails.
7. Write tfgest-model.js: upload it to the watch (Web IDE) to store .tfmodel,
   gestmodel.json and tfgest.tw.json (5 test windows with the PC's answers).
"""
import argparse, base64, glob, json, os, sys

import numpy as np

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
import tensorflow as tf  # noqa: E402

# Ops registered by Espruino's TFLM build (libs/tensorflow/tensorflow.cc,
# MicroMutableOpResolver: no TENSORFLOW_ALL_OPS on the Bangle.js 2 build).
SUPPORTED_OPS = {"DEPTHWISE_CONV_2D", "CONV_2D", "AVERAGE_POOL_2D", "MAX_POOL_2D",
                 "FULLY_CONNECTED", "SOFTMAX", "QUANTIZE", "DEQUANTIZE", "RESHAPE"}
SCALE = 0.01          # int8 recording value -> g
MAX_BYTES = 20 * 1024
MIN_ACC = 0.85
SESSION_GAP_MS = 10 * 60 * 1000
DEFAULT_ORDER = ["none", "flick-left", "flick-right", "twist", "raise", "shake"]


def load(data_dir):
    recs, bad = [], 0
    for path in sorted(glob.glob(os.path.join(data_dir, "gest.*"))):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    r = json.loads(line)
                    if r.get("v") != 1 or len(r["xyz"]) != r["n"] * 3:
                        raise ValueError("bad shape")
                    recs.append(r)
                except (ValueError, KeyError):
                    bad += 1
    if not recs:
        sys.exit(f"no recordings in {data_dir}")
    ns, hzs = {r["n"] for r in recs}, {r["hz"] for r in recs}
    if len(ns) != 1 or len(hzs) != 1:
        sys.exit(f"recordings disagree on n {ns} or hz {hzs}; record again at one rate")
    return recs, bad, ns.pop(), hzs.pop()


def sessions(recs):
    recs = sorted(recs, key=lambda r: r["t"])
    s, last = 0, None
    for r in recs:
        if last is not None and r["t"] - last > SESSION_GAP_MS:
            s += 1
        r["session"] = r.get("session", s)
        last = r["t"]
    return recs, s + 1


def to_xy(recs, labels, n):
    x = np.array([np.clip(np.array(r["xyz"], np.float32) * SCALE, -1.27, 1.27).reshape(n, 1, 3) for r in recs])
    y = np.array([labels.index(r["label"]) for r in recs])
    return x, y


def small_rotation(rng, max_deg):
    ax = rng.normal(size=3); ax /= np.linalg.norm(ax)
    t = np.radians(rng.uniform(-max_deg, max_deg))
    k = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
    return (np.eye(3) + np.sin(t) * k + (1 - np.cos(t)) * k @ k).astype(np.float32)


def augment(x, y, copies, rng):
    xs, ys = [x], [y]
    for _ in range(copies):
        a = x.copy()
        for i in range(len(a)):
            sh = int(rng.integers(-2, 3))
            if sh:
                a[i] = np.roll(a[i], sh, axis=0)
                if sh > 0: a[i, :sh] = a[i, sh]
                else: a[i, sh:] = a[i, sh - 1]
            a[i] = a[i] @ small_rotation(rng, 20).T   # the watch sits differently on each wrist
            a[i] *= rng.uniform(0.9, 1.1)
            a[i] += rng.normal(0, 0.02, a[i].shape)
        xs.append(np.clip(a, -1.27, 1.27)); ys.append(y)
    return np.concatenate(xs), np.concatenate(ys)


def build(n, classes):
    # Conv2D with (k,1) kernels instead of Conv1D: Conv1D converts to EXPAND_DIMS
    # + CONV_2D, and EXPAND_DIMS (like MEAN from GlobalAveragePooling) is not in
    # Espruino's op list.  AveragePooling over the whole length replaces GAP.
    inp = tf.keras.Input((n, 1, 3), batch_size=1, name="accel")
    h = tf.keras.layers.Conv2D(8, (3, 1), activation="relu")(inp)
    h = tf.keras.layers.MaxPooling2D((2, 1))(h)
    h = tf.keras.layers.Conv2D(16, (3, 1), activation="relu")(h)
    h = tf.keras.layers.AveragePooling2D((h.shape[1], 1))(h)
    h = tf.keras.layers.Reshape((16,))(h)
    out = tf.keras.layers.Dense(classes, activation="softmax")(h)
    return tf.keras.Model(inp, out)


def confusion(y, p, labels):
    k = len(labels)
    m = np.zeros((k, k), int)
    for a, b in zip(y, p):
        m[a, b] += 1
    return m


def report(name, y, p, labels):
    m = confusion(y, p, labels)
    acc = np.trace(m) / max(1, m.sum())
    w = max(len(l) for l in labels) + 2
    print(f"\n{name}: accuracy {acc * 100:.1f} % ({np.trace(m)}/{m.sum()})")
    print("confusion matrix (rows = true, columns = predicted)")
    print(" " * w + "".join(f"{i:>5}" for i in range(len(labels))))
    for i, l in enumerate(labels):
        print(f"{i} {l:<{w - 2}}" + "".join(f"{v:>5}" for v in m[i]))
    print(f"{'class':<{w}} precision  recall")
    for i, l in enumerate(labels):
        pr = m[i, i] / max(1, m[:, i].sum()); rc = m[i, i] / max(1, m[i].sum())
        print(f"{l:<{w}} {pr * 100:8.1f} % {rc * 100:6.1f} %")
    return acc, m


def tflite_predict(model_bytes, x):
    # no default delegates: XNNPACK would replace the ops we want to list
    it = tf.lite.Interpreter(model_content=model_bytes,
                             experimental_op_resolver_type=tf.lite.experimental.OpResolverType.BUILTIN_WITHOUT_DEFAULT_DELEGATES)
    it.allocate_tensors()
    i, o = it.get_input_details()[0], it.get_output_details()[0]
    out = []
    for s in x:
        it.set_tensor(i["index"], s[None].astype(i["dtype"]))
        it.invoke()
        out.append(it.get_tensor(o["index"])[0].copy())
    return np.array(out), it


def ops_of(it):
    return sorted({d["op_name"] for d in it._get_ops_details()})


def main():
    ap = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument("--data", default=os.path.join(here, "sample-data"))
    ap.add_argument("--out", default=os.path.join(here, "..", "model"))
    ap.add_argument("--epochs", type=int, default=80)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--thresh", type=float, default=0.7)
    ap.add_argument("--arena", type=int, default=8000)
    ap.add_argument("--fixture", default=os.path.join(here, "..", "tests", "fixtures", "tfgest-model.js"),
                    help="copy of tfgest-model.js for the emulator tests ('' to skip)")
    a = ap.parse_args()
    rng = np.random.default_rng(a.seed)
    tf.keras.utils.set_random_seed(a.seed)

    recs, bad, n, hz = load(a.data)
    found = sorted({r["label"] for r in recs})
    labels = [l for l in DEFAULT_ORDER if l in found] + [l for l in found if l not in DEFAULT_ORDER]
    recs, ns = sessions(recs)
    print(f"{len(recs)} recordings ({bad} bad lines skipped), {len(labels)} labels, n={n}, hz={hz}, {ns} sessions")
    if ns < 3:
        sys.exit("need at least 3 recording sessions for a train/validation/test split")
    test_s, val_s = ns - 1, ns - 2          # last session = test, the one before = validation
    part = {"train": [r for r in recs if r["session"] < val_s],
            "val": [r for r in recs if r["session"] == val_s],
            "test": [r for r in recs if r["session"] == test_s]}
    for k, v in part.items():
        print(f"  {k}: {len(v)} recordings, sessions {sorted({r['session'] for r in v})}")
    xtr, ytr = to_xy(part["train"], labels, n)
    xva, yva = to_xy(part["val"], labels, n)
    xte, yte = to_xy(part["test"], labels, n)
    xtr, ytr = augment(xtr, ytr, 8, rng)

    model = build(n, len(labels))
    # train with a free batch size, then copy the weights into the batch-1 model for conversion
    train_model = build_free(n, len(labels))
    train_model.compile(optimizer=tf.keras.optimizers.Adam(0.005), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    hist = train_model.fit(xtr, ytr, validation_data=(xva, yva), epochs=a.epochs, batch_size=32, verbose=0,
                           callbacks=[tf.keras.callbacks.EarlyStopping(patience=20, restore_best_weights=True, monitor="val_loss")])
    h = hist.history
    print(f"trained {len(h['loss'])} epochs: train accuracy {h['accuracy'][-1] * 100:.1f} %, validation accuracy {max(h['val_accuracy']) * 100:.1f} % (best)")
    model.set_weights(train_model.get_weights())
    print(f"model: {model.count_params()} parameters")

    pk = np.argmax(train_model.predict(xte, verbose=0), 1)
    acc_k, _ = report("Keras, test sessions", yte, pk, labels)

    # ---- convert ----
    conv = tf.lite.TFLiteConverter.from_keras_model(model)
    float_bytes = conv.convert()
    conv = tf.lite.TFLiteConverter.from_keras_model(model)
    conv.optimizations = [tf.lite.Optimize.DEFAULT]
    rep = xtr[rng.permutation(len(xtr))[:300]]
    conv.representative_dataset = lambda: ([s[None]] for s in rep)
    conv.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    int8_bytes = conv.convert()

    pf, it_f = tflite_predict(float_bytes, xte)
    pq, it_q = tflite_predict(int8_bytes, xte)
    acc_f, _ = report("TFLite float, test sessions", yte, pf.argmax(1), labels)
    acc_q, cm = report("TFLite int8, test sessions", yte, pq.argmax(1), labels)
    agree = np.mean(pf.argmax(1) == pq.argmax(1))
    print(f"\nint8 vs float top-class agreement: {agree * 100:.1f} %")

    ok = True
    for name, b, it in (("float", float_bytes, it_f), ("int8", int8_bytes, it_q)):
        ops = ops_of(it)
        bad_ops = [o for o in ops if o not in SUPPORTED_OPS]
        print(f"{name} model: {len(b)} bytes, ops {ops}" + (f"  UNSUPPORTED: {bad_ops}" if bad_ops else "  (all supported)"))
        if bad_ops or len(b) > MAX_BYTES:
            ok = False
    inp = it_q.get_input_details()[0]; out = it_q.get_output_details()[0]
    print(f"int8 model input {inp['shape'].tolist()} {inp['dtype'].__name__}, output {out['shape'].tolist()} {out['dtype'].__name__}")
    if acc_q < MIN_ACC:
        print(f"FAIL: int8 test accuracy {acc_q * 100:.1f} % < {MIN_ACC * 100:.0f} %"); ok = False

    # ---- export ----
    os.makedirs(a.out, exist_ok=True)
    meta = {"v": 1, "labels": labels, "n": n, "hz": hz, "scale": SCALE, "quant": "int8",
            "io": "float32", "thresh": a.thresh, "arena": a.arena, "bytes": len(int8_bytes)}
    # 5 test windows (one per non-"none" class where possible) with the PC's answers, for the watch check
    picks = []
    for c in range(len(labels)):
        idx = np.where(yte == c)[0]
        if len(idx) and len(picks) < 5 and labels[c] != "none":
            picks.append(int(idx[0]))
    tw = {"v": 1, "windows": [{"label": labels[yte[i]],
                               "xyz": [int(round(v / SCALE)) for v in xte[i].reshape(-1)],
                               "pcFloat": labels[int(pf[i].argmax())], "pcInt8": labels[int(pq[i].argmax())],
                               "pInt8": [round(float(v), 3) for v in pq[i]]} for i in picks]}
    with open(os.path.join(a.out, "model-int8.tflite"), "wb") as f: f.write(int8_bytes)
    with open(os.path.join(a.out, "model-float.tflite"), "wb") as f: f.write(float_bytes)
    with open(os.path.join(a.out, "gestmodel.json"), "w") as f: json.dump(meta, f)
    for name, b, extra in (("tfgest-model.js", int8_bytes, {}), ("tfgest-model-float.js", float_bytes, {"quant": "float", "bytes": len(float_bytes)})):
        m = dict(meta, **extra)
        js = ("// Upload with the Web IDE (\"Send to Espruino\" with this file): stores the model for tfgest.\n"
              "// Generated by apps/tfgest/pc/train.py\n"
              f"require(\"Storage\").write(\".tfmodel\", atob(\"{base64.b64encode(b).decode()}\"));\n"
              f"require(\"Storage\").writeJSON(\"gestmodel.json\", {json.dumps(m, separators=(',', ':'))});\n"
              f"require(\"Storage\").writeJSON(\"tfgest.tw.json\", {json.dumps(tw, separators=(',', ':'))});\n"
              "print(\"tfgest model stored\");\n")
        with open(os.path.join(a.out, name), "w") as f: f.write(js)
        if name == "tfgest-model.js" and a.fixture:
            os.makedirs(os.path.dirname(a.fixture), exist_ok=True)
            with open(a.fixture, "w") as f: f.write(js)
    print(f"\nwrote {a.out}/model-int8.tflite, model-float.tflite, gestmodel.json, tfgest-model.js, tfgest-model-float.js")
    print("RESULT " + json.dumps({"keras": round(acc_k, 3), "float": round(acc_f, 3), "int8": round(acc_q, 3),
                                  "bytes_int8": len(int8_bytes), "bytes_float": len(float_bytes), "ok": ok}))
    sys.exit(0 if ok else 1)


def build_free(n, classes):
    inp = tf.keras.Input((n, 1, 3), name="accel")
    h = tf.keras.layers.Conv2D(8, (3, 1), activation="relu")(inp)
    h = tf.keras.layers.MaxPooling2D((2, 1))(h)
    h = tf.keras.layers.Conv2D(16, (3, 1), activation="relu")(h)
    h = tf.keras.layers.AveragePooling2D((h.shape[1], 1))(h)
    h = tf.keras.layers.Reshape((16,))(h)
    out = tf.keras.layers.Dense(classes, activation="softmax")(h)
    return tf.keras.Model(inp, out)


if __name__ == "__main__":
    main()
