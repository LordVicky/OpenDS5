import type { CSSProperties, JSX } from 'react';
import type { UpdateState } from '../main/update-service';

export type UpdateAction =
  | 'start'
  | 'rebuild'
  | 'dismiss'
  | 'skip'
  | 'restart'
  | 'openReleasePage';

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

export function UpdateToast({
  state,
  onAction,
}: {
  state: UpdateState;
  onAction: (action: UpdateAction) => void;
}): JSX.Element | null {
  if (state.phase === 'idle') return null;

  return (
    <div className="update-toast" role="dialog" aria-label="Update">
      {state.phase === 'offer' && (
        <>
          <div className="update-toast-head">
            <div className="update-toast-glyph" aria-hidden="true">↑</div>
            <div>
              <p className="update-toast-title">Update available</p>
              <p className="update-toast-sub">
                {state.version} · {megabytes(state.sizeBytes)}
              </p>
            </div>
          </div>
          {state.notes.trim().length > 0 && (
            <details className="update-toast-notes">
              <summary>What&rsquo;s new</summary>
              <p>{state.notes}</p>
            </details>
          )}
          <div className="update-toast-actions">
            <button type="button" className="primary" onClick={() => onAction('start')}>
              Update
            </button>
            <button type="button" onClick={() => onAction('dismiss')}>
              Remind me later
            </button>
            {/* Quiet by design: skipping silences this version for good, so it must not
                be the button a user hits by reflex. See .update-toast-actions .quiet. */}
            <button type="button" className="quiet" onClick={() => onAction('skip')}>
              Skip this version
            </button>
          </div>
        </>
      )}

      {state.phase === 'downloading' && (
        <ProgressCard
          title={`Updating to ${state.version}`}
          sub={`Downloading… ${megabytes(state.received)} of ${megabytes(state.total)}`}
          percent={state.total > 0 ? (state.received / state.total) * 100 : 0}
        />
      )}

      {state.phase === 'verifying' && (
        <ProgressCard
          title={`Updating to ${state.version}`}
          sub="Verifying the download…"
          percent={100}
        />
      )}

      {/* No buttons here: the driver rebuild runs on its own and the OS polkit
          password prompt is the confirmation. A second confirm step would be noise. */}
      {state.phase === 'installing' && (
        <ProgressCard
          title={`Installing ${state.version}`}
          sub={state.step}
          percent={state.total > 0 ? ((state.index + 1) / state.total) * 100 : 0}
        />
      )}

      {state.phase === 'restart' && (
        <>
          <div className="update-toast-head">
            <div className="update-toast-glyph ok" aria-hidden="true">✓</div>
            <div>
              <p className="update-toast-title">Update ready</p>
              <p className="update-toast-sub">{state.version} installed. Restart to finish.</p>
            </div>
          </div>
          <div className="update-toast-actions">
            <button type="button" className="primary" onClick={() => onAction('restart')}>
              Restart now
            </button>
            <button type="button" onClick={() => onAction('dismiss')}>
              On next launch
            </button>
          </div>
        </>
      )}

      {state.phase === 'failed' && (
        <>
          <div className="update-toast-head">
            <div className="update-toast-glyph warn" aria-hidden="true">!</div>
            <div>
              <p className="update-toast-title">Update failed</p>
              <p className="update-toast-sub">{state.message}</p>
            </div>
          </div>
          <div className="update-toast-actions">
            {/* A rebuild failure has no pending download left, so start() would do
                nothing — retry has to re-enter at the stage that actually failed. */}
            <button
              type="button"
              className="primary"
              onClick={() => onAction(state.retry === 'rebuild' ? 'rebuild' : 'start')}
            >
              Try again
            </button>
            <button type="button" onClick={() => onAction('dismiss')}>
              Later
            </button>
          </div>
        </>
      )}

      {state.phase === 'readonly' && (
        <>
          <div className="update-toast-head">
            <div className="update-toast-glyph warn" aria-hidden="true">!</div>
            <div>
              <p className="update-toast-title">Update available — {state.version}</p>
              <p className="update-toast-sub">
                OpenDS5 can&rsquo;t replace itself in a read-only folder. Download it and swap the
                file yourself.
              </p>
            </div>
          </div>
          <div className="update-toast-actions">
            <button type="button" className="primary" onClick={() => onAction('openReleasePage')}>
              Open download page
            </button>
            <button type="button" onClick={() => onAction('dismiss')}>
              Later
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ProgressCard({
  title,
  sub,
  percent,
}: {
  title: string;
  sub: string;
  percent: number;
}): JSX.Element {
  return (
    <>
      <div className="update-toast-head">
        <div className="update-toast-glyph" aria-hidden="true">↑</div>
        <div>
          <p className="update-toast-title">{title}</p>
          <p className="update-toast-sub">{sub}</p>
        </div>
      </div>
      <div
        className="update-toast-bar"
        role="progressbar"
        aria-valuenow={Math.round(Math.min(100, Math.max(0, percent)))}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i
          style={{ '--update-progress': Math.min(100, Math.max(0, percent)) / 100 } as CSSProperties}
        />
      </div>
    </>
  );
}
