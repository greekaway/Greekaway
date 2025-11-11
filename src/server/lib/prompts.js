'use strict';
function buildLiveRulesPrompt() {
  return [
    'Live-data usage rules:',
    '- If a system message titled "Live data context" is present, you MUST use it to answer questions about weather or news.',
    '- Do not say you lack access to weather or news; use the provided context to answer succinctly.',
    '- Keep answers short and relevant to Greek travel and Greekaway.',
  ].join('\n');
}
module.exports = { buildLiveRulesPrompt };
