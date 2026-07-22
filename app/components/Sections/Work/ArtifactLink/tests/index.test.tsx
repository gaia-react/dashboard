import {render, screen} from '@testing-library/react';
import {expect, test} from 'vitest';
import ArtifactLink, {
  artifactHref,
  artifactLabel,
} from '~/components/Sections/Work/ArtifactLink';

test('builds a pull URL for a pr artifact', () => {
  expect(artifactHref({number: 769, repo: 'gaia-react/gaia', type: 'pr'})).toBe(
    'https://github.com/gaia-react/gaia/pull/769'
  );
});

test('builds an issues URL for an issue artifact', () => {
  expect(
    artifactHref({number: 412, repo: 'gaia-react/gaia', type: 'issue'})
  ).toBe('https://github.com/gaia-react/gaia/issues/412');
});

// `type` is z.string() upstream and the vocabulary can grow, so an
// unrecognized value must still produce a working link.
test('falls back to pull for an unrecognized artifact type', () => {
  expect(
    artifactHref({number: 5, repo: 'gaia-react/gaia', type: 'discussion'})
  ).toBe('https://github.com/gaia-react/gaia/pull/5');
});

test('reads the repo from the record rather than hardcoding one', () => {
  expect(
    artifactHref({number: 1, repo: 'acme/other-project', type: 'pr'})
  ).toBe('https://github.com/acme/other-project/pull/1');
});

test('labels a pr and an issue distinctly', () => {
  expect(artifactLabel({number: 769, repo: 'a/b', type: 'pr'})).toBe('PR #769');
  expect(artifactLabel({number: 412, repo: 'a/b', type: 'issue'})).toBe(
    'Issue #412'
  );
  expect(artifactLabel({number: 5, repo: 'a/b', type: 'discussion'})).toBe(
    'PR #5'
  );
});

test('renders an external link that opens safely in a new tab', () => {
  render(
    <ArtifactLink
      artifact={{number: 769, repo: 'gaia-react/gaia', type: 'pr'}}
    />
  );

  const link = screen.getByRole('link', {name: /PR #769/u});

  expect(link).toHaveAttribute(
    'href',
    'https://github.com/gaia-react/gaia/pull/769'
  );
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noreferrer');
  expect(screen.getByTestId('icon-externalLink')).toBeInTheDocument();
});

test('carries a visible focus ring and a reduced-motion-safe transition', () => {
  render(
    <ArtifactLink
      artifact={{number: 412, repo: 'gaia-react/gaia', type: 'issue'}}
    />
  );

  const link = screen.getByRole('link', {name: /Issue #412/u});

  expect(link).toHaveClass('focus-visible:outline-accent');
  expect(link).toHaveClass('focus-visible:outline-offset-2');
  expect(link).toHaveClass('motion-reduce:transition-none');
});
