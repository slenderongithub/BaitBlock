import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

INPUT_CSV = "confusion_matrix.csv"
OUTPUT_FIG = "fig3_confusion_matrix.png"
LABELS = ["Clickbait", "Sensationalist", "Borderline", "Legitimate"]


def main():
    df = pd.read_csv(INPUT_CSV)

    required = {"actual", "predicted", "count"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns in {INPUT_CSV}: {missing}")

    df["count"] = pd.to_numeric(df["count"], errors="coerce")
    df = df.dropna(subset=["actual", "predicted", "count"])
    df = df[df["actual"].isin(LABELS) & df["predicted"].isin(LABELS)]

    matrix = np.zeros((len(LABELS), len(LABELS)), dtype=float)
    for _, row in df.iterrows():
        i = LABELS.index(row["actual"])
        j = LABELS.index(row["predicted"])
        matrix[i, j] = float(row["count"])

    row_sums = matrix.sum(axis=1, keepdims=True)
    with np.errstate(divide="ignore", invalid="ignore"):
        pct = np.where(row_sums > 0, (matrix / row_sums) * 100.0, 0.0)

    fig, ax = plt.subplots(figsize=(8.5, 7), dpi=170)
    im = ax.imshow(matrix, cmap="viridis")

    cbar = plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    cbar.set_label("Count", rotation=90)

    ax.set_xticks(np.arange(len(LABELS)))
    ax.set_yticks(np.arange(len(LABELS)))
    ax.set_xticklabels(LABELS, fontsize=10)
    ax.set_yticklabels(LABELS, fontsize=10)
    ax.set_xlabel("Predicted", fontsize=11, fontweight="bold")
    ax.set_ylabel("Actual", fontsize=11, fontweight="bold")
    ax.set_title("Confusion Matrix Heatmap", fontsize=13, fontweight="bold")

    vmax = matrix.max() if matrix.max() > 0 else 1
    for i in range(matrix.shape[0]):
        for j in range(matrix.shape[1]):
            count = int(matrix[i, j])
            percentage = pct[i, j]
            text_color = "white"
            weight = "bold" if i == j else "normal"
            ax.text(
                j,
                i,
                f"{count}\n({percentage:.1f}%)",
                ha="center",
                va="center",
                color=text_color,
                fontsize=9,
                fontweight=weight,
            )

    ax.set_xticks(np.arange(-0.5, len(LABELS), 1), minor=True)
    ax.set_yticks(np.arange(-0.5, len(LABELS), 1), minor=True)
    ax.grid(which="minor", color="black", linestyle="-", linewidth=1)
    ax.tick_params(which="minor", bottom=False, left=False)

    plt.tight_layout()
    plt.savefig(OUTPUT_FIG, bbox_inches="tight")
    plt.show()
    print(f"Saved: {OUTPUT_FIG}")


if __name__ == "__main__":
    main()