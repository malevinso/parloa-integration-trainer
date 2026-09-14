import { modules } from '../../curriculum/modules';
import { labScenarioIds } from '../../core/simulator/scenarios';
import { useApp } from '../../state/AppContext';
import { href } from '../router';

export function Dashboard() {
  const { state, getProgress } = useApp();
  const completed = modules.filter((m) => getProgress(m.id).status === 'completed').length;
  const labsPassed = modules.filter((m) => getProgress(m.id).labPassed).length;
  const capstone = modules[modules.length - 1];
  const capstoneResults = getProgress(capstone.id).scenarioResults;
  const labScenariosPassed = labScenarioIds.filter((id) => capstoneResults[id]).length;

  const lastId = state.progress.lastModuleId;
  const lastModule = modules.find((m) => m.id === lastId);
  const nextIncomplete = modules.find((m) => getProgress(m.id).status !== 'completed');
  const continueTarget = lastModule && getProgress(lastModule.id).status !== 'completed' ? lastModule : (nextIncomplete ?? modules[0]);
  const pct = Math.round((completed / modules.length) * 100);
  const started = modules.some((m) => getProgress(m.id).status !== 'not_started');

  return (
    <main className="page">
      <section className="hero">
        <div className="row between">
          <div style={{ maxWidth: 760 }}>
            <h1>Learn how conversational agents talk to business systems</h1>
            <p>
              A hands-on course for integration architects: configure a customer-service agent that finds a customer, verifies who is calling, retrieves
              their orders, clarifies which one they mean and explains its status — against four practice APIs, with a deterministic conversation
              simulator and graded scenario tests. Parloa-specific lessons are grounded in Parloa's public material and clearly separated from general
              integration practice and from this trainer's own simulation.
            </p>
            <div className="row">
              <a className="btn primary" href={href(`/module/${continueTarget.id}`)}>
                {started ? `Continue: ${continueTarget.order}. ${continueTarget.title}` : `Start: ${continueTarget.order}. ${continueTarget.title}`}
              </a>
              <a className="btn" href={href('/concepts')}>
                How this maps to Parloa
              </a>
              <a className="btn" href={href('/systems')}>
                Practice system docs
              </a>
            </div>
          </div>
          <div className="card flat" style={{ minWidth: 240 }}>
            <h4>Progress</h4>
            <div className="stat">
              {completed} / {modules.length}
            </div>
            <div className="small muted" style={{ marginBottom: 8 }}>
              modules completed · {labsPassed} labs passed
            </div>
            <div className="progress-bar">
              <div style={{ width: `${pct}%` }} />
            </div>
            <div className="small muted" style={{ marginTop: 10 }}>
              Capstone scenarios passing: {labScenariosPassed} / {labScenarioIds.length}
            </div>
          </div>
        </div>
      </section>

      <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <section>
          <h2>Learning path</h2>
          <p className="muted small">
            Each module has an objective, an explanation, a worked example, an executable exercise graded by scenario tests, hints, and a short check
            for understanding. A module is complete when its lab scenarios pass and the check is answered correctly.
          </p>
          <div className="module-list">
            {modules.map((m) => {
              const p = getProgress(m.id);
              const passed = m.exercise.scenarioIds.filter((id) => p.scenarioResults[id]).length;
              return (
                <a key={m.id} className={`module-item ${p.status}`} href={href(`/module/${m.id}`)}>
                  <div className="num">{p.status === 'completed' ? '✓' : m.order}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{m.title}</div>
                    <div className="small muted">{m.subtitle}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="small muted">~{m.estimatedMinutes} min</div>
                    <div className="row" style={{ justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                      <span className={`badge ${p.labPassed ? 'success' : passed > 0 ? 'warning' : ''}`}>
                        lab {passed}/{m.exercise.scenarioIds.length}
                      </span>
                      <span className={`badge ${p.quizPassed ? 'success' : ''}`}>{p.quizPassed ? 'check ✓' : 'check'}</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
        <aside>
          <div className="card">
            <h3>What you will build</h3>
            <p className="small">
              A complete "Where is my order?" workflow that survives seven scripted scenarios: single match, duplicate accounts, failed verification,
              multiple orders, no customer, no orders, and a carrier outage.
            </p>
            <p className="small muted">The verification boundary is enforced by the mock Order Management System itself: without a valid token it answers 403.</p>
          </div>
          <div className="card">
            <h3>Tools</h3>
            <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
              <li>
                <a href={href('/systems')}>Practice systems</a> — API docs, sample payloads, an API explorer, fixtures reset and fault injection.
              </li>
              <li>
                <a href={href('/simulator')}>Simulator</a> — run any of your workflows against a scripted caller, or play the customer yourself.
              </li>
              <li>
                <a href={href('/settings')}>Settings &amp; backup</a> — export/import your progress and drafts as JSON.
              </li>
            </ul>
          </div>
          <div className="card">
            <h3>About accuracy</h3>
            <p className="small">
              Statements about Parloa are limited to what Parloa publishes publicly and are labelled as such. Everything about the workflow format, the
              practice APIs and the scenarios is this trainer's own simulation. See <a href={href('/concepts')}>Parloa concepts &amp; sources</a>.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
