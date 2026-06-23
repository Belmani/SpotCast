// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — MailService
//  Sends the Excel report as email attachment via SMTP (Nodemailer).
//
//  Contract (DTR-036):
//    - MailService is dumb — it always sends when called
//    - The pipeline (M6) decides whether to call it
//    - On SMTP error: logs + rethrows — never swallows
//    - On missing Excel file: throws descriptive error before attempting SMTP
//
//  Recipients (DTR-035):
//    - First address in config.email_to → to
//    - All others → bcc
//
//  Template rendering:
//    - Body text: i18n.email_body compiled with Handlebars, \n → <br>
//    - HTML wrapper: templates/email.html with {{{body}}} triple-stache
//    - Subject: i18n.email_subject compiled with Handlebars
// ─────────────────────────────────────────────────────────────────────────────

import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { Config } from '../config/ConfigLoader';
import { Business } from '../fetcher/Business';
import { HERE_CATEGORY_MAP } from '../fetcher/HereCategoryMap';
import { t } from '../i18n/translate';
import { formatDate, formatInteger } from '../i18n/format';
import logger from '../logger';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Reverse map: HERE code → English label
const CODE_TO_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(HERE_CATEGORY_MAP).map(([label, code]) => [code, label])
);

// ── Options ───────────────────────────────────────────────────────────────────

export interface MailServiceOptions {
  /** Use jsonTransport instead of real SMTP — for testing only */
  useJsonTransport?: boolean;
}

// ── MailService ───────────────────────────────────────────────────────────────

export class MailService {
  private config: Config;
  private options: MailServiceOptions;

  constructor(config: Config, options: MailServiceOptions = {}) {
    this.config = config;
    this.options = options;
  }

  /**
   * Sends the Excel report as an email attachment.
   *
   * @param excelFilePath  Absolute path to the generated .xlsx file
   * @param businesses     Filtered businesses (used for count, categories, cities)
   * @param i18n           Active language dictionary
   * @param fallback       en.json — always passed as safety net
   * @returns              In test mode (jsonTransport), returns the captured message object
   */
  async send(
    excelFilePath: string,
    businesses: Business[],
    i18n: Record<string, unknown>,
    fallback: Record<string, unknown>
  ): Promise<unknown> {
    const tr = (key: string) => t(key, i18n, fallback);

    // ── Guard: Excel file must exist (DTR-036) ─────────────────────────────
    if (!fs.existsSync(excelFilePath)) {
      const msg = `Excel file not found: ${excelFilePath}`;
      logger.error(msg);
      throw new Error(msg);
    }

    // ── Prepare template variables ─────────────────────────────────────────
    const now  = new Date();
    const date = formatDate(now, i18n);
    const count = formatInteger(businesses.length, i18n);

    // Categories: resolve HERE codes back to English labels
    const categories = this.config.categories
      .map(code => CODE_TO_LABEL[code] ?? code)
      .join(', ');

    // Cities: unique list extracted from actual businesses found
    const cities = [...new Set(businesses.map(b => b.city))].join(', ');

    const templateVars = { date, count, categories, cities };

    // ── Render subject ─────────────────────────────────────────────────────
    const subjectTemplate  = Handlebars.compile(tr('email_subject'));
    const renderedSubject  = subjectTemplate(templateVars);

    // ── Render body text (i18n string → HTML) ──────────────────────────────
    const bodyTemplate     = Handlebars.compile(tr('email_body'));
    const renderedBodyText = bodyTemplate(templateVars);
    const bodyHtml         = renderedBodyText.replace(/\n/g, '<br>');

    // ── Render HTML wrapper ────────────────────────────────────────────────
    const templatePath     = path.isAbsolute(this.config.email_template)
      ? this.config.email_template
      : path.resolve(process.cwd(), this.config.email_template);

    const htmlWrapper      = fs.readFileSync(templatePath, 'utf-8');
    const wrapperTemplate  = Handlebars.compile(htmlWrapper);
    const renderedHtml     = wrapperTemplate({ ...templateVars, body: bodyHtml });

    // ── Build mail options (DTR-035) ───────────────────────────────────────
    const recipients = this.config.email_to;
    const mailOptions: nodemailer.SendMailOptions = {
      from:        `SpotCast <${this.config.smtp.user}>`,
      to:          recipients[0],
      bcc:         recipients.slice(1).join(', '),
      subject:     renderedSubject,
      html:        renderedHtml,
      attachments: [{
        filename: path.basename(excelFilePath),
        path:     excelFilePath,
      }],
    };

    // ── Create transport ───────────────────────────────────────────────────
    const transport = this.options.useJsonTransport
      ? nodemailer.createTransport({ jsonTransport: true })
      : nodemailer.createTransport({
          host:   this.config.smtp.host,
          port:   this.config.smtp.port,
          secure: this.config.smtp.port === 465,
          auth: {
            user: this.config.smtp.user,
            pass: this.config.smtp.pass,
          },
        });

    // ── Send (DTR-036: log + rethrow on error) ─────────────────────────────
    try {
      const info = await transport.sendMail(mailOptions);
      logger.info(`Email sent to ${recipients.length} recipient(s)`);

      if (this.options.useJsonTransport) {
        return JSON.parse((info as nodemailer.SentMessageInfo & { message: string }).message);
      }

      return info;
    } catch (err) {
      logger.error(`SMTP error: ${(err as Error).message}`);
      throw err;
    }
  }
}