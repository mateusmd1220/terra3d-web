// Pool simples de Web Workers com despacho para o worker menos ocupado.
export class WorkerPool {
  constructor(url, size) {
    this.workers = [];
    this.pending = new Map();
    this.nextId = 1;
    for (let i = 0; i < size; i++) {
      const w = new Worker(url, { type: 'module' });
      w.busy = 0;
      w.onmessage = (ev) => {
        const { id, error } = ev.data;
        const job = this.pending.get(id);
        if (!job) return;
        this.pending.delete(id);
        w.busy--;
        if (error) job.reject(new Error(error));
        else job.resolve(ev.data);
      };
      w.onerror = (ev) => console.error('Worker error', ev.message || ev);
      this.workers.push(w);
    }
  }

  run(message, transfer = []) {
    const id = this.nextId++;
    let best = this.workers[0];
    for (const w of this.workers) if (w.busy < best.busy) best = w;
    best.busy++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      best.postMessage({ ...message, id }, transfer);
    });
  }
}
