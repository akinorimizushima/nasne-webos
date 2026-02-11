# nasne-webos

nasne client app for LG webOS TV.

## Project Structure

```
nasne-webos/
├── appinfo.json    # webOS app metadata
├── index.html      # Entry point
├── css/
│   └── style.css   # Styles
├── js/
│   └── app.js      # App logic
├── assets/         # Images and other assets
├── icon.png        # App icon (80x80)
└── largeIcon.png   # Large app icon (130x130)
```

## Development

### Prerequisites

Install webOS TV CLI:

```bash
npm install -g @webos-tools/cli
```

### Useful Commands

```bash
# Package the app
ares-package .

# Install on TV (replace DEVICE with your device name)
ares-install --device DEVICE com.example.nasne_1.0.0_all.ipk

# Launch on TV
ares-launch --device DEVICE com.example.nasne

# Inspect / Debug
ares-inspect --device DEVICE --app com.example.nasne

# Set up a device
ares-setup-device
```
# nasne-webos
