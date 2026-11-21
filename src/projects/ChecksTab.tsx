import { useMemo } from 'preact/hooks';
import {
  type IssueLevel,
  type ProjectDocument,
  errorCount,
  validateProject,
  warningCount,
} from '../core/project';
import { t } from '../i18n';
import { IconCheck } from '../ui/icons';

interface ChecksTabProps {
  doc: ProjectDocument;
  onOpenDevice: (deviceId: string) => void;
}

const LEVEL_BADGE: Record<IssueLevel, string> = {
  error: 'badge-danger',
  warning: 'badge-warn',
  info: 'badge-neutral',
};

export function ChecksTab({ doc, onOpenDevice }: ChecksTabProps) {
  const issues = useMemo(() => validateProject(doc), [doc]);
  const errors = errorCount(issues);
  const warnings = warningCount(issues);
  const infos = issues.length - errors - warnings;

  return (
    <div class="stack">
      <section class="card card-pad">
        <div class="section-title">
          <span>{t('checks.title')}</span>
        </div>
        <div class="plan-summary">
          <div class="kv">
            <div class="kv-label">{t('checks.errors')}</div>
            <div class="kv-value">
              <strong style={{ color: errors > 0 ? 'var(--danger)' : 'var(--ok)' }}>{errors}</strong>
            </div>
          </div>
          <div class="kv">
            <div class="kv-label">{t('checks.warnings')}</div>
            <div class="kv-value">
              <strong style={{ color: warnings > 0 ? 'var(--warn)' : undefined }}>{warnings}</strong>
            </div>
          </div>
          <div class="kv">
            <div class="kv-label">{t('checks.info')}</div>
            <div class="kv-value">{infos}</div>
          </div>
        </div>
      </section>

      <section class="card">
        {issues.length === 0 ? (
          <div class="issue-ok">
            <IconCheck size={18} />
            {t('checks.ok')}
          </div>
        ) : (
          <div>
            {issues.map((issue) => (
              <div
                class="issue-row"
                key={issue.id}
                onClick={() => {
                  if (issue.deviceId) onOpenDevice(issue.deviceId);
                }}
                style={{ cursor: issue.deviceId ? 'pointer' : 'default' }}
              >
                <span class={`badge ${LEVEL_BADGE[issue.level]} issue-level`}>
                  {t(`checks.level.${issue.level}`)}
                </span>
                <span style={{ flex: 1 }}>{issue.message}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
