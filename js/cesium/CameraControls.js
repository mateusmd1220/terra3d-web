// Controles de câmera de alto nível: voos suaves, vistas pré-definidas, órbita, rotação do
// globo e "voo livre" pelo teclado (WASD). Todos os alvos levam em conta o exagero vertical:
// o ponto focado está na altura VISUAL (real × exagero).

const C = Cesium;
const toRad = C.Math.toRadians;

export class CameraControls {
  constructor(view, { source, getExag }) {
    this.view = view;
    this.camera = view.camera;
    this.scene = view.scene;
    this.source = source;
    this.getExag = getExag;
    this.orbit = null; // { target: Cartesian3 } | { spin: true }
    this.keys = new Set();
    this.onChange = null;
    this._lastTime = performance.now();

    this.scene.preRender.addEventListener(() => this._tick());
    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
    window.addEventListener('blur', () => this.keys.clear());
    // interação do usuário interrompe a órbita
    const canvas = this.scene.canvas;
    canvas.addEventListener('pointerdown', () => { if (this.orbit && !this.orbit.spin) this.stopOrbit(); });
  }

  // ------------------------------------------------------------------ utilidades
  /** Ponto da superfície no centro da tela (ou null se estiver olhando para o espaço). */
  centerTarget() {
    const canvas = this.scene.canvas;
    const pos = new C.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    return this.view.pickLonLat(pos);
  }

  cameraLonLat() {
    const c = this.camera.positionCartographic;
    return { lon: C.Math.toDegrees(c.longitude), lat: C.Math.toDegrees(c.latitude), height: c.height };
  }

  visualHeight(real) { return real * this.getExag(); }

  // ------------------------------------------------------------------ voos
  flyToPlace(p, duration = 3.2) {
    const exag = this.getExag();
    const focus = p.focus ?? p.elev ?? 0;
    let range = p.range;
    // garante que a câmera fique acima do relevo exagerado ao redor
    const above = Math.max(0, (p.elev ?? 0) - focus) * exag;
    const pitch = p.pitch ?? -35;
    range += above * 1.3 / Math.max(0.25, Math.sin(Math.abs(toRad(pitch))));
    this.flyToPoint(p.lon, p.lat, focus, range, p.heading ?? 0, pitch, duration);
  }

  flyToPoint(lon, lat, realHeight, range, heading = 0, pitch = -40, duration = 3) {
    this.stopOrbit();
    const center = C.Cartesian3.fromDegrees(lon, lat, realHeight * this.getExag());
    this.camera.flyToBoundingSphere(new C.BoundingSphere(center, 1), {
      offset: new C.HeadingPitchRange(toRad(heading), toRad(pitch), range),
      duration,
      easingFunction: C.EasingFunction.QUINTIC_IN_OUT,
    });
  }

  async flyToBBox(west, south, east, north) {
    const lon = (west + east) / 2, lat = (south + north) / 2;
    const w = C.Cartesian3.fromDegrees(west, lat), e = C.Cartesian3.fromDegrees(east, lat);
    const s = C.Cartesian3.fromDegrees(lon, south), n = C.Cartesian3.fromDegrees(lon, north);
    const span = Math.max(C.Cartesian3.distance(w, e), C.Cartesian3.distance(s, n), 8000);
    let elev = 0;
    try { [elev] = await this.source.sampleMany([[lon, lat]], 9); } catch { /* ignore */ }
    const range = span * 1.4 + Math.max(0, elev) * this.getExag() * 1.5;
    this.flyToPoint(lon, lat, Math.max(elev, 0) * 0.5, range, 0, span > 1.5e6 ? -75 : -45);
  }

  globalView() {
    this.stopOrbit();
    const t = this.centerTarget() || this.cameraLonLat();
    this.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(t.lon, C.Math.clamp(t.lat, -60, 60), 2.1e7),
      orientation: { heading: 0, pitch: toRad(-90), roll: 0 },
      duration: 2.5,
    });
  }

  topView() {
    this.stopOrbit();
    const t = this.centerTarget();
    if (!t) return this.globalView();
    const dist = C.Cartesian3.distance(this.camera.positionWC, t.cartesian);
    this.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(t.lon, t.lat, t.height + dist),
      orientation: { heading: this.camera.heading, pitch: toRad(-90), roll: 0 },
      duration: 1.5,
    });
  }

  obliqueView(pitchDeg = -22) {
    this.stopOrbit();
    const t = this.centerTarget();
    if (!t) return;
    const dist = C.Cartesian3.distance(this.camera.positionWC, t.cartesian);
    this.camera.flyToBoundingSphere(new C.BoundingSphere(t.cartesian, 1), {
      offset: new C.HeadingPitchRange(this.camera.heading, toRad(pitchDeg), dist),
      duration: 1.5,
    });
  }

  northUp() {
    this.stopOrbit();
    const t = this.centerTarget();
    if (!t) {
      this.camera.flyTo({ destination: this.camera.positionWC.clone(), orientation: { heading: 0, pitch: this.camera.pitch, roll: 0 }, duration: 1 });
      return;
    }
    const dist = C.Cartesian3.distance(this.camera.positionWC, t.cartesian);
    this.camera.flyToBoundingSphere(new C.BoundingSphere(t.cartesian, 1), {
      offset: new C.HeadingPitchRange(0, this.camera.pitch, dist),
      duration: 1.2,
    });
  }

  /** Inclina a câmera ao redor do ponto central (delta em graus; negativo = mais de cima). */
  tilt(deltaDeg) {
    const t = this.centerTarget();
    if (!t) return;
    const dist = C.Cartesian3.distance(this.camera.positionWC, t.cartesian);
    const pitch = C.Math.clamp(this.camera.pitch + toRad(deltaDeg), toRad(-90), toRad(-2));
    this.camera.flyToBoundingSphere(new C.BoundingSphere(t.cartesian, 1), {
      offset: new C.HeadingPitchRange(this.camera.heading, pitch, dist),
      duration: 0.6,
    });
  }

  zoom(factor) {
    const t = this.centerTarget();
    const dist = t ? C.Cartesian3.distance(this.camera.positionWC, t.cartesian) : this.camera.positionCartographic.height;
    const amount = dist * (1 - factor);
    this.camera.moveForward(amount);
  }

  initialView() {
    // Visão global centrada na América do Sul, como no vídeo de referência.
    this.camera.setView({
      destination: C.Cartesian3.fromDegrees(-58, -16, 1.95e7),
      orientation: { heading: 0, pitch: toRad(-90), roll: 0 },
    });
  }

  // ------------------------------------------------------------------ órbita / rotação
  toggleOrbit() {
    if (this.orbit) { this.stopOrbit(); return false; }
    const t = this.centerTarget();
    const far = this.camera.positionCartographic.height > 4.0e6;
    this.orbit = !t || far ? { spin: true } : { target: t.cartesian };
    this.onChange?.();
    return true;
  }

  stopOrbit() {
    if (!this.orbit) return;
    this.orbit = null;
    this.camera.lookAtTransform(C.Matrix4.IDENTITY);
    this.onChange?.();
  }

  // ------------------------------------------------------------------ teclado
  _key(e, down) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    const flyKeys = ['w', 'a', 's', 'd', 'q', 'e', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'];
    if (flyKeys.includes(k)) {
      if (down) this.keys.add(k); else this.keys.delete(k);
      e.preventDefault();
    }
    if (k === 'shift') { if (down) this.keys.add('shift'); else this.keys.delete('shift'); }
  }

  _tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._lastTime) / 1000);
    this._lastTime = now;
    const cam = this.camera;

    if (this.orbit) {
      if (this.orbit.spin) {
        cam.rotate(C.Cartesian3.UNIT_Z, -dt * 0.08);
      } else {
        const tr = C.Transforms.eastNorthUpToFixedFrame(this.orbit.target);
        cam.lookAtTransform(tr);
        cam.rotate(C.Cartesian3.UNIT_Z, -dt * 0.12);
        cam.lookAtTransform(C.Matrix4.IDENTITY);
      }
    }

    if (!this.keys.size || (this.keys.size === 1 && this.keys.has('shift'))) return;
    this.stopOrbit();
    const carto = cam.positionCartographic;
    const lon = C.Math.toDegrees(carto.longitude), lat = C.Math.toDegrees(carto.latitude);
    const ground = (this.source.sampleCached(lon, lat)?.h ?? 0) * this.getExag();
    const above = Math.max(80, carto.height - ground);
    const speed = above * 0.7 * (this.keys.has('shift') ? 4 : 1);
    const step = speed * dt;
    const up = C.Ellipsoid.WGS84.geodeticSurfaceNormal(cam.positionWC, new C.Cartesian3());
    // direção horizontal (projeção da direção de visada no plano tangente)
    const dir = cam.directionWC;
    const fwd = C.Cartesian3.subtract(dir, C.Cartesian3.multiplyByScalar(up, C.Cartesian3.dot(dir, up), new C.Cartesian3()), new C.Cartesian3());
    if (C.Cartesian3.magnitude(fwd) < 1e-6) C.Cartesian3.clone(cam.upWC, fwd);
    C.Cartesian3.normalize(fwd, fwd);
    const right = C.Cartesian3.normalize(C.Cartesian3.cross(fwd, up, new C.Cartesian3()), new C.Cartesian3());

    if (this.keys.has('w')) cam.move(fwd, step);
    if (this.keys.has('s')) cam.move(fwd, -step);
    if (this.keys.has('d')) cam.move(right, step);
    if (this.keys.has('a')) cam.move(right, -step);
    if (this.keys.has('e')) cam.move(up, step);
    if (this.keys.has('q')) cam.move(up, -Math.min(step, above * 0.9 * dt * 2));
    const turn = dt * 0.9;
    if (this.keys.has('arrowleft')) cam.look(up, -turn);
    if (this.keys.has('arrowright')) cam.look(up, turn);
    if (this.keys.has('arrowup')) cam.lookUp(turn * 0.6);
    if (this.keys.has('arrowdown')) cam.lookDown(turn * 0.6);
  }
}
