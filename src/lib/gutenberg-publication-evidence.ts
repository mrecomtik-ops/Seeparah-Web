/** Distinguish genuine automated publication-gate passes from independently
 * documented, source-exact owner promotions. Never invent an automated pass. */
export function summarizeGutenbergPublicationEvidence(
  published: number, automated: number, manual: number,
) {
  if (![published, automated, manual].every(n => Number.isSafeInteger(n) && n >= 0) ||
      automated + manual > published) {
    throw new Error("Inconsistent Gutenberg publication audit counts");
  }
  return {
    published,
    allGatesPassed: automated,
    manuallyReconciled: manual,
    missingIntegrityEvidence: published - automated - manual,
  };
}
