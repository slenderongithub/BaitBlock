import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

INPUT_CSV = "violin_data.csv"
OUTPUT_FIG = "fig4_violin_plot.png"


def main():
    df = pd.read_csv(INPUT_CSV)

    required = {"cosine_similarity_score", "composite_sensationalism_score"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns in {INPUT_CSV}: {missing}")

    df["cosine_similarity_score"] = pd.to_numeric(df["cosine_similarity_score"], errors="coerce")
    df["composite_sensationalism_score"] = pd.to_numeric(
        df["composite_sensationalism_score"], errors="coerce"
    )
    df = df.dropna(subset=["cosine_similarity_score", "composite_sensationalism_score"]).copy()
    df["cosine_similarity_score"] = df["cosine_similarity_score"].clip(0, 1)
    df["composite_sensationalism_score"] = df["composite_sensationalism_score"].clip(0, 100)

    # Quartile grouping on similarity score
    df["Similarity Quartile"] = pd.qcut(
        df["cosine_similarity_score"],
        q=4,
        labels=["Q1", "Q2", "Q3", "Q4"],
        duplicates="drop",
    )

    order = ["Q1", "Q2", "Q3", "Q4"]
    groups = [
        df.loc[df["Similarity Quartile"] == q, "composite_sensationalism_score"].to_numpy()
        for q in order
    ]

    fig, ax = plt.subplots(figsize=(9, 5.8), dpi=170)

    vp = ax.violinplot(
        groups,
        positions=np.arange(1, 5),
        showmeans=False,
        showmedians=False,
        showextrema=False,
    )

    palette = ["#5dade2", "#48c9b0", "#f5b041", "#ec7063"]
    for body, color in zip(vp["bodies"], palette):
        body.set_facecolor(color)
        body.set_edgecolor("black")
        body.set_linewidth(1.2)
        body.set_alpha(0.75)

    # Overlay strip points with alpha=0.3
    rng = np.random.default_rng(42)
    for i, q in enumerate(order, start=1):
        vals = df.loc[df["Similarity Quartile"] == q, "composite_sensationalism_score"].to_numpy()
        jitter_x = rng.normal(i, 0.06, size=len(vals))
        ax.scatter(jitter_x, vals, s=24, alpha=0.3, color="black", zorder=3)

        if len(vals) > 0:
            med = float(np.median(vals))
            ax.hlines(med, i - 0.18, i + 0.18, color="black", linewidth=2.2, zorder=4)
            ax.text(i, med + 2.0, f"median={med:.1f}", ha="center", va="bottom", fontsize=9, fontweight="bold")

    ax.set_xticks(np.arange(1, 5))
    ax.set_xticklabels(order)
    ax.set_xlabel("Similarity Quartile", fontsize=11, fontweight="bold")
    ax.set_ylabel("Risk Score (0-100)", fontsize=11, fontweight="bold")
    ax.set_ylim(0, 100)
    ax.set_title("Violin Plot of Risk by Cosine Similarity Quartile", fontsize=13, fontweight="bold")
    ax.grid(axis="y", linestyle="--", alpha=0.35)

    plt.tight_layout()
    plt.savefig(OUTPUT_FIG, bbox_inches="tight")
    plt.show()
    print(f"Saved: {OUTPUT_FIG}")


if __name__ == "__main__":
    main()