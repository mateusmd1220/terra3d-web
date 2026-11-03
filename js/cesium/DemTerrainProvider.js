// TerrainProvider do Cesium alimentado pela ElevationSource (Terrarium + patches HD).
// Quadtree geográfica; cada tile é uma malha heightmap NxN com elevações REAIS.
// O exagero vertical é aplicado pelo Cesium na GPU (Scene.verticalExaggeration), então
// alterar o exagero NÃO recarrega o terreno.

const { GeographicTilingScheme, TerrainProvider, HeightmapTerrainData, Credit, Event, Math: CMath } = Cesium;

export class DemTerrainProvider {
  /**
   * @param {import('../data/ElevationSource.js').ElevationSource} source
   * @param {{maxLevel?:number, size?:number, floor?:number|null}} opts
   *   floor: se definido, elevações abaixo dele são achatadas (superfície de água plana em 3D).
   */
  constructor(source, { maxLevel = 14, size = 65, floor = null } = {}) {
    this._source = source;
    this._size = size;
    this._maxLevel = maxLevel;
    this._floor = floor;
    this._tilingScheme = new GeographicTilingScheme();
    this._errorEvent = new Event();
    this._credit = new Credit('Elevação: AWS Terrain Tiles / Mapzen (SRTM, GMTED2010, ETOPO1, NED, GEBCO…)');
    this._levelZeroError = TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
      this._tilingScheme.ellipsoid, size, this._tilingScheme.getNumberOfXTilesAtLevel(0));
    this._pending = 0;
  }

  get errorEvent() { return this._errorEvent; }
  get credit() { return this._credit; }
  get tilingScheme() { return this._tilingScheme; }
  get hasWaterMask() { return false; }
  get hasVertexNormals() { return false; }
  get availability() { return undefined; }
  get ready() { return true; }

  requestTileGeometry(x, y, level) {
    if (this._pending >= 48) return undefined; // Cesium tentará de novo no próximo frame
    const r = this._tilingScheme.tileXYToRectangle(x, y, level);
    const w = CMath.toDegrees(r.west), e = CMath.toDegrees(r.east);
    const s = CMath.toDegrees(r.south), n = CMath.toDegrees(r.north);
    const N = this._size;
    this._pending++;
    return this._source
      .sampleGrid({ lon0: w, lat0: n, dLon: (e - w) / (N - 1), dLat: (n - s) / (N - 1), cols: N, rows: N, z: level + 1 })
      .then((buf) => {
        const f = this._floor;
        if (f !== null && f !== undefined) for (let i = 0; i < buf.length; i++) if (buf[i] < f) buf[i] = f;
        return new HeightmapTerrainData({
          buffer: buf,
          width: N,
          height: N,
          childTileMask: level < this._maxLevel ? 15 : 0,
        });
      })
      .finally(() => { this._pending--; });
  }

  getLevelMaximumGeometricError(level) { return this._levelZeroError / (1 << level); }
  getTileDataAvailable(x, y, level) { return level <= this._maxLevel; }
  loadTileDataAvailability() { return undefined; }
}
