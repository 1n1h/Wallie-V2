import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { ACADEMY, TOTAL_LESSONS } from "../../config/academy.js";
import "./Education.css";

export default function EducationPage() {
  const [started, setStarted] = useState({});

  const start = (key) => setStarted((s) => ({ ...s, [key]: true }));

  return (
    <div className="edu-page">
      <header className="edu-head">
        <h1><GraduationCap size={30} /> Wallie Academy</h1>
        <p className="edu-sub">
          Trading school, from your first candle to a professional routine. {TOTAL_LESSONS} lessons,
          a quiz at the end of every level, and Wallie one tap away whenever a lesson needs explaining.
        </p>
        <div className="edu-progress">
          <div className="edu-progress-bar"><div className="edu-progress-fill" style={{ width: "0%" }} /></div>
          <span>0 of {TOTAL_LESSONS} lessons</span>
        </div>
      </header>

      {ACADEMY.map((level) => (
        <section key={level.level} className="edu-level">
          <h2>
            Level {level.level} — {level.name} <span>{level.sub}</span>
          </h2>
          <div className="edu-grid">
            {level.lessons.map((lesson) => {
              const key = `lesson-${lesson.n}`;
              const isSoon = !!started[key];
              return (
                <article key={key} className="edu-card">
                  <img src={lesson.cover} alt="" loading="lazy" />
                  <div className="edu-card-body">
                    <h3>{lesson.n} {lesson.title}</h3>
                    <p>{lesson.brief}</p>
                    <button className="edu-start" disabled={isSoon} onClick={() => start(key)}>
                      {isSoon ? "Coming soon" : "Start"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="edu-quiz">
            <span>Level {level.level} Quiz — pass it to close the level</span>
            <button
              className="edu-start edu-start-light"
              disabled={!!started[`quiz-${level.level}`]}
              onClick={() => start(`quiz-${level.level}`)}
            >
              {started[`quiz-${level.level}`] ? "Coming soon" : "Start"}
            </button>
          </div>
        </section>
      ))}

      <div className="edu-quiz edu-grad">
        <span>Graduation — the final exam across all six levels</span>
        <button
          className="edu-start edu-start-light"
          disabled={!!started.grad}
          onClick={() => start("grad")}
        >
          {started.grad ? "Coming soon" : "Start"}
        </button>
      </div>
    </div>
  );
}
