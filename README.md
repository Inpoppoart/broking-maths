# Broking Maths iPhone App

This is an installable iPhone web app/PWA for quick broking mental maths.

## What it does

- Generates random 2–3 digit addition/subtraction questions
- Uses quarters and eighths
- Default range: 70 to 350
- Accepts answers as:
  - `331 5/8`
  - `331.625`
  - `331`
- Includes score, streak, timer, speed mode, hard mode, and adjustable settings

## Use on iPhone

1. Download/extract the ZIP.
2. Host the folder somewhere simple, for example:
   - GitHub Pages
   - Netlify
   - Vercel
   - your local computer over Wi-Fi
3. Open `index.html` URL in Safari.
4. Tap Share.
5. Tap Add to Home Screen.

## Quick local test on Mac/PC

From inside the folder:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

For iPhone on the same Wi-Fi, use your computer's local IP address instead of localhost.
