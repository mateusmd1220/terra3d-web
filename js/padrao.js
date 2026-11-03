// COMO O TERRA 3D ABRE (app do iPhone e versão web)
// Mude os valores abaixo e salve. Para ver no PC: "npm run serve" e abra http://localhost:8000.
//
// Dica para achar a câmera: no PC, navegue até a vista que quer e olhe o endereço do navegador.
// Ele termina em  #cam=LON,LAT,ALTURA_EM_METROS,RUMO,INCLINACAO&x=EXAGERO...
// Copie esses números para "camera" (altura: divida por 1000 para ter km).

export const PADRAO = {
  // true = reabre onde a pessoa parou; false = sempre abre como abaixo
  lembrarUltimaVista: false,
  // painel 🎚️ (exagero, nível do mar, horário) já aberto ao iniciar
  ajustesRapidosAbertos: false,

  // onde a câmera começa: longitude, latitude, altura em km,
  // rumo (0 = norte para cima) e inclinação (-90 = olhando reto para baixo)
  camera: { lon: -50.8434, lat: -19.4496, alturaKm: 9074.1, rumo: 0, inclinacao: -84.8 },

  estado: {
    baseMode: 'relief',                                        // mapa de fundo: 'relief' (relevo colorido) | 'satellite' (satélite) | 'standard' (ruas)
    palette: 'video',                                          // cores do relevo: 'video' | 'hypso' | 'turbo' | 'bathy' | 'gray' | 'bands'
    exaggeration: 50,                                          // exagero vertical do relevo (1 = real, até 200)
    seaLevel: 0,                                               // nível do mar simulado, em metros (0 = atual)
    waterMode: 'tint',                                         // água: 'none' (planeta sem água) | 'tint' (água translúcida)
    flatSea: false,                                            // superfície da água plana em 3D
    boundaries: { countries: true, states: true, municipalities: false }, // divisas: países, estados e municípios
    places: true,                                              // nomes de lugares (cidades, países)
    pois: false,                                               // pontos de interesse (montanhas, fossas etc.)
    overlays: { sanAndreas: true, plates: false },             // camadas extras: falha de San Andreas e placas tectônicas
    atmosphere: false,                                         // brilho azul da atmosfera
    dayNight: false,                                           // dia e noite com luzes das cidades
    dayNightOffset: 0,                                         // horas a somar ao horário atual no dia/noite (-12 a 12)
    overlayHillshade: true,                                    // sombreamento do relevo sobre satélite/ruas
    hillshade: 0.85,                                           // intensidade do sombreamento (0 a 1)
    zFactor: 1.5,                                              // realce do sombreamento (z-factor)
    sunAzimuth: 315,                                           // direção da luz, em graus (315 = noroeste)
    sunAltitude: 40,                                           // altura da luz, em graus
    multi: true,                                               // luz de várias direções
    followExag: false,                                         // sombreamento acompanha o exagero
    contour: 0,                                                // curvas de nível, em metros (0 = desligadas)
    coast: false,                                              // linha de costa
    bandOn: false,                                             // destacar faixa de altitude
    bandMin: 3000,                                             // faixa: altitude mínima (m)
    bandMax: 9000,                                             // faixa: altitude máxima (m)
  },
};
