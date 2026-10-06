/**
 * T4 / T9 / T10 taken from a screen's real state, not from a guess.
 *
 * The three late stages cannot be instrumented from the navigation layer,
 * because only the screen knows when its own content became meaningful. These
 * hooks read the flags the screen already renders from, so the trace cannot
 * drift away from what the user is actually looking at — if the summary says
 * the skeleton cleared at 900ms, the skeleton cleared at 900ms.
 */
import { useEffect, useRef } from 'react';

import { perfAnnotate, perfMark, perfNote } from '@/src/perf/wiezPerf';

/**
 * Report when a screen's loading flag clears (T10).
 *
 * Pass the exact boolean that decides whether a skeleton is on screen. Not a
 * derived "is the data probably there" — the flag itself, or the measurement
 * describes a skeleton other than the one the user saw.
 *
 * A screen that opens on cached content never shows a skeleton at all. That is
 * the goal state, not a missing measurement, so it is recorded as `no_skeleton`
 * and T10 is reported at the first render rather than left blank: the question
 * "when did the user stop seeing a placeholder" has the answer "never".
 */
export function useSkeletonTiming(loading: boolean, label: string): void {
  const sawSkeletonRef = useRef(false);
  const settledRef = useRef(false);

  useEffect(() => {
    if (settledRef.current) return;

    if (loading) {
      if (!sawSkeletonRef.current) {
        sawSkeletonRef.current = true;
        perfNote('RENDER', 'skeleton_shown', label);
      }
      return;
    }

    settledRef.current = true;
    if (!sawSkeletonRef.current) perfAnnotate('no_skeleton');
    perfMark('skeleton_removed', {
      detail: sawSkeletonRef.current ? label : `${label}:never_shown`,
    });
  }, [label, loading]);
}

/**
 * Report the first render that puts real content on screen (T4).
 *
 * `hasMeaningfulContent` must be true only when the user can see something
 * that is theirs — a profile name, a row, a card. A mounted shell with a
 * spinner in it is T3, and conflating the two is precisely the confusion the
 * T-numbers exist to prevent.
 */
export function useFirstMeaningfulRender(
  hasMeaningfulContent: boolean,
  label: string,
): void {
  const reportedRef = useRef(false);

  useEffect(() => {
    if (reportedRef.current || !hasMeaningfulContent) return;
    reportedRef.current = true;
    perfMark('first_meaningful_render', { detail: label });
  }, [hasMeaningfulContent, label]);
}

/** Report that primary data reached state (T9). */
export function useDataUsable(hasData: boolean, label: string): void {
  const reportedRef = useRef(false);

  useEffect(() => {
    if (reportedRef.current || !hasData) return;
    reportedRef.current = true;
    perfMark('data_usable', { detail: label });
  }, [hasData, label]);
}
