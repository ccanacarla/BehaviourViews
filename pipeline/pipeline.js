import { getSpeedSettings } from '../speedSettings.js';

import { readTrajectoryCSV } from './csvLoader.js';
import { preprocess } from './preprocessing.js';
import { symbolize } from './symbolic.js';
import { kmeans, transitionVectors, metrics } from './clustering.js';
import { projectPCA } from './projection.js';
import { projectTSNE } from './tsneProjection.js';

const tupleString = points =>
  `[${points.map(p => `(${p[0]}, ${p[1]})`).join(', ')}]`;

export async function processCSV(
  file,
  { clusters = 5, metricClusters = 5, k = 10, speedSettings = getSpeedSettings() } = {},
  progress = () => { }
) {
  // Validate parameters
  if (!Number.isInteger(k) || k < 1 || k > 1000) {
    throw new Error(
      'Sampling k must be an integer between 1 and 1000.'
    );
  }

  if (!Number.isInteger(clusters) || clusters < 1 || clusters > 100) {
    throw new Error(
      'Symbolic clusters must be an integer between 1 and 100.'
    );
  }

  if (
    !Number.isInteger(metricClusters) ||
    metricClusters < 1 ||
    metricClusters > 100
  ) {
    throw new Error(
      'Metric clusters must be an integer between 1 and 100.'
    );
  }

  // Read CSV
  const rows = await readTrajectoryCSV(file, progress);

  progress('Filtering and normalizing trajectories...');

  await new Promise(resolve => setTimeout(resolve, 0));

  // Preprocess trajectories
  const groups = preprocess(rows);

  if (!groups.length) {
    throw new Error(
      'No valid trajectories after filtering (minimum 100 frames, no gaps).'
    );
  }

  // Symbolize trajectories
  progress(`Symbolizing ${groups.length} trajectories (k=${k})...`);

  const symbolic = symbolize(groups, k, speedSettings);

  const valid = groups
    .map((g, i) => ({
      points: g,
      symbols: symbolic[i]
    }))
    .filter(d => d.symbols.length);

  if (valid.length < clusters) {
    throw new Error(
      `Only ${valid.length} sampled trajectories; reduce clusters or sampling k.`
    );
  }

  if (valid.length < metricClusters) {
    throw new Error(
      `Only ${valid.length} sampled trajectories; reduce metric clusters or sampling k.`
    );
  }

  // ============================================================
  // SYMBOLIC CLUSTERING
  // ============================================================

  progress('Computing symbolic clusters and t-SNE...');

  // Transition matrices transformed into feature vectors
  const vectors = transitionVectors(
    valid.map(d => d.symbols)
  );

  // Symbolic K-means
  const clusterIds = kmeans(vectors, clusters);

  // PCA coordinates
  const coordinates = projectPCA(vectors);

  // Symbolic t-SNE coordinates
  const tsneCoordinates = await projectTSNE(
    vectors,
    progress
  );

  // ============================================================
  // METRIC CLUSTERING
  // ============================================================

  progress('Computing metric clusters and t-SNE...');

  // Compute trajectory metrics
  const metricRows = valid.map(d =>
    metrics(d.symbols, d.symbols)
  );

  // Feature vectors:
  // 0 = Shannon entropy
  // 1 = Average dwell time
  // 2 = Path length
  const metricVectors = metricRows.map(d => [
    d.shannon_entropy,
    d.avg_dwell_time,
    d.path_length
  ]);

  // Calculate feature means
  const mean = [0, 1, 2].map(j =>
    d3.mean(metricVectors, v => v[j])
  );

  // Calculate feature standard deviations
  // Use 1 when the deviation is zero or undefined
  const std = [0, 1, 2].map(j =>
    d3.deviation(metricVectors, v => v[j]) || 1
  );

  // Normalize metric vectors (z-score normalization)
  const normalizedMetrics = metricVectors.map(v =>
    v.map((x, j) =>
      (x - mean[j]) / std[j]
    )
  );

  // Metric K-means
  const phys = kmeans(
    normalizedMetrics,
    metricClusters,
    300,
    42,
    10
  );

  // Metric t-SNE using the same projection implementation
  // as Symbolic t-SNE
  const metricTSNE = await projectTSNE(
    normalizedMetrics,
    progress
  );

  // ============================================================
  // BUILD OUTPUT DATA
  // ============================================================

  const data = valid.map((item, i) => {
    const points = item.points;
    const first = points[0];
    const last = points[points.length - 1];

    const seq = item.symbols.map(p => p.symbol);

    const xy = item.symbols.map(p => [
      p.x,
      p.y
    ]);

    const coordinatesOriginal = xy;

    return {
      trajectory_id: first.trajectory_id,
      user_id: first.user_id,

      frame_inicial: first.timestamp,
      frame_final: last.timestamp,

      [`symbolic_movement_${k}`]: JSON.stringify(seq),
      movement_list: JSON.stringify(seq),

      // Cluster IDs
      cluster: clusterIds[i],
      phys_cluster: phys[i],

      // Trajectory metrics
      ...metricRows[i],

      // PCA projection
      pca_1: coordinates[i][0],
      pca_2: coordinates[i][1],

      // Symbolic t-SNE
      tsne_1: tsneCoordinates[i][0],
      tsne_2: tsneCoordinates[i][1],

      // Metric t-SNE
      tsne_phis_cluster_1: metricTSNE[i][0],
      tsne_phis_cluster_2: metricTSNE[i][1],

      // Trajectory coordinates
      trajectory_xy: tupleString(
        coordinatesOriginal
      ),

      trajectory_xy_translate: tupleString(
        item.symbols.map(p => [
          p.x_translate,
          p.y_translate
        ])
      ),

      trajectory_xy_rotated: tupleString(
        item.symbols.map(p => [
          p.x_rotated,
          p.y_rotated
        ])
      ),

      trajectory_label: `traj_${i + 1}`
    };
  });

  progress(`${data.length} trajectories processed.`);

  return {
    data,
    rows,
    valid,
    k,
    clusters,
    metricClusters
  };
}
