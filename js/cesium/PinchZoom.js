// Zoom por toque no estilo Google Maps, substituindo o zoom de pinça do Cesium (lento e limitado
// a ~10% da tela por evento).
// - Pinça: o zoom segue a razão entre as distâncias dos dedos (abrir 2× = aproximar 2×) e mira o
//   ponto entre os dedos, que fica parado sob eles. Ao soltar, continua um pouco por inércia.
// - Duplo toque: aproxima 2× no ponto tocado.
// A inclinação e o giro com dois dedos continuam com o Cesium (PINCH em tiltEventTypes).

const C = Cesium;

export class PinchZoom {
  constructor(view, { canDoubleTap = () => true } = {}) {
    this.view = view;
    this.scene = view.scene;
    this.camera = view.camera;
    this.ssc = this.scene.screenSpaceCameraController;
    this.canDoubleTap = canDoubleTap;
    this.pointers = new Map();
    this.pinch = null;      // { dist, mid }
    this.pending = 1;       // razão acumulada até o próximo quadro
    this.samples = [];      // [{t, log}] para a velocidade da inércia
    this.anim = null;       // { v, pos } inércia, ou { left, total, pos } duplo toque
    this.lastTap = null;

    const canvas = this.scene.canvas;
    const opts = { capture: true, passive: true };
    canvas.addEventListener('pointerdown', (e) => this._down(e), opts);
    canvas.addEventListener('pointermove', (e) => this._move(e), opts);
    for (const t of ['pointerup', 'pointercancel']) canvas.addEventListener(t, (e) => this._up(e), opts);
    this.scene.preRender.addEventListener(() => this._frame());
  }

  _pos(e) {
    const r = this.scene.canvas.getBoundingClientRect();
    return new C.Cartesian2(e.clientX - r.left, e.clientY - r.top);
  }

  _down(e) {
    if (e.pointerType !== 'touch') return;
    this.anim = null;
    const p = this._pos(e);
    this.pointers.set(e.pointerId, { p, start: p, t: performance.now() });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: C.Cartesian2.distance(a.p, b.p), mid: C.Cartesian2.lerp(a.p, b.p, 0.5, new C.Cartesian2()) };
      this.pending = 1;
      this.samples = [];
      this.lastTap = null;
    }
  }

  _move(e) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    ptr.p = this._pos(e);
    if (!this.pinch || this.pointers.size !== 2) return;
    const [a, b] = [...this.pointers.values()];
    const dist = C.Cartesian2.distance(a.p, b.p);
    if (dist < 10 || this.pinch.dist < 10) return;
    const ratio = this.pinch.dist / dist; // < 1 aproxima
    this.pinch.dist = dist;
    C.Cartesian2.lerp(a.p, b.p, 0.5, this.pinch.mid);
    this.pending *= ratio;
    const now = performance.now();
    this.samples.push({ t: now, log: Math.log(ratio) });
    while (this.samples.length && now - this.samples[0].t > 120) this.samples.shift();
  }

  _up(e) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    this.pointers.delete(e.pointerId);
    const now = performance.now();

    if (this.pinch && this.pointers.size < 2) {
      // aplica o que sobrou do último movimento antes do próximo quadro
      if (this.pending !== 1) { this._zoomAt(this.pinch.mid, this.pending); this.pending = 1; }
      // inércia: continua na velocidade dos últimos ~120 ms e desacelera
      const s = this.samples.filter((x) => now - x.t < 120);
      if (s.length >= 2) {
        const span = Math.max(16, now - s[0].t);
        const v = s.reduce((acc, x) => acc + x.log, 0) / span; // log(razão) por ms
        if (Math.abs(v) > 0.0004) this.anim = { v: Math.max(-0.006, Math.min(0.006, v)), pos: C.Cartesian2.clone(this.pinch.mid) };
      }
      this.pinch = null;
      this.samples = [];
      this.pointers.clear(); // o dedo que sobrou não vira um "toque"
      return;
    }

    // duplo toque (dedo único, curto e parado) => aproxima 2× no ponto
    const quick = now - ptr.t < 250 && C.Cartesian2.distance(ptr.p, ptr.start) < 12;
    if (!quick || this.pointers.size) { this.lastTap = null; return; }
    const lt = this.lastTap;
    if (lt && now - lt.t < 300 && C.Cartesian2.distance(lt.p, ptr.p) < 40 && this.canDoubleTap()) {
      this.anim = { total: Math.log(0.5), left: 260, dur: 260, pos: C.Cartesian2.clone(ptr.p) };
      this.lastTap = null;
    } else {
      this.lastTap = { t: now, p: ptr.p };
    }
  }

  _frame() {
    const now = performance.now();
    const dt = Math.min(50, now - (this._lastFrame || now));
    this._lastFrame = now;

    if (this.pinch && this.pending !== 1) {
      this._zoomAt(this.pinch.mid, this.pending);
      this.pending = 1;
      return;
    }
    const a = this.anim;
    if (!a || this.pinch) return;
    if (a.v !== undefined) {
      this._zoomAt(a.pos, Math.exp(a.v * dt));
      a.v *= Math.pow(0.9, dt / 16);
      if (Math.abs(a.v) < 0.00005) this.anim = null;
    } else {
      // duplo toque: curva suave (ease-out) ao longo de `dur` ms
      const step = Math.min(dt || 16, a.left);
      const before = 1 - Math.pow(a.left / a.dur, 3);
      a.left -= step;
      const after = 1 - Math.pow(a.left / a.dur, 3);
      this._zoomAt(a.pos, Math.exp(a.total * (after - before)));
      if (a.left <= 0) this.anim = null;
    }
  }

  /** Aproxima (ratio < 1) ou afasta (ratio > 1) mantendo o ponto da tela `pos` parado. */
  _zoomAt(pos, ratio) {
    const cam = this.camera, scene = this.scene;
    const height = cam.positionCartographic.height;
    // limites de altura: os mesmos do controlador do Cesium
    const maxH = this.ssc.maximumZoomDistance, minH = this.ssc.minimumZoomDistance;
    if (ratio > 1 && height * ratio > maxH) ratio = Math.max(1, maxH / Math.max(height, 1));
    if (ratio === 1) return;

    const ray = cam.getPickRay(pos);
    let target = ray && scene.globe.pick(ray, scene);
    if (!target) target = cam.pickEllipsoid(pos, scene.globe.ellipsoid);
    if (!target) {
      // apontando para o espaço: aproxima/afasta pela altura, na direção da câmera
      const d = height * (1 - ratio);
      if (d > 0) cam.moveForward(d); else cam.moveBackward(-d);
      return;
    }
    const offset = C.Cartesian3.subtract(cam.positionWC, target, new C.Cartesian3());
    const dist = C.Cartesian3.magnitude(offset);
    if (ratio < 1 && dist * ratio < minH) ratio = Math.min(1, minH / Math.max(dist, 1));
    if (ratio === 1) return;
    C.Cartesian3.multiplyByScalar(offset, ratio, offset);
    // a direção da câmera não muda: o alvo continua sob os dedos
    cam.position = C.Cartesian3.add(target, offset, new C.Cartesian3());
  }
}
