import type {FC} from 'react';
import {twMerge} from 'tailwind-merge';
import AsyncSection from '~/components/AsyncSection';
import EmptyState, {emptyStateClasses} from '~/components/EmptyState';
import {shimmer} from '~/components/Skeleton';
import type {ApiResourceState} from '~/hooks/useApiResource';

type Props = {
  description: string;
  onRetry: () => void;
  state: ApiResourceState<unknown>;
  title: string;
};

/**
 * Phase 4 placeholder for a dashboard section: skeleton while its resource
 * loads, then an intentional placeholder panel. The skeleton renders the
 * exact placeholder text transparently (skeleton-loaders skill), so the
 * swap causes zero layout shift. Phase 5 replaces each SectionSlot with the
 * real section wrapped in AsyncSection.
 */
const SectionSlot: FC<Props> = ({description, onRetry, state, title}) => (
  <AsyncSection
    errorTitle={`${title} unavailable`}
    label={title}
    onRetry={onRetry}
    skeleton={
      <div aria-hidden={true} className={emptyStateClasses.container}>
        <p className={twMerge(emptyStateClasses.title, shimmer)}>{title}</p>
        <p className={twMerge(emptyStateClasses.description, shimmer)}>
          {description}
        </p>
      </div>
    }
    state={state}
  >
    {() => <EmptyState description={description} title={title} />}
  </AsyncSection>
);

export default SectionSlot;
