// Lugares pré-definidos (busca local instantânea, marcadores e tours).
// elev: elevação/profundidade real de referência (m). focus: altura REAL do ponto que a câmera
// orbita (o app multiplica pelo exagero). range: distância da câmera (m). pitch/heading em graus.

export const PLACES = [
  { id: 'san-andreas', name: 'Falha de San Andreas', aliases: 'san andreas fault california carrizo plain', lat: 35.18, lon: -119.78, elev: 700, focus: 600, range: 90000, heading: 320, pitch: -28, desc: 'Limite transformante entre as placas do Pacífico e Norte-Americana. A Carrizo Plain mostra o traço da falha e drenagens deslocadas.', cat: 'Falhas', poi: true },
  { id: 'san-andreas-overview', name: 'San Andreas — visão regional', aliases: 'california falha transformante', lat: 35.4, lon: -119.3, elev: 0, focus: 0, range: 900000, heading: 330, pitch: -40, desc: 'Todo o sistema de falhas da Califórnia, do Golfo da Califórnia ao Cabo Mendocino.', cat: 'Falhas' },
  { id: 'everest', name: 'Monte Everest', aliases: 'everest himalaia himalaya sagarmatha chomolungma nepal', lat: 27.9881, lon: 86.925, elev: 8849, focus: 6000, range: 60000, heading: 200, pitch: -22, desc: 'Ponto mais alto da Terra: 8.849 m acima do nível do mar.', cat: 'Montanhas', poi: true },
  { id: 'himalaya', name: 'Himalaias e Planalto Tibetano', aliases: 'himalaia himalaya tibete tibet', lat: 29.5, lon: 85.5, elev: 5000, focus: 4000, range: 1600000, heading: 180, pitch: -38, desc: 'Colisão Índia–Eurásia: o maior planalto e a cordilheira mais alta do planeta.', cat: 'Montanhas' },
  { id: 'andes', name: 'Andes Centrais (Altiplano)', aliases: 'andes altiplano bolivia peru chile cordilheira', lat: -18.5, lon: -69.0, elev: 4000, focus: 3500, range: 1300000, heading: 250, pitch: -32, desc: 'Cordilheira de subducção com o Altiplano a ~3.800 m e a Fossa Peru–Chile a oeste.', cat: 'Montanhas' },
  { id: 'aconcagua', name: 'Aconcágua', aliases: 'aconcagua argentina andes', lat: -32.6532, lon: -70.0109, elev: 6961, focus: 4500, range: 70000, heading: 90, pitch: -20, desc: 'Ponto mais alto das Américas (6.961 m).', cat: 'Montanhas', poi: true },
  { id: 'mariana', name: 'Fossa das Marianas (Challenger Deep)', aliases: 'mariana trench marianas challenger deep fossa', lat: 11.35, lon: 142.2, elev: -10935, focus: -6000, range: 450000, heading: 340, pitch: -35, desc: 'Ponto mais profundo dos oceanos: ~10.935 m abaixo do nível do mar.', cat: 'Oceano', poi: true },
  { id: 'mid-atlantic', name: 'Dorsal Mesoatlântica', aliases: 'mid-atlantic ridge dorsal meso atlantica cordilheira oceanica', lat: -2.0, lon: -18.0, elev: -2500, focus: -3500, range: 2600000, heading: 0, pitch: -45, desc: 'Limite divergente: a cordilheira submarina mais longa do mundo, com falhas transformantes perpendiculares.', cat: 'Oceano' },
  { id: 'iceland', name: 'Islândia', aliases: 'iceland islandia', lat: 64.9, lon: -18.6, elev: 1000, focus: 300, range: 700000, heading: 0, pitch: -40, desc: 'Onde a Dorsal Mesoatlântica emerge acima do nível do mar.', cat: 'Oceano' },
  { id: 'puerto-rico', name: 'Fossa de Porto Rico / Caribe', aliases: 'puerto rico trench caribe cayman', lat: 19.0, lon: -72.0, elev: -8376, focus: -4000, range: 1600000, heading: 350, pitch: -40, desc: 'O ponto mais profundo do Atlântico e a fossa de Cayman.', cat: 'Oceano' },
  { id: 'peru-chile', name: 'Fossa Peru–Chile', aliases: 'atacama trench peru chile fossa', lat: -23.0, lon: -71.8, elev: -8065, focus: -2000, range: 900000, heading: 90, pitch: -30, desc: 'Da fossa (−8 km) ao Llullaillaco (+6,7 km) em menos de 300 km.', cat: 'Oceano' },
  { id: 'tonga', name: 'Fossa de Tonga', aliases: 'tonga kermadec trench', lat: -22.0, lon: -174.5, elev: -10800, focus: -5000, range: 1100000, heading: 0, pitch: -38, desc: 'Segunda fossa mais profunda do mundo.', cat: 'Oceano' },
  { id: 'hawaii', name: 'Havaí (Mauna Kea)', aliases: 'hawaii havai mauna kea mauna loa', lat: 19.82, lon: -155.47, elev: 4207, focus: -2000, range: 400000, heading: 330, pitch: -30, desc: 'Da base no fundo do mar ao cume, o Mauna Kea tem ~10.200 m — mais alto que o Everest.', cat: 'Oceano', poi: true },
  { id: 'emperor', name: 'Cadeia de montes submarinos Havaí–Imperador', aliases: 'emperor seamounts montes submarinos', lat: 33.0, lon: 172.0, elev: -1000, focus: -5000, range: 3500000, heading: 0, pitch: -55, desc: 'Rastro do hotspot do Havaí sobre a placa do Pacífico.', cat: 'Oceano' },
  { id: 'grand-canyon', name: 'Grand Canyon', aliases: 'grand canyon arizona colorado', lat: 36.1, lon: -112.11, elev: 2100, focus: 1500, range: 45000, heading: 20, pitch: -25, desc: 'Cânion de ~1.800 m de profundidade escavado pelo Rio Colorado.', cat: 'Vales', poi: true },
  { id: 'dead-sea', name: 'Mar Morto', aliases: 'dead sea mar morto jordania israel', lat: 31.5, lon: 35.5, elev: -430, focus: -300, range: 90000, heading: 0, pitch: -30, desc: 'Ponto mais baixo em terra firme (~−430 m).', cat: 'Vales', poi: true },
  { id: 'east-african-rift', name: 'Rift da África Oriental', aliases: 'east african rift kilimanjaro vale do rift', lat: -3.0, lon: 36.5, elev: 1500, focus: 1500, range: 900000, heading: 0, pitch: -40, desc: 'Um continente se partindo: vales de rift, vulcões e o Kilimanjaro (5.895 m).', cat: 'Vales' },
  { id: 'alps', name: 'Alpes', aliases: 'alps alpes mont blanc matterhorn', lat: 46.2, lon: 8.3, elev: 4000, focus: 2000, range: 400000, heading: 180, pitch: -35, desc: 'Cordilheira formada pela colisão África–Europa.', cat: 'Montanhas' },
  { id: 'rockies', name: 'Montanhas Rochosas', aliases: 'rocky mountains rochosas colorado', lat: 39.5, lon: -106.5, elev: 4000, focus: 2500, range: 700000, heading: 270, pitch: -35, desc: 'Grande cordilheira da América do Norte.', cat: 'Montanhas' },
  { id: 'sao-paulo', name: 'São Paulo e Serra do Mar', aliases: 'sao paulo serra do mar santos cubatao', lat: -23.75, lon: -46.5, elev: 760, focus: 500, range: 90000, heading: 330, pitch: -28, desc: 'O Planalto Paulistano (~760 m) termina abruptamente na escarpa da Serra do Mar.', cat: 'Brasil', poi: true },
  { id: 'rio', name: 'Rio de Janeiro', aliases: 'rio de janeiro serra dos orgaos pao de acucar', lat: -22.9, lon: -43.3, elev: 1000, focus: 300, range: 120000, heading: 340, pitch: -30, desc: 'Maciços costeiros, baía de Guanabara e a Serra dos Órgãos.', cat: 'Brasil' },
  { id: 'brasil', name: 'Brasil', aliases: 'brasil brazil', lat: -14.0, lon: -52.0, elev: 500, focus: 0, range: 5500000, heading: 0, pitch: -60, desc: 'Escudos antigos, bacias sedimentares e a plataforma continental.', cat: 'Brasil' },
  { id: 'pico-neblina', name: 'Pico da Neblina', aliases: 'pico da neblina amazonas', lat: 0.805, lon: -66.006, elev: 2995, focus: 1200, range: 60000, heading: 0, pitch: -25, desc: 'Ponto mais alto do Brasil (2.995 m).', cat: 'Brasil', poi: true },
  { id: 'amazon', name: 'Bacia Amazônica', aliases: 'amazonia amazon amazonas', lat: -3.5, lon: -62.0, elev: 50, focus: 0, range: 2500000, heading: 0, pitch: -55, desc: 'Planície imensa e baixa — ótima para simular elevação do nível do mar.', cat: 'Brasil' },
  { id: 'antarctica', name: 'Antártica', aliases: 'antarctica antartida', lat: -80.0, lon: 30.0, elev: 3000, focus: 1000, range: 6000000, heading: 0, pitch: -70, desc: 'Manto de gelo com até ~4 km de espessura.', cat: 'Polos' },
  { id: 'greenland', name: 'Groenlândia', aliases: 'greenland groenlandia', lat: 72.0, lon: -40.0, elev: 3000, focus: 1000, range: 3500000, heading: 0, pitch: -60, desc: 'Segundo maior manto de gelo do planeta.', cat: 'Polos' },
];

// Regiões (retângulos lon/lat) para estatísticas e comparação.
export const REGIONS = [
  { id: 'himalaya', name: 'Himalaias + Tibete', rect: [73, 26, 98, 38] },
  { id: 'andes', name: 'Andes Centrais', rect: [-76, -28, -63, -10] },
  { id: 'alps', name: 'Alpes', rect: [5, 43.5, 16, 48] },
  { id: 'rockies', name: 'Montanhas Rochosas', rect: [-114, 35, -103, 45] },
  { id: 'brasil', name: 'Brasil (retângulo)', rect: [-74, -34, -34.8, 5.3] },
  { id: 'europa', name: 'Europa (retângulo)', rect: [-10, 36, 30, 60] },
  { id: 'africa-east', name: 'África Oriental', rect: [28, -12, 42, 12] },
  { id: 'california', name: 'Califórnia', rect: [-124.5, 32.5, -114, 42] },
  { id: 'atlantic-ridge', name: 'Atlântico Sul (dorsal)', rect: [-35, -35, 0, 0] },
  { id: 'pacific-west', name: 'Pacífico Oeste (fossas)', rect: [130, 0, 160, 30] },
  { id: 'australia', name: 'Austrália', rect: [113, -39, 154, -10] },
  { id: 'world', name: 'Planeta inteiro', rect: [-180, -85, 180, 85] },
];
