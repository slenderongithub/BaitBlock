import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

INPUT_CSV = "radar_components.csv"
OUTPUT_FIG = "fig2_radar_graph.png"
CLASS_ORDER = ["Clickbait", "Sensationalist", "Borderline", "Legitimate"]
AXES = ["gap", "sentiment", "hook"]


def main():
    df = pd.read_csv(INPUT_CSV)

    required = {"verdict", *AXES}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns in {INPUT_CSV}: {missing}")

    for col in AXES:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["verdict", *AXES]).copy()
    df = df[df["verdict"].isin(CLASS_ORDER)]

    # Mean component value per verdict class on a 0-1 scale
    stats = df.groupby("verdict")[AXES].mean().reindex(CLASS_ORDER)
    stats = stats.fillna(0.0).clip(0.0, 1.0)

    labels = ["Gap (G)", "Sentiment (S)", "Hook (H)"]
    num_axes = len(labels)
    angles = np.linspace(0, 2 * np.pi, num_axes, endpoint=False).tolist()
    angles += angles[:1]

    fig, ax = plt.subplots(figsize=(8, 7), dpi=160, subplot_kw={"polar": True})

    palette = {
        "Clickbait": "#e74c3c",
        "Sensationalist": "#f39c12",
        "Borderline": "#3498db",
        "Legitimate": "#2ecc71",
    }

    for verdict in CLASS_ORDER:
        values = stats.loc[verdict, AXES].tolist()
        values += values[:1]

        ax.plot(angles, values, linewidth=2.0, color=palette[verdict], label=verdict)
        ax.fill(angles, values, color=palette[verdict], alpha=0.16)

    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(labels, fontsize=11, fontweight="bold")
    ax.set_ylim(0, 1)
    ax.set_yticks(np.linspace(0.2, 1.0, 5))
    ax.set_yticklabels(["0.2", "0.4", "0.6", "0.8", "1.0"], fontsize=9)
    ax.grid(alpha=0.35)
    ax.set_title("Radar Plot of Gap, Sentiment, and Hook by Verdict Class", fontsize=12, fontweight="bold", pad=20)

    legend = ax.legend(loc="upper right", bbox_to_anchor=(1.22, 1.15), frameon=True)
    legend.get_frame().set_linewidth(1.0)
    legend.get_frame().set_edgecolor("black")

    plt.tight_layout()
    plt.savefig(OUTPUT_FIG, bbox_inches="tight")
    plt.show()
    print(f"Saved: {OUTPUT_FIG}")


if __name__ == "__main__":
    main()