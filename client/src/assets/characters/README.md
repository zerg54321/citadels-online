# Character card art

Place face-up character images here. The UI loads them automatically.

| File name | Role |
|---|---|
| `assassin.jpg` | 1 刺客 |
| `thief.jpg` | 2 盗贼 |
| `magician.jpg` | 3 魔术师 |
| `king.jpg` | 4 国王 |
| `bishop.jpg` | 5 主教 |
| `merchant.jpg` | 6 商人 |
| `architect.jpg` | 7 建筑师 |
| `warlord.jpg` | 8 军阀 |

Optional: also `assassin.png` / `.webp` (same basename).

## Spec (same style as district cards)

- **Format:** JPG / PNG / WebP  
- **Aspect:** portrait ~ **5:7** (e.g. 500×700, 600×840)  
- **Resolution:** any is fine — CSS uses `background-size: cover`  
  - Recommended: **≥ 400×560**, ideally **600×840** or **800×1120**  
- **Focus:** important face/figure in the **upper 60%** (bottom has name bar overlay)  
- **No need** for identical pixel sizes across roles  

Missing files fall back to emoji + gradient until you add art.
