import { useState } from 'react';
import type { QuizQuestion } from '../../curriculum/types';
import { renderInline } from '../Markdown';

export function Quiz({ questions, passed, onPass }: { questions: QuizQuestion[]; passed: boolean; onPass: () => void }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState(false);
  const allAnswered = questions.every((q) => answers[q.id] !== undefined);
  const correct = questions.filter((q) => answers[q.id] === q.answer).length;

  const check = () => {
    setChecked(true);
    if (correct === questions.length) onPass();
  };

  return (
    <div>
      {passed ? <div className="notice success">Check for understanding passed.</div> : null}
      {questions.map((q, qi) => {
        const chosen = answers[q.id];
        const isCorrect = chosen === q.answer;
        return (
          <div key={q.id} className="quiz-q">
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              {qi + 1}. {renderInline(q.question)}
            </div>
            {q.choices.map((c, ci) => (
              <label key={ci}>
                <input
                  type="radio"
                  name={q.id}
                  checked={chosen === ci}
                  onChange={() => {
                    setAnswers({ ...answers, [q.id]: ci });
                    setChecked(false);
                  }}
                />{' '}
                {c}
              </label>
            ))}
            {checked && chosen !== undefined ? (
              <div className={`explanation ${isCorrect ? 'correct' : 'incorrect'}`}>
                <strong>{isCorrect ? 'Correct.' : 'Not quite.'}</strong> {renderInline(q.explanation)}
              </div>
            ) : null}
          </div>
        );
      })}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" disabled={!allAnswered} onClick={check}>
          Check answers
        </button>
        {checked ? (
          <span className="small muted">
            {correct} / {questions.length} correct{correct < questions.length ? ' — adjust your answers and check again.' : ''}
          </span>
        ) : null}
      </div>
    </div>
  );
}
