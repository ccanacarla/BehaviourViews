// visualization/config.js

export const VISUALIZATION_CONFIG = {
  // Common constants for glyphs and cell rendering
  cellSize: 12,
  cellPadding: 1,
  baseGlyphColor: "#083bbc", // Main color for glyphs (e.g., triangles, circles)
  speedOpacity: { // Mapping of speed levels to opacity for glyphs
    Muito_Lento: 0,
    Lento: 0.35,
    Medio: 0.65,
    Rapido: 0.85,
    Muito_Rapido: 1.0,
  },
  cellBackgroundColor: "#f3f1f1ff", // Light gray background for individual cells/regions
  cellBorderColor: "#ffffff",     // White border for individual cells/regions
  cellBorderWidth: 1,

  // Configuration specific to behaviourrug.js
  behaviourRug: {
    marginLeft: 140, // Left margin for the rug plot
    marginTop: 10,   // Top margin for the rug plot
    legendWidth: 200, // Width reserved for the legend
    highlightColor: "#ffeb3b", // Color for trajectory selection highlight
    highlightOpacity: 0.3,     // Opacity for trajectory selection highlight
    svgBorderColor: "#ccc",    // Border color for the main SVG container
  },

  // Configuration specific to frenquencyGlyph.js
  frenquencyGlyph: {
    glyphSize: 80,          // Overall size of the aggregate glyph square
    glyphLevels: 5,          // Number of speed levels (including Parado)
    gridLineColor: "#fafafaff",   // Color for internal grid lines (diagonals, concentric squares)
    gridLineWidth: 0.5,      // Width for internal grid lines
    plotContainerMargin: "10px", // Margin around each individual trajectory plot container
    plotContainerPadding: "10px", // Padding inside each individual trajectory plot container
    plotContainerBackground: "#fff", // Background color for each individual trajectory plot container
    headerFontSize: "12px",  // Font size for trajectory header
    headerMarginBottom: "5px", // Margin below trajectory header
  },
};

export const CLUSTER_COLORS = [
    "#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854",
    "#ffd92f", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ab"
];

// String literal mappings for speeds and directions, used in parsing logic
export const SPEED_STRINGS = {
  MUITO_LENTO: "Muito_Lento",
  LENTO: "Lento",
  MEDIO: "Medio",
  RAPIDO: "Rapido",
  MUITO_RAPIDO: "Muito_Rapido", // Alternative spelling
};

export const DIRECTION_STRINGS = {
  NORTE: "Norte",
  LESTE: "Leste",
  SUL: "Sul",
  OESTE: "Oeste",
  N: "N", // Abbreviation
  E: "E", // Abbreviation
  S: "S", // Abbreviation
  W: "W", // Abbreviation
};