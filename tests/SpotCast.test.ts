// ─────────────────────────────────────────────────────────────────────────────
//  SpotCast — Pipeline integration tests (Vitest)
//
//  Strategy: mock external I/O (Google API, SMTP, filesystem writes)
//  but keep the pipeline orchestration logic real and untouched.
//  We verify behaviour at the pipeline level — not at the unit level.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPipeline } from '../src/SpotCast';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../src/config/ConfigLoader', () => ({
  loadConfig: () => ({
    language:        'en',
    google_api_key:  'test-key',
    categories:      ['Dentist'],
    cities:          ['Berlin'],
    countries:       ['Germany'],
    results_per_run: 10,
    schedule:        '0 8 * * *',
    output_dir:      '/tmp/spotcast-test',
    smtp: { host: 'smtp.test.com', port: 587, user: 'test@test.com', pass: 'pass' },
    email_to:        ['recipient@test.com'],
    email_template:  'templates/email.html',
  }),
}));

vi.mock('../src/config/ExcelConfigLoader', () => ({
  loadExcelConfig: () => ({
    columns: {
      name: true, category: true, city: true, country: true,
      address: true, phone: true, website: true,
      rating: true, review_count: true,
      place_id: false, maps_url: false, first_seen: false,
    },
    include_email_templates: false,
  }),
}));

// i18n — minimal real-enough dictionaries
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: (p: string) => {
      if (String(p).includes('i18n')) return true;
      if (String(p).includes('email.html')) return true;
      if (String(p).includes('.xlsx')) return true;
      return actual.existsSync(p);
    },
    readFileSync: (p: string, enc?: unknown) => {
      if (String(p).includes('i18n'))
        return JSON.stringify({
          email_subject: 'SpotCast — {{date}}',
          email_body:    'Found {{count}} businesses.',
        });
      if (String(p).includes('email.html'))
        return '<html>{{{body}}}</html>';
      return actual.readFileSync(p, enc as BufferEncoding);
    },
  };
});

const mockFetchAll  = vi.fn();
const mockFilter    = vi.fn();
const mockExport    = vi.fn();
const mockSend      = vi.fn();
const mockMarkSeen  = vi.fn();

vi.mock('../src/fetcher/GoogleFetcher', () => ({
  GoogleFetcher: vi.fn().mockImplementation(function () {
    return { fetchAll: mockFetchAll };
  }),
}));

vi.mock('../src/dedup/DedupService', () => ({
  DedupService: vi.fn().mockImplementation(function () {
    return { filter: mockFilter, markSeen: mockMarkSeen };
  }),
}));

vi.mock('../src/excel/ExcelExporter', () => ({
  ExcelExporter: vi.fn().mockImplementation(function () {
    return { export: mockExport };
  }),
}));

vi.mock('../src/mailer/MailService', () => ({
  MailService: vi.fn().mockImplementation(function () {
    return { send: mockSend };
  }),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

const makeBusiness = (id: string) => ({
  place_id: id, name: `Biz ${id}`, category: 'Dentist',
  city: 'Berlin', country: 'Germany', address: 'Street 1',
});

beforeEach(() => {
  vi.clearAllMocks();
  mockExport.mockResolvedValue('/tmp/spotcast-test/SpotCast_2026-06-01.xlsx');
  mockSend.mockResolvedValue({});
});

describe('runPipeline', () => {

  it('skips email when dedup returns empty array', async () => {
    mockFetchAll.mockResolvedValue([makeBusiness('1')]);
    mockFilter.mockReturnValue([]);

    const result = await runPipeline({ useJsonTransport: true });

    expect(result).toEqual({ found: 0, skipped: true });
    expect(mockExport).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('runs full pipeline when new businesses are found', async () => {
    const businesses = [makeBusiness('1'), makeBusiness('2')];
    mockFetchAll.mockResolvedValue(businesses);
    mockFilter.mockReturnValue(businesses);

    const result = await runPipeline({ useJsonTransport: true });

    expect(result).toEqual({ found: 2, skipped: false });
    expect(mockExport).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockMarkSeen).toHaveBeenCalledWith(businesses);
  });

  it('marks seen AFTER send — never before', async () => {
    const businesses = [makeBusiness('1')];
    mockFetchAll.mockResolvedValue(businesses);
    mockFilter.mockReturnValue(businesses);

    const callOrder: string[] = [];
    mockSend.mockImplementation(async () => { callOrder.push('send'); });
    mockMarkSeen.mockImplementation(() => { callOrder.push('markSeen'); });

    await runPipeline({ useJsonTransport: true });

    expect(callOrder).toEqual(['send', 'markSeen']);
  });

  it('does not markSeen if send throws', async () => {
    const businesses = [makeBusiness('1')];
    mockFetchAll.mockResolvedValue(businesses);
    mockFilter.mockReturnValue(businesses);
    mockSend.mockRejectedValue(new Error('SMTP connection refused'));

    await expect(runPipeline({ useJsonTransport: true })).rejects.toThrow('SMTP connection refused');
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it('does not export or send if fetcher returns empty array', async () => {
    mockFetchAll.mockResolvedValue([]);
    mockFilter.mockReturnValue([]);

    const result = await runPipeline({ useJsonTransport: true });

    expect(result.skipped).toBe(true);
    expect(mockExport).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('propagates fetcher errors', async () => {
    mockFetchAll.mockRejectedValue(new Error('API quota exceeded'));

    await expect(runPipeline({ useJsonTransport: true })).rejects.toThrow('API quota exceeded');
    expect(mockFilter).not.toHaveBeenCalled();
  });

});