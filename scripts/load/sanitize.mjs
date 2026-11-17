// Diagnostic strings only. Avoid collecting actual credentials/player payloads;
// this is a final guard for exception/assertion text, not an arbitrary data scrubber.
export function sanitizeDiagnostic(value) {
  let text = String(value ?? '');
  text = text.replace(/(?:https?|wss?):\/\/[^\s"']+/gi, '[redacted-url]');
  const sensitiveKey = '(?:requestId|requestPrefix|serverInstanceId|tabId|candidateId|submittedText|password|authorization|ownerLink|privateUrl|accessUrl|[a-z]*token|[a-z]*cookies?|[a-z]*credentials?|secret)';
  const jsonField = new RegExp('("' + sensitiveKey + '"\\s*:\\s*)("(?:\\\\.|[^"\\\\])*"|[^,}\\]\\s]+)', 'gi');
  text = text.replace(jsonField, '$1"[redacted]"');
  text = text.replace(/\b(cookie|authorization|password|credential|token|secret)\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'[^']*'|[^\r\n,}]+)/gi, '$1=[redacted]');
  return text.slice(0, 300);
}
