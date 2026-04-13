import numpy as np
import matplotlib.pyplot as plt

OUTPUT_FIG = "fig7_threshold_sensitivity.png"
THRESHOLDS = np.arange(50, 86, 5)
CURRENT_THETA = 70


def clamp(arr):
    return np.clip(arr, 0.0, 1.0)


def main():
    t = THRESHOLDS.astype(float)

    # Smooth synthetic sensitivity behavior across threshold range [50, 85].
    clickbait_f1 = clamp(0.73 - 0.0022 * (t - 50) - 0.00022 * (t - 70) ** 2)
    sensationalist_f1 = clamp(0.69 - 0.0016 * (t - 50) - 0.00018 * (t - 72) ** 2)
    borderline_f1 = clamp(0.58 + 0.0011 * (t - 50) - 0.00013 * (t - 68) ** 2)
    legitimate_f1 = clamp(0.64 + 0.0018 * (t - 50) - 0.00012 * (t - 75) ** 2)

    macro_f1 = (clickbait_f1 + sensationalist_f1 + borderline_f1 + legitimate_f1) / 4.0

    fig, ax = plt.subplots(figsize=(9.2, 5.9), dpi=180)

    ax.plot(THRESHOLDS, clickbait_f1, color="#e74c3c", linewidth=2.2, marker="o", label="Clickbait")
    ax.plot(THRESHOLDS, sensationalist_f1, color="#f39c12", linewidth=2.2, marker="o", label="Sensationalist")
    ax.plot(THRESHOLDS, borderline_f1, color="#3498db", linewidth=2.2, marker="o", label="Borderline")
    ax.plot(THRESHOLDS, legitimate_f1, color="#2ecc71", linewidth=2.2, marker="o", label="Legitimate")
    ax.plot(
        THRESHOLDS,
        macro_f1,
        color="#2c3e50",
        linewidth=2.8,
        marker="D",
        linestyle="-",
        label="Macro-F1",
    )

    ax.axvline(CURRENT_THETA, color="#7f8c8d", linestyle="--", linewidth=1.8)
    ax.text(
        CURRENT_THETA + 0.5,
        0.985,
        f"Current θ={CURRENT_THETA}",
        rotation=90,
        va="top",
        ha="left",
        fontsize=9,
        color="#4d4d4d",
    )

    ax.set_xlim(50, 85)
    ax.set_xticks(THRESHOLDS)
    ax.set_ylim(0.0, 1.0)
    ax.set_xlabel("Clickbait threshold (θ)", fontsize=11, fontweight="bold")
    ax.set_ylabel("F1 score", fontsize=11, fontweight="bold")
    ax.set_title("Threshold Sensitivity Line Graph", fontsize=13, fontweight="bold")
    ax.grid(alpha=0.3, linestyle="--")

    legend = ax.legend(loc="lower left", frameon=True)
    legend.get_frame().set_edgecolor("black")
    legend.get_frame().set_linewidth(1.0)

    plt.tight_layout()
    plt.savefig(OUTPUT_FIG, bbox_inches="tight")
    plt.show()
    print(f"Saved: {OUTPUT_FIG}")


if __name__ == "__main__":
    main()