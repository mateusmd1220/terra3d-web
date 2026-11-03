// Configuração central do aplicativo.

// iPhone/iPad (ou qualquer tela de toque): a WebView do iOS tem limite de memória bem menor que
// um navegador de PC, então os caches e o paralelismo são reduzidos.
export const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && matchMedia('(pointer: coarse)').matches);

export const CONFIG = {
  // AWS Terrain Tiles (Mapzen "Terrarium"): terra + batimetria, global, sem chave, CORS liberado.
  // elevação (m) = R*256 + G + B/256 - 32768
  // O bucket só fala HTTP/1.1 (6 conexões por host no navegador); distribuímos os tiles entre
  // hostnames equivalentes do mesmo bucket para multiplicar o paralelismo.
  terrariumUrls: [
    'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
    'https://elevation-tiles-prod.s3.us-east-1.amazonaws.com/terrarium/{z}/{x}/{y}.png',
    'https://elevation-tiles-prod.s3.dualstack.us-east-1.amazonaws.com/terrarium/{z}/{x}/{y}.png',
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  ],
  terrariumMaxZoom: 15,

  // Quadtree geográfica do Cesium (2 tiles no nível 0). O nível L usa tiles Terrarium z = L+1,
  // de modo que terreno e textura compartilham o mesmo cache de tiles.
  terrainMaxLevel: 14,
  terrainTileSize: 65,
  imageryMaxLevel: 14,

  elevationCacheTiles: IS_MOBILE ? 250 : 700, // 256 KB por tile (Float32 256x256)
  fetchConcurrency: IS_MOBILE ? 12 : 24,
  globeTileCacheSize: IS_MOBILE ? 150 : 400,
  msaaSamples: IS_MOBILE ? 2 : 4,

  // Mapas base alternativos (sem chave). O Google não permite usar os próprios tiles fora da
  // API paga; estes são os equivalentes abertos mais próximos. "standard" é SEM rótulos para que
  // os nomes venham da camada "Lugares" (controlável).
  baseMaps: {
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      maxLevel: 19,
      credit: 'Imagens: Esri World Imagery (Esri, Maxar, Earthstar Geographics)',
    },
    standard: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
      maxLevel: 13,
      credit: 'Mapa: Esri World Ocean Base (Esri, GEBCO, NOAA, Garmin, HERE)',
      // realce de cor para aproximar o visual do Google Maps (vegetação verde, água turquesa)
      adjust: { saturation: 2.6, contrast: 1.08, brightness: 1.0, gamma: 1.15 },
    },
  },
  platesUrl: 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json',

  // Cesium World Terrain + Bathymetry (opcional, requer CESIUM_ION_TOKEN no .env)
  ionBathymetryAssetId: 2426648,

  // Luzes noturnas (NASA GIBS, VIIRS Black Marble 2016), sem chave, CORS liberado.
  nightLights: {
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
    maxLevel: 8,
    credit: 'Luzes noturnas: NASA Earth Observatory / GIBS (VIIRS Black Marble 2016)',
  },
  geotiffModule: '../../vendor/geotiff/geotiff.js', // gerado por scripts/build-web.mjs
};

export const EXAG_PRESETS = [1, 2, 5, 10, 25, 50, 100];
export const EXAG_MIN = 1;
export const EXAG_MAX = 200;

export const SEA_SCENARIOS = [
  { label: 'Hoje', value: 0, info: 'Nível do mar atual.' },
  { label: 'Era glacial', value: -120, info: 'Último Máximo Glacial (~20 mil anos): Beríngia, Sundalândia e Doggerland emersas.' },
  { label: '−50 m', value: -50, info: 'Plataformas continentais rasas começam a emergir.' },
  { label: '+10 m', value: 10, info: 'Grandes deltas e planícies costeiras submersos.' },
  { label: '+70 m', value: 70, info: 'Aproximadamente o derretimento de todo o gelo terrestre.' },
  { label: '+200 m', value: 200, info: 'Amazônia, Bacia do Mississippi e planícies europeias inundadas.' },
  { label: 'Só > 500 m', value: 500, info: 'Somente terras acima de 500 m permanecem.' },
  { label: '+1.000 m', value: 1000, info: 'Continentes reduzidos a planaltos e cordilheiras.' },
  { label: '+3.000 m', value: 3000, info: 'Restam apenas as grandes cordilheiras e planaltos (Tibete, Andes, Antártica).' },
];
