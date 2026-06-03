# SpotCast 🎯

> Automated local business discovery — find new leads on Google Maps every morning, delivered straight to your inbox.

---

## What is SpotCast?

SpotCast is a lightweight, open-source tool that runs every morning on your computer and automatically:

1. Searches Google Maps for local businesses matching the categories and cities you configured
2. Filters out companies you have already seen in previous sessions
3. Exports the results to a formatted Excel file
4. Sends the file to your email inbox — ready to use

No cloud subscription. No dashboard to log into. Just a file in your inbox every morning.

---

## Requirements

- **Node.js** v18 or higher — [download here](https://nodejs.org)
- A **Google Maps API Key** (with Places API enabled) — [see the dedicated guide](./TUTORIAL_google_api_key.md)
- An **SMTP email account** for sending (Gmail, Outlook, or any provider)
- macOS, Windows, or Linux

---

## Installation

> ⚠️ **M10+:** future versions of SpotCast will include a graphical installer with a guided wizard that automates all these steps. For now, follow the instructions below — it takes less than 5 minutes.

**1. Download SpotCast**

Go to the [Releases](https://github.com/Belmani/SpotCast/releases) page, download the latest version archive, and extract it to a folder of your choice.

**2. Install Node.js** (if you don't have it already)

Download it from [nodejs.org](https://nodejs.org) and install it normally. When done, verify the installation by opening a terminal and typing:

```bash
node --version
```

You should see a version number (e.g. `v20.11.0`). If you get an error, restart your computer and try again.

**3. Install SpotCast dependencies**

Open a terminal, navigate to the SpotCast folder, and type:

```bash
npm install
```

> 💡 **How to open a terminal:**
> - **Windows:** right-click the SpotCast folder → "Open in Terminal" (or search "Command Prompt" in the Start menu)
> - **Mac:** right-click the SpotCast folder → "New Terminal at Folder" (or open Terminal and type `cd ` followed by the folder path)
> - **Linux:** right-click the folder → "Open Terminal"

**4. Copy the configuration file**

```bash
cp config.example.json config.json
```

On Windows, if the command above doesn't work:
```
copy config.example.json config.json
```

**5. Configure SpotCast**

Open `config.json` with any text editor (Notepad on Windows, TextEdit on Mac) and fill in your details. See the [Configuration](#configuration) section below.

---

## Configuration

Open `config.json` and edit the fields to match your needs:

```json
{
  "language": "en",
  "google_api_key": "YOUR_GOOGLE_PLACES_API_KEY",
  "categories": ["Dentist", "Gym", "Lawyer", "Accountant", "Real Estate Agent"],
  "cities": ["Milan", "Rome", "Turin"],
  "countries": ["Italy"],
  "results_per_run": 10,
  "schedule": "0 8 * * *",
  "output_dir": "results",
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 587,
    "user": "your@email.com",
    "pass": "your_app_password"
  },
  "email_to": ["recipient@email.com"],
  "email_template": "templates/email.html"
}
```

### Key fields

| Field | Description | Example |
|---|---|---|
| `language` | Output language: `it`, `en`, `de`, and more | `"en"` |
| `google_api_key` | Your Google Maps API key | `"AIzaSy..."` |
| `categories` | Business types to search for | `["Dentist", "Gym"]` |
| `cities` | Cities to search in | `["Milan", "Rome"]` |
| `countries` | Country filter — prevents ambiguity | `["Italy"]` |
| `results_per_run` | How many new businesses to find each day | `10` |
| `schedule` | Automatic run schedule (cron format) | `"0 8 * * *"` = every day at 8:00 AM |
| `output_dir` | Folder where Excel files are saved | `"results"` |
| `smtp.host` | Email server for sending | `"smtp.gmail.com"` |
| `smtp.port` | SMTP port | `587` |
| `smtp.user` | Your email address | `"your@email.com"` |
| `smtp.pass` | Email password (see Gmail note below) | `"xxxx xxxx xxxx"` |
| `email_to` | Daily report recipients | `["you@email.com"]` |

> 📧 **Gmail note:** Gmail does not accept your regular account password. You need to generate an "App Password":
> 1. Go to [myaccount.google.com/security](https://myaccount.google.com/security)
> 2. Enable 2-Step Verification (if not already enabled)
> 3. Search for "App passwords" and generate one for SpotCast
> 4. Use that 16-character password in the `smtp.pass` field

---

## Running SpotCast

### Manual run — one time only

Open a terminal in the SpotCast folder and type:

```bash
node SpotCast.js
```

SpotCast will search for businesses, generate the Excel file, and send the email. The program closes when done.

### Automatic daily execution

To have SpotCast run every morning automatically, choose the method for your operating system:

---

#### 🍎 macOS — LaunchAgent

Create the file `~/Library/LaunchAgents/com.spotcast.plist` with the following content (replace `/path/to/spotcast` with the actual folder path):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.spotcast</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/spotcast/SpotCast.js</string>
    <string>--daemon</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/path/to/spotcast/tracker.log</string>
  <key>StandardErrorPath</key>
  <string>/path/to/spotcast/tracker.log</string>
</dict>
</plist>
```

Then activate it:
```bash
launchctl load ~/Library/LaunchAgents/com.spotcast.plist
```

SpotCast will start automatically at every login and run in the background.

---

#### 🪟 Windows — Task Scheduler

1. Open **Task Scheduler** (search "Task Scheduler" in the Start menu)
2. Click **Create Basic Task...**
3. Name: `SpotCast`, then **Next**
4. Trigger: **When the computer starts**, then **Next**
5. Action: **Start a program**, then **Next**
6. Program: enter the path to `node.exe` (usually `C:\Program Files\nodejs\node.exe`)
7. Arguments: `C:\path\to\spotcast\SpotCast.js --daemon`
8. Click **Finish**

---

#### 🐧 Linux — systemd

Create the file `/etc/systemd/system/spotcast.service`:

```ini
[Unit]
Description=SpotCast Lead Tracker
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/path/to/spotcast
ExecStart=/usr/bin/node SpotCast.js --daemon
Restart=on-failure
StandardOutput=append:/path/to/spotcast/tracker.log
StandardError=append:/path/to/spotcast/tracker.log

[Install]
WantedBy=multi-user.target
```

Then activate it:
```bash
sudo systemctl enable spotcast
sudo systemctl start spotcast
```

---

## Output

Each run produces an Excel file saved in `output_dir`, with three sheets:

- **Businesses** — Name, category, city, address, phone, website, rating, review count
- **Email Templates** — Pre-filled outreach emails for each business
- **Run Summary** — Date, total found, duplicates skipped, data source

The file is automatically sent to all addresses in `email_to`.

---

## Deduplication

SpotCast keeps track of every business it has ever found. Businesses already in the history are never sent again. To reset the history and start fresh:

```bash
node SpotCast.js --reset
```

---

## Supported Languages

| Code | Language |
|---|---|
| `it` | Italian |
| `en` | English |
| `de` | German |
| `fr` | French |
| `es` | Spanish |
| `pt` | Portuguese |
| `zh` | Chinese (Simplified) |
| `ja` | Japanese |
| `ar` | Arabic |
| `hi` | Hindi |

To add a new language, copy `i18n/en.json`, translate the values, and set the language code in `config.json`.

---

## REST API (for desktop application integration)

SpotCast exposes a local REST API at `http://localhost:3847`:

| Endpoint | Method | Description |
|---|---|---|
| `/status` | GET | Current status and last run info |
| `/run` | POST | Trigger an immediate manual run |
| `/results` | GET | Last run results as JSON |
| `/config` | GET/PUT | Read or update configuration |

---

## Troubleshooting

**SpotCast runs but no email arrives**
→ Check your SMTP credentials in `config.json`. If you use Gmail, make sure you are using an App Password (see Configuration section).

**"google_api_key is required"**
→ You forgot to add your Google API key in `config.json`. Follow the [dedicated guide](./TUTORIAL_google_api_key.md).

**Excel file is generated but the `results` folder is missing**
→ SpotCast creates it automatically. If you see a permissions error, make sure SpotCast is extracted to a folder where you have write access (e.g. Desktop or Documents).

**"node: command not found"**
→ Node.js is not installed or not in your system PATH. Reinstall it from [nodejs.org](https://nodejs.org) and restart your computer.

---

## License

MIT — free to use, modify, and distribute.

---

## Credits

Built with [Google Places API](https://developers.google.com/maps/documentation/places/web-service), [ExcelJS](https://github.com/exceljs/exceljs), [Nodemailer](https://nodemailer.com), and [node-cron](https://github.com/node-cron/node-cron).
