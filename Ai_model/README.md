# Ai_model: AI terrain reading

Our model reads Curiosity's Navcam photos of the boxwork route and labels each pixel as soil, bedrock, sand or big rock. Each rover stop then gets a colour for the astronaut. Method, results, limits and the AI-use declaration: **[`AI_WRITEUP.md`](AI_WRITEUP.md)**.

| File | What |
|---|---|
| `nasa_training.ipynb` | Colab notebook: AI4Mars training (DeepLabV3+, ResNet-50), evaluation, boxwork photos → per-stop results |
| `results/metrics.json` | test-set IoU per class, pixel accuracy |
| `results/per_image_v2.csv` | class percentages for every boxwork photo |
| `results/picked.csv` | the photos kept for each stop (ground in front of the rover) |
| `results/stops_v2.json` | the 55 stops with their AI result (copied into `Application/data/stops.json`) |
| `themis_vs_ai.png` | orbit (THEMIS night IR) vs ground (our AI) check |

Trained weights (`*.pt`) are not in the repo (size); the notebook recreates them on a Colab GPU.
