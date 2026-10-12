// Runs a TranscriptIndex off the main thread so large transcripts do not block the page.
// The build puts src/shared/transcript-index.js in front of this file.
const transcriptIndex = new TranscriptIndex();

self.onmessage = (event) => {
  const msg = event.data;
  try {
    if (msg.type === 'index') {
      transcriptIndex.index(msg.cues || []);
      self.postMessage({ requestId: msg.requestId, type: 'indexed', count: transcriptIndex.docs.length });
    } else if (msg.type === 'search') {
      const results = transcriptIndex.search(msg.query, msg.limit || 40);
      self.postMessage({ requestId: msg.requestId, type: 'results', results });
    } else if (msg.type === 'clear') {
      transcriptIndex.index([]);
      self.postMessage({ requestId: msg.requestId, type: 'indexed', count: 0 });
    }
  } catch (err) {
    self.postMessage({ requestId: msg.requestId, type: 'error', error: String(err) });
  }
};
