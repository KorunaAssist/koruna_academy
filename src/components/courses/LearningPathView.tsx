import React, { useMemo, useState } from 'react';
import { Check, Clock, Lock, Play } from 'lucide-react';
import type { Course, UserProgress } from '../../services/db';

export interface PathStep {
  id: string;
  title: string;
  subtitle: string;
  status: 'completed' | 'in_progress' | 'not_started';
  courseId?: string;
  detail: string;
  modules: string[];
}

export interface LearningPathViewProps {
  courses?: Course[];
  userProgress?: UserProgress[];
  onStartStudy?: (course: Course) => void;
}

const pathSteps: PathStep[] = [
  {
    id: 'new-hire',
    title: 'New Hire',
    subtitle: 'Account setup & welcome',
    status: 'completed',
    detail: 'Your account, access, and first-day onboarding items are complete.',
    modules: ['Platform login', 'Profile setup', 'Welcome checklist']
  },
  {
    id: 'orientation',
    title: 'Orientation',
    subtitle: 'Company & culture onboarding',
    status: 'completed',
    detail: 'You have completed the company introduction and culture onboarding track.',
    modules: ['Mission and values', 'Team norms', 'Communication standards']
  },
  {
    id: 'mortgage-basics',
    title: 'Mortgage Basics',
    subtitle: 'Foundations of mortgage lending',
    status: 'completed',
    detail: 'You have finished the core terminology and lending foundations track.',
    modules: ['Loan lifecycle', 'Borrower documents', 'Compliance basics']
  },
  {
    id: 'mortgage-level-1',
    title: 'Mortgage Level 1',
    subtitle: 'Core loan processing skills',
    status: 'completed',
    detail: 'You have completed the processing workflow and production readiness modules.',
    modules: ['File intake', 'Condition tracking', 'Processor handoffs']
  },
  {
    id: 'mortgage-level-2',
    title: 'Mortgage Level 2',
    subtitle: 'Underwriting fundamentals',
    status: 'in_progress',
    detail: 'Continue building underwriting confidence through scenario review and risk checks.',
    modules: ['Income review', 'Asset validation', 'Scenario practice']
  },
  {
    id: 'senior-mortgage-va-loan-specialist',
    title: 'Senior Mortgage: VA Loan Specialist',
    subtitle: 'Unlocks after completing Mortgage Level 2',
    status: 'not_started',
    detail: 'This specialization unlocks after Mortgage Level 2 is complete.',
    modules: ['VA eligibility', 'Residual income', 'Senior specialist assessment']
  }
];

const statusLabels: Record<PathStep['status'], string> = {
  completed: 'Completed',
  in_progress: 'In Progress',
  not_started: 'Not Started'
};

const findMatchingCourse = (step: PathStep, courses: Course[]) => {
  const normalizedTitle = step.title.toLowerCase();
  return courses.find((course) => (
    course.id === step.courseId ||
    course.title.toLowerCase().includes(normalizedTitle) ||
    normalizedTitle.includes(course.title.toLowerCase())
  ));
};

export const LearningPathView: React.FC<LearningPathViewProps> = ({
  courses = [],
  userProgress = [],
  onStartStudy
}) => {
  const [selectedStepId, setSelectedStepId] = useState('mortgage-level-2');
  const selectedStep = pathSteps.find((step) => step.id === selectedStepId) || pathSteps[0];
  const selectedCourse = useMemo(
    () => findMatchingCourse(selectedStep, courses),
    [courses, selectedStep]
  );
  const completedCount = pathSteps.filter((step) => step.status === 'completed').length;
  const progressPercent = Math.round((completedCount / pathSteps.length) * 100);
  const selectedProgress = selectedCourse
    ? userProgress.find((progress) => progress.courseId === selectedCourse.id)?.progressPercent
    : undefined;

  return (
    <section className="koruna-learning-path-page" aria-labelledby="learning-path-title">
      <header className="koruna-learning-path-hero">
        <div>
          <h1 id="learning-path-title">Learning Path</h1>
          <p>Your roadmap from New Hire to Senior Mortgage VA Specialist.</p>
        </div>
        <div className="koruna-learning-path-hero-progress" aria-label={`${progressPercent}% complete`}>
          <span>{progressPercent}%</span>
          <div className="koruna-learning-path-hero-track">
            <div style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </header>

      <div className="koruna-learning-path-list" aria-label="Learning path steps">
        {pathSteps.map((step) => (
          <button
            key={step.id}
            type="button"
            className={`koruna-learning-path-item ${step.status} ${selectedStep.id === step.id ? 'selected' : ''}`}
            aria-pressed={selectedStep.id === step.id}
            onClick={() => setSelectedStepId(step.id)}
          >
            <div className={`koruna-learning-path-icon ${step.status}`} aria-hidden="true">
              {step.status === 'completed' && <Check size={22} strokeWidth={3} />}
              {step.status === 'in_progress' && <Play size={16} fill="currentColor" strokeWidth={0} />}
              {step.status === 'not_started' && <Lock size={15} />}
            </div>

            <div className="koruna-learning-path-copy">
              <h2>{step.title}</h2>
              <p>{step.subtitle}</p>
            </div>

            <span className={`koruna-learning-path-status ${step.status}`}>
              {statusLabels[step.status]}
            </span>
          </button>
        ))}
      </div>

      <aside className={`koruna-learning-path-detail ${selectedStep.status}`}>
        <div className="koruna-learning-path-detail-heading">
          <span className={`koruna-learning-path-detail-icon ${selectedStep.status}`} aria-hidden="true">
            {selectedStep.status === 'completed' && <Check size={18} strokeWidth={3} />}
            {selectedStep.status === 'in_progress' && <Clock size={18} />}
            {selectedStep.status === 'not_started' && <Lock size={16} />}
          </span>
          <div>
            <h2>{selectedStep.title}</h2>
            <p>{selectedStep.detail}</p>
          </div>
        </div>

        <div className="koruna-learning-path-modules">
          {selectedStep.modules.map((module) => (
            <span key={module}>{module}</span>
          ))}
        </div>

        {selectedStep.status === 'in_progress' && (
          <div className="koruna-learning-path-action-row">
            <div>
              <span className="koruna-learning-path-action-label">Current progress</span>
              <strong>{selectedProgress ?? 50}%</strong>
            </div>
            <button
              type="button"
              className="koruna-learning-path-action"
              disabled={!selectedCourse || !onStartStudy}
              onClick={() => {
                if (selectedCourse && onStartStudy) {
                  onStartStudy(selectedCourse);
                }
              }}
            >
              <Play size={15} fill="currentColor" strokeWidth={0} />
              Continue
            </button>
          </div>
        )}
      </aside>
    </section>
  );
};
