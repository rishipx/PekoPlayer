self.onmessage = async function (e) {
  const msg = e.data;
  if (msg.type !== 'encode') return;
  try {
    const canvas = new OffscreenCanvas(msg.width, msg.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(msg.bitmap, 0, 0, msg.width, msg.height);
    msg.bitmap.close();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: msg.quality || 0.72 });
    self.postMessage({
      requestId: msg.requestId,
      type: 'encoded',
      ok: true,
      blob: blob,
    });
  } catch (err) {
    self.postMessage({
      requestId: msg.requestId,
      type: 'encoded',
      ok: false,
      error: String(err),
    });
  }
};
