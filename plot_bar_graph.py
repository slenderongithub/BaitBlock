import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# ---- Config ----
INPUT_CSV = "results.csv"
OUTPUT_FIG = "fig1_bar_graph.png"
CLASS_ORDER = ["Clickbait", "Sensationalist", "Borderline", "Legitimate"]
SCORE_COL = "composite_sensationalism_score"
VERDICT_COL = "verdict"


def main():
    # 1) Load
    df = pd.read_csv(INPUT_CSV)

    # 2) Validate columns
    required = {VERDICT_COL, SCORE_COL}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns in {INPUT_CSV}: {missing}")

    # 3) Clean
    df = df.dropna(subset=[VERDICT_COL, SCORE_COL]).copy()
    df[SCORE_COL] = pd.to_numeric(df[SCORE_COL], errors="coerce")
    df = df.dropna(subset=[SCORE_COL])

    # Keep score in [0, 100]
    df[SCORE_COL] = df[SCORE_COL].clip(0, 100)

    # Keep only expected verdict classes
    df = df[df[VERDICT_COL].isin(CLASS_ORDER)]

    # 4) Aggregate mean, std, count
    stats = (
        df.groupby(VERDICT_COL)[SCORE_COL]
        .agg(["mean", "std", "count"])
        .reindex(CLASS_ORDER)
    )

    # Handle missing classes / n=1 std
    stats["mean"] = stats["mean"].fillna(0.0)
    stats["std"] = stats["std"].fillna(0.0)
    stats["count"] = stats["count"].fillna(0).astype(int)

    means = stats["mean"].to_numpy()
    stds = stats["std"].to_numpy()
    counts = stats["count"].to_numpy()
    x = np.arange(len(CLASS_ORDER))

    # 5) Plot
    fig, ax = plt.subplots(figsize=(9, 5.5), dpi=160)

    ax.bar(
        x,
        means,
        yerr=stds,
        capsize=7,
        color=["#e74c3c", "#f39c12", "#3498db", "#2ecc71"],
        edgecolor="black",
        linewidth=1.2,
    )

    # n labels
    for xi, yi, n in zip(x, means, counts):
        ax.text(
            xi,
            yi + 2,
            f"n={n}",
            ha="center",
            va="bottom",
            fontsize=10,
            fontweight="bold",
        )

    ax.set_xticks(x)
    ax.set_xticklabels(CLASS_ORDER)
    ax.set_xlabel("Verdict class", fontsize=11, fontweight="bold")
    ax.set_ylabel("Risk Score (0-100)", fontsize=11, fontweight="bold")
    ax.set_ylim(0, 100)
    ax.set_title("Mean ± std composite risk score per verdict class", fontsize=12, fontweight="bold")
    ax.grid(axis="y", linestyle="--", alpha=0.35)

    plt.tight_layout()
    plt.savefig(OUTPUT_FIG, bbox_inches="tight")
    plt.show()

    print(f"Saved: {OUTPUT_FIG}")


if __name__ == "__main__":
    main()
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# ---- Config ----
INPUT_CSV = "results.csv"
OUTPUT_FIG = "fig1_bar_graph.png"
CLASS_ORDER = ["Clickbait", "Sensationalist", "Borderline", "Legitimate"]
SCORE_COL = "composite_sensationalism_score"
VERDICT_COL = "verdict"


def main():
    # 1) Load
    df = pd.read_csv(INPUT_CSV)

    # 2) Validate columns
    required = {VERDICT_COL, SCORE_COL}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns in {INPUT_CSV}: {missing}")

    # 3) Clean
    df = df.dropna(subset=[VERDICT_COL, SCORE_COL]).copy()
    df[SCORE_COL] = pd.to_numeric(df[SCORE_COL], errors="coerce")
    df = df.dropna(subset=[SCORE_COL])

    # Keep score in [0, 100]
    df[SCORE_COL] = df[SCORE_COL].clip(0, 100)

    # Keep only expected verdict classes
    df = df[df[VERDICT_COL].isin(CLASS_ORDER)]

    # 4) Aggregate mean, std, count
    stats = (
        df.groupby(VERDICT_COL)[SCORE_COL]
        .agg(["mean", "std", "count"])
        .reindex(CLASS_ORDER)
    )

    # Handle missing classes / n=1 std
    stats["mean"] = stats["mean"].fillna(0.0)
    stats["std"] = stats["std"].fillna(0.0)
    stats["count"] = stats["count"].fillna(0).astype(int)

    means = stats["mean"].to_numpy()
    stds = stats["std"].to_numpy()
    counts = stats["count"].to_numpy()
    x = np.arange(len(CLASS_ORDER))

    # 5) Plot
    fig, ax = plt.subplots(figsize=(9, 5.5), dpi=160)

    bars = ax.bar(
        x,
        means,
        yerr=stds,
        capsize=7,
        color=["#e74c3c", "#f39c12", "#3498db", "#2ecc71"],
        edgecolor="black",
        linewidth=1.2,
    )

    # n labels
    for xi, yi, n in zip(x, means, counts):
        ax.text(
            xi,
            yi + 2,
            f"n={n}",
            ha="center",
            va="bottom",
            fontsize=10,
            fontweight="bold",
        )

    ax.set_xticks(x)
    ax.set_xticklabels(CLASS_ORDER)
    ax.set_xlabel("Verdict class", fontsize=11, fontweight="bold")
    ax.set_ylabel("Risk Score (0–100)", fontsize=11, fontweight="bold")
    ax.set_ylim(0, 100)
    ax.set_title("Mean ± std composite risk score per verdict class", fontsize=12, fontweight="bold")
    ax.grid(axis="y", linestyle="--", alpha=0.35)

    plt.tight_layout()
    plt.savefig(OUTPUT_FIG, bbox_inches="tight")
    plt.show()

    print(f"Saved: {OUTPUT_FIG}")


if __name__ == "__main__":
    main()