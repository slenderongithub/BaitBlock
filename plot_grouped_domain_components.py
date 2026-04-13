import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

INPUT_CSV = "domain_components.csv"
OUTPUT_FIG = "fig5_grouped_domain_components.png"
DOMAIN_ORDER = ["Tabloid", "Broadsheet", "Blog", "Wire Service", "Social Media"]


def main():
    df = pd.read_csv(INPUT_CSV)

    required = {"domain", "gap", "sentiment", "hook"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns in {INPUT_CSV}: {missing}")

    for col in ["gap", "sentiment", "hook"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["domain", "gap", "sentiment", "hook"]).copy()
    df = df[df["domain"].isin(DOMAIN_ORDER)]

    grouped = df.groupby("domain")
    mean_vals = grouped[["gap", "sentiment", "hook"]].mean().reindex(DOMAIN_ORDER)
    std_vals = grouped[["gap", "sentiment", "hook"]].std().reindex(DOMAIN_ORDER).fillna(0.0)

    x = np.arange(len(DOMAIN_ORDER))
    width = 0.24

    fig, ax = plt.subplots(figsize=(10.8, 6.2), dpi=170)

    ax.bar(
        x - width,
        mean_vals["gap"],
        width,
        yerr=std_vals["gap"],
        capsize=5,
        label="Gap (G)",
        color="#3498db",
        edgecolor="black",
        linewidth=1.0,
    )
    ax.bar(
        x,
        mean_vals["sentiment"],
        width,
        yerr=std_vals["sentiment"],
        capsize=5,
        label="Sentiment (S)",
        color="#f39c12",
        edgecolor="black",
        linewidth=1.0,
    )
    ax.bar(
        x + width,
        mean_vals["hook"],
        width,
        yerr=std_vals["hook"],
        capsize=5,
        label="Hook (H)",
        color="#e74c3c",
        edgecolor="black",
        linewidth=1.0,
    )

    ax.set_xticks(x)
    ax.set_xticklabels(DOMAIN_ORDER)
    ax.set_xlabel("Domain category", fontsize=11, fontweight="bold")
    ax.set_ylabel("Mean component score", fontsize=11, fontweight="bold")
    ax.set_ylim(0, 1.0)
    ax.set_title("Grouped Bar Chart: Component Contribution by News Domain", fontsize=13, fontweight="bold")
    ax.grid(axis="y", linestyle="--", alpha=0.35)
    ax.legend(frameon=True)

    plt.tight_layout()
    plt.savefig(OUTPUT_FIG, bbox_inches="tight")
    plt.show()
    print(f"Saved: {OUTPUT_FIG}")


if __name__ == "__main__":
    main()