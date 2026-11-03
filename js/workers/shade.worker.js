import { shadeTile } from '../render/shade.js';

self.onmessage = (ev) => {
  const { id, heights, cols, rows, geo, style } = ev.data;
  try {
    const rgba = shadeTile(heights, cols, rows, geo, style);
    self.postMessage({ id, rgba }, [rgba.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
