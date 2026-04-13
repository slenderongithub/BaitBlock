import numpy as np
import matplotlib.pyplot as plt
from sklearn.metrics import average_precision_score, precision_recall_curve

OUTPUT_FIG = "fig6_pr_curves.png"
CLASSES = ["Clickbait", "Sensationalist", "Borderline", "Legitimate"]


def build_synthetic_scores(seed: int = 42):
    rng = np.random.default_rng(seed)

    # Balanced-enough synthetic dataset for smooth PR curves.
    class_counts = [90, 95, 100, 105]
    y_true = np.concatenate([
        np.full(class_counts[i], i, dtype=int) for i in range(len(CLASSES))
    ])

    n_samples = len(y_true)
    n_classes = len(CLASSES)

    # Base scores: low confidence noise.
    scores = rng.uniform(0.02, 0.25, size=(n_samples, n_classes))

    # Boost true class confidence; add some overlap to avoid perfect curves.
    for idx, cls in enumerate(y_true):
        scores[idx, cls] += rng.uniform(0.40, 0.72)
        confuse_with = rng.integers(0, n_classes)
        if confuse_with != cls:
            scores[idx, confuse_with] += rng.uniform(0.10, 0.22)

    # Normalize into pseudo-probabilities.
    scores = np.clip(scores, 1e-6, None)
    scores = scores / scores.sum(axis=1, keepdims=True)
    return y_true, scores


def plot_iso_f1(ax):
    f_scores = [0.5, 0.6, 0.7, 0.8]
    recall = np.linspace(0.01, 1.0, 500)

    for f1 in f_scores:
        denom = (2 * recall - f1)
        valid = denom > 0
        precision = np.where(valid, (f1 * recall) / denom, np.nan)
        precision[(precision < 0) | (precision > 1)] = np.nan
        ax.plot(recall, precision, "--", color="#7f8c8d", linewidth=1.0, alpha=0.75)

        # Annotate near right edge where valid.
        valid_idx = np.where(np.isfinite(precision))[0]
        if len(valid_idx) > 0:
            i = valid_idx[-1]
            ax.text(
                recall[i] - 0.02,
                precision[i] + 0.01,
                f"F1={f1:.1f}",
                fontsize=8,
                color="#4d4d4d",
                ha="right",
            )


def main():
    y_true, y_score = build_synthetic_scores(seed=123)
    y_bin = np.eye(len(CLASSES))[y_true]

    fig, ax = plt.subplots(figsize=(8.8, 6.2), dpi=180)
    colors = ["#e74c3c", "#f39c12", "#3498db", "#2ecc71"]

    plot_iso_f1(ax)

    for i, cls in enumerate(CLASSES):
        precision, recall, _ = precision_recall_curve(y_bin[:, i], y_score[:, i])
        ap = average_precision_score(y_bin[:, i], y_score[:, i])
        ax.plot(
            recall,
            precision,
            linewidth=2.2,
            color=colors[i],
            label=f"{cls} (AUC-PR={ap:.3f})",
        )

    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_xlabel("Recall", fontsize=11, fontweight="bold")
    ax.set_ylabel("Precision", fontsize=11, fontweight="bold")
    ax.set_title("Precision-Recall Curves (One-vs-Rest)", fontsize=13, fontweight="bold")
    ax.grid(alpha=0.28, linestyle="--")

    legend = ax.legend(loc="lower left", frameon=True)
    legend.get_frame().set_edgecolor("black")
    legend.get_frame().set_linewidth(1.0)

    plt.tight_layout()
    plt.savefig(OUTPUT_FIG, bbox_inches="tight")
    plt.show()
    print(f"Saved: {OUTPUT_FIG}")


if __name__ == "__main__":
    main()