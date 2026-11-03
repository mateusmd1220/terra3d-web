// Encapsula um Cesium.Viewer configurado para o Terra 3D: terreno, camada de relevo com
// crossfade ao trocar de estilo, mapas base (relevo/satélite/padrão), camada de análise,
// overlays vetoriais e exagero vertical.
// Usado para a vista principal e para a vista de comparação (tela dividida).

import { CONFIG } from '../config.js';
import { DemTerrainProvider } from './DemTerrainProvider.js';
import { ReliefImageryProvider } from './ReliefImageryProvider.js';
import { VectorImageryProvider } from './VectorImageryProvider.js';

const C = Cesium;

export class GlobeView {
  constructor(container, { source, pool, style, baseMode, interactive = true, creditContainer }) {
    this.source = source;
    this.pool = pool;
    this.style = { ...style };
    this._reliefLayers = [];
    this._analysisLayers = [];
    this._fadeTimers = {};
    this._base = {};
    this.baseMode = null;
    this._overlayLayers = new Map();
    this._terrainKey = null;

    const viewer = new C.Viewer(container, {
      baseLayer: false,
      terrainProvider: new C.EllipsoidTerrainProvider(),
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      skyBox: false,
      creditContainer: creditContainer || document.createElement('div'),
      msaaSamples: CONFIG.msaaSamples,
      orderIndependentTranslucency: false,
      contextOptions: { webgl: { alpha: false, preserveDrawingBuffer: false } },
    });
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.camera = viewer.camera;
    const scene = this.scene, globe = scene.globe;

    scene.backgroundColor = C.Color.fromCssColorString('#000000');
    globe.baseColor = C.Color.fromCssColorString('#140a38');
    globe.showGroundAtmosphere = false;
    globe.enableLighting = false;
    globe.depthTestAgainstTerrain = true;
    globe.maximumScreenSpaceError = 2;
    globe.tileCacheSize = CONFIG.globeTileCacheSize;
    globe.preloadAncestors = true;
    // névoa sem renderização: só reduz o detalhe de tiles distantes (horizonte) => menos downloads
    scene.fog.enabled = true;
    scene.fog.renderable = false;
    scene.fog.screenSpaceErrorFactor = 3;
    if (scene.sun) scene.sun.show = false;
    if (scene.moon) scene.moon.show = false;
    if (!scene.skyAtmosphere) scene.skyAtmosphere = new C.SkyAtmosphere();
    scene.skyAtmosphere.show = false;
    scene.verticalExaggerationRelativeHeight = 0; // exagera em relação ao nível do mar (0 m)
    scene.highDynamicRange = false;

    const ssc = scene.screenSpaceCameraController;
    ssc.minimumZoomDistance = 30;
    ssc.maximumZoomDistance = 9.0e7;
    ssc.enableCollisionDetection = true;
    ssc.inertiaSpin = 0.88;
    ssc.inertiaTranslate = 0.88;
    ssc.inertiaZoom = 0.75;
    // Estilo Google Earth: botão direito arrasta = inclinar/girar; roda = zoom.
    // O zoom de pinça fica com PinchZoom.js (proporcional aos dedos, como o Google Maps).
    ssc.zoomEventTypes = [C.CameraEventType.WHEEL,
      { eventType: C.CameraEventType.RIGHT_DRAG, modifier: C.KeyboardEventModifier.SHIFT }];
    ssc.tiltEventTypes = [C.CameraEventType.MIDDLE_DRAG, C.CameraEventType.RIGHT_DRAG, C.CameraEventType.PINCH,
      { eventType: C.CameraEventType.LEFT_DRAG, modifier: C.KeyboardEventModifier.CTRL }];
    if (!interactive) {
      ssc.enableInputs = false;
    }

    // remove o duplo-clique padrão (zoom na entidade)
    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    this.setTerrain('terrarium', null);
    this.setBaseMode(baseMode || 'relief');
  }

  // ------------------------------------------------------------------ terreno
  async setTerrain(kind, floor, ionToken) {
    const key = `${kind}|${floor}`;
    if (key === this._terrainKey) return;
    this._terrainKey = key;
    if (kind === 'ion' && ionToken) {
      C.Ion.defaultAccessToken = ionToken;
      try {
        this.scene.terrainProvider = await C.CesiumTerrainProvider.fromIonAssetId(CONFIG.ionBathymetryAssetId);
        return;
      } catch (e) {
        console.error('Falha ao carregar Cesium World Bathymetry:', e);
      }
    }
    this.scene.terrainProvider = new DemTerrainProvider(this.source, {
      maxLevel: CONFIG.terrainMaxLevel,
      size: CONFIG.terrainTileSize,
      floor,
    });
  }

  reloadTerrain() {
    const [kind, floor] = this._terrainKey.split('|');
    this._terrainKey = null;
    this.setTerrain(kind, floor === 'null' ? null : Number(floor));
  }

  // ------------------------------------------------------------------ mapa base + relevo
  // Mapa base: 'relief' (textura hipsométrica gerada no cliente), 'satellite' ou 'standard'.
  // Sobre Satélite/Padrão entra uma camada de ANÁLISE transparente (costa, inundação,
  // isolinhas, faixas, sombreamento), gerada pelo mesmo pipeline do relevo.
  setBaseMode(mode) {
    if (mode === this.baseMode) return;
    this.baseMode = mode;
    for (const key of ['satellite', 'standard']) {
      if (mode === key && !this._base[key]) {
        const cfg = CONFIG.baseMaps[key];
        const p = new C.UrlTemplateImageryProvider({ url: cfg.url, maximumLevel: cfg.maxLevel, credit: cfg.credit });
        this._base[key] = this.viewer.imageryLayers.addImageryProvider(p);
        Object.assign(this._base[key], cfg.adjust || {});
      }
      if (this._base[key]) this._base[key].show = mode === key;
    }
    this._reliefLayers.forEach((l) => { l.show = mode === 'relief'; });
    if (mode === 'relief' && !this._reliefLayers.length) this._addLayer('relief');
    this._syncAnalysis(true);
    this._reorder();
  }

  setStyle(style) {
    this.style = { ...style };
    clearTimeout(this._styleTimer);
    this._styleTimer = setTimeout(() => {
      if (this.baseMode === 'relief') this._addLayer('relief');
      this._syncAnalysis(false);
    }, 120);
  }

  refreshRelief() {
    if (this.baseMode === 'relief') this._addLayer('relief');
    this._syncAnalysis(false);
  }

  /** A camada de análise só existe quando há algo a mostrar sobre Satélite/Padrão. */
  _analysisNeeded() {
    const s = this.style;
    return this.baseMode !== 'relief' && !!(s.coast || s.seaLevel || s.contour || s.bandOn || s.overlayHillshade || s.waterMode === 'tint');
  }

  _syncAnalysis(modeChanged) {
    const need = this._analysisNeeded();
    if (!need) {
      this._analysisLayers.forEach((l) => { l.show = false; });
      return;
    }
    const key = JSON.stringify(this.style);
    if (!modeChanged && key === this._analysisKey && this._analysisLayers.length) return;
    if (modeChanged && key === this._analysisKey && this._analysisLayers.length) {
      this._analysisLayers.forEach((l) => { l.show = true; });
      return;
    }
    this._analysisKey = key;
    this._addLayer('analysis');
  }

  _addLayer(kind) {
    const layers = this.viewer.imageryLayers;
    const list = kind === 'relief' ? this._reliefLayers : this._analysisLayers;
    const style = kind === 'relief' ? this.style : { ...this.style, output: 'overlay' };
    const provider = new ReliefImageryProvider(this.source, this.pool, style, { maxLevel: CONFIG.imageryMaxLevel });
    const layer = new C.ImageryLayer(provider, {});
    const last = list[list.length - 1];
    layers.add(layer, last ? layers.indexOf(last) + 1 : layers.length);
    list.push(layer);
    this._reorder();
    // crossfade: a camada nova cobre a antiga conforme os tiles ficam prontos
    clearTimeout(this._fadeTimers[kind]);
    this._fadeTimers[kind] = setTimeout(() => {
      while (list.length > 1) layers.remove(list.shift(), true);
    }, 3000);
  }

  // ------------------------------------------------------------------ camadas extras
  setOverlay(id, features, credit) {
    const layers = this.viewer.imageryLayers;
    const old = this._overlayLayers.get(id);
    if (!features) {
      if (old) old.show = false;
      return;
    }
    if (old && old._features === features) { old.show = true; return; }
    const layer = new C.ImageryLayer(new VectorImageryProvider(features, { credit }), {});
    layer._features = features;
    layers.add(layer);
    if (old) layers.remove(old, true);
    this._overlayLayers.set(id, layer);
    this._reorder();
  }

  // Ordem (de baixo para cima): mapa base → relevo → análise → vetores (divisas, anotações…).
  _reorder() {
    const layers = this.viewer.imageryLayers;
    for (const l of this._reliefLayers) layers.raiseToTop(l);
    for (const l of this._analysisLayers) layers.raiseToTop(l);
    for (const l of this._overlayLayers.values()) layers.raiseToTop(l);
    if (this._nightLayer) layers.raiseToTop(this._nightLayer); // luzes cobrem o relevo só à noite
    for (const l of Object.values(this._base)) layers.lowerToBottom(l);
  }

  setAtmosphere(on) {
    this.scene.skyAtmosphere.show = on;
    this.scene.globe.showGroundAtmosphere = false;
  }

  /**
   * Dia/noite: ilumina o globo pela posição real do Sol (relógio = agora + offsetHoras) e mostra
   * as luzes das cidades no lado escuro. O relógio corre em tempo real, então o terminador anda.
   */
  setDayNight(on, offsetHours = 0) {
    const globe = this.scene.globe, clock = this.viewer.clock;
    globe.enableLighting = on;
    // sombreamento em qualquer distância (por padrão o Cesium desliga a luz ao aproximar)
    globe.lightingFadeOutDistance = on ? 1 : 6500000;
    globe.lightingFadeInDistance = on ? 2 : 9000000;
    globe.baseColor = C.Color.fromCssColorString(on ? '#000000' : '#140a38');
    if (on) {
      clock.currentTime = C.JulianDate.addSeconds(C.JulianDate.now(), offsetHours * 3600, new C.JulianDate());
      clock.multiplier = 1;
      clock.clockRange = C.ClockRange.UNBOUNDED;
      clock.shouldAnimate = true;
    }
    if (on && !this._nightLayer) {
      const cfg = CONFIG.nightLights;
      const layer = new C.ImageryLayer(new C.UrlTemplateImageryProvider({
        url: cfg.url, maximumLevel: cfg.maxLevel, credit: cfg.credit,
      }), {
        dayAlpha: 0,
        nightAlpha: 1,
        // o Cesium escurece o lado noturno para 30%; compensamos para as luzes manterem o brilho
        brightness: 1 / 0.3,
      });
      this.viewer.imageryLayers.add(layer);
      this._nightLayer = layer;
      this._reorder();
    }
    if (this._nightLayer) this._nightLayer.show = on;
    this.scene.requestRender();
  }

  setExaggeration(v) {
    this.scene.verticalExaggeration = Math.max(0.0001, v);
  }

  get exaggeration() { return this.scene.verticalExaggeration; }

  /** Lon/lat (graus) sob uma posição de tela, na superfície exagerada. */
  pickLonLat(windowPos) {
    const ray = this.camera.getPickRay(windowPos);
    if (!ray) return null;
    const cart = this.scene.globe.pick(ray, this.scene);
    if (!cart) return null;
    const c = C.Cartographic.fromCartesian(cart);
    return { lon: C.Math.toDegrees(c.longitude), lat: C.Math.toDegrees(c.latitude), height: c.height, cartesian: cart };
  }

  destroy() {
    this.viewer.destroy();
  }
}
