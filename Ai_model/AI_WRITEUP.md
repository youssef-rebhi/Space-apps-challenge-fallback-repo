# Marsouine · AI terrain reading (team y3m)

## What the AI does
Curiosity is driving through the **boxwork** region of Mount Sharp, Gale crater. Mission maps can say where sand *might* be. We wanted to **measure** it. Our AI reads Curiosity's own Navcam photos of the boxwork route (sols 4534–4805) and tells, pixel by pixel, what the ground is: **soil, bedrock, sand or big rock**. Each rover stop then gets a colour for the astronaut:

- 🟢 **GO**: firm ground, high certainty
- 🟠 **CAREFUL**: some sand (≥ 10 % of the ground in front of the rover)
- 🔴 **DON'T GO**: a lot of sand (> 30 %) or big rocks (> 2 %)
- ⚪ **NO DATA**: not seen yet → send the scout

These thresholds are **our team's assumption** for a walking astronaut, not a NASA rule.

## How we built it
1. **Training data**: AI4Mars, 16,064 Curiosity images labelled by people (classes soil, bedrock, sand, big rock). The rover body and ground farther than 30 m are not labelled, so we ignore them.
2. **Model**: DeepLabV3+ with a ResNet-50 encoder (ImageNet start), 512 px, 4 epochs, AdamW, weighted loss so rare classes (sand, big rock) count more.
3. **Safety setting**: we call a pixel "sand" when the model is ≥ 30 % sure (not 50 %). Missing sand is worse than a false alarm. This gives **sand recall 92 %, precision 93 %**.
4. **New photos**: we downloaded the Curiosity raw Navcam images from the boxwork sols, matched each one to a rover stop with the mission waypoints file (site + drive), checked them by hand, and kept the photos showing ground in front of the rover. We read the band from 40 % to 85 % of the image height (the near ground).
5. **Result**: **55 stops** → 50 green, 4 orange, 1 red (sol 4580, a real boulder).

## How good it is (AI4Mars test set, labels agreed by 3 experts)
| | soil | bedrock | sand | big rock | mean |
|---|---|---|---|---|---|
| IoU | 0.981 | 0.941 | 0.966 | 0.394 | **0.821** |

Pixel accuracy 0.983. A model that always says the most common class scores mIoU 0.128.
On the harder test set (1 labeller): mIoU 0.683.
**Check on boxwork photos**: at the 3 stops where people can see sand ripples (sols 4544, 4582 and the hollow at 4616), the AI flagged sand at all 3.

## Honest limits
- **Big rocks are weak** (IoU 0.39): they are only 1 % of training pixels.
- The new boxwork photos have **no labels**, so we can't score them; we checked them by eye.
- A stop's position is **"near here"** (rover waypoint), not an exact spot of each pixel.
- The data is from **rover wheels**, not boots. What is safe for a rover is a guide, not proof, for a person.
- The model sometimes calls **fine sand ripples "soil"**.
- On **Perseverance** photos (Jezero) it works worse: different camera and terrain. We trained on Curiosity only.
- The **scout drone** and its "laser + microphone" reading are a **simulation** inspired by Perseverance's SuperCam microphone. The walk in the helmet is simulated too. The AI does not run live on a camera.

## Use of AI (declaration)
- **Our own model** (DeepLabV3+), trained by us on AI4Mars, makes the terrain map.
- **Claude (Anthropic)** helped us with code (Colab notebook, React tablet and helmet app), checking our results, and drafting text. Every number above comes from our own runs.
- AI-made images or media in our project are marked as AI-made.

## Data sources
- **AI4Mars dataset** (NASA JPL, Swan et al., 2021), copy used: huggingface.co/datasets/hassanjbara/AI4MARS
- **Curiosity raw images** (NASA/JPL-Caltech), mars.nasa.gov raw image API, sols 4534–4805
- **Curiosity waypoints** (NASA MMGIS): mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json
- **Curiosity's proposed path up Mount Sharp** (NASA): science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/
- **Mars Trek** (NASA): trek.nasa.gov/mars/
- **THEMIS Night IR 100 m mosaic** (NASA Mars Odyssey / ASU), used for the orbit vs ground check
- **Perseverance raw images** (NASA/JPL-Caltech): mars.nasa.gov/mars2020/multimedia/raw-images/
- **SuperCam microphone** (NASA Perseverance), idea behind the simulated scout
- Model: DeepLabV3+ (Chen et al., 2018), library segmentation-models-pytorch

No NASA logos are used. Project images are credited to NASA/JPL-Caltech.
