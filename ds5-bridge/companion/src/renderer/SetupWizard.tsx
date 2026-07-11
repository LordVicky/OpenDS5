import React, { useEffect, useState } from 'react';
import type { SetupProgressEvent } from '../main/setup-service';

type StepState = { desc: string; status: 'pending' | 'running' | 'done' | 'failed' };
export type ProgressState = {
  steps: StepState[];
  logPath: string | null;
  outcome: 'pending' | 'success' | 'reboot' | 'error';
};
export const initialProgress: ProgressState = { steps: [], logPath: null, outcome: 'pending' };

export function reduceProgress(state: ProgressState, e: SetupProgressEvent): ProgressState {
  switch (e.event) {
    case 'plan':
      return {
        ...state,
        logPath: e.log,
        steps: e.steps.map((desc) => ({ desc, status: 'pending' as const })),
      };
    case 'step': {
      const steps = state.steps.map((s, i) =>
        i === e.index
          ? {
              ...s,
              status: (e.status === 'start'
                ? 'running'
                : e.status === 'ok'
                  ? 'done'
                  : 'failed') as StepState['status'],
            }
          : s,
      );
      return { ...state, steps };
    }
    case 'done':
      return { ...state, outcome: e.exit === 0 ? 'success' : e.exit === 6 ? 'reboot' : 'error' };
  }
}

type Screen = 'welcome' | 'review' | 'progress';

export function SetupWizard() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [plan, setPlan] = useState<string[]>([]);
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>(initialProgress);

  useEffect(() => window.setup.onProgress((e) => setProgress((s) => reduceProgress(s, e))), []);

  const isNixos = plan.some((s) => s.includes('opends5-vds.nix'));

  const toReview = async () => {
    const res = await window.setup.getPlan();
    if ('unsupported' in res) setUnsupported(res.unsupported);
    else setPlan(res.steps);
    setScreen('review');
  };
  const startInstall = () => {
    setProgress(initialProgress);
    setScreen('progress');
    void window.setup.install();
  };

  return (
    <div className="setup-window">
      {screen === 'welcome' && (
        <section className="setup-card">
          <h1>Welcome to OpenDS5</h1>
          <p>
            To bridge your DualSense over Bluetooth with full haptics, OpenDS5 installs a kernel
            module and a background service. This needs your administrator password once.
          </p>
          <div className="setup-actions">
            <button onClick={() => void toReview()}>Set up</button>
            <button onClick={() => void window.setup.skip()}>Skip for now</button>
          </div>
        </section>
      )}
      {screen === 'review' && (
        <section className="setup-card">
          <h1>
            {unsupported
              ? 'Unsupported distribution'
              : isNixos
                ? 'NixOS setup'
                : 'Ready to install'}
          </h1>
          {unsupported ? (
            <p>{unsupported}</p>
          ) : (
            <ol className="setup-plan">
              {plan.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          {isNixos && (
            <p>
              NixOS is configured declaratively — OpenDS5 never modifies your system. Copy the
              plan and follow the generated opends5-vds.nix instructions.
            </p>
          )}
          <div className="setup-actions">
            {!unsupported && !isNixos && (
              <button className="install" onClick={startInstall}>
                Install
              </button>
            )}
            {isNixos && (
              <button onClick={() => void navigator.clipboard.writeText(plan.join('\n'))}>
                Copy plan
              </button>
            )}
            <button onClick={() => void window.setup.skip()}>
              {unsupported || isNixos ? 'Continue without install' : 'Skip for now'}
            </button>
          </div>
        </section>
      )}
      {screen === 'progress' && (
        <section className="setup-card">
          <h1>
            {progress.outcome === 'pending' && 'Installing…'}
            {progress.outcome === 'success' && 'All set!'}
            {progress.outcome === 'reboot' && 'Reboot required'}
            {progress.outcome === 'error' && 'Something went wrong'}
          </h1>
          <ul className="setup-steps">
            {progress.steps.map((s) => (
              <li key={s.desc} data-status={s.status}>
                {s.desc}
              </li>
            ))}
          </ul>
          {progress.outcome === 'success' && (
            <>
              <p>Log out and back in once so group permissions apply to game input features.</p>
              <div className="setup-actions">
                <button onClick={() => void window.setup.finish()}>Open OpenDS5</button>
              </div>
            </>
          )}
          {progress.outcome === 'reboot' && (
            <>
              <p>
                Your Secure Boot key was enrolled. Reboot, choose “Enroll MOK” in the blue screen,
                and the driver loads automatically. You can use the app after that.
              </p>
              <div className="setup-actions">
                <button onClick={() => void window.setup.finish()}>Close</button>
              </div>
            </>
          )}
          {progress.outcome === 'error' && (
            <>
              <p>
                The install failed. The full log has details
                {progress.logPath ? ` (${progress.logPath})` : ''}.
              </p>
              <div className="setup-actions">
                <button className="install" onClick={startInstall}>
                  Retry
                </button>
                <button onClick={() => void window.setup.openLog()}>Open log</button>
                <button onClick={() => void window.setup.copyDiagnostics()}>
                  Copy diagnostics
                </button>
                <button onClick={() => void window.setup.skip()}>Skip for now</button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
