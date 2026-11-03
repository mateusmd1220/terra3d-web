// Giro do globo com um dedo quando a câmera está longe (visão de globo).
// O Cesium "agarra" o ponto sob o dedo e o faz seguir o dedo. Perto dos polos e da borda do
// globo a superfície aparece muito inclinada, então um deslize pequeno vira uma rotação enorme.
// Aqui a rotação tem a mesma velocidade em qualquer ponto da tela: a que o Cesium teria no
// centro do globo. Na horizontal gira em torno do eixo da Terra; na vertical, para no polo.
// Abaixo de MIN_HEIGHT o arrasto volta a ser o do Cesium (melhor de perto).

const C = Cesium;
const MIN_HEIGHT = 1.0e6; // m

export class GlobeSpin {
  constructor(view) {
    this.scene = view.scene;
    this.camera = view.camera;
    this.ssc = this.scene.screenSpaceCameraController;
    this.drag = null;   // { id, x, y } dedo ativo
    this.pending = { x: 0, y: 0 };
    this.samples = [];  // [{t, dx, dy}] para a velocidade da inércia
    this.inertia = null; // { vx, vy } px/ms

    const canvas = this.scene.canvas;
    const opts = { capture: true, passive: true };
    canvas.addEventListener('pointerdown', (e) => this._down(e), opts);
    canvas.addEventListener('pointermove', (e) => this._move(e), opts);
    for (const t of ['pointerup', 'pointercancel']) canvas.addEventListener(t, (e) => this._up(e), opts);
    this.scene.preRender.addEventListener(() => this._frame());
    this.touches = new Set();
  }

  _down(e) {
    this.inertia = null;
    if (e.pointerType !== 'touch') { this.ssc.enableRotate = true; return; }
    this.touches.add(e.pointerId);
    if (this.touches.size > 1) { this.drag = null; this.pending.x = this.pending.y = 0; return; } // pinça
    const far = this.camera.positionCartographic.height > MIN_HEIGHT;
    this.ssc.enableRotate = !far;
    this.drag = far ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    this.samples = [];
  }

  _move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX; d.y = e.clientY;
    this.pending.x += dx; this.pending.y += dy;
    const now = performance.now();
    this.samples.push({ t: now, dx, dy });
    while (this.samples.length && now - this.samples[0].t > 100) this.samples.shift();
  }

  _up(e) {
    this.touches.delete(e.pointerId);
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    const now = performance.now();
    const s = this.samples.filter((x) => now - x.t < 100);
    if (s.length >= 2) {
      const span = Math.max(16, now - s[0].t);
      const vx = s.reduce((a, x) => a + x.dx, 0) / span, vy = s.reduce((a, x) => a + x.dy, 0) / span;
      if (Math.hypot(vx, vy) > 0.05) this.inertia = { vx, vy };
    }
    this.samples = [];
  }

  _frame() {
    const now = performance.now();
    const dt = Math.min(50, now - (this._lastFrame || now));
    this._lastFrame = now;
    let { x, y } = this.pending;
    this.pending.x = this.pending.y = 0;
    const inr = this.inertia;
    if (!this.drag && inr) {
      x += inr.vx * dt; y += inr.vy * dt;
      const k = Math.pow(0.9, dt / 16);
      inr.vx *= k; inr.vy *= k;
      if (Math.hypot(inr.vx, inr.vy) < 0.01) this.inertia = null;
    }
    if (x || y) this._rotate(x, y);
  }

  /** Gira o globo seguindo um deslize de (dx, dy) pixels de tela. */
  _rotate(dx, dy) {
    const cam = this.camera;
    const R = this.scene.globe.ellipsoid.maximumRadius;
    const dist = C.Cartesian3.magnitude(cam.positionWC);
    if (dist <= R) return;
    // radianos por pixel = os de um ponto no centro do globo visto de frente
    const fovy = cam.frustum.fovy ?? C.Math.toRadians(60);
    const focal = (this.scene.canvas.clientHeight / 2) / Math.tan(fovy / 2);
    const k = (dist - R) / (R * focal);
    const old = cam.constrainedAxis;
    cam.constrainedAxis = C.Cartesian3.UNIT_Z; // horizontal = longitude; vertical para no polo
    cam.rotateLeft(dx * k);
    cam.rotateDown(dy * k);
    cam.constrainedAxis = old;
  }
}
