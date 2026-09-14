import { conceptMapMarkdown, parloaReferences, verifiedParloaMarkdown } from '../../curriculum/parloaConcepts';
import { Markdown } from '../Markdown';

export function ConceptsPage() {
  return (
    <main className="page narrow">
      <h1>Parloa concepts &amp; sources</h1>
      <p className="muted">
        This page is the accuracy contract of the trainer: what is documented by Parloa (with links), what is general integration practice, and what is
        simulated here.
      </p>
      <div className="card">
        <Markdown text={verifiedParloaMarkdown} />
      </div>
      <div className="card">
        <Markdown text={conceptMapMarkdown} />
      </div>
      <div className="card">
        <h2>All sources</h2>
        <ul>
          {Object.values(parloaReferences).map((r) => (
            <li key={r.url} style={{ marginBottom: 6 }}>
              <a href={r.url} target="_blank" rel="noreferrer">
                {r.title}
              </a>{' '}
              <span className={`badge ${r.kind !== 'external' ? 'parloa' : ''}`}>{r.kind === 'parloa-docs' ? 'Parloa docs' : r.kind === 'parloa-site' ? 'Parloa' : 'external'}</span>
              {r.note ? <div className="small muted">{r.note}</div> : null}
            </li>
          ))}
        </ul>
        <p className="small muted">Sources were checked on 14 September 2026.</p>
      </div>
    </main>
  );
}
