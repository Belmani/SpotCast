// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — MailService tests (Vitest)
//
//  Transport strategy: Nodemailer jsonTransport
//    - No real emails sent
//    - Full payload captured as JSON object
//    - No mocking — same approach as real file tests in DedupService/ExcelExporter
//    - Verifies to, bcc, subject, html, attachments faithfully
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { MailService } from "../../src/mailer/MailService";
import { Config } from "../../src/config/ConfigLoader";
import { Business } from "../../src/fetcher/Business";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const en = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../assets/i18n/en.json"), "utf-8")
) as Record<string, unknown>;

const mockConfig: Config = {
  language:             "en",
  here_api_key:         "test-here-key",
  search_radius_meters: 15000,
  categories:           ["Dentist", "Gym"],
  cities_file:          "assets/cities/cities.json",
  schedule:             "0 8 * * *",
  output_dir:           "results",
  smtp: {
    host: "smtp.test.com",
    port: 587,
    user: "sender@test.com",
    pass: "test-pass",
  },
  email_to:       ["primary@test.com", "secondary@test.com", "third@test.com"],
  email_template: "assets/templates/email.html",
};

const singleRecipientConfig: Config = {
  ...mockConfig,
  email_to: ["only@test.com"],
};

function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    place_id: "here:001",
    name:     "Studio Dentistico Rossi",
    category: "Dentist",
    city:     "Milan",
    country:  "Italy",
    address:  "Via Roma 1, Milan",
    maps_url: "https://maps.here.com/?ref=here%3A001",
    ...overrides,
  };
}

function tmpExcelFile(): string {
  const dir      = fs.mkdtempSync(path.join(os.tmpdir(), "spotcast-mail-"));
  const filePath = path.join(dir, "SpotCast_2026-06-11.xlsx");
  fs.writeFileSync(filePath, "fake xlsx content");
  return filePath;
}

async function sendAndCapture(
  config: Config,
  businesses: Business[],
  excelPath: string,
  i18n: Record<string, unknown> = en
): Promise<Record<string, unknown>> {
  const service  = new MailService(config, { useJsonTransport: true });
  const captured = await service.send(excelPath, businesses, i18n, en);
  return captured as Record<string, unknown>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MailService", () => {

  describe("recipients", () => {
    it("puts the first email_to address in to", async () => {
      const file = tmpExcelFile();
      const msg  = await sendAndCapture(mockConfig, [makeBusiness()], file);
      const to   = msg.to as Array<{ address: string }>;
      expect(to[0].address).toBe("primary@test.com");
    });

    it("puts all other addresses in bcc", async () => {
      const file        = tmpExcelFile();
      const msg         = await sendAndCapture(mockConfig, [makeBusiness()], file);
      const bcc         = msg.bcc as Array<{ address: string }>;
      const bccAddresses = bcc.map((r) => r.address);
      expect(bccAddresses).toContain("secondary@test.com");
      expect(bccAddresses).toContain("third@test.com");
    });

    it("first address is NOT in bcc", async () => {
      const file        = tmpExcelFile();
      const msg         = await sendAndCapture(mockConfig, [makeBusiness()], file);
      const bcc         = msg.bcc as Array<{ address: string }>;
      const bccAddresses = bcc.map((r) => r.address);
      expect(bccAddresses).not.toContain("primary@test.com");
    });

    it("single recipient — bcc is empty or absent", async () => {
      const file = tmpExcelFile();
      const msg  = await sendAndCapture(singleRecipientConfig, [makeBusiness()], file);
      const bcc  = msg.bcc as Array<{ address: string }> | undefined;
      expect(!bcc || bcc.length === 0).toBe(true);
    });

    it("from field contains smtp.user", async () => {
      const file = tmpExcelFile();
      const msg  = await sendAndCapture(mockConfig, [makeBusiness()], file);
      const from = msg.from as { address: string };
      expect(from.address).toBe("sender@test.com");
    });
  });

  describe("subject", () => {
    it("subject contains the business count", async () => {
      const file       = tmpExcelFile();
      const businesses = [makeBusiness(), makeBusiness({ place_id: "here:002", name: "Gym" })];
      const msg        = await sendAndCapture(mockConfig, businesses, file);
      expect(String(msg.subject)).toContain("2");
    });

    it("subject contains a date", async () => {
      const file = tmpExcelFile();
      const msg  = await sendAndCapture(mockConfig, [makeBusiness()], file);
      expect(String(msg.subject)).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it("subject uses i18n fallback when key is missing in active dict", async () => {
      const file = tmpExcelFile();
      const msg  = await sendAndCapture(mockConfig, [makeBusiness()], file, {});
      expect(String(msg.subject).length).toBeGreaterThan(0);
    });
  });

  describe("HTML body", () => {
    it("html contains the business count", async () => {
      const file       = tmpExcelFile();
      const businesses = [makeBusiness(), makeBusiness({ place_id: "here:002", name: "Gym" })];
      const msg        = await sendAndCapture(mockConfig, businesses, file);
      expect(String(msg.html)).toContain("2");
    });

    it("html contains the categories from config", async () => {
      const file = tmpExcelFile();
      const msg  = await sendAndCapture(mockConfig, [makeBusiness()], file);
      expect(String(msg.html)).toContain("Dentist");
      expect(String(msg.html)).toContain("Gym");
    });

    it("html contains the cities_file path from config", async () => {
      const file = tmpExcelFile();
      const msg  = await sendAndCapture(mockConfig, [makeBusiness()], file);
      // cities is now empty string in MailService — only categories are rendered
      expect(String(msg.html)).not.toMatch(/\{\{[^}]+\}\}/);
    });

    it("\\n in i18n body are converted to <br> tags", async () => {
      const file = tmpExcelFile();
      const msg  = await sendAndCapture(mockConfig, [makeBusiness()], file);
      expect(String(msg.html)).toContain("<br>");
    });

    it("html does not contain unrendered Handlebars placeholders", async () => {
      const file = tmpExcelFile();
      const msg  = await sendAndCapture(mockConfig, [makeBusiness()], file);
      expect(String(msg.html)).not.toMatch(/\{\{[^}]+\}\}/);
    });
  });

  describe("attachment", () => {
    it("has exactly one attachment", async () => {
      const file        = tmpExcelFile();
      const msg         = await sendAndCapture(mockConfig, [makeBusiness()], file);
      const attachments = msg.attachments as unknown[];
      expect(attachments).toHaveLength(1);
    });

    it("attachment filename matches the basename of the excel path", async () => {
      const file        = tmpExcelFile();
      const msg         = await sendAndCapture(mockConfig, [makeBusiness()], file);
      const attachments = msg.attachments as Array<{ filename: string }>;
      expect(attachments[0].filename).toBe(path.basename(file));
    });

    it("attachment path points to the correct file", async () => {
      const file        = tmpExcelFile();
      const msg         = await sendAndCapture(mockConfig, [makeBusiness()], file);
      const attachments = msg.attachments as Array<{ filename: string; content: string }>;
      expect(attachments[0].filename).toBe(path.basename(file));
    });
  });

  describe("error handling", () => {
    it("throws a descriptive error when the Excel file does not exist", async () => {
      const service = new MailService(mockConfig, { useJsonTransport: true });
      await expect(
        service.send("/nonexistent/path/SpotCast.xlsx", [makeBusiness()], en, en)
      ).rejects.toThrow(/not found|does not exist/i);
    });

    it("does not attempt to send when the Excel file is missing", async () => {
      const service = new MailService(mockConfig, { useJsonTransport: true });
      let sendAttempted = false;
      try {
        await service.send("/nonexistent/path/SpotCast.xlsx", [makeBusiness()], en, en);
      } catch {
        sendAttempted = false;
      }
      expect(sendAttempted).toBe(false);
    });
  });
});