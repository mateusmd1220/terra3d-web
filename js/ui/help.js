export const HELP_HTML = `
<h2>Controles &amp; atalhos</h2>
<table>
<tr><td><b>Arrastar (botão esquerdo)</b></td><td>Girar o globo / deslocar</td></tr>
<tr><td><b>Roda do mouse</b></td><td>Aproximar / afastar (em direção ao cursor)</td></tr>
<tr><td><b>Arrastar com botão direito</b>, botão do meio ou <kbd>Ctrl</kbd>+arrastar</td><td>Inclinar e girar a câmera em torno do ponto</td></tr>
<tr><td><kbd>Shift</kbd> + arrastar com botão direito</td><td>Zoom contínuo</td></tr>
<tr><td><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></td><td>Voar para frente / esquerda / trás / direita (velocidade proporcional à altitude)</td></tr>
<tr><td><kbd>Q</kbd> / <kbd>E</kbd></td><td>Descer / subir</td></tr>
<tr><td><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd></td><td>Olhar ao redor (virar a cabeça)</td></tr>
<tr><td><kbd>Shift</kbd> (segurando)</td><td>Voo 4× mais rápido</td></tr>
<tr><td><kbd>[</kbd> / <kbd>]</kbd></td><td>Diminuir / aumentar o exagero vertical (1, 2, 5, 10, 25, 50, 100, 200×)</td></tr>
<tr><td><kbd>G</kbd></td><td>Visão global</td></tr>
<tr><td><kbd>T</kbd></td><td>Olhar de cima (topo)</td></tr>
<tr><td><kbd>O</kbd></td><td>Vista oblíqua (quase horizonte)</td></tr>
<tr><td><kbd>PgUp</kbd> / <kbd>PgDn</kbd></td><td>Inclinar mais / menos</td></tr>
<tr><td><kbd>N</kbd></td><td>Norte para cima</td></tr>
<tr><td><kbd>R</kbd></td><td>Orbitar o ponto central (perto) ou girar o planeta (longe)</td></tr>
<tr><td><kbd>P</kbd></td><td>Perfil topográfico</td></tr>
<tr><td><kbd>/</kbd></td><td>Buscar lugar</td></tr>
<tr><td><kbd>H</kbd></td><td>Mostrar / ocultar painel</td></tr>
<tr><td><kbd>Home</kbd></td><td>Vista inicial</td></tr>
</table>
<p>Dica para reproduzir o vídeo: comece na visão global, aproxime uma cordilheira, incline com o botão direito
até ver o horizonte, e então aumente o exagero de 1× para 50× (tecla <kbd>]</kbd>). Afaste com <kbd>G</kbd> para ver o planeta inteiro exagerado.</p>
<p>Clique nos marcadores (Everest, Marianas…) para voar até eles. Digite coordenadas na busca como <code>-23.55, -46.63</code>.</p>`;

export const HELP_TOUCH_HTML = `
<h2>Controles</h2>
<table>
<tr><td><b>Arrastar com um dedo</b></td><td>Girar o globo / deslocar</td></tr>
<tr><td><b>Pinça</b></td><td>Aproximar / afastar</td></tr>
<tr><td><b>Dois dedos para cima / baixo</b></td><td>Inclinar a câmera (ver o horizonte)</td></tr>
<tr><td><b>Dois dedos girando</b></td><td>Girar a vista</td></tr>
<tr><td><b>Tocar no globo</b></td><td>Mostrar elevação, profundidade e coordenadas do ponto (toque de novo para esconder)</td></tr>
<tr><td><b>☰</b></td><td>Abrir / fechar os controles (exagero, nível do mar, camadas, ferramentas)</td></tr>
<tr><td><b>Botões à direita</b></td><td>🌍 visão global · ⤓ de cima · ◢ oblíqua · ⤴⤵ inclinar · N norte · ＋－ zoom · ⟳ orbitar · ⌂ inicial</td></tr>
</table>
<p>Para o efeito do vídeo: aproxime uma cordilheira, incline com dois dedos até ver o horizonte e aumente o exagero vertical
no painel ☰ (ou nos botões 1×…100×).</p>
<p>No perfil topográfico, toque nos pontos A, B… e depois em “Concluir”. Na busca, coordenadas como <code>-23.55, -46.63</code> também funcionam.</p>`;

export const ABOUT_HTML = `
<h2>Fontes de dados</h2>
<table>
<tr><td><b>AWS Terrain Tiles (Mapzen Terrarium)</b></td><td>Fonte base global de terra + batimetria, em streaming (tiles XYZ até z15).
Combina SRTM, GMTED2010, ETOPO1, NED/3DEP (EUA), ArcticDEM, Canadian DEM, LINZ, EU-DEM, GEBCO e batimetria costeira NOAA.
Resolução típica: ~30 m em terra, ~1–2 km no oceano profundo. Sem chave. Atribuições: veja
<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank">tilezen/joerd</a>.</td></tr>
<tr><td><b>OpenTopography</b> (opcional)</td><td>DEMs de alta resolução sob demanda para a região visível: COP30, NASADEM, SRTM GL1/GL3, ALOS AW3D30,
SRTM15+ e GEBCO. Requer chave gratuita (embutida no build do app).</td></tr>
<tr><td><b>Cesium World Terrain + Bathymetry</b> (opcional)</td><td>Terreno quantizado global com batimetria GEBCO, via Cesium ion (token).</td></tr>
<tr><td><b>Esri World Imagery</b></td><td>Imagens de satélite (opcional) — Esri, Maxar, Earthstar Geographics.</td></tr>
<tr><td><b>PB2002</b></td><td>Limites de placas tectônicas — Bird (2003), via github.com/fraxen/tectonicplates.</td></tr>
<tr><td><b>Nominatim / OpenStreetMap</b></td><td>Busca de lugares (© colaboradores do OpenStreetMap, ODbL).</td></tr>
</table>
<p>As alturas são relativas ao nível médio do mar (geoide EGM96, aproximadamente) e usadas diretamente como altura elipsoidal;
diferenças de até ±100 m entre geoide e elipsoide são desprezíveis para a visualização.</p>
<p>O traço da Falha de San Andreas é uma simplificação ilustrativa.</p>`;
