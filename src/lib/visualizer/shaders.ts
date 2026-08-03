import { REFERENCE_GEOMETRY_INTENSITY } from "./types";

export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
precision highp float;

out vec2 vUv;

const vec2 POSITIONS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);

void main() {
  vec2 position = POSITIONS[gl_VertexID];
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const SPECTRAL_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform vec2 uResolution;
uniform int uScene;
uniform float uBands[24];
uniform float uChroma[12];
uniform float uWave[256];
uniform vec2 uChromaMeta;
uniform vec4 uTemporal;
uniform vec4 uSpectral;
uniform vec4 uRhythm;
uniform float uRhythmEvidence;
uniform sampler2D uSimilarity;
uniform vec4 uSimilarityMeta;
uniform vec4 uSettings;
uniform float uGain;
uniform float uHighlightCompression;
uniform vec3 uBackground;
uniform vec3 uSignal;
uniform vec3 uReference;

#define PI 3.14159265359
#define TAU 6.28318530718

float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

float lineAt(float coordinate, float target, float width) {
  return 1.0 - smoothstep(width, width * 2.25, abs(coordinate - target));
}

float sampleBand(float position) {
  float scaled = saturate(position) * 23.0;
  int lower = int(floor(scaled));
  int upper = min(lower + 1, 23);
  return mix(uBands[lower], uBands[upper], fract(scaled));
}

float sampleChroma(float position) {
  int pitchClass = min(11, int(floor(fract(position) * 12.0)));
  return uChroma[pitchClass];
}

float sampleWave(float position) {
  float scaled = saturate(position) * 255.0;
  int lower = int(floor(scaled));
  int upper = min(lower + 1, 255);
  return mix(uWave[lower], uWave[upper], fract(scaled));
}

float sampleSimilarity(vec2 position) {
  return texture(uSimilarity, clamp(position, vec2(0.0), vec2(1.0))).r;
}

vec2 stagePoint() {
  vec2 point = vUv - 0.5;
  point.x *= uResolution.x / max(1.0, uResolution.y);
  return point;
}

float fixedReferenceGeometry(vec2 point) {
  if (uScene == 0) {
    return lineAt(vUv.y, 0.02, 0.0018);
  }
  if (uScene == 1) {
    return lineAt(length(point), 0.055, 0.0022);
  }
  if (uScene == 2) {
    return lineAt(vUv.y, 0.5, 0.0018);
  }
  if (uScene == 3) {
    return lineAt(length(point), 0.59, 0.003);
  }

  vec2 matrixPosition = vec2(vUv.x, 1.0 - vUv.y);
  float countFraction = saturate(uSimilarityMeta.x);
  float populated = step(matrixPosition.x, countFraction)
    * step(matrixPosition.y, countFraction);
  return lineAt(matrixPosition.y, matrixPosition.x, 0.003) * populated;
}

// scene:field:start
vec3 renderField() {
  float total = 0.0;
  for (int index = 0; index < 24; index++) {
    total += saturate(uBands[index] * uGain);
  }
  float evidence = sqrt(saturate(total * 1.8));
  float band = sqrt(saturate(sampleBand(vUv.x) * uGain));
  float height = band * 0.82;
  float localY = saturate(vUv.y / 0.88);
  float fill = (1.0 - smoothstep(height, height + 0.012, localY)) * evidence;
  float curve = lineAt(localY, height, 0.005 + uSettings.w * 0.004) * evidence;
  float separator = 0.86 + 0.14 * smoothstep(0.06, 0.13, fract(vUv.x * 24.0));

  float centroidMarker = lineAt(vUv.x, uSpectral.x, 0.0032) * evidence;
  float rolloff = lineAt(vUv.x, uSpectral.y, 0.0016) * evidence;
  float highRegion = smoothstep(uSpectral.w, 1.0, vUv.x) * uSpectral.z * fill;

  vec3 color = uSignal * fill * separator * (0.34 + band * 0.9);
  color += uSignal * curve * 0.86;
  color += uSignal * centroidMarker * 0.72;
  color += uSignal * rolloff * 0.64;
  color += uSignal * highRegion * 0.28;
  return color;
}
// scene:field:end

// scene:orbit:start
vec3 renderOrbit(vec2 point) {
  float radius = length(point);
  float angle = atan(point.y, point.x);
  // Fixed clockwise pitch-class order with C at twelve o'clock.
  float pitchPosition = fract(0.25 - angle / TAU);
  float chroma = sqrt(saturate(sampleChroma(pitchPosition) * uGain));
  float concentration = saturate(uChromaMeta.x);
  float dominantClass = clamp(uChromaMeta.y, -1.0, 11.0);
  float sector = floor(pitchPosition * 12.0);
  float sectorEdge = abs(fract(pitchPosition * 12.0) - 0.5);
  float angularMask = 1.0 - smoothstep(0.44, 0.5, sectorEdge);
  float targetRadius = 0.09 + chroma * 0.38;
  float body = (1.0 - smoothstep(targetRadius, targetRadius + 0.008, radius))
    * smoothstep(0.065, 0.085, radius)
    * angularMask;
  float outline = lineAt(radius, targetRadius, 0.005) * angularMask * step(0.002, chroma);
  float dominant = 1.0 - step(0.5, abs(sector - dominantClass));
  dominant *= step(0.02, concentration) * outline;
  float concentrationRing = lineAt(radius, 0.055, 0.004) * concentration;

  vec3 color = uSignal * body * (0.24 + chroma * 0.95);
  color += uSignal * outline * 0.7;
  color += uSignal * dominant * (0.28 + concentration * 0.52);
  color += uSignal * concentrationRing * 0.72;
  return color;
}
// scene:orbit:end

// scene:trace:start
vec3 renderTrace() {
  float rms = saturate(uTemporal.x * uGain);
  float peak = saturate(uTemporal.y * uGain);
  float crest = saturate((uTemporal.z - 1.0) / 5.0);
  float zeroCrossings = saturate(uTemporal.w);
  float waveform = clamp(sampleWave(vUv.x) * uGain, -1.0, 1.0);
  float traceY = 0.5 + waveform * 0.38;
  float trace = lineAt(vUv.y, traceY, 0.0035 + uSettings.w * 0.0025);

  float rmsUpper = lineAt(vUv.y, 0.5 + rms * 0.38, 0.0018);
  float rmsLower = lineAt(vUv.y, 0.5 - rms * 0.38, 0.0018);
  float peakUpper = lineAt(vUv.y, 0.5 + peak * 0.38, 0.0012);
  float peakLower = lineAt(vUv.y, 0.5 - peak * 0.38, 0.0012);
  float metricRegion = smoothstep(0.035, 0.025, vUv.x);
  float crestGauge = metricRegion * step(vUv.y, crest);
  float crossingGauge = step(vUv.y, 0.018) * step(vUv.x, zeroCrossings);

  vec3 color = uSignal * trace * (0.66 + zeroCrossings * 0.22);
  color += uSignal * (rmsUpper + rmsLower) * 0.42;
  color += uSignal * (peakUpper + peakLower) * 0.3;
  color += uSignal * crestGauge * 0.42;
  color += uSignal * crossingGauge * 0.58;
  return color;
}
// scene:trace:end

// scene:lattice:start
vec3 renderLattice(vec2 point) {
  float onset = saturate(uRhythm.x * uGain);
  float bpm = saturate(uRhythm.y);
  float evidenceStrength = saturate(uRhythm.z);
  float phase = saturate(uRhythm.w);
  float evidence = saturate(uRhythmEvidence);

  float gridDensity = mix(10.0, 24.0, bpm);
  vec2 grid = fract(point * gridDensity + 0.5) - 0.5;
  float cell = 1.0 - smoothstep(0.34, 0.48, max(abs(grid.x), abs(grid.y)));
  float radius = length(point);
  float phaseRadius = 0.06 + phase * 0.52;
  float phaseRing = lineAt(radius, phaseRadius, 0.012 + (1.0 - evidenceStrength) * 0.008)
    * evidenceStrength
    * cell;
  float core = (1.0 - smoothstep(0.025, 0.055 + onset * 0.12, radius)) * onset;
  float angle = fract(atan(point.y, point.x) / TAU + 0.5);
  float evidenceArc = lineAt(radius, 0.59, 0.008)
    * step(angle, evidence)
    * evidence;
  float evidenceGrid = cell
    * evidenceStrength
    * smoothstep(0.62, 0.08, abs(radius - phaseRadius));

  vec3 color = uSignal * evidenceGrid * 0.16;
  color += uSignal * phaseRing * (0.32 + evidenceStrength * 0.72);
  color += uSignal * core * (0.55 + onset * 0.8);
  color += uSignal * evidenceArc * 0.68;
  return color;
}
// scene:lattice:end

// scene:contour:start
vec3 renderContour() {
  vec2 matrixPosition = vec2(vUv.x, 1.0 - vUv.y);
  float countFraction = saturate(uSimilarityMeta.x);
  float recurrence = saturate(uSimilarityMeta.y);
  float populated = step(matrixPosition.x, countFraction)
    * step(matrixPosition.y, countFraction);
  float similarity = saturate(sampleSimilarity(matrixPosition)) * populated;
  float levels = mix(6.0, 18.0, uSettings.w);
  float contourDistance = abs(fract(similarity * levels) - 0.5);
  float contour = (1.0 - smoothstep(0.37, 0.49, contourDistance)) * populated;
  float frontier = (
    lineAt(matrixPosition.x, countFraction, 0.0025)
    + lineAt(matrixPosition.y, countFraction, 0.0025)
  ) * step(0.01, countFraction);

  vec3 color = uSignal * similarity * (0.25 + contour * 0.78);
  color += uSignal * contour * similarity * 0.28;
  color += uSignal * frontier * 0.34;
  return color;
}
// scene:contour:end

void main() {
  vec2 point = stagePoint();
  vec3 evidence;
  if (uScene == 1) {
    evidence = renderOrbit(point);
  } else if (uScene == 2) {
    evidence = renderTrace();
  } else if (uScene == 3) {
    evidence = renderLattice(point);
  } else if (uScene == 4) {
    evidence = renderContour();
  } else {
    evidence = renderField();
  }

  float fixedReference = fixedReferenceGeometry(point);
  float vignette = smoothstep(1.15, 0.24, length(point * vec2(0.72, 0.92)));
  float presentation = mix(0.72, 1.34, uSettings.x) * mix(0.88, 1.18, uSettings.z);
  vec3 color = evidence * presentation * (0.76 + vignette * 0.24);
  float compression = mix(0.42, 0.62, uHighlightCompression);
  float pigmentIntensity = max(max(color.r, color.g), color.b);
  if (pigmentIntensity > 0.0) {
    float compressedIntensity = pigmentIntensity / (1.0 + pigmentIntensity * compression);
    compressedIntensity = min(1.0, pow(max(compressedIntensity, 0.0), 0.92));
    color *= compressedIntensity / pigmentIntensity;
  }
  color = mix(
    color,
    uReference,
    saturate(fixedReference * ${REFERENCE_GEOMETRY_INTENSITY.toFixed(2)})
  );
  color += uBackground;
  outColor = vec4(color, 1.0);
}
`;
