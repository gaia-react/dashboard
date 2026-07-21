export const completionAckForAcceptResult = (
  eventId,
  completionType,
  acceptResult
) => {
  const ack = {ok: true, type: completionType};

  if (acceptResult?.handled === true && acceptResult?.carbonize === true) {
    ack.final = false;
    ack.requiresComplete = true;
    ack.nextCommand = `live-complete.mjs --id ${eventId}`;
    ack.message =
      'Carbonize cleanup must be verified, then the session must be completed explicitly before polling again.';
  }

  return ack;
};

export const completionTypeForAcceptResult = (eventType, acceptResult) => {
  if (eventType === 'discard')
    return acceptResult?.handled === true ? 'discarded' : 'error';
  if (acceptResult?.handled === true && acceptResult?.carbonize === true)
    return 'agent_done';
  if (acceptResult?.handled === true) return 'complete';
  if (acceptResult?.mode === 'error') return 'error';
  if (
    eventType === 'accept' &&
    acceptResult?.previewMode === 'svelte-component'
  )
    return 'error';

  return 'agent_done';
};
