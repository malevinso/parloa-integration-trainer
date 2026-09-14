import type { TranscriptLine } from '../../core/engine/types';

export function Transcript({ lines, emptyText = 'No conversation yet.' }: { lines: TranscriptLine[]; emptyText?: string }) {
  if (!lines.length) return <p className="muted small">{emptyText}</p>;
  return (
    <div className="transcript">
      {lines.map((l, i) => (
        <div key={i} className={`bubble ${l.role}`} title={l.stepId ? `step: ${l.stepId}` : undefined}>
          <div className="who">
            {l.role === 'agent' ? 'Agent' : l.role === 'customer' ? 'Customer' : 'System'}
            {l.stepId ? <span className="muted"> · {l.stepId}</span> : null}
          </div>
          {l.text}
        </div>
      ))}
    </div>
  );
}
