import type {FC} from 'react';
import {twJoin} from 'tailwind-merge';
import Icon from '~/components/Icon';
import {colorTransition, focusRing} from '~/styles/class-names';

/** The `github` reference carried by a command row or an execute phase. */
export type ArtifactRef = {
  number: number;
  repo: string;
  /** `"pr"` or `"issue"` today; `z.string()` upstream, so it can grow. */
  type: string;
};

const ISSUE_TYPE = 'issue';

/**
 * `https://github.com/{repo}/{issues|pull}/{number}` (DESIGN-SPEC C-16).
 *
 * `repo` is read from the record and never hardcoded: this dashboard runs
 * against whatever project it is pointed at.
 *
 * Anything that is not exactly `issue` builds a `pull` URL. `type` is
 * `z.string()` and the upstream vocabulary can grow, and `pull` is the safe
 * default: `gaia-forensics` is the only command that passes
 * `--github-type issue`, every other command passes `pr`.
 */
export const artifactHref = ({number, repo, type}: ArtifactRef): string =>
  `https://github.com/${repo}/${type === ISSUE_TYPE ? 'issues' : 'pull'}/${number}`;

/** `PR #769` or `Issue #412`, so forensics needs no special case beyond
 * reading the record's own `type`. */
export const artifactLabel = ({number, type}: ArtifactRef): string =>
  `${type === ISSUE_TYPE ? 'Issue' : 'PR'} #${number}`;

type Props = {
  artifact: ArtifactRef;
};

/**
 * The outbound PR or issue link (DESIGN-SPEC C-16). Rendered only when the
 * record carries a `github` reference: 4 of 33 `gaia-debt` rows carry none,
 * and those render no link rather than a disabled one.
 */
const ArtifactLink: FC<Props> = ({artifact}) => (
  <a
    className={twJoin(
      'text-accent text-label hover:text-accent-soft inline-flex items-center gap-1 rounded-sm underline-offset-2 hover:underline',
      colorTransition,
      focusRing
    )}
    href={artifactHref(artifact)}
    rel="noreferrer"
    target="_blank"
  >
    {artifactLabel(artifact)}
    <Icon name="externalLink" size={14} />
  </a>
);

export default ArtifactLink;
