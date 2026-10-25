// Paste or pick an access log, POST it to /projects/:id/logs and show what was kept.
import { useId, useRef, useState } from 'react';
import { CheckCircle2, FileUp, Info, XCircle } from 'lucide-react';
import { Button, Textarea } from '@/components/ui';
import { copy, fmt } from '@/content/copy';
import { errorMessage, useUploadLogs, type LogUploadResult } from '@/lib/api';
import { bytes, num } from '@/lib/format';

const U = copy.pages.crawlers.upload;
const MAX_BYTES = 20 * 1024 * 1024;

/** A few combined-format lines (AI crawlers, one AI referral, one ordinary visitor) for trying the parser. */
function sampleLog(): string {
  const now = new Date();
  const t = (minsAgo: number) => {
    const d = new Date(now.getTime() - minsAgo * 60_000);
    const mon = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getUTCDate())}/${mon}/${d.getUTCFullYear()}:${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`;
  };
  return [
    `20.171.207.12 - - [${t(42)}] "GET /pricing HTTP/1.1" 200 18234 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)"`,
    `160.79.104.10 - - [${t(37)}] "GET /docs/getting-started HTTP/1.1" 200 9120 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)"`,
    `44.221.181.61 - - [${t(31)}] "GET /blog/ai-support-metrics HTTP/1.1" 200 15302 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)"`,
    `23.98.142.11 - - [${t(24)}] "GET /compare HTTP/1.1" 404 512 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot"`,
    `203.0.113.7 - - [${t(12)}] "GET /pricing?utm_source=chatgpt.com HTTP/1.1" 200 18234 "https://chatgpt.com/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"`,
    `198.51.100.23 - - [${t(5)}] "GET / HTTP/1.1" 200 22011 "https://www.google.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"`,
  ].join('\n');
}

export interface LogUploadFormProps {
  projectId: string;
  /** Called after a successful upload (e.g. to close a dialog). */
  onUploaded?: (r: LogUploadResult) => void;
  /** Rows for the paste box. */
  rows?: number;
}

/** Log uploader: file picker or paste, then counts of AI crawler visits / AI referrals / skipped lines. */
export function LogUploadForm({ projectId, onUploaded, rows = 8 }: LogUploadFormProps) {
  const upload = useUploadLogs(projectId);
  const [text, setText] = useState('');
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileId = useId();
  const result = upload.data;

  const pick = async (f: File | undefined) => {
    setError(null);
    upload.reset();
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError(U.tooLarge);
      return;
    }
    setFile({ name: f.name, size: f.size });
    setText(await f.text());
  };

  const submit = () => {
    setError(null);
    upload.mutate(text, {
      onSuccess: (r) => onUploaded?.(r),
      onError: (e) => setError(errorMessage(e)),
    });
  };

  const found = result ? result.botEvents + result.referralEvents : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          id={fileId}
          type="file"
          accept=".log,.txt,.jsonl,.json,text/plain,application/json"
          className="sr-only"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Button size="sm" icon={FileUp} onClick={() => inputRef.current?.click()}>
          {U.chooseFile}
        </Button>
        {file ? (
          <span className="min-w-0 truncate font-mono text-xs text-text-muted">
            {file.name} · {bytes(file.size)}
          </span>
        ) : (
          <span className="text-xs text-text-subtle">{U.orPaste}</span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setFile(null);
            upload.reset();
            setText(sampleLog());
          }}
          className="text-xs font-medium text-accent hover:underline"
        >
          {U.sample}
        </button>
      </div>
      <Textarea
        label={U.title}
        hideLabel
        mono
        rows={rows}
        value={text}
        placeholder={U.placeholder}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          setFile(null);
          if (result) upload.reset();
        }}
        className="text-[12px] leading-[18px]"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" icon={FileUp} loading={upload.isPending} disabled={!text.trim()} onClick={submit}>
          {upload.isPending ? U.reading : U.submit}
        </Button>
        {error ? (
          <p role="alert" className="flex items-start gap-1.5 text-[13px] text-danger">
            <XCircle size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
            {error}
          </p>
        ) : result ? (
          <p role="status" className={`flex items-start gap-1.5 text-[13px] ${found ? 'text-success' : 'text-text-muted'}`}>
            {found ? <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" /> : <Info size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />}
            {found
              ? fmt(U.result, { parsed: num(result.parsed), bots: num(result.botEvents), referrals: num(result.referralEvents), skipped: num(result.skipped) })
              : U.nothingFound}
          </p>
        ) : (
          <p className="text-xs text-text-subtle">{U.limits}</p>
        )}
      </div>
    </div>
  );
}
