# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.1.x | ✅ |

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

SpotCast handles sensitive data including Google Maps API keys and SMTP credentials. If you discover a security vulnerability, please report it responsibly.

### How to Report

Send a description of the vulnerability to the maintainers via the GitHub **[Security Advisories](https://github.com/Belmani/SpotCast/security/advisories/new)** feature:

1. Go to the [Security tab](https://github.com/Belmani/SpotCast/security) of the repository
2. Click **"Report a vulnerability"**
3. Fill in the form with as much detail as possible

### What to Include

- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- SpotCast version and operating system
- Any suggested fix, if you have one

### What to Expect

- Acknowledgement of your report within **72 hours**
- A status update within **7 days**
- Credit in the release notes when the fix is published, if you wish

---

## Security Design Notes

SpotCast is a local tool — it does not run as a server exposed to the internet in normal usage. Key security considerations:

- **API keys and SMTP credentials** are never committed to the repository — stored in `config.json` (gitignored) or environment variables
- **`config.json`** should have restricted file permissions on shared systems
- The **REST API** (port 3847) binds to `localhost` only — not accessible from the network
- SpotCast does not collect, transmit, or store any user data beyond the local `seen_firms.json` history file
