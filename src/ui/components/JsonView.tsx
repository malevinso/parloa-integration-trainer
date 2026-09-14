
/** Compact pretty-printed JSON block. */
export function JsonView({ value, maxHeight = 320 }: { value: unknown; maxHeight?: number }) {
  let text: string;
  if (value === undefined) text = 'undefined';
  else if (typeof value === 'string') text = value;
  else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      text = String(value);
    }
  }
  return (
    <pre style={{ maxHeight, overflow: 'auto', margin: '6px 0' }}>
      <code>{text}</code>
    </pre>
  );
}
