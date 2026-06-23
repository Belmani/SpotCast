# SpotCast 🎯

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-green)
![pnpm](https://img.shields.io/badge/pnpm-10.30.2-orange)
![Tests](https://img.shields.io/badge/tests-passing-brightgreen)

> Automated local business discovery — finds new leads every morning via HERE Browse API, exports them to Excel and delivers the report straight to your inbox. No cloud, no dashboard. Just open your email.

---

## What is SpotCast?

SpotCast runs every morning on your computer and automatically:

1. Searches HERE Maps for local businesses matching your configured categories and cities
2. Filters out companies you have already seen in previous sessions
3. Exports the results to a formatted Excel file
4. Sends the file to your email inbox — ready to use

---

## Requirements

- **Node.js** v20 or higher — [download here](https://nodejs.org)
- A **HERE API Key** (free tier: 250,000 requests/month) — [see setup guide](./docs/TTR_SpotCast_M7_Here.md)
- An **SMTP email account** for sending (Gmail with App Password recommended)
- macOS, Windows, or Linux

---

## Installation

**1. Clone or download SpotCast**

```bash
git clone https://github.com/Belmani/SpotCast.git
cd SpotCast
```

**2. Install pnpm** (if not already installed)

```bash
npm install -g pnpm@10.30.2
```

**3. Install dependencies**

```bash
pnpm install
```

**4. Configure SpotCast**

```bash
cp config.example.json config.json
cp assets/cities/cities.example.json assets/cities/cities.json
```

Open `config.json` and fill in your HERE API key and SMTP credentials.
Open `assets/cities/cities.json` and add the cities you want to monitor.

---

## Configuration

### `config.json`

```json
{
  "language": "en",
  "here_api_key": "YOUR_HERE_API_KEY",
  "search_radius_meters": 15000,
  "categories": ["Bar", "Gym", "Lawyer"],
  "cities_file": "assets/cities/cities.json",
  "schedule": "0 8 * * *",
  "output_dir": "results",
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 587,
    "user": "your@gmail.com",
    "pass": "your_app_password"
  },
  "email_to": ["recipient@email.com"],
  "email_template": "assets/templates/email.html"
}
```

| Field | Description | Example |
|---|---|---|
| `language` | Output language | `"en"`, `"it"`, `"de"` |
| `here_api_key` | Your HERE API key | `"abc123..."` |
| `search_radius_meters` | Search radius around each city center | `15000` |
| `categories` | Business types to search for | `["Bar", "Gym"]` |
| `cities_file` | Path to your cities configuration | `"assets/cities/cities.json"` |
| `schedule` | Cron schedule | `"0 8 * * *"` = daily at 8:00 AM |

### `assets/cities/cities.json`

```json
[
  {
    "country": "Germany",
    "cities": ["Berlin", "München", "Hamburg"]
  },
  {
    "country": "Italy",
    "cities": ["Roma", "Milano"]
  }
]
```

Use the **official local name** for each city — `"München"` not `"Munich"`, `"Roma"` not `"Rome"`.

---

## Supported Categories

SpotCast uses English labels in `config.json` and maps them to HERE category codes internally.

| Label | Category |
|---|---|
| `"Bar"` | Bar / Pub |
| `"Restaurant"` | Restaurant |
| `"Gym"` | Gym / Fitness |
| `"Dentist"` | Dentist |
| `"Lawyer"` | Law office |
| `"Plumber"` | Plumber |
| `"Locksmith"` | Locksmith |
| `"Electrician"` | Electrician |
| `"Pharmacy"` | Pharmacy |
| `"Real Estate"` | Real estate agency |

Full list in `src/fetcher/HereCategoryMap.ts`.

---

## Running SpotCast

### Manual run

```bash
pnpm build
node dist/SpotCast.js
```

### Run immediately without waiting for schedule

```bash
node dist/SpotCast.js --daemon --now
```

### Automatic daily execution

#### macOS — LaunchAgent

Create `~/Library/LaunchAgents/com.spotcast.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.spotcast</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/spotcast/dist/SpotCast.js</string>
    <string>--daemon</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.spotcast.plist
```

#### Windows — Task Scheduler

1. Open Task Scheduler → Create Basic Task
2. Trigger: When the computer starts
3. Program: `C:\Program Files\nodejs\node.exe`
4. Arguments: `C:\path\to\spotcast\dist\SpotCast.js --daemon`

#### Linux — systemd

```ini
[Unit]
Description=SpotCast Lead Tracker
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/path/to/spotcast
ExecStart=/usr/bin/node dist/SpotCast.js --daemon
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable spotcast && sudo systemctl start spotcast
```

---

## Output

Each run produces an Excel file in `output_dir` with three sheets:

- **Businesses** — name, category, city, address, phone, website, rating, review count
- **Email Templates** — pre-filled outreach emails per business
- **Run Summary** — date, total found, duplicates skipped, data source

The file is automatically sent to all addresses in `email_to`.

---

## Deduplication

SpotCast tracks every business it has ever found. Already-seen businesses are never sent again. To reset:

```bash
node dist/SpotCast.js --reset
```

---

## Supported Languages

`en`, `it`, `de`, `fr`, `es`, `pt`, `zh`, `ja`, `ar`, `tr`

---

## License

MIT — free to use, modify, and distribute.
